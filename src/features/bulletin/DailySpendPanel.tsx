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
import { Card, Money, Num, SegmentedControl, deltaTone, signedPct } from '../../components/ui'
import { formatCompact, type CurrencyCode } from '../../lib/money'
import type { CategoryRow } from '../../types/database.types'
import type { PeriodCompare } from '../reports/periodCompare'
import {
  axisCeiling,
  dayLabel,
  daysWorthAsking,
  labelThreshold,
  type DailySpendSeries,
  type DaySpend,
  type DayTopExpense,
} from '../reports/dailySpike'
import { daySpanLabel, dailyHeadline } from '../reports/dailyHeadline'
import type { DayTagCells } from '../reports/dayTagCells'
import type { TagBudgetLine } from '../tags/budget'
import { TAG_HEX, tagColor } from '../tags/colors'
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

// Vùng vẽ 11rem. Ba dải cộng lại đúng 100%, đừng đổi một số mà quên hai số kia:
//   NEG  1,375rem dưới đường 0 — chỗ cho cột hoàn tiền mọc XUỐNG (B47.2).
//   LABEL 0,875rem trên đỉnh cột cao nhất — chỗ cho nhãn số, để nó không tràn khỏi thẻ.
//   POS  phần còn lại, tức thang thật của cột dương.
const NEG_PCT = 12.5
const LABEL_PCT = 7.95
const POS_PCT = 100 - NEG_PCT - LABEL_PCT

/** Khe giữa hai cột, phải ĐỨNG YÊN khi người dùng phóng cỡ chữ — xem `gap-[3px]` ở §13. */
const GAP_PX = 3

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
      const next = (node.clientWidth - GAP_PX * (count - 1)) / count
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
        <p className="font-mono text-3xs text-fg-muted">{dayLabel(day.date)}</p>
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
          <p className="text-[0.8125rem] font-semibold">
            <Money
              amount={day.total}
              currency={base}
              tone={day.total < 0 ? 'in' : 'out'}
              approx={approx}
            />
            {day.total < 0 && (
              <span className="ml-1 text-3xs font-normal text-money-in">hoàn tiền</span>
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
              <span key={t.name} className="flex items-center gap-1 text-3xs text-fg-muted">
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

      </Card>
    </div>
  )
}

