// Lịch khoản định kỳ — "tháng này còn nợ ai, ngày nào là ngày nặng".
//
// HAI HÌNH CHO MỘT BỘ SỐ: lưới 7 cột ở màn rộng, danh sách theo ngày ở màn hẹp. Không
// phải hai tính năng — cùng `cells`, chỉ khác cách bày. Lưới 7 cột ở 375px cho mỗi ô
// chừng 50px, không đủ cho một chữ nào; mà bỏ chữ đi thì lịch còn lại mấy cái chấm, tức
// là bắt bấm từng ngày mới biết ngày đó có gì. Danh sách thì đọc thẳng.
//
// Lưới KHÔNG phải bản trang trí của danh sách: nó trả lời được một câu mà danh sách
// không trả lời được — ngày nào có nhiều khoản chồng nhau. Đó là lý do giữ cả hai.

import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  Card,
  IconButton,
  Money,
  Num,
  SectionTitle,
  STATUS_CHIP,
  STATUS_FILL,
} from '../../components/ui'
import type { StatusTone } from '../../components/ui'
import { Guide } from '../../components/Guide'
import type { CurrencyCode } from '../../lib/money'
import {
  billCalendar,
  monthGrid,
  summarizeBills,
  type BillCalRule,
  type BillCalTx,
  type BillCell,
  type BillCellStatus,
} from './billCalendar'

/** Bốn trạng thái của lịch ánh sang bốn tông đã đo của design system. */
const TONE: Record<BillCellStatus, StatusTone> = {
  'da-tra': 'good',
  'lech-so': 'warn',
  'lo-mat': 'bad',
  'sap-toi': 'info',
}

const NHAN: Record<BillCellStatus, string> = {
  'da-tra': 'đã trả',
  'lech-so': 'lệch số',
  'lo-mat': 'lỡ mất',
  'sap-toi': 'sắp tới',
}

const THU = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']

interface Props {
  rules: readonly BillCalRule[]
  txs: readonly BillCalTx[]
  /** `end` là ngày LOẠI TRỪ, cùng quy ước với getMonthRange. */
  range: { start: string; end: string }
  todayISO: string
  monthLabel: string
  /** Loại tiền của quy tắc — theo tài khoản nguồn, không phải base. */
  currencyOf: (ruleId: string) => CurrencyCode
  onPrev: () => void
  onNext: () => void
}

