// Tab "Nhiều năm" của Báo cáo: nhìn cả lịch sử sổ trong một màn.
//
// Chỉ có nghĩa từ khi sổ dài (nạp 9 năm từ Zaim). Tab Xu hướng đã lo rolling 3 tháng và
// cùng kỳ năm trước; ở đây trả lời câu khác: "nhiều năm qua tiền đi đâu, và tháng nào
// trong năm thường tốn hơn".
import { useMemo } from 'react'
import { Card, Money, StatTile } from '../../components/ui'
import { ExplainBox } from '../../components/ExplainBox'
import { useRangeTransactions } from '../../hooks/queries'
import type { CurrencyCode } from '../../lib/money'
import type { Rates } from '../../lib/rates'
import { monthlySeries, type CurrencyOf } from './aggregate'
import {
  monthKeysOf,
  multiYearInsights,
  seasonality,
  trailingTwelveMonths,
  yearlyTotals,
} from './multiYear'
import { monthKeyForDate, toISODate } from '../../lib/dates'
import { SeasonalityCard } from './SeasonalityCard'
import { YearBarsCard } from './YearBarsCard'

// Toàn bộ lịch sử. Khoảng cố định (không phụ thuộc hôm nay) để khóa cache đứng yên —
// đổi khóa mỗi ngày là mỗi ngày tải lại ~14.000 dòng.
const ALL_TIME = { start: '1900-01-01', end: '2100-01-01' }

interface Props {
  monthStartDay: number
  base: CurrencyCode
  rates: Rates
  currencyOf: CurrencyOf
  /** Bật fetch — chỉ khi tab này đang hiện và đã có hồ sơ (biết month_start_day). */
  enabled: boolean
}

