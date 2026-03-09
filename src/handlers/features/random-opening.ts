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

        const tips: string[] = [];

        // 未选择：提示，并默认全局1；若没有全局预设，默认个人1
        if (!scope || !index) {
            tips.push('你尚未选择默认预设。');
            if (globals.length > 0) {
                scope = 'global';
                index = 1;
                tips.push('将默认使用：全局1');
            } else if (personals.length > 0) {
                scope = 'personal';
                index = 1;
                tips.push('当前无全局预设，将默认使用：个人1');
            } else {
                tips.push('当前既无全局预设，也无个人预设。');
                tips.push('请先使用：/随机开局导入预设');
                tips.push('或让管理员在配置中添加全局预设。');
                await sendReply(ctx, event, tips.join('\n'));
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
                tips.push('没有可用预设，请先导入个人预设或配置全局预设。');
                await sendReply(ctx, event, tips.join('\n'));
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
            const header = tips.length > 0
                ? tips.join('\n') + `\n使用预设：${scope === 'global' ? '全局' : '个人'}${index}（${preset.name}）\n\n`
                : `使用预设：${scope === 'global' ? '全局' : '个人'}${index}（${preset.name}）\n\n`;
            await sendReply(ctx, event, header + formatOpeningSummary(summary));
            return true;
        } catch (e: any) {
            const msg = typeof e?.message === 'string' ? e.message : String(e);
            await sendReply(
                ctx,
                event,
                '使用预设生成随机开局失败：' + msg + '\n' +
                    '你可以：\n' +
                    '1) /随机开局预设列表 检查预设\n' +
                    '2) /随机开局设置全局1 或 /随机开局设置个人1 重新选择'
            );
            return true;
        }
    }

    return false;
}
