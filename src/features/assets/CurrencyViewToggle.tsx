// Nút ¥/₫/$ "xem thử bằng tiền khác" của trang Tài sản — một bộ nút, hai chỗ đặt:
// thẻ Tổng tài sản (nền gradient xanh, chữ trắng) và đầu tab Diễn biến (nền trang).
// Trạng thái sống ở AssetsPage nên đổi ở tab nào cũng giữ nguyên khi qua tab kia.
//
// KHÔNG áp cho tab Tương lai: bản chiếu Lifetime có "tiền hiển thị" riêng theo từng
// kịch bản với tỷ giá GIẢ ĐỊNH dài hạn tự khai (xem ScenarioEditorSheet) — đè tỷ giá
// cache hôm nay lên đó là quy đổi hai lần và cãi nhau với giả định của kịch bản.
import { CURRENCIES, type CurrencyCode } from '../../lib/money'
import type { Rates } from '../../lib/rates'

const VARIANT = {
  // Trên thẻ gradient xanh đậm — track tối, nút chọn nổi trắng.
  // `idle` KHÔNG được thêm alpha (từng là text-green-50/90): trên nền gradient
  // green-700 thì green-50 đủ 4,72:1, nhưng hạ xuống /90 là còn 4,14:1 và /80 còn
  // 3,58:1 — trượt AA. Muốn nhạt hơn thì đổi sắc độ, đừng đổi độ mờ.
  onGreen: {
    track: 'bg-black/20',
    active: 'bg-white text-green-800 shadow-sm',
    idle: 'text-green-50 hover:text-white',
  },
  // Trên nền trang — cùng bảng màu với SegmentedControl
  card: {
    track: 'bg-surface-sunken',
    active: 'bg-surface text-fg-primary shadow-sm',
    idle: 'text-fg-on-track hover:text-fg-primary',
  },
} as const

interface Props {
  base: CurrencyCode
  rates: Rates | null | undefined
  /** Đồng tiền đang xem (nơi gọi đã fallback về base). */
  value: CurrencyCode
  /** Nhận null khi chọn lại tiền gốc — nơi giữ state không lưu mã cứng của base. */
  onChange: (c: CurrencyCode | null) => void
  variant: keyof typeof VARIANT
}

export function CurrencyViewToggle({ base, rates, value, onChange, variant }: Props) {
  const v = VARIANT[variant]
  // Đồng tiền bấm được: tiền gốc luôn được; tiền khác cần tỷ giá dùng được.
  const canView = (c: CurrencyCode) => {
    if (c === base) return true
    const r = rates?.[c]
    return r != null && Number.isFinite(r) && r > 0
  }
  return (
    <div
      role="group"
      aria-label="Xem thử bằng tiền khác"
      className={`flex shrink-0 rounded-lg p-0.5 ${v.track}`}
    >
      {(Object.keys(CURRENCIES) as CurrencyCode[]).map((c) => {
        const active = value === c
        return (
          <button
            key={c}
            type="button"
            aria-pressed={active}
            disabled={!canView(c)}
            onClick={() => onChange(c === base ? null : c)}
            className={`min-h-8 min-w-9 rounded-md px-2 text-xs font-semibold transition disabled:opacity-40 ${
              active ? v.active : v.idle
            }`}
          >
            {CURRENCIES[c].symbol}
          </button>
        )
      })}
    </div>
  )
}
