// Thẻ mở đầu kỳ: MỘT vòng, MỘT con số — phần thu nhập giữ lại được.
//
// Vì sao là donut có % ở tâm chứ không thêm một ô KPI nữa: câu hỏi đầu tiên khi mở báo
// cáo là "tháng này mình giữ được bao nhiêu", và tỷ lệ chỉ có nghĩa khi thấy ngay nó là
// một PHẦN của cái gì. Ô KPI cho con số nhưng không cho tỷ lệ; vòng cho cả hai.
//
// Không lặp với "Cơ cấu theo danh mục" (cũng có donut): thẻ đó chia CHI ra các danh mục,
// thẻ này chia THU thành chi và giữ lại. Hai mẫu số khác nhau.
import { Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { Cell } from 'recharts'
import { VerdictNote } from '../../components/VerdictNote'
import { Money } from '../../components/ui'
import { ExplainBox } from '../../components/ExplainBox'
import { formatMoney, type CurrencyCode } from '../../lib/money'
import { savingsRateTone } from './verdicts'

// Cùng bộ màu với các thẻ biểu đồ khác (Recharts nhận màu qua prop nên phải là hằng JS).
const KEPT = '#16a34a'
const SPENT = '#ef4444'

interface Props {
  /** base minor: tổng thu trong kỳ */
  income: number
  /** base minor: tổng chi trong kỳ */
  expense: number
  base: CurrencyCode
  /** "tháng này" / "năm này" — ghép vào câu chữ */
  periodNoun: string
  /** Có ngoại tệ quy đổi → thêm dấu ≈ */
  approx?: boolean
}

export function SavingsDonutCard({ income, expense, base, periodNoun, approx = false }: Props) {
  const net = income - expense
  // Thu = 0 thì KHÔNG có tỷ lệ (chia cho 0), khác hẳn với "giữ lại 0%".
  const rate = income > 0 ? net / income : null

  const reducedMotion =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  // Chi vượt thu thì không vẽ được lát âm: tô kín vòng bằng màu chi, con số ở tâm mang
  // dấu trừ và câu dưới nói rõ đang bù bằng tiền cũ.
  const overspent = rate !== null && net < 0
  const slices = overspent
    ? [{ name: 'Chi', value: expense, color: SPENT }]
    : [
        { name: 'Đã chi', value: expense, color: SPENT },
        { name: 'Giữ lại', value: Math.max(net, 0), color: KEPT },
      ].filter((s) => s.value > 0)

  return (
    <section className="rounded-xl bg-surface p-3 shadow-sm">
      <h2 className="mb-2 text-sm font-semibold text-fg-muted">Giữ lại được bao nhiêu</h2>

      {rate === null ? (
        <p className="rounded-lg bg-surface-page px-3 py-4 text-center text-xs text-fg-muted">
          Chưa ghi khoản thu nào trong {periodNoun} nên chưa tính được tỷ lệ giữ lại.
        </p>
      ) : (
        <>
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-6">
            <div
              className="relative h-40 w-40 shrink-0"
              role="img"
              aria-label={`Giữ lại ${Math.round(rate * 100)}% thu nhập ${periodNoun}: thu ${formatMoney(income, base)}, chi ${formatMoney(expense, base)}`}
            >
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={slices}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="66%"
                    outerRadius="100%"
                    startAngle={90}
                    endAngle={-270}
                    isAnimationActive={!reducedMotion}
                    stroke="none"
                  >
                    {slices.map((s) => (
                      <Cell key={s.name} fill={s.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v, n) => [formatMoney(Number(v), base), String(n)]}
                    contentStyle={{ borderRadius: 8, fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
              {/* Số ở tâm là HTML, không phải <text> trong SVG: cỡ chữ SVG tính bằng px
                  nên không co theo Cài đặt → Cỡ chữ. Ẩn khỏi trình đọc màn hình vì
                  aria-label của vòng đã nói đủ. */}
              <div
                className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
                aria-hidden="true"
              >
                <span
                  className={`text-3xl font-bold leading-none tabular-nums ${
                    overspent ? 'text-money-out' : 'text-money-in'
                  }`}
                >
                  {Math.round(rate * 100)}%
                </span>
                <span className="mt-1 text-2xs text-fg-muted">giữ lại</span>
              </div>
            </div>

            {/* Hai đầu của phép chia, ghi bằng chữ — vòng chỉ nói tỷ lệ, không nói số tiền */}
            <dl className="w-full max-w-56 space-y-1.5 text-xs sm:w-auto">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-fg-secondary">Thu {periodNoun}</dt>
                <dd>
                  <Money amount={income} currency={base} tone="in" approx={approx} />
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="flex items-center gap-1.5 text-fg-secondary">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: SPENT }} />
                  Đã chi
                </dt>
                <dd>
                  <Money amount={expense} currency={base} tone="out" approx={approx} />
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-border-subtle pt-1.5">
                <dt className="flex items-center gap-1.5 font-medium text-fg-primary">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: overspent ? SPENT : KEPT }}
                  />
                  Giữ lại
                </dt>
                <dd>
                  <Money amount={net} currency={base} tone="bySign" approx={approx} />
                </dd>
              </div>
            </dl>
          </div>

          <div className="mt-3">
            <VerdictNote
              tone={savingsRateTone(rate)}
              short={
                overspent
                  ? `Chi vượt thu ${formatMoney(Math.abs(net), base)}`
                  : `Giữ lại ${Math.round(rate * 100)}%${
                      rate >= 0.2 ? ' — đạt mốc 20%' : ', mốc 20%'
                    }`
              }
            >
              {overspent ? (
                <>
                  Chi vượt thu {periodNoun} <b>{formatMoney(Math.abs(net), base)}</b> — phần thiếu
                  đang bù bằng tiền có từ trước.
                </>
              ) : rate >= 0.2 ? (
                <>
                  Giữ lại <b>{Math.round(rate * 100)}%</b> thu nhập — đạt mốc 20% của quy tắc
                  50/30/20.
                </>
              ) : (
                <>
                  Giữ lại <b>{Math.round(rate * 100)}%</b> thu nhập, chưa tới mốc 20% của quy tắc
                  50/30/20.
                </>
              )}
            </VerdictNote>
          </div>
        </>
      )}

      <ExplainBox label="Cách tính">
        <p>
          (Thu − Chi) / Thu trong {periodNoun}. Chuyển khoản giữa các tài khoản của bạn không tính
          vào cả hai đầu, giao dịch đánh dấu "không tính vào thống kê" và dòng trả nợ cũng vậy.
        </p>
        <p>
          Đây là tỷ lệ của <b>một kỳ</b>, nên tháng có thưởng hoặc tháng đóng tiền nhà cả năm sẽ lệch
          hẳn. Muốn xem nếp thật thì đọc "Thu / chi 6 tháng gần nhất" — ở đó có đường tỷ lệ tiết kiệm
          từng tháng.
        </p>
      </ExplainBox>
    </section>
  )
}
