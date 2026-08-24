// Bốn khối của tab Lịch (bản vẽ 1a, §1.5) — cột phụ 420px ở desktop, xếp dọc ở mobile.
//
// Lưới lịch trả lời "ngày nào nặng". Bốn khối này trả lời bốn câu khác mà lưới không
// nói được, theo đúng thứ tự người ta hỏi khi mở màn Sổ:
//
//   Còn được tiêu     — hôm nay tiêu chừng nào thì cuối tháng vẫn trong trần
//   Ngày đang chọn    — ngày này có những gì
//   Chi theo nhãn     — trần nào đang căng (nhãn cắt ngang danh mục)
//   Sắp tới           — còn phải trả gì trước cuối tháng
//
// Chúng là component TRÌNH BÀY: mọi phép tính đã xong ở `CalendarView` (một chỗ tính,
// một chỗ vẽ). Cùng một khối dùng cho cả hai cỡ màn, khác nhau bằng class `lg:` chứ
// không bằng hai bản chép tay — trước đây `LedgerAside` phải giấu hẳn ở mobile vì nó
// bó cứng vào bề rộng 420px.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarClock, ChevronDown, Plus } from 'lucide-react'
import { Guide } from '../../components/Guide'
import { Card, Collapse, Money, SectionTitle } from '../../components/ui'
import { STATUS_CHIP, STATUS_FILL } from '../../components/ui/statusColors'
import { formatMoney, type CurrencyCode } from '../../lib/money'
import { usePrivacyMode } from '../../lib/privacy'
import type { AccountRow, CategoryRow, TagRow, TransactionRow } from '../../types/database.types'
import type { Commitment, CommitmentSchedule } from '../budgets/commitments'
import type { DailyAllowance, SpendableSegments } from '../budgets/dailyAllowance'
import type { TagBudgetReport } from '../tags/budget'
import { TagBudgetLines } from '../tags/TagBudgetLines'
import type { DayMarkInput } from './calendarMonth'
import { formatDayHeader } from './ledgerShared'
import { TransactionItem } from './TransactionItem'

/** Tiêu đề panel của 1a: 11px HOA, giãn chữ — cùng khuôn với `LedgerAside`. */
/** Chân khối: một dòng số liệu tách bằng kẻ mảnh. */
const PANEL_FOOT = 'mt-3 flex justify-between gap-2 border-t border-border-subtle pt-2.5 text-sm'
/** Cùng chân khối, nhưng cho dòng NHIỀU mảnh — chúng phải xuống hàng được ở 420px. */
const PANEL_FOOT_WRAP =
  'mt-3 flex flex-wrap items-baseline gap-x-1 border-t border-border-subtle pt-2.5 text-sm'
/** Dòng chân thứ hai — không kẻ lại, chỉ nối tiếp dòng trên. */
const FOOT_NEXT = 'mt-1 flex justify-between gap-2 text-sm'

/**
 * Ba màu của thanh "Còn được tiêu" và của chú giải dưới nó — khai MỘT chỗ để hai thứ
 * không bao giờ lệch nhau.
 *
 * Đoạn cam kết đi qua `STATUS_FILL.warn` chứ không qua `--state-warn-border` như bản vẽ:
 * token đó là màu VIỀN (light #f2e3c2, dark #4e3d1e), đo trên track `--surface-sunken` chỉ
 * quãng 1,6:1. Một đoạn thanh mang thông tin là ĐỒ HOẠ, WCAG 1.4.11 đòi 3:1 — cùng lý do
 * mọi thanh khác trong app (`TagBudgetLines`, `ProgressBar`) đều lấy từ `STATUS_FILL`.
 */
const SEG = {
  spent: 'bg-money-out',
  committed: STATUS_FILL.warn,
  free: 'bg-accent',
} as const

