import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  ASTRAL_PARTY_DATA,
  generateOpeningFromPresetJson,
  generateOpeningSummaryFromPresetJson,
  wrapExportedConfigV1,
} from "./src/index";

function getArgValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  if (i === -1) return undefined;
  return process.argv[i + 1];
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function toPositiveInt(v: unknown, fallback: number): number {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

// 用法（概念说明）：
// - 可传入一个网站导出的 json 文件路径（包含 { _ver:1, data:... }）
// - 或者不传参数，脚本会自动生成一个示例 preset 来跑通流程
// - 可选参数：
//   --picks N        每组随机 N 个角色名（默认 1）
//   --no-unique      允许跨组重复
//   --maxTries N     ensureAvailable 时的最大重试次数（默认 2000）
//   --full           输出详细结果（含 allowed 列表），否则输出 summary

const fileArg =
  getArgValue("--file") ??
  getArgValue("--gameConfig") ??
  process.argv
    .slice(2)
    .find((a) => a.endsWith(".json") && !a.startsWith("-"));
const picks = toPositiveInt(getArgValue("--picks"), 1);
const uniqueAcrossGroups = !hasFlag("--no-unique");
const maxTries = toPositiveInt(getArgValue("--maxTries"), 2000);
const full = hasFlag("--full");

let preset: unknown;

if (fileArg) {
  const p = resolve(process.cwd(), fileArg);
  preset = JSON.parse(readFileSync(p, "utf-8"));
} else {
  // 构造一个示例 preset：全选地图/难度，禁 2 个随机颜色
  const allMaps = Object.fromEntries(Object.keys(ASTRAL_PARTY_DATA.maps).map((k) => [k, true]));
  const allDiff = Object.fromEntries(Object.keys(ASTRAL_PARTY_DATA.difficulties).map((k) => [k, true]));
  preset = wrapExportedConfigV1(ASTRAL_PARTY_DATA, {
    map: allMaps,
    difficulty: allDiff,
    groups: [],
    globalConfig: {
      tagFilters: [],
      charFilters: [],
      colorFilter: {
        whitelist: false,
        values: Object.keys(ASTRAL_PARTY_DATA.colors).map(Number),
        select: 2,
      },
    },
    settings: { calculateGlobalFilterOnceOnly: false, ensureAvailable: true },
  });
}

const options = { picksPerGroup: picks, uniqueAcrossGroups, maxTries };

if (full) {
  const out = generateOpeningFromPresetJson(preset as any, options);
  console.log(JSON.stringify(out, null, 2));
} else {
  const out = generateOpeningSummaryFromPresetJson(preset as any, options);
  console.log(JSON.stringify(out, null, 2));
}
