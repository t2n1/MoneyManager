import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { VerdictNote } from '../../components/VerdictNote'
import { formatCompact, formatMoney, type CurrencyCode } from '../../lib/money'
import { Card } from '../../components/ui'
import type { TrailingRow, YearRow } from './multiYear'

// Cùng một nguồn màu với MonthlyBarsCard: Recharts nhận màu qua prop `fill` nên không
// dùng được biến CSS của token, phải là hằng số JS.
const INCOME = '#16a34a'
const EXPENSE = '#ef4444'
// Cột 12T cố ý dùng ĐÚNG màu của các cột năm: nó là cùng một loại số (thu/chi trong 12
// tháng) nên tô khác màu sẽ gợi ý sai rằng nó đo thứ khác. Cách phân biệt là NHÃN trục,
// tooltip và câu dưới biểu đồ. Đã thử tô nhạt (green-300/red-300) rồi bỏ: hai sắc độ đó
// chỉ ~1,5:1 trên trắng, tức đúng lỗi 3:1 vừa dọn ở thang đo sức khỏe.

/** Nhãn cột trượt. Ngắn vì trục X ở mobile chỉ đủ vài ký tự. */
const LTM_LABEL = '12T'

interface Props {
  rows: readonly YearRow[]
  base: CurrencyCode
  /**
   * Cửa sổ 12 tháng hoàn tất gần nhất, vẽ thành cột cuối. Chỉ truyền khi nó nói thêm
   * được điều gì — xem MultiYearView.
   */
  trailing?: TrailingRow | null
}

export function YearBarsCard({ rows, base, trailing = null }: Props) {
  const data: {
    label: string
    income: number
    expense: number
    partial: boolean
    ltm: boolean
  }[] = rows.map((r) => ({
    label: String(r.year),
    income: r.income,
    expense: r.expense,
    // Năm ghi thiếu tháng vẫn vẽ, nhưng nhãn phải nói ra để không đọc nhầm là "năm đó tiêu ít"
    partial: r.months < 12,
    ltm: false,
  }))
  if (trailing) {
    data.push({
      label: LTM_LABEL,
      income: trailing.income,
      expense: trailing.expense,
      partial: trailing.months < 12,
      ltm: true,
    })
  }
  const lastYear = rows[rows.length - 1]

  return (
    <Card as="section">
      <h2 className="mb-2 text-sm font-semibold text-fg-muted">Thu / chi theo năm</h2>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: 'var(--fg-muted)' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v: number) => formatCompact(v, base)}
              tick={{ fontSize: 11, fill: 'var(--fg-muted)' }}
              axisLine={false}
              tickLine={false}
              width={44}
            />
            <Tooltip
              formatter={(v, name) => [
                formatMoney(Number(v), base),
                name === 'income' ? 'Thu' : 'Chi',
              ]}
              labelFormatter={(l) => {
                if (l === LTM_LABEL && trailing)
                  return `12 tháng tới hết ${trailing.to.year}/${trailing.to.month}`
                const row = data.find((d) => d.label === l)
                return row?.partial ? `Năm ${l} (thiếu tháng)` : `Năm ${l}`
              }}
              contentStyle={{ borderRadius: 8, fontSize: 12 }}
              cursor={{ fill: 'rgba(148,163,184,0.15)' }}
            />
            <Bar dataKey="income" fill={INCOME} radius={[3, 3, 0, 0]} />
            <Bar dataKey="expense" fill={EXPENSE} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-1 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-fg-muted">
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: INCOME }} /> Thu
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: EXPENSE }} /> Chi
        </span>
        {trailing && <span>{LTM_LABEL} = 12 tháng gần nhất</span>}
      </div>

      {/* Vì sao có cột này: năm đang chạy luôn thấp giả, nên cột cuối trong dãy năm KHÔNG
          so được với năm đủ. Nói thẳng ra chứ đừng để người đọc tự phát hiện. */}
      {trailing && lastYear && (
        <div className="mt-2">
          <VerdictNote tone="info">
            Cột <b>{lastYear.year}</b> mới có {lastYear.months} tháng dữ liệu nên thấp hơn thực tế.
            Cột <b>{LTM_LABEL}</b> là 12 tháng đã xong gần nhất ({trailing.from.year}/
            {trailing.from.month}–{trailing.to.year}/{trailing.to.month}) — đây là cột duy nhất so
            trực tiếp được với một năm đầy.
          </VerdictNote>
        </div>
      )}
    </Card>
  )
}