export interface SpendableInfo {
  /** Tổng hạn mức tháng; 0 = chưa đặt hạn mức nào. */
  budgeted: number
  spent: number
  /** Cam kết CHƯA RA đã trừ khỏi mức mỗi ngày (chỉ ở tháng đang chạy). */
  committed: number
  segments: SpendableSegments | null
  allowance: DailyAllowance | null
  /** Nhịp 7 ngày qua (base minor / ngày); null = kỳ chưa có ngày nào đã qua. */
  pace: number | null
  /**
   * Còn tiền trong trần nhưng đã hứa hết — số tiền THIẾU trước cuối tháng (> 0).
   * null = không ở ca đó. Xem B36.2: đây KHÔNG phải ca `allowance === null`.
   */
  short: number | null
  /** Có khoản ngoại tệ chưa quy đổi được → mọi số ở đây đang tính thiếu. */
  hasMissingRate: boolean
}

/**
 * "Còn được tiêu" — con số hành động nhiều nhất của cả màn.
 *
 * Ba đoạn của thanh, không một: phần trần còn lại đã bị tiền điện ngày 25 xí trước một
 * khúc, nên chỉ đoạn XANH mới là tiền thật sự còn tự do. Xem `spendableSegments`.
 */
export function SpendableBlock({
  info,
  base,
  className = '',
}: {
  info: SpendableInfo
  base: CurrencyCode
  className?: string
}) {
  // Độ dài các đoạn là một kênh LỘ SỐ TIỀN: che chữ mà giữ thanh thì người bên cạnh vẫn
  // đọc ra đã tiêu bao nhiêu phần trần. Ẩn cả thanh, cùng luật với vạch nhiệt trong ô.
  const hidden = usePrivacyMode()
  const { segments, allowance } = info

  return (
    <Card elevation="panel" padding="panel" as="section" className={className}>
      <SectionTitle role="micro">Còn được tiêu</SectionTitle>

      {info.budgeted <= 0 ? (
        <>
          <p className="mt-1.5 flex items-baseline gap-2">
            <Money
              amount={info.spent}
              currency={base}
              tone="out"
              className="text-kpi font-medium tracking-number"
            />
            <span className="text-sm text-fg-secondary">đã chi tháng này</span>
          </p>
          <Link
            to="/budget"
            className="mt-2 inline-block text-2xs font-medium text-fg-accent hover:underline"
          >
            Đặt hạn mức tháng để biết mỗi ngày còn tiêu được bao nhiêu →
          </Link>
        </>
      ) : (
        <>
          {allowance ? (
            <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2">
              <Money
                amount={allowance.perDay}
                currency={base}
                className="text-kpi font-medium tracking-number"
              />
              <span className="text-sm text-fg-muted">
                /ngày · {allowance.daysLeft} ngày còn lại
              </span>
            </p>
          ) : (
            <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2">
              <Money
                amount={Math.abs(Math.round(info.budgeted - info.spent))}
                currency={base}
                tone={info.spent > info.budgeted ? 'out' : 'neutral'}
                className="text-kpi font-medium tracking-number"
              />
              <span className="text-sm text-fg-muted">
                {info.spent > info.budgeted ? 'đã vượt trần' : 'còn lại trong trần'}
              </span>
            </p>
          )}

          {segments && !hidden && (
            <div
              className="mt-3 flex h-2 overflow-hidden rounded-full bg-surface-sunken"
              role="img"
              aria-label={`Đã chi ${Math.round(segments.spent * 100)}%, đã cam kết ${Math.round(segments.committed * 100)}%, còn tự do ${Math.round(segments.free * 100)}% của hạn mức tháng`}
            >
              <span className={SEG.spent} style={{ width: `${segments.spent * 100}%` }} />
              <span className={SEG.committed} style={{ width: `${segments.committed * 100}%` }} />
              <span className={SEG.free} style={{ width: `${segments.free * 100}%` }} />
            </div>
          )}

          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-2xs text-fg-muted">
            {/* "trong trần", không phải "đã chi": `report.totalSpent` chỉ tính những mục
                ĐÃ ĐẶT HẠN MỨC, nên nó nhỏ hơn ô "Chi" của hàng tab — có tháng nhỏ hơn cả
                chục lần. Không nói phạm vi ra thì hai con số trên cùng một màn đọc như
                một lỗi tính. */}
            <SegLegend
              className={SEG.spent}
              label="đã chi trong trần"
              amount={info.spent}
              base={base}
            />
            <SegLegend
              className={SEG.committed}
              label="đã cam kết"
              amount={info.committed}
              base={base}
            />
            <SegLegend
              className={SEG.free}
              label="tự do"
              amount={segments ? Math.max(0, segments.freeAmount) : 0}
              base={base}
            />
          </div>

          {/* B36.2 · Câu RIÊNG, không phải một dòng biến mất: "còn ¥12.000 trong trần mà
              ¥18.600 đã hứa" là tin quan trọng nhất của tháng. */}
          {info.short !== null && (
            <p className="mt-2 text-sm font-medium text-money-out">
              Đã hứa hết phần còn lại — thiếu {formatMoney(info.short, base)} trước cuối tháng.
            </p>
          )}

          <p className={PANEL_FOOT_WRAP}>
            <span className="text-fg-muted">Hạn mức tháng</span>
            <Money amount={info.budgeted} currency={base} className="font-medium" />
            {info.pace !== null && (
              <>
                <span className="text-fg-muted">· nhịp 7 ngày qua</span>
                {/* Tông cảnh báo CHỈ khi đang tiêu nhanh hơn mức cho phép — đó là cả lý do
                    con số này đứng cạnh mức kia. Lúc nào cũng vàng thì nó không nói gì. */}
                <Money
                  amount={info.pace}
                  currency={base}
                  tone={
                    info.allowance && info.pace > info.allowance.perDay ? 'warn' : 'neutral'
                  }
                  className="font-medium"
                />
                <span className="text-fg-muted">/ngày</span>
              </>
            )}
          </p>
        </>
      )}

      {info.hasMissingRate && (
        <p className="mt-1.5 text-2xs text-fg-muted">
          Thiếu tỷ giá cho vài khoản ngoại tệ nên các số ở đây đang tính thiếu.
        </p>
      )}
    </Card>
  )
}

