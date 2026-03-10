import { useCallback, useMemo, useState } from 'react'
import { noAuthFetch } from '../utils/api'
import { showToast } from '../hooks/useToast'
import { IconCheck, IconDownload, IconRefresh, IconTerminal, IconX } from '../components/icons'

type BackupPayload = {
    version: 1
    exportedAt: number
    config: any
    dataFiles: {
        userPresetsFile: any
        userSelectionFile: any
    }
}

type ExportResp = { version: 1; exportedAt: number; config: any; dataFiles: any }

type ImportResp = { ok: boolean; applied?: { config: boolean; userPresets: boolean; userSelection: boolean } }

function safeJsonStringify(v: unknown): string {
    return JSON.stringify(v, null, 2)
}

function safeJsonParse(text: string): { ok: true; value: any } | { ok: false; message: string } {
    try {
        const v = JSON.parse(text)
        return { ok: true, value: v }
    } catch (e: any) {
        return { ok: false, message: e?.message || 'JSON 解析失败' }
    }
}

export default function BackupPage() {
    const [loadingExport, setLoadingExport] = useState(false)
    const [loadingImport, setLoadingImport] = useState(false)

    const [backupText, setBackupText] = useState('')
    const [applyConfig, setApplyConfig] = useState(true)
    const [applyData, setApplyData] = useState(true)

    const parsed = useMemo(() => {
        const t = backupText.trim()
        if (!t) return { ok: false as const, message: '请输入备份 JSON' }
        const r = safeJsonParse(t)
        if (!r.ok) return r
        return { ok: true as const, value: r.value as BackupPayload }
    }, [backupText])

    const doExport = useCallback(async () => {
        setLoadingExport(true)
        try {
            const res = await noAuthFetch<ExportResp>('/backup/export')
            if (res.code !== 0 || !res.data) {
                showToast(res.message || '导出失败', 'error')
                return
            }
            setBackupText(safeJsonStringify(res.data))
            showToast('已导出到文本框', 'success')
        } catch {
            showToast('导出失败', 'error')
        } finally {
            setLoadingExport(false)
        }
    }, [])

    const download = useCallback(() => {
        const t = backupText.trim()
        if (!t) {
            showToast('没有可下载的内容', 'warning')
            return
        }
        const blob = new Blob([t], { type: 'application/json;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        const ts = new Date().toISOString().replace(/[:.]/g, '-')
        a.href = url
        a.download = `astral-party-random.backup.${ts}.json`
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)
    }, [backupText])

    const doImport = useCallback(async () => {
        if (!parsed.ok) {
            showToast(parsed.message || '备份 JSON 无效', 'warning')
            return
        }
        const payload = parsed.value
        if (!payload || payload.version !== 1) {
            showToast('不支持的备份版本', 'warning')
            return
        }

        setLoadingImport(true)
        try {
            const res = await noAuthFetch<ImportResp>('/backup/import', {
                method: 'POST',
                body: JSON.stringify({ payload, applyConfig, applyData }),
            })
            if (res.code !== 0) {
                showToast(res.message || '导入失败', 'error')
                return
            }
            showToast('已导入（请重开页面刷新数据）', 'success')
        } catch {
            showToast('导入失败', 'error')
        } finally {
            setLoadingImport(false)
        }
    }, [parsed, applyConfig, applyData])

    const clear = () => setBackupText('')

    return (
        <div className="space-y-6">
            <div className="card p-5 hover-lift">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-2">
                    <IconTerminal size={16} className="text-gray-400" />
                    备份导出 / 导入
                </h3>
                <div className="text-xs text-gray-400 leading-relaxed">
                    用于在更新/迁移前手动备份与恢复：插件配置（含全局预设/群开关）以及个人预设与默认选择（dataPath）。
                </div>

                <div className="mt-4 flex items-center gap-2 flex-wrap">
                    <button className="btn btn-ghost text-xs" onClick={doExport} disabled={loadingExport || loadingImport}>
                        <IconRefresh size={13} />
                        导出到文本框
                    </button>
                    <button className="btn btn-ghost text-xs" onClick={download} disabled={!backupText.trim()}>
                        <IconDownload size={13} />
                        下载 JSON
                    </button>
                    <button className="btn btn-ghost text-xs" onClick={clear} disabled={!backupText.trim()}>
                        <IconX size={13} />
                        清空
                    </button>
                    <button
                        className="btn btn-primary text-xs"
                        onClick={doImport}
                        disabled={loadingExport || loadingImport || !backupText.trim()}
                        title={parsed.ok ? '' : parsed.message}
                    >
                        <IconCheck size={13} />
                        导入（覆盖写入）
                    </button>
                </div>

                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                    <label className="card p-4 flex items-start gap-3 cursor-pointer">
                        <input
                            type="checkbox"
                            className="mt-1"
                            checked={applyConfig}
                            onChange={(e) => setApplyConfig(e.target.checked)}
                        />
                        <div>
                            <div className="text-sm font-medium text-gray-800 dark:text-gray-200">导入配置</div>
                            <div className="text-xs text-gray-400 mt-1">覆盖插件配置（含全局预设、群启用、基础参数）</div>
                        </div>
                    </label>
                    <label className="card p-4 flex items-start gap-3 cursor-pointer">
                        <input
                            type="checkbox"
                            className="mt-1"
                            checked={applyData}
                            onChange={(e) => setApplyData(e.target.checked)}
                        />
                        <div>
                            <div className="text-sm font-medium text-gray-800 dark:text-gray-200">导入数据</div>
                            <div className="text-xs text-gray-400 mt-1">覆盖个人预设与默认选择（dataPath 下的 JSON 文件）</div>
                        </div>
                    </label>
                </div>
            </div>

            <div className="card p-5 hover-lift">
                <div className="text-xs text-gray-400 mb-2">备份 JSON</div>
                <textarea
                    className="input-field font-mono text-[12px] leading-relaxed min-h-[360px]"
                    placeholder="点击“导出到文本框”，或把之前下载的备份 JSON 粘贴到这里"
                    value={backupText}
                    onChange={(e) => setBackupText(e.target.value)}
                />
                <div className="mt-2 text-[11px] text-gray-400">
                    {parsed.ok ? 'JSON 可解析' : ('JSON 无效: ' + parsed.message)}
                </div>
            </div>
        </div>
    )
}
