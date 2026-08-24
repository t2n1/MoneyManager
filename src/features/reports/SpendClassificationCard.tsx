// Thẻ "Cơ cấu chi tiêu" — 2 trục độc lập:
// C1 Thiết yếu vs Linh hoạt (thanh, % thu nhập, mốc 50/30/20) — thanh vì cần vẽ vạch mục tiêu, donut không làm được.
// C2 Cố định vs Biến đổi (donut + thanh, % tổng chi).
// + "Van xả khẩn cấp": phần Linh hoạt × Biến đổi — khoản dễ cắt nhất khi cần gấp.
import { Link } from 'react-router-dom'
import { useDensity } from '../../hooks/useDensity'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { VerdictNote } from '../../components/VerdictNote'
import { formatCompact, formatMoney, type CurrencyCode } from '../../lib/money'
import { foldUncategorized, type ClassificationBreakdown } from './aggregate'
import { BreakdownRow } from './BreakdownRow'
import { Card, SectionTitle } from '../../components/ui'
import { CHART_TEXT_XS } from '../../lib/chartText'

const C = {
  need: '#16a34a',
  want: '#f59e0b',
  save: '#0ea5e9',
  // var(--fg-muted): gray-400 chỉ 2,54:1, không đạt 3:1 cho đồ hoạ mang thông tin.
  unknown: 'var(--fg-muted)',
} as const

interface Props {
  data: ClassificationBreakdown
  income: number
  /** Tổng chi THẬT trong kỳ (từ sumIncomeExpense) — gồm cả chi chưa gán danh mục. */
  expense: number
  base: CurrencyCode
  periodNoun: string
  unclassifiedCount: number
}

