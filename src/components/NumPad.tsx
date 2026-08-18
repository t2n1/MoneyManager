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
            // Bản 1a (§4.6) đảo hai bề mặt so với bản cũ: PHÍM SỐ là mặt lún
            // (--surface-sunken + viền control) vì nó là mười sáu ô đều nhau, còn PHÍM
            // PHÉP TÍNH lùi về nền thẻ để bốn ô đó không đọc thành cùng một dãy với số.
            // Bóng bỏ hẳn — 1a không có shadow, và mười sáu cái bóng cạnh nhau ở dark
            // chỉ là mười sáu vệt bẩn.
            //
            // Phím phép tính vẫn dùng token fg-accent-on-track ở LIGHT (nền lún gray-100,
            // green-700 trên đó chỉ 4,49:1 — trượt đúng một li; xem src/index.css); ở
            // dark token đó là green-400, khớp luôn giá trị #7bf1a8-ish mà §4.6 ghi.
            //
            // `disabled:text-fg-disabled` thay `disabled:opacity-40`: hạ độ mờ làm mờ cả
            // NỀN nên phím tắt trông như một lỗ thủng trong lưới; đổi màu chữ thì lưới
            // vẫn còn nguyên, chỉ chữ nhạt đi.
            className={`flex min-h-11 items-center justify-center rounded-md py-1.5 font-mono text-lg font-semibold transition enabled:active:scale-95 ${
              isOp
                ? 'border border-border-strong bg-surface text-fg-accent-on-track enabled:active:bg-surface-sunken disabled:border-border-subtle disabled:text-fg-disabled'
                : 'border border-border-strong bg-surface-sunken text-fg-primary enabled:active:bg-surface'
            }`}
          >
            {key}
          </button>
        )
      })}
    </div>
  )
}
