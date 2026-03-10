# astral-party-core

把本网站的“随机开局核心能力”抽成纯逻辑模块，方便复制到其它项目直接调用。

## 提供能力

1. **根据预设 JSON 生成一次随机开局**（Plan）
2. **JSON 格式与网站导入/导出一致**（兼容网站导出格式 `{"_ver":1,"data":...}`）
3. **NapCat 友好 API**：
  - 获取“每组能抽到谁”（allowed）
  - 获取角色对应图片 URL（icon）

## 使用

### 1) 生成 Plan（底层）

```ts
import {
  ASTRAL_PARTY_DATA,
  deserializeGenerateConfig,
  generatePlan,
  wrapExportedConfigV1,
  serializePlanToShareString,
} from "./astral-party-core/src";

// 1) 从网站导出的 JSON 文本得到运行时 config
const exported = JSON.parse(jsonTextFromWebsite);
const config = deserializeGenerateConfig(ASTRAL_PARTY_DATA, exported);

// 2) 生成一次随机开局
const plan = generatePlan(config, {
  maps: ASTRAL_PARTY_DATA.maps,
  difficulties: ASTRAL_PARTY_DATA.difficulties,
});

// 3) 如需生成网站的分享字符串（与 Plan.serialize 等价）
const charNameToId = (name: string) => ASTRAL_PARTY_DATA.chars.findIndex(c => c.name === name);
const share = serializePlanToShareString(plan, charNameToId);

// 4) 如需导出配置（与网站导出一致）
const toExport = wrapExportedConfigV1(ASTRAL_PARTY_DATA, config);
const jsonText = JSON.stringify(toExport);
```

### 2) NapCat：直接拿到“能抽到谁（allowed）”

```ts
import {
  generateOpeningAllowedSummaryFromPresetJson,
  getCharacterImageUrlByName,
} from "./astral-party-core/src";

const preset = JSON.parse(jsonTextFromWebsite); // { _ver:1, data: ... }

// allowed summary：每组候选名单
const out = generateOpeningAllowedSummaryFromPresetJson(preset);

// 取某个角色的图片 URL
const url = getCharacterImageUrlByName(out.groups[0][0]);
// url 可能为 null（找不到）
```

## 文件说明

- `src/types.ts`：类型定义（与网站 JSON 兼容）
- `src/config.ts`：配置 JSON 的 serialize/deserialize（对齐网站）
- `src/plan.ts`：随机生成 Plan + 分享字符串序列化
- `src/data.ts`：纯数据（角色/标签/地图/难度/颜色）
- `src/opening.ts`：更高层的 opening API（含 NapCat 的 summary/allowed summary）
- `src/char.ts`：角色工具（按角色名/索引获取图片 URL）
