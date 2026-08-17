// Dòng "số trong app lấy lúc nào" — chữ tĩnh, không bấm được.
//
// Trước đây nó là nút xổ ra bảng từng nguồn. Bỏ vì bảng đó chép lại đúng chữ của dòng
// gọn: trang chỉ có tỷ giá thì bấm xổ ra để đọc lại "Tỷ giá — hôm qua". Từ khi mỗi nguồn
// tự mang màu của mình, dòng gọn đã nói đủ cả tuổi lẫn nguồn nào đang cũ.
//
// Nó nói về CẢ app chứ không riêng màn nào, nên chỗ đứng là chân trang (AppFooter), không
// phải đầu mỗi trang. Dấu ≈ của EstimateMark mới là thứ đi kèm từng con số, và nó nói
// chuyện khác: "số này do app suy ra", không phải "số này cũ".
import type { FreshnessSummary } from '../lib/freshness'
import { STATUS_FILL } from './ui/statusColors'

export function DataFreshness({ summary }: { summary: FreshnessSummary | null }) {
  if (!summary) return null

  // Chấm là NỀN nên amber-500 dùng được; chữ cảnh báo phải là amber-700/300
  // (amber-600/500 làm chữ trượt AA ở light mode — designSystem.test.ts cấm cứng).
  //
  // Chiều "ổn" dùng token `bg-accent` chứ không bg-green-600: green-600 nằm trong danh
  // sách ban cứng, và đọc token thì đổi một chỗ là đổi cả app.
  const dot = summary.tone === 'warn' ? STATUS_FILL.warn : 'bg-accent'

  // Chấm đầu dòng là tone GỘP, nên nó chuyển hổ phách khi bất kỳ nguồn nào cũ. Nếu dòng
  // chữ cũng tô một màu theo tone gộp thì "Tỷ giá hôm qua" nằm trong dòng hổ phách trông
  // y như chính tỷ giá đang có vấn đề, trong khi thủ phạm có thể là giá cổ phiếu. Vì vậy
  // mỗi nguồn tự mang màu của mình.
  const warnText = 'font-medium text-state-warn-fg'

  return (
    <span className="inline-flex flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5">
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
      <span>
        {summary.details.map((d, i) => (
          <span key={d.label}>
            {/* Dấu phân cách để NGOÀI span màu: tô nó theo nguồn đứng trước sẽ kéo màu
                cảnh báo lan sang khoảng giữa hai nguồn. */}
            {i > 0 && ' · '}
            <span className={d.tone === 'warn' ? warnText : undefined}>
              {d.label} {d.age}
            </span>
          </span>
        ))}
      </span>
    </span>
  )
}
