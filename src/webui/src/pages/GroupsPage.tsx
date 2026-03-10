import { useState, useEffect, useCallback } from 'react'
import { noAuthFetch } from '../utils/api'
import { showToast } from '../hooks/useToast'
import { IconRefresh, IconTerminal, IconCheck, IconX } from '../components/icons'

type Preset = { id: string; name: string; presetJson: string; createdAt?: number; updatedAt?: number }
type Selection = { scope?: 'global' | 'personal'; index?: number }

function newId(): string {
    return 'rop_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8)
}

function normalizeName(name: string): string {
    const v = (name || '').trim()
    return v || '未命名'
}

export default function GroupsPage() {
    // 个人预设 + 选择状态
    const [userId, setUserId] = useState('')
    const [userPresets, setUserPresets] = useState<Preset[]>([])
    const [userSelection, setUserSelectionState] = useState<Selection>({})
    const [presetOpen, setPresetOpen] = useState<Set<string>>(new Set())
    const [savingUser, setSavingUser] = useState(false)

    const fetchUserData = useCallback(async () => {
        const uid = userId.trim()
        if (!uid) {
            showToast('请输入 userId', 'warning')
            return
        }
        setSavingUser(true)
        try {
            const res1 = await noAuthFetch<{ userId: string; presets: Preset[] }>(`/random-opening/users/${encodeURIComponent(uid)}/presets`)
            if (res1.code === 0 && res1.data) setUserPresets(res1.data.presets || [])

            const res2 = await noAuthFetch<{ userId: string; selection: Selection }>(`/random-opening/users/${encodeURIComponent(uid)}/selection`)
            if (res2.code === 0 && res2.data) setUserSelectionState(res2.data.selection || {})
        } catch {
            showToast('获取用户数据失败', 'error')
        } finally {
            setSavingUser(false)
        }
    }, [userId])

    const saveUserPresets = useCallback(async () => {
        const uid = userId.trim()
        if (!uid) {
            showToast('请输入 userId', 'warning')
            return
        }
        setSavingUser(true)
        try {
            const cleaned = userPresets.map((p) => ({
                ...p,
                id: String(p.id || newId()),
                name: normalizeName(p.name),
                presetJson: String(p.presetJson || ''),
                updatedAt: Date.now(),
                createdAt: p.createdAt ?? Date.now(),
            }))
            await noAuthFetch(`/random-opening/users/${encodeURIComponent(uid)}/presets`, {
                method: 'POST',
                body: JSON.stringify({ presets: cleaned }),
            })
            setUserPresets(cleaned)
            showToast('已保存', 'success')
        } catch {
            showToast('保存失败', 'error')
        } finally {
            setSavingUser(false)
        }
    }, [userId, userPresets])

    const saveUserSelection = useCallback(async (scope: 'global' | 'personal', index: number) => {
        const uid = userId.trim()
        if (!uid) {
            showToast('请输入 userId', 'warning')
            return
        }
        setSavingUser(true)
        try {
            const res = await noAuthFetch<{ ok: boolean; message?: string }>(`/random-opening/users/${encodeURIComponent(uid)}/selection`, {
                method: 'POST',
                body: JSON.stringify({ scope, index }),
            })
            if (res.code !== 0) {
                showToast(res.message || '保存失败', 'error')
                return
            }
            const data = res.data
            if (data && data.ok === false) {
                showToast(data.message || '保存失败', 'error')
                return
            }
            setUserSelectionState({ scope, index })
            showToast('已保存', 'success')
        } catch {
            showToast('保存失败', 'error')
        } finally {
            setSavingUser(false)
        }
    }, [userId])

    const addUserPreset = () => {
        const now = Date.now()
        const p: Preset = { id: newId(), name: '新预设', presetJson: '', createdAt: now, updatedAt: now }
        setUserPresets(prev => [p, ...prev])
        setPresetOpen(prev => {
            const next = new Set(prev)
            next.add(p.id)
            return next
        })
    }

    const removeUserPreset = (idx: number) => {
        setUserPresets(prev => prev.filter((_, i) => i !== idx))
    }

    const updateUserPreset = (idx: number, patch: Partial<Preset>) => {
        setUserPresets(prev => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)))
    }

    const togglePresetOpen = (id: string) => {
        setPresetOpen(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    return (
        <div className="space-y-6">
            {/* 个人预设 & 选择状态 */}
            <div className="card p-5 hover-lift">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
                    <IconTerminal size={16} className="text-gray-400" />
                    个人预设与选择状态
                </h3>

                <div className="flex flex-col md:flex-row gap-3 items-start md:items-center">
                    <div className="flex-1 w-full">
                        <div className="text-xs text-gray-400 mb-2">userId（QQ号）</div>
                        <input
                            className="input-field"
                            placeholder="例如 123456"
                            value={userId}
                            onChange={(e) => setUserId(e.target.value)}
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <button className="btn btn-ghost text-xs" onClick={fetchUserData} disabled={savingUser}>
                            <IconRefresh size={13} />
                            读取
                        </button>
                        <button className="btn btn-ghost text-xs" onClick={addUserPreset} disabled={savingUser}>
                            新增预设
                        </button>
                        <button className="btn btn-primary text-xs" onClick={saveUserPresets} disabled={savingUser}>
                            <IconCheck size={13} />
                            保存预设
                        </button>
                    </div>
                </div>

                <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="card p-4">
                        <div className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-3">默认选择</div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <div className="text-xs text-gray-400 mb-2">scope</div>
                                <select
                                    className="input-field"
                                    value={userSelection.scope || ''}
                                    onChange={(e) => setUserSelectionState((prev) => ({ ...prev, scope: (e.target.value as any) }))}
                                >
                                    <option value="">未设置</option>
                                    <option value="global">全局</option>
                                    <option value="personal">个人</option>
                                </select>
                            </div>
                            <div>
                                <div className="text-xs text-gray-400 mb-2">index（从 1 开始）</div>
                                <input
                                    className="input-field"
                                    type="number"
                                    value={userSelection.index ?? ''}
                                    onChange={(e) => setUserSelectionState((prev) => ({ ...prev, index: e.target.value ? Number(e.target.value) : undefined }))}
                                />
                            </div>
                        </div>
                        <div className="mt-3">
                            <button
                                className="btn btn-primary text-xs"
                                disabled={savingUser || !userSelection.scope || !userSelection.index}
                                onClick={() => saveUserSelection(userSelection.scope as any, Number(userSelection.index))}
                            >
                                <IconCheck size={13} />
                                保存选择
                            </button>
                        </div>
                    </div>

                    <div className="card p-4">
                        <div className="text-sm font-medium text-gray-800 dark:text-gray-200">个人预设</div>
                        <div className="text-xs text-gray-400 mt-1">共 {userPresets.length} 条</div>
                    </div>
                </div>

                <div className="mt-4 space-y-3">
                    {userPresets.map((p, idx) => {
                        const open = presetOpen.has(p.id)
                        return (
                            <div key={p.id} className="card p-4">
                                <div className="flex items-start justify-between gap-3 flex-wrap">
                                    <div className="flex-1 min-w-[240px]">
                                        <div className="text-xs text-gray-400 mb-2">个人 {idx + 1}</div>
                                        <input
                                            className="input-field"
                                            value={p.name}
                                            onChange={(e) => updateUserPreset(idx, { name: e.target.value })}
                                            placeholder="备注名"
                                        />
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button className="btn btn-ghost text-xs" onClick={() => togglePresetOpen(p.id)}>
                                            {open ? '收起' : '展开'} JSON
                                        </button>
                                        <button className="btn btn-danger text-xs" onClick={() => removeUserPreset(idx)}>
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
                                            onChange={(e) => updateUserPreset(idx, { presetJson: e.target.value })}
                                            placeholder="粘贴预设 JSON"
                                        />
                                    </div>
                                )}
                            </div>
                        )
                    })}

                    {userId.trim() && userPresets.length === 0 && (
                        <div className="text-xs text-gray-400">无个人预设</div>
                    )}
                </div>
            </div>
        </div>
    )
}
