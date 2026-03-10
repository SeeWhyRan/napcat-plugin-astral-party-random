/**
 * 类型定义文件
 * 定义插件内部使用的接口和类型
 *
 * 注意：OneBot 相关类型（OB11Message, OB11PostSendMsg 等）
 * 以及插件框架类型（NapCatPluginContext, PluginModule 等）
 * 均来自 napcat-types 包，无需在此重复定义。
 */

// ==================== 插件配置 ====================

/**
 * 插件主配置接口
 * 在此定义你的插件所需的所有配置项
 */
export interface PluginConfig {
    /** 全局开关：是否启用插件功能 */
    enabled: boolean;
    /** 按群的单独配置 */
    groupConfigs: Record<string, GroupConfig>;
    /** 全局随机开局预设（所有人可用，仅能通过配置维护） */
    globalPresets?: RandomOpeningPreset[];

    /** 图片渲染（对接 napcat-plugin-puppeteer） */
    render?: PuppeteerRenderConfig;
}

// ==================== 图片渲染（Puppeteer）====================

/**
 * 对接 napcat-plugin-puppeteer 的渲染配置
 * 通过其 /render 接口将 HTML 渲染为图片。
 */
export interface PuppeteerRenderConfig {
    /** 是否启用渲染功能（命令仍可存在，但会回退为文本输出） */
    enabled?: boolean;
    /** NapCat Web 服务 baseUrl，例如 http://127.0.0.1:6099 */
    baseUrl?: string;
    /** puppeteer 插件 ID，例如 napcat-plugin-puppeteer */
    pluginId?: string;
    /**
     * 额外透传给 /render 的 JSON（字符串形式）。
     * 例如 {"type":"png","fullPage":true,"viewport":{"width":900,"height":600}}。
     */
    requestJson?: string;
    /** 请求超时（毫秒） */
    timeoutMs?: number;

    /** 上次测试时间（毫秒时间戳） */
    lastTestAt?: number;
    /** 上次测试是否成功 */
    lastTestOk?: boolean;
    /** 上次测试信息（成功/失败原因） */
    lastTestMessage?: string;
}

// ==================== 随机开局预设 ====================

/**
 * 随机开局预设
 * - id 用于稳定引用（删除/排序时不受影响）
 * - name 用于展示/备注
 * - presetJson 为网站导出的预设 JSON（字符串形式）
 */
export interface RandomOpeningPreset {
    id: string;
    name: string;
    presetJson: string;
    createdAt?: number;
    updatedAt?: number;
}

/**
 * 群配置
 */
export interface GroupConfig {
    /** 是否启用此群的功能 */
    enabled?: boolean;
    // TODO: 在这里添加群级别的配置项
}

// ==================== API 响应 ====================

/**
 * 统一 API 响应格式
 */
export interface ApiResponse<T = unknown> {
    /** 状态码，0 表示成功，-1 表示失败 */
    code: number;
    /** 错误信息（仅错误时返回） */
    message?: string;
    /** 响应数据（仅成功时返回） */
    data?: T;
}
