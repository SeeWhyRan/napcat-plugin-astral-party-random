import type { OB11Message } from 'napcat-types/napcat-onebot';
import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin/types';

import { pluginState } from '../../core/state';
import { getSessionKey } from '../utils/session';
import { safeExtractJsonText } from '../utils/text';
import { sendReply } from '../utils/messaging';

import type { RandomOpeningPreset } from '../../types';
import { getGlobalPresets } from '../../domain/presets/global-random-opening-presets';
import {
    deleteUserPresetByIndex,
    getUserPresets,
    upsertUserPreset,
} from '../../domain/presets/user-random-opening-presets';
import { setUserSelection } from '../../domain/presets/user-selection';
import { generateId } from '../../domain/presets/id';
import { validateRandomOpeningPresetJsonText } from '../../domain/presets/validate';

const COMMANDS = {
    list: ['/随机开局预设列表', '/random_opening_preset_list'],
    import: ['/随机开局导入预设', '/random_opening_preset_import'],
    deletePrefix: ['/随机开局删除预设', '/random_opening_preset_delete'],
    setPrefix: ['/随机开局设置', '/random_opening_preset_set'],
    cancel: ['/取消', '/cancel'],
};

type ImportStep = 'wait_json' | 'wait_name';

type PendingImport = {
    key: string;
    userId: string;
    createdAt: number;
    expireAt: number;
    step: ImportStep;
    jsonText?: string;
};

const pendingImportMap = new Map<string, PendingImport>();

function matchExact(text: string, candidates: string[]): boolean {
    return candidates.includes(text.trim());
}

function isCancel(text: string): boolean {
    return matchExact(text, COMMANDS.cancel);
}

function parseDeleteIndex(text: string): number | null {
    const trimmed = text.trim();
    for (const prefix of COMMANDS.deletePrefix) {
        if (trimmed.startsWith(prefix)) {
            const rest = trimmed.slice(prefix.length).trim();
            if (!rest) return null;
            const n = Number(rest);
            if (!Number.isFinite(n)) return null;
            return Math.trunc(n);
        }
    }
    return null;
}

function parseSetCommand(text: string): { scope?: 'global' | 'personal'; index?: number } | null {
    const trimmed = text.trim();
    for (const prefix of COMMANDS.setPrefix) {
        if (!trimmed.startsWith(prefix)) continue;

        const rest = trimmed.slice(prefix.length).trim();
        if (!rest) return { scope: undefined, index: undefined };

        // 允许：全局1 / 个人2 / global 1 / personal 2
        const m1 = /^(全局|个人|global|personal)\s*(\d+)?$/i.exec(rest);
        if (!m1) return null;
        const scopeRaw = String(m1[1]).toLowerCase();
        const scope = (scopeRaw === '全局' || scopeRaw === 'global') ? 'global' : 'personal';
        const idxRaw = m1[2];
        const index = idxRaw ? Math.trunc(Number(idxRaw)) : undefined;
        return { scope, index };
    }
    return null;
}

function formatPresetLine(p: RandomOpeningPreset, idx: number): string {
    return `${idx}. ${p.name}`;
}

async function replyPresetList(ctx: NapCatPluginContext, event: OB11Message): Promise<void> {
    const userId = String(event.user_id ?? '');
    const globals = getGlobalPresets();
    const personal = getUserPresets(userId);

    const lines: string[] = [];
    lines.push('[= 随机开局预设列表 =]');

    lines.push('');
    lines.push('全局预设（所有人可用）:');
    if (globals.length === 0) {
        lines.push('  (无)');
    } else {
        globals.forEach((p, i) => lines.push('  ' + formatPresetLine(p, i + 1)));
    }

    lines.push('');
    lines.push('个人预设（仅你可见/可删）:');
    if (personal.length === 0) {
        lines.push('  (无)');
    } else {
        personal.forEach((p, i) => lines.push('  ' + formatPresetLine(p, i + 1)));
    }

    lines.push('');
    lines.push('命令:');
    lines.push('  /随机开局导入预设');
    lines.push('  /随机开局删除预设<数字>   例：/随机开局删除预设1');

    await sendReply(ctx, event, lines.join('\n'));
}

function clearPendingImport(key: string): void {
    pendingImportMap.delete(key);
    const timerId = `pending_import_random_opening_preset:${key}`;
    const t = pluginState.timers.get(timerId);
    if (t) {
        clearTimeout(t);
        pluginState.timers.delete(timerId);
    }
}

function schedulePendingImportTimeout(key: string, ttlMs: number): void {
    const timerId = `pending_import_random_opening_preset:${key}`;
    const existing = pluginState.timers.get(timerId);
    if (existing) {
        clearTimeout(existing);
        pluginState.timers.delete(timerId);
    }

    const timer = setTimeout(() => {
        const cur = pendingImportMap.get(key);
        if (!cur) return;
        if (Date.now() <= cur.expireAt) return;
        pendingImportMap.delete(key);
        pluginState.timers.delete(timerId);
    }, ttlMs);

    pluginState.timers.set(timerId, timer);
}

