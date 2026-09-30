// Thẻ "Nhịp chi tiêu": tiêu mạnh tay vào lúc nào — ngay sau ngày lương, và thứ
// mấy trong tuần. Hai câu hỏi này cùng một họ nên gộp chung một thẻ.
import { ExplainBox } from '../../components/ExplainBox'
import { useDensity } from '../../hooks/useDensity'
import { Guide } from '../../components/Guide'
import { formatCompact, formatMoney, type CurrencyCode } from '../../lib/money'
import { WEEKDAY_LABELS, type PaydayEffect, type WeekdayBucket } from './behavior'
import { Card, SectionTitle } from '../../components/ui'
import { getLang, tr } from '../../i18n'
import { trn } from '../../i18n/react'

interface Props {
  payday: PaydayEffect | null
  weekdays: WeekdayBucket[]
  base: CurrencyCode
  /** số ngày ngay sau ngày lương được tính là "cửa sổ lương" */
  windowDays: number
}

export function SpendRhythmCard({ payday, weekdays, base, windowDays }: Props) {
  const { visual } = useDensity()
  const money = (v: number) => formatMoney(Math.round(v), base)
  const maxAvg = weekdays.reduce((m, b) => Math.max(m, b.avg), 0)
  const hasWeekdayData = maxAvg > 0
  if (!payday && !hasWeekdayData) return null

  // Thứ tự hiển thị bắt đầu từ Thứ Hai cho quen mắt người Việt
  const ordered = [1, 2, 3, 4, 5, 6, 0].map((dow) => weekdays[dow])
  const busiest = ordered.reduce((m, b) => (b.avg > m.avg ? b : m), ordered[0])
  const ratioText = payday ? payday.ratio.toFixed(1).replace('.', getLang() === 'en' ? '.' : ',') : ''

  return (
    <Card as="section">
      <SectionTitle className="mb-2">{tr('Nhịp chi tiêu')}</SectionTitle>

      {payday && (
        <div className="mb-3">
          <SectionTitle as="h3" className="mb-1">
            {tr('{n} ngày sau khi nhận lương', { n: windowDays })}
          </SectionTitle>
          {payday.ratio >= 1.3 ? (
            <p className="rounded-lg bg-state-warn-bg px-2.5 py-2 text-sm text-amber-800 dark:text-amber-300">
              {/* Tỷ số CHÍNH LÀ kết luận; hai mức/ngày là số làm chứng. Gọn giữ tỷ số. */}
              {visual ? (
                trn('Sau lương tiêu {ratio} ngày thường', { ratio: <b>{ratioText}×</b> })
              ) : (
                trn('Ngay sau lương bạn tiêu {ratio} ngày thường: {after}/ngày so với {other}/ngày.', {
                  ratio: <b>{ratioText}×</b>,
                  after: money(payday.afterPayday),
                  other: money(payday.otherDays),
                })
              )}
            </p>
          ) : payday.ratio <= 0.8 ? (
            <p className="rounded-lg bg-state-good-bg px-2.5 py-2 text-sm text-state-good-fg">
              {visual ? (
                tr('Sau lương tiêu ÍT hơn ngày thường')
              ) : (
                tr('Bạn không “xả” sau khi nhận lương — mấy ngày đó còn tiêu ít hơn ngày thường ({after} so với {other}/ngày).', {
                  after: money(payday.afterPayday),
                  other: money(payday.otherDays),
                })
              )}
            </p>
          ) : (
            <p className="rounded-lg bg-surface-page px-2.5 py-2 text-sm text-fg-secondary">
              {visual ? (
                tr('Sau lương gần như ngày thường')
              ) : (
                tr('Mức chi sau lương ({after}/ngày) gần như ngày thường ({other}/ngày). Không có hiệu ứng ngày lương rõ rệt.', {
                  after: money(payday.afterPayday),
                  other: money(payday.otherDays),
                })
              )}
            </p>
          )}
          <Guide className="mt-1 text-2xs text-fg-muted">
            {tr('Dựa trên {paydays} lần nhận lương, {inWindow} ngày trong cửa sổ và {outside} ngày thường.', {
              paydays: payday.paydayCount,
              inWindow: payday.daysInWindow,
              outside: payday.daysOutside,
            })}
          </Guide>
        </div>
      )}

      {hasWeekdayData && (
        <div>
          <SectionTitle as="h3" className="mb-1.5">
            {tr('Chi trung bình theo thứ')}
          </SectionTitle>
          <div className="flex items-end gap-1" role="img" aria-label={tr('Chi nhiều nhất vào {day}', { day: WEEKDAY_LABELS[busiest.dow] })}>
            {ordered.map((b) => {
              const isWeekend = b.dow === 0 || b.dow === 6
              return (
                <div key={b.dow} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                  <span className="text-2xs tabular-nums text-fg-muted">
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
                    className={`text-2xs ${
                      isWeekend
                        ? // sky-700 (5,86:1 trên nền thẻ trắng), không sky-600 (4,02:1).
                          // Nhãn thứ ở đây là 10px nên phải đạt 4,5:1.
                          'font-medium text-sky-700 dark:text-sky-400'
                        : 'text-fg-muted'
                    }`}
                  >
                    {WEEKDAY_LABELS[b.dow]}
                  </span>
                </div>
              )
            })}
          </div>
          {/* E-ink + Gọn: bỏ câu diễn giải — cột đỏ và số trên cột đã nói. */}
          <p className="mt-1.5 text-sm text-fg-secondary eink-gon:hidden">
            {trn('Tốn nhất là {day} ({amount}/ngày).', {
              day: <b>{WEEKDAY_LABELS[busiest.dow]}</b>,
              amount: money(busiest.avg),
            })}
          </p>
        </div>
      )}

      <ExplainBox label={tr('Cách tính')}>
        <p>
          {trn('{payday} được app tự nhận ra từ các khoản Thu lớn (từ nửa khoản thu lớn nhất trở lên) — bạn không phải khai báo gì. Cửa sổ là ngày nhận lương và {n} ngày kế tiếp.', {
            payday: <b>{tr('Ngày lương')}</b>,
            n: windowDays - 1,
          })}
        </p>
        <p>
          {trn('{byDay} lấy tổng chi của mọi ngày cùng thứ chia cho số ngày đó, nên tháng có 5 thứ Bảy cũng không làm lệch kết quả.', {
            byDay: <b>{tr('Theo thứ')}</b>,
          })}
        </p>
      </ExplainBox>
    </Card>
  )
}
