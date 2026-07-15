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

/** Bàn phím số + phép tính cho mobile — không dùng bàn phím hệ thống. */
export function NumPad({ onKey }: { onKey: (key: NumPadKey) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="grid grid-cols-4 gap-1.5">
        {NUM_OP_KEYS.map((key) => {
          const isOp = OP_SET.has(key)
          return (
            <button
              key={key}
              type="button"
              onClick={() => onKey(key)}
              aria-label={ARIA[key] ?? key}
              className={`rounded-xl py-3.5 text-xl font-semibold shadow-sm transition active:scale-95 ${
                isOp
                  ? 'bg-gray-100 text-green-700 active:bg-gray-300'
                  : 'bg-white text-gray-800 active:bg-gray-200'
              }`}
            >
              {key}
            </button>
          )
        })}
      </div>
      <button
        type="button"
        onClick={() => onKey('⌫')}
        aria-label={ARIA['⌫']}
        className="w-full rounded-xl bg-white py-3.5 text-xl font-semibold text-gray-800 shadow-sm transition active:scale-95 active:bg-gray-200"
      >
        ⌫
      </button>
    </div>
  )
}
