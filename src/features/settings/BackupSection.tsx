import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Download, Upload } from 'lucide-react'
import { BACKUP_VERSION, repo, type BackupData } from '../../data'

type Status = { kind: 'idle' | 'ok' | 'error'; message: string }

/** Kiểm tra sơ bộ file nhập có đúng định dạng backup không. */
function isBackup(x: unknown): x is BackupData {
  if (!x || typeof x !== 'object') return false
  const d = x as Record<string, unknown>
  return typeof d.version === 'number' && !!d.profile && Array.isArray(d.accounts)
}

export function BackupSection() {
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<Status>({ kind: 'idle', message: '' })

  async function handleExport() {
    setBusy(true)
    setStatus({ kind: 'idle', message: '' })
    try {
      const data = await repo.exportAll()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `so-chi-tieu-backup-${data.exported_at.slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      const count =
        data.accounts.length + data.categories.length + data.transactions.length
      setStatus({ kind: 'ok', message: `Đã xuất ${count} bản ghi chính.` })
    } catch (e) {
      setStatus({ kind: 'error', message: `Xuất lỗi: ${(e as Error).message}` })
    } finally {
      setBusy(false)
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // cho phép chọn lại cùng file
    if (!file) return
    setStatus({ kind: 'idle', message: '' })
    let parsed: unknown
    try {
      parsed = JSON.parse(await file.text())
    } catch {
      setStatus({ kind: 'error', message: 'File không phải JSON hợp lệ.' })
      return
    }
    if (!isBackup(parsed)) {
      setStatus({ kind: 'error', message: 'File không đúng định dạng sao lưu.' })
      return
    }
    if (parsed.version > BACKUP_VERSION) {
      setStatus({
        kind: 'error',
        message: `File tạo từ phiên bản mới hơn (v${parsed.version}). Hãy cập nhật app.`,
      })
      return
    }
    if (
      !window.confirm(
        'Khôi phục sẽ GHI ĐÈ toàn bộ dữ liệu hiện tại bằng dữ liệu trong file. Tiếp tục?',
      )
    )
      return
    setBusy(true)
    try {
      await repo.importAll(parsed)
      qc.clear()
      setStatus({ kind: 'ok', message: 'Đã khôi phục xong. Đang tải lại…' })
      setTimeout(() => window.location.reload(), 600)
    } catch (err) {
      setStatus({ kind: 'error', message: `Khôi phục lỗi: ${(err as Error).message}` })
      setBusy(false)
    }
  }

  return (
    <section className="overflow-hidden rounded-xl bg-white shadow-sm dark:bg-gray-900">
      <h2 className="px-3 pt-3 text-sm font-semibold text-gray-500 dark:text-gray-400">
        Sao lưu &amp; khôi phục
      </h2>
      <p className="px-3 pt-1 text-xs text-gray-400 dark:text-gray-500">
        Xuất toàn bộ dữ liệu ra một file JSON để cất giữ, hoặc nhập lại từ file đã lưu.
      </p>
      <div className="flex flex-wrap gap-2 p-3">
        <button
          type="button"
          disabled={busy}
          onClick={handleExport}
          className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          <Download className="h-4 w-4" />
          Xuất dữ liệu
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          <Upload className="h-4 w-4" />
          Khôi phục
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={handleFile}
        />
      </div>
      {status.kind !== 'idle' && (
        <p
          className={`px-3 pb-3 text-xs ${
            status.kind === 'ok'
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-red-600 dark:text-red-400'
          }`}
        >
          {status.message}
        </p>
      )}
    </section>
  )
}
