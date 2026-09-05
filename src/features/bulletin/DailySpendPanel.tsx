// "Chi từng ngày trong tháng" — CỘT mỗi ngày, để thấy ngày nào vọt lên và vì sao (B41–B48).
//
// Vì sao ở Bản tin mà không ở Ngân sách: Bản tin trả lời "tình hình thế nào", đúng câu
// hỏi này; Ngân sách trả lời "có vượt trần không". Nó cũng ghép cặp thu-phóng với "Dòng
// tiền 8 tháng" ngay trên — thẻ kia mỗi cột một tháng, thẻ này mỗi cột một ngày, và cả
// hai đọc cùng `activeMonthKey` nên bấm một cột là thẻ này đổi theo.
//
// CỘT chứ không ĐƯỜNG (B41). Đường nội suy giữa hai ngày, tức vẽ ra một dòng tiền "chảy"
// từ ¥124.696 xuống ¥0 qua ngày 2–5 — nhưng chi mỗi ngày là SỰ KIỆN RỜI RẠC, không phải
// một đại lượng liên tục. Đường còn kéo theo hai vấn đề nữa: phải cắt ở `cutoffISO` bằng
// `connectNulls={false}` để tránh đoạn phẳng giả, và ngày `total = 0` vẽ ra một điểm nằm
// trên trục không phân biệt được với ngày chưa tới.
//
// Vẽ bằng div chứ KHÔNG recharts — cùng ba lý do đã ghi ở CashflowPanel, cộng ba lý do
// riêng của thẻ này: cột bị cắt cần một mũ vạch chéo, ngày chưa tới cần viền nét đứt, và
// cột âm phải mọc xuống dưới đường 0. Cả ba đều là hình vẽ mà `<Bar>` không nhận.
//
// Ba quyết định về hình còn giữ nguyên từ bản đường:
//   1. Kết luận nói bằng CHỮ ở trên biểu đồ, không vẽ chữ trong vùng vẽ (đỉnh rơi vào
//      ngày 1 hay 31 là chữ tràn ra ngoài và bị cắt).
//   2. Câu "ngày đó có biến động gì" KHÔNG được phụ thuộc vào việc trỏ đúng một cột rộng
//      8px — nên nó nằm ở danh sách "ba ngày đáng hỏi" bên dưới, luôn có mặt (ở desktop
//      danh sách đó là `sr-only`, vì ở đó mỗi cột đã có nhãn số riêng).
//   3. Đường ngang là TRUNG VỊ ngày có chi, không phải trung bình (xem dailySpike.ts).
import { useLayoutEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, Money, Num, SectionTitle, SegmentedControl, deltaTone, signedPct } from '../../components/ui'
import { formatCompact, type CurrencyCode } from '../../lib/money'
import type { CategoryRow } from '../../types/database.types'
import type { PeriodCompare } from '../reports/periodCompare'
import type { CumulativeCompare } from '../reports/cumulativeCompare'
import {
  axisCeiling,
  dayLabel,
  daysWorthAsking,
  labelThreshold,
  type DailySpendSeries,
  type DaySpend,
  type DayTopExpense,
} from '../reports/dailySpike'
import { dailyHeadline } from '../reports/dailyHeadline'
import type { DayTagCells } from '../reports/dayTagCells'
import type { TagBudgetLine } from '../tags/budget'
import { TAG_HEX, tagColor } from '../tags/colors'
import { AXIS_CAP, AXIS_GAP, AXIS_LEAD, AXIS_TOTAL, CELL_GAP_PX, dayLabelStep } from './dayAxisCols'
import { DayTagStrip } from './DayTagStrip'

/** 'all' = mọi khoản · 'flex' = bỏ danh mục `cost_type = 'fixed'`. */
export type DailyScope = 'all' | 'flex'

const SCOPE_KEY = 'bulletin.dailySpend.scope'

/**
 * MẶC ĐỊNH LÀ 'all' — luật CHẶN của B46.1, không phải sở thích.
 *
 * Thẻ này ngồi cùng màn với ô CHI THÁNG và khối Ngân sách. Mặc định lọc thì tổng của
 * biểu đồ lệch cả trăm nghìn yên so với ô ngay bên trên mà không dòng nào giải thích —
 * đúng "lỗi tệ nhất mà một app tiền có thể mắc" mà chú thích đầu dailySpike.ts gọi tên.
 *
 * Đọc trong hàm chứ không ở cấp module: import file này không được chạm localStorage.
 * Là sở thích XEM nên giữ ở máy, không vào DB — cùng quy ước `budget.sort`.
 */
export function readDailyScope(): DailyScope {
  try {
    return localStorage.getItem(SCOPE_KEY) === 'flex' ? 'flex' : 'all'
  } catch {
    return 'all'
  }
}

export function writeDailyScope(scope: DailyScope): void {
  try {
    if (scope === 'flex') localStorage.setItem(SCOPE_KEY, 'flex')
    else localStorage.removeItem(SCOPE_KEY)
  } catch {
    // bỏ qua
  }
}

const SCOPE_ITEMS = [
  { value: 'all' as const, label: 'Tất cả' },
  { value: 'flex' as const, label: 'Bỏ cố định' },
]

/** 'bars' = cột từng ngày (mặc định) · 'yoy' = đường lũy kế so cùng kỳ năm ngoái. */
export type DailyChart = 'bars' | 'yoy'

const CHART_KEY = 'bulletin.dailySpend.chart'

/** Cùng khuôn localStorage với công tắc phạm vi: sở thích XEM, giữ ở máy, không vào DB. */
function readDailyChart(): DailyChart {
  try {
    return localStorage.getItem(CHART_KEY) === 'yoy' ? 'yoy' : 'bars'
  } catch {
    return 'bars'
  }
}

function writeDailyChart(chart: DailyChart): void {
  try {
    if (chart === 'yoy') localStorage.setItem(CHART_KEY, 'yoy')
    else localStorage.removeItem(CHART_KEY)
  } catch {
    // bỏ qua
  }
}

