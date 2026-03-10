import { escapeHtml } from './html';
import { buildBasePageHtml } from './theme';

export type OpeningAllowedGroupItem = {
    name: string;
    imageUrl?: string | null;
};

export type OpeningAllowedWithImagesModel = {
    mapName: string;
    difficultyName: string;
    groups: OpeningAllowedGroupItem[][];
    /** 每组总数（渲染时可能截断） */
    groupTotals?: number[];
};

function buildGroupHeaderHtml(groupIndex1: number, shown: number, total: number): string {
    const tail = total > shown ? '仅显示前' + String(shown) + '个，共' + String(total) + '个' : '共' + String(total) + '个';
    return '<div class="group-title">第' + String(groupIndex1) + '组 <span class="group-tail">（' + escapeHtml(tail) + '）</span></div>';
}

export function buildOpeningAllowedWithImagesHtml(args: {
    title: string;
    summary: OpeningAllowedWithImagesModel;
    /** 第三行：预设名称（仅展示名称本身，不带“全局x/个人x”等前缀） */
    presetNote?: string;
    maxPerGroup?: number;
}): string {
    const maxPerGroup = Number.isFinite(args.maxPerGroup) ? Math.max(1, Math.floor(args.maxPerGroup as number)) : 32;

    const presetNote = String(args.presetNote || '').trim();
    const topHtml = [
        '<div class="top">',
        '  <div class="top-line"><span class="top-k">地图</span><span class="top-v">' + escapeHtml(args.summary.mapName) + '</span></div>',
        '  <div class="top-line"><span class="top-k">难度</span><span class="top-v">' + escapeHtml(args.summary.difficultyName) + '</span></div>',
        '  <div class="top-line"><span class="top-k">预设</span><span class="top-v">' + escapeHtml(presetNote ? presetNote : '(未提供)') + '</span></div>',
        '</div>',
    ].join('\n');

    const groupsHtml = args.summary.groups.map((g, idx) => {
        const total = (args.summary.groupTotals && Number.isFinite(args.summary.groupTotals[idx]))
            ? Math.max(0, Math.floor(args.summary.groupTotals[idx] as number))
            : g.length;
        const shownItems = g.slice(0, maxPerGroup);

        const itemsHtml = shownItems.map((it) => {
            const name = escapeHtml(it.name);
            const url = it.imageUrl ? escapeHtml(it.imageUrl) : '';

            // 用 <img> 直接外链即可（由 puppeteer 插件去加载）。
            // 若 url 为空则显示占位。
            const imgHtml = url
                ? '<div class="avatar-wrap"><img class="avatar" src="' + url + '" alt="' + name + '"/></div>'
                : '<div class="avatar-wrap"><div class="avatar placeholder"></div></div>';

            return [
                '<div class="char">',
                '  ' + imgHtml,
                '  <div class="char-name">' + name + '</div>',
                '</div>',
            ].join('\n');
        }).join('\n');

        return [
            '<div class="group">',
            '  ' + buildGroupHeaderHtml(idx + 1, shownItems.length, total),
            '  <div class="grid">',
            itemsHtml,
            '  </div>',
            '</div>',
        ].join('\n');
    }).join('\n');

    const bodyHtml = [
        '<style>',
        '  .top{display:flex;flex-direction:column;align-items:flex-start;justify-content:flex-start;gap:8px;margin:0 auto 14px;max-width:860px;padding:16px 14px;border:1px solid rgba(17,24,39,0.10);border-radius:14px;background:#fff;text-align:left;}',
        '  .top-line{display:flex;align-items:baseline;justify-content:flex-start;gap:10px;width:100%;}',
        '  .top-k{font-size:30px;opacity:0.75;font-weight:800;}',
        '  .top-v{font-size:30px;font-weight:900;letter-spacing:0.2px;}',

        // 分割线：meta 与第一组之间、组与组之间
        '  .groups{margin-top:10px;padding-top:14px;border-top:2px solid rgba(251,114,153,0.35);}',
        '  .group{padding-top:14px;}',
        '  .group + .group{margin-top:16px;border-top:2px solid rgba(251,114,153,0.35);}',
        '  .group-title{font-size:14px;font-weight:800;margin:0 0 10px;color:#111827;}',
        '  .group-tail{font-weight:600;opacity:0.7;}',
        '  .grid{display:flex;flex-wrap:wrap;gap:10px;}',
        '  .char{width:126px;border:1px solid rgba(17,24,39,0.08);border-radius:14px;background:#fff;padding:10px 10px 12px;display:flex;flex-direction:column;align-items:center;}',
        '  .avatar-wrap{width:100%;display:flex;justify-content:center;}',
        // 头像圆形
        '  .avatar{width:72px;height:72px;border-radius:9999px;object-fit:cover;display:block;background:#fff1f3;border:2px solid rgba(251,114,153,0.28);}',
        '  .avatar.placeholder{border-radius:9999px;border:2px dashed rgba(251,114,153,0.28);background:#fff1f3;}',
        '  .char-name{padding:8px 0 0;font-size:12px;line-height:1.35;word-break:break-word;text-align:center;}',
        '</style>',
        topHtml,
        '<div class="groups">',
        groupsHtml,
        '</div>',
    ].join('\n');

    return buildBasePageHtml({ title: args.title, bodyHtml });
}
