// Gán người nhận cho các lần gửi cũ. Hiện GHI CHÚ nguyên văn ("gửi mẹ") để người dùng gán
// nhanh — KHÔNG tự khớp tên bằng máy: đoán sai một người là khấu trừ đi nhầm người.
import { useMemo, useState } from 'react'
import { ActionButton, Money, SectionTitle, Select } from '../../components/ui'
import { useEscClose } from '../../hooks/useEscClose'
import { useAccounts, useUpdateTransaction } from '../../hooks/queries'
import { formatDateLabel } from '../../lib/dates'
import { showToast } from '../../lib/dialog'
import type { RelativeRow, TransactionRow } from '../../types/database.types'

interface Props {
  /** Lần gửi CHƯA gán (is_remittance, remit_recipient_id null) của năm đang xem. */
  txs: TransactionRow[]
  relatives: RelativeRow[]
  onClose: () => void
}

export function GanNguoiNhanSheet({ txs, relatives, onClose }: Props) {
  useEscClose(onClose)
  const update = useUpdateTransaction()
  const { data: accounts = [] } = useAccounts()
  const currencyOf = useMemo(() => new Map(accounts.map((a) => [a.id, a.currency])), [accounts])
  const [chon, setChon] = useState<Set<string>>(() => new Set(txs.map((t) => t.id)))
  const [nguoi, setNguoi] = useState(relatives[0]?.id ?? '')
  const [saving, setSaving] = useState(false)

  // Giao với `txs` MỖI LẦN render: mỗi lần gán xong một dòng, invalidate ['transactions']
  // làm cha tính lại danh sách chưa gán, `txs` co lại — nhưng `chon` (seed một lần lúc mở
  // sheet) vẫn còn id cũ. Không giao thì nút hiện số sai và bấm lại gửi luôn id đã gán rồi.
  const chonHienTai = useMemo(() => txs.filter((t) => chon.has(t.id)).map((t) => t.id), [txs, chon])

  function toggle(id: string) {
    setChon((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  async function handleSave() {
    if (!nguoi || chonHienTai.length === 0) return
    setSaving(true)
    let daXong = 0
    try {
      for (const id of chonHienTai) {
        await update.mutateAsync({ id, patch: { remit_recipient_id: nguoi } })
        daXong++
        // Bỏ khỏi `chon` NGAY sau khi ghi xong: nếu một id sau đó lỗi, bấm lại chỉ gửi
        // những dòng CÒN LẠI — không gửi lại những dòng đã ghi thành công.
        setChon((s) => {
          const n = new Set(s)
          n.delete(id)
          return n
        })
      }
      showToast(`Đã gán ${daXong} lần gửi`)
      onClose()
    } catch {
      showToast(`Đã gán ${daXong} lần, lỗi ở lần còn lại — thử lại.`, 'error')
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 lg:items-center animate-overlay-in"
      onClick={onClose}
    >
      <div
        className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:rounded-2xl animate-sheet-in lg:animate-sheet-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <SectionTitle role="block" className="mb-3">Gán người nhận</SectionTitle>

        <label className="mb-1 block text-sm font-medium text-fg-muted" htmlFor="gan-nguoi">Gửi cho</label>
        <Select id="gan-nguoi" value={nguoi} onChange={(e) => setNguoi(e.target.value)} wrapClassName="w-full">
          {relatives.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </Select>

        <ul className="mt-3 divide-y divide-border-subtle">
          {txs.map((t) => (
            <li key={t.id}>
              <label className="flex items-center gap-3 py-2">
                <input type="checkbox" checked={chon.has(t.id)} onChange={() => toggle(t.id)} className="h-4 w-4" />
                <span className="w-24 shrink-0 font-mono text-sm text-fg-muted">{formatDateLabel(t.occurred_on)}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-fg-secondary">{t.note || '(không ghi chú)'}</span>
                <Money amount={t.amount - (t.remit_fee_jpy ?? 0)} currency={currencyOf.get(t.account_id) ?? 'JPY'} />
              </label>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex justify-end gap-2">
          <ActionButton variant="outline" onClick={onClose}>Đóng</ActionButton>
          <ActionButton variant="primary" onClick={handleSave} disabled={!nguoi || chonHienTai.length === 0 || saving}>
            Gán {chonHienTai.length} lần
          </ActionButton>
        </div>
      </div>
    </div>
  )
}