export function MultiYearView({ monthStartDay, base, rates, currencyOf, enabled }: Props) {
  const { data: txs = [], isFetched } = useRangeTransactions(ALL_TIME, enabled)

  const months = useMemo(() => monthKeysOf(txs, monthStartDay), [txs, monthStartDay])
  const series = useMemo(
    () => monthlySeries(txs, months, monthStartDay, currencyOf, base, rates),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [txs, months, monthStartDay, base, rates],
  )
  const rows = useMemo(() => yearlyTotals(series), [series])
  const season = useMemo(() => seasonality(series), [series])
  const insights = useMemo(() => multiYearInsights(rows), [rows])

  // Cột 12T chỉ có nghĩa khi năm cuối trong dãy CHƯA đủ 12 tháng: lúc đó nó là cột duy
  // nhất so được với một năm đầy. Năm cuối đã đủ thì cửa sổ trượt trùng luôn năm đó —
  // thêm cột nữa chỉ là vẽ lại cùng một số.
  const currentKey = monthKeyForDate(toISODate(new Date()), monthStartDay)
  const lastRow = rows[rows.length - 1]
  const trailing = useMemo(
    () =>
      lastRow && lastRow.months < 12 ? trailingTwelveMonths(series, currentKey) : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [series, lastRow, currentKey.year, currentKey.month],
  )

  // Chưa fetch xong thì KHÔNG vẽ số: `txs` mặc định rỗng nên mọi tổng ra 0, mà "0" trong
  // app tiền đọc y như số thật. Cùng quy ước với chế độ Năm ở ReportsPage.
  if (!isFetched)
    return (
      <Card padding="lg" className="text-center text-sm text-fg-muted">
        Đang tính toàn bộ lịch sử…
      </Card>
    )

  if (rows.length === 0)
    return (
      <Card padding="lg" className="text-center text-sm text-fg-muted">
        Chưa có giao dịch nào để dựng báo cáo nhiều năm.
      </Card>
    )

  const totalIncome = rows.reduce((a, r) => a + r.income, 0)
  const totalExpense = rows.reduce((a, r) => a + r.expense, 0)
  const complete = rows.filter((r) => r.months === 12)
  const avgYearExpense = complete.length
    ? Math.round(complete.reduce((a, r) => a + r.expense, 0) / complete.length)
    : null

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <StatTile label="Khoảng thời gian">
          {rows[0].year}–{rows[rows.length - 1].year}
        </StatTile>
        <StatTile label={`Tổng thu ${rows.length} năm`}>
          <Money amount={totalIncome} currency={base} tone="in" compact approx={series.hasMissingRate} />
        </StatTile>
        <StatTile label={`Tổng chi ${rows.length} năm`}>
          <Money amount={totalExpense} currency={base} tone="out" compact approx={series.hasMissingRate} />
        </StatTile>
        <StatTile label="Chi bình quân / năm">
          {avgYearExpense === null ? (
            '—'
          ) : (
            <Money amount={avgYearExpense} currency={base} tone="neutral" compact />
          )}
        </StatTile>
      </div>
      {avgYearExpense === null && (
        <p className="text-xs text-fg-muted">
          Chi bình quân/năm để trống vì chưa có năm nào đủ 12 tháng dữ liệu.
        </p>
      )}

      {series.hasMissingRate && (
        <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Thiếu tỷ giá cho một số giao dịch ngoại tệ — các tổng có dấu ≈ là số xấp xỉ.
        </p>
      )}

      <YearBarsCard rows={rows} base={base} trailing={trailing} />

      {insights.length > 0 && (
        <Card as="section">
          <h2 className="mb-2 text-sm font-semibold text-fg-muted">Đọc ra được gì</h2>
          <ul className="flex flex-col gap-1.5 text-sm text-fg-primary">
            {insights.map((line) => (
              <li key={line} className="flex gap-2">
                <span aria-hidden="true" className="text-fg-muted">
                  ·
                </span>
                {line}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card as="section" padding="none" className="overflow-hidden">
        <h2 className="px-3 pt-3 text-sm font-semibold text-fg-muted">Bảng theo năm</h2>
        <div className="mt-2 overflow-x-auto">
          {/* Số tiền đi qua <Money> (tự bật chữ số đều); cột Tiết kiệm là phần trăm 2–3
              chữ số căn phải nên không cần bật thêm bằng tay. */}
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-fg-muted">
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  Năm
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Thu
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Chi
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Còn lại
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Tiết kiệm
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.year} className="border-b border-border last:border-0">
                  <th scope="row" className="px-3 py-2 text-left font-medium text-fg-primary">
                    {r.year}
                    {r.months < 12 && (
                      <span className="ml-1 text-xs font-normal text-fg-muted">
                        ({r.months} tháng)
                      </span>
                    )}
                  </th>
                  <td className="px-3 py-2 text-right">
                    <Money amount={r.income} currency={base} tone="in" compact />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Money amount={r.expense} currency={base} tone="out" compact />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Money amount={r.net} currency={base} tone="bySign" compact />
                  </td>
                  <td className="px-3 py-2 text-right text-fg-primary">
                    {r.savingsRateBps === null ? '—' : `${(r.savingsRateBps / 100).toFixed(0)}%`}
                  </td>
                </tr>
              ))}
              {/* Dòng 12 tháng gần nhất — cùng bảng để so ngay với các năm, nhưng tách
                  bằng viền đậm vì nó KHÔNG phải một năm lịch. */}
              {trailing && (
                <tr className="border-t-2 border-border bg-surface-page">
                  <th scope="row" className="px-3 py-2 text-left font-medium text-fg-primary">
                    12 tháng gần nhất
                    <span className="ml-1 text-xs font-normal text-fg-muted">
                      (tới {trailing.to.year}/{trailing.to.month})
                    </span>
                  </th>
                  <td className="px-3 py-2 text-right">
                    <Money amount={trailing.income} currency={base} tone="in" compact />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Money amount={trailing.expense} currency={base} tone="out" compact />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Money amount={trailing.net} currency={base} tone="bySign" compact />
                  </td>
                  <td className="px-3 py-2 text-right text-fg-primary">
                    {trailing.savingsRateBps === null
                      ? '—'
                      : `${(trailing.savingsRateBps / 100).toFixed(0)}%`}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-3 pb-3">
          <ExplainBox label="Cách đọc bảng này">
            <p>
              Chuyển khoản giữa các tài khoản của bạn <strong>không</strong> tính vào thu/chi;
              giao dịch đánh dấu "không tính vào thống kê" và dòng trả nợ cũng vậy.
            </p>
            <p>
              Năm có ghi chú "(n tháng)" là năm chỉ ghi sổ một phần — đừng so trực tiếp với năm
              đủ 12 tháng. Ô "Tiết kiệm" là (thu − chi)/thu, để trống khi năm đó không có thu.
            </p>
            <p>
              Tiền ngoại tệ quy về {base} theo tỷ giá <strong>hiện tại</strong>, không phải tỷ
              giá lúc phát sinh — app không lưu tỷ giá quá khứ cho từng giao dịch.
            </p>
          </ExplainBox>
        </div>
      </Card>

      <SeasonalityCard data={season} />
    </div>
  )
}
