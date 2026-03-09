/**
 * 该包用于把本网站的“随机开局核心能力”抽成纯逻辑模块，
 * 以便复制到别的项目（浏览器/Node）直接调用。
 */

export type AstralPartyData = {
  /** colorId => { name, code } */
  colors: Record<string, { name: string; code: string }>;
  /** mapId(string/number) => label */
  maps: Record<string, string>;
  /** difficultyId(string/number) => label */
  difficulties: Record<string, string>;
  /** tagName => { type } */
  tags: Record<string, { type: number }>;
  chars: Array<{
    icon: string;
    name: string;
    /** 网站枚举顺序：0 RED,1 YELLOW,2 BLUE,3 GREEN,4 BLACK,5 WHITE */
    colorIds: number[];
    /** 对应网站的 related */
    tags: string[];
  }>;
};

export type GenerateSettings = {
  calculateGlobalFilterOnceOnly: boolean;
  ensureAvailable: boolean;
};

export type FilterConfig<T> = {
  whitelist: boolean;
  values: T[];
  select: number;
};

export type GenerateCharConfig = {
  tagFilters: FilterConfig<string>[];
  charFilters: FilterConfig<string>[]; // char name
  colorFilter: FilterConfig<number>; // colorId
  /** 新版网站导出可能包含：子配置列表（用于按模板生成多组） */
  sub?: GenerateCharConfig[];
};

export type GenerateConfig = {
  map: Record<string, boolean>;
  difficulty: Record<string, boolean>;
  globalConfig: GenerateCharConfig;
  groups: GenerateCharConfig[];
  settings: GenerateSettings;
};

export type Preset = {
  name: string;
  config: GenerateConfig;
};

/** 网站导出/导入的 JSON 兼容格式 */
export type ExportedConfigV1 = {
  _ver: 1;
  data: SerializedGenerateConfig;
};

export type SerializedGenerateConfig = {
  map: Record<string, boolean> | "<FULL_SELECT>";
  difficulty: Record<string, boolean> | "<FULL_SELECT>";
  groups: SerializedGenerateCharConfig[];
  globalConfig: SerializedGenerateCharConfig;
  settings?: GenerateSettings;
};

export type SerializedGenerateCharConfig = {
  tagFilters: Array<SerializedFilterConfig<string>>;
  charFilters: Array<SerializedFilterConfig<string>>;
  colorFilter: SerializedFilterConfig<string>;
  /** 新版网站导出可能包含：子配置列表（用于按模板生成多组） */
  sub?: SerializedGenerateCharConfig[];
};

export type SerializedFilterConfig<T> = {
  whitelist: boolean;
  values: T[] | "<FULL_SELECT>";
  select: number | string;
};

export type RandomizedFilterConfig<T> = {
  whitelist: boolean;
  picked: T[];
};
