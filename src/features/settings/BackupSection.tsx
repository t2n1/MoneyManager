import { useRef, useState } from 'react'
import { Guide } from '../../components/Guide'
import { useQueryClient } from '@tanstack/react-query'
import { Download, Upload } from 'lucide-react'
import { BACKUP_VERSION, repo, type BackupData } from '../../data'
import { confirmDialog } from '../../lib/dialog'

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
      !(await confirmDialog({
        title: 'Khôi phục & GHI ĐÈ dữ liệu?',
        message: 'Toàn bộ dữ liệu hiện tại sẽ bị thay bằng dữ liệu trong file.',
        danger: true,
        confirmLabel: 'Khôi phục',
      }))
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
    <section className="overflow-hidden rounded-xl bg-surface shadow-sm ">
      <h2 className="px-3 pt-3 text-sm font-semibold text-fg-muted">
        Sao lưu &amp; khôi phục
      </h2>
      <Guide className="px-3 pt-1 text-xs text-fg-muted">
        Xuất toàn bộ dữ liệu ra một file JSON để cất giữ, hoặc nhập lại từ file đã lưu.
      </Guide>
      <div className="flex flex-wrap gap-2 p-3">
        <button
          type="button"
          disabled={busy}
          onClick={handleExport}
          className="flex items-center gap-2 rounded-lg border border-border-strong px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          <Download className="h-4 w-4" />
          Xuất dữ liệu
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-2 rounded-lg border border-border-strong px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          <Upload className="h-4 w-4" />
          Khôi phục
        </button>
        {/* Ô ẩn, chỉ mở qua nút "Khôi phục" — vẫn cần tên: `class="hidden"` không lấy nó
            ra khỏi cây trợ năng ở mọi trình đọc, và khi hộp thoại chọn file bật lên thì
            đây là control đang được nhắm tới. */}
        <input
          ref={fileRef}
          aria-label="Chọn file sao lưu để khôi phục"
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
              : 'text-money-out'
          }`}
        >
          {status.message}
        </p>
      )}
    </section>
  )
}
