# NapCat 集成提示（AI 友好版）：星引擎派对随机开局逻辑

> 本文档是**自包含**的：实现所需规则/协议/坑点均已写全，**不需要**访问任何“原仓库源码文件路径”。

> 目的：把本仓库的“随机生成配置/角色池”的核心逻辑，迁移到 **NapCat 插件**（或任意 Node/TS 环境）。
>
> 关键要求：
> 1) **必须兼容**本网站“导出配置”生成的 JSON 文件；
> 2) 在新项目里能读取该 JSON 并按相同规则随机生成结果。
>
> 备注：本文档内容来源于某个前端项目的实现细节；为方便你在 NapCat 插件中复刻，该项目的规则已被完整“翻译/展开”到本文档中。
> 你可以忽略任何原项目文件路径（因为在你的工程里不可访问）。

---

## 1. 导出文件格式（你需要兼容的 JSON）

网站导出按钮生成的文件结构（见 `HomePage.exportConfig()`）：

```json
{
  "_ver": 1,
  "data": { /* serializeGenerateConfig(...) 的产物 */ }
}
```

导入逻辑（见 `HomePage.importConfig()`）：
- 若 JSON **没有** `_ver`：当作旧格式，直接把整个对象当作 `GenerateConfig`
- 若 JSON **有** `_ver`：用 `deserializeGenerateConfig(json.data)` 得到 `GenerateConfig`

> NapCat 插件侧建议做一个统一入口：
> - `parseExportedConfig(jsonText) -> GenerateConfig`

---

## 2. 关键类型（概念说明）

### 2.1 GenerateConfig（整份生成配置）

（见 `src/types/game.ts`）

- `map: Record<MapId, boolean>`：哪些地图允许被随机到
- `difficulty: Record<DifficultyId, boolean>`：哪些难度允许被随机到
- `globalConfig: GenerateCharConfig`：全局过滤器（多组时会叠加到每组）
- `groups: GenerateCharConfig[]`：角色组列表；为空表示“单组模式”（只用 globalConfig）
- `settings: { calculateGlobalFilterOnceOnly: boolean; ensureAvailable: boolean }`

### 2.2 GenerateCharConfig（某一组的过滤器配置）

- `colorFilter: FilterConfig<Color>`
- `tagFilters: FilterConfig<Tag>[]`
- `charFilters: FilterConfig<Character>[]`

### 2.3 FilterConfig（一个过滤器如何定义）

- `whitelist: boolean`
  - true：白名单（picked 里的值“允许”）
  - false：黑名单（picked 里的值“禁止”）
- `values: T[]`：候选全集（在 UI 中可缩小范围）
- `select: number`：随机时从 values 里抽取的数量
  - `select > 0`：启用过滤器，随机抽 `select` 个
  - `select <= 0`：过滤器等价于“关闭”（picked = [])

---

## 3. 序列化协议（必须兼容）

配置导出时不会直接把 `GenerateConfig` 原样 JSON 化，而是先 `serializeGenerateConfig`。

### 3.1 特殊哨兵值："<FULL_SELECT>"

为压缩体积，当某些字段表示“全选”时，会保存成字符串：

- `map` 或 `difficulty` 如果全为 true → 保存为 `"<FULL_SELECT>"`
- 每个过滤器的 `values` 如果等于该过滤器的“全集” → 保存为 `"<FULL_SELECT>"`

因此：**反序列化必须识别 `"<FULL_SELECT>"` 并恢复成真正的数组/全选映射**。

### 3.2 serialize/deserialize 的要点（实现必须等价）

请按 `src/helper/configHelper.ts` 的行为实现同构逻辑：

- 地图/难度：
  - `saveObjSelect()`：若 reference 中任意 key 为 false → 按原 Record 保存；否则保存 `"<FULL_SELECT>"`
  - `restoreObjSelect()`：若是 `"<FULL_SELECT>"` → 恢复成 reference 全 true 的 Record

- tagFilters：保存 tag 名称（string），恢复时直接用 string
- charFilters：保存角色 `name`（string），恢复时通过 `chars.find(c => c.name === name)` 找回角色对象
- colorFilter：保存 color 枚举值（数字转字符串），恢复时 `parseInt` 转回枚举

> 依赖提醒：反序列化 charFilters 需要 `chars` 数据表；tagFilters 需要 `Tags`；colorFilter 需要 `colorData`。

---

## 4. 随机生成算法（核心）

目标：从 `GenerateConfig` 随机得到一个“计划/结果”。

源码：`src/helper/planGenerator.ts`。

### 4.1 随机地图与难度

从允许项里随机取 1 个：

- 输入：`filter: Record<id, boolean>`
- 输出：一个 `id`

