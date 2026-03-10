/**
 * API 服务模块
 * 注册 WebUI API 路由
 *
 * 路由类型说明：
 * ┌─────────────────┬──────────────────────────────────────────────┬─────────────────┐
 * │ 类型            │ 路径前缀                                      │ 注册方法        │
 * ├─────────────────┼──────────────────────────────────────────────┼─────────────────┤
 * │ 需要鉴权 API    │ /api/Plugin/ext/<plugin-id>/                 │ router.get/post │
 * │ 无需鉴权 API    │ /plugin/<plugin-id>/api/                     │ router.getNoAuth│
 * │ 静态文件        │ /plugin/<plugin-id>/files/<urlPath>/         │ router.static   │
 * │ 内存文件        │ /plugin/<plugin-id>/mem/<urlPath>/           │ router.staticOnMem│
 * │ 页面            │ /plugin/<plugin-id>/page/<path>             │ router.page     │
 * └─────────────────┴──────────────────────────────────────────────┴─────────────────┘
 *
 * 一般插件自带的 WebUI 页面使用 NoAuth 路由，因为页面本身已在 NapCat WebUI 内嵌展示。
 */

import type {
    NapCatPluginContext,
} from 'napcat-types/napcat-onebot/network/plugin/types';
import { pluginState } from '../core/state';
import { validateRandomOpeningPresetJsonText } from '../domain/presets/validate';
import type { RandomOpeningPreset } from '../types';
import { getGlobalPresets } from '../domain/presets/global-random-opening-presets';
import { getUserPresets, setUserPresets } from '../domain/presets/user-random-opening-presets';
import { getUserSelection, setUserSelection } from '../domain/presets/user-selection';

