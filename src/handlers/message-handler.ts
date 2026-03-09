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

import type { OB11Message } from 'napcat-types/napcat-onebot';
import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin/types';
import { pluginState } from '../core/state';
import { tryHandleRandomOpeningPresetFlow } from './features/random-opening-presets';
import { tryHandleRandomOpeningFlow } from './features/random-opening';
import { sendReply } from './utils/messaging';

// re-export：保持外部调用不破坏（历史上可能从 message-handler 直接引用这些工具）
export {
    sendReply,
    sendGroupMessage,
    sendPrivateMessage,
    sendForwardMsg,
    isAdmin,
} from './utils/messaging';
export type { ForwardNode } from './utils/messaging';

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

        pluginState.ctx.logger.debug(`收到消息: ${rawMessage} | 类型: ${messageType}`);

        // 群消息：检查该群是否启用
        if (messageType === 'group' && groupId) {
            if (!pluginState.isGroupEnabled(String(groupId))) return;
        }

        // Feature：随机开局预设系统（列表/导入/删除/设置）
        // 该 feature 不依赖 commandPrefix，应当在前缀命令解析前执行
        if (await tryHandleRandomOpeningPresetFlow(ctx, event)) {
            return;
        }

        // Feature：随机开局（执行随机开局）
        if (await tryHandleRandomOpeningFlow(ctx, event)) {
            return;
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