逻辑：
1) `list.filter(id => filter[id])`
2) 随机打乱
3) 取第一个

#### Map/Difficulty 的“键类型”注意事项（很重要）

本仓库的 `mapLabels` / `difficultyLabels` 是 `Record<number, string>`，但生成器实际使用的是：
- `Object.keys(mapLabels)` / `Object.keys(difficultyLabels)`

在 JS 中 `Object.keys` 返回的是 **字符串数组**（例如 `"1"`, `"2"`），所以随机出来的 map/difficulty 在运行时常常是字符串数字。

为什么这在网站里没出问题：
- `mapLabels[map]` 当 `map = "1"` 时也能取到（对象 key 会被字符串化）
- `Plan.serialize()` 会 `toString()`，本来就是字符串

因此在 NapCat 侧有两种兼容做法（二选一，别混用）：
1) 全程把 `mapId/difficultyId` 当字符串（推荐，最接近实际行为）
2) 生成后 `Number(mapId)` 强制转数字，并在所有访问处统一用数字

如果你要做到“结果字符串（Plan.serialize）完全一致”，建议保持与网站一样：序列化时写入 `toString()` 的值即可。

### 4.2 每组的过滤器如何组成

- 如果 `groups.length === 0`：
  - 视为“单组模式”，只有 1 组：`[globalConfig]`
  - 不叠加 global 到 group（因为本来就只有 global）

- 如果 `groups.length > 0`：
  - 每个 group 都会叠加 globalConfig 的过滤器
  - 但若 `settings.calculateGlobalFilterOnceOnly === true`：
    - 全局过滤器只随机一次，然后复制给所有组（保证各组共享同一套 global 随机结果）

### 4.3 单个 FilterConfig 如何随机（randomize）

- 若 `select > 0`：
  - `picked = randomSample(values, select)`
  - `whitelist` 保持原样
- 若 `select <= 0`：
  - `picked = []`
  - `whitelist` 强制为 `false`（等价“关闭过滤器”）

`randomSample` 的实现（源码）是：
- `values.sort(() => Math.random() - 0.5).slice(0, select)`

> 注意：这种 shuffle 并非严格均匀，但本项目就是这么做的；要行为一致就照做。

---

## 5. 结果是否“可玩”的校验与重试

源码：
- 校验：`checkPlanIsValid(plan)`（`src/helper/planGenerator.ts`）
- 重试循环：`generatePlanFromGlobalConfigAndShow()`（`src/helper/store.ts`）

当 `settings.ensureAvailable === true` 时：
1) 生成 plan
2) 校验失败则重试（最多 2000 次）

校验规则（行为必须一致）：
- 对每一组：至少有 1 个角色被判定为 allowed（否则失败）
- 所有组的 allowed 角色并集数量至少 4 个（否则失败）

> NapCat 插件建议提供：
> - `generateWithRetry(config, maxTries=2000) -> result | throw`

---

## 6. “allowed / banned” 的定义（你集成时最关心的输出）

网站结果页（`src/pages/ResultPage.tsx`）展示的是：
- allowed：`charPlan.isCharacterAllowed(char)`
- banned：`charPlan.isCharacterBanned(char)`

这两个方法属于 `CharPlan` 类（见 `src/data/CharPlan.ts`），其内部会按一组 Filter 叠加计算角色是否允许。

**重要：如果你希望新项目输出与本网站完全一致的 allowed/banned 结果，你必须实现与本仓库一致的 Filter 判定规则。**

### 6.1 Filter 判定规则（必须等价）

源码：`src/data/Filter.ts`。

每个 Filter 有：
- `config: { whitelist: boolean; picked: T[] }`
- `valueGetter: (char) => T | T[]`（例如颜色是数组、标签是数组、角色本身是单值）

基础判定（对单个值）：
- whitelist=true：`value` 必须在 `picked` 里（否则不合法）
- whitelist=false：`value` 必须不在 `picked` 里（否则不合法）

对角色判定（关键差异：白名单用 any，黑名单用 all）：
- 先把 `valueGetter(char)` 统一成数组 `values: T[]`
- whitelist=true：只要 `values` 里 **存在任意一个** 值通过基础判定，则该 Filter 对该角色判定为 **valid**
- whitelist=false：必须 `values` 里 **所有** 值都通过基础判定，该 Filter 才判定该角色为 **valid**

等价伪代码：

```ts
function isCharValid(filter, char): boolean {
  const values = Array.isArray(filterValue) ? filterValue : [filterValue];
  if (filter.whitelist) {
    return values.some(v => picked.includes(v));
  } else {
    return values.every(v => !picked.includes(v));
  }
}
```

