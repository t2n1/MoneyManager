// Dải NHÃN dưới biểu đồ "Chi từng ngày" (B44, bản chốt `41a`).
//
// Vì sao NHÓM làm tiêu đề và NHÃN làm hàng, chứ không ngược lại (`41b`): người dùng chốt
// chỉ dùng 2 nhóm ("Ai?" · "Ở đâu?") — chú thích `collapsedLimit` ở tags/groups.ts đã ghi
// điều đó — nên hai dòng tiêu đề là giá rẻ, đổi lại giữ được cột `tổng · trần` cho TỪNG
// nhãn. Trần 'total' của một nhãn đợt là thứ duy nhất trả lời "cả chuyến còn bao nhiêu",
// và nó không có chỗ đặt khi hàng là nhóm.
//
// Ô VUÔNG RỜI, không phải thanh liền: nhãn đợt (#Osaka) chạm ngày liền nhau, nhãn thói
// quen (#Người yêu) chạm ngày rải rác. Thanh liền vẽ đúng cái đầu và BỊA ra một khoảng
// liên tục cho cái sau. Ô rời đúng cả hai bằng một quy tắc, và đợt liền nhau vẫn tự nhìn
// thành một dải.
import { Link } from 'react-router-dom'
import { Money } from '../../components/ui'
import type { CurrencyCode } from '../../lib/money'
import { dayLabel, type DaySpend } from '../reports/dailySpike'
import type { DayTagCells, TagDayRow } from '../reports/dayTagCells'
import type { TagBudgetLine } from '../tags/budget'
import { TAG_HEX, tagColor } from '../tags/colors'

interface Props {
  cells: DayTagCells
  days: readonly DaySpend[]
  /** `buildTagBudgetReport().lines` — nguồn của cột `trần` bên phải mỗi hàng. */
  tagLines: readonly TagBudgetLine[]
  base: CurrencyCode
  approx: boolean
  /** Tổng chi của chuỗi đang vẽ — mẫu số của "% chi có nhãn". */
  spendTotal: number
  /** Số giao dịch chưa gắn nhãn nào (B47.4). */
  untaggedCount: number
  /** Khoảng ngày của tháng đang xem — cho deep-link `/search?tags=…&from=…&to=…`. */
  fromISO: string
  toISO: string
}

/** Cột tên nhãn và hai cột số bên phải. `rem` chứ không px: §13 — cột px cứng vỡ đầu tiên ở cỡ chữ lớn. */
const NAME_COL = 'w-full md:w-[6.5rem] md:flex-none'
const TOTAL_COL = 'w-[3.5rem] flex-none text-right'
const CAP_COL = 'w-[7.5rem] flex-none text-right'

/** "83% trần tháng" · "97% trần đợt" · "không trần". */
function capLabel(line: TagBudgetLine | undefined): string {
  if (!line || line.budget <= 0) return 'không trần'
  return `${Math.round(line.ratio * 100)}% trần ${line.period === 'monthly' ? 'tháng' : 'đợt'}`
}

function TagRow({
  row,
  days,
  line,
  base,
  approx,
}: {
  row: TagDayRow
  days: readonly DaySpend[]
  line: TagBudgetLine | undefined
  base: CurrencyCode
  approx: boolean
}) {
  const hex = TAG_HEX[tagColor(row.color)]
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 py-1 md:flex-nowrap">
      <span className={`flex min-w-0 items-center gap-1.5 ${NAME_COL}`}>
        <span
          className="size-2 flex-none rounded-[2px]"
          style={{ backgroundColor: hex }}
          aria-hidden
        />
        <span className="truncate text-2xs text-fg-secondary">{row.name}</span>
      </span>

      {/* Ô rời, mỗi ngày một ô, THẲNG chỉ số với `days`. Ẩn dưới md: ở 375px mỗi ô rộng
          8px, và ba dòng "ngày đáng hỏi" ở trên đã nói phần con số (B48.3). */}
      <div className="hidden min-w-0 flex-1 gap-[3px] md:flex" aria-hidden>
        {row.cells.map((v, i) => {
          const day = days[i]
          if (v === 0) {
            return <span key={day.date} className="h-2 min-w-0 flex-1 rounded-[2px] bg-surface-sunken" />
          }
          // Chỉ ô CÓ tiền mới là nút: 31 nút rỗng mỗi hàng là 124 điểm dừng tab cho một
          // thẻ, mà không ô nào trong số đó dẫn tới cái gì.
          return (
            <Link
              key={day.date}
              to={`/search?tags=${encodeURIComponent(row.tagId)}&from=${day.date}&to=${day.date}`}
              title={`${row.name} · ${dayLabel(day.date)}`}
              className="h-2 min-w-0 flex-1 rounded-[2px] outline-offset-1 hover:brightness-125"
              style={{ backgroundColor: v < 0 ? 'var(--money-in)' : hex }}
            >
              <span className="sr-only">
                {row.name} {dayLabel(day.date)}
              </span>
            </Link>
          )
        })}
      </div>

      <Money
        amount={row.total}
        currency={base}
        tone={row.total < 0 ? 'in' : 'neutral'}
        approx={approx}
        className={`text-2xs font-medium ${TOTAL_COL}`}
      />
      <span className={`font-mono text-3xs text-fg-muted ${CAP_COL}`}>{capLabel(line)}</span>
    </div>
  )
}

