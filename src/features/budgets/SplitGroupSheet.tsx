// Màn chia trần nhóm xuống các mục con — SỬA ĐƯỢC từng dòng.
//
// Trước đây chỗ này là một hộp thoại xác nhận: app in ra sáu con số nó tự tính rồi hỏi
// "Chia / Để nguyên". Nhìn thấy nhưng không đụng vào được, nên muốn Bữa trưa nhiều hơn
// một chút là phải bấm Chia, đóng, rồi mở lại từng mục con để sửa tay.
//
// Tổng KHÔNG bị ép bằng trần cha: luật của cột hạn mức là cha = tổng con (xem
// `useSyncedBudget`), nên gõ thành ¥45.000 thì trần cha thành ¥45.000. Chặn lại mới là
// trái luật. Việc của màn này là NÓI TRƯỚC hệ quả đó, không phải cấm.
import { useState } from 'react'
import { MoneyField, MONEY_FIELD_CLASS } from '../../components/MoneyField'
import { Money, SectionTitle, actionButtonClass } from '../../components/ui'
import { useEscClose } from '../../hooks/useEscClose'
import type { CurrencyCode } from '../../lib/money'
import { splitByAverage, splitEvenly, type SplitChild, type SplitPart } from './capSplit'

export interface SplitRow {
  categoryId: string
  /** biểu tượng + tên, đã ghép sẵn */
  label: string
  /** số mở sẵn trong ô */
  amount: number
  /** TB 6 tháng; 0 = chưa có lịch sử nên không bày nút gợi ý */
  average: number
}

export interface SplitGroupSheetProps {
  parentLabel: string
  /** Trần cha ĐANG LƯU — mốc để so tổng, không phải giới hạn cứng. */
  cap: number
  base: CurrencyCode
  rows: SplitRow[]
  onSave: (parts: SplitPart[]) => Promise<void> | void
  onClose: () => void
}

export function SplitGroupSheet({
  parentLabel,
  cap,
  base,
  rows,
  onSave,
  onClose,
}: SplitGroupSheetProps) {
  useEscClose(onClose)
  const [amounts, setAmounts] = useState<Record<string, number>>(() =>
    Object.fromEntries(rows.map((r) => [r.categoryId, r.amount])),
  )
  const [saving, setSaving] = useState(false)

  const total = rows.reduce((s, r) => s + (amounts[r.categoryId] ?? 0), 0)
  const parts = (): SplitPart[] =>
    rows.map((r) => ({ categoryId: r.categoryId, amount: amounts[r.categoryId] ?? 0 }))
  const fill = (next: SplitPart[]) =>
    setAmounts(Object.fromEntries(next.map((p) => [p.categoryId, p.amount])))
  const asChildren = (): SplitChild[] =>
    rows.map((r) => ({ categoryId: r.categoryId, limit: null, average: r.average }))

  async function handleSave() {
    setSaving(true)
    try {
      await onSave(parts())
    } catch {
      // Toast lỗi toàn cục đã nói. Giữ màn mở để số đang gõ không bay mất.
      setSaving(false)
      return
    }
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 lg:items-center animate-overlay-in"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-surface-page p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:rounded-2xl animate-sheet-in lg:animate-sheet-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <SectionTitle role="block">Chia trần nhóm: {parentLabel}</SectionTitle>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-md px-3 py-1.5 text-sm text-fg-muted hover:bg-surface-sunken"
          >
            Đóng
          </button>
        </div>

        <ul className="flex flex-col gap-2">
          {rows.map((r) => (
            <li key={r.categoryId} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm text-fg-primary">{r.label}</span>
              {/* Số TB bấm được: đỡ phải gõ lại con số app vừa in ra ngay cạnh. */}
              {r.average > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    setAmounts((a) => ({ ...a, [r.categoryId]: r.average }))
                  }
                  className="shrink-0 rounded-md px-2 py-1 text-2xs text-fg-muted hover:bg-surface-sunken"
                >
                  TB <Money amount={r.average} currency={base} className="!text-2xs" />
                </button>
              )}
              {/* Bề rộng đặt ở KHUNG NGOÀI, không truyền qua `className`: class đó rơi
                  vào ô bên trong, mà ô đó đã `w-full` — nên `w-32` truyền vào chỉ làm ô
                  rộng 100% của một khung tự co, đo được 48px trên mobile. */}
              <span className="w-32 shrink-0">
                {/* autoOpen tắt: sáu ô cùng đòi mở bàn phím số thì chúng đá nhau, và màn
                    vừa hiện đã bị bàn phím che mất một nửa. */}
                <MoneyField
                  value={amounts[r.categoryId] ?? 0}
                  onChange={(v) => setAmounts((a) => ({ ...a, [r.categoryId]: v }))}
                  currency={base}
                  autoOpen={false}
                  ariaLabel={`Hạn mức ${r.label}`}
                  className={MONEY_FIELD_CLASS}
                />
              </span>
            </li>
          ))}
        </ul>

        {/* Hệ quả của con số đang gõ, nói ngay tại chỗ gõ. */}
        <p className="mt-3 text-sm text-fg-secondary">
          Tổng <Money amount={total} currency={base} className="font-semibold" />
          {total === cap ? (
            <span className="text-fg-muted"> — khớp trần {parentLabel}</span>
          ) : (
            <span className="text-fg-muted">
              {' '}
              — trần {parentLabel} sẽ thành <Money amount={total} currency={base} /> (đang{' '}
              <Money amount={cap} currency={base} />)
            </span>
          )}
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => fill(splitEvenly(cap, rows.map((r) => r.categoryId)))}
            className={actionButtonClass()}
          >
            Chia đều
          </button>
          <button
            type="button"
            onClick={() => fill(splitByAverage(cap, asChildren()))}
            className={actionButtonClass()}
          >
            Theo TB 6 tháng
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className={actionButtonClass('primary', 'flex-1')}
          >
            Lưu
          </button>
        </div>
      </div>
    </div>
  )
}
