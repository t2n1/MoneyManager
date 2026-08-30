// Sao lưu & khôi phục — thẻ "CẤT GIỮ" của trang Dữ liệu.
//
// Bản trước chỉ có hai cái nút. Câu người ta mở trang này để hỏi — "tôi có đang được sao
// lưu không?" — không có chỗ nào trả lời, nên hai cái nút đứng đó mà không ai biết đã bấm
// lần cuối bao giờ. Nay dòng đầu thẻ trả lời trước, nút đứng sau.
//
// Lời rào "trên máy này" nằm TRONG chính câu trạng thái, không phải một dòng giải thích
// bên dưới: mốc ở localStorage (xem lastBackup.ts) nên xuất ở máy khác thì máy này vẫn
// ghi "chưa sao lưu". Tách lời rào ra một dòng riêng là có ngày nó bị ẩn (chế độ Gọn,
// màn hẹp) và câu còn lại thành một lời khẳng định sai.
import { useRef, useState } from 'react'
import { Guide } from '../../components/Guide'
import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Check, Download, Upload } from 'lucide-react'
import { BACKUP_VERSION, repo, type BackupData } from '../../data'
import { confirmDialog } from '../../lib/dialog'
import { ageLabel } from '../../lib/freshness'
import { ActionButton, Card, SectionTitle } from '../../components/ui'
import { BACKUP_STALE_DAYS, readLastBackup, writeLastBackup } from './lastBackup'

type Status = { kind: 'idle' | 'ok' | 'error'; message: string }

const DAY = 86_400_000

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
  const [lastBackup, setLastBackup] = useState(readLastBackup)

  const ageMs = lastBackup ? Date.now() - Date.parse(lastBackup) : null
  const stale = ageMs === null || ageMs > BACKUP_STALE_DAYS * DAY

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
      // Ghi mốc bằng `exported_at` của chính bản dump, không phải `Date.now()` ở đây:
      // hai cái lệch nhau đúng thời gian gói file, mà tên file cũng lấy từ nó — mốc và
      // tên file phải nói cùng một ngày.
      writeLastBackup(data.exported_at)
      setLastBackup(data.exported_at)
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
    <Card as="section" elevation="panel" padding="none" className="overflow-hidden">
      <SectionTitle
        role="micro"
        className="border-b border-border-panel bg-surface-chrome px-3 py-2.5"
      >
        Cất giữ
      </SectionTitle>

      <div className="flex flex-col gap-3 p-3">
        {/* Trạng thái đứng TRƯỚC hai cái nút: nó là câu trả lời, nút là việc làm sau đó. */}
        <div
          className={`rounded-md border p-2.5 ${
            stale
              ? 'border-state-warn-border bg-state-warn-bg'
              : 'border-state-good-border bg-state-good-bg'
          }`}
        >
          <p
            className={`flex items-center gap-1.5 text-sm font-medium ${
              stale ? 'text-state-warn-fg' : 'text-state-good-fg'
            }`}
          >
            {stale ? (
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
            ) : (
              <Check className="h-4 w-4 shrink-0" aria-hidden />
            )}
            {ageMs === null
              ? 'Chưa sao lưu trên máy này'
              : `Sao lưu ${ageLabel(ageMs)} · trên máy này`}
          </p>
        </div>

        <Guide className="text-2xs leading-snug text-fg-muted">
          Xuất toàn bộ dữ liệu ra một file JSON để cất giữ, hoặc nhập lại từ file đã lưu.
          Khôi phục sẽ GHI ĐÈ mọi thứ đang có.
        </Guide>

        {/* Xếp dọc chứ không cạnh nhau: thẻ này nằm trong một cột của lưới ba cột, ở
            1024px cột đó chỉ còn ~230px — hai nút cạnh nhau là hai nút chữ xuống dòng. */}
        <div className="flex flex-col gap-1.5">
          <ActionButton variant="primary" disabled={busy} onClick={handleExport}>
            <Download className="h-4 w-4" />
            Xuất file sao lưu
          </ActionButton>
          <ActionButton disabled={busy} onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4" />
            Khôi phục từ file
          </ActionButton>
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
          // Token trạng thái chứ `text-emerald-600 dark:text-emerald-400` viết tay: bảng
          // màu đó là thang cũ, và nó không đi cùng bậc với hai khối state-* ngay trên.
          <p
            className={`text-sm ${
              status.kind === 'ok' ? 'text-state-good-fg' : 'text-money-out'
            }`}
          >
            {status.message}
          </p>
        )}
      </div>
    </Card>
  )
}