#### Character 过滤器的“对象相等性”坑（必须写清楚）

网站的角色过滤器（chars serializer / charFilters）本质上是比较 **对象引用是否相等**：
- `Filter.isValid` 用的是 `picked.findIndex(t => t == value)`（即引用相等）

这意味着：
- 你在新项目里用于比较的 `Character` 必须来自同一个“权威 chars 数组”中的对象实例；
- **不要**在导入/处理中把角色深拷贝成新对象，否则 `picked.includes(char)` 永远 false，角色过滤器会失效。

本仓库能保证这一点，是因为反序列化会用：
- `chars.find(c => c.name === name)`（得到 chars 数组里的同一对象）

NapCat 侧要么同样做，要么改写比较策略为 `byName`（但那就不再是“完全等价”）。

### 6.2 CharPlan 的 allowed/banned

源码：`src/data/CharPlan.ts`。

- `isCharacterBanned(char)`：只要 **任意一个** Filter 对该角色判定为 invalid，就 banned
- `isCharacterAllowed(char)`：`!isCharacterBanned(char)`

等价伪代码：

```ts
function isCharacterBanned(char, filters): boolean {
  return filters.some(f => !isCharValid(f, char));
}
function isCharacterAllowed(char, filters): boolean {
  return !isCharacterBanned(char, filters);
}
```

因此有两种集成路线：

### 路线 A（最省事、行为最一致）：直接移植类
- 把以下文件整体搬到新项目（或做等价实现）：
  - `src/data/Filter.ts`
  - `src/data/CharPlan.ts`
  - `src/data/Plan.ts`
  - `src/helper/serializerManager.ts`（Filter 序列化器）
  - `src/helper/planGenerator.ts`
  - `src/helper/configHelper.ts`
  - `src/data.ts`（至少 chars/Tags/mapLabels/difficultyLabels/Color/colorData）

然后新项目就能：
- 读导出 JSON → 还原 `GenerateConfig`
- `generatePlan(config)` 得到 `Plan`
- 遍历 `chars`，用 `CharPlan.isCharacterAllowed/isCharacterBanned` 拿到展示结果

### 路线 B（只取“随机 picked 条件”，自己算 allowed/banned）：
- 你只复刻 `randomize()` + 叠加规则，输出每个 filter 的 `picked`
- 然后在新项目里按你自己的方式计算 allowed/banned

> 若你要“100% 兼容本网站效果”，优先路线 A。

---

## 6.3（可选，但常用）分享链接/结果序列化协议（Plan.serialize）

> 说明：这与“导出配置 JSON”是两条不同的协议。
> - 配置 JSON：给 UI 保存/导入用（`serializeGenerateConfig`）
> - Plan 序列化：给结果页 URL 分享用（`/result/:plan`）

如果你在 NapCat 也想生成与网站兼容的“可分享结果字符串”，需要实现下面协议。

### 6.3.1 Plan 的序列化格式

源码：
- `src/data/Plan.ts`
- `src/data/CharPlan.ts`
- `src/data/Filter.ts`
- `src/data/Packed.ts`
- `src/helper/serializerManager.ts`
- `src/helper/charHelper.ts`

核心机制：用 `Packed` 把一串字段按 `|` 分隔拼起来。

#### Packed

- `Packed.toString()`：`data.join("|")`
- `new Packed(str)`：`str.split("|")`
- `pick()`：按顺序取下一个字段

#### Plan.serialize()

字段顺序严格如下：
1) `map`（数字 id 的字符串）
2) `difficulty`（数字 id 的字符串）
3) `groups.length`
4) 对每个 group：`group.serialize(packed)`

#### CharPlan.serialize(packed)

字段顺序：
1) `filters.length`
2) 对每个 filter：`filter.serialize(packed)`

#### Filter.serialize(packed)

字段顺序：
1) `serializer.id`（字符串，见下）
2) `serializer.serialize(filter, packed)` 写入其余字段

### 6.3.2 Filter 的 3 种 serializer（必须一致）

源码：`src/helper/serializerManager.ts`。

serializer id 固定是：
- 标签：`"tags"`
- 颜色：`"color"`
- 角色：`"chars"`

它们的通用字段格式是：
1) `whitelist`：`"1"` 或 `"0"`
2) `picked.length`：数量
3) 逐个写入 picked 值（类型不同写法不同）

#### tags serializer（id = "tags"）

- picked 值：直接写 tag 字符串

#### color serializer（id = "color"）

- picked 值：写 Color 枚举数字的字符串（例如 `"0"`, `"1"` ...）

#### chars serializer（id = "chars"）