export async function tryHandleRandomOpeningPresetFlow(ctx: NapCatPluginContext, event: OB11Message): Promise<boolean> {
    const raw = event.raw_message || '';
    const text = raw.trim();

    // 1) 列表
    if (matchExact(text, COMMANDS.list)) {
        await replyPresetList(ctx, event);
        return true;
    }

    // 2) 删除（个人预设）
    const delIndex = parseDeleteIndex(text);
    if (delIndex !== null) {
        const userId = String(event.user_id ?? '');
        const res = deleteUserPresetByIndex(userId, delIndex);
        if (!res.ok) {
            await sendReply(ctx, event, '删除失败：' + (res.message || '未知错误'));
            return true;
        }
        await sendReply(ctx, event, `已删除个人预设第 ${delIndex} 条。`);
        pluginState.incrementProcessed();
        return true;
    }

    // 2.5) 设置（保存用户选择状态）
    const setParsed = parseSetCommand(text);
    if (setParsed) {
        const userId = String(event.user_id ?? '');
        const globals = getGlobalPresets();
        const personals = getUserPresets(userId);

        let scope = setParsed.scope;
        let index = setParsed.index;

        // 未传入个人/全局：默认使用全局；若没有全局预设才使用个人
        if (!scope) {
            scope = globals.length > 0 ? 'global' : 'personal';
        }

        // 未传入数字：默认 1
        if (!index) index = 1;

        if (!Number.isInteger(index) || index < 1) {
            await sendReply(ctx, event, '设置失败：序号无效（从 1 开始）。');
            return true;
        }

        const list = scope === 'global' ? globals : personals;
        if (list.length === 0) {
            const msg = scope === 'global'
                ? '当前没有全局预设，请先在配置中添加，或改用：/随机开局设置个人1'
                : '你还没有个人预设，请先用：/随机开局导入预设';
            await sendReply(ctx, event, msg);
            return true;
        }
        if (index > list.length) {
            await sendReply(ctx, event, `设置失败：序号超出范围（当前共 ${list.length} 条）。`);
            return true;
        }

        setUserSelection(userId, scope, index);
        await sendReply(ctx, event, `已设置默认预设：${scope === 'global' ? '全局' : '个人'}${index}（${list[index - 1].name}）`);
        pluginState.incrementProcessed();
        return true;
    }

    // 3) 导入流程：start
    if (matchExact(text, COMMANDS.import)) {
        const key = getSessionKey(event);
        const userId = String(event.user_id ?? '');
        const ttlMs = 3 * 60 * 1000;
        const now = Date.now();

        const pending: PendingImport = {
            key,
            userId,
            createdAt: now,
            expireAt: now + ttlMs,
            step: 'wait_json',
        };
        pendingImportMap.set(key, pending);
        schedulePendingImportTimeout(key, ttlMs);

        await sendReply(
            ctx,
            event,
            '请在 3 分钟内发送“网站导出的预设 JSON”（下一条消息将被读取并验证）。\n如需退出，请发送 /取消。'
        );
        return true;
    }

    // 4) 导入流程：continuation
    const key = getSessionKey(event);
    const pending = pendingImportMap.get(key);
    if (!pending) return false;

    // 超时兜底
    if (Date.now() > pending.expireAt) {
        clearPendingImport(key);
        return false;
    }

    if (isCancel(text)) {
        clearPendingImport(key);
        await sendReply(ctx, event, '已取消导入预设。');
        return true;
    }

    if (pending.step === 'wait_json') {
        // 允许用户重复发送导入命令：仅提示仍在等待
        if (matchExact(text, COMMANDS.import)) {
            await sendReply(ctx, event, '当前正在等待你发送预设 JSON。\n如需退出，请发送 /取消。');
            return true;
        }

        const jsonText = safeExtractJsonText(text);
        if (!jsonText) {
            await sendReply(ctx, event, '未检测到有效 JSON。请直接发送网站导出的预设 JSON（以 { 开头、} 结尾），或发送 /取消 退出。');
            return true;
        }

        try {
            validateRandomOpeningPresetJsonText(jsonText);
        } catch (e: any) {
            const msg = typeof e?.message === 'string' ? e.message : String(e);
            await sendReply(ctx, event, '该 JSON 无法作为随机开局预设使用：' + msg + '\n你可以重新发送 JSON，或发送 /取消 退出。');
            return true;
        }

        pending.step = 'wait_name';
        pending.jsonText = jsonText;
        pendingImportMap.set(key, pending);

        await sendReply(ctx, event, '验证通过。请给这个预设取一个备注名（下一条消息将作为备注保存）。\n如需退出，请发送 /取消。');
        return true;
    }

    // wait_name
    const name = text;
    if (!name) {
        await sendReply(ctx, event, '备注不能为空，请重新发送备注名，或发送 /取消 退出。');
        return true;
    }
    if (name.length > 40) {
        await sendReply(ctx, event, '备注过长（最多 40 字），请缩短后重试，或发送 /取消 退出。');
        return true;
    }

    const preset: RandomOpeningPreset = {
        id: generateId('rop'),
        name,
        presetJson: pending.jsonText || '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
    };

    upsertUserPreset(pending.userId, preset);
    clearPendingImport(key);

    await sendReply(ctx, event, `已保存个人预设：${name}`);
    pluginState.incrementProcessed();
    return true;
}
