import { useCallback, useEffect, useMemo, useState } from 'react'
import type { PluginConfig } from '../types'
import { noAuthFetch } from '../utils/api'
import { showToast } from '../hooks/useToast'
import { IconCheck, IconRefresh, IconSave, IconTerminal, IconX } from '../components/icons'

type Preset = NonNullable<PluginConfig['globalPresets']>[number]

type ValidateResponse = { ok: true } | { ok: false; message?: string }

function newId(): string {
    return 'grop_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8)
}

function normalizeName(name: string): string {
    const v = (name || '').trim()
    return v || '未命名'
}

export default function RandomOpeningPage() {
    const [config, setConfig] = useState<PluginConfig | null>(null)
    const [draft, setDraft] = useState<Preset[]>([])
    const [saving, setSaving] = useState(false)
    const [openSet, setOpenSet] = useState<Set<string>>(new Set())
    const [validatingId, setValidatingId] = useState<string | null>(null)

    const presetCount = draft.length

    const fetchConfig = useCallback(async () => {
        try {
            const res = await noAuthFetch<PluginConfig>('/config')
            if (res.code !== 0 || !res.data) throw new Error(res.message || 'no data')
            setConfig(res.data)
            setDraft(res.data.globalPresets || [])
        } catch {
            showToast('获取配置失败', 'error')
        }
    }, [])

    useEffect(() => { fetchConfig() }, [fetchConfig])

    const hasDirty = useMemo(() => {
        const original = config?.globalPresets || []
        return JSON.stringify(original) !== JSON.stringify(draft)
    }, [config?.globalPresets, draft])

    const toggleOpen = (id: string) => {
        setOpenSet(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    const updatePreset = (idx: number, patch: Partial<Preset>) => {
        setDraft(prev => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)))
    }

    const addPreset = () => {
        const now = Date.now()
        const p: Preset = {
            id: newId(),
            name: '新预设',
            presetJson: '',
            createdAt: now,
            updatedAt: now,
        }
        setDraft(prev => [p, ...prev])
        setOpenSet(prev => {
            const next = new Set(prev)
            next.add(p.id)
            return next
        })
    }

    const removePreset = (idx: number) => {
        setDraft(prev => prev.filter((_, i) => i !== idx))
    }

    const validatePreset = async (idx: number) => {
        const p = draft[idx]
        if (!p) return
        if (!p.presetJson || !p.presetJson.trim()) {
            showToast('请先填写预设 JSON', 'warning')
            return
        }
        setValidatingId(p.id)
        try {
            const res = await noAuthFetch<ValidateResponse>('/random-opening/validate-preset', {
                method: 'POST',
                body: JSON.stringify({ presetJson: p.presetJson }),
            })
            if (res.code !== 0) {
                showToast(res.message || '校验失败', 'error')
                return
            }
            const data = res.data
            if (data && (data as any).ok === true) {
                showToast('预设有效', 'success')
            } else {
                const msg = (data as any)?.message || '无效预设'
                showToast('无效: ' + msg, 'error')
            }
        } catch (e: any) {
            const msg = typeof e?.message === 'string' ? e.message : '校验失败'
            showToast(msg, 'error')
        } finally {
            setValidatingId(null)
        }
    }

    const save = async () => {
        if (!config) return
        setSaving(true)
        try {
            const now = Date.now()
            const nextPresets: Preset[] = draft.map((p) => ({
                ...p,
                id: String(p.id || newId()),
                name: normalizeName(p.name),
                presetJson: String(p.presetJson || ''),
                createdAt: p.createdAt ?? now,
                updatedAt: now,
            }))

            const newConfig: PluginConfig = {
                ...config,
                globalPresets: nextPresets,
            }

            await noAuthFetch('/config', {
                method: 'POST',
                body: JSON.stringify(newConfig),
            })

            setConfig(newConfig)
            setDraft(nextPresets)
            showToast('已保存', 'success')
        } catch {
            showToast('保存失败', 'error')
        } finally {
            setSaving(false)
        }
    }

    if (!config) {
        return (
            <div className="flex items-center justify-center h-64 empty-state">
                <div className="flex flex-col items-center gap-3">
                    <div className="loading-spinner text-primary" />
                    <div className="text-gray-400 text-sm">加载中...</div>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div className="card p-5 hover-lift">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                        <IconTerminal size={16} className="text-gray-400" />
                        <div>
                            <div className="text-sm font-semibold text-gray-900 dark:text-white">全局随机开局预设</div>
                            <div className="text-xs text-gray-400 mt-0.5">所有人可用，仅能在这里维护</div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button className="btn btn-ghost text-xs" onClick={fetchConfig} disabled={saving}>
                            <IconRefresh size={13} />
                            刷新
                        </button>
                        <button className="btn btn-ghost text-xs" onClick={addPreset} disabled={saving}>
                            新增
                        </button>
                        <button className="btn btn-primary text-xs" onClick={save} disabled={saving || !hasDirty}>
                            <IconSave size={13} />
                            保存
                        </button>
                    </div>
                </div>

                <div className="mt-4 text-xs text-gray-400">
                    当前 {presetCount} 条{hasDirty ? '（未保存）' : ''}
                </div>
            </div>

            <div className="space-y-4">
                {draft.map((p, idx) => {
                    const isOpen = openSet.has(p.id)
                    const isValidating = validatingId === p.id
                    return (
                        <div key={p.id} className="card p-5 hover-lift">
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
                                    <button
                                        className="btn btn-ghost text-xs"
                                        onClick={() => toggleOpen(p.id)}
                                    >
                                        {isOpen ? '收起' : '展开'} JSON
                                    </button>
                                    <button
                                        className="btn btn-primary text-xs"
                                        onClick={() => validatePreset(idx)}
                                        disabled={isValidating}
                                    >
                                        <IconCheck size={13} />
                                        {isValidating ? '校验中' : '校验'}
                                    </button>
                                    <button
                                        className="btn btn-danger text-xs"
                                        onClick={() => removePreset(idx)}
                                    >
                                        <IconX size={13} />
                                        删除
                                    </button>
                                </div>
                            </div>

                            {isOpen && (
                                <div className="mt-4">
                                    <div className="text-xs text-gray-400 mb-2">预设 JSON</div>
                                    <textarea
                                        className="input-field font-mono text-xs h-40"
                                        value={p.presetJson}
                                        onChange={(e) => updatePreset(idx, { presetJson: e.target.value })}
                                        placeholder="粘贴从网站导出的预设 JSON"
                                    />
                                </div>
                            )}
                        </div>
                    )
                })}

                {draft.length === 0 && (
                    <div className="card p-8 text-center empty-state">
                        <div className="text-sm text-gray-500">暂无全局预设</div>
                        <div className="text-xs text-gray-400 mt-2">点击“新增”添加一条预设</div>
                    </div>
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
