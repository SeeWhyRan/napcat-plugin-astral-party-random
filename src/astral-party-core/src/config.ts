import type {
  AstralPartyData,
  ExportedConfigV1,
  GenerateConfig,
  GenerateSettings,
  SerializedGenerateConfig,
  SerializedGenerateCharConfig,
  SerializedFilterConfig,
} from "./types";

const FULL_SELECT = "<FULL_SELECT>" as const;

function toBoolRecordFullSelect(
  recordOrFull: Record<string, boolean> | typeof FULL_SELECT,
  referenceKeys: string[]
): Record<string, boolean> {
  if (recordOrFull === FULL_SELECT) {
    const ret: Record<string, boolean> = {};
    for (const k of referenceKeys) ret[k] = true;
    return ret;
  }
  // 允许导入时缺 key（补齐为 false）
  const ret: Record<string, boolean> = {};
  for (const k of referenceKeys) ret[k] = !!recordOrFull[k];
  return ret;
}

function toFullSelectIfAllTrue(
  record: Record<string, boolean>,
  referenceKeys: string[]
): Record<string, boolean> | typeof FULL_SELECT {
  for (const k of referenceKeys) {
    if (!record[k]) return record;
  }
  return FULL_SELECT;
}

function normalizeSelectNumber(n: unknown): number {
  if (typeof n === "number" && Number.isFinite(n)) return n;
  if (typeof n === "string" && n.trim() !== "" && Number.isFinite(Number(n))) return Number(n);
  return 0;
}

function storeFilterByName<T>(
  filter: { whitelist: boolean; values: T[]; select: number },
  nameConverter: (v: T) => string,
  allNames: string[]
): SerializedFilterConfig<string> {
  const chosen: Record<string, boolean> = {};
  for (const v of filter.values) chosen[nameConverter(v)] = true;

  let fullSelect = true;
  for (const n of allNames) {
    if (!chosen[n]) {
      fullSelect = false;
      break;
    }
  }

  return {
    whitelist: !!filter.whitelist,
    values: fullSelect ? FULL_SELECT : filter.values.map(nameConverter),
    select: filter.select,
  };
}

function recoverFilter<T>(
  stored: SerializedFilterConfig<any>,
  nameLookUp: (name: string) => T,
  fullCollection: T[]
): { whitelist: boolean; values: T[]; select: number } {
  const values =
    stored.values === FULL_SELECT
      ? [...fullCollection]
      : (stored.values as any[]).map((x) => nameLookUp(String(x)));

  return {
    whitelist: !!stored.whitelist,
    values,
    select: normalizeSelectNumber(stored.select),
  };
}

function storeCharConfig(
  data: AstralPartyData,
  group: GenerateConfig["globalConfig"]
): SerializedGenerateCharConfig {
  const allTags = Object.keys(data.tags);
  const allChars = data.chars.map((c) => c.name);
  const allColorIds = Object.keys(data.colors); // "0".."5"

  const ret: SerializedGenerateCharConfig = {
    tagFilters: group.tagFilters.map((t) => storeFilterByName(t, (x) => x, allTags)),
    charFilters: group.charFilters.map((t) => storeFilterByName(t, (x) => x, allChars)),
    colorFilter: storeFilterByName(group.colorFilter, (x) => String(x), allColorIds),
  };

  if (group.sub && Array.isArray(group.sub) && group.sub.length > 0) {
    ret.sub = group.sub.map((s) => storeCharConfig(data, s as any));
  }

  return ret;
}

function recoverCharConfig(
  data: AstralPartyData,
  stored: SerializedGenerateCharConfig
): GenerateConfig["globalConfig"] {
  const allTags = Object.keys(data.tags);
  const allChars = data.chars.map((c) => c.name);
  const allColorIds = Object.keys(data.colors).map((x) => Number(x));

  const ret: GenerateConfig["globalConfig"] = {
    tagFilters: (stored.tagFilters || []).map((t) => recoverFilter<string>(t as any, (x) => x, allTags)),
    charFilters: (stored.charFilters || []).map((t) => recoverFilter<string>(t as any, (x) => x, allChars)),
    colorFilter: recoverFilter<number>(stored.colorFilter as any, (x) => Number(x), allColorIds),
  };

  if ((stored as any).sub && Array.isArray((stored as any).sub)) {
    ret.sub = ((stored as any).sub as SerializedGenerateCharConfig[]).map((s) => recoverCharConfig(data, s));
  }

  return ret;
}

const DEFAULT_SETTINGS: GenerateSettings = {
  calculateGlobalFilterOnceOnly: false,
  ensureAvailable: true,
};

/**
 * 把“运行时 GenerateConfig”转成与网站导出一致的 data 结构（不含 _ver 包装）。
 */
export function serializeGenerateConfig(data: AstralPartyData, config: GenerateConfig): SerializedGenerateConfig {
  return {
    map: toFullSelectIfAllTrue(config.map, Object.keys(data.maps)),
    difficulty: toFullSelectIfAllTrue(config.difficulty, Object.keys(data.difficulties)),
    groups: config.groups.map((g) => storeCharConfig(data, g)),
    globalConfig: storeCharConfig(data, config.globalConfig),
    settings: config.settings || DEFAULT_SETTINGS,
  };
}

/**
 * 从网站导出 JSON（v1）或旧版直出 GenerateConfig 还原为运行时 GenerateConfig。
 */
export function deserializeGenerateConfig(
  data: AstralPartyData,
  input: ExportedConfigV1 | SerializedGenerateConfig | GenerateConfig
): GenerateConfig {
  const asAny: any = input as any;

  // 兼容网站导出的 { _ver: 1, data: ... }
  const stored: any = asAny && typeof asAny === "object" && asAny._ver === 1 ? asAny.data : input;

  // 兼容旧版：直接存运行时结构（本包不强求，但尽量不破坏）
  if (
    stored &&
    typeof stored === "object" &&
    (stored as any).globalConfig &&
    (stored as any).groups &&
    (stored as any).map &&
    (stored as any).difficulty &&
    (stored as any).settings
  ) {
    const maybeRuntime = stored as any;
    // 如果 values 不是 string（例如是对象），直接当成运行时结构返回
    const g0 = Array.isArray(maybeRuntime.groups) ? maybeRuntime.groups[0] : undefined;
    const v0 = g0?.tagFilters?.[0]?.values?.[0];
    if (v0 !== undefined && typeof v0 !== "string") {
      return maybeRuntime as GenerateConfig;
    }
  }

  const s = stored as SerializedGenerateConfig;

  return {
    map: toBoolRecordFullSelect(s.map as any, Object.keys(data.maps)),
    difficulty: toBoolRecordFullSelect(s.difficulty as any, Object.keys(data.difficulties)),
    globalConfig: recoverCharConfig(data, s.globalConfig),
    groups: (s.groups || []).map((g) => recoverCharConfig(data, g)),
    settings: (s.settings as any) || DEFAULT_SETTINGS,
  };
}

export function wrapExportedConfigV1(data: AstralPartyData, config: GenerateConfig): ExportedConfigV1 {
  return {
    _ver: 1,
    data: serializeGenerateConfig(data, config),
  };
}
