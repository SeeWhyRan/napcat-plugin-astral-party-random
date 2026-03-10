import { escapeHtml } from './html';
import { buildBasePageHtml } from './theme';

export function buildOpeningTextCardHtml(title: string, lines: string[]): string {
    const safeLines = lines.map((l) => escapeHtml(l));

    const bodyHtml = [
        '<style>',
        '  .line{white-space:pre-wrap;word-break:break-word;font-size:14px;line-height:1.6;margin:2px 0;}',
        '</style>',
        safeLines.map((l) => '    <div class="line">' + l + '</div>').join('\n'),
    ].join('\n');

    return buildBasePageHtml({ title, bodyHtml });
}
