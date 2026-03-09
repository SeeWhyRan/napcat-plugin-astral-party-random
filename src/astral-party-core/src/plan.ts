import type { GenerateConfig, RandomizedFilterConfig } from "./types";

export type Packed = {
  data: string[];
  idx: number;
};

export function createPacked(from?: string): Packed {
  return {
    data: from ? from.split("|") : [],
    idx: 0,
  };
}

export function packedAdd(p: Packed, value: string): void {
  p.data.push(value);
}

export function packedPick(p: Packed): string {
  return p.data[p.idx++]!;
}

export function packedToString(p: Packed): string {
  return p.data.join("|");
}

export type PlanFilterKind = "tags" | "color" | "chars";

export type SerializedPlanFilter =
  | { kind: "tags"; config: RandomizedFilterConfig<string> }
  | { kind: "color"; config: RandomizedFilterConfig<number> }
  | { kind: "chars"; config: RandomizedFilterConfig<string> };

export type CharPlan = {
  filters: SerializedPlanFilter[];
};

export type Plan = {
  map: string;
  difficulty: string;
  groups: CharPlan[];
};

function randomizeAllFilters(group: GenerateConfig["globalConfig"]): SerializedPlanFilter[] {
  const filters: SerializedPlanFilter[] = [];
  filters.push({ kind: "color", config: randomize(group.colorFilter) });
  for (const f of group.tagFilters) filters.push({ kind: "tags", config: randomize(f) });
  for (const f of group.charFilters) filters.push({ kind: "chars", config: randomize(f) });
  return filters;
}

function randomFromList<T>(list: T[], count: number): T[] {
  // 与网站一致：基于 sort(Math.random-0.5)
  return [...list].sort(() => Math.random() - 0.5).slice(0, count);
}

function randomFromListWithBoolFilter<T extends string>(list: T[], filter: Record<T, boolean>): T {
  const eligible = list.filter((x) => !!filter[x]);
  if (eligible.length === 0) {
    throw new Error("No eligible items after applying boolean filter");
  }
  return eligible.sort(() => Math.random() - 0.5)[0]!;
}

function randomize<T>(group: { whitelist: boolean; values: T[]; select: number }): RandomizedFilterConfig<T> {
  if (group.select > 0) {
    return {
      whitelist: group.whitelist,
      picked: randomFromList(group.values, group.select),
    };
  }
  return {
    whitelist: false,
    picked: [],
  };
}

function buildGroupPlan(
  group: GenerateConfig["globalConfig"],
  globalFilters: SerializedPlanFilter[] | null,
  isSingle: boolean,
  globalConfig: GenerateConfig["globalConfig"]
): CharPlan {
  const filters: SerializedPlanFilter[] = [];
  filters.push(...randomizeAllFilters(group));

  if (!isSingle) {
    if (globalFilters) {
      // 复用同一份“已随机化过的全局过滤器”
      filters.push(...globalFilters);
    } else {
      // 每组各自随机化一次全局过滤器
      filters.push(...randomizeAllFilters(globalConfig));
    }
  }

  return { filters };
}

/**
 * 纯逻辑：根据（已反序列化成运行时结构的）GenerateConfig 生成一次随机“开局 Plan”。
 *
 * 返回的是 JSON 友好的 Plan 对象；如果你需要网站的分享字符串，可用 serializePlanToShareString。
 */
export function generatePlan(config: GenerateConfig, ref: { maps: Record<string, string>; difficulties: Record<string, string> }): Plan {
  const isSingle = config.groups.length === 0;
  const groups = isSingle ? [config.globalConfig] : config.groups;

  const reuseGlobal = !!config.settings?.calculateGlobalFilterOnceOnly;
  const generatedGlobalFilters = !isSingle && reuseGlobal ? randomizeAllFilters(config.globalConfig) : null;

  const mapKeys = Object.keys(ref.maps);
  const difficultyKeys = Object.keys(ref.difficulties);

  const map = randomFromListWithBoolFilter(mapKeys, config.map as any);
  const difficulty = randomFromListWithBoolFilter(difficultyKeys, config.difficulty as any);

  return {
    map,
    difficulty,
    groups: groups.map((g) => buildGroupPlan(g, generatedGlobalFilters, isSingle, config.globalConfig)),
  };
}

/** 网站分享字符串（Plan.serialize）的等价实现：map|difficulty|len|... */
export function serializePlanToShareString(plan: Plan, charNameToId: (name: string) => number): string {
  const p = createPacked();
  packedAdd(p, String(plan.map));
  packedAdd(p, String(plan.difficulty));
  packedAdd(p, String(plan.groups.length));

  for (const g of plan.groups) {
    packedAdd(p, String(g.filters.length));
    for (const f of g.filters) {
      packedAdd(p, f.kind);
      packedAdd(p, f.config.whitelist ? "1" : "0");
      packedAdd(p, String(f.config.picked.length));
      for (const v of f.config.picked) {
        if (f.kind === "chars") packedAdd(p, String(charNameToId(String(v))));
        else packedAdd(p, String(v));
      }
    }
  }

  return packedToString(p);
}

export function deserializePlanFromShareString(
  encoded: string,
  charIdToName: (id: number) => string
): Plan {
  const p = createPacked(encoded);
  const map = packedPick(p);
  const difficulty = packedPick(p);
  const groupLen = Number(packedPick(p));

  const groups: CharPlan[] = [];
  for (let i = 0; i < groupLen; i++) {
    const filterLen = Number(packedPick(p));
    const filters: SerializedPlanFilter[] = [];
    for (let j = 0; j < filterLen; j++) {
      const kind = packedPick(p) as PlanFilterKind;
      const whitelist = packedPick(p) === "1";
      const pickedLen = Number(packedPick(p));
      const picked: any[] = [];
      for (let k = 0; k < pickedLen; k++) {
        const raw = packedPick(p);
        if (kind === "color") picked.push(Number(raw));
        else if (kind === "chars") picked.push(charIdToName(Number(raw)));
        else picked.push(raw);
      }
      if (kind === "tags") filters.push({ kind, config: { whitelist, picked: picked as string[] } });
      else if (kind === "chars") filters.push({ kind, config: { whitelist, picked: picked as string[] } });
      else filters.push({ kind, config: { whitelist, picked: picked as number[] } });
    }
    groups.push({ filters });
  }

  return { map, difficulty, groups };
}
