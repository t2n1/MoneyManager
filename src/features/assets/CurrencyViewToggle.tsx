// Nút ¥/₫/$ "xem thử bằng tiền khác" của trang Tài sản. Trạng thái sống ở AssetsPage nên
// đổi ở chế độ nào cũng giữ nguyên khi gạt sang chế độ kia.
//
// MỘT chỗ đặt, một diện mạo: header trang (bản vẽ 2a). Trước đây nó có hai biến thể —
// `card` cho đầu tab Diễn biến và `onGreen` cho thẻ Tổng tài sản nền gradient xanh. Biến
// thể thứ hai đi cùng thẻ gradient: thẻ đó nay là một ô của dải KPI (xem KpiStrip.tsx),
// và một ô số 26px không có chỗ cho một bộ ba nút. Bỏ nền đặc biệt là bỏ luôn cả nhánh
// màu chỉ dùng đúng một chỗ — kèm cái bẫy đã ghi ở đó: trên gradient green-700 thì chữ
// green-50 đủ 4,72:1, nhưng hạ xuống /90 là còn 4,14:1 và trượt AA.
//
// KHÔNG áp cho tab Tương lai: bản chiếu Lifetime có "tiền hiển thị" riêng theo từng
// kịch bản với tỷ giá GIẢ ĐỊNH dài hạn tự khai (xem ScenarioEditorDrawer) — đè tỷ giá
// cache hôm nay lên đó là quy đổi hai lần và cãi nhau với giả định của kịch bản.
import { CURRENCIES, type CurrencyCode } from '../../lib/money'
import type { Rates } from '../../lib/rates'

interface Props {
  base: CurrencyCode
  rates: Rates | null | undefined
  /** Đồng tiền đang xem (nơi gọi đã fallback về base). */
  value: CurrencyCode
  /** Nhận null khi chọn lại tiền gốc — nơi giữ state không lưu mã cứng của base. */
  onChange: (c: CurrencyCode | null) => void
}

export function CurrencyViewToggle({ base, rates, value, onChange }: Props) {
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
      // Cùng khung với <SegmentedControl> đứng cạnh nó ở header: viền panel + ruột trong
      // suốt, ô đang chọn nổi lên bằng nền sunken. Không dùng chính SegmentedControl vì
      // nó là `role="tablist"` — ba đồng tiền không phải ba tab, và một nút ở đây có thể
      // bị VÔ HIỆU khi thiếu tỷ giá, chuyện mà một tab không có.
      className="flex shrink-0 rounded-lg border border-border-panel p-0.5"
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
            className={`min-h-8 min-w-9 rounded-md border px-2 text-sm font-semibold transition disabled:opacity-40 ${
              active
                ? 'border-border-strong bg-surface-sunken text-fg-primary'
                : 'border-transparent text-fg-muted hover:text-fg-primary'
            }`}
          >
            {CURRENCIES[c].symbol}
          </button>
        )
      })}
    </div>
  )
}
