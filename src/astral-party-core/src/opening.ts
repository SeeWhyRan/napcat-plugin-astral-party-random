import { ASTRAL_PARTY_DATA } from "./data";
import { deserializeGenerateConfig } from "./config";
import { generatePlan } from "./plan";
import type { AstralPartyData, ExportedConfigV1, GenerateConfig, SerializedGenerateConfig } from "./types";

export type OpeningGroupResult = {
  /** 本组可选角色（满足过滤器） */
  allowed: string[];
  /** 本次为本组随机到的角色名 */
  picked: string[];
};

export type OpeningResult = {
  mapId: string;
  mapName: string;
  difficultyId: string;
  difficultyName: string;
  groups: OpeningGroupResult[];
};

/** NapCat 插件更常用的精简输出 */
export type OpeningSummary = {
  mapName: string;
  difficultyName: string;
  /** 每组随机到的角色名 */
  groups: string[][];
};

/** NapCat 用“候选名单”的精简输出：每组可抽到谁（allowed） */
export type OpeningAllowedSummary = {
  mapName: string;
  difficultyName: string;
  /** 每组满足过滤器的可选角色名列表 */
  groups: string[][];
};

export type OpeningOptions = {
  /** 每组随机几个角色名（默认 1） */
  picksPerGroup?: number;
  /** 是否要求跨组不重复（默认 true） */
  uniqueAcrossGroups?: boolean;
  /** 最大重试次数（仅在 config.settings.ensureAvailable=true 时生效，默认 2000） */
  maxTries?: number;
  /** 数据源（默认使用包内 ASTRAL_PARTY_DATA） */
  data?: AstralPartyData;
};

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
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

function randomizeFilter<T>(cfg: { whitelist: boolean; values: T[]; select: number }): { whitelist: boolean; picked: T[] } {
  if (cfg.select > 0) {
    return {
      whitelist: !!cfg.whitelist,
      picked: randomFromList(cfg.values, cfg.select),
    };
  }
  // 与网站一致：select<=0 时视为“关闭过滤器”，并强制 whitelist=false
  return { whitelist: false, picked: [] };
}

type RuntimeFilter =
  | { kind: "tags"; config: { whitelist: boolean; picked: string[] } }
  | { kind: "color"; config: { whitelist: boolean; picked: number[] } }
  | { kind: "chars"; config: { whitelist: boolean; picked: string[] } };

function randomizeAllFiltersForCharConfig(group: GenerateConfig["globalConfig"]): RuntimeFilter[] {
  const filters: RuntimeFilter[] = [];
  filters.push({ kind: "color", config: randomizeFilter<number>(group.colorFilter as any) as any });
  for (const f of group.tagFilters) filters.push({ kind: "tags", config: randomizeFilter<string>(f as any) as any });
  for (const f of group.charFilters) filters.push({ kind: "chars", config: randomizeFilter<string>(f as any) as any });
  return filters;
}

function isFilterValid<T>(cfg: { whitelist: boolean; picked: T[] }, value: T): boolean {
  const inPicked = cfg.picked.findIndex((t) => t === value) !== -1;
  return cfg.whitelist ? inPicked : !inPicked;
}

function isCharValidByFilter(
  filter: { kind: "tags" | "color" | "chars"; config: { whitelist: boolean; picked: any[] } },
  char: { name: string; colorIds: number[]; tags: string[] }
): boolean {
  if (filter.kind === "chars") {
    return isFilterValid<string>(filter.config as any, char.name);
  }

  if (filter.kind === "color") {
    // whitelist: 任意命中即可；blacklist: 全部都不能命中（与网站逻辑一致）
    if (filter.config.whitelist) {
      return char.colorIds.some((c) => isFilterValid<number>(filter.config as any, c));
    }
    return char.colorIds.every((c) => isFilterValid<number>(filter.config as any, c));
  }

  // tags
  if (filter.config.whitelist) {
    return char.tags.some((t) => isFilterValid<string>(filter.config as any, t));
  }
  return char.tags.every((t) => isFilterValid<string>(filter.config as any, t));
}

function getAllowedNamesForGroup(planGroup: { filters: any[] }, data: AstralPartyData): string[] {
  return data.chars
    .filter((ch) => planGroup.filters.every((f) => isCharValidByFilter(f, ch)))
    .map((ch) => ch.name);
}

function getAllowedNamesForFilters(filters: RuntimeFilter[], data: AstralPartyData): string[] {
  return data.chars
    .filter((ch) => filters.every((f) => isCharValidByFilter(f as any, ch)))
    .map((ch) => ch.name);
}

function isOpeningValid(allowedGroups: string[][]): boolean {
  // 对齐网站 checkPlanIsValid：
  // 1) 任意组 allowed=0 => false
  // 2) 所有组 allowed 的并集少于 4 个 => false
  let minSelectable = Number.POSITIVE_INFINITY;
  const union: Record<string, boolean> = {};
  for (const g of allowedGroups) {
    minSelectable = Math.min(minSelectable, g.length);
    for (const name of g) union[name] = true;
  }
  if (!Number.isFinite(minSelectable)) return false;
  if (minSelectable === 0) return false;
  if (Object.keys(union).length < 4) return false;
  return true;
}

