/**
 * 消息处理器
 *
 * 处理接收到的 QQ 消息事件，包含：
 * - 命令解析与分发
 * - CD 冷却管理
 * - 消息发送工具函数
 *
 * 最佳实践：将不同类型的业务逻辑拆分到不同的 handler 文件中，
 * 保持每个文件职责单一。
 */

import type { OB11Message, OB11PostSendMsg } from 'napcat-types/napcat-onebot';
import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin/types';
import { pluginState } from '../core/state';
import { generateOpeningSummaryFromPresetJson } from '../astral-party-core/src/opening';

// ==================== 两步交互：随机开局 JSON 监听 ====================

type PendingRandomOpening = {
    key: string;
    createdAt: number;
    expireAt: number;
    messageType: 'group' | 'private';
    groupId?: string;
    userId: string;
};

/** key: 会话标识（群: g:<groupId>:<userId>；私聊: p:<userId>） */
const pendingRandomOpeningMap = new Map<string, PendingRandomOpening>();

function getSessionKey(event: OB11Message): string {
    if (event.message_type === 'group' && event.group_id && event.user_id) {
        return `g:${String(event.group_id)}:${String(event.user_id)}`;
    }
    return `p:${String(event.user_id ?? '')}`;
}

function safeExtractJsonText(input: string): string | null {
    const s = input.trim();
    if (!s) return null;

    // 直接就是 JSON
    if (s.startsWith('{') && s.endsWith('}')) return s;

    // 允许用户夹杂说明文字：截取第一个 { 到最后一个 }
    const first = s.indexOf('{');
    const last = s.lastIndexOf('}');
    if (first >= 0 && last > first) {
        return s.slice(first, last + 1);
    }
    return null;
}

function decodeHtmlEntities(input: string): string {
    // NapCat/某些转发链路可能会把引号等转义成 HTML 实体，导致 JSON.parse 报 Unexpected token '&'
    // 仅做最常见几种实体的替换即可。
    let out = input
        .replaceAll('&quot;', '"')
        .replaceAll('&#34;', '"')
        .replaceAll('&apos;', "'")
        .replaceAll('&#39;', "'")
        .replaceAll('&lt;', '<')
        .replaceAll('&gt;', '>')
        .replaceAll('&nbsp;', ' ')
        // &amp; 必须最后替换，避免把 &quot; 之类提前破坏
        .replaceAll('&amp;', '&');

    // 数值实体（十进制/十六进制）
    out = out.replace(/&#(\d+);/g, (_m, d) => {
        const code = Number(d);
        if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return _m;
        try {
            return String.fromCodePoint(code);
        } catch {
            return _m;
        }
    });
    out = out.replace(/&#x([0-9a-fA-F]+);/g, (_m, hx) => {
        const code = parseInt(String(hx), 16);
        if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return _m;
        try {
            return String.fromCodePoint(code);
        } catch {
            return _m;
        }
    });

    // 去掉常见不可见空白（避免看起来像 JSON，实际夹了控制字符）
    out = out.replaceAll('\u00A0', ' '); // NBSP
    out = out.replace(/[\u200B-\u200D\uFEFF]/g, ''); // 零宽字符
    return out;
}

function formatOpeningSummary(summary: { mapName: string; difficultyName: string; groups: string[][] }): string {
    const lines: string[] = [];
    lines.push('[= 随机开局结果 =]');
    lines.push(`地图: ${summary.mapName}`);
    lines.push(`难度: ${summary.difficultyName}`);
    lines.push('');
    summary.groups.forEach((g, idx) => {
        const picked = g.length > 0 ? g.join('、') : '(无)';
        lines.push(`第${idx + 1}组: ${picked}`);
    });
    return lines.join('\n');
}

// ==================== CD 冷却管理 ====================

/** CD 冷却记录 key: `${groupId}:${command}`, value: 过期时间戳 */
const cooldownMap = new Map<string, number>();

/**
 * 检查是否在 CD 中
 * @returns 剩余秒数，0 表示可用
 */
function getCooldownRemaining(groupId: number | string, command: string): number {
    const cdSeconds = pluginState.config.cooldownSeconds ?? 60;
    if (cdSeconds <= 0) return 0;

    const key = `${groupId}:${command}`;
    const expireTime = cooldownMap.get(key);
    if (!expireTime) return 0;

    const remaining = Math.ceil((expireTime - Date.now()) / 1000);
    if (remaining <= 0) {
        cooldownMap.delete(key);
        return 0;
    }
    return remaining;
}

/** 设置 CD 冷却 */
function setCooldown(groupId: number | string, command: string): void {
    const cdSeconds = pluginState.config.cooldownSeconds ?? 60;
    if (cdSeconds <= 0) return;
    cooldownMap.set(`${groupId}:${command}`, Date.now() + cdSeconds * 1000);
}

// ==================== 消息发送工具 ====================