/** Thẻ báo cáo: cơ cấu chi tiêu theo 2 trục Thiết yếu/Linh hoạt và Cố định/Biến đổi. */
export function SpendClassificationCard({ data, income, expense, base, periodNoun, unclassifiedCount }: Props) {
  const { visual } = useDensity()
  // `data` chỉ gom được chi CÓ danh mục (categoryBreakdown bỏ giao dịch thiếu category_id,
  // vd hàng nhập từ CSV). Phần chênh so với tổng chi thật được gộp vào nhóm "Chưa phân loại"
  // để mẫu số của cả 2 trục = tổng chi thật và Tiết kiệm không bị thổi phồng.
  const folded = foldUncategorized(data, expense)
  const totalExpense = folded.totalExpense
  const needUnclassified = folded.needUnclassified
  const costUnclassified = folded.costUnclassified

  const savings = income - totalExpense
  const pctOfIncome = (v: number) => (income > 0 ? (v / income) * 100 : 0)
  const pctOfExpense = (v: number) => (totalExpense > 0 ? (v / totalExpense) * 100 : 0)

  // Trạng thái vượt/dưới mục tiêu — phải đọc được từ CHỮ, không chỉ dựa vào màu (yêu cầu a11y).
  const essentialPct = pctOfIncome(folded.needEssential)
  const flexiblePct = pctOfIncome(folded.needFlexible)
  const savingsPct = pctOfIncome(savings)
  const essentialOver = essentialPct > 50
  const flexibleOver = flexiblePct > 30
  const savingsUnder = savings < income * 0.2

  // Donut C2 (Cố định/Biến đổi) — chỉ lát > 0
  const c2Slices = [
    { name: 'Cố định', value: folded.costFixed, color: C.need },
    { name: 'Biến đổi', value: folded.costVariable, color: C.want },
    { name: 'Chưa phân loại', value: costUnclassified, color: C.unknown },
  ].filter((s) => s.value > 0)

  const reducedMotion =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  return (
    <Card as="section">
      <div className="mb-3 flex items-center justify-between gap-2">
        <SectionTitle>Cơ cấu chi tiêu</SectionTitle>
        {unclassifiedCount > 0 && (
          <Link
            to="/settings/categories/classify"
            className="shrink-0 rounded-md px-2 py-1 text-sm font-medium text-state-good-fg hover:bg-state-good-bg"
          >
            Phân loại {unclassifiedCount} danh mục →
          </Link>
        )}
      </div>

      {/* C1 — 50/30/20 trên thu nhập */}
      <SectionTitle as="h3" className="mb-2">
        Thiết yếu vs Linh hoạt <span className="text-fg-muted">(% thu nhập · quy tắc 50/30/20)</span>
      </SectionTitle>
      {income <= 0 ? (
        <p className="mb-3 rounded-lg bg-surface-page px-3 py-3 text-center text-sm text-fg-muted">
          Cần có thu nhập trong {periodNoun} để tính tỷ lệ 50/30/20.
        </p>
      ) : (
        <div className="mb-4 space-y-2.5">
          <BreakdownRow
            icon=""
            name={essentialOver ? 'Nhu cầu (thiết yếu) — vượt mục tiêu' : 'Nhu cầu (thiết yếu)'}
            pct={essentialPct} value={folded.needEssential}
            barPct={essentialPct} color={C.need} base={base}
            targetPct={50} warn={essentialOver}
          />
          <BreakdownRow
            icon=""
            name={flexibleOver ? 'Sở thích (linh hoạt) — vượt mục tiêu' : 'Sở thích (linh hoạt)'}
            pct={flexiblePct} value={folded.needFlexible}
            barPct={flexiblePct} color={C.want} base={base}
            targetPct={30} warn={flexibleOver}
          />
          <BreakdownRow
            icon=""
            name={savingsUnder ? 'Tiết kiệm — dưới mục tiêu' : 'Tiết kiệm'}
            pct={savingsPct} value={savings}
            barPct={Math.max(savingsPct, 0)} color={C.save} base={base}
            targetPct={20} warn={savingsUnder}
          />
          {needUnclassified > 0 && (
            <BreakdownRow
              icon="" name="Chi chưa phân loại"
              pct={pctOfIncome(needUnclassified)} value={needUnclassified}
              barPct={pctOfIncome(needUnclassified)} color={C.unknown} base={base}
            />
          )}

          {/* Ba thanh trên đã có vạch mục tiêu và chữ "vượt/dưới mục tiêu", nhưng người
              đọc vẫn phải tự tổng hợp ba dòng đó thành một kết luận. Nói thẳng ra đây. */}
          <div className="space-y-1.5 pt-0.5">
            {!essentialOver && !flexibleOver && !savingsUnder ? (
              <VerdictNote tone="good" short="Cơ cấu 50/30/20 đạt cả ba">
                Cả ba nhóm đều trong mục tiêu 50/30/20 — cơ cấu {periodNoun} không có gì phải sửa.
              </VerdictNote>
            ) : (
              <>
                {savingsUnder && (
                  <VerdictNote
                    tone={savings < 0 ? 'bad' : 'warn'}
                    label="Tiết kiệm dưới mục tiêu"
                    short={
                      savings < 0
                        ? 'Chi vượt thu'
                        : `Tiết kiệm ${Math.round(savingsPct)}% / mục tiêu 20%`
                    }
                  >
                    {savings < 0
                      ? `chi vượt thu ${periodNoun}, tức là đang rút vào tiền cũ.`
                      : `giữ được ${Math.round(savingsPct)}% thu nhập, mục tiêu là 20%.`}
                  </VerdictNote>
                )}
                {essentialOver && (
                  <VerdictNote
                    tone="warn"
                    label="Chi thiết yếu chiếm nhiều"
                    short={`Thiết yếu ${Math.round(essentialPct)}% / mục tiêu 50%`}
                  >
                    {Math.round(essentialPct)}% thu nhập (mục tiêu ≤ 50%). Đây là nhóm khó cắt trong
                    ngắn hạn — nếu kéo dài thì phải giải quyết ở mức lớn (tiền nhà, bảo hiểm) chứ
                    không phải bằng tiết kiệm hằng ngày.
                  </VerdictNote>
                )}
                {flexibleOver && (
                  <VerdictNote
                    tone="warn"
                    label="Chi linh hoạt vượt mục tiêu"
                    short={`Linh hoạt ${Math.round(flexiblePct)}% / mục tiêu 30%`}
                  >
                    {Math.round(flexiblePct)}% thu nhập (mục tiêu ≤ 30%). Đây lại là nhóm cắt được
                    nhanh nhất nếu cần.
                  </VerdictNote>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* C2 — Cố định vs Biến đổi trên tổng chi (donut + thanh) */}
      <SectionTitle as="h3" className="mb-2">
        Cố định vs Biến đổi <span className="text-fg-muted">(% chi tiêu)</span>
      </SectionTitle>
      {totalExpense <= 0 ? (
        <p className="rounded-lg bg-surface-page px-3 py-3 text-center text-sm text-fg-muted">
          Chưa có chi tiêu trong {periodNoun}.
        </p>
      ) : (
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div
            className="relative mx-auto h-36 w-36 shrink-0"
            role="img"
            aria-label={`Cố định ${pctOfExpense(folded.costFixed).toFixed(0)}%, biến đổi ${pctOfExpense(folded.costVariable).toFixed(0)}% trên tổng chi`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={c2Slices}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="60%"
                  outerRadius="100%"
                  isAnimationActive={!reducedMotion}
                  stroke="none"
                >
                  {c2Slices.map((s) => (
                    <Cell key={s.name} fill={s.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v, n) => [
                    `${formatMoney(Number(v), base)} · ${pctOfExpense(Number(v)).toFixed(0)}%`,
                    String(n),
                  ]}
                  contentStyle={{ borderRadius: 8, fontSize: CHART_TEXT_XS }}
                />
              </PieChart>
            </ResponsiveContainer>
            {/* Tâm donut ghi tổng Chi (thiết kế §C2) — trùng thông tin với các BreakdownRow
                bên dưới và aria-label ở trên, nên ẩn khỏi trình đọc màn hình để không đọc 3 lần. */}
            <div
              className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
              aria-hidden="true"
            >
              <span className="text-2xs leading-none text-fg-muted">Tổng chi</span>
              <span className="mt-0.5 text-sm font-bold leading-none tabular-nums text-fg-primary">
                {formatCompact(totalExpense, base)}
              </span>
            </div>
          </div>
          <div className="flex-1 space-y-2.5">
            <BreakdownRow
              icon="" name="Cố định"
              pct={pctOfExpense(folded.costFixed)} value={folded.costFixed}
              barPct={pctOfExpense(folded.costFixed)} color={C.need} base={base}
            />
            <BreakdownRow
              icon="" name="Biến đổi"
              pct={pctOfExpense(folded.costVariable)} value={folded.costVariable}
              barPct={pctOfExpense(folded.costVariable)} color={C.want} base={base}
            />
            {costUnclassified > 0 && (
              <BreakdownRow
                icon="" name="Chưa phân loại"
                pct={pctOfExpense(costUnclassified)} value={costUnclassified}
                barPct={pctOfExpense(costUnclassified)} color={C.unknown} base={base}
              />
            )}
          </div>
        </div>
      )}

      {/* Van xả khẩn cấp */}
      {folded.emergencyCut > 0 ? (
        <p className="mt-3 rounded-lg bg-state-warn-bg px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
          {visual ? (
            <>
              Cắt gấp được tối đa <b>{formatMoney(folded.emergencyCut, base)}</b> (
              {pctOfExpense(folded.emergencyCut).toFixed(0)}% chi)
            </>
          ) : (
            <>
              Cần cắt giảm gấp? Có thể cắt tối đa{' '}
              <b>{formatMoney(folded.emergencyCut, base)}</b> trong {periodNoun} ở nhóm Linh hoạt ×
              Biến đổi ({pctOfExpense(folded.emergencyCut).toFixed(0)}% chi tiêu).
            </>
          )}
        </p>
      ) : (
        totalExpense > 0 && (
          <p className="mt-3 text-center text-sm text-fg-muted">
            Phân loại chi tiêu để xem gợi ý cắt giảm khẩn cấp.
          </p>
        )
      )}
    </Card>
  )
}
