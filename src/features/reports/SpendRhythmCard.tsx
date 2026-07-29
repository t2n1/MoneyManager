// Thẻ "Nhịp chi tiêu": tiêu mạnh tay vào lúc nào — ngay sau ngày lương, và thứ
// mấy trong tuần. Hai câu hỏi này cùng một họ nên gộp chung một thẻ.
import { ExplainBox } from '../../components/ExplainBox'
import { formatCompact, formatMoney, type CurrencyCode } from '../../lib/money'
import { WEEKDAY_LABELS, type PaydayEffect, type WeekdayBucket } from './behavior'

interface Props {
  payday: PaydayEffect | null
  weekdays: WeekdayBucket[]
  base: CurrencyCode
  /** số ngày ngay sau ngày lương được tính là "cửa sổ lương" */
  windowDays: number
}

export function SpendRhythmCard({ payday, weekdays, base, windowDays }: Props) {
  const money = (v: number) => formatMoney(Math.round(v), base)
  const maxAvg = weekdays.reduce((m, b) => Math.max(m, b.avg), 0)
  const hasWeekdayData = maxAvg > 0
  if (!payday && !hasWeekdayData) return null

  // Thứ tự hiển thị bắt đầu từ Thứ Hai cho quen mắt người Việt
  const ordered = [1, 2, 3, 4, 5, 6, 0].map((dow) => weekdays[dow])
  const busiest = ordered.reduce((m, b) => (b.avg > m.avg ? b : m), ordered[0])

  return (
    <section className="rounded-xl bg-surface p-3 shadow-sm ">
      <h2 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-200">Nhịp chi tiêu</h2>

      {payday && (
        <div className="mb-3">
          <h3 className="mb-1 text-xs font-medium text-fg-muted">
            {windowDays} ngày sau khi nhận lương
          </h3>
          {payday.ratio >= 1.3 ? (
            <p className="rounded-lg bg-amber-50 px-2.5 py-2 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
              Ngay sau lương bạn tiêu <b>{payday.ratio.toFixed(1).replace('.', ',')}×</b> ngày
              thường: {money(payday.afterPayday)}/ngày so với {money(payday.otherDays)}/ngày.
            </p>
          ) : payday.ratio <= 0.8 ? (
            <p className="rounded-lg bg-green-50 px-2.5 py-2 text-xs text-green-700 dark:bg-green-900/30 dark:text-green-400">
              Bạn không “xả” sau khi nhận lương — mấy ngày đó còn tiêu ít hơn ngày thường (
              {money(payday.afterPayday)} so với {money(payday.otherDays)}/ngày).
            </p>
          ) : (
            <p className="rounded-lg bg-surface-page px-2.5 py-2 text-xs text-fg-secondary">
              Mức chi sau lương ({money(payday.afterPayday)}/ngày) gần như ngày thường (
              {money(payday.otherDays)}/ngày). Không có hiệu ứng ngày lương rõ rệt.
            </p>
          )}
          <p className="mt-1 text-2xs text-fg-muted">
            Dựa trên {payday.paydayCount} lần nhận lương, {payday.daysInWindow} ngày trong cửa sổ và{' '}
            {payday.daysOutside} ngày thường.
          </p>
        </div>
      )}

      {hasWeekdayData && (
        <div>
          <h3 className="mb-1.5 text-xs font-medium text-fg-muted">
            Chi trung bình theo thứ
          </h3>
          <div className="flex items-end gap-1" role="img" aria-label={`Chi nhiều nhất vào ${WEEKDAY_LABELS[busiest.dow]}`}>
            {ordered.map((b) => {
              const isWeekend = b.dow === 0 || b.dow === 6
              return (
                <div key={b.dow} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                  <span className="text-3xs tabular-nums text-fg-muted">
                    {formatCompact(b.avg, base)}
                  </span>
                  <div
                    className={`w-full rounded-t ${
                      b.dow === busiest.dow
                        ? 'bg-red-400 dark:bg-red-500/80'
                        : isWeekend
                          ? 'bg-sky-300 dark:bg-sky-500/60'
                          : 'bg-gray-300 dark:bg-gray-600'
                    }`}
                    style={{ height: `${Math.max(3, (b.avg / maxAvg) * 56)}px` }}
                  />
                  <span
                    className={`text-3xs ${
                      isWeekend
                        ? 'font-medium text-sky-600 dark:text-sky-400'
                        : 'text-fg-muted'
                    }`}
                  >
                    {WEEKDAY_LABELS[b.dow]}
                  </span>
                </div>
              )
            })}
          </div>
          <p className="mt-1.5 text-xs text-fg-secondary">
            Tốn nhất là <b>{WEEKDAY_LABELS[busiest.dow]}</b> ({money(busiest.avg)}/ngày).
          </p>
        </div>
      )}

      <ExplainBox label="Cách tính">
        <p>
          <b>Ngày lương</b> được app tự nhận ra từ các khoản Thu lớn (từ nửa khoản thu lớn nhất trở
          lên) — bạn không phải khai báo gì. Cửa sổ là ngày nhận lương và {windowDays - 1} ngày kế
          tiếp.
        </p>
        <p>
          <b>Theo thứ</b> lấy tổng chi của mọi ngày cùng thứ chia cho số ngày đó, nên tháng có 5 thứ
          Bảy cũng không làm lệch kết quả.
        </p>
      </ExplainBox>
    </section>
  )
}
