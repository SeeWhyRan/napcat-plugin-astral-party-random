import { useState, useEffect, useCallback, useMemo } from 'react'
import { noAuthFetch } from '../utils/api'
import { showToast } from '../hooks/useToast'
import type { PluginConfig, GroupInfo } from '../types'
import { IconTerminal, IconSearch, IconRefresh } from '../components/icons'

export default function ConfigPage() {
    const [config, setConfig] = useState<PluginConfig | null>(null)
    const [saving, setSaving] = useState(false)

    // 群聊开关
    const [groups, setGroups] = useState<GroupInfo[]>([])
    const [groupsLoading, setGroupsLoading] = useState(true)
    const [groupSearch, setGroupSearch] = useState('')

    const fetchConfig = useCallback(async () => {
        try {
            const res = await noAuthFetch<PluginConfig>('/config')
            if (res.code === 0 && res.data) setConfig(res.data)
        } catch { showToast('获取配置失败', 'error') }
    }, [])

    useEffect(() => { fetchConfig() }, [fetchConfig])

    const fetchGroups = useCallback(async () => {
        setGroupsLoading(true)
        try {
            const res = await noAuthFetch<GroupInfo[]>('/groups')
            if (res.code === 0 && res.data) setGroups(res.data)
        } catch {
            showToast('获取群列表失败', 'error')
        } finally {
            setGroupsLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchGroups()
    }, [fetchGroups])

    const toggleGroup = useCallback(async (groupId: number, enabled: boolean) => {
        try {
            await noAuthFetch(`/groups/${groupId}/config`, {
                method: 'POST',
                body: JSON.stringify({ enabled }),
            })
            setGroups(prev => prev.map(g =>
                g.group_id === groupId ? { ...g, enabled } : g
            ))
            showToast(`已${enabled ? '启用' : '禁用'}`, 'success')
        } catch {
            showToast('操作失败', 'error')
        }
    }, [])

    const filteredGroups = useMemo(() => {
        const q = groupSearch.trim().toLowerCase()
        if (!q) return groups
        return groups.filter(g =>
            (g.group_name || '').toLowerCase().includes(q) || String(g.group_id).includes(q)
        )
    }, [groups, groupSearch])

    const saveConfig = useCallback(async (update: Partial<PluginConfig>) => {
        if (!config) return
        setSaving(true)
        try {
            const newConfig = { ...config, ...update }
            await noAuthFetch('/config', {
                method: 'POST',
                body: JSON.stringify(newConfig),
            })
            setConfig(newConfig)
            showToast('配置已保存', 'success')
        } catch {
            showToast('保存失败', 'error')
        } finally {
            setSaving(false)
        }
    }, [config])

    const updateField = <K extends keyof PluginConfig>(key: K, value: PluginConfig[K]) => {
        if (!config) return
        const updated = { ...config, [key]: value }
        setConfig(updated)
        saveConfig({ [key]: value })
    }

    if (!config) {
        return (
            <div className="flex items-center justify-center h-64 empty-state">
                <div className="flex flex-col items-center gap-3">
                    <div className="loading-spinner text-primary" />
                    <div className="text-gray-400 text-sm">加载配置中...</div>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6 stagger-children">
            {/* 基础配置 */}
            <div className="card p-5 hover-lift">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-5">
                    <IconTerminal size={16} className="text-gray-400" />
                    基础配置
                </h3>
                <div className="space-y-5">
                    <ToggleRow
                        label="启用插件"
                        desc="全局开关，关闭后不响应任何命令"
                        checked={config.enabled}
                        onChange={(v) => updateField('enabled', v)}
                    />
                    {/* TODO: 在这里添加你的配置项 */}
                </div>
            </div>

            {/* 群聊开关 */}
            <div className="card p-5 hover-lift">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-4">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                        <IconTerminal size={16} className="text-gray-400" />
                        群聊开关
                    </h3>
                    <div className="flex-1" />
                    <button className="btn btn-ghost text-xs" onClick={fetchGroups} disabled={groupsLoading}>
                        <IconRefresh size={13} />
                        刷新
                    </button>
                </div>

                {groupsLoading ? (
                    <div className="flex items-center justify-center h-48 empty-state">
                        <div className="flex flex-col items-center gap-3">
                            <div className="loading-spinner text-primary" />
                            <div className="text-gray-400 text-sm">加载群列表中...</div>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                            <div className="relative flex-1 w-full sm:max-w-xs">
                                <IconSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    className="input-field pl-9"
                                    placeholder="搜索群名称或群号..."
                                    value={groupSearch}
                                    onChange={(e) => setGroupSearch(e.target.value)}
                                />
                            </div>
                            <p className="text-xs text-gray-400">
                                共 {groups.length} 个群，{groups.filter(g => g.enabled).length} 个已启用
                                {groupSearch.trim() && `，搜索到 ${filteredGroups.length} 个`}
                            </p>
                        </div>

                        <div className="mt-4 card overflow-hidden">
                            <table className="w-full text-sm stagger-rows">
                                <thead>
                                    <tr className="text-left text-xs text-gray-400 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-white/[0.02]">
                                        <th className="py-2.5 px-4 font-medium">群名称</th>
                                        <th className="py-2.5 px-4 font-medium">群号</th>
                                        <th className="py-2.5 px-4 font-medium">成员</th>
                                        <th className="py-2.5 px-4 font-medium text-right">状态</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50">
                                    {filteredGroups.map((group) => (
                                        <tr key={group.group_id} className="hover:bg-gray-50/50 dark:hover:bg-white/[0.02] transition-colors">
                                            <td className="py-2.5 px-4">
                                                <span className="text-gray-800 dark:text-gray-200 font-medium">
                                                    {group.group_name || '未知群'}
                                                </span>
                                            </td>
                                            <td className="py-2.5 px-4 font-mono text-xs text-gray-500">{group.group_id}</td>
                                            <td className="py-2.5 px-4 text-xs text-gray-500">
                                                {group.member_count}/{group.max_member_count}
                                            </td>
                                            <td className="py-2.5 px-4 text-right">
                                                <label className="toggle">
                                                    <input
                                                        type="checkbox"
                                                        checked={group.enabled}
                                                        onChange={() => toggleGroup(group.group_id, !group.enabled)}
                                                    />
                                                    <div className="slider" />
                                                </label>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            {filteredGroups.length === 0 && (
                                <div className="py-10 text-center empty-state">
                                    <p className="text-gray-400 text-sm">{groupSearch.trim() ? '没有匹配的群' : '暂无群数据'}</p>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>

            {saving && (
                <div className="saving-indicator fixed bottom-4 right-4 bg-primary text-white text-xs px-3 py-2 rounded-lg shadow-lg flex items-center gap-2">
                    <div className="loading-spinner !w-3 !h-3 !border-[1.5px]" />
                    保存中...
                </div>
            )}
        </div>
    )
}

/* ---- 子组件 ---- */

function ToggleRow({ label, desc, checked, onChange }: {
    label: string; desc: string; checked: boolean; onChange: (v: boolean) => void
}) {
    return (
        <div className="flex items-center justify-between">
            <div>
                <div className="text-sm font-medium text-gray-800 dark:text-gray-200">{label}</div>
                <div className="text-xs text-gray-400 mt-0.5">{desc}</div>
            </div>
            <label className="toggle">
                <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
                <div className="slider" />
            </label>
        </div>
    )
}

function InputRow({ label, desc, value, type = 'text', onChange }: {
    label: string; desc: string; value: string; type?: string; onChange: (v: string) => void
}) {
    const [local, setLocal] = useState(value)
    useEffect(() => { setLocal(value) }, [value])

    const handleBlur = () => {
        if (local !== value) onChange(local)
    }

    return (
        <div>
            <div className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-1">{label}</div>
            <div className="text-xs text-gray-400 mb-2">{desc}</div>
            <input
                className="input-field"
                type={type}
                value={local}
                onChange={(e) => setLocal(e.target.value)}
                onBlur={handleBlur}
                onKeyDown={(e) => e.key === 'Enter' && handleBlur()}
            />
        </div>
    )
}
