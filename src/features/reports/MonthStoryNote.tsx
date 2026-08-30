// Mấy dòng "cái khác thường của tháng này", đứng ngay dưới câu tổng.
//
// Chỗ này CHỈ dựng câu chữ — mọi phép chọn và xếp nằm ở `monthStory.ts` (thuần, có test).
// Cùng cách chia việc với `dailyHeadline` + <Headline> của DailySpendPanel, và cùng lý do:
// số tiền phải đi qua <Money> để ăn chế độ che số và tiền tố "≈" khi thiếu tỷ giá.
import { Money, Num } from '../../components/ui'
import { useDensity } from '../../hooks/useDensity'
import type { CurrencyCode } from '../../lib/money'
import type { MonthFinding } from './monthStory'

/** "3,7" — dấu thập phân kiểu Việt, cùng quy ước `compareClause` của headline.ts. */
const times = (ratio: number) => ratio.toFixed(1).replace('.', ',')

export function MonthStoryNote({
  findings,
  base,
  approx,
}: {
  findings: readonly MonthFinding[]
  base: CurrencyCode
  /** Thiếu tỷ giá ở đâu đó trong cửa sổ — mọi số ở đây phải mang "≈". */
  approx: boolean
}) {
  const { visual } = useDensity()
  if (findings.length === 0) return null
  // Chế độ Gọn giữ đúng MỘT dòng: nó là chế độ mặc định của app, và hai dòng phát hiện
  // cộng với câu tổng đã dài hơn cả hàng ô số ngay dưới.
  const shown = visual ? findings.slice(0, 1) : findings
  return (
    <ul className="flex flex-col gap-1 text-sm leading-snug text-fg-secondary">
      {shown.map((f) => (
        <li key={f.groupId}>
          <Line f={f} base={base} approx={approx} />
        </li>
      ))}
    </ul>
  )
}

function Line({ f, base, approx }: { f: MonthFinding; base: CurrencyCode; approx: boolean }) {
  // KHÔNG `compact`: trong một câu văn "6.8万" bắt người đọc dừng lại quy đổi, còn trong ô
  // số thì nó tiết kiệm chỗ. Câu kết luận của thẻ Chi từng ngày cũng in đủ số vì lý do đó.
  const money = (amount: number) => <Money amount={amount} currency={base} approx={approx} />

  switch (f.kind) {
    case 'categorySpike':
      return (
        <>
          {f.name} {money(f.amount)} — gấp <Num>{times(f.ratio)}</Num> lần mức thường (
          {money(Math.round(f.usual))})
          {f.biggest && <>, và {money(f.biggest.amount)} trong đó là một khoản duy nhất</>}.
        </>
      )
    case 'manySmall':
      return (
        <>
          {f.name} <Num>{f.count}</Num> lần lẻ dồn lại {money(f.amount)} — gần bằng cả{' '}
          {f.anchorName} tháng này ({money(f.anchorAmount)}).
        </>
      )
    case 'pricePerVisit':
      return (
        <>
          {f.name} vẫn <Num>{f.count}</Num> lần, nhưng mỗi lần{' '}
          {f.ratio < 1 ? 'chỉ còn ' : ''}
          {money(Math.round(f.perNow))} thay vì {money(Math.round(f.perUsual))} như thường lệ.
        </>
      )
    case 'lump':
      return (
        <>
          {f.name} {money(f.amount)} — <Num>{Math.round(f.share * 100)}%</Num> nằm ở một khoản{' '}
          {money(f.biggest)}.
        </>
      )
  }
}
