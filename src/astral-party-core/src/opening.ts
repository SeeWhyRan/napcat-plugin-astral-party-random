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

  let plan = generatePlan(config, { maps: data.maps, difficulties: data.difficulties });
  let groupResults: OpeningGroupResult[] = [];

  const shouldEnsureAvailable = !!config.settings?.ensureAvailable;
  const tries = shouldEnsureAvailable ? Math.max(1, maxTries) : 1;
  for (let t = 0; t < tries; t++) {
    plan = generatePlan(config, { maps: data.maps, difficulties: data.difficulties });
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
    break;
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

  const mapId = String(plan.map);
  const difficultyId = String(plan.difficulty);

  return {
    mapId,
    mapName: data.maps[mapId] ?? mapId,
    difficultyId,
    difficultyName: data.difficulties[difficultyId] ?? difficultyId,
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
