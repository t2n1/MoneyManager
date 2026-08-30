import { useId, useMemo, useState } from 'react'
import { Guide } from '../../components/Guide'
import { useStockTrades, useUpsertValuation } from '../../hooks/queries'
import { toISODate } from '../../lib/dates'
import { CURRENCIES, type CurrencyCode } from '../../lib/money'
import { MoneyField } from '../../components/MoneyField'
import { DateField } from '../../components/DateField'
import type { AccountRow } from '../../types/database.types'
import { useEscClose } from '../../hooks/useEscClose'
import { SectionTitle, actionButtonClass } from '../../components/ui'

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
  useEscClose(onClose)
  const uid = useId()
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
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 lg:items-center animate-overlay-in"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:rounded-2xl animate-sheet-in lg:animate-sheet-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <SectionTitle role="block" className="mb-1">
          Cập nhật giá trị
        </SectionTitle>
        <p className="mb-3 text-sm text-fg-muted">
          {account.name} · giá trị thị trường hiện tại ({CURRENCIES[currency].label})
        </p>

        {/* <span>: MoneyField có hai ô (chạm/desktop), tên đến từ `ariaLabel`. */}
        <span className="mb-1 block text-sm font-medium text-fg-muted">
          Giá trị hiện tại
        </span>
        <div className="mb-3">
          <MoneyField
            value={marketValue}
            onChange={setMarketValue}
            currency={currency}
            ariaLabel="Giá trị hiện tại"
            onEnter={handleSubmit}
            className="w-full rounded-lg border border-border-strong px-3 py-2 text-right text-lg font-semibold"
          />
        </div>

        {/* <span> chứ không <label>: ô ngày là <button>, tên đi qua ariaLabel. */}
        <span className="mb-1 block text-sm font-medium text-fg-muted">Ngày</span>
        <DateField
          ariaLabel="Ngày"
          value={valuedOn}
          max={toISODate(new Date())}
          onChange={setValuedOn}
          className="mb-3 w-full px-3 py-2"
        />

        <label htmlFor={`${uid}-note`} className="mb-1 block text-sm font-medium text-fg-muted">
          Ghi chú <span className="text-fg-muted">(không bắt buộc)</span>
        </label>
        <input
          id={`${uid}-note`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Ví dụ: theo giá đóng cửa"
          className="mb-1 w-full rounded-md border border-border-strong px-3 py-2 text-sm"
        />
        <Guide className="mb-3 text-sm text-fg-muted">
          Chỉ ghi nhận giá trị — không tạo giao dịch, không đổi báo cáo thu/chi. Chênh lệch
          so với vốn gốc là lãi/lỗ chưa thực hiện.
        </Guide>

        {/* Vế "số này chỉ giữ cho hôm nay" đứng ngoài <Guide>: hôm sau con số tự đổi lại,
            mà Gọn là mặc định — ẩn đi thì người dùng thấy app ghi đè số mình vừa gõ và
            không có cách nào biết đó là đúng ý. Cơ chế phía sau (tự tính mỗi chiều theo sổ
            lệnh) mới là chữ dạy. */}
        {tuDongChay && (
          <p className="mb-3 text-sm text-fg-muted">
            Số bạn gõ ở đây chỉ giữ cho đúng ngày này — từ những ngày sau app tự tính lại.
            <Guide as="span"> Tài khoản này đang tự tính giá trị mỗi chiều theo sổ lệnh.</Guide>
          </p>
        )}

        <div className="mt-1 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-md px-3 py-2 text-sm text-fg-muted hover:bg-surface-sunken"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSave}
            className={actionButtonClass('primary')}
          >
            {saving ? 'Đang lưu…' : 'Lưu'}
          </button>
        </div>
      </div>
    </div>
  )
}
