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

// re-export：保持外部调用不破坏（历史上可能从 message-handler 直接引用这些工具）
export {
    sendReply,
    sendGroupMessage,
    sendPrivateMessage,
    sendForwardMsg,
    isAdmin,
} from './utils/messaging';
export type { ForwardNode } from './utils/messaging';

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
        // 该 feature 应当在随机开局执行前优先处理（避免导入流程被误触发）
        if (await tryHandleRandomOpeningPresetFlow(ctx, event)) {
            return;
        }

        // Feature：随机开局（执行随机开局）
        if (await tryHandleRandomOpeningFlow(ctx, event)) {
            return;
        }

        // 其余消息不处理
    } catch (error) {
        pluginState.logger.error('处理消息时出错:', error);
    }
}
