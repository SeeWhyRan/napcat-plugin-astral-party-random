import { generateOpeningSummaryFromPresetJson } from '../../astral-party-core/src/opening';
import type { OpeningSummary } from './format';
import { decodeHtmlEntities } from '../../handlers/utils/text';

/**
 * 将“文本形式的预设 JSON”解析并生成随机开局。
 * - 内部会做 HTML 实体反转义
 * - 返回精简 summary（地图/难度/每组角色）
 */
export function generateOpeningSummaryFromUserJsonText(jsonText: string): OpeningSummary {
    const decoded = decodeHtmlEntities(jsonText);
    const parsed = JSON.parse(decoded) as unknown;
    return generateOpeningSummaryFromPresetJson(parsed as any) as any;
}
