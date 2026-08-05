// Sheet ghi / sửa một lệnh cổ phiếu. Cùng khuôn ValuationFormSheet (nền mờ, sheet
// trượt từ dưới trên mobile, giữa màn trên desktop).
//
// Phí và thuế được TÍNH GỢI Ý rồi cho sửa: người dùng không nhớ chính xác phí của công
// ty chứng khoán, nhưng bỏ trống thì giá vốn thấp hơn thực tế và lãi trông đẹp hơn thật.
import { useMemo, useState } from 'react'
import { MoneyField } from '../../components/MoneyField'
import { SegmentedControl } from '../../components/ui'
import { confirmDialog } from '../../lib/dialog'
import {
  useCreateStockTrade,
  useDeleteStockTrade,
  useStockPrices,
  useUpdateStockTrade,
} from '../../hooks/queries'
import { toISODate } from '../../lib/dates'
import type { AccountRow, StockTradeKind, StockTradeRow } from '../../types/database.types'

/** Phí giao dịch phổ biến ở Việt Nam ~0,15% giá trị lệnh. */
const FEE_RATE = 0.0015
/** Thuế thu nhập khi BÁN: 0,1% giá trị lệnh. Mua không có thuế. */
const TAX_RATE = 0.001

const KINDS = [
  { value: 'buy' as const, label: 'Mua' },
  { value: 'sell' as const, label: 'Bán' },
  { value: 'adjust' as const, label: 'Điều chỉnh' },
]

interface Props {
  account: AccountRow
  /** null = ghi lệnh mới */
  trade: StockTradeRow | null
  onClose: () => void
}

