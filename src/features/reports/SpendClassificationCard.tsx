// Thẻ "Cơ cấu chi tiêu" — 2 trục độc lập:
// C1 Thiết yếu vs Linh hoạt (thanh, % thu nhập, mốc 50/30/20) — thanh vì cần vẽ vạch mục tiêu, donut không làm được.
// C2 Cố định vs Biến đổi (donut + thanh, % tổng chi).
// + "Van xả khẩn cấp": phần Linh hoạt × Biến đổi — khoản dễ cắt nhất khi cần gấp.
import { Link } from 'react-router-dom'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { formatMoney, type CurrencyCode } from '../../lib/money'
import type { ClassificationBreakdown } from './aggregate'
import { BreakdownRow } from './BreakdownRow'

const C = {
  need: '#16a34a',
  want: '#f59e0b',
  save: '#0ea5e9',
  unknown: '#9ca3af',
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
  // `data` chỉ gom được chi CÓ danh mục (categoryBreakdown bỏ giao dịch thiếu category_id,
  // vd hàng nhập từ CSV). Phần chênh so với tổng chi thật được gộp vào nhóm "Chưa phân loại"
  // để mẫu số của cả 2 trục = tổng chi thật và Tiết kiệm không bị thổi phồng.
  const totalExpense = Math.max(expense, data.totalExpense)
  const noCategory = totalExpense - data.totalExpense
  const needUnclassified = data.needUnclassified + noCategory
  const costUnclassified = data.costUnclassified + noCategory

  const savings = income - totalExpense
  const pctOfIncome = (v: number) => (income > 0 ? (v / income) * 100 : 0)
  const pctOfExpense = (v: number) => (totalExpense > 0 ? (v / totalExpense) * 100 : 0)

  // Trạng thái vượt/dưới mục tiêu — phải đọc được từ CHỮ, không chỉ dựa vào màu (yêu cầu a11y).
  const essentialPct = pctOfIncome(data.needEssential)
  const flexiblePct = pctOfIncome(data.needFlexible)
  const savingsPct = pctOfIncome(savings)
  const essentialOver = essentialPct > 50
  const flexibleOver = flexiblePct > 30
  const savingsUnder = savings < income * 0.2

  // Donut C2 (Cố định/Biến đổi) — chỉ lát > 0
  const c2Slices = [
    { name: 'Cố định', value: data.costFixed, color: C.need },
    { name: 'Biến đổi', value: data.costVariable, color: C.want },
    { name: 'Chưa phân loại', value: costUnclassified, color: C.unknown },
  ].filter((s) => s.value > 0)

  const reducedMotion =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  return (
    <section className="rounded-xl bg-white p-3 shadow-sm dark:bg-gray-900">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400">Cơ cấu chi tiêu</h2>
        {unclassifiedCount > 0 && (
          <Link
            to="/settings/categories/classify"
            className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-900/30"
          >
            Phân loại {unclassifiedCount} danh mục →
          </Link>
        )}
      </div>

      {/* C1 — 50/30/20 trên thu nhập */}
      <h3 className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">
        Thiết yếu vs Linh hoạt <span className="text-gray-400 dark:text-gray-500">(% thu nhập · quy tắc 50/30/20)</span>
      </h3>
      {income <= 0 ? (
        <p className="mb-3 rounded-lg bg-gray-50 px-3 py-3 text-center text-xs text-gray-500 dark:bg-gray-950 dark:text-gray-400">
          Cần có thu nhập trong {periodNoun} để tính tỷ lệ 50/30/20.
        </p>
      ) : (
        <div className="mb-4 space-y-2.5">
          <BreakdownRow
            icon=""
            name={essentialOver ? 'Nhu cầu (thiết yếu) — vượt mục tiêu' : 'Nhu cầu (thiết yếu)'}
            pct={essentialPct} value={data.needEssential}
            barPct={essentialPct} color={C.need} base={base}
            targetPct={50} warn={essentialOver}
          />
          <BreakdownRow
            icon=""
            name={flexibleOver ? 'Sở thích (linh hoạt) — vượt mục tiêu' : 'Sở thích (linh hoạt)'}
            pct={flexiblePct} value={data.needFlexible}
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
        </div>
      )}

      {/* C2 — Cố định vs Biến đổi trên tổng chi (donut + thanh) */}
      <h3 className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">
        Cố định vs Biến đổi <span className="text-gray-400 dark:text-gray-500">(% chi tiêu)</span>
      </h3>
      {totalExpense <= 0 ? (
        <p className="rounded-lg bg-gray-50 px-3 py-3 text-center text-xs text-gray-500 dark:bg-gray-950 dark:text-gray-400">
          Chưa có chi tiêu trong {periodNoun}.
        </p>
      ) : (
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div
            className="mx-auto h-36 w-36 shrink-0"
            role="img"
            aria-label={`Cố định ${pctOfExpense(data.costFixed).toFixed(0)}%, biến đổi ${pctOfExpense(data.costVariable).toFixed(0)}% trên tổng chi`}
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
                  contentStyle={{ borderRadius: 8, fontSize: 12 }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex-1 space-y-2.5">
            <BreakdownRow
              icon="" name="Cố định"
              pct={pctOfExpense(data.costFixed)} value={data.costFixed}
              barPct={pctOfExpense(data.costFixed)} color={C.need} base={base}
            />
            <BreakdownRow
              icon="" name="Biến đổi"
              pct={pctOfExpense(data.costVariable)} value={data.costVariable}
              barPct={pctOfExpense(data.costVariable)} color={C.want} base={base}
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
      {data.emergencyCut > 0 ? (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
          Cần cắt giảm gấp? Có thể cắt tối đa <b>{formatMoney(data.emergencyCut, base)}</b> trong{' '}
          {periodNoun} ở nhóm Linh hoạt × Biến đổi ({pctOfExpense(data.emergencyCut).toFixed(0)}% chi tiêu).
        </p>
      ) : (
        totalExpense > 0 && (
          <p className="mt-3 text-center text-xs text-gray-400 dark:text-gray-500">
            Phân loại chi tiêu để xem gợi ý cắt giảm khẩn cấp.
          </p>
        )
      )}
    </section>
  )
}