function SegLegend({
  className,
  label,
  amount,
  base,
}: {
  className: string
  label: string
  amount: number
  base: CurrencyCode
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-sm ${className}`} aria-hidden />
      {label} <Money amount={amount} currency={base} tone="neutral" />
    </span>
  )
}

/** Giao dịch của ngày đang chọn — thứ tab Ngày làm cả trang, ở đây gói vào một khối. */
export function SelectedDayBlock({
  dateISO,
  isToday,
  txs,
  income,
  expense,
  base,
  categoryOf,
  accountOf,
  tagsOfTx,
  onEdit,
  className = '',
}: {
  dateISO: string
  isToday: boolean
  txs: TransactionRow[]
  /** Thu/chi của ngày đã quy đổi; null = thiếu tỷ giá nên không cộng được. */
  income: number | null
  expense: number | null
  base: CurrencyCode
  categoryOf: (id: string | null) => CategoryRow | undefined
  accountOf: (id: string | null) => AccountRow | undefined
  tagsOfTx?: Map<string, TagRow[]>
  onEdit: (tx: TransactionRow) => void
  className?: string
}) {
  return (
    <Card
      elevation="panel"
      padding="none"
      as="section"
      className={`overflow-hidden ${className}`.trim()}
    >
      <div className="flex items-baseline justify-between gap-2 px-4 pb-2 pt-3.5">
        <SectionTitle role="micro">
          {formatDayHeader(dateISO)}
          {isToday && ' · hôm nay'}
        </SectionTitle>
        <span className="shrink-0 text-sm">
          {income !== null && income > 0 && (
            <Money amount={income} currency={base} tone="in" showSign />
          )}
          {income !== null && income > 0 && expense !== null && expense !== 0 && (
            <span className="text-fg-muted"> · </span>
          )}
          {expense !== null && expense !== 0 && (
            <Money
              amount={Math.abs(expense)}
              currency={base}
              tone={expense > 0 ? 'out' : 'in'}
              showSign
            />
          )}
        </span>
      </div>

      {txs.length === 0 ? (
        <p className="border-t border-border-subtle px-4 py-5 text-center text-sm text-fg-muted">
          Không có giao dịch ngày này
        </p>
      ) : (
        <div className="divide-y divide-border-subtle border-t border-border-subtle">
          {txs.map((tx) => (
            <TransactionItem
              key={tx.id}
              tx={tx}
              categoryOf={categoryOf}
              accountOf={accountOf}
              base={base}
              onClick={() => onEdit(tx)}
              tags={tagsOfTx?.get(tx.id)}
            />
          ))}
        </div>
      )}

      {/* Không mang ngày sang màn Nhập được: `TransactionForm` gieo ngày trong `useState`
          nên phải thêm một prop cho nó, mà nó là component có fan-in lớn nhất của app
          (form Nhập, tấm Sửa, Bản tin, Chi tiết danh mục, Chi tiết tài khoản). Nút vì
          thế không hứa ngày — hứa rồi mở ra form ghi hôm nay thì tệ hơn là không hứa.
          Việc đó thuộc gói ENTRY, nơi màn Nhập được dựng lại. */}
      <Link
        to="/entry"
        className="flex items-center justify-center gap-1.5 border-t border-border-subtle py-2.5 text-sm font-medium text-fg-accent hover:underline"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden />
        Thêm giao dịch
      </Link>
    </Card>
  )
}

/** "Chi theo nhãn" — nhãn cắt ngang danh mục, nên nó bắt được thứ hạn mức không bắt được. */
export function TagSpendBlock({
  report,
  base,
  monthLabel,
  className = '',
}: {
  report: TagBudgetReport
  base: CurrencyCode
  monthLabel: string
  className?: string
}) {
  if (report.lines.length === 0) return null
  return (
    <Card elevation="panel" padding="panel" as="section" className={className}>
      <div className="mb-2.5 flex items-baseline justify-between gap-2">
        <SectionTitle role="micro">Chi theo nhãn · {monthLabel.toLowerCase()}</SectionTitle>
        <Link
          to="/settings/tags"
          className="shrink-0 text-2xs font-medium text-fg-accent hover:underline"
        >
          Đổi trần
        </Link>
      </div>

      <TagBudgetLines lines={report.lines} base={base} size="panel" />

      {report.hasMissingRate && (
        <p className="mt-2 text-2xs text-fg-muted">
          Thiếu tỷ giá cho vài khoản ngoại tệ nên tổng đang tính thiếu.
        </p>
      )}

      <Guide className="mt-2.5 border-t border-border-subtle pt-2 text-2xs text-fg-muted">
        Một khoản mang nhiều nhãn được tính đủ cho từng nhãn, nên các dòng ở đây cộng lại
        có thể lớn hơn tổng chi.
      </Guide>
    </Card>
  )
}

const CHIP_BASE = 'shrink-0 rounded-full px-1.5 text-2xs leading-snug'

/**
 * "Sắp tới trong tháng" — cam kết chưa ra, cộng thêm ngày rút thẻ.
 *
 * Ba nhóm, và thứ tự là thứ tự cần biết: QUÁ HẠN CHƯA GHI trước (hoặc quên trả, hoặc
 * quên ghi — cả hai đều phải xử), rồi khoản còn phải trả, rồi ngày rút thẻ.
 *
 * Tổng ở chân khối CHỈ cộng cam kết chi, không cộng thẻ — xem `owedOf` ở
 * `calendarMonth.ts`: kỳ thẻ là chuyển khoản, tiền đó đã được tính là chi từ lúc quẹt.
 * Câu <Guide> ở chân nói ra đúng điều đó, vì không nói thì người đọc cộng các dòng lại
 * rồi thấy lệch với con số bên cạnh và tưởng app tính sai.
 */
export function UpcomingBlock({
  schedule,
  cardDues,
  base,
  className = '',
}: {
  schedule: CommitmentSchedule
  cardDues: DayMarkInput[]
  base: CurrencyCode
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const rows = [
    ...schedule.overdue.map((c) => row(c, 'overdue')),
    ...schedule.upcoming.map((c) => row(c, 'upcoming')),
    ...cardDues.map(
      (d): Row => ({
        key: `card:${d.iso}:${d.title}`,
        dayISO: d.iso,
        title: d.title,
        amount: d.amount,
        unknownAmount: false,
        chip: 'tới hạn',
        tone: 'bad',
      }),
    ),
  ]
  if (rows.length === 0) return null

  const committed = schedule.overdueTotal + schedule.upcomingTotal
  const cardTotal = cardDues.reduce((s, d) => s + d.amount, 0)
  // Hàng bấm ở mobile nói "còn bao nhiêu SẮP RA KHỎI VÍ" — cả hai loại, vì đó là câu người
  // ta hỏi khi nhìn nửa sau tháng. Chân khối mới tách ra hai dòng, và phải tách: hai con số
  // này KHÔNG cùng nghĩa, chỉ có `committed` là tiền tiêu mới (xem `owedOf`).
  const outgoing = committed + cardTotal
  const list = <RowList rows={rows} base={base} />
  const foot = (
    <>
      {committed > 0 && (
        <p className={PANEL_FOOT}>
          <span className="text-fg-muted">Cam kết còn lại</span>
          <Money amount={committed} currency={base} className="font-medium" />
        </p>
      )}
      {cardTotal > 0 && (
        <p className={committed > 0 ? FOOT_NEXT : PANEL_FOOT}>
          <span className="text-fg-muted">Thẻ tới hạn</span>
          <Money amount={cardTotal} currency={base} className="font-medium" />
        </p>
      )}
      <Guide className="mt-1.5 text-2xs text-fg-muted">
        Tiền rút thẻ đứng thành dòng riêng vì nó không phải một khoản tiêu mới: mỗi lần quẹt
        đã được tính là một khoản chi từ lúc nó xảy ra, còn ngày rút chỉ là tiền chuyển từ
        thẻ sang ngân hàng.
      </Guide>
    </>
  )

  return (
    <>
      {/* Mobile: một hàng bấm được, xổ ra danh sách (§2 mục 9). Viền amber vì đây là
          khối duy nhất nói về tiền CHƯA ra — nó không cùng hạng với các khối kể lại. */}
      <div className={`lg:hidden ${className}`.trim()}>
        <Card elevation="panel" padding="none" as="section" className="border-state-warn-border">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="lich-sap-toi"
            className="flex w-full items-center gap-2 px-3.5 py-3 text-left"
          >
            <CalendarClock className="h-4 w-4 shrink-0 text-fg-warn" aria-hidden />
            <span className="flex-1 text-sm text-fg-primary">
              Sắp tới trong tháng · {rows.length} khoản
            </span>
            <Money
              amount={outgoing}
              currency={base}
              tone="warn"
              className="shrink-0 text-sm"
            />
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-fg-muted transition ${open ? 'rotate-180' : ''}`}
              aria-hidden
            />
          </button>
          <Collapse open={open} id="lich-sap-toi" className="px-3.5">
            <div className="pb-3.5">
              {list}
              {foot}
            </div>
          </Collapse>
        </Card>
      </div>

      {/* Desktop: panel mở sẵn trong cột phụ — ở đó không phải tranh chỗ với gì cả. */}
      <Card
        elevation="panel"
        padding="panel"
        as="section"
        className={`hidden lg:block ${className}`.trim()}
      >
        <SectionTitle role="micro">Sắp tới trong tháng</SectionTitle>
        <div className="mt-2.5">{list}</div>
        {foot}
      </Card>
    </>
  )
}