/**
 * 发送消息（通用）
 * 根据消息类型自动发送到群或私聊
 *
 * @param ctx 插件上下文
 * @param event 原始消息事件（用于推断回复目标）
 * @param message 消息内容（支持字符串或消息段数组）
 */
export async function sendReply(
    ctx: NapCatPluginContext,
    event: OB11Message,
    message: OB11PostSendMsg['message']
): Promise<boolean> {
    try {
        const params: OB11PostSendMsg = {
            message,
            message_type: event.message_type,
            ...(event.message_type === 'group' && event.group_id
                ? { group_id: String(event.group_id) }
                : {}),
            ...(event.message_type === 'private' && event.user_id
                ? { user_id: String(event.user_id) }
                : {}),
        };
        await ctx.actions.call('send_msg', params, ctx.adapterName, ctx.pluginManager.config);
        return true;
    } catch (error) {
        pluginState.logger.error('发送消息失败:', error);
        return false;
    }
}

/**
 * 发送群消息
 */
export async function sendGroupMessage(
    ctx: NapCatPluginContext,
    groupId: number | string,
    message: OB11PostSendMsg['message']
): Promise<boolean> {
    try {
        const params: OB11PostSendMsg = {
            message,
            message_type: 'group',
            group_id: String(groupId),
        };
        await ctx.actions.call('send_msg', params, ctx.adapterName, ctx.pluginManager.config);
        return true;
    } catch (error) {
        pluginState.logger.error('发送群消息失败:', error);
        return false;
    }
}

/**
 * 发送私聊消息
 */
export async function sendPrivateMessage(
    ctx: NapCatPluginContext,
    userId: number | string,
    message: OB11PostSendMsg['message']
): Promise<boolean> {
    try {
        const params: OB11PostSendMsg = {
            message,
            message_type: 'private',
            user_id: String(userId),
        };
        await ctx.actions.call('send_msg', params, ctx.adapterName, ctx.pluginManager.config);
        return true;
    } catch (error) {
        pluginState.logger.error('发送私聊消息失败:', error);
        return false;
    }
}

// ==================== 合并转发消息 ====================

/** 合并转发消息节点 */
export interface ForwardNode {
    type: 'node';
    data: {
        nickname: string;
        user_id?: string;
        content: Array<{ type: string; data: Record<string, unknown> }>;
    };
}

/**
 * 发送合并转发消息
 * @param ctx 插件上下文
 * @param target 群号或用户 ID
 * @param isGroup 是否为群消息
 * @param nodes 合并转发节点列表
 */
export async function sendForwardMsg(
    ctx: NapCatPluginContext,
    target: number | string,
    isGroup: boolean,
    nodes: ForwardNode[],
): Promise<boolean> {
    try {
        const actionName = isGroup ? 'send_group_forward_msg' : 'send_private_forward_msg';
        const params: Record<string, unknown> = { message: nodes };
        if (isGroup) {
            params.group_id = String(target);
        } else {
            params.user_id = String(target);
        }
        await ctx.actions.call(
            actionName as 'send_group_forward_msg',
            params as never,
            ctx.adapterName,
            ctx.pluginManager.config,
        );
        return true;
    } catch (error) {
        pluginState.logger.error('发送合并转发消息失败:', error);
        return false;
    }
}

// ==================== 权限检查 ====================

/**
 * 检查群聊中是否有管理员权限
 * 私聊消息默认返回 true
 */
export function isAdmin(event: OB11Message): boolean {
    if (event.message_type !== 'group') return true;
    const role = (event.sender as Record<string, unknown>)?.role;
    return role === 'admin' || role === 'owner';
}

// ==================== 消息处理主函数 ====================

/**
 * 消息处理主函数
 * 在这里实现你的命令处理逻辑
 */
