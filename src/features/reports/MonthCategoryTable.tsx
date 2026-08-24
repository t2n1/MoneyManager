// Khối chính của tab "Tháng này" (26a): MỘT bảng, một dòng một danh mục.
//
// Thay ba thẻ của bản trước cùng nói về chi theo danh mục — "Cơ cấu chi theo danh mục",
// "So sánh chi theo danh mục", "Ít danh mục nhiều tiền". Ba thẻ đó vẽ lại cùng một bộ số
// bằng ba hình khác nhau, cách nhau nửa màn hình, nên không ai đối chiếu được chúng.
//
// Cột số `minmax(…, auto)`, cột chữ `minmax(0, 1fr)` + ellipsis — ràng buộc D1 của gói
// việc: VND dài gấp đôi ¥ cùng hàng (`₫291,400,000`) và đây là chỗ tràn đã gặp khi dựng
// prototype.

import { useState } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { SectionTitle, Card, Money, Num, deltaTone, signedPct, Sparkline } from '../../components/ui'
import { Guide } from '../../components/Guide'
import type { CurrencyCode } from '../../lib/money'
import {
  budgetCellLabel,
  concentration,
  sortMonthTable,
  type MonthTableRow,
  type MonthTableSort,
} from './monthReport'

const TONE_CLASS: Record<ReturnType<typeof budgetCellLabel>['tone'], string> = {
  over: 'text-money-out',
  warn: 'text-fg-warn',
  ok: 'text-fg-secondary',
  muted: 'text-fg-muted',
}

/** Δ: dương là chi TĂNG nên tô màu chi; không so được thì in "mới", không in 0%. */
function DeltaCell({ deltaPct, isNew }: { deltaPct: number | null; isNew: boolean }) {
  if (deltaPct === null && isNew) {
    return <span className="text-2xs text-fg-muted">mới</span>
  }
  return <Num tone={deltaTone(deltaPct)}>{signedPct(deltaPct)}</Num>
}