export function TradeFormSheet({ account, trade, onClose }: Props) {
  const create = useCreateStockTrade()
  const update = useUpdateStockTrade()
  const remove = useDeleteStockTrade()
  const { data: prices = [] } = useStockPrices()

  const [kind, setKind] = useState<StockTradeKind>(trade?.kind ?? 'buy')
  const [symbol, setSymbol] = useState(trade?.symbol ?? '')
  const [tradedOn, setTradedOn] = useState(trade?.traded_on ?? toISODate(new Date()))
  const [quantity, setQuantity] = useState(trade?.quantity ?? 0)
  const [price, setPrice] = useState(trade?.price ?? 0)
  const [fee, setFee] = useState(trade?.fee ?? 0)
  const [tax, setTax] = useState(trade?.tax ?? 0)
  const [note, setNote] = useState(trade?.note ?? '')
  // Phí và thuế là hai gợi ý ĐỘC LẬP — sửa cái này không được khoá gợi ý của cái kia.
  // Với lệnh có sẵn: chỉ coi số đã lưu là "thật, đừng tính lại" khi nó CÓ Ý NGHĨA cho
  // kind gốc — 'adjust' luôn ép phí/thuế = 0 (không phải số người dùng từng chọn), và
  // 'buy' luôn ép thuế = 0. Coi những số 0 bị ép đó là "đã chạm" thì đổi kind xong sẽ
  // hiện lại đúng số 0 cũ thay vì gợi ý 0,15%/0,1% mới — sai với lý do có gợi ý.
  const [feeTouched, setFeeTouched] = useState(trade != null && trade.kind !== 'adjust')
  const [taxTouched, setTaxTouched] = useState(trade?.kind === 'sell')
  const [saving, setSaving] = useState(false)

  const currency = account.currency
  const isAdjust = kind === 'adjust'

  // Gợi ý tối đa 8 mã khi gõ — khớp cả mã và tên công ty.
  const suggestions = useMemo(() => {
    const q = symbol.trim().toUpperCase()
    if (q.length < 1 || prices.some((p) => p.symbol === q)) return []
    return prices
      .filter((p) => p.symbol.startsWith(q) || p.name.toUpperCase().includes(q))
      .slice(0, 8)
  }, [symbol, prices])

  // Phí/thuế gợi ý theo giá trị lệnh, tới khi người dùng tự sửa thì thôi.
  const grossValue = quantity * price
  const suggestedFee = isAdjust ? 0 : Math.round(grossValue * FEE_RATE)
  const suggestedTax = kind === 'sell' ? Math.round(grossValue * TAX_RATE) : 0
  const effFee = feeTouched ? fee : suggestedFee
  const effTax = taxTouched ? tax : suggestedTax

  const canSave =
    symbol.trim().length > 0 &&
    !saving &&
    (isAdjust ? quantity !== 0 : quantity > 0 && price > 0)

  async function handleSubmit() {
    if (!canSave) return
    setSaving(true)
    try {
      const payload = {
        symbol: symbol.trim().toUpperCase(),
        kind,
        traded_on: tradedOn,
        quantity,
        price: isAdjust ? 0 : price,
        fee: isAdjust ? 0 : effFee,
        // Thuế chỉ áp dụng cho Bán — ép về 0 cho Mua/Điều chỉnh dù ô thuế từng có số
        // (vd người dùng gõ thuế lúc đang chọn Bán rồi đổi ý sang Mua).
        tax: kind === 'sell' ? effTax : 0,
        note: note.trim(),
      }
      if (trade) await update.mutateAsync({ id: trade.id, patch: payload })
      else await create.mutateAsync({ account_id: account.id, ...payload })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!trade) return
    if (
      !(await confirmDialog({
        title: `Xoá lệnh ${trade.symbol} ngày ${trade.traded_on}?`,
        danger: true,
        confirmLabel: 'Xoá',
      }))
    )
      return
    setSaving(true)
    try {
      await remove.mutateAsync(trade.id)
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
          {trade ? 'Sửa lệnh' : 'Ghi lệnh'}
        </h2>
        <p className="mb-3 text-xs text-fg-muted">{account.name}</p>

        <div className="mb-3">
          <SegmentedControl items={KINDS} value={kind} onChange={setKind} label="Loại lệnh" />
        </div>

        {isAdjust && (
          <p className="mb-3 rounded-lg bg-surface-page px-2.5 py-2 text-2xs text-fg-muted">
            Dùng khi được thưởng cổ phiếu, nhận cổ tức bằng cổ phiếu, hoặc chia tách. Số cổ
            tăng mà không tốn tiền nên giá vốn trung bình tự giảm. Gộp cổ phiếu thì nhập số
            âm.
          </p>
        )}

        <label className="mb-1 block text-xs font-medium text-fg-muted">Mã cổ phiếu</label>
        <input
          value={symbol}
          onChange={(e) => setSymbol(e.target.value.toUpperCase())}
          placeholder="FPT"
          autoCapitalize="characters"
          className="mb-1 w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm font-semibold uppercase outline-green-500"
        />
        {suggestions.length > 0 && (
          <ul className="mb-3 max-h-40 overflow-y-auto rounded-lg border border-border-subtle">
            {suggestions.map((p) => (
              <li key={p.symbol}>
                <button
                  type="button"
                  onClick={() => setSymbol(p.symbol)}
                  className="flex w-full items-baseline justify-between gap-2 px-3 py-2 text-left text-xs hover:bg-surface-page"
                >
                  <b className="text-fg-primary">{p.symbol}</b>
                  <span className="truncate text-2xs text-fg-muted">{p.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <label className="mb-1 block text-xs font-medium text-fg-muted">Ngày</label>
        <input
          type="date"
          value={tradedOn}
          max={toISODate(new Date())}
          onChange={(e) => setTradedOn(e.target.value)}
          className="mb-3 w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm outline-green-500"
        />

        <label className="mb-1 block text-xs font-medium text-fg-muted">
          Số cổ {isAdjust && <span className="text-fg-muted">(âm = gộp cổ phiếu)</span>}
        </label>
        <input
          type="number"
          inputMode="numeric"
          value={quantity === 0 ? '' : quantity}
          onChange={(e) => setQuantity(Number(e.target.value) || 0)}
          className="mb-3 w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-right text-lg font-semibold outline-green-500"
        />

        {!isAdjust && (
          <>
            <label className="mb-1 block text-xs font-medium text-fg-muted">Giá mỗi cổ</label>
            <div className="mb-3">
              <MoneyField
                value={price}
                onChange={setPrice}
                currency={currency}
                ariaLabel="Giá mỗi cổ"
                className="w-full rounded-lg border border-border-strong px-3 py-2 text-right text-lg font-semibold outline-green-500"
              />
            </div>

            <div className="mb-1 flex items-baseline justify-between">
              <label className="text-xs font-medium text-fg-muted">Phí giao dịch</label>
              {!feeTouched && <span className="text-2xs text-fg-muted">gợi ý 0,15%</span>}
            </div>
            <div className="mb-3">
              <MoneyField
                value={effFee}
                onChange={(v) => {
                  setFeeTouched(true)
                  setFee(v)
                }}
                currency={currency}
                autoOpen={false}
                ariaLabel="Phí giao dịch"
                className="w-full rounded-lg border border-border-strong px-3 py-2 text-right outline-green-500"
              />
            </div>

            {kind === 'sell' && (
              <>
                <div className="mb-1 flex items-baseline justify-between">
                  <label className="text-xs font-medium text-fg-muted">Thuế bán</label>
                  {!taxTouched && <span className="text-2xs text-fg-muted">gợi ý 0,1%</span>}
                </div>
                <div className="mb-3">
                  <MoneyField
                    value={effTax}
                    onChange={(v) => {
                      setTaxTouched(true)
                      setTax(v)
                    }}
                    currency={currency}
                    autoOpen={false}
                    ariaLabel="Thuế bán"
                    className="w-full rounded-lg border border-border-strong px-3 py-2 text-right outline-green-500"
                  />
                </div>
              </>
            )}
          </>
        )}

        <label className="mb-1 block text-xs font-medium text-fg-muted">
          Ghi chú <span className="text-fg-muted">(không bắt buộc)</span>
        </label>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Ví dụ: cổ phiếu thưởng 10%"
          className="mb-3 w-full rounded-lg border border-border-strong px-3 py-2 text-sm outline-green-500"
        />

        <p className="mb-3 text-xs text-fg-muted">
          Lệnh không tạo giao dịch thu/chi và không đổi số dư — nó chỉ nói tiền trong tài
          khoản đang nằm ở cổ phiếu nào.
        </p>

        <div className="mt-1 flex items-center justify-end gap-2">
          {trade && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={saving}
              className="mr-auto rounded-lg px-3 py-2 text-sm text-money-out disabled:opacity-50"
            >
              Xoá
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm text-fg-muted hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSave}
            className="rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white active:scale-95 disabled:opacity-50"
          >
            {saving ? 'Đang lưu…' : 'Lưu'}
          </button>
        </div>
      </div>
    </div>
  )
}