export function DailySpendPanel({
  series,
  fullTotal,
  cells,
  tagLines,
  compare,
  cutoffISO,
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
        <h2 className="text-[0.8125rem] font-semibold text-fg-primary">
          Chi từng ngày
          {/* B46.2: tiêu đề PHẢI nói đang lọc. Không ai được đọc một biểu đồ đã lọc rồi
              tưởng đó là chi cả tháng. */}
          {filtered && <span className="font-normal text-fg-muted"> · đã bỏ khoản cố định</span>}
        </h2>
        <SegmentedControl
          items={SCOPE_ITEMS}
          value={scope}
          onChange={onScope}
          label="Phạm vi biểu đồ chi từng ngày"
          size="sm"
          stretch={false}
        />
        <p className="ml-auto font-mono text-3xs text-fg-muted">
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
            </>
          ) : (
            compare !== null && (
              <>
                {/* CÙNG SỐ NGÀY — đừng so 23 ngày với trọn tháng trước (luật B14.3 của
                    gói Báo cáo). `priorSameDays` đã cắt sẵn. */}
                <span className="hidden md:inline"> · cùng kỳ tháng trước </span>
                <span className="md:hidden"> · tháng trước </span>
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
        <p className="mt-3 text-[0.8125rem] text-fg-muted">
          Chưa ghi khoản chi nào trong tháng này.
        </p>
      ) : (
        <>
          {/* Kết luận trước, biểu đồ sau (§14). */}
          <p className="mt-1.5 text-[0.8125rem] text-fg-secondary">
            <Headline headline={headline} base={base} approx={approx} />
          </p>

          {/* B45.1: hai số này không phụ thuộc nhãn nên LUÔN nói được. */}
          <p className="mt-0.5 font-mono text-3xs text-fg-muted">
            {/* Nhánh 'typical' của câu kết luận VỪA in đúng con số này ngay dòng trên. Lặp
                lại nó là hai dòng liền nhau nói y hệt một điều — và người đọc sẽ đi tìm
                khác biệt giữa hai con số giống nhau. */}
            {headline?.kind !== 'typical' && (
              <>
                ngày thường <Money amount={typical} currency={base} approx={approx} />
              </>
            )}
            {future.length > 0 && typical > 0 && (
              <>
                {/* "theo nhịp" chứ không "dự báo": trung vị KHÔNG biết khoản định kỳ cuối
                    tháng — phần cam kết là việc của khối Ngân sách. Không nói rõ cách tính
                    thì hai thẻ đưa ra hai con số dự phóng khác nhau. */}
                {headline?.kind !== 'typical' && ' · '}
                theo nhịp này {future.length} ngày còn lại thêm ~
                <Money amount={projected} currency={base} approx={approx} /> → cả tháng ~
                <Money amount={spendTotal + projected} currency={base} approx={approx} />
              </>
            )}
          </p>

          <div className="mt-3 flex gap-0 md:gap-2.5">
            {/* Trục tung. `right-0` để mọi nhãn canh phải sát vùng vẽ, không so le.
                ẨN dưới md, và đó là quyết định về BỀ RỘNG chứ không phải về chữ: cột này
                ăn 56px của 323px còn lại ở 375px, tức mỗi cột ngày tụt từ 7,5px xuống
                5,5px. B48 chốt giữ đủ 31 ngày ở mobile, nên 56px đó phải trả về cho cột.
                Mức cắt vẫn nói ra ở nhãn "cắt ở …" trong khung, và đường 0 vẫn được vẽ. */}
            <div className="relative hidden h-44 w-[2.875rem] flex-none font-mono text-3xs text-fg-muted md:block">
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

            <div className="relative min-w-0 flex-1">
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
                className="flex h-44 items-end gap-[3px]"
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
                  return (
                    <div
                      key={d.date}
                      // KHÔNG dùng `title`: tooltip mặc định của trình duyệt đợi ~1 giây,
                      // in một khối chữ trơ không định dạng được số tiền (mất chế độ che số
                      // và tiền tố "≈"), và hiện CHỒNG lên thẻ chi tiết ngay dưới đây.
                      onMouseEnter={() => setHover(i)}
                      className={`flex h-full min-w-0 flex-1 flex-col justify-end ${
                        hover === i ? 'bg-surface-sunken' : ''
                      }`}
                    >
                      {showLabel && (
                        <span
                          className={`mb-0.5 whitespace-nowrap text-center font-mono text-3xs leading-none ${
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
                    </div>
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

              {/* B42.3: nói CẢ HAI số. Không có câu này thì một cột chỉ cao tới mép mà số
                  ghi 12.5万 đọc ra như lỗi vẽ. */}
              {ceiling > 0 && peak.total > ceiling && (
                <span className="absolute left-0 top-3.5 bg-surface px-1 font-mono text-3xs text-state-bad-fg">
                  cắt ở {formatCompact(ceiling, base)} · {dayLabel(peak.date)} là{' '}
                  <Money amount={peak.total} currency={base} approx={approx} />
                </span>
              )}
              {future.length > 0 && typical > 0 && (
                <span className="absolute right-0 top-3.5 hidden bg-surface px-1 font-mono text-3xs text-fg-muted md:inline">
                  {daySpanLabel(future[0].date, future[future.length - 1].date)} · dự phóng theo
                  nhịp, chưa xảy ra
                </span>
              )}
            </div>
          </div>

          {/* Trục ngày cho màn hẹp: năm mốc thay 31 số. Từ md trục ngày nằm ở dải nhãn,
              nơi nó thẳng hàng với các ô. */}
          <div className="mt-1 flex justify-between font-mono text-3xs text-fg-muted md:hidden">
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
              <p className="text-3xs font-semibold uppercase tracking-[.06em] text-fg-muted">
                Ba ngày đáng hỏi
              </p>
              <ul>
                {asking.map((d) => (
                  <li
                    key={d.date}
                    className="flex min-h-11 items-center gap-2 border-b border-border-subtle last:border-0"
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
                        className="text-[0.8125rem] font-semibold"
                      />
                      {d.top.length > 0 && (
                        <span className="block truncate text-3xs text-fg-muted">
                          {d.top.map((t) => labelOf(t, categoryOf)).join(' · ')}
                        </span>
                      )}
                      {d.total < 0 && (
                        <span className="block text-3xs text-money-in">
                          hoàn tiền nhiều hơn chi
                        </span>
                      )}
                    </span>
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
            còn <Money amount={headline.remaining} currency={base} approx={approx} />.
          </>
        ) : headline.remaining === 0 ? (
          <>vừa hết trần.</>
        ) : (
          <>
            đã vượt{' '}
            <Money
              amount={-headline.remaining}
              currency={base}
              tone="out"
              approx={approx}
            />
            .
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
        — <b className="text-fg-primary">{headline.pct}%</b> của cả tháng.
      </>
    )
  }

  if (headline.kind === 'peak') {
    return (
      <>
        Cao nhất <b className="text-fg-primary">{dayLabel(headline.dateISO)}</b> —{' '}
        <Money amount={headline.total} currency={base} tone="out" approx={approx} />
        {headline.ratio >= 2 && <>, gấp {Math.round(headline.ratio)} lần ngày thường</>}
      </>
    )
  }

  return (
    <>
      Ngày thường <Money amount={headline.typical} currency={base} tone="out" approx={approx} />.
      {headline.overDays > 0 && <> {headline.overDays} ngày vượt gấp đôi.</>}
    </>
  )
}
