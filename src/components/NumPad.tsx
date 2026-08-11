// Xếp kiểu máy tính: hàng 7-8-9 ở trên, 1-2-3 ở dưới.
const NUM_OP_KEYS = [
  '7', '8', '9', '÷',
  '4', '5', '6', '×',
  '1', '2', '3', '−',
  '00', '0', '000', '+',
] as const

const OP_SET = new Set(['+', '−', '×', '÷'])

export type NumPadKey = (typeof NUM_OP_KEYS)[number] | '⌫'

const ARIA: Record<string, string> = {
  '+': 'Cộng',
  '−': 'Trừ',
  '×': 'Nhân',
  '÷': 'Chia',
  '⌫': 'Xóa',
}

/** Bàn phím số + phép tính cho mobile — không dùng bàn phím hệ thống.
 *  Nút xóa lùi (⌫) nằm chung hàng với Tiếp tục/Lưu ở TransactionForm để đỡ tốn chiều cao. */
export function NumPad({
  onKey,
  opsDisabled = false,
}: {
  onKey: (key: NumPadKey) => void
  /** Ô đang nhập không nhận phép tính (ô tiền phụ) → mờ ÷×−+ thay vì bấm mà im lặng. */
  opsDisabled?: boolean
}) {
  return (
    <div className="grid grid-cols-4 gap-1">
      {NUM_OP_KEYS.map((key) => {
        const isOp = OP_SET.has(key)
        return (
          <button
            key={key}
            type="button"
            onClick={() => onKey(key)}
            disabled={isOp && opsDisabled}
            aria-label={ARIA[key] ?? key}
            // Phím phép tính dùng token fg-accent-on-track, KHÔNG fg-accent: nền là
            // surface-sunken (gray-100), mà green-700 trên đó đo được 4,49:1 — trượt 4,5
            // đúng một li. Xem lý do đặt token ở src/index.css.
            className={`flex min-h-11 items-center justify-center rounded-lg py-1.5 text-lg font-semibold shadow-sm transition enabled:active:scale-95 disabled:opacity-40 ${
              isOp
                ? 'bg-surface-sunken text-fg-accent-on-track enabled:active:bg-gray-300'
                : 'bg-white dark:bg-gray-800 text-fg-primary enabled:active:bg-gray-200'
            }`}
          >
            {key}
          </button>
        )
      })}
    </div>
  )
}
