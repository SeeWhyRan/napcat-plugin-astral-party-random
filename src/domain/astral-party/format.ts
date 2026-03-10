export type OpeningSummary = {
    mapName: string;
    difficultyName: string;
    groups: string[][];
};

export type OpeningAllowedSummary = {
    mapName: string;
    difficultyName: string;
    groups: string[][];
};

export function formatOpeningSummary(summary: OpeningSummary): string {
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

type FormatAllowedOptions = {
    /** 每组最多展示多少个候选（防刷屏）。默认 20。 */
    maxPerGroup?: number;
};

export function formatOpeningAllowedSummary(summary: OpeningAllowedSummary, options: FormatAllowedOptions = {}): string {
    const maxPerGroup = Number.isFinite(options.maxPerGroup) ? Math.max(1, Math.floor(options.maxPerGroup as number)) : 20;

    const lines: string[] = [];
    lines.push('[= 随机开局候选名单 =]');
    lines.push(`地图: ${summary.mapName}`);
    lines.push(`难度: ${summary.difficultyName}`);
    lines.push('');

    summary.groups.forEach((g, idx) => {
        const total = g.length;
        if (total <= 0) {
            lines.push(`第${idx + 1}组: (无)`);
            return;
        }

        const shown = g.slice(0, maxPerGroup);
        const tail = total > shown.length ? `（仅显示前${shown.length}个，共${total}个）` : `（共${total}个）`;
        lines.push(`第${idx + 1}组${tail}: ${shown.join('、')}`);
    });

    return lines.join('\n');
}
