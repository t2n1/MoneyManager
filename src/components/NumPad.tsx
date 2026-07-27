const NUM_OP_KEYS = [
  '1', '2', '3', '÷',
  '4', '5', '6', '×',
  '7', '8', '9', '−',
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
export function NumPad({ onKey }: { onKey: (key: NumPadKey) => void }) {
  return (
    <div className="grid grid-cols-4 gap-1">
      {NUM_OP_KEYS.map((key) => {
        const isOp = OP_SET.has(key)
        return (
          <button
            key={key}
            type="button"
            onClick={() => onKey(key)}
            aria-label={ARIA[key] ?? key}
            className={`rounded-lg py-1.5 text-lg font-semibold shadow-sm transition active:scale-95 ${
              isOp
                ? 'bg-gray-100 dark:bg-gray-800 text-green-700 dark:text-green-400 active:bg-gray-300'
                : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 active:bg-gray-200'
            }`}
          >
            {key}
          </button>
        )
      })}
    </div>
  )
}