export function BillCalendarCard({
  rules,
  txs,
  range,
  todayISO,
  monthLabel,
  currencyOf,
  onPrev,
  onNext,
}: Props) {
  const cells = billCalendar(rules, txs, range, todayISO)
  const weeks = monthGrid(range.start, range.end)
  const sum = summarizeBills(cells)

  const byDay = new Map<string, BillCell[]>()
  for (const c of cells) {
    const arr = byDay.get(c.dueISO)
    if (arr) arr.push(c)
    else byDay.set(c.dueISO, [c])
  }

  return (
    <Card as="section" elevation="panel" padding="panel">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <SectionTitle as="h3" className="min-w-0">
          Lịch khoản định kỳ
        </SectionTitle>
        <div className="flex shrink-0 items-center gap-1">
          <IconButton aria-label="Tháng trước" onClick={onPrev}>
            <ChevronLeft className="h-4 w-4" />
          </IconButton>
          <span className="min-w-16 text-center font-mono text-sm text-fg-secondary">
            {monthLabel}
          </span>
          <IconButton aria-label="Tháng sau" onClick={onNext}>
            <ChevronRight className="h-4 w-4" />
          </IconButton>
        </div>
      </div>

      {cells.length === 0 ? (
        <p className="py-6 text-center text-sm text-fg-muted">
          Tháng này không có kỳ nào đến hạn.
        </p>
      ) : (
        <>
          {/* Câu tóm tắt đứng TRƯỚC hình: nó là câu trả lời, hình là chỗ soi tiếp.
              Tháng chỉ toàn khoản THU thì không in "Phải trả —": một gạch ngang ở chỗ
              đáng lẽ là số tiền đọc như "chưa tính được", chứ không như "không phải trả
              gì". Lúc đó cả dòng biến mất, và cái lịch tự nói hết. */}
          {(sum.expected > 0 || sum.loMat > 0 || sum.lechSo > 0) && (
            <p className="mb-2 text-sm text-fg-secondary">
              {sum.expected > 0 && (
                <>
                  Phải trả{' '}
                  <b>
                    <MoneyInline v={sum.expected} cells={cells} currencyOf={currencyOf} />
                  </b>
                </>
              )}
              {sum.expected > 0 && sum.loMat > 0 ? ' · ' : null}
              {sum.loMat > 0 && (
                <b className="text-money-out">
                  <Num>{sum.loMat}</Num> khoản lỡ
                </b>
              )}
              {(sum.expected > 0 || sum.loMat > 0) && sum.lechSo > 0 ? ' · ' : null}
              {sum.lechSo > 0 && (
                <span className="text-fg-warn">
                  <Num>{sum.lechSo}</Num> khoản lệch số
                </span>
              )}
            </p>
          )}

          {/* --- Lưới: chỉ từ sm trở lên (xem ghi chú đầu file) --- */}
          <div className="hidden sm:block">
            <div className="grid grid-cols-7 gap-1">
              {THU.map((t) => (
                <div key={t} className="pb-1 text-center text-2xs text-fg-muted">
                  {t}
                </div>
              ))}
              {weeks.flat().map((iso, i) => (
                <DayCell
                  key={iso ?? `trong-${i}`}
                  iso={iso}
                  today={todayISO}
                  cells={iso === null ? [] : (byDay.get(iso) ?? [])}
                  currencyOf={currencyOf}
                />
              ))}
            </div>
          </div>

          {/* --- Danh sách theo ngày: màn hẹp --- */}
          <ul className="flex flex-col sm:hidden">
            {[...byDay.entries()].map(([iso, list]) => (
              <li key={iso} className="border-b border-border-subtle py-2 last:border-0">
                <div className="mb-1 flex items-baseline gap-2">
                  <span className="font-mono text-sm text-fg-primary">{dayLabel(iso)}</span>
                  {iso === todayISO && (
                    <span className="rounded-full bg-accent px-1.5 py-0.5 text-3xs font-medium text-fg-on-accent">
                      hôm nay
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  {list.map((c) => (
                    <BillChip key={`${c.ruleId}-${c.dueISO}`} cell={c} currencyOf={currencyOf} wide />
                  ))}
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
            {(['da-tra', 'lech-so', 'lo-mat', 'sap-toi'] as const).map((s) => (
              <span key={s} className="flex items-center gap-1 text-2xs text-fg-muted">
                {/* CHẤM dùng STATUS_FILL chứ không STATUS_CHIP: nền nhạt của chip trên
                    hình 8px gần như biến mất — xem docs/design-system.md §Bộ màu trạng thái. */}
                <span
                  aria-hidden
                  className={`h-2 w-2 shrink-0 rounded-full ${STATUS_FILL[TONE[s]]}`}
                />
                {NHAN[s]}
              </span>
            ))}
          </div>

          <Guide className="mt-1.5 text-2xs text-fg-muted">
            “Đã trả” = đã có giao dịch gắn đúng quy tắc đó, đúng số. “Lệch số” là có ghi
            nhưng số khác với quy tắc — hoá đơn điện tháng nóng chẳng hạn. Mỗi giao dịch chỉ
            khớp vào <b>một</b> kỳ gần nó nhất, nên trả trễ vài ngày vẫn về đúng kỳ của nó.
          </Guide>
        </>
      )}
    </Card>
  )
}

/** "6/9" — ngắn, vì ô lịch hẹp và năm đã có ở đầu thẻ. */
function dayLabel(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${Number(d)}/${Number(m)}`
}

/**
 * Tổng phải trả in bằng loại tiền của khoản ĐẦU TIÊN.
 *
 * Cộng thẳng minor units của nhiều loại tiền là sai, nhưng gần như mọi người dùng chỉ
 * có một loại cho các khoản định kỳ. Khi có từ hai loại trở lên thì KHÔNG in tổng —
 * thà không nói còn hơn nói một con số cộng nhầm đơn vị.
 */
function MoneyInline({
  v,
  cells,
  currencyOf,
}: {
  v: number
  cells: readonly BillCell[]
  currencyOf: (ruleId: string) => CurrencyCode
}) {
  const chi = cells.filter((c) => c.type === 'expense')
  const loai = new Set(chi.map((c) => currencyOf(c.ruleId)))
  if (loai.size !== 1) return <>nhiều loại tiền</>
  return <Money amount={v} currency={[...loai][0]} />
}

function DayCell({
  iso,
  today,
  cells,
  currencyOf,
}: {
  iso: string | null
  today: string
  cells: readonly BillCell[]
  currencyOf: (ruleId: string) => CurrencyCode
}) {
  if (iso === null) return <div />
  const laHomNay = iso === today
  return (
    <div
      className={`min-h-16 rounded-lg border p-1 ${
        laHomNay ? 'border-accent bg-accent-soft' : 'border-border-subtle'
      }`}
    >
      <div
        className={`mb-0.5 text-right font-mono text-2xs ${
          laHomNay ? 'text-fg-accent' : 'text-fg-muted'
        }`}
      >
        {Number(iso.split('-')[2])}
      </div>
      <div className="flex flex-col gap-0.5">
        {cells.map((c) => (
          <BillChip key={`${c.ruleId}-${c.dueISO}`} cell={c} currencyOf={currencyOf} />
        ))}
      </div>
    </div>
  )
}

function BillChip({
  cell,
  currencyOf,
  wide = false,
}: {
  cell: BillCell
  currencyOf: (ruleId: string) => CurrencyCode
  /** Bản của danh sách: có chỗ nên in cả nhãn lẫn số trên một hàng rộng. */
  wide?: boolean
}) {
  const cur = currencyOf(cell.ruleId)
  // Lệch số thì hiện số THẬT — con số của quy tắc lúc đó chỉ là dự kiến, còn cái đã rời
  // ví mới là cái người ta cần đối chiếu với sao kê.
  const so = cell.paid ?? cell.amount
  const title = `${cell.label} · ${NHAN[cell.status]}${
    cell.status === 'lech-so' ? ` (quy tắc ${cell.amount})` : ''
  }`
  return (
    <span
      title={title}
      className={`flex items-baseline gap-1 rounded px-1 py-0.5 text-3xs ${STATUS_CHIP[TONE[cell.status]]} ${
        wide ? 'justify-between' : ''
      }`}
    >
      <span className="min-w-0 truncate">{cell.label}</span>
      <Money amount={so} currency={cur} compact={!wide} className="shrink-0 !text-inherit" />
    </span>
  )
}
