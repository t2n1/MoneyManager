import { useEffect, useId, useState, useSyncExternalStore } from 'react'
import { NumPad, type NumPadKey } from './NumPad'
import { appendKey, evalExpression, formatExpr, hasOperator, MAX_AMOUNT_DIGITS } from '../lib/calc'
import { formatMoney, parseMoney, type CurrencyCode } from '../lib/money'

// Quy ước chung của app: hễ có ô nhập tiền thì hiện luôn bàn phím số của app
// (mobile), không dùng bàn phím hệ thống. Trên desktop gõ thẳng vào input.
//
// Chỉ một pad được mở trong toàn app: mở ô này thì ô khác tự thu lại (form có
// nhiều ô tiền — vd tài khoản thẻ: hạn mức tín dụng + số nợ ban đầu).
let activePad: string | null = null
const padListeners = new Set<() => void>()

function setActivePad(id: string | null) {
  activePad = id
  for (const f of padListeners) f()
}

function subscribePad(f: () => void) {
  padListeners.add(f)
  return () => {
    padListeners.delete(f)
  }
}

/**
 * Dáng ô nhập tiền CHÍNH của một sheet: to, canh phải, viền đậm lên khi focus.
 *
 * Là hằng số vì hai sheet ngân sách chép tay y hệt nhau — mà "y hệt" chỉ đúng tới lần
 * đầu có người sửa một bên. Cỡ chữ nằm trong đây luôn: ô tiền chính của sheet là chỗ
 * mắt phải rơi vào trước tiên, để mỗi nơi tự chọn cỡ là mỗi sheet một kiểu.
 */
export const MONEY_FIELD_CLASS =
  'w-full rounded-md border border-border-strong bg-surface p-3 text-right text-lg font-semibold text-fg-primary'

interface Props {
  /** Số tiền ở đơn vị nhỏ nhất (0 = chưa nhập). */
  value: number
  onChange: (value: number) => void
  currency: CurrencyCode
  /** Ô tiền chính của form → mở pad ngay khi hiện. Ô phụ thì để false. */
  autoOpen?: boolean
  /** Class cho ô (dùng chung cho hộp chạm mobile và input desktop). */
  className?: string
  ariaLabel?: string
  /** Enter trên desktop (thường là lưu). */
  onEnter?: () => void
}

/** Ô nhập tiền dùng chung: hộp chạm + bàn phím số của app (mobile), input (desktop). */
export function MoneyField({
  value,
  onChange,
  currency,
  autoOpen = true,
  className = '',
  ariaLabel = 'Số tiền',
  onEnter,
}: Props) {
  const id = useId()
  const open = useSyncExternalStore(subscribePad, () => activePad === id)
  // Biểu thức đang gõ ('' = trống). Cho phép + − × ÷ như ô tiền ở trang Nhập.
  const [expr, setExpr] = useState(value > 0 ? String(value) : '')

  useEffect(() => {
    if (autoOpen) setActivePad(id)
    return () => {
      if (activePad === id) setActivePad(null)
    }
  }, [autoOpen, id])

  // Giá trị bị đổi từ bên ngoài (vd nút "Tất cả", đổi loại tiền) → nạp lại biểu thức.
  useEffect(() => {
    setExpr((cur) => ((evalExpression(cur) ?? 0) === value ? cur : value > 0 ? String(value) : ''))
  }, [value])

  function emit(next: string) {
    setExpr(next)
    onChange(evalExpression(next) ?? 0)
  }

  const result = evalExpression(expr) ?? 0
  const showExpr = hasOperator(expr)
  const text = showExpr ? formatExpr(expr, currency) : formatMoney(result, currency)
  const isEmpty = !showExpr && result === 0

  return (
    <div className="flex flex-col gap-1">
      {/* Mobile: hộp chạm — pad của app gõ vào, không bật bàn phím hệ thống */}
      <button
        type="button"
        onClick={() => setActivePad(id)}
        aria-label={`${ariaLabel}: ${text}`}
        className={`truncate lg:hidden ${className} ${isEmpty ? 'opacity-40' : ''} ${
          open ? 'ring-2 ring-accent' : ''
        }`}
      >
        {text}
      </button>
      {showExpr && (
        <span className="text-right text-xs text-fg-muted lg:hidden">
          = {formatMoney(result, currency)}
        </span>
      )}

      {/* Desktop: gõ trực tiếp.
          `aria-label` ở ĐÂY nữa, không chỉ ở nút chạm phía trên: hai ô này luôn CÙNG nằm
          trong DOM, chỉ ẩn/hiện bằng `lg:hidden` / `hidden lg:block`. Nên trên desktop ô
          thật sự dùng được là ô này — mà trước 2026-07-30 nó không có tên nào cả, tức mọi
          ô nhập tiền trong app đều vô danh với screen reader ở màn rộng. Nhãn nhìn bằng mắt
          nằm ngoài component nên không cứu được (cũng không dùng `htmlFor` được: có hai
          đích, `for` sẽ trỏ vào ô đang bị CSS ẩn).
          Khác nút chạm ở chỗ KHÔNG ghép giá trị vào tên: giá trị đã nằm trong `value` của
          input, screen reader tự đọc — ghép vào nữa thì nghe hai lần. */}
      <input
        aria-label={ariaLabel}
        inputMode="numeric"
        value={result === 0 ? '' : formatMoney(result, currency)}
        onChange={(e) => {
          const parsed = String(parseMoney(e.target.value))
          emit(parsed === '0' ? '' : parsed.slice(0, MAX_AMOUNT_DIGITS))
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onEnter?.()
        }}
        placeholder={formatMoney(0, currency)}
        className={`hidden lg:block ${className}`}
      />

      {open && (
        <div className="flex flex-col gap-1 lg:hidden">
          <NumPad onKey={(key: NumPadKey) => emit(appendKey(expr, key))} />
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => emit(appendKey(expr, '⌫'))}
              aria-label="Xóa"
              className="flex-1 rounded-md bg-surface py-1.5 text-lg font-semibold text-fg-primary shadow-sm transition active:scale-95 active:bg-gray-200"
            >
              ⌫
            </button>
            <button
              type="button"
              onClick={() => setActivePad(null)}
              className="flex-1 rounded-md bg-surface-sunken py-1.5 text-sm font-medium text-fg-secondary shadow-sm transition active:scale-95"
            >
              Thu bàn phím
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
