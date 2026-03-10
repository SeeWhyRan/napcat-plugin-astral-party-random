import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin/types';

import { pluginState } from '../core/state';
import type { ApiResponse, PuppeteerRenderConfig } from '../types';

type RenderRequestBase = {
    html?: string;
    file?: string;
    /** 模板数据（由 puppeteer 插件进行 {{var}} 替换等渲染能力时使用） */
    data?: Record<string, unknown>;
    /** 输出编码：例如 base64（返回 JSON 里 data 为 base64 字符串） */
    encoding?: string;
    timeout?: number;
    type?: string;
    quality?: number;
    fullPage?: boolean;
    omitBackground?: boolean;
    viewport?: { width?: number; height?: number; deviceScaleFactor?: number };
    clip?: { x: number; y: number; width: number; height: number };
    waitUntil?: string;
    waitForTimeout?: number;
    userAgent?: string;
    cookies?: unknown;
    extraHTTPHeaders?: Record<string, string>;
};

function isObject(v: unknown): v is Record<string, unknown> {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function safeJsonParseObject(text: string): { ok: true; value: Record<string, unknown> } | { ok: false; message: string } {
    try {
        const v = JSON.parse(text);
        if (!isObject(v)) return { ok: false, message: 'JSON 必须为对象' };
        return { ok: true, value: v };
    } catch (e: any) {
        return { ok: false, message: e?.message ? String(e.message) : 'JSON 解析失败' };
    }
}

function normalizeBaseUrl(baseUrl: string): string {
    return baseUrl.replace(/\/+$/, '');
}

export type RenderConnectivityTestResult =
    | { ok: true; message: string; time: number }
    | { ok: false; message: string; time: number; status?: number };

/**
 * 测试与 napcat-plugin-puppeteer 的连接是否可用。
 * 通过一次最小渲染请求校验：baseUrl、pluginId。
 * 说明：puppeteer 插件提供无需认证的 /plugin/<pluginId>/api/render（其他插件可直接调用）。
 */
export async function testPuppeteerConnectivity(ctx: NapCatPluginContext): Promise<RenderConnectivityTestResult> {
    const cfg: PuppeteerRenderConfig | undefined = pluginState.config.render;
    const time = Date.now();
    if (!cfg?.enabled) return { ok: false, time, message: '图片渲染未启用' };

    const baseUrl = String(cfg.baseUrl || '').trim();
    const pluginId = String(cfg.pluginId || '').trim();
    if (!baseUrl || !pluginId) return { ok: false, time, message: 'render.baseUrl 或 render.pluginId 未配置' };

    const timeoutMs = Number.isFinite(cfg.timeoutMs) ? Math.max(1000, Math.floor(cfg.timeoutMs as number)) : 15000;
    const url = normalizeBaseUrl(baseUrl) + '/plugin/' + encodeURIComponent(pluginId) + '/api/render';

    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                html: '<div style="padding:16px;background:#ffffff;color:#111827;font-size:14px;">connectivity_test</div>',
                encoding: 'base64',
            }),
            signal: ac.signal,
        });

        const ct = String(res.headers.get('content-type') || '');
        if (!ct.includes('application/json')) {
            const text = await res.text().catch(() => '');
            if (!res.ok) return { ok: false, time, status: res.status, message: text || ('HTTP ' + res.status) };
            return { ok: true, time, message: '连接成功（非 JSON 响应，HTTP ' + res.status + '）' };
        }

        const json = await res.json().catch(() => null) as ApiResponse<any> | null;
        if (!json) {
            return { ok: false, time, status: res.status, message: '响应 JSON 解析失败' };
        }
        if (json.code !== 0) {
            return { ok: false, time, status: res.status, message: json.message || '连接失败(code=' + String(json.code) + ')' };
        }
        const d: any = (json as any).data;
        // data 可能是 base64 字符串，也可能是对象
        const base64 = typeof d === 'string' ? d : (typeof d?.base64 === 'string' ? d.base64 : (typeof d?.imageBase64 === 'string' ? d.imageBase64 : ''));
        if (!base64) {
            return { ok: false, time, status: res.status, message: '连接成功但未返回图片数据' };
        }
        return { ok: true, time, message: '连接成功' };
    } catch (e: any) {
        const msg = e?.name === 'AbortError' ? '连接超时' : (e?.message ? String(e.message) : String(e));
        ctx.logger.warn('(；′⌒`) puppeteer 连通性测试失败:', e);
        return { ok: false, time, message: msg };
    } finally {
        clearTimeout(t);
    }
}

export type RenderImageResult =
    | { ok: true; buffer: Buffer; contentType: string }
    | { ok: false; status?: number; code?: number; message: string; raw?: unknown };

/**
 * 调用 napcat-plugin-puppeteer 的 /render
 * 注意：该接口为“管理接口（需认证）”，因此必须调用 /api/Plugin/ext/<pluginId>/render 并携带 Authorization。
 */
