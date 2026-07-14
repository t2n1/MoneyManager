const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', '⌫'] as const

export type NumPadKey = (typeof KEYS)[number]

/** Bàn phím số custom cho mobile — có nút 000, không dùng bàn phím hệ thống. */
export function NumPad({ onKey }: { onKey: (key: NumPadKey) => void }) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {KEYS.map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => onKey(key)}
          className="rounded-xl bg-white py-3.5 text-xl font-semibold text-gray-800 shadow-sm transition active:scale-95 active:bg-gray-200"
          aria-label={key === '⌫' ? 'Xóa' : key}
        >
          {key}
        </button>
      ))}
    </div>
  )
}
