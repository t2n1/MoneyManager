// Ba ô số to + một câu nối chúng lại, đặt ở đầu trang Báo cáo.
//
// Vì sao cần: app có câu kết luận ở TỪNG thẻ nhưng không có câu nào cho cả kỳ, nên phải
// cuộn hết sáu thẻ mới tự ghép được "tháng này rốt cuộc thế nào". permtrack mở đầu trang
// bằng đúng khuôn này — số lớn trước, rồi một câu văn biến chúng thành kết luận.
//
// Chỉ bày ra, không tính: phép tính ở headline.ts (có test riêng).
import { VerdictNote } from '../../components/VerdictNote'
import { Money, StatTile } from '../../components/ui'
import type { CurrencyCode } from '../../lib/money'
import type { Headline } from './headline'

interface Props {
  headline: Headline | null
  income: number
  expense: number
  base: CurrencyCode
  /** Tổng có ngoại tệ quy đổi theo tỷ giá → <Money> thêm tiền tố "≈ ". */
  approx?: boolean
  /**
   * Bày ba ô số hay chỉ một câu. Chế độ NĂM tắt ô số vì trang đó đã có sẵn năm ô
   * thống kê riêng — bày lại là nói hai lần cùng một con số.
   */
  tiles?: boolean
  /**
   * Hai ô KÉO TỪ tab "Thấu hiểu" lên (§4.5 của bản 1a: năm ô số, không phải ba).
   *
   * Vì sao kéo lên: cả hai trả lời câu "tháng này rồi sẽ ra sao" — đúng câu người ta mở
   * Báo cáo để hỏi — mà lại nằm sau một tab nữa. `null` = chưa tính được (đầu kỳ chưa đủ
   * một ngày), và lúc đó ô hiện "—" chứ KHÔNG hiện 0.
   */
  forecast?: number | null
  noSpendDays?: number | null
}

export function PeriodHeadline({
  headline,
  income,
  expense,
  base,
  approx = false,
  tiles = true,
  forecast,
  noSpendDays,
}: Props) {
  if (!headline) return null
  if (!tiles)
    return (
      <VerdictNote tone={headline.tone} short={headline.short}>
        {headline.text}
      </VerdictNote>
    )
  return (
    <section className="flex flex-col gap-2">
      {/* Ba ô ở mobile, năm ô từ sm: năm ô trong 375px thì mỗi ô rộng ~68px — hẹp hơn
          nhãn "Dự báo cuối tháng". */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        <StatTile label="Thu" center>
          <Money amount={income} currency={base} tone="in" compact approx={approx} />
        </StatTile>
        <StatTile label="Chi" center>
          <Money amount={expense} currency={base} tone="out" compact approx={approx} />
        </StatTile>
        {/* Tỷ lệ giữ lại KHÔNG phải tiền nên không dùng <Money>; chỉ tô màu chi khi âm,
            vì lúc đó nó mang đúng nghĩa "đang mất tiền". */}
        <StatTile label="Giữ lại" center>
          <span className={headline.ratePct !== null && headline.ratePct < 0 ? 'text-money-out' : ''}>
            {headline.ratePct === null ? '—' : `${headline.ratePct}%`}
          </span>
        </StatTile>
        {/* Hai ô cuối chỉ hiện khi nơi gọi TRUYỀN vào (tức chỉ ở kỳ tháng): dự báo cuối
            tháng và chuỗi ngày không chi đều là khái niệm của một tháng đang chạy dở. */}
        {forecast !== undefined && (
          <StatTile label="Dự báo cuối tháng" center>
            {forecast === null ? (
              <span className="text-fg-muted">—</span>
            ) : (
              <Money amount={forecast} currency={base} tone="out" compact approx={approx} />
            )}
          </StatTile>
        )}
        {noSpendDays !== undefined && (
          <StatTile label="Ngày không chi" center>
            {noSpendDays === null ? (
              <span className="text-fg-muted">—</span>
            ) : (
              <span>{noSpendDays}</span>
            )}
          </StatTile>
        )}
      </div>
      <VerdictNote tone={headline.tone} short={headline.short}>
        {headline.text}
      </VerdictNote>
    </section>
  )
}
