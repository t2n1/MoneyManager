// Mấy dòng "cái khác thường của tháng này", đứng ngay dưới câu tổng.
//
// Chỗ này CHỈ dựng câu chữ — mọi phép chọn và xếp nằm ở `monthStory.ts` (thuần, có test).
// Cùng cách chia việc với `dailyHeadline` + <Headline> của DailySpendPanel, và cùng lý do:
// số tiền phải đi qua <Money> để ăn chế độ che số và tiền tố "≈" khi thiếu tỷ giá.
import { Money, Num } from '../../components/ui'
import { useDensity } from '../../hooks/useDensity'
import type { CurrencyCode } from '../../lib/money'
import type { MonthFinding } from './monthStory'
import { getLang } from '../../i18n'
import { trn } from '../../i18n/react'

/** "3,7" — dấu thập phân kiểu Việt, cùng quy ước `compareClause` của headline.ts. */
const times = (ratio: number) => ratio.toFixed(1).replace('.', getLang() === 'en' ? '.' : ',')

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
      return f.biggest
        ? trn('{name} {amount} — gấp {times} lần mức thường ({usual}), và {biggest} trong đó là một khoản duy nhất.', {
            name: f.name,
            amount: money(f.amount),
            times: <Num>{times(f.ratio)}</Num>,
            usual: money(Math.round(f.usual)),
            biggest: money(f.biggest.amount),
          })
        : trn('{name} {amount} — gấp {times} lần mức thường ({usual}).', {
            name: f.name,
            amount: money(f.amount),
            times: <Num>{times(f.ratio)}</Num>,
            usual: money(Math.round(f.usual)),
          })
    case 'manySmall':
      return trn('{name} {count} lần lẻ dồn lại {amount} — gần bằng cả {anchor} tháng này ({anchorAmount}).', {
        name: f.name,
        count: <Num>{f.count}</Num>,
        amount: money(f.amount),
        anchor: f.anchorName,
        anchorAmount: money(f.anchorAmount),
      })
    case 'pricePerVisit': {
      const vars = {
        name: f.name,
        count: <Num>{f.count}</Num>,
        now: money(Math.round(f.perNow)),
        usual: money(Math.round(f.perUsual)),
      }
      return f.ratio < 1
        ? trn('{name} vẫn {count} lần, nhưng mỗi lần chỉ còn {now} thay vì {usual} như thường lệ.', vars)
        : trn('{name} vẫn {count} lần, nhưng mỗi lần {now} thay vì {usual} như thường lệ.', vars)
    }
    case 'lump':
      return trn('{name} {amount} — {pct} nằm ở một khoản {biggest}.', {
        name: f.name,
        amount: money(f.amount),
        pct: <Num>{Math.round(f.share * 100)}%</Num>,
        biggest: money(f.biggest),
      })
  }
}
