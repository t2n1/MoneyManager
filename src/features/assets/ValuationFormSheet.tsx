import { useMemo, useState } from 'react'
import { useStockTrades, useUpsertValuation } from '../../hooks/queries'
import { toISODate } from '../../lib/dates'
import { CURRENCIES, type CurrencyCode } from '../../lib/money'
import { MoneyField } from '../../components/MoneyField'
import type { AccountRow } from '../../types/database.types'

interface Props {
  account: AccountRow
  /** Giá trị thị trường hiện có (minor units) để điền sẵn; null/undefined = chưa cập nhật */
  currentValue?: number | null
  onClose: () => void
}

/**
 * Sheet "Cập nhật giá trị" cho tài khoản đầu tư (mục AE). Lưu một snapshot giá trị
 * thị trường (minor units theo currency tài khoản) tại một ngày. Upsert theo
 * (account_id, valued_on): cập nhật lại cùng ngày sẽ đè giá trị cũ.
 */
export function ValuationFormSheet({ account, currentValue, onClose }: Props) {
  const upsert = useUpsertValuation()
  const currency = account.currency as CurrencyCode

  // Tự động chạy hay không: khớp đúng điều kiện cron stock-refresh dùng (loadInput.ts)
  // — investment + VND + có ít nhất một dòng sổ lệnh. Không có nút bật/tắt riêng.
  const { data: allTrades = [] } = useStockTrades()
  const tuDongChay = useMemo(
    () =>
      account.type === 'investment' &&
      currency === 'VND' &&
      allTrades.some((t) => t.account_id === account.id),
    [account.type, account.id, currency, allTrades],
  )

  const [marketValue, setMarketValue] = useState(currentValue ?? 0)
  const [valuedOn, setValuedOn] = useState(toISODate(new Date()))
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const canSave = marketValue > 0 && !saving

  async function handleSubmit() {
    if (!canSave) return
    setSaving(true)
    try {
      await upsert.mutateAsync({
        account_id: account.id,
        valued_on: valuedOn,
        market_value: marketValue,
        note: note.trim(),
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 lg:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-base font-bold text-fg-primary">
          Cập nhật giá trị
        </h2>
        <p className="mb-3 text-xs text-fg-muted">
          {account.name} · giá trị thị trường hiện tại ({CURRENCIES[currency].label})
        </p>

        <label className="mb-1 block text-xs font-medium text-fg-muted">
          Giá trị hiện tại
        </label>
        <div className="mb-3">
          <MoneyField
            value={marketValue}
            onChange={setMarketValue}
            currency={currency}
            ariaLabel="Giá trị hiện tại"
            onEnter={handleSubmit}
            className="w-full rounded-lg border border-border-strong px-3 py-2 text-right text-lg font-semibold outline-green-500"
          />
        </div>

        <label className="mb-1 block text-xs font-medium text-fg-muted">Ngày</label>
        <input
          type="date"
          value={valuedOn}
          max={toISODate(new Date())}
          onChange={(e) => setValuedOn(e.target.value)}
          className="mb-3 w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm outline-green-500"
        />

        <label className="mb-1 block text-xs font-medium text-fg-muted">
          Ghi chú <span className="text-fg-muted">(không bắt buộc)</span>
        </label>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Ví dụ: theo giá đóng cửa"
          className="mb-1 w-full rounded-lg border border-border-strong px-3 py-2 text-sm outline-green-500"
        />
        <p className="mb-3 text-xs text-fg-muted">
          Chỉ ghi nhận giá trị — không tạo giao dịch, không đổi báo cáo thu/chi. Chênh lệch
          so với vốn gốc là lãi/lỗ chưa thực hiện.
        </p>

        {tuDongChay && (
          <p className="mb-3 text-xs text-fg-muted">
            Tài khoản này đang tự tính giá trị mỗi chiều theo sổ lệnh. Số bạn gõ ở đây sẽ
            được giữ nguyên cho đúng ngày này — app tự tính lại bình thường từ những ngày
            sau.
          </p>
        )}

        <div className="mt-1 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-lg px-3 py-2 text-sm text-fg-muted hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSave}
            className="min-h-11 rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white active:scale-95 disabled:opacity-50"
          >
            {saving ? 'Đang lưu…' : 'Lưu'}
          </button>
        </div>
      </div>
    </div>
  )
}
