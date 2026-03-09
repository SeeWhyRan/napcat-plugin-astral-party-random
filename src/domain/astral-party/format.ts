export type OpeningSummary = {
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
