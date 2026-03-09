import { useCallback, useEffect, useState } from 'react'
import { noAuthFetch } from '../utils/api'
import { showToast } from '../hooks/useToast'
import type { PluginConfig } from '../types'
import { IconTerminal, IconRefresh, IconCheck, IconX } from '../components/icons'

type Preset = { id: string; name: string; presetJson: string; createdAt?: number; updatedAt?: number }

type ValidateResponse = { ok: true } | { ok: false; message?: string }

function newGlobalId(): string {
    return 'grop_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8)
}

function normalizeName(name: string): string {
    const v = (name || '').trim()
    return v || '未命名'
}

export default function GlobalPresetsPage() {
    const [pluginConfig, setPluginConfig] = useState<PluginConfig | null>(null)
    const [globalPresets, setGlobalPresets] = useState<Preset[]>([])
    const [openSet, setOpenSet] = useState<Set<string>>(new Set())
    const [saving, setSaving] = useState(false)
    const [validatingId, setValidatingId] = useState<string | null>(null)

    const fetchConfig = useCallback(async () => {
        try {
            const res = await noAuthFetch<PluginConfig>('/config')
            if (res.code !== 0 || !res.data) throw new Error(res.message || 'no data')
            setPluginConfig(res.data)
            setGlobalPresets((res.data.globalPresets || []) as any)
        } catch {
            showToast('获取全局预设失败', 'error')
        }
    }, [])

    useEffect(() => {
        fetchConfig()
    }, [fetchConfig])

    const toggleOpen = (id: string) => {
        setOpenSet(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    const addPreset = () => {
        const now = Date.now()
        const p: Preset = { id: newGlobalId(), name: '新预设', presetJson: '', createdAt: now, updatedAt: now }
        setGlobalPresets(prev => [p, ...prev])
        setOpenSet(prev => {
            const next = new Set(prev)
            next.add(p.id)
            return next
        })
    }

    const removePreset = (idx: number) => {
        setGlobalPresets(prev => prev.filter((_, i) => i !== idx))
    }

    const updatePreset = (idx: number, patch: Partial<Preset>) => {
        setGlobalPresets(prev => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)))
    }

    const validatePresetJson = useCallback(async (presetJson: string, idForLoading?: string) => {
        if (!presetJson || !presetJson.trim()) {
            showToast('请先填写预设 JSON', 'warning')
            return
        }
        if (idForLoading) setValidatingId(idForLoading)
        try {
            const res = await noAuthFetch<ValidateResponse>('/random-opening/validate-preset', {
                method: 'POST',
                body: JSON.stringify({ presetJson }),
            })
            if (res.code !== 0) {
                showToast(res.message || '校验失败', 'error')
                return
            }
            const data = res.data as any
            if (data?.ok === true) showToast('预设有效', 'success')
            else showToast('无效: ' + (data?.message || '未知错误'), 'error')
        } catch (e: any) {
            const msg = typeof e?.message === 'string' ? e.message : '校验失败'
            showToast(msg, 'error')
        } finally {
            if (idForLoading) setValidatingId(null)
        }
    }, [])

    const saveGlobalPresets = useCallback(async () => {
        if (!pluginConfig) {
            showToast('请先读取配置', 'warning')
            return
        }
        setSaving(true)
        try {
            const now = Date.now()
            const cleaned = globalPresets.map((p) => ({
                ...p,
                id: String(p.id || newGlobalId()),
                name: normalizeName(p.name),
                presetJson: String(p.presetJson || ''),
                createdAt: p.createdAt ?? now,
                updatedAt: now,
            }))

            const newConfig: PluginConfig = {
                ...pluginConfig,
                globalPresets: cleaned as any,
            }

            const res = await noAuthFetch('/config', {
                method: 'POST',
                body: JSON.stringify(newConfig),
            })
            if (res.code !== 0) {
                showToast(res.message || '保存失败', 'error')
                return
            }

            setPluginConfig(newConfig)
            setGlobalPresets(cleaned)
            showToast('已保存', 'success')
        } catch {
            showToast('保存失败', 'error')
        } finally {
            setSaving(false)
        }
    }, [pluginConfig, globalPresets])

    return (
        <div className="space-y-6">
            <div className="card p-5 hover-lift">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
                    <IconTerminal size={16} className="text-gray-400" />
                    全局随机开局预设
                </h3>

                <div className="flex items-center gap-2 flex-wrap">
                    <button className="btn btn-ghost text-xs" onClick={fetchConfig} disabled={saving}>
                        <IconRefresh size={13} />
                        读取
                    </button>
                    <button className="btn btn-ghost text-xs" onClick={addPreset} disabled={saving}>
                        新增预设
                    </button>
                    <button className="btn btn-primary text-xs" onClick={saveGlobalPresets} disabled={saving}>
                        <IconCheck size={13} />
                        保存
                    </button>
                    <div className="text-xs text-gray-400">共 {globalPresets.length} 条</div>
                </div>

                <div className="mt-4 space-y-3">
                    {globalPresets.map((p, idx) => {
                        const open = openSet.has(p.id)
                        const isValidating = validatingId === p.id
                        return (
                            <div key={p.id} className="card p-4">
                                <div className="flex items-start justify-between gap-3 flex-wrap">
                                    <div className="flex-1 min-w-[240px]">
                                        <div className="text-xs text-gray-400 mb-2">全局 {idx + 1}</div>
                                        <input
                                            className="input-field"
                                            value={p.name}
                                            onChange={(e) => updatePreset(idx, { name: e.target.value })}
                                            placeholder="备注名"
                                        />
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button className="btn btn-ghost text-xs" onClick={() => toggleOpen(p.id)}>
                                            {open ? '收起' : '展开'} JSON
                                        </button>
                                        <button
                                            className="btn btn-primary text-xs"
                                            onClick={() => validatePresetJson(p.presetJson, p.id)}
                                            disabled={isValidating}
                                        >
                                            <IconCheck size={13} />
                                            {isValidating ? '校验中' : '校验'}
                                        </button>
                                        <button className="btn btn-danger text-xs" onClick={() => removePreset(idx)}>
                                            <IconX size={13} />
                                            删除
                                        </button>
                                    </div>
                                </div>

                                {open && (
                                    <div className="mt-3">
                                        <div className="text-xs text-gray-400 mb-2">预设 JSON</div>
                                        <textarea
                                            className="input-field font-mono text-xs h-36"
                                            value={p.presetJson}
                                            onChange={(e) => updatePreset(idx, { presetJson: e.target.value })}
                                            placeholder="粘贴预设 JSON"
                                        />
                                    </div>
                                )}
                            </div>
                        )
                    })}

                    {globalPresets.length === 0 && (
                        <div className="text-xs text-gray-400">无全局预设</div>
                    )}
                </div>
            </div>
        </div>
    )
}