const CHART_ITEMS = [
  { value: 'bars' as const, label: 'Cột ngày' },
  { value: 'yoy' as const, label: 'So năm ngoái' },
]

// Vùng vẽ 11rem. Ba dải cộng lại đúng 100%, đừng đổi một số mà quên hai số kia:
//   NEG  1,375rem dưới đường 0 — chỗ cho cột hoàn tiền mọc XUỐNG (B47.2).
//   LABEL 0,875rem trên đỉnh cột cao nhất — chỗ cho nhãn số, để nó không tràn khỏi thẻ.
//   POS  phần còn lại, tức thang thật của cột dương.
const NEG_PCT = 12.5
const LABEL_PCT = 7.95
const POS_PCT = 100 - NEG_PCT - LABEL_PCT

/** Vạch chéo trên đầu cột bị cắt (B42.2). Cột phẳng đọc ra "đúng bằng mức đó". */
const HATCH = 'repeating-linear-gradient(135deg, var(--money-out) 0 3px, var(--surface) 3px 6px)'

interface Props {
  /** Chuỗi ĐÃ áp công tắc — `typical` và `peakIndex` phải tính trên tập đã lọc (B46.3). */
  series: DailySpendSeries
  /** Tổng chi khi KHÔNG lọc. Chỉ để in cạnh số đã lọc, không dùng để tính gì (B46.2). */
  fullTotal: number
  cells: DayTagCells
  tagLines: readonly TagBudgetLine[]
  /** So với cùng số ngày của tháng trước (B47.3). null = không có tháng trước để so. */
  compare: PeriodCompare | null
  /** Lũy kế so cùng kỳ NĂM NGOÁI. null = năm ngoái không có dữ liệu tháng này → giấu công tắc. */
  yoy: CumulativeCompare | null
  /** Tháng cùng kỳ có khoản thiếu tỷ giá → số của đường mờ là ước chừng. */
  yoyApprox: boolean
  /** Nhãn tháng cùng kỳ, ví dụ "2025/09" — cùng khuôn formatMonthLabel của cả app. */
  priorLabel: string
  /** Ngày cuối ĐÃ XẢY RA: hôm nay nếu đang xem tháng này, ngày cuối tháng nếu tháng đã qua. */
  cutoffISO: string
  base: CurrencyCode
  /** Tra danh mục để đặt tên cho khoản — dùng lại đúng hàm Bản tin đưa cho dòng giao dịch. */
  categoryOf: (id: string | null) => CategoryRow | undefined
  approx: boolean
  scope: DailyScope
  onScope: (scope: DailyScope) => void
}

/** Tên một khoản chi: ghi chú của người dùng nếu có, không thì tên danh mục. */
function labelOf(t: DayTopExpense, categoryOf: Props['categoryOf']): string {
  const note = t.note?.trim()
  if (note) return note
  const cat = categoryOf(t.categoryId)
  return cat ? `${cat.icon} ${cat.name}` : 'Chưa phân loại'
}

/**
 * Bề rộng MỘT cột, đo thật.
 *
 * B43 chốt nhãn số theo bề rộng cột chứ không theo breakpoint: thẻ chiếm hết chiều ngang
 * Bản tin, mà chiều ngang đó đổi theo cửa sổ, theo bố cục cột của trang, và theo
 * `--app-font-scale`. Một `lg:` cứng sẽ đúng ở đúng một bề rộng.
 *
 * Cùng khuôn ResizeObserver mà SegmentedControl dùng để đặt nền ô đang chọn — và cùng lý
 * do: mấy lần đổi bề rộng KHÔNG đi qua React (kéo cạnh cửa sổ, phóng cỡ chữ, font vừa nạp).
 */