function isObject(v: unknown): v is Record<string, unknown> {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// dataPath 下的业务数据文件名（用于导出/导入备份）
const USER_PRESETS_DATA_FILE = 'random-opening-presets.users.json';
const USER_SELECTION_DATA_FILE = 'random-opening-presets.selection.json';

function normalizeUserId(raw: unknown): string {
    const v = String(raw ?? '').trim();
    return v;
}

function sanitizePresetArray(raw: unknown): RandomOpeningPreset[] {
    if (!Array.isArray(raw)) return [];
    const now = Date.now();
    const out: RandomOpeningPreset[] = [];
    for (const row of raw) {
        if (!row || typeof row !== 'object') continue;
        const r = row as any;
        const id = String(r.id ?? '').trim();
        const name = String(r.name ?? '').trim();
        const presetJson = String(r.presetJson ?? '');
        if (!id || !name || !presetJson) continue;
        out.push({
            id,
            name,
            presetJson,
            createdAt: typeof r.createdAt === 'number' ? r.createdAt : now,
            updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : now,
        });
    }
    return out;
}

/**
 * 注册 API 路由
 */
export function registerApiRoutes(ctx: NapCatPluginContext): void {
    const router = ctx.router;

    // ==================== 插件信息（无鉴权）====================

    /** 获取插件状态 */
    router.getNoAuth('/status', (_req, res) => {
        res.json({
            code: 0,
            data: {
                pluginName: ctx.pluginName,
                uptime: pluginState.getUptime(),
                uptimeFormatted: pluginState.getUptimeFormatted(),
                config: pluginState.config,
                stats: pluginState.stats,
            },
        });
    });

    // ==================== 配置管理（无鉴权）====================

    /** 获取配置 */
    router.getNoAuth('/config', (_req, res) => {
        res.json({ code: 0, data: pluginState.config });
    });

    /** 保存配置 */
    router.postNoAuth('/config', async (req, res) => {
        try {
            const body = req.body as Record<string, unknown> | undefined;
            if (!body) {
                return res.status(400).json({ code: -1, message: '请求体为空' });
            }
            pluginState.updateConfig(body as Partial<import('../types').PluginConfig>);
            ctx.logger.info('配置已保存');
            res.json({ code: 0, message: 'ok' });
        } catch (err) {
            ctx.logger.error('保存配置失败:', err);
            res.status(500).json({ code: -1, message: String(err) });
        }
    });

    // ==================== 备份导出/导入（无鉴权）====================

    /** 导出：配置 + 业务数据（dataPath 下的 json） */
    router.getNoAuth('/backup/export', (_req, res) => {
        try {
            const userPresetsFile = pluginState.loadDataFile(USER_PRESETS_DATA_FILE, { version: 1, users: {} });
            const userSelectionFile = pluginState.loadDataFile(USER_SELECTION_DATA_FILE, { version: 1, users: {} });

            res.json({
                code: 0,
                data: {
                    version: 1,
                    exportedAt: Date.now(),
                    config: pluginState.config,
                    dataFiles: {
                        userPresetsFile,
                        userSelectionFile,
                    },
                },
            });
        } catch (err) {
            ctx.logger.error('导出备份失败:', err);
            res.status(500).json({ code: -1, message: String(err) });
        }
    });

    /** 导入：覆盖写入配置/数据（可选项控制） */
    router.postNoAuth('/backup/import', (req, res) => {
        try {
            const body = (req.body || {}) as Record<string, unknown>;

            const applyConfig = body.applyConfig !== false;
            const applyData = body.applyData !== false;

            const payload = body.payload;
            if (!isObject(payload)) {
                return res.status(400).json({ code: -1, message: 'payload 必须为对象' });
            }

            const ver = Number((payload as any).version);
            if (!Number.isFinite(ver) || ver !== 1) {
                return res.status(400).json({ code: -1, message: '不支持的备份版本' });
            }

            let applied = { config: false, userPresets: false, userSelection: false };

            if (applyConfig) {
                const cfg = (payload as any).config;
                if (!cfg) {
                    return res.status(400).json({ code: -1, message: 'payload.config 缺失' });
                }
                pluginState.replaceConfig(cfg as any);
                applied.config = true;
            }

            if (applyData) {
                const dataFiles = (payload as any).dataFiles;
                if (!isObject(dataFiles)) {
                    return res.status(400).json({ code: -1, message: 'payload.dataFiles 缺失' });
                }

                if ((dataFiles as any).userPresetsFile) {
                    pluginState.saveDataFile(USER_PRESETS_DATA_FILE, (dataFiles as any).userPresetsFile);
                    applied.userPresets = true;
                }
                if ((dataFiles as any).userSelectionFile) {
                    pluginState.saveDataFile(USER_SELECTION_DATA_FILE, (dataFiles as any).userSelectionFile);
                    applied.userSelection = true;
                }
            }

            ctx.logger.info('备份导入完成 | config=' + String(applied.config) + ' data=' + String(applyData));
            res.json({ code: 0, data: { ok: true, applied } });
        } catch (err) {
            ctx.logger.error('导入备份失败:', err);
            res.status(500).json({ code: -1, message: String(err) });
        }
    });

    // ==================== 随机开局（无鉴权）====================

    /** 校验预设 JSON 是否可用 */
    router.postNoAuth('/random-opening/validate-preset', async (req, res) => {
        try {
            const body = req.body as { presetJson?: unknown } | undefined;
            const presetJson = body?.presetJson;
            if (typeof presetJson !== 'string' || !presetJson.trim()) {
                return res.status(400).json({ code: -1, message: 'presetJson 不能为空' });
            }

            try {
                validateRandomOpeningPresetJsonText(presetJson);
                res.json({ code: 0, data: { ok: true } });
            } catch (e) {
                const msg = (e && typeof (e as any).message === 'string') ? (e as any).message : String(e);
                res.json({ code: 0, data: { ok: false, message: msg } });
            }
        } catch (err) {
            ctx.logger.error('校验预设失败:', err);
            res.status(500).json({ code: -1, message: String(err) });
        }
    });

    /** 获取指定用户的个人预设 */
    router.getNoAuth('/random-opening/users/:userId/presets', (req, res) => {
        try {
            const userId = normalizeUserId(req.params?.userId);
            if (!userId) return res.status(400).json({ code: -1, message: '缺少 userId' });
            const presets = getUserPresets(userId);
            res.json({ code: 0, data: { userId, presets } });
        } catch (err) {
            ctx.logger.error('获取个人预设失败:', err);
            res.status(500).json({ code: -1, message: String(err) });
        }
    });

    /** 覆盖保存指定用户的个人预设 */
    router.postNoAuth('/random-opening/users/:userId/presets', (req, res) => {
        try {
            const userId = normalizeUserId(req.params?.userId);
            if (!userId) return res.status(400).json({ code: -1, message: '缺少 userId' });

            const body = req.body as { presets?: unknown } | undefined;
            const presets = sanitizePresetArray(body?.presets);
            setUserPresets(userId, presets);
            res.json({ code: 0, data: { userId, count: presets.length } });
        } catch (err) {
            ctx.logger.error('保存个人预设失败:', err);
            res.status(500).json({ code: -1, message: String(err) });
        }
    });

    /** 获取指定用户的默认选择 */
    router.getNoAuth('/random-opening/users/:userId/selection', (req, res) => {
        try {
            const userId = normalizeUserId(req.params?.userId);
            if (!userId) return res.status(400).json({ code: -1, message: '缺少 userId' });
            const sel = getUserSelection(userId);
            res.json({ code: 0, data: { userId, selection: sel } });
        } catch (err) {
            ctx.logger.error('获取选择状态失败:', err);
            res.status(500).json({ code: -1, message: String(err) });
        }
    });

    /** 保存指定用户的默认选择 */
    router.postNoAuth('/random-opening/users/:userId/selection', (req, res) => {
        try {
            const userId = normalizeUserId(req.params?.userId);
            if (!userId) return res.status(400).json({ code: -1, message: '缺少 userId' });

            const body = req.body as { scope?: unknown; index?: unknown } | undefined;
            const scopeRaw = String(body?.scope ?? '').trim();
            const indexRaw = Number(body?.index);

            const scope = scopeRaw === 'personal' ? 'personal' : (scopeRaw === 'global' ? 'global' : '');
            const index = Math.trunc(indexRaw);
            if (!scope) return res.status(400).json({ code: -1, message: 'scope 必须为 global 或 personal' });
            if (!Number.isFinite(index) || index < 1) return res.status(400).json({ code: -1, message: 'index 必须为 >= 1 的整数' });

            const globals = getGlobalPresets();
            const personals = getUserPresets(userId);
            const list = scope === 'global' ? globals : personals;
            if (list.length === 0) {
                return res.json({ code: 0, data: { ok: false, message: scope === 'global' ? '无全局预设' : '无个人预设' } });
            }
            if (index > list.length) {
                return res.json({ code: 0, data: { ok: false, message: `序号超出范围（共 ${list.length} 条）` } });
            }

            setUserSelection(userId, scope as any, index);
            res.json({ code: 0, data: { ok: true } });
        } catch (err) {
            ctx.logger.error('保存选择状态失败:', err);
            res.status(500).json({ code: -1, message: String(err) });
        }
    });

    // ==================== 群管理（无鉴权）====================

    /** 获取群列表（附带各群启用状态） */
    router.getNoAuth('/groups', async (_req, res) => {
        try {
            const groups = await ctx.actions.call(
                'get_group_list',
                {},
                ctx.adapterName,
                ctx.pluginManager.config
            ) as Array<{ group_id: number; group_name: string; member_count: number; max_member_count: number }>;

            const groupsWithConfig = (groups || []).map((group) => {
                const groupId = String(group.group_id);
                return {
                    group_id: group.group_id,
                    group_name: group.group_name,
                    member_count: group.member_count,
                    max_member_count: group.max_member_count,
                    enabled: pluginState.isGroupEnabled(groupId),
                };
            });

            res.json({ code: 0, data: groupsWithConfig });
        } catch (e) {
            ctx.logger.error('获取群列表失败:', e);
            res.status(500).json({ code: -1, message: String(e) });
        }
    });

    /** 更新单个群配置 */
    router.postNoAuth('/groups/:id/config', async (req, res) => {
        try {
            const groupId = req.params?.id;
            if (!groupId) {
                return res.status(400).json({ code: -1, message: '缺少群 ID' });
            }

            const body = req.body as Record<string, unknown> | undefined;
            const enabled = body?.enabled;
            pluginState.updateGroupConfig(groupId, { enabled: Boolean(enabled) });
            ctx.logger.info(`群 ${groupId} 配置已更新: enabled=${enabled}`);
            res.json({ code: 0, message: 'ok' });
        } catch (err) {
            ctx.logger.error('更新群配置失败:', err);
            res.status(500).json({ code: -1, message: String(err) });
        }
    });

    /** 批量更新群配置 */
    router.postNoAuth('/groups/bulk-config', async (req, res) => {
        try {
            const body = req.body as Record<string, unknown> | undefined;
            const { enabled, groupIds } = body || {};

            if (typeof enabled !== 'boolean' || !Array.isArray(groupIds)) {
                return res.status(400).json({ code: -1, message: '参数错误' });
            }

            for (const groupId of groupIds) {
                pluginState.updateGroupConfig(String(groupId), { enabled });
            }

            ctx.logger.info(`批量更新群配置完成 | 数量: ${groupIds.length}, enabled=${enabled}`);
            res.json({ code: 0, message: 'ok' });
        } catch (err) {
            ctx.logger.error('批量更新群配置失败:', err);
            res.status(500).json({ code: -1, message: String(err) });
        }
    });

    // TODO: 在这里添加你的自定义 API 路由

    ctx.logger.debug('API 路由注册完成');
}
