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
    help: ['/随机开局帮助', '/random_opening_help'],
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
    lines.push('[= 随机开局预设 =]');

    lines.push('');
    lines.push('全局:');
    if (globals.length === 0) {
        lines.push('  无');
    } else {
        globals.forEach((p, i) => lines.push('  ' + formatPresetLine(p, i + 1)));
    }

    lines.push('');
    lines.push('个人:');
    if (personal.length === 0) {
        lines.push('  无');
    } else {
        personal.forEach((p, i) => lines.push('  ' + formatPresetLine(p, i + 1)));
    }

    await sendReply(ctx, event, lines.join('\n'));
}

async function replyHelp(ctx: NapCatPluginContext, event: OB11Message): Promise<void> {
    const lines: string[] = [];
    lines.push('[= 随机开局帮助 =]');
    lines.push('/随机开局');
    lines.push('/随机开局预设列表');
    lines.push('/随机开局导入预设');
    lines.push('/随机开局删除预设<数字>');
    lines.push('/随机开局设置[全局|个人][数字]');
    lines.push('说明:');
    lines.push('- 不传“全局/个人”默认全局；无全局时用个人');
    lines.push('- 不传数字默认 1');
    lines.push('- 全局预设仅能通过配置维护');
    lines.push('- 导入流程可用 /取消');
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

    // 0) 帮助
    if (matchExact(text, COMMANDS.help)) {
        await replyHelp(ctx, event);
        return true;
    }

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
            await sendReply(ctx, event, '删除失败: ' + (res.message || '未知错误'));
            return true;
        }
        await sendReply(ctx, event, `已删除: 个人${delIndex}`);
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
            await sendReply(ctx, event, '设置失败: 序号无效');
            return true;
        }

        const list = scope === 'global' ? globals : personals;
        if (list.length === 0) {
            await sendReply(ctx, event, scope === 'global' ? '无全局预设' : '无个人预设');
            return true;
        }
        if (index > list.length) {
            await sendReply(ctx, event, `设置失败: 超出范围(共${list.length})`);
            return true;
        }

        setUserSelection(userId, scope, index);
        await sendReply(ctx, event, `默认预设: ${scope === 'global' ? '全局' : '个人'}${index} ${list[index - 1].name}`);
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
            '发送预设 JSON（3 分钟内），或 /取消'
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
        await sendReply(ctx, event, '已取消');
        return true;
    }

    if (pending.step === 'wait_json') {
        // 允许用户重复发送导入命令：仅提示仍在等待
        if (matchExact(text, COMMANDS.import)) {
            await sendReply(ctx, event, '等待 JSON（或 /取消）');
            return true;
        }

        const jsonText = safeExtractJsonText(text);
        if (!jsonText) {
            await sendReply(ctx, event, '未识别 JSON');
            return true;
        }

        try {
            validateRandomOpeningPresetJsonText(jsonText);
        } catch (e: any) {
            const msg = typeof e?.message === 'string' ? e.message : String(e);
            await sendReply(ctx, event, '无效预设: ' + msg);
            return true;
        }

        pending.step = 'wait_name';
        pending.jsonText = jsonText;
        pendingImportMap.set(key, pending);

        await sendReply(ctx, event, '发送备注名（或 /取消）');
        return true;
    }

    // wait_name
    const name = text;
    if (!name) {
        await sendReply(ctx, event, '备注不能为空');
        return true;
    }
    if (name.length > 40) {
        await sendReply(ctx, event, '备注过长(最多40)');
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

    await sendReply(ctx, event, `已保存: ${name}`);
    pluginState.incrementProcessed();
    return true;
}