export function DayTagStrip({
  cells,
  days,
  tagLines,
  base,
  approx,
  spendTotal,
  untaggedCount,
  fromISO,
  toISO,
}: Props) {
  const lineOf = new Map(tagLines.map((l) => [l.tagId, l]))
  const untagged = spendTotal - cells.taggedTotal
  const pct = spendTotal > 0 ? Math.round((cells.taggedTotal / spendTotal) * 100) : 0
  // Khoảng lệch = phần tiền của những khoản mang nhiều hơn một nhãn, bị cộng vào nhiều
  // hàng. Chỉ nói ra khi nó thật sự tồn tại — câu giải thích một khoảng lệch bằng 0 là
  // câu làm người đọc đi tìm cái không có.
  const overlap = cells.rowsTotal - cells.taggedTotal

  return (
    <div className="mt-3 border-t border-border-subtle pt-2">
      {cells.groups.length > 0 && (
        <>
          {/* Trục ngày của dải nhãn. Chỉ in mốc 5 ngày một lần: 31 số trong một hàng
              ~1.100px là 31 chữ cách nhau 26px — đọc được, nhưng không ai đọc, và nó
              cạnh tranh với chính nhãn số trên cột ngay trên. */}
          <div className="hidden items-center gap-2 md:flex" aria-hidden>
            <span className={NAME_COL} />
            <div className="flex min-w-0 flex-1 gap-[3px]">
              {days.map((d, i) => (
                <span
                  key={d.date}
                  className={`min-w-0 flex-1 text-center font-mono text-3xs ${
                    i % 5 === 0 || i === days.length - 1 ? 'text-fg-muted' : 'text-transparent'
                  }`}
                >
                  {d.date.slice(8)}
                </span>
              ))}
            </div>
            <span className={TOTAL_COL} />
            <span className={CAP_COL} />
          </div>

          {cells.groups.map((g) => (
            <div key={g.groupId ?? '__other__'}>
              <div className="flex items-center gap-2 pb-0.5 pt-2">
                <span
                  className={`text-3xs font-semibold uppercase tracking-[.06em] text-fg-muted ${NAME_COL}`}
                >
                  {g.title}
                </span>
                <span className="hidden h-px flex-1 bg-border-subtle md:block" aria-hidden />
              </div>
              {g.rows.map((row) => (
                <TagRow
                  key={row.tagId}
                  row={row}
                  days={days}
                  line={lineOf.get(row.tagId)}
                  base={base}
                  approx={approx}
                />
              ))}
            </div>
          ))}

          {cells.hidden > 0 && (
            <p className="pt-1 text-3xs text-fg-muted">còn {cells.hidden} nhãn nữa</p>
          )}

          {/* HAI con số, không phải một (B44.2). Bỏ câu cuối thì "¥86.100 có nhãn" và
              "bốn nhãn cộng ¥126.700" đọc ra như một lỗi tính. */}
          <p className="pt-1.5 text-3xs text-fg-muted">
            {pct}% chi có nhãn (
            <Money amount={cells.taggedTotal} currency={base} approx={approx} /> /{' '}
            <Money amount={spendTotal} currency={base} approx={approx} />)
            {overlap > 0 && (
              <>
                {' · '}các nhãn cộng lại{' '}
                <Money amount={cells.rowsTotal} currency={base} approx={approx} /> — lệch{' '}
                <Money amount={overlap} currency={base} approx={approx} /> là khoản mang
                nhiều nhãn cùng lúc
              </>
            )}
          </p>
        </>
      )}

      {/* Chỗ trống của dải nhãn thành VIỆC (B47.4). Dải trống 68% là sự thật, nhưng để nó
          trống trơn là bỏ mất đường sửa. */}
      {untagged > 0 && (
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
          <p className="text-3xs text-fg-muted">
            <Money
              amount={untagged}
              currency={base}
              approx={approx}
              className="font-medium text-fg-secondary"
            />{' '}
            chưa gắn nhãn · {untaggedCount} giao dịch
          </p>
          <Link
            to={`/search?from=${fromISO}&to=${toISO}`}
            className="flex min-h-11 items-center text-2xs font-medium text-fg-accent hover:underline md:min-h-0 md:py-1"
          >
            Gắn nhanh →
          </Link>
        </div>
      )}
    </div>
  )
}