export async function renderHtmlToImage(
    ctx: NapCatPluginContext,
    html: string,
    overrides: Partial<RenderRequestBase> = {}
): Promise<RenderImageResult> {
    const cfg: PuppeteerRenderConfig | undefined = pluginState.config.render;
    if (!cfg?.enabled) {
        return { ok: false, code: 400, message: '图片渲染未启用' };
    }

    const baseUrl = String(cfg.baseUrl || '').trim();
    const pluginId = String(cfg.pluginId || '').trim();
    if (!baseUrl || !pluginId) {
        return { ok: false, code: 400, message: 'render.baseUrl 或 render.pluginId 未配置' };
    }

    let extra: Record<string, unknown> = {};
    const requestJson = String(cfg.requestJson || '').trim();
    if (requestJson) {
        const parsed = safeJsonParseObject(requestJson);
        if (!parsed.ok) {
            return { ok: false, code: 400, message: 'render.requestJson 不合法: ' + parsed.message };
        }
        extra = parsed.value;
    }

    const timeoutMs = Number.isFinite(cfg.timeoutMs) ? Math.max(1000, Math.floor(cfg.timeoutMs as number)) : 15000;
    // 其他插件可直接调用（无需认证）
    const url = normalizeBaseUrl(baseUrl) + '/plugin/' + encodeURIComponent(pluginId) + '/api/render';

    const body: Record<string, unknown> = {
        ...extra,
        ...overrides,
        // 规则：同时传入 html 与 file，优先 html
        html,
    };

    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
            signal: ac.signal,
        });

        const contentType = String(res.headers.get('content-type') || '');

        // 若返回 JSON，则视为统一结构响应；否则尝试直接读二进制。
        if (contentType.includes('application/json')) {
            const json = await res.json().catch(() => null) as ApiResponse<any> | null;
            if (!json) {
                return { ok: false, status: res.status, message: '渲染响应 JSON 解析失败' };
            }
            if (json.code !== 0) {
                return {
                    ok: false,
                    status: res.status,
                    code: json.code,
                    message: json.message || '渲染失败',
                    raw: json,
                };
            }

            // 兼容 data 内返回 base64 或二进制字段（不同版本实现可能差异）。
            const data = (json as any).data;
            const base64 = typeof data === 'string'
                ? data
                : (typeof data?.base64 === 'string' ? data.base64 : (typeof data?.imageBase64 === 'string' ? data.imageBase64 : ''));
            const mime = typeof data?.contentType === 'string'
                ? data.contentType
                : (typeof data?.mime === 'string' ? data.mime : 'image/png');
            if (!base64) {
                return { ok: false, status: res.status, code: 500, message: '渲染成功但未返回图片数据', raw: json };
            }
            return { ok: true, buffer: Buffer.from(base64, 'base64'), contentType: mime };
        }

        if (!res.ok) {
            const text = await res.text().catch(() => '');
            return { ok: false, status: res.status, message: text || ('HTTP ' + res.status) };
        }

        const ab = await res.arrayBuffer();
        const buf = Buffer.from(ab);
        return { ok: true, buffer: buf, contentType: contentType || 'image/png' };
    } catch (e: any) {
        const msg = e?.name === 'AbortError' ? '渲染超时' : (e?.message ? String(e.message) : String(e));
        ctx.logger.warn('(；′⌒`) /render 调用失败:', e);
        return { ok: false, code: 500, message: msg };
    } finally {
        clearTimeout(t);
    }
}

export function buildOpeningHtml(title: string, lines: string[]): string {
    // 简单纯色风格（避免渐变），与 WebUI 主题色一致
    const safeTitle = title.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const safeLines = lines.map((l) => l.replace(/</g, '&lt;').replace(/>/g, '&gt;'));

    return [
        '<!doctype html>',
        '<html lang="zh-CN">',
        '<head>',
        '<meta charset="utf-8"/>',
        '<meta name="viewport" content="width=device-width,initial-scale=1"/>',
        '<style>',
        '  body{margin:0;padding:24px;background:#fff1f3;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;color:#111827;}',
        '  .card{max-width:900px;margin:0 auto;background:#ffffff;border:1px solid rgba(251,114,153,0.25);border-radius:16px;box-shadow:0 8px 30px rgba(251,114,153,0.20);overflow:hidden;}',
        '  .header{padding:14px 18px;background:#FB7299;color:#fff;}',
        '  .header .title{font-size:18px;font-weight:700;line-height:1.2;}',
        '  .content{padding:16px 18px;}',
        '  .line{white-space:pre-wrap;word-break:break-word;font-size:14px;line-height:1.6;margin:2px 0;}',
        '  .muted{opacity:0.75;}',
        '</style>',
        '</head>',
        '<body>',
        '<div class="card">',
        '  <div class="header"><div class="title">' + safeTitle + '</div></div>',
        '  <div class="content">',
        ...safeLines.map((l) => '    <div class="line">' + l + '</div>'),
        '    <div class="line muted">生成时间: ' + new Date().toLocaleString('zh-CN') + '</div>',
        '  </div>',
        '</div>',
        '</body>',
        '</html>',
    ].join('\n');
}
