// Cột phụ của Sổ — bản vẽ 10a, bề rộng 420px (§1.4).
//
// Vì sao Sổ cần cột phụ: danh sách giao dịch chỉ đi theo THỜI GIAN, nên nó không trả lời
// được ba câu người ta hay hỏi khi mở Sổ — "tháng này ngày nào nặng", "còn bao nhiêu
// khoản chưa phân loại", "tiền đi đâu nhiều nhất". Trước bản này cả trang bị bó trong
// `max-w-2xl` (672px), tức trên màn 1679px có ~1000px bỏ trống bên cạnh một danh sách
// đang phải cuộn.
//
// Chỉ hiện từ `lg`. Ở mobile (17a) bộ lọc quay về ngay trên danh sách và ba khối kia
// không hiện — 390px không có chỗ cho một cột phụ, và cuộn qua chúng để tới danh sách
// thì chúng đang chắn đường tới thứ người ta mở màn này để xem.
import { Link } from 'react-router-dom'
import { Card, Money, SectionTitle } from '../../components/ui'
import { formatMonthLabel, type MonthKey } from '../../lib/dates'
import type { CurrencyCode } from '../../lib/money'
import type { CategorySlice } from '../reports/aggregate'
import { HEAT_LEVELS, type Heatmap } from './ledgerHeat'

/** Nhãn hàng thứ, CN đứng đầu — khớp `leadingBlanks` của `monthHeatmap`. */
const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'] as const

/**
 * Nền của ô theo mức chi.
 *
 * Alpha cao nhất chỉ 35%: số ngày in ngay trong ô, và nó dùng `text-fg-primary` ở MỌI
 * mức — một ô đậm hơn nữa thì phải đổi màu chữ theo mức, tức hai nhánh màu phải tự đo
 * contrast riêng. Giữ nền nhạt thì một màu chữ đúng cho cả năm mức, và nó vẫn đủ để
 * đọc ra hình (mắt so các ô với nhau, không đọc giá trị tuyệt đối của một ô).
 */
const HEAT_BG = [
  'bg-transparent',
  'bg-money-out/10',
  'bg-money-out/18',
  'bg-money-out/26',
  'bg-money-out/35',
] as const

interface Props {
  monthKey: MonthKey
  heat: Heatmap
  /** Ba danh mục chi nhiều nhất của kỳ, đã sắp giảm dần. */
  topCategories: CategorySlice[]
  /** Tên danh mục theo id — `CategorySlice` chỉ mang id và số tiền. */
  nameOf: (categoryId: string) => string
  /** Tổng chi của kỳ — mẫu số của thanh so sánh. */
  expenseTotal: number
  base: CurrencyCode
  /** Khối bộ lọc — truyền vào thay vì dựng ở đây, vì ở mobile nó về chỗ khác. */
  filterBar: React.ReactNode
}

export function LedgerAside({
  monthKey,
  heat,
  topCategories,
  nameOf,
  expenseTotal,
  base,
  filterBar,
}: Props) {
  return (
    // 26.25rem = 420px của bản vẽ 10a, nhưng theo REM chứ px (§13): cột này chứa toàn
    // chữ và số, nên ở cỡ chữ "Rất lớn" (--app-font-scale 1,25) một bề rộng px cứng
    // không giãn theo — dòng "Chi nhiều nhất" bị ép xuống ba dòng và nhãn tháng bị cắt.
    // Theo rem thì cột rộng ra cùng nhịp với chữ trong nó.
    <aside className="hidden w-[26.25rem] shrink-0 flex-col gap-2.5 lg:flex">
      {/* --- Tháng trong một hình --------------------------------------------------- */}
      <Card elevation="panel" padding="panel" as="section">
        <SectionTitle role="micro">
          {formatMonthLabel(monthKey)} trong một hình
        </SectionTitle>

        <div className="mt-2 grid grid-cols-7 gap-1">
          {WEEKDAYS.map((w) => (
            <span key={w} className="text-center text-2xs text-fg-muted">
              {w}
            </span>
          ))}
          {/* Ô trống đầu kỳ. aria-hidden: chúng là chỗ căn cột, không phải ngày nào. */}
          {Array.from({ length: heat.leadingBlanks }, (_, i) => (
            <span key={`blank-${i}`} aria-hidden />
          ))}
          {heat.cells.map((c) => (
            <span
              key={c.iso}
              // title chứ không chỉ màu: mức đậm một mình là kênh thông tin duy nhất,
              // mà người không phân biệt được sắc đỏ vẫn phải đọc được ngày nào nặng.
              title={
                c.future
                  ? `${c.iso} · chưa tới`
                  : `${c.iso} · chi ${c.expense.toLocaleString('en-US')}`
              }
              className={`flex h-6 items-center justify-center rounded text-2xs tabular-nums text-fg-primary ${
                c.future
                  ? 'border border-dashed border-border-panel text-fg-muted'
                  : c.netIn
                    ? 'bg-money-in/25'
                    : HEAT_BG[Math.min(c.level, HEAT_LEVELS)]
              }`}
            >
              {c.day}
            </span>
          ))}
        </div>

        <div className="mt-2 flex items-center gap-3 border-t border-border-subtle pt-2 text-2xs text-fg-muted">
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded bg-money-out/35" aria-hidden /> chi
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded bg-money-in/25" aria-hidden /> thu &gt; chi
          </span>
          <span className="flex items-center gap-1">
            <span
              className="h-2.5 w-2.5 rounded border border-dashed border-border-panel"
              aria-hidden
            />{' '}
            chưa tới
          </span>
        </div>
      </Card>

      {/* --- Bộ lọc + chưa phân loại (khối do trang truyền vào) --------------------- */}
      {filterBar}

      {/* --- Top danh mục ---------------------------------------------------------- */}
      {topCategories.length > 0 && (
        <Card elevation="panel" padding="panel" as="section">
          <SectionTitle role="micro">
            Top danh mục {formatMonthLabel(monthKey).toLowerCase()}
          </SectionTitle>
          <ul className="mt-2 flex flex-col gap-2">
            {topCategories.map((s) => {
              const pct = expenseTotal > 0 ? Math.round((s.amount / expenseTotal) * 100) : 0
              return (
                <li key={s.categoryId}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate text-sm text-fg-secondary">
                      {nameOf(s.categoryId)}
                    </span>
                    <Money
                      amount={s.amount}
                      currency={base}
                      tone="neutral"
                      className="shrink-0 text-sm font-medium"
                    />
                  </div>
                  {/* Thanh so sánh: tỷ lệ trên TỔNG CHI của kỳ, không trên danh mục lớn
                      nhất — "Nhà ở chiếm 34% tiền ra" nói được điều gì, còn "Nhà ở dài
                      bằng 100% của chính nó" thì không. */}
                  <div
                    className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-sunken"
                    role="img"
                    aria-label={`${pct}% tổng chi`}
                  >
                    <div className="h-full rounded-full bg-money-out" style={{ width: `${pct}%` }} />
                  </div>
                </li>
              )
            })}
          </ul>
          <Link
            to="/reports?view=month"
            className="mt-2.5 inline-block text-2xs font-medium text-fg-accent hover:underline"
          >
            Xem cơ cấu đầy đủ →
          </Link>
        </Card>
      )}
    </aside>
  )
}
