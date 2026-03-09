export function safeExtractJsonText(input: string): string | null {
    const s = input.trim();
    if (!s) return null;

    // 直接就是 JSON
    if (s.startsWith('{') && s.endsWith('}')) return s;

    // 允许用户夹杂说明文字：截取第一个 { 到最后一个 }
    const first = s.indexOf('{');
    const last = s.lastIndexOf('}');
    if (first >= 0 && last > first) {
        return s.slice(first, last + 1);
    }
    return null;
}

export function decodeHtmlEntities(input: string): string {
    // NapCat/某些转发链路可能会把引号等转义成 HTML 实体，导致 JSON.parse 报 Unexpected token '&'
    // 仅做最常见几种实体的替换即可。
    let out = input
        .replaceAll('&quot;', '"')
        .replaceAll('&#34;', '"')
        .replaceAll('&apos;', "'")
        .replaceAll('&#39;', "'")
        .replaceAll('&lt;', '<')
        .replaceAll('&gt;', '>')
        .replaceAll('&nbsp;', ' ')
        // &amp; 必须最后替换，避免把 &quot; 之类提前破坏
        .replaceAll('&amp;', '&');

    // 数值实体（十进制/十六进制）
    out = out.replace(/&#(\d+);/g, (_m, d) => {
        const code = Number(d);
        if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return _m;
        try {
            return String.fromCodePoint(code);
        } catch {
            return _m;
        }
    });
    out = out.replace(/&#x([0-9a-fA-F]+);/g, (_m, hx) => {
        const code = parseInt(String(hx), 16);
        if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return _m;
        try {
            return String.fromCodePoint(code);
        } catch {
            return _m;
        }
    });

    // 去掉常见不可见空白（避免看起来像 JSON，实际夹了控制字符）
    out = out.replaceAll('\u00A0', ' '); // NBSP
    out = out.replace(/[\u200B-\u200D\uFEFF]/g, ''); // 零宽字符
    return out;
}
