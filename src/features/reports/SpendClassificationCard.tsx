// Thẻ "Cơ cấu chi tiêu" — 2 trục độc lập:
// C1 Cơ cấu theo phương pháp đang chọn (thanh, % thu nhập, mốc theo phương pháp) — thanh vì cần vẽ vạch mục tiêu, donut không làm được.
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
import { useProfile } from '../../hooks/queries'
import { resolveMethod, type AxisKey } from '../budgets/budgetMethods'
import { axisMissSummary, axisProgress, sharePct } from '../budgets/axisTargets'

const C = {
  need: '#16a34a',
  want: '#f59e0b',
  save: '#0ea5e9',
  // var(--fg-muted): gray-400 chỉ 2,54:1, không đạt 3:1 cho đồ hoạ mang thông tin.
  unknown: 'var(--fg-muted)',
} as const

/** Màu theo khoá khoản của C1 — hex trần là quy ước sẵn của file này cho màu đồ thị (xem `C` ở trên). */
const BUCKET_COLOR: Record<AxisKey, string> = {
  essential: C.need,
  flexible: C.want,
  education: '#8b5cf6',
  giving: '#ec4899',
  buffer: '#64748b',
  living: C.want,
  allSpend: C.want,
  savings: C.save,
}

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
  const { data: profile } = useProfile()
  const method = resolveMethod(profile)
  // `data` chỉ gom được chi CÓ danh mục (categoryBreakdown bỏ giao dịch thiếu category_id,
  // vd hàng nhập từ CSV). Phần chênh so với tổng chi thật được gộp vào nhóm "Chưa phân loại"
  // để mẫu số của cả 2 trục = tổng chi thật và Tiết kiệm không bị thổi phồng.
  const folded = foldUncategorized(data, expense)
  const totalExpense = folded.totalExpense
  const costUnclassified = folded.costUnclassified

  const pctOfExpense = (v: number) => (totalExpense > 0 ? (v / totalExpense) * 100 : 0)

  // Dùng LẠI đúng phép tính của tab Ngân sách — hai tab không thể lệch nhau.
  const axis = axisProgress(income, folded, method)
  const miss = axis ? axisMissSummary(axis.lines) : null

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

      {/* C1 — cơ cấu theo phương pháp đang chọn, trên thu nhập */}
      <SectionTitle as="h3" className="mb-2">
        Cơ cấu so với mốc <span className="text-fg-muted">(% thu nhập · {method.name})</span>
      </SectionTitle>
      {income <= 0 || !axis ? (
        <p className="mb-3 rounded-lg bg-surface-page px-3 py-3 text-center text-sm text-fg-muted">
          Cần có thu nhập trong {periodNoun} để tính cơ cấu.
        </p>
      ) : (
        <div className="mb-4 space-y-2.5">
          {axis.lines.map((l) => {
            const over = !l.ok
            const suffix = over ? (l.direction === 'cap' ? ' — vượt mục tiêu' : ' — dưới mục tiêu') : ''
            return (
              <BreakdownRow
                key={l.key}
                icon=""
                name={`${l.label}${suffix}`}
                pct={sharePct(l.share)}
                value={l.actual}
                barPct={Math.max(l.share, 0) * 100}
                color={BUCKET_COLOR[l.key]}
                base={base}
                targetPct={Math.round(l.targetShare * 100)}
                warn={over}
              />
            )
          })}
          {axis.unclassified > 0 && (
            <BreakdownRow
              icon="" name="Chi chưa phân loại"
              pct={sharePct(axis.unclassified / axis.income)} value={axis.unclassified}
              barPct={(axis.unclassified / axis.income) * 100} color={C.unknown} base={base}
            />
          )}

          {/* Các thanh trên đã có vạch mục tiêu và chữ "vượt/dưới mục tiêu", nhưng người
              đọc vẫn phải tự tổng hợp thành một kết luận. Nói thẳng ra đây. */}
          <div className="space-y-1.5 pt-0.5">
            {miss && miss.missed.length === 0 ? (
              <VerdictNote tone="good" short={`Cơ cấu ${method.name} đạt cả ${axis.lines.length} mốc`}>
                Cả {axis.lines.length} khoản đều trong mốc {method.name} — cơ cấu {periodNoun} không có gì phải sửa.
              </VerdictNote>
            ) : (
              miss?.missed.map((l) =>
                l.key === 'savings' ? (
                  <VerdictNote
                    key={l.key}
                    tone={l.actual < 0 ? 'bad' : 'warn'}
                    label="Để dành dưới mục tiêu"
                    short={l.actual < 0 ? 'Chi vượt thu' : `Để dành ${sharePct(l.share)}% / mục tiêu ${Math.round(l.targetShare * 100)}%`}
                  >
                    {l.actual < 0
                      ? `chi vượt thu ${periodNoun}, tức là đang rút vào tiền cũ.`
                      : `giữ được ${sharePct(l.share)}% thu nhập, mục tiêu là ${Math.round(l.targetShare * 100)}%.`}
                  </VerdictNote>
                ) : (
                  <VerdictNote
                    key={l.key}
                    tone="warn"
                    label={`${l.label} vượt mục tiêu`}
                    short={`${l.label} ${sharePct(l.share)}% / mục tiêu ${Math.round(l.targetShare * 100)}%`}
                  >
                    {sharePct(l.share)}% thu nhập (mục tiêu ≤ {Math.round(l.targetShare * 100)}%) — {l.hint}.
                  </VerdictNote>
                ),
              )
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