- picked 值：写角色的 **id**（数字字符串）
- 角色 id 的定义：`id = 角色在 chars 数组中的索引`（见 `src/helper/charHelper.ts` 的 `name2id` 构建方式）

> 重要：要保证跨项目兼容，chars 数组的顺序必须与网站一致，否则 Plan 分享字符串会错位。

### 6.3.3 URL 参数编码

网站做法（见 `src/helper/store.ts`）：
- `encodedPlan = Base64.encode(plan.serialize())`
- 结果页 URL：`/result/${encodedPlan}`

反向：
- `decoded = Base64.decode(planParam)`
- `Plan.deserialize(decoded)`


---

## 7. 给 AI 的实现任务（可以直接复制给另一个 AI 助手）

你是一个编码助手。请在 NapCat 插件项目（Node.js/TypeScript）中实现“星引擎派对随机开局生成器”的核心逻辑，要求：

1) 支持读取本项目导出的配置文件：
   - JSON 格式为 `{ _ver: 1, data: ... }`
   - `data` 使用 `"<FULL_SELECT>"` 作为全选哨兵值
   - 必须实现与 `deserializeGenerateConfig` 等价的反序列化

2) 实现随机生成：
   - 输入 `GenerateConfig`
   - 随机出 map 与 difficulty（从勾选为 true 的集合中随机）
   - 对每个 group 构建过滤器集合（颜色、标签、角色），并按设置决定是否全局过滤器只随机一次

3) 实现可用性校验与重试：
   - 当 ensureAvailable=true，最多重试 2000 次
   - 校验规则：每组至少 1 个 allowed；allowed 并集至少 4 个

4) 输出给 NapCat 的结构建议：
   - `mapId, difficultyId`
   - `groups: [{ allowedNames: string[], bannedNames: string[] }]`
   - 可附带 debug：每个 filter 的 `picked`

数据依赖：需要移植角色表 `chars`（包含 name/color/related 标签），以及 Tags、colorData、mapLabels、difficultyLabels。

### 建议的 NapCat 插件侧最小 API（便于落地）

建议让 AI 实现以下函数（命名可变，但职责要一致）：

- `parseExportedConfig(jsonText: string): GenerateConfig`
  - 兼容 `{_ver:1, data:...}` 与无 `_ver` 的旧格式
  - 支持 `"<FULL_SELECT>"`
  - 若角色名在 chars 中找不到：抛出可读错误

- `generateOnce(config: GenerateConfig): { mapId; difficultyId; groups: GroupResult[]; debug? }`
  - 按本仓库规则随机一次

- `generateWithRetry(config: GenerateConfig, maxTries=2000): SameReturn`
  - 若 `ensureAvailable=true`：循环直到 `checkPlanIsValid` 通过或超次数

- `checkPlanIsValid(resultOrPlan): boolean`
  - 等价于本仓库规则（每组至少 1 allowed；allowed 并集至少 4）

输出结构（建议）：
- `groups[i].allowedNames: string[]`
- `groups[i].bannedNames: string[]`
- `debug.filters[i]`：可选，带 picked 信息便于排查

---

## 8. 常见坑（迁移时）

- `chars.find(...)` 可能找不到（数据不同步/名字不一致）会导致反序列化得到 `undefined`。
  - 建议：找不到时抛错并提示“配置与角色表不匹配”。
- `"<FULL_SELECT>"` 必须在 map/difficulty 与每个 filter.values 都支持。
- 本项目 shuffle 用的是 `sort(() => Math.random() - 0.5)`：如果你换成更严格的洗牌，结果分布会不一致（但通常可接受）。

### 输入有效性校验（建议补上，不然会出现 undefined）

若用户把地图/难度全部取消勾选：
- `randomFromListWithFilter(...)` 会返回 `undefined`
- 后续显示/序列化会出现异常

建议在 NapCat 侧：
- 生成前检查 `map` 与 `difficulty` 至少各有一个 true；否则直接报错并提示用户修正配置。

### 仅需要 JSON 导入时的最小数据要求

如果你只做“导入配置 JSON 并生成 allowed/banned”，你只需要：
- `chars`（name、color 数组、related 标签数组）
- `Tags`（用于恢复 tagFilters 的全集；tag 名本身就是 string）
- `colorData`（用于恢复 colorFilter 的全集；若你不需要显示颜色名，也可以只要 Color 枚举的 key 集合）
- `mapLabels` / `difficultyLabels`（用于恢复 map/difficulty 的 reference keys；如果不显示文字，也至少要 key 集合）

如果你还要兼容“结果分享字符串（Plan.serialize）”，则额外要求：
- `chars` 数组的顺序必须与网站一致（因为 char id = index）。

