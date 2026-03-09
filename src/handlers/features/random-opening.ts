import type { OB11Message } from 'napcat-types/napcat-onebot';
import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin/types';

import { pluginState } from '../../core/state';
import { getSessionKey } from '../utils/session';
import { safeExtractJsonText } from '../utils/text';
import { formatOpeningSummary } from '../../domain/astral-party/format';
import { generateOpeningSummaryFromUserJsonText } from '../../domain/astral-party/opening-service';
import { sendGroupMessage, sendPrivateMessage, sendReply } from '../utils/messaging';

export type PendingRandomOpening = {
    key: string;
    createdAt: number;
    expireAt: number;
    messageType: 'group' | 'private';
    groupId?: string;
    userId: string;
};

/** key: 会话标识（群: g:<groupId>:<userId>；私聊: p:<userId>） */
const pendingRandomOpeningMap = new Map<string, PendingRandomOpening>();

const COMMANDS = {
    start: ['/随机开局', '/random_opening', '/randomopening'],
    cancel: ['/取消', '/cancel'],
};

function isOneOf(text: string, list: string[]): boolean {
    return list.includes(text);
}

export function isRandomOpeningStartCommand(rawText: string): boolean {
    return isOneOf(rawText.trim(), COMMANDS.start);
}

function isRandomOpeningCancelCommand(rawText: string): boolean {
    return isOneOf(rawText.trim(), COMMANDS.cancel);
}

export async function tryHandleRandomOpeningFlow(ctx: NapCatPluginContext, event: OB11Message): Promise<boolean> {
    const rawMessage = event.raw_message || '';
    const text = rawMessage.trim();

    // 1) 若命中 start 命令：进入等待状态
    if (isRandomOpeningStartCommand(text)) {
        const key = getSessionKey(event);
        const ttlMs = 2 * 60 * 1000;
        const now = Date.now();

        const pending: PendingRandomOpening = {
            key,
            createdAt: now,
            expireAt: now + ttlMs,
            messageType: event.message_type,
            groupId: event.message_type === 'group' ? String(event.group_id ?? '') : undefined,
            userId: String(event.user_id ?? ''),
        };

        pendingRandomOpeningMap.set(key, pending);

        // 设置/刷新超时自动清理
        const timerId = `pending_random_opening:${key}`;
        const existing = pluginState.timers.get(timerId);
        if (existing) {
            clearTimeout(existing);
            pluginState.timers.delete(timerId);
        }
        const timer = setTimeout(async () => {
            const cur = pendingRandomOpeningMap.get(key);
            if (!cur) return;
            if (Date.now() <= cur.expireAt) return;
            pendingRandomOpeningMap.delete(key);
            pluginState.timers.delete(timerId);

            try {
                if (cur.messageType === 'group' && cur.groupId) {
                    await sendGroupMessage(pluginState.ctx, cur.groupId, '随机开局等待超时，请重新发送 /随机开局');
                } else {
                    await sendPrivateMessage(pluginState.ctx, cur.userId, '随机开局等待超时，请重新发送 /随机开局');
                }
            } catch {
                // ignore
            }
        }, ttlMs);
        pluginState.timers.set(timerId, timer);

        await sendReply(
            ctx,
            event,
            '请在 2 分钟内发送“网站导出的预设 JSON”（下一条消息将被当作配置读取）。\n如需退出，请发送 /取消。'
        );
        return true;
    }

    // 2) 若当前会话在等待态：把本条消息当作 JSON（或 cancel / refresh）
    const key = getSessionKey(event);
    const pending = pendingRandomOpeningMap.get(key);
    if (!pending) return false;

    // 超时兜底（通常由 timer 清理，这里再做一次保障）
    if (Date.now() > pending.expireAt) {
        pendingRandomOpeningMap.delete(key);
        const timerId = `pending_random_opening:${key}`;
        const t = pluginState.timers.get(timerId);
        if (t) {
            clearTimeout(t);
            pluginState.timers.delete(timerId);
        }
        return false;
    }

    // 允许取消
    if (isRandomOpeningCancelCommand(text)) {
        pendingRandomOpeningMap.delete(key);
        const timerId = `pending_random_opening:${key}`;
        const t = pluginState.timers.get(timerId);
        if (t) {
            clearTimeout(t);
            pluginState.timers.delete(timerId);
        }
        await sendReply(ctx, event, '已取消，请需要时重新发送 /随机开局');
        return true;
    }

    // 若重复发送 start 命令：提示仍在等待，并刷新 TTL
    if (isRandomOpeningStartCommand(text)) {
        const ttlMs = 2 * 60 * 1000;
        pending.expireAt = Date.now() + ttlMs;
        pendingRandomOpeningMap.set(key, pending);

        const timerId = `pending_random_opening:${key}`;
        const t = pluginState.timers.get(timerId);
        if (t) {
            clearTimeout(t);
            pluginState.timers.delete(timerId);
        }
        const timer = setTimeout(async () => {
            const cur = pendingRandomOpeningMap.get(key);
            if (!cur) return;
            if (Date.now() <= cur.expireAt) return;
            pendingRandomOpeningMap.delete(key);
            pluginState.timers.delete(timerId);

            try {
                if (cur.messageType === 'group' && cur.groupId) {
                    await sendGroupMessage(pluginState.ctx, cur.groupId, '随机开局等待超时，请重新发送 /随机开局');
                } else {
                    await sendPrivateMessage(pluginState.ctx, cur.userId, '随机开局等待超时，请重新发送 /随机开局');
                }
            } catch {
                // ignore
            }
        }, ttlMs);
        pluginState.timers.set(timerId, timer);

        await sendReply(
            ctx,
            event,
            '已进入等待状态：请直接发送“网站导出的预设 JSON”（下一条消息将被读取）。\n如需退出，请发送 /取消。'
        );
        return true;
    }

    const jsonText = safeExtractJsonText(text);
    if (!jsonText) {
        await sendReply(
            ctx,
            event,
            '未检测到有效 JSON。请直接发送网站导出的预设 JSON（以 { 开头、} 结尾），或发送 /取消 退出。'
        );
        return true;
    }

    try {
        const summary = generateOpeningSummaryFromUserJsonText(jsonText);

        pendingRandomOpeningMap.delete(key);
        const timerId = `pending_random_opening:${key}`;
        const t = pluginState.timers.get(timerId);
        if (t) {
            clearTimeout(t);
            pluginState.timers.delete(timerId);
        }

        await sendReply(ctx, event, formatOpeningSummary(summary));
        pluginState.incrementProcessed();
        return true;
    } catch (e: any) {
        const msg = typeof e?.message === 'string' ? e.message : String(e);

        if (pluginState.config.debug) {
            // 尝试从错误信息中提取 position，截取附近片段方便定位
            try {
                const m = /position\s+(\d+)/i.exec(msg);
                const pos = m ? Number(m[1]) : NaN;
                if (Number.isFinite(pos)) {
                    const start = Math.max(0, pos - 40);
                    const end = Math.min(jsonText.length, pos + 40);
                    const snippet = jsonText.slice(start, end);
                    pluginState.logger.debug('随机开局 JSON 解析失败片段: ' + snippet);
                } else {
                    pluginState.logger.debug('随机开局 JSON 原始片段: ' + jsonText.slice(0, 200));
                }
            } catch {
                // ignore
            }
        }

        await sendReply(
            ctx,
            event,
            '解析或生成随机开局失败：' + msg + '\n请检查 JSON 是否为网站导出的预设配置，或发送 /取消 退出。'
        );
        return true;
    }
}
