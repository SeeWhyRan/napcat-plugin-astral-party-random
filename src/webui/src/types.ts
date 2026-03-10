/** WebUI 前端类型定义 */

export interface PluginStatus {
    pluginName: string
    uptime: number
    uptimeFormatted: string
    config: PluginConfig
    stats: {
        processed: number
        todayProcessed: number
        lastUpdateDay: string
    }
}

export interface PluginConfig {
    enabled: boolean
    groupConfigs?: Record<string, GroupConfig>
    /** 全局随机开局预设（所有人可用，仅能通过配置维护） */
    globalPresets?: Array<{ id: string; name: string; presetJson: string; createdAt?: number; updatedAt?: number }>
    /** 图片渲染（napcat-plugin-puppeteer） */
    render?: {
        enabled: boolean
        baseUrl: string
        pluginId: string
        requestJson: string
        timeoutMs: number
        lastTestAt?: number
        lastTestOk?: boolean
        lastTestMessage?: string
    }
}

export interface GroupConfig {
    enabled?: boolean
}

export interface GroupInfo {
    group_id: number
    group_name: string
    member_count: number
    max_member_count: number
    enabled: boolean
    /** 定时推送时间（如 '08:30'），null 表示未设置（模板默认不使用，按需扩展） */
    scheduleTime?: string | null
}

export interface ApiResponse<T = unknown> {
    code: number
    data?: T
    message?: string
}
