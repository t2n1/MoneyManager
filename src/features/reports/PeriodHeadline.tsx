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
}

export function PeriodHeadline({
  headline,
  income,
  expense,
  base,
  approx = false,
  tiles = true,
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
      <div className="grid grid-cols-3 gap-2">
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
      </div>
      <VerdictNote tone={headline.tone} short={headline.short}>
        {headline.text}
      </VerdictNote>
    </section>
  )
}