export async function handleMessage(ctx: NapCatPluginContext, event: OB11Message): Promise<void> {
    try {
        const rawMessage = event.raw_message || '';
        const messageType = event.message_type;
        const groupId = event.group_id;
        const userId = event.user_id;

        pluginState.ctx.logger.debug(`收到消息: ${rawMessage} | 类型: ${messageType}`);

        // 群消息：检查该群是否启用
        if (messageType === 'group' && groupId) {
            if (!pluginState.isGroupEnabled(String(groupId))) return;
        }

        // ==================== 1) 处理“两步交互”的下一条消息 ====================
        {
            const key = getSessionKey(event);
            const pending = pendingRandomOpeningMap.get(key);
            if (pending) {
                // 超时兜底（通常由 timer 清理，这里再做一次保障）
                if (Date.now() > pending.expireAt) {
                    pendingRandomOpeningMap.delete(key);
                    const timerId = `pending_random_opening:${key}`;
                    const t = pluginState.timers.get(timerId);
                    if (t) {
                        clearTimeout(t);
                        pluginState.timers.delete(timerId);
                    }
                } else {
                    const text = rawMessage.trim();

                    // 如果用户重复发送命令：保持在等待态，并刷新 TTL
                    if (text === '/随机开局' || text === '/random_opening' || text === '/randomopening') {
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
                        return;
                    }

                    // 允许取消
                    if (text === '/取消' || text === '/cancel') {
                        pendingRandomOpeningMap.delete(key);
                        const timerId = `pending_random_opening:${key}`;
                        const t = pluginState.timers.get(timerId);
                        if (t) {
                            clearTimeout(t);
                            pluginState.timers.delete(timerId);
                        }
                        await sendReply(ctx, event, '已取消，请需要时重新发送 /随机开局');
                        return;
                    }

                    // 不要把“下一条消息”再当作命令前缀来处理；只尝试解析 JSON
                    const jsonText = safeExtractJsonText(text);
                    if (!jsonText) {
                        await sendReply(
                            ctx,
                            event,
                            '未检测到有效 JSON。请直接发送网站导出的预设 JSON（以 { 开头、} 结尾），或发送 /取消 退出。'
                        );
                        return;
                    }

                    try {
                        const decoded = decodeHtmlEntities(jsonText);
                        const parsed = JSON.parse(decoded) as unknown;
                        const summary = generateOpeningSummaryFromPresetJson(parsed as any);
                        pendingRandomOpeningMap.delete(key);
                        const timerId = `pending_random_opening:${key}`;
                        const t = pluginState.timers.get(timerId);
                        if (t) {
                            clearTimeout(t);
                            pluginState.timers.delete(timerId);
                        }

                        await sendReply(ctx, event, formatOpeningSummary(summary));
                        pluginState.incrementProcessed();
                        return;
                    } catch (e: any) {
                        // 解析/生成失败：保留 pending，允许用户重发
                        const msg = typeof e?.message === 'string' ? e.message : String(e);

                        if (pluginState.config.debug) {
                            try {
                                const decoded = decodeHtmlEntities(jsonText);
                                // 尝试从错误信息中提取 position，截取附近片段方便定位
                                const m = /position\s+(\d+)/i.exec(msg);
                                const pos = m ? Number(m[1]) : NaN;
                                if (Number.isFinite(pos)) {
                                    const start = Math.max(0, pos - 40);
                                    const end = Math.min(decoded.length, pos + 40);
                                    const snippet = decoded.slice(start, end);
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
                        return;
                    }
                }
            }
        }

        // ==================== 2) 处理“/随机开局”命令（不依赖命令前缀） ====================
        {
            const text = rawMessage.trim();
            if (text === '/随机开局' || text === '/random_opening' || text === '/randomopening') {
                const key = getSessionKey(event);
                const ttlMs = 2 * 60 * 1000;
                const now = Date.now();
                const pending: PendingRandomOpening = {
                    key,
                    createdAt: now,
                    expireAt: now + ttlMs,
                    messageType,
                    groupId: messageType === 'group' ? String(groupId ?? '') : undefined,
                    userId: String(userId ?? ''),
                };
                pendingRandomOpeningMap.set(key, pending);

                // 设置超时自动清理
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
                return;
            }
        }

        // 检查命令前缀
        const prefix = pluginState.config.commandPrefix || '#cmd';
        if (!rawMessage.startsWith(prefix)) return;

        // 解析命令参数
        const args = rawMessage.slice(prefix.length).trim().split(/\s+/);
        const subCommand = args[0]?.toLowerCase() || '';

        // TODO: 在这里实现你的命令处理逻辑
        switch (subCommand) {
            case 'help': {
                const helpText = [
                    `[= 插件帮助 =]`,
                    `${prefix} help - 显示帮助信息`,
                    `${prefix} ping - 测试连通性`,
                    `${prefix} status - 查看运行状态`,
                ].join('\n');
                await sendReply(ctx, event, helpText);
                break;
            }

            case 'ping': {
                // 群消息检查 CD
                if (messageType === 'group' && groupId) {
                    const remaining = getCooldownRemaining(groupId, 'ping');
                    if (remaining > 0) {
                        await sendReply(ctx, event, `请等待 ${remaining} 秒后再试`);
                        return;
                    }
                }

                await sendReply(ctx, event, 'pong!');
                if (messageType === 'group' && groupId) setCooldown(groupId, 'ping');
                pluginState.incrementProcessed();
                break;
            }

            case 'status': {
                const statusText = [
                    `[= 插件状态 =]`,
                    `运行时长: ${pluginState.getUptimeFormatted()}`,
                    `今日处理: ${pluginState.stats.todayProcessed}`,
                    `总计处理: ${pluginState.stats.processed}`,
                ].join('\n');
                await sendReply(ctx, event, statusText);
                break;
            }

            default: {
                // TODO: 在这里处理你的主要命令逻辑
                break;
            }
        }
    } catch (error) {
        pluginState.logger.error('处理消息时出错:', error);
    }
}