function isOpeningValidSub(allowedSlots: string[][][]): boolean {
  // sub 模式：每一组的每个槽位都必须有可选角色；并集仍需 >=4（对齐网站 checkPlanIsValid 的精神）
  const union: Record<string, boolean> = {};
  for (const grp of allowedSlots) {
    for (const slot of grp) {
      if (slot.length === 0) return false;
      for (const name of slot) union[name] = true;
    }
  }
  if (Object.keys(union).length < 4) return false;
  return true;
}

function clampInt(n: unknown, fallback: number): number {
  if (typeof n === "number" && Number.isFinite(n) && n > 0) return Math.floor(n);
  if (typeof n === "string" && n.trim() !== "" && Number.isFinite(Number(n)) && Number(n) > 0) return Math.floor(Number(n));
  return fallback;
}

/**
 * 直接使用网站“预设 JSON”（导出格式或其 data 部分）生成一次“开局结果”。
 *
 * 输入：
 * - 网站导出的 JSON：{ _ver: 1, data: ... }
 * - 或 data 部分（serializeGenerateConfig 的结果）
 *
 * 输出：
 * - 地图名、难度名
 * - 每组：可选角色列表 + 本次随机到的角色名列表
 */
export function generateOpeningFromPresetJson(
  presetJson: string | ExportedConfigV1 | SerializedGenerateConfig | GenerateConfig,
  options: OpeningOptions = {}
): OpeningResult {
  const data = options.data || ASTRAL_PARTY_DATA;
  const picksPerGroup = clampInt(options.picksPerGroup, 1);
  const uniqueAcrossGroups = options.uniqueAcrossGroups !== false;
  const maxTries = clampInt(options.maxTries, 2000);

  const parsed = typeof presetJson === "string" ? (JSON.parse(presetJson) as any) : presetJson;
  const config = deserializeGenerateConfig(data, parsed);

  let groupResults: OpeningGroupResult[] = [];
  let finalMapId: string | null = null;
  let finalDifficultyId: string | null = null;

  const shouldEnsureAvailable = !!config.settings?.ensureAvailable;
  const tries = shouldEnsureAvailable ? Math.max(1, maxTries) : 1;

  const mapKeys = Object.keys(data.maps);
  const difficultyKeys = Object.keys(data.difficulties);

  // 兼容：某些导出的 preset 会把“每组的槽位模板”放在 globalConfig.sub
  // 语义（按你给的样例）：每组需要同时给出“输出槽(魔法/物理)”与“辅助槽(辅助)”各 1 个备选。
  const subTemplates = Array.isArray((config.globalConfig as any).sub) ? ((config.globalConfig as any).sub as GenerateConfig["globalConfig"][]) : null;
  const useSubMode = !!subTemplates && subTemplates.length > 0 && config.groups.length > 0;

  for (let t = 0; t < tries; t++) {
    if (!useSubMode) {
      // 旧模式：按 plan 的 groups 逐组生成 allowed，并在每组内随机 picked
      // 注意：plan 的具体“过滤器组合规则”在 plan.ts 内；这里不再重复。
      const plan = generatePlan(config, { maps: data.maps, difficulties: data.difficulties });
      const allowedGroups = plan.groups.map((g) => getAllowedNamesForGroup(g, data));
      if (shouldEnsureAvailable && !isOpeningValid(allowedGroups)) {
        continue;
      }

      const used: Record<string, boolean> = {};
      groupResults = allowedGroups.map((allowed) => {
        const pool = uniqueAcrossGroups ? allowed.filter((n) => !used[n]) : allowed;
        const picked = shuffle(pool).slice(0, Math.min(picksPerGroup, pool.length));
        if (uniqueAcrossGroups) {
          for (const n of picked) used[n] = true;
        }
        return { allowed, picked };
      });

      finalMapId = String(plan.map);
      finalDifficultyId = String(plan.difficulty);
      break;
    }

    // sub 模式：每个“组”包含多个“槽位模板”（例如：输出槽、辅助槽）
    // 生成方式：对每组的每个模板，各自随机化过滤器并得到 allowed，然后各自 pick 角色。
    const mapId = randomFromListWithBoolFilter(mapKeys as any, config.map as any);
    const difficultyId = randomFromListWithBoolFilter(difficultyKeys as any, config.difficulty as any);

    const allowedSlots: string[][][] = [];
    for (let gi = 0; gi < config.groups.length; gi++) {
      const perGroup: string[][] = [];
      for (const tmpl of subTemplates!) {
        const tmplFilters = randomizeAllFiltersForCharConfig(tmpl);
        const grpFilters = randomizeAllFiltersForCharConfig(config.groups[gi]!);
        const filters = [...tmplFilters, ...grpFilters];
        perGroup.push(getAllowedNamesForFilters(filters, data));
      }
      allowedSlots.push(perGroup);
    }

    if (shouldEnsureAvailable && !isOpeningValidSub(allowedSlots)) {
      continue;
    }

    const used: Record<string, boolean> = {};
    groupResults = allowedSlots.map((slots) => {
      const picked: string[] = [];
      const allowedUnion: Record<string, boolean> = {};
      for (const slotAllowed of slots) {
        for (const n of slotAllowed) allowedUnion[n] = true;
      }
      const allowed = Object.keys(allowedUnion);

      for (const slotAllowed of slots) {
        const want = Math.min(picksPerGroup, slotAllowed.length);
        let pool = uniqueAcrossGroups ? slotAllowed.filter((n) => !used[n]) : slotAllowed;
        if (pool.length === 0) pool = slotAllowed; // 避免 uniqueAcrossGroups 把槽位掏空
        const got = shuffle(pool).slice(0, want);
        for (const n of got) {
          picked.push(n);
          if (uniqueAcrossGroups) used[n] = true;
        }
      }

      return { allowed, picked };
    });

    finalMapId = String(mapId);
    finalDifficultyId = String(difficultyId);
    break;
  }

  // ensureAvailable=true 且多次重试仍失败时，保底给一个“尽力而为”的结果：不再强制校验。
  if (!finalMapId || !finalDifficultyId || groupResults.length === 0) {
    if (!useSubMode) {
      const plan = generatePlan(config, { maps: data.maps, difficulties: data.difficulties });
      finalMapId = String(plan.map);
      finalDifficultyId = String(plan.difficulty);
      const allowedGroups = plan.groups.map((g) => getAllowedNamesForGroup(g, data));
      const used: Record<string, boolean> = {};
      groupResults = allowedGroups.map((allowed) => {
        const pool = uniqueAcrossGroups ? allowed.filter((n) => !used[n]) : allowed;
        const picked = shuffle(pool).slice(0, Math.min(picksPerGroup, pool.length));
        if (uniqueAcrossGroups) {
          for (const n of picked) used[n] = true;
        }
        return { allowed, picked };
      });
    } else {
      // sub 模式保底：同样做一次不校验的生成
      finalMapId = String(randomFromListWithBoolFilter(mapKeys as any, config.map as any));
      finalDifficultyId = String(randomFromListWithBoolFilter(difficultyKeys as any, config.difficulty as any));

      const used: Record<string, boolean> = {};
      groupResults = config.groups.map((grp) => {
        const picked: string[] = [];
        const allowedUnion: Record<string, boolean> = {};
        for (const tmpl of subTemplates!) {
          const tmplFilters = randomizeAllFiltersForCharConfig(tmpl);
          const grpFilters = randomizeAllFiltersForCharConfig(grp);
          const filters = [...tmplFilters, ...grpFilters];
          const slotAllowed = getAllowedNamesForFilters(filters, data);
          for (const n of slotAllowed) allowedUnion[n] = true;
          const pool = uniqueAcrossGroups ? slotAllowed.filter((n) => !used[n]) : slotAllowed;
          const want = Math.min(picksPerGroup, pool.length);
          const got = shuffle(want > 0 ? pool : slotAllowed).slice(0, Math.min(picksPerGroup, slotAllowed.length));
          for (const n of got) {
            picked.push(n);
            if (uniqueAcrossGroups) used[n] = true;
          }
        }
        return { allowed: Object.keys(allowedUnion), picked };
      });
    }
  }

  // 如果要求跨组不重复，但某些组因去重导致 picked 不足，则回退允许重复补齐（更符合“给出结果”预期）
  if (uniqueAcrossGroups) {
    for (const grp of groupResults) {
      if (grp.picked.length >= picksPerGroup) continue;
      const need = picksPerGroup - grp.picked.length;
      const extra = shuffle(grp.allowed).filter((n) => grp.picked.indexOf(n) === -1).slice(0, need);
      grp.picked.push(...extra);
    }
  }

  return {
    mapId: String(finalMapId),
    mapName: data.maps[String(finalMapId)] ?? String(finalMapId),
    difficultyId: String(finalDifficultyId),
    difficultyName: data.difficulties[String(finalDifficultyId)] ?? String(finalDifficultyId),
    groups: groupResults,
  };
}

/**
 * NapCat 插件推荐用这个：输入预设 JSON，直接输出“地图名/难度/每组随机到的角色名”。
 */
export function generateOpeningSummaryFromPresetJson(
  presetJson: string | ExportedConfigV1 | SerializedGenerateConfig | GenerateConfig,
  options: OpeningOptions = {}
): OpeningSummary {
  const full = generateOpeningFromPresetJson(presetJson, options);
  return {
    mapName: full.mapName,
    difficultyName: full.difficultyName,
    groups: full.groups.map((g) => g.picked),
  };
}

/**
 * NapCat 如果需要“能抽到谁”：用这个。
 * 返回每组 allowed（满足过滤器的候选名单），而不是 picked。
 */
export function generateOpeningAllowedSummaryFromPresetJson(
  presetJson: string | ExportedConfigV1 | SerializedGenerateConfig | GenerateConfig,
  options: OpeningOptions = {}
): OpeningAllowedSummary {
  const full = generateOpeningFromPresetJson(presetJson, options);
  return {
    mapName: full.mapName,
    difficultyName: full.difficultyName,
    groups: full.groups.map((g) => g.allowed),
  };
}
