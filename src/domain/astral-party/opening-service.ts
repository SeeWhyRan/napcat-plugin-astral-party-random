import { generateOpeningAllowedSummaryFromPresetJson, generateOpeningSummaryFromPresetJson } from '../../astral-party-core/src/opening';
import { getCharacterImageUrlByName } from '../../astral-party-core/src/char';
import type { OpeningAllowedSummary } from './format';
import { decodeHtmlEntities } from '../../handlers/utils/text';

export type OpeningAllowedWithImages = {
    mapName: string;
    difficultyName: string;
    /** groups[组][角色] */
    groups: Array<Array<{ name: string; imageUrl: string | null }>>;
    /** 原始每组总数（用于 UI 提示“仅显示前 N 个”） */
    groupTotals: number[];
};

type OpeningSummary = {
    mapName: string;
    difficultyName: string;
    groups: string[][];
};

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

/**
 * 将“文本形式的预设 JSON”解析并生成“候选名单(allowed)”开局摘要。
 * - 内部会做 HTML 实体反转义
 * - 返回 allowed summary（地图/难度/每组可抽到谁）
 */
export function generateOpeningAllowedSummaryFromUserJsonText(jsonText: string): OpeningAllowedSummary {
    const decoded = decodeHtmlEntities(jsonText);
    const parsed = JSON.parse(decoded) as unknown;
    return generateOpeningAllowedSummaryFromPresetJson(parsed as any) as any;
}

/**
 * 生成“候选名单(allowed)”并附带角色图片链接（如果能在数据表中找到）。
 * 说明：
 * - 图片 URL 来自 astral-party-core 的数据表（icon 字段）
 * - 找不到则 imageUrl 为 null
 * - 可通过 maxPerGroup 限制每组渲染数量（避免图片过多导致渲染耗时/体积过大）
 */
export function generateOpeningAllowedWithImagesFromUserJsonText(
    jsonText: string,
    options: { maxPerGroup?: number } = {}
): OpeningAllowedWithImages {
    const summary = generateOpeningAllowedSummaryFromUserJsonText(jsonText);
    const maxPerGroup = Number.isFinite(options.maxPerGroup) ? Math.max(1, Math.floor(options.maxPerGroup as number)) : 32;

    const groupTotals = summary.groups.map((g) => g.length);
    const groups = summary.groups.map((g) => {
        const shown = g.slice(0, maxPerGroup);
        return shown.map((name) => ({
            name,
            imageUrl: getCharacterImageUrlByName(name),
        }));
    });

    return {
        mapName: summary.mapName,
        difficultyName: summary.difficultyName,
        groups,
        groupTotals,
    };
}
