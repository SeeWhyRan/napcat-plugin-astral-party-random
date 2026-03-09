import type { OB11Message } from 'napcat-types/napcat-onebot';
import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin/types';

import { sendReply } from '../utils/messaging';
import { getGlobalPresets } from '../../domain/presets/global-random-opening-presets';
import { getUserPresets } from '../../domain/presets/user-random-opening-presets';
import { getUserSelection } from '../../domain/presets/user-selection';
import { generateOpeningSummaryFromUserJsonText } from '../../domain/astral-party/opening-service';
import { formatOpeningSummary } from '../../domain/astral-party/format';

const COMMANDS = {
    start: ['/随机开局', '/random_opening', '/randomopening'],
};

function isOneOf(text: string, list: string[]): boolean {
    return list.includes(text);
}

export function isRandomOpeningStartCommand(rawText: string): boolean {
    return isOneOf(rawText.trim(), COMMANDS.start);
}

export async function tryHandleRandomOpeningFlow(ctx: NapCatPluginContext, event: OB11Message): Promise<boolean> {
    const rawMessage = event.raw_message || '';
    const text = rawMessage.trim();

    if (isRandomOpeningStartCommand(text)) {
        const userId = String(event.user_id ?? '');
        const globals = getGlobalPresets();
        const personals = getUserPresets(userId);

        // 读取选择状态
        const sel = getUserSelection(userId);

        let scope: 'global' | 'personal' | undefined = sel.scope;
        let index: number | undefined = sel.index;

        let head = '';

        // 未选择：默认全局1；若没有全局预设，默认个人1
        if (!scope || !index) {
            if (globals.length > 0) {
                scope = 'global';
                index = 1;
                head = '未选择预设，默认全局1\n\n';
            } else if (personals.length > 0) {
                scope = 'personal';
                index = 1;
                head = '未选择预设，默认个人1\n\n';
            } else {
                await sendReply(ctx, event, '无可用预设（/随机开局帮助）');
                return true;
            }
        }

        // scope 未传入/异常：默认使用全局；若没有全局预设才使用个人
        if (!scope) {
            scope = globals.length > 0 ? 'global' : 'personal';
        }
        if (!index || !Number.isInteger(index) || index < 1) {
            index = 1;
        }

        const list = scope === 'global' ? globals : personals;
        if (list.length === 0) {
            // 回退：若选了全局但无全局 → 用个人；反之亦然
            if (scope === 'global' && personals.length > 0) {
                scope = 'personal';
                index = 1;
            } else if (scope === 'personal' && globals.length > 0) {
                scope = 'global';
                index = 1;
            } else {
                await sendReply(ctx, event, '无可用预设（/随机开局帮助）');
                return true;
            }
        }

        const finalList = scope === 'global' ? globals : personals;
        if (index > finalList.length) {
            index = 1;
        }

        const preset = finalList[index - 1];
        try {
            const summary = generateOpeningSummaryFromUserJsonText(preset.presetJson);
            const used = `预设: ${scope === 'global' ? '全局' : '个人'}${index} ${preset.name}\n\n`;
            await sendReply(ctx, event, head + used + formatOpeningSummary(summary));
            return true;
        } catch (e: any) {
            const msg = typeof e?.message === 'string' ? e.message : String(e);
            await sendReply(
                ctx,
                event,
                '生成失败: ' + msg + '\n/随机开局帮助'
            );
            return true;
        }
    }

    return false;
}