function useColumnWidth(count: number): [(el: HTMLDivElement | null) => void, number] {
  // NODE giữ trong state, không phải trong `useRef`. Với ref thì effect chạy MỘT lần lúc
  // `count` đổi, và ở thẻ này `count` là 31 ngay từ lượt bày đầu (dải ngày đầy đủ có trước
  // cả khi giao dịch về) trong khi vùng vẽ chưa tồn tại — thẻ đang ở nhánh "chưa có khoản
  // chi nào". Effect chạy với `ref.current === null`, rồi không bao giờ chạy lại vì `count`
  // đứng yên, và mọi cột mất nhãn số vĩnh viễn. Đo được ngay ở lượt chạy thật đầu tiên.
  const [node, setNode] = useState<HTMLDivElement | null>(null)
  const [w, setW] = useState(0)
  useLayoutEffect(() => {
    if (!node || count <= 0) return
    const measure = () => {
      const next = (node.clientWidth - CELL_GAP_PX * (count - 1)) / count
      // Chốt an toàn: trả về CHÍNH giá trị cũ khi số đo không nhúc nhích, nếu không
      // ResizeObserver + setState thành một vòng bày-lại.
      setW((cur) => (Math.abs(next - cur) < 0.5 ? cur : next))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(node)
    return () => ro.disconnect()
  }, [node, count])
  return [setNode, w]
}

/**
 * Thẻ chi tiết của một ngày khi rê chuột: hôm đó tiêu bao nhiêu, vào những khoản nào, và
 * mang nhãn gì.
 *
 * ĐÂY LÀ PHẦN THÊM, không phải phần gánh nội dung. Chú thích đầu file đã chốt: câu hỏi
 * "ngày đó có biến động gì" không được phụ thuộc vào việc trỏ đúng một cột rộng 8px — nên
 * danh sách "ba ngày đáng hỏi" vẫn là bản luôn có mặt, và thẻ này chỉ trả lời cùng câu đó
 * cho MỌI ngày, khi có chuột để hỏi.
 *
 * Tự né hai mép thay vì luôn canh giữa: thẻ rộng tới 14rem, còn cột ngày 1 và ngày 31 nằm
 * sát biên vùng vẽ — canh giữa theo chúng là một nửa thẻ tràn ra ngoài viền panel.
 */
function DayCard({
  day,
  index,
  count,
  isFuture,
  typical,
  tagsOfDay,
  base,
  categoryOf,
  approx,
}: {
  day: DaySpend
  index: number
  count: number
  isFuture: boolean
  typical: number
  tagsOfDay: { name: string; color: string; amount: number }[]
  base: CurrencyCode
  categoryOf: Props['categoryOf']
  approx: boolean
}) {
  const edge = index < count / 4 ? 'left' : index > (count * 3) / 4 ? 'right' : 'mid'
  const anchor =
    edge === 'left'
      ? { left: 0 }
      : edge === 'right'
        ? { right: 0 }
        : { left: `${((index + 0.5) / count) * 100}%`, transform: 'translateX(-50%)' }

  return (
    // `pointer-events-none`: thẻ nổi ngay trên hàng cột, nên nếu nó nhận chuột thì rê từ
    // cột này sang cột kia sẽ đi qua chính nó và `onMouseLeave` của hàng bắn ra — thẻ tắt
    // giữa lúc đang đọc.
    <div
      className="pointer-events-none absolute bottom-full z-10 mb-1.5 w-max max-w-[14rem]"
      style={anchor}
    >
      {/* Dùng lại `Card` dáng panel làm hộp, không viết tay nền + viền: 1a phân cấp bằng
          nền + viền chứ không đổ bóng, và bảng bán kính/viền đó nằm trong Card. */}
      <Card elevation="panel" padding="sm" className="bg-surface">
        <p className="font-mono text-2xs text-fg-muted">{dayLabel(day.date)}</p>
        {isFuture ? (
          <p className="text-2xs text-fg-muted">
            chưa xảy ra — theo nhịp này ~
            <Money amount={typical} currency={base} approx={approx} />
          </p>
        ) : day.total === 0 ? (
          // "¥0" và "Không ghi khoản nào." cạnh nhau là hai lần cùng một câu, và §G chốt
          // chưa-có-gì thì nói bằng chữ chứ không in số 0.
          <p className="text-2xs text-fg-muted">Không ghi khoản nào.</p>
        ) : (
          <p className="text-sm font-semibold">
            <Money
              amount={day.total}
              currency={base}
              tone={day.total < 0 ? 'in' : 'out'}
              approx={approx}
            />
            {day.total < 0 && (
              <span className="ml-1 text-2xs font-normal text-money-in">hoàn tiền</span>
            )}
          </p>
        )}

        {day.top.length > 0 && (
          <ul className="mt-1 space-y-0.5 border-t border-border-subtle pt-1">
            {day.top.map((t, i) => (
              <li key={i} className="flex gap-2 text-2xs text-fg-secondary">
                <span className="min-w-0 flex-1 truncate">{labelOf(t, categoryOf)}</span>
                {/* <Money> chứ không tự viết `font-mono tabular-nums`: designSystem.test.ts
                    canh chỗ này, và đây đúng là tiền. */}
                <Money amount={t.amount} currency={base} tone="out" />
              </li>
            ))}
          </ul>
        )}

        {tagsOfDay.length > 0 && (
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 border-t border-border-subtle pt-1">
            {tagsOfDay.map((t) => (
              <span key={t.name} className="flex items-center gap-1 text-2xs text-fg-muted">
                <span
                  className="size-1.5 rounded-[1px]"
                  style={{ backgroundColor: TAG_HEX[tagColor(t.color)] }}
                />
                {t.name}{' '}
                <Money
                  amount={t.amount}
                  currency={base}
                  tone={t.amount < 0 ? 'in' : 'neutral'}
                />
              </span>
            ))}
          </p>
        )}

        {/* Cột bấm được thì phải NÓI RA: lúc con trỏ nằm trên cột thì thẻ này là thứ duy
            nhất đang hiện, nên nếu nó không nói thì không chỗ nào nói. */}
        {!isFuture && day.total !== 0 && (
          <p className="mt-1 border-t border-border-subtle pt-1 text-2xs text-fg-accent">
            Bấm để xem giao dịch →
          </p>
        )}
      </Card>
    </div>
  )
}

/**
 * Chế độ "So năm ngoái": đường LŨY KẾ năm nay (đậm, dừng ở hôm nay) đè lên cùng tháng
 * năm ngoái (mờ, vẽ trọn tháng để thấy trước đích đến).
 *
 * Vì sao đường ở đây không phạm B41 ("cột chứ không đường"): B41 nói về chi TỪNG NGÀY —
 * sự kiện rời rạc, nội suy giữa hai ngày là vẽ ra dòng tiền không có thật. Lũy kế thì
 * ngược lại: nó là một đại lượng chạy liên tục theo ngày (tụt khi hoàn tiền), và đoạn
 * nằm ngang giữa hai ngày có nghĩa thật — "không tiêu thêm gì".
 *
 * So theo NGÀY-THỨ-MẤY-CỦA-THÁNG chứ không so từng ngày: ngày lương, cuối tuần, ngày lễ
 * hai năm rơi lệch nhau nên cặp cột ngày-3-vs-ngày-3 chỉ ra nhiễu (đã cân khi chọn dạng).
 *
 * SVG viết tay chứ không recharts — cùng lý do SpendSizeCard: hai đường một chấm, gọi cả
 * thư viện là phí. `preserveAspectRatio="none"` cho hình giãn theo thẻ, nên mọi nét mang
 * `vector-effect="non-scaling-stroke"` (giữ đúng px), và chấm "hôm nay" là một đoạn DÀI 0
 * với mũ tròn — <circle> sẽ méo thành bầu dục khi SVG giãn ngang.
 *
 * Hình là aria-hidden cùng nguyên tắc với hàng cột: con số nói ở dòng kết luận ngay trên,
 * đầy đủ hơn cả hình.
 */
function YoyBlock({
  yoy,
  days,
  base,
  approx,
  priorLabel,
}: {
  yoy: CumulativeCompare
  /** Dải ngày của tháng ĐANG XEM — trục x phủ trọn tháng dù đường năm nay mới đi vài ngày. */
  days: DaySpend[]
  base: CurrencyCode
  approx: boolean
  priorLabel: string
}) {
  const { current, prior, priorAtSameDay, deltaPct, priorTotal } = yoy
  // Hai năm cùng đi qua getMonthRange nên n thường bằng nhau; lệch (tháng 2 nhuận, ngày
  // bắt đầu tháng tùy chỉnh) thì trục lấy bên dài hơn, đường ngắn dừng sớm — không bịa thêm.
  const n = Math.max(days.length, prior.length)
  const nowTotal = current[current.length - 1]
  const hi = Math.max(1, ...current, ...prior)
  const lo = Math.min(0, ...current, ...prior)
  const x = (i: number) => (n > 1 ? (i / (n - 1)) * 100 : 0)
  const y = (v: number) => 100 - ((v - lo) / (hi - lo)) * 100
  const pathOf = (vals: readonly number[]) =>
    vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(' ')

  return (
    <>
      {/* Kết luận trước, biểu đồ sau (§14) — cùng khuôn câu của chế độ cột. */}
      <p className="mt-1.5 text-sm text-fg-secondary">
        <Num>{current.length}</Num> ngày:{' '}
        <Money
          amount={nowTotal}
          currency={base}
          tone="out"
          approx={approx}
          className="font-semibold"
        />
        {' — cùng kỳ '}
        <Money amount={priorAtSameDay} currency={base} approx={approx} />{' '}
        <Num tone={deltaTone(deltaPct)}>
          {signedPct(deltaPct === null ? null : Math.round(deltaPct * 10) / 10)}
        </Num>
        <span className="font-mono text-2xs text-fg-muted">
          {' · '}cả tháng {priorLabel}{' '}
          <Money amount={priorTotal} currency={base} approx={approx} />
        </span>
      </p>

      <div className="relative mt-3">
        {/* Thang đọc được: mép trên của khung là bao nhiêu tiền. Một nhãn là đủ — hai con
            số người ta thật sự cần đã nằm ở dòng kết luận. */}
        <span className="absolute left-0 top-0 font-mono text-2xs text-fg-muted">
          {formatCompact(hi, base)}
        </span>
        {/* Đường 0 vẽ bằng span tuyệt đối như chế độ cột — nó chỉ rời đáy khi có tháng
            hoàn tiền nhiều hơn chi (lo < 0). */}
        <span
          className="absolute inset-x-0 border-t border-border-strong"
          style={{ top: `${y(0)}%` }}
          aria-hidden
        />
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="h-44 w-full"
          aria-hidden
        >
          <path
            d={pathOf(prior)}
            fill="none"
            stroke="var(--fg-muted)"
            strokeWidth={1.5}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={pathOf(current)}
            fill="none"
            stroke="var(--money-out)"
            strokeWidth={2}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={`M${x(current.length - 1).toFixed(2)},${y(nowTotal).toFixed(2)} h0.01`}
            stroke="var(--money-out)"
            strokeWidth={7}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>

      {/* Trục ngày: năm mốc như trục hẹp của chế độ cột, dùng chung dải ngày tháng này. */}
      <div className="mt-1 flex justify-between font-mono text-2xs text-fg-muted">
        {[0, 7, 14, 22, days.length - 1].map((i) => (
          <span key={i}>{days[i]?.date.slice(8)}</span>
        ))}
      </div>

      <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-2xs text-fg-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full bg-money-out" aria-hidden /> năm nay, cộng dồn
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full bg-fg-muted" aria-hidden /> {priorLabel}, trọn
          tháng
        </span>
      </p>
    </>
  )
}

export function DailySpendPanel({
  series,
  fullTotal,
  cells,
  tagLines,
  compare,
  cutoffISO,
  yoy,
  yoyApprox,
  priorLabel,
  base,
  categoryOf,
  approx,
  scope,
  onScope,
}: Props) {
  const { days, typical, peakIndex } = series
  const [plotRef, colWidth] = useColumnWidth(days.length)
  // Cột đang rê chuột. Giữ CHỈ SỐ chứ không giữ cả ngày: thẻ chi tiết cần biết cột nằm ở
  // đâu trên trục để tự né hai mép, mà chỉ có chỉ số nói được điều đó.
  const [hover, setHover] = useState<number | null>(null)

  // Chế độ vẽ. Ưu tiên đã lưu chỉ ăn khi CÓ dữ liệu năm ngoái — không thì rơi về cột và
  // công tắc giấu luôn: một nút dẫn tới màn "không có gì" là một nút không nên bấm được.
  const [chartPref, setChartPref] = useState<DailyChart>(readDailyChart)
  const pickChart = (c: DailyChart) => {
    setChartPref(c)
    writeDailyChart(c)
  }
  const chart: DailyChart = yoy !== null && chartPref === 'yoy' ? 'yoy' : 'bars'

  const ceiling = axisCeiling(days, typical)
  const peak = peakIndex >= 0 ? days[peakIndex] : null
  const spendTotal = days.reduce((s, d) => s + d.total, 0)
  const elapsed = days.filter((d) => d.date <= cutoffISO)
  const future = days.filter((d) => d.date > cutoffISO)
  const projected = typical * future.length
  const headline = dailyHeadline({ series, cells, tagLines, categoryOf })
  // Hàng nhãn phẳng, để thẻ chi tiết tra được "ngày này mang nhãn gì". Dùng CHÍNH kết quả
  // của dải nhãn ngay dưới — hai chỗ tự lọc lấy là hai chỗ để lệch nhau.
  const rows = cells.groups.flatMap((g) => g.rows)
  const asking = daysWorthAsking(days, cutoffISO)
  const label = labelThreshold(colWidth, typical)
  // Cột CUỐI có dữ liệu luôn được in nhãn ở dải giữa: nó là "hôm nay", tức con số người
  // dùng vừa tạo ra và đang đi tìm.
  const lastWithData = days.reduce((k, d, i) => (d.date <= cutoffISO && d.total !== 0 ? i : k), -1)
  const filtered = scope === 'flex'

  const pctOf = (v: number) => (ceiling > 0 ? Math.min(Math.abs(v) / ceiling, 1) : 0)

  return (
    <Card elevation="panel" padding="panel" as="section" className="min-w-0">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        {/* Chữ "đã bỏ khoản cố định" KHÔNG nằm trong <h2>.
            Nằm trong đó thì bật công tắc là tiêu đề dài thêm ~140px và đẩy chính hai cái
            chip sang phải — con trỏ vừa bấm "Bỏ cố định" xong thì nút đã trượt khỏi ngón
            tay, và bấm lần nữa để tắt là bấm trúng chỗ khác. Một control không bao giờ
            được tự dời chỗ vì hệ quả của chính cú bấm vào nó.
            B46.2 vẫn được giữ nguyên: câu đó chuyển sang góc phải, dính liền hai con số
            mà nó giải thích ("đã bỏ khoản cố định · ¥151.218 / ¥270.311 tổng"). Góc phải
            là `ml-auto` nên nó nở về BÊN TRÁI, không đụng tới hai chip. */}
        <SectionTitle>Chi từng ngày</SectionTitle>
        <SegmentedControl
          items={SCOPE_ITEMS}
          value={scope}
          onChange={onScope}
          label="Phạm vi biểu đồ chi từng ngày"
          size="sm"
          stretch={false}
        />
        {yoy !== null && (
          <SegmentedControl
            items={CHART_ITEMS}
            value={chart}
            onChange={pickChart}
            label="Kiểu biểu đồ chi từng ngày"
            size="sm"
            stretch={false}
          />
        )}
        <p className="ml-auto font-mono text-2xs text-fg-muted">
          {elapsed.length} ngày ·{' '}
          <Money
            amount={spendTotal}
            currency={base}
            approx={approx}
            className="font-medium text-fg-primary"
          />
          {filtered ? (
            <>
              {' / '}
              <Money amount={fullTotal} currency={base} approx={approx} /> tổng
              <span className="ml-1.5 rounded-full bg-surface-sunken px-1.5 py-0.5 font-sans text-fg-secondary">
                đã bỏ khoản cố định
              </span>
            </>
          ) : (
            compare !== null && (
              <>
                {/* CÙNG SỐ NGÀY — đừng so 23 ngày với trọn tháng trước (luật B14.3 của
                    gói Báo cáo). `priorSameDays` đã cắt sẵn; chữ "cùng kỳ" từng nói ra
                    điều đó ở desktop nhưng ở mobile đã bỏ từ đầu, nên nó không phải chỗ
                    luật này dựa vào — bản mobile giờ là bản duy nhất. */}
                {' · tháng trước '}
                <Money amount={compare.priorSameDays} currency={base} approx={approx} />{' '}
                {/* `signedPct` chứ không tự dựng chuỗi: nó lo dấu âm THẬT (−, U+2212) và
                    dấu thập phân kiểu Việt. `${-53.02}` của JS ra "-53.02" — sai cả hai,
                    ngay cạnh mấy con số tiền vốn đã dùng phẩy. */}
                <Num tone={deltaTone(compare.deltaPct)}>
                  {signedPct(
                    compare.deltaPct === null ? null : Math.round(compare.deltaPct * 10) / 10,
                  )}
                </Num>
              </>
            )
          )}
        </p>
      </div>

      {peak === null ? (
        <p className="mt-3 text-sm text-fg-muted">
          Chưa ghi khoản chi nào trong tháng này.
        </p>
      ) : chart === 'yoy' && yoy !== null ? (
        <YoyBlock
          yoy={yoy}
          days={days}
          base={base}
          approx={approx || yoyApprox}
          priorLabel={priorLabel}
        />
      ) : (
        <>
          {/* Kết luận trước, biểu đồ sau (§14).
              MỘT dòng, không hai. Dòng dự phóng cũ mở đầu bằng "theo nhịp này 1 ngày còn
              lại thêm ~¥10.335" — đúng con số mà câu kết luận vừa in ở "ngày thường", nên
              hai dòng liền nhau in cùng một số và người đọc đi tìm khác biệt giữa chúng.
              B45.1 vẫn được giữ: hai số không phụ thuộc nhãn (ngày thường, dự phóng cả
              tháng) VẪN luôn nói được — chỉ là nói trong cùng một câu.
              Phần thêm đi kèm cỡ chữ 2xs mono, không phải text-sm như câu kết luận: nó là
              số phụ trợ, và giữ nguyên kích thước cũ nghĩa là mắt vẫn đọc ra "câu chính
              trước, số phụ sau" dù giờ hai thứ nằm chung một dòng. */}
          <p className="mt-1.5 text-sm text-fg-secondary">
            <Headline headline={headline} base={base} approx={approx} />
            {/* Nhánh 'typical' của câu kết luận VỪA in đúng con số này. */}
            {headline?.kind !== 'typical' && (
              <span className="font-mono text-2xs text-fg-muted">
                {' · '}ngày thường <Money amount={typical} currency={base} approx={approx} />
              </span>
            )}
            {future.length > 0 && typical > 0 && (
              // "theo nhịp" chứ không "dự báo": trung vị KHÔNG biết khoản định kỳ cuối
              // tháng — phần cam kết là việc của khối Ngân sách. Không nói rõ cách tính
              // thì hai thẻ đưa ra hai con số dự phóng khác nhau. Số "còn lại thêm bao
              // nhiêu" đã bỏ: nó bằng `ngày thường × số ngày còn lại`, mà cả hai vế đều
              // đang có mặt ngay trên cùng dòng.
              <span className="font-mono text-2xs text-fg-muted">
                {' · '}cả tháng ~
                <Money amount={spendTotal + projected} currency={base} approx={approx} />{' '}
                theo nhịp
              </span>
            )}
          </p>

          {/* Cùng bộ cột với dải nhãn ở dưới (`dayAxisCols.ts`): cột đầu · vùng ngày · hai
              cột số. Nhờ vậy ô nhãn `#Osaka` nằm THẲNG TRỤC với đúng những cột vọt lên —
              đó là toàn bộ lý do B44 bắt hai khối dùng chung một trục ngày. */}
          <div className={`mt-3 flex ${AXIS_GAP}`}>
            {/* Trục tung. `right-0` để mọi nhãn canh phải sát vùng vẽ, không so le.
                ẨN dưới md, và đó là quyết định về BỀ RỘNG chứ không phải về chữ: cột này
                ăn hơn 100px của 323px còn lại ở 375px, tức mỗi cột ngày tụt xuống dưới
                4px. B48 chốt giữ đủ 31 ngày ở mobile, nên chỗ đó phải trả về cho cột.
                Mức cắt vẫn nói ra ở nhãn "cắt ở …" trong khung, và đường 0 vẫn được vẽ. */}
            <div
              className={`relative hidden h-44 font-mono text-2xs text-fg-muted md:block ${AXIS_LEAD}`}
            >
              <span className="absolute right-0 top-0">{formatCompact(ceiling, base)}</span>
              {typical > 0 && (
                <span
                  className="absolute right-0 text-fg-secondary"
                  style={{ bottom: `calc(${NEG_PCT}% + ${pctOf(typical) * POS_PCT}%)` }}
                >
                  {formatCompact(typical, base)}
                </span>
              )}
              <span className="absolute right-0" style={{ bottom: `${NEG_PCT}%` }}>
                0
              </span>
              {days.some((d) => d.total < 0) && (
                <span className="absolute bottom-0 right-0 text-money-in">hoàn</span>
              )}
            </div>

            <div className="min-w-0 flex-1">
              {/* Hai nhãn chú NẰM NGOÀI vùng vẽ, trên một hàng riêng cao đúng 0,875rem.
                  Trước đây chúng đặt `absolute top-3.5` bên TRONG khung, và hỏng ở đúng ca
                  chúng sinh ra để phục vụ: một cột cao gần chạm mức cắt có nhãn số nằm sát
                  mép trên, tức rơi trúng dải mà nhãn chú chiếm. Nền `bg-surface` của nhãn
                  chú xén mất phần dưới con số, chừa lại vài pixel đầu — đọc ra như lỗi vẽ.
                  Ra khỏi khung thì không cột nào với tới, và không cần nền che nữa. */}
              {/* Chú "31/08 · dự phóng theo nhịp, chưa xảy ra" ĐÃ BỎ khỏi hàng này: cột
                  nét đứt vốn sinh ra để nói đúng câu đó bằng hình (đặc = đã xảy ra, nét
                  đứt = chưa), thẻ rê chuột nói lại bằng chữ cho từng ngày, và dòng kết
                  luận ngay trên đã có "cả tháng ~… theo nhịp". Ba chỗ nói một điều thì
                  chỗ mờ nhất và dài nhất là chỗ bỏ.
                  Hàng thì GIỮ dù rỗng — nó cao đúng 0,875rem, là chỗ cho nhãn số trên đầu
                  cột cao nhất (xem chú thích dưới). */}
              <div className="mb-0.5 flex h-3.5 items-baseline font-mono text-2xs">
                {/* B42.3: nói CẢ HAI số. Không có câu này thì một cột chỉ cao tới mép mà
                    nhãn ghi 12.5万 đọc ra như lỗi vẽ. */}
                {ceiling > 0 && peak.total > ceiling && (
                  <span className="truncate text-state-bad-fg">
                    cắt ở {formatCompact(ceiling, base)} ({dayLabel(peak.date)}:{' '}
                    <Money amount={peak.total} currency={base} approx={approx} />)
                  </span>
                )}
              </div>

              <div className="relative">
                {typical > 0 && (
                  <span
                    className="absolute inset-x-0 border-t border-dashed border-border-strong"
                    style={{ bottom: `calc(${NEG_PCT}% + ${pctOf(typical) * POS_PCT}%)` }}
                    aria-hidden
                  />
                )}
                <span
                  className="absolute inset-x-0 border-t border-border-strong"
                  style={{ bottom: `${NEG_PCT}%` }}
                  aria-hidden
                />

              {/* Hình vẽ là `aria-hidden`: nội dung của nó nói bằng chữ ở câu kết luận và ở
                  danh sách "ba ngày đáng hỏi" dưới đây, đầy đủ hơn cả hình. */}
              <div
                ref={plotRef}
                className="flex h-44 items-end"
                style={{ gap: `${CELL_GAP_PX}px` }}
                // Rời ở HÀNG chứ không ở từng cột: rê ngang qua khe 3px giữa hai cột sẽ bắn
                // ra một cặp leave/enter, và thẻ chi tiết nhấp nháy suốt dọc biểu đồ.
                onMouseLeave={() => setHover(null)}
                aria-hidden
              >
                {days.map((d, i) => {
                  const isFuture = d.date > cutoffISO
                  const cut = d.total > ceiling
                  const showLabel =
                    !isFuture &&
                    d.total !== 0 &&
                    (label.mode === 'all' || (label.mode === 'big' && (d.total >= label.min || i === lastWithData)))
                  // Cột là ĐƯỜNG ĐI, không chỉ là hình: bấm vào mở đúng ngày đó ở /search.
                  // Chỉ ngày ĐÃ xảy ra và CÓ ghi khoản mới là link — cùng lý do đã ghi cho
                  // ô nhãn ở DayTagStrip: link tới trang rỗng là một điểm dừng tab không
                  // dẫn tới đâu, mà một tháng thường có cả chục ngày trắng.
                  const drill = !isFuture && d.total !== 0
                  // KHÔNG dùng `title`: tooltip mặc định của trình duyệt đợi ~1 giây, in
                  // một khối chữ trơ không định dạng được số tiền (mất chế độ che số và
                  // tiền tố "≈"), và hiện CHỒNG lên thẻ chi tiết ngay dưới đây.
                  const colClass = `flex h-full min-w-0 flex-1 flex-col justify-end outline-offset-1 ${
                    hover === i ? 'bg-surface-sunken' : ''
                  }`
                  const body = (
                    <>
                      {showLabel && (
                        <span
                          className={`mb-0.5 whitespace-nowrap text-center font-mono text-2xs leading-none ${
                            d.total < 0
                              ? 'text-money-in'
                              : d.total >= typical * 2
                                ? 'text-fg-primary'
                                : 'text-fg-muted'
                          }`}
                        >
                          {/* Dấu ÂM THẬT (−, U+2212), không hyphen — §G cho cột số mono, và
                              cùng luật mà <Num> đang giữ. KHÔNG trộn glyph ở đây: nhãn cột
                              dựng từ `formatCompact`, mà hàm đó không bao giờ tự in dấu. */}
                          {d.total < 0 && '−'}
                          {formatCompact(Math.abs(d.total), base)}
                        </span>
                      )}

                      {isFuture ? (
                        typical > 0 ? (
                          // Viền NÉT ĐỨT, không tô mờ: cột đặc = đã xảy ra, mờ đọc ra "ít",
                          // nét đứt đọc ra "chưa".
                          <span
                            className="w-full rounded-t-[2px] border border-dashed border-money-out"
                            style={{ height: `${pctOf(typical) * POS_PCT}%` }}
                          />
                        ) : (
                          // Ngày chưa tới là VẠCH XÁM, không phải khoảng trắng (B41.1):
                          // trắng đọc ra "không tiêu gì", vạch xám đọc ra "chưa tới".
                          <span className="h-[3px] w-full rounded-[1px] bg-border-strong" />
                        )
                      ) : (
                        d.total > 0 && (
                          <>
                            <span
                              className={`w-full bg-money-out motion-period ${cut ? '' : 'rounded-t-[2px]'}`}
                              style={{
                                height: `${pctOf(d.total) * POS_PCT - (cut ? 3.4 : 0)}%`,
                              }}
                            />
                            {cut && (
                              <span
                                className="w-full rounded-t-[2px]"
                                style={{ height: '3.4%', background: HATCH }}
                              />
                            )}
                          </>
                        )
                      )}

                      {/* Dải dưới đường 0. Ngày âm mọc XUỐNG, màu money-in (B47.2). */}
                      <span
                        className="flex w-full items-start"
                        style={{ height: `${NEG_PCT}%` }}
                      >
                        {d.total < 0 && (
                          <span
                            className="w-full rounded-b-[2px] bg-money-in"
                            style={{
                              height: `${Math.min(pctOf(d.total) * POS_PCT, NEG_PCT) * (100 / NEG_PCT)}%`,
                            }}
                          />
                        )}
                      </span>
                    </>
                  )

                  if (!drill) {
                    return (
                      <div key={d.date} onMouseEnter={() => setHover(i)} className={colClass}>
                        {body}
                      </div>
                    )
                  }
                  return (
                    <Link
                      key={d.date}
                      to={`/search?from=${d.date}&to=${d.date}`}
                      onMouseEnter={() => setHover(i)}
                      className={colClass}
                    >
                      {/* Hàng cột là `aria-hidden`, nên nhãn này chỉ để trình đọc màn hình
                          biết cái link đang focus dẫn tới ngày nào. */}
                      <span className="sr-only">{dayLabel(d.date)} — xem giao dịch</span>
                      {body}
                    </Link>
                  )
                })}
              </div>

              {/* Thẻ chi tiết khi rê chuột. Nằm TRÊN vùng vẽ (`bottom-full`) chứ không nổi
                  trong đó: cột cao nhất chạm mép trên, nên thẻ đặt trong khung sẽ che đúng
                  cái cột mà người ta đang hỏi. */}
              {hover !== null && (
                <DayCard
                  day={days[hover]}
                  index={hover}
                  count={days.length}
                  isFuture={days[hover].date > cutoffISO}
                  typical={typical}
                  tagsOfDay={rows
                    .filter((r) => r.cells[hover] !== 0)
                    .map((r) => ({ name: r.name, color: r.color, amount: r.cells[hover] }))}
                  base={base}
                  categoryOf={categoryOf}
                  approx={approx}
                />
              )}

              </div>
            </div>

            {/* Hai cột rỗng đúng bề rộng cột `tổng` và `trần` của dải nhãn. Không có chúng
                thì vùng vẽ kéo dài thêm ~176px so với hàng ô ở dưới, và cả trục lệch đi
                năm ngày. */}
            <span className={`hidden md:block ${AXIS_TOTAL}`} aria-hidden />
            <span className={`hidden md:block ${AXIS_CAP}`} aria-hidden />
          </div>

          {/* Trục ngày cho màn hẹp: năm mốc thay 31 số. Từ md trục ngày nằm ở dải nhãn,
              nơi nó thẳng hàng với các ô. */}
          <div className="mt-1 flex justify-between font-mono text-2xs text-fg-muted md:hidden">
            {[0, 7, 14, 22, days.length - 1].map((i) => (
              <span key={i}>
                {days[i]?.date.slice(8)}
                {i === days.length - 1 && future.length > 0 && ' dự phóng'}
              </span>
            ))}
          </div>

          {/* Ba ngày đáng hỏi (B48). Ở desktop mỗi cột đã có nhãn số riêng nên khối này
              chỉ còn là bản đọc được cho trình đọc màn hình; ở 375px nó là thứ DUY NHẤT
              nói ra con số, vì cột chỉ rộng 8px. */}
          {asking.length > 0 && (
            <div className="mt-2 md:sr-only">
              <p className="text-2xs font-semibold uppercase tracking-label text-fg-muted">
                Ba ngày đáng hỏi
              </p>
              <ul>
                {asking.map((d) => (
                  <li key={d.date} className="border-b border-border-subtle last:border-0">
                    {/* Cả DÒNG là link, không phải chữ "xem" ở cuối: ở 375px cột rộng 8px
                        nên đây là đường đi duy nhất vào ngày đó, và ô bấm cao 44px đã có
                        sẵn ngay đây. */}
                    <Link
                      to={`/search?from=${d.date}&to=${d.date}`}
                      className="flex min-h-11 items-center gap-2"
                    >
                      <span className="w-[3rem] flex-none font-mono text-2xs text-fg-muted">
                        {dayLabel(d.date)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <Money
                          amount={d.total}
                          currency={base}
                          tone={d.total < 0 ? 'in' : 'out'}
                          approx={approx}
                          className="text-sm font-semibold"
                        />
                        {d.top.length > 0 && (
                          <span className="block truncate text-2xs text-fg-muted">
                            {d.top.map((t) => labelOf(t, categoryOf)).join(' · ')}
                          </span>
                        )}
                        {d.total < 0 && (
                          <span className="block text-2xs text-money-in">
                            hoàn tiền nhiều hơn chi
                          </span>
                        )}
                      </span>
                      <span className="flex-none text-2xs text-fg-accent" aria-hidden>
                        →
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <DayTagStrip
            cells={cells}
            days={days}
            tagLines={tagLines}
            base={base}
            approx={approx}
            spendTotal={spendTotal}
            untaggedCount={Math.max(0, series.txCount - cells.taggedCount)}
            fromISO={days[0].date}
            toISO={days[days.length - 1].date}
            dayStep={dayLabelStep(colWidth)}
          />
        </>
      )}
    </Card>
  )
}

/**
 * Câu kết luận. Logic chọn nhánh nằm ở `dailyHeadline` (thuần, test được); ở đây chỉ là
 * cách đọc bốn nhánh đó ra chữ — và mọi số tiền vẫn phải đi qua <Money> để giữ chế độ
 * che số và tiền tố "≈".
 *
 * KHÔNG nhánh nào kết thúc bằng dấu chấm: câu này giờ đứng đầu một dòng còn nối thêm
 * " · ngày thường …" và " · cả tháng ~… theo nhịp", nên dấu chấm rơi vào giữa dòng và đọc
 * ra "vượt gấp đôi. · cả tháng". Cùng lý do, dấu ngắt trong nhánh 'typical' là " · " chứ
 * không phải dấu chấm — để cả dòng chỉ có một loại dấu ngắt.
 */
function Headline({
  headline,
  base,
  approx,
}: {
  headline: ReturnType<typeof dailyHeadline>
  base: CurrencyCode
  approx: boolean
}) {
  if (headline === null) return null

  if (headline.kind === 'tagCap') {
    return (
      <>
        <b className="text-fg-warn">
          {headline.tagName} đã dùng <Money amount={headline.spent} currency={base} approx={approx} />
          {' / '}
          <Money amount={headline.budget} currency={base} approx={approx} /> trần{' '}
          {headline.period === 'monthly' ? 'tháng' : 'đợt'}
        </b>{' '}
        — {headline.span}{headline.remaining > 0 ? ' chiếm gần hết, ' : ' · '}
        {/* Trần đã cạn KHÔNG được đọc là "còn −¥18.480": số âm ở chỗ này không tiêu được,
            nó chỉ làm câu tự mâu thuẫn. Cùng ba nhãn mà B11 chốt cho hạn mức danh mục —
            "vừa hết" cho đúng bằng trần, "vượt" cho phần đã tiêu quá. */}
        {headline.remaining > 0 ? (
          <>
            còn <Money amount={headline.remaining} currency={base} approx={approx} />
          </>
        ) : headline.remaining === 0 ? (
          <>vừa hết trần</>
        ) : (
          <>
            đã vượt{' '}
            <Money
              amount={-headline.remaining}
              currency={base}
              tone="out"
              approx={approx}
            />
          </>
        )}
      </>
    )
  }

  if (headline.kind === 'tagRuns') {
    return (
      <>
        Phần tiêu theo ý mình dồn vào{' '}
        <b className="text-fg-primary">
          {headline.runs.length} đợt
        </b>
        {': '}
        {headline.runs.map((r, i) => (
          <span key={r.name}>
            {i > 0 && ', '}
            {r.name} {r.span} (<Money amount={r.total} currency={base} approx={approx} />)
          </span>
        ))}{' '}
        — <b className="text-fg-primary">{headline.pct}%</b> của cả tháng
      </>
    )
  }

  if (headline.kind === 'peak') {
    return (
      <>
        Cao nhất <b className="text-fg-primary">{dayLabel(headline.dateISO)}</b> —{' '}
        <Money amount={headline.total} currency={base} tone="out" approx={approx} />
        {/* "gấp 7 lần" chứ không "gấp 7 lần ngày thường": phần " · ngày thường ¥10.335"
            nối ngay sau câu này trên CÙNG một dòng, nên bản đủ chữ đọc ra "gấp 7 lần ngày
            thường · ngày thường ¥10.335". Con số đứng liền sau đã nói "lần của cái gì". */}
        {headline.ratio >= 2 && <>, gấp {Math.round(headline.ratio)} lần</>}
      </>
    )
  }

  return (
    <>
      Ngày thường <Money amount={headline.typical} currency={base} tone="out" approx={approx} />
      {headline.overDays > 0 && <> · {headline.overDays} ngày vượt gấp đôi</>}
    </>
  )
}
