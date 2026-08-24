// Bảng "So sánh hai kịch bản" — bốn con số cạnh nhau, một dòng mỗi kịch bản.
//
// VÌ SAO CẦN, khi đồ thị đã vẽ hai đường: đường thứ hai cho thấy hai kịch bản KHÁC NHAU,
// nó không nói khác ở chỗ nào. "Về VN 2032" đi thấp hơn suốt — nhưng nó đạt tự do tài
// chính sớm hơn hay muộn hơn? Có năm nào âm không? Bốn cột này trả lời bằng số, và
// chúng là ĐÚNG bốn con số mà chip kịch bản và băng kết luận đang dùng.
import type { CurrencyCode } from '../../lib/currencies'
import { Card } from '../../components/ui'
import { formatCompact, formatMoney } from '../../lib/money'
import { fireYear, firstNegativeYear } from './insights'
import type { YearRow } from './project'

export interface CompareSide {
  name: string
  rows: YearRow[]
  currency: CurrencyCode
  /** Dòng của kịch bản ĐANG XEM được tô đậm — nó là gốc quy chiếu của cả bảng. */
  active: boolean
}

interface Props {
  left: CompareSide
  right: CompareSide
  endAge: number
  /**
   * Hai kịch bản dùng hai đơn vị tiền khác nhau. Lúc đó KHÔNG in dòng chênh lệch: hiệu
   * của hai con số khác đơn vị là một con số rác, và một con số rác có nhãn giải thích
   * vẫn bị đọc thành kết luận. Cùng luật với đồ thị (xem `chartSeriesPlan`).
   */
  currencyMismatch: boolean
}

/**
 * Tiền để dành mỗi năm, đọc từ chính DÒNG của năm hiện tại trong bản chiếu.
 *
 * Không đọc từ `LifetimeInput.phases`: chặng mang số theo TIỀN CỦA CHẶNG (một chặng Mỹ
 * khai bằng đô), còn cả bảng này đọc theo tiền hiển thị của kịch bản — trộn hai đơn vị
 * trong cùng một cột là đúng lỗi mà mọi câu rào trên màn này đang đi tránh. `YearRow` đã
 * quy đổi xong, nên nó là nguồn duy nhất đúng đơn vị.
 *
 * Dòng ĐẦU của bản chiếu là năm hiện tại (`projectLifetime` bắt đầu từ `currentYear`).
 */
function savingsPerYear(rows: YearRow[]): number | null {
  const r = rows[0]
  if (!r) return null
  return r.incomeMinor - r.expenseMinor
}

function Row({ side, endAge }: { side: CompareSide; endAge: number }) {
  const neg = firstNegativeYear(side.rows, 'low')
  const fire = fireYear(side.rows)
  const end = side.rows.find((r) => r.age === endAge) ?? side.rows[side.rows.length - 1]
  const save = savingsPerYear(side.rows)
  return (
    <>
      <span
        className={`truncate font-semibold ${side.active ? 'text-fg-accent' : 'text-fg-primary'}`}
      >
        {side.name}
      </span>
      <span className="font-mono tabular-nums text-fg-primary">
        {fire !== null ? fire : 'Không đạt'}
      </span>
      <span className={`font-mono tabular-nums ${neg !== null ? 'text-money-out' : 'text-money-in'}`}>
        {neg !== null ? `năm ${neg}` : 'không'}
      </span>
      <span className="font-mono tabular-nums text-fg-primary">
        {end ? formatCompact(end.assetsEndMinor, side.currency) : '—'}
      </span>
      <span className="font-mono tabular-nums text-fg-primary">
        {save !== null ? formatCompact(save, side.currency) : '—'}
      </span>
    </>
  )
}

export function CompareStrip({ left, right, endAge, currencyMismatch }: Props) {
  const lEnd = left.rows.length > 0 ? left.rows[left.rows.length - 1].assetsEndMinor : null
  const rEnd = right.rows.length > 0 ? right.rows[right.rows.length - 1].assetsEndMinor : null
  const diff = !currencyMismatch && lEnd !== null && rEnd !== null ? lEnd - rEnd : null

  return (
    <Card as="section" elevation="panel" padding="panel">
      <h2 className="mb-2 text-2xs uppercase tracking-[.1em] text-fg-muted">
        So sánh hai kịch bản
      </h2>
      {/* Cuộn ngang ở màn hẹp thay vì xuống dòng: năm cột này phải đọc THEO HÀNG mới so
          được, và một bảng tự gãy dòng thì hai kịch bản không còn nằm cạnh nhau nữa. */}
      <div className="overflow-x-auto">
        <div className="grid min-w-[26rem] grid-cols-[minmax(6.5rem,1.2fr)_1fr_1fr_1fr_1fr] gap-x-3 gap-y-1 text-xs">
          <span className="text-fg-muted" />
          <span className="text-fg-muted">Tự do TC</span>
          <span className="text-fg-muted">Âm từ</span>
          <span className="text-fg-muted">Lúc {endAge}t</span>
          <span className="text-fg-muted">Để dành/năm</span>
          <Row side={left} endAge={endAge} />
          <Row side={right} endAge={endAge} />
        </div>
      </div>
      <p className="mt-2 text-xs text-fg-muted">
        {currencyMismatch ? (
          <>
            Hai kịch bản dùng đơn vị tiền khác nhau ({left.currency} và {right.currency}) nên
            không trừ trực tiếp được — đọc từng cột riêng, đừng so cột "Lúc {endAge}t" bằng mắt.
          </>
        ) : (
          diff !== null && (
            <>
              Cuối đời chênh nhau{' '}
              <span
                className={`font-mono font-semibold ${diff >= 0 ? 'text-money-in' : 'text-money-out'}`}
              >
                {diff >= 0 ? '+' : ''}
                {formatMoney(diff, left.currency)}
              </span>{' '}
              — {diff >= 0 ? 'kịch bản đang xem về đích cao hơn.' : `"${right.name}" về đích cao hơn.`}
            </>
          )
        )}
      </p>
    </Card>
  )
}