interface Row {
  key: string
  dayISO: string
  title: string
  amount: number
  unknownAmount: boolean
  chip: string
  tone: 'info' | 'warn' | 'bad'
}

const row = (c: Commitment, when: 'overdue' | 'upcoming'): Row => ({
  key: c.key,
  dayISO: c.dueISO,
  title: c.times > 1 ? `${c.title} ×${c.times}` : c.title,
  amount: c.amount,
  unknownAmount: c.unknownAmount,
  chip: when === 'overdue' ? 'quá hạn' : c.kind === 'recurring' ? 'định kỳ' : 'sắp chi',
  tone: when === 'overdue' ? 'warn' : 'info',
})

function RowList({ rows, base }: { rows: Row[]; base: CurrencyCode }) {
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => (
        <li key={r.key} className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-surface-sunken text-2xs text-fg-muted">
            {Number(r.dayISO.slice(8, 10))}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm text-fg-secondary">
            {r.title}
          </span>
          <span className={`${CHIP_BASE} ${STATUS_CHIP[r.tone]}`}>{r.chip}</span>
          {r.unknownAmount ? (
            <span className="shrink-0 text-2xs text-fg-muted">chưa biết</span>
          ) : (
            <Money
              amount={r.amount}
              currency={base}
              className="shrink-0 text-sm font-medium"
            />
          )}
        </li>
      ))}
    </ul>
  )
}
