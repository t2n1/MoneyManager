// Sheet ghi / sửa một lệnh cổ phiếu. Cùng khuôn ValuationFormSheet (nền mờ, sheet
// trượt từ dưới trên mobile, giữa màn trên desktop).
//
// Phí và thuế được TÍNH GỢI Ý rồi cho sửa: người dùng không nhớ chính xác phí của công
// ty chứng khoán, nhưng bỏ trống thì giá vốn thấp hơn thực tế và lãi trông đẹp hơn thật.
import { useId, useMemo, useState } from 'react'
import { Guide } from '../../components/Guide'
import { MoneyField } from '../../components/MoneyField'
import { DateField } from '../../components/DateField'
import { SegmentedControl } from '../../components/ui'
import { confirmDialog } from '../../lib/dialog'
import { useCreateStockTrade, useDeleteStockTrade, useUpdateStockTrade } from '../../hooks/queries'
import { toISODate } from '../../lib/dates'
import { parseSignedIntText, sanitizeSignedIntText, signedIntToText } from '../../lib/signedInt'
import type { AccountRow, StockTradeKind, StockTradeRow } from '../../types/database.types'
import { HOSE_SYMBOLS } from './hoseSymbols'
import { useEscClose } from '../../hooks/useEscClose'

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
  useEscClose(onClose)
  const uid = useId()
  const create = useCreateStockTrade()
  const update = useUpdateStockTrade()
  const remove = useDeleteStockTrade()

  const [kind, setKind] = useState<StockTradeKind>(trade?.kind ?? 'buy')
  const [symbol, setSymbol] = useState(trade?.symbol ?? '')
  const [tradedOn, setTradedOn] = useState(trade?.traded_on ?? toISODate(new Date()))
  // Giữ chuỗi thô, không phải số: xem lib/signedInt.ts — <input type="number"> làm mất
  // dấu trừ vừa gõ, mà Điều chỉnh (gộp cổ phiếu) cần nhập được số âm.
  const [quantityText, setQuantityText] = useState(signedIntToText(trade?.quantity ?? 0))
  const quantity = parseSignedIntText(quantityText)
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

  // Gợi ý tối đa 8 mã khi gõ — khớp cả mã và tên công ty. Đọc từ danh sách tĩnh HOSE_SYMBOLS
  // (không phải stock_prices): bảng giá giờ chỉ có mã ĐÃ từng giao dịch, nên nếu đọc từ đó
  // ô gợi ý sẽ im lặng đúng lúc cần nhất — lần đầu gõ một mã CHƯA từng mua.
  const suggestions = useMemo(() => {
    const q = symbol.trim().toUpperCase()
    if (q.length < 1 || HOSE_SYMBOLS.some(([s]) => s === q)) return []
    return HOSE_SYMBOLS.filter(
      ([s, name]) => s.startsWith(q) || name.toUpperCase().includes(q),
    ).slice(0, 8)
  }, [symbol])

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
        title: `Xóa lệnh ${trade.symbol} ngày ${trade.traded_on}?`,
        danger: true,
        confirmLabel: 'Xóa',
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
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 lg:items-center animate-overlay-in"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:rounded-2xl animate-sheet-in lg:animate-sheet-pop"
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
          <Guide className="mb-3 rounded-lg bg-surface-page px-2.5 py-2 text-2xs text-fg-muted">
            Dùng khi được thưởng cổ phiếu, nhận cổ tức bằng cổ phiếu, hoặc chia tách. Số cổ
            tăng mà không tốn tiền nên giá vốn trung bình tự giảm. Gộp cổ phiếu thì nhập số
            âm.
          </Guide>
        )}

        <label htmlFor={`${uid}-symbol`} className="mb-1 block text-xs font-medium text-fg-muted">
          Mã cổ phiếu
        </label>
        <input
          id={`${uid}-symbol`}
          value={symbol}
          onChange={(e) => setSymbol(e.target.value.toUpperCase())}
          placeholder="FPT"
          autoCapitalize="characters"
          className="mb-1 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm font-semibold uppercase outline-green-500"
        />
        {suggestions.length > 0 && (
          <ul className="mb-3 max-h-40 overflow-y-auto rounded-lg border border-border-subtle">
            {suggestions.map(([s, name]) => (
              <li key={s}>
                <button
                  type="button"
                  onClick={() => setSymbol(s)}
                  className="flex w-full items-baseline justify-between gap-2 px-3 py-2 text-left text-xs hover:bg-surface-page"
                >
                  <b className="text-fg-primary">{s}</b>
                  <span className="truncate text-2xs text-fg-muted">{name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* <span> chứ không <label>: ô ngày là <button>, tên đi qua ariaLabel. */}
        <span className="mb-1 block text-xs font-medium text-fg-muted">Ngày</span>
        <DateField
          ariaLabel="Ngày"
          value={tradedOn}
          max={toISODate(new Date())}
          onChange={setTradedOn}
          className="mb-3 w-full px-3 py-2"
        />

        <label htmlFor={`${uid}-qty`} className="mb-1 block text-xs font-medium text-fg-muted">
          Số cổ {isAdjust && <span className="text-fg-muted">(âm = gộp cổ phiếu)</span>}
        </label>
        <input
          id={`${uid}-qty`}
          type="text"
          inputMode="numeric"
          value={quantityText}
          onChange={(e) => setQuantityText(sanitizeSignedIntText(e.target.value))}
          className="mb-3 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-right text-lg font-semibold outline-green-500"
        />

        {!isAdjust && (
          <>
            {/* Ba nhãn dưới đây là <span>: MoneyField có hai ô (chạm mobile / input
                desktop) nên `htmlFor` luôn trỏ vào ô đang bị CSS ẩn. Tên ô = `ariaLabel`. */}
            <span className="mb-1 block text-xs font-medium text-fg-muted">Giá mỗi cổ</span>
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
              <span className="text-xs font-medium text-fg-muted">Phí giao dịch</span>
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
                  <span className="text-xs font-medium text-fg-muted">Thuế bán</span>
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

        <label htmlFor={`${uid}-note`} className="mb-1 block text-xs font-medium text-fg-muted">
          Ghi chú <span className="text-fg-muted">(không bắt buộc)</span>
        </label>
        <input
          id={`${uid}-note`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Ví dụ: cổ phiếu thưởng 10%"
          className="mb-3 w-full rounded-md border border-border-strong px-3 py-2 text-sm outline-green-500"
        />

        <Guide className="mb-3 text-xs text-fg-muted">
          Lệnh không tạo giao dịch thu/chi và không đổi số dư — nó chỉ nói tiền trong tài
          khoản đang nằm ở cổ phiếu nào.
        </Guide>

        <div className="mt-1 flex items-center justify-end gap-2">
          {trade && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={saving}
              className="mr-auto rounded-md px-3 py-2 text-sm text-money-out disabled:opacity-50"
            >
              Xóa
            </button>
          )}
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
            className="min-h-11 rounded-md bg-accent text-fg-on-accent px-4 py-2 text-sm font-semibold active:scale-95 disabled:opacity-50"
          >
            {saving ? 'Đang lưu…' : 'Lưu'}
          </button>
        </div>
      </div>
    </div>
  )
}
