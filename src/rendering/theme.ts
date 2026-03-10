import { escapeHtml } from './html';

export type RenderTheme = {
    /** 主题粉（与 WebUI primary 一致） */
    primary: string;
    /** 浅粉背景 */
    background: string;
    /** 文字颜色 */
    text: string;
    /** 边框/分割线 */
    border: string;
};

export const DEFAULT_RENDER_THEME: RenderTheme = {
    primary: '#FB7299',
    background: '#fff1f3',
    text: '#111827',
    border: 'rgba(251,114,153,0.25)',
};

export function buildBasePageHtml(args: {
    title: string;
    bodyHtml: string;
    theme?: Partial<RenderTheme>;
}): string {
    const theme: RenderTheme = { ...DEFAULT_RENDER_THEME, ...(args.theme || {}) };

    // 纯色风格（禁止渐变），与 WebUI 保持一致
    const safeTitle = escapeHtml(args.title);

    return [
        '<!doctype html>',
        '<html lang="zh-CN">',
        '<head>',
        '<meta charset="utf-8"/>',
        '<meta name="viewport" content="width=device-width,initial-scale=1"/>',
        '<title>' + safeTitle + '</title>',
        '<style>',
        '  :root{--primary:' + theme.primary + ';--bg:' + theme.background + ';--text:' + theme.text + ';--border:' + theme.border + ';}',
        '  body{margin:0;padding:24px;background:var(--bg);font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;color:var(--text);}',
        '  .card{max-width:900px;margin:0 auto;background:#ffffff;border:1px solid var(--border);border-radius:16px;box-shadow:0 8px 30px rgba(251,114,153,0.20);overflow:hidden;}',
        '  .header{padding:14px 18px;background:var(--primary);color:#fff;}',
        '  .header .title{font-size:18px;font-weight:700;line-height:1.2;}',
        '  .content{padding:16px 18px;}',
        '  .muted{opacity:0.75;}',
        '  .meta{margin-top:12px;font-size:11px;text-align:right;opacity:0.45;}',
        '</style>',
        '</head>',
        '<body>',
        '<div class="card">',
        '  <div class="header"><div class="title">' + safeTitle + '</div></div>',
        '  <div class="content">',
        args.bodyHtml,
        '    <div class="meta">生成时间: ' + escapeHtml(new Date().toLocaleString('zh-CN')) + '</div>',
        '  </div>',
        '</div>',
        '</body>',
        '</html>',
    ].join('\n');
}