export function MonthCategoryTable({
  rows,
  total,
  monthLabel,
  base,
  overCount,
  approx = false,
}: {
  rows: readonly MonthTableRow[]
  /** Tổng chi của kỳ — hàng chân bảng. Truyền riêng vì nó là tổng THẬT (gồm cả khoản
   *  không có danh mục), không phải tổng của mấy dòng trên. */
  total: number
  /** "Tháng 8" — đứng đầu cột số để biết cột đang nói về kỳ nào. */
  monthLabel: string
  base: CurrencyCode
  /** Số danh mục vượt hạn mức — hiện ở ô Hạn mức của hàng tổng. */
  overCount: number
  approx?: boolean
}) {
  const [sort, setSort] = useState<MonthTableSort>('amount')
  const sorted = sortMonthTable(rows, sort)
  const conc = concentration(rows)

  if (rows.length === 0) {
    return (
      <Card as="section" elevation="panel" padding="panel">
        <p className="text-sm text-fg-muted">Kỳ này chưa có khoản chi nào có danh mục.</p>
      </Card>
    )
  }

  // Một lưới cho CẢ header, các dòng và hàng tổng — ba lưới riêng là ba chỗ để lệch cột.
  // Đường tí hon ẩn dưới `lg`: ở 390px nó lấy chỗ của cột tiền, mà cột tiền mới là cột
  // người ta mở bảng để đọc (§6 · mobile 17a).
  const GRID =
    'grid grid-cols-[minmax(0,1fr)_minmax(5.5rem,auto)_2.5rem_minmax(5rem,auto)_minmax(4rem,auto)_minmax(3.5rem,auto)] items-center gap-x-2 lg:grid-cols-[minmax(0,1fr)_minmax(5.5rem,auto)_2.5rem_minmax(5rem,auto)_minmax(4rem,auto)_3.75rem_minmax(3.5rem,auto)]'

  const sortBtn = (value: MonthTableSort, label: string, extra = '') => (
    <button
      type="button"
      onClick={() => setSort(value)}
      aria-pressed={sort === value}
      className={`inline-flex min-h-11 items-center justify-end gap-0.5 text-right text-2xs uppercase tracking-label transition lg:min-h-0 ${extra} ${
        sort === value ? 'text-fg-primary' : 'text-fg-muted hover:text-fg-secondary'
      }`}
    >
      {label}
      {sort === value ? (
        <ArrowDown className="h-3 w-3 shrink-0" strokeWidth={1.6} aria-hidden />
      ) : (
        <ArrowUp className="h-3 w-3 shrink-0 opacity-0" strokeWidth={1.6} aria-hidden />
      )}
    </button>
  )

  return (
    <Card as="section" elevation="panel" padding="none">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-border-panel px-4 py-3">
        <SectionTitle as="h3">Chi tiêu {monthLabel}</SectionTitle>
        <Money
          amount={total}
          currency={base}
          tone="out"
          approx={approx}
          className="text-sm font-semibold"
        />
        {/* Thay hẳn thẻ "Ít danh mục, nhiều tiền": nó vẽ lại đúng mấy dòng đầu của bảng
            này ở một thẻ riêng. Ở đây nó là một mệnh đề trong chính tiêu đề bảng. */}
        {conc && (
          <span className="text-2xs text-fg-muted">
            · {conc.count} danh mục giữ {conc.pct}%
          </span>
        )}
      </div>

      {/* role="table" + aria-sort: bảng dựng bằng grid nên trình đọc màn hình không tự
          suy ra được cấu trúc; không khai thì nó đọc thành một dãy chữ liền. */}
      <div role="table" aria-label={`Chi theo danh mục ${monthLabel}`}>
        <div
          role="row"
          className={`${GRID} border-b border-border-panel bg-surface-chrome px-4 py-2.5`}
        >
          <span role="columnheader" className="min-w-0">
            {sortBtn('name', 'Danh mục', 'justify-start text-left')}
          </span>
          <span role="columnheader" className="text-right">
            {sortBtn('amount', monthLabel)}
          </span>
          <span
            role="columnheader"
            className="text-right text-2xs uppercase tracking-label text-fg-muted"
          >
            %
          </span>
          <span
            role="columnheader"
            className="text-right text-2xs uppercase tracking-label text-fg-muted"
          >
            TB 3 th
          </span>
          <span role="columnheader" className="text-right">
            {sortBtn('delta', 'Δ')}
          </span>
          <span
            role="columnheader"
            className="hidden text-right text-2xs uppercase tracking-label text-fg-muted lg:block"
          >
            6 th
          </span>
          <span
            role="columnheader"
            className="text-right text-2xs uppercase tracking-label text-fg-muted"
          >
            Hạn mức
          </span>
        </div>

        <ul>
          {sorted.map((r) => {
            const budget = budgetCellLabel(r)
            return (
              <li
                key={r.categoryId}
                role="row"
                className={`${GRID} border-b border-border-subtle px-4 py-2.5 transition hover:bg-surface-sunken`}
              >
                <span role="cell" className="flex min-w-0 items-center gap-1.5">
                  <span aria-hidden className="shrink-0 text-sm">
                    {r.icon}
                  </span>
                  <span className="min-w-0 truncate text-sm text-fg-primary">{r.name}</span>
                </span>
                <span role="cell" className="text-right">
                  <Money
                    amount={r.thisMonth}
                    currency={base}
                    approx={approx}
                    className="text-sm"
                  />
                </span>
                <span role="cell" className="text-right text-sm">
                  <Num tone="muted">{r.pct}</Num>
                </span>
                <span role="cell" className="text-right">
                  <Money
                    amount={r.avg3}
                    currency={base}
                    approx={approx}
                    className="text-sm text-fg-muted"
                  />
                </span>
                <span role="cell" className="text-right text-sm">
                  <DeltaCell deltaPct={r.deltaPct} isNew={r.isNew} />
                </span>
                <span role="cell" className="hidden justify-end lg:flex">
                  {r.spark.length >= 2 && (
                    <Sparkline values={r.spark} label={`Chi 6 tháng của ${r.name}`} />
                  )}
                </span>
                <span role="cell" className={`text-right text-sm ${TONE_CLASS[budget.tone]}`}>
                  <Num tone="neutral" className="text-inherit">
                    {budget.text}
                  </Num>
                </span>
              </li>
            )
          })}
        </ul>

        {/* Hàng tổng ở CHÂN bảng, nền chrome như header: tổng ở đầu bảng thì mắt đọc nó
            trước khi biết nó là tổng của cái gì. */}
        <div role="row" className={`${GRID} bg-surface-chrome px-4 py-2.5`}>
          <span role="cell" className="min-w-0 truncate text-2xs font-semibold text-fg-secondary">
            Tổng · {rows.length} danh mục
          </span>
          <span role="cell" className="text-right">
            <Money
              amount={total}
              currency={base}
              tone="out"
              approx={approx}
              className="text-sm font-semibold"
            />
          </span>
          <span role="cell" className="text-right text-sm">
            <Num tone="muted">100</Num>
          </span>
          <span role="cell" className="text-right" />
          <span role="cell" className="text-right" />
          <span role="cell" className="hidden lg:block" />
          <span role="cell" className="text-right text-sm">
            <Num tone={overCount > 0 ? 'out' : 'muted'}>
              {overCount > 0 ? `${overCount} vượt` : '—'}
            </Num>
          </span>
        </div>
      </div>

      <Guide className="border-t border-border-panel px-4 py-2.5 text-2xs text-fg-muted">
        Cột <b>Δ</b> so với trung bình 3 tháng trước và đã cắt về cùng số ngày của kỳ đang
        chạy — không cắt thì giữa tháng mọi dòng đều đọc ra “giảm”. Danh mục mới hiện “mới”
        thay vì một phần trăm, vì chưa có mốc nào để so.
      </Guide>
    </Card>
  )
}
