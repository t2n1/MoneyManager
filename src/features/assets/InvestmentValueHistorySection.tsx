// Khu "Đầu tư theo thời gian" trên tab Diễn biến: đường đi của danh mục, không phải một
// con số chốt.
//
// Hai đường thay vì một, vì một đường tổng giá trị đi lên KHÔNG phân biệt được "danh mục
// sinh lời" với "tháng này nạp thêm tiền" — hai chuyện khác hẳn nhau mà người xem sẽ đọc
// thành một. Khoảng cách giữa hai đường mới là phần thị trường cho thêm, và ở mép phải nó
// bằng đúng "Lãi/lỗ đầu tư (gồm đã bán)" của khối xanh tab Hiện tại (xem investHistory.ts).
//
// Mọi phép tính nằm ở investHistory.ts — file này chỉ nối dây và vẽ.
import { useMemo } from 'react'
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ExplainBox } from '../../components/ExplainBox'
import { Card, Money } from '../../components/ui'
import {
  useAccounts,
  useAccountValuations,
  useRangeTransactions,
  useRates,
} from '../../hooks/queries'
import { toISODate } from '../../lib/dates'
import { formatCompact } from '../../lib/money'
import type { CurrencyCode } from '../../lib/money'
import type { AssetAccount } from './aggregate'
import { investHistory, investTxRange, type InvestHistoryAccount } from './investHistory'
import type { MoneyView } from './moneyView'

// Palette v4 qua CSS var, không hex đời v3 chép tay (docs/design-system.md; ngưỡng
// `'#16a34a'` ở tests/designSystem.test.ts). Cùng cặp màu với thanh "Tiền bạn bỏ vào /
// Thị trường cho thêm" của ô Hiệu quả đầu tư ngay dưới — hai khối kể một câu chuyện.
const MAU_GIA_TRI = 'var(--color-green-600)'
const MAU_VON = 'var(--color-sky-500)'

interface Props {
  /** Tài khoản đầu tư đang được tính vào tổng tài sản — cùng tập với ô Hiệu quả đầu tư. */
  accounts: AssetAccount[]
  base: CurrencyCode
  /** Bộ "xem thử bằng tiền khác"; lịch sử vẫn tính theo base rồi mới quy đổi lúc vẽ. */
  view: MoneyView
}

export function InvestmentValueHistorySection({ accounts, base, view }: Props) {
  const todayISO = toISODate(new Date())
  const { data: accountRows = [] } = useAccounts()
  const { data: valuations = [] } = useAccountValuations()
  const { rates } = useRates()
  const ids = useMemo(() => new Set(accounts.map((a) => a.id)), [accounts])
  // Cùng khoảng với ô Hiệu quả đầu tư ngay dưới → react-query dùng chung một lượt đọc.
  const { data: txs = [] } = useRangeTransactions(investTxRange(todayISO), ids.size > 0)

  // `initial_balance` và `currency` chỉ có ở bảng accounts, không có trong AssetAccount.
  const lichSuTk: InvestHistoryAccount[] = useMemo(
    () =>
      accountRows
        .filter((a) => ids.has(a.id))
        .map((a) => ({
          id: a.id,
          currency: a.currency,
          initialBalance: a.initial_balance,
        })),
    [accountRows, ids],
  )

  const { points, hasMissingRate } = useMemo(
    () =>
      investHistory({
        accounts: lichSuTk,
        valuations,
        transactions: txs,
        base,
        rates: rates ?? {},
      }),
    [lichSuTk, valuations, txs, base, rates],
  )

  if (accounts.length === 0) return null

  if (points.length < 2) {
    return (
      <Card as="section" padding="lg">
        <h2 className="text-sm font-semibold text-fg-secondary">
          Đầu tư theo thời gian
        </h2>
        <p className="mt-2 text-center text-xs text-fg-muted">
          Cần ít nhất hai ngày có giá để vẽ. App tự ghi giá trị danh mục mỗi phiên — vài
          ngày nữa biểu đồ sẽ hiện.
        </p>
      </Card>
    )
  }

  const data = points.map((p) => ({ date: p.date.slice(5), value: p.value, cost: p.cost }))
  const last = points[points.length - 1]
  const growth = last.value - last.cost
  const up = growth >= 0

  return (
    <Card as="section" padding="lg">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-fg-secondary">
          Đầu tư theo thời gian
        </h2>
        <span className={`text-xs font-semibold ${up ? 'text-money-in' : 'text-money-out'}`}>
          {up ? '▲' : '▼'} {view.fmt(Math.abs(growth))}
        </span>
      </div>

      <div className="mt-2 h-44">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 14, bottom: 0, left: 0 }}>
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: 'var(--fg-muted)' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: 'var(--fg-muted)' }}
              axisLine={false}
              tickLine={false}
              width={44}
              tickFormatter={(v: number) => {
                const t = view.view(v)
                return formatCompact(t.amount, t.currency)
              }}
            />
            <Tooltip
              formatter={(v, name) => [
                view.fmt(Number(v)),
                name === 'value' ? 'Giá trị' : 'Tiền bỏ vào',
              ]}
              labelFormatter={(l) => `Ngày ${l}`}
            />
            <Line
              type="monotone"
              dataKey="cost"
              stroke={MAU_VON}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke={MAU_GIA_TRI}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3 text-xs">
        <span className="flex items-center gap-1.5 text-fg-secondary">
          <span className="h-2 w-2 rounded-full" style={{ background: MAU_VON }} aria-hidden />
          Tiền bạn bỏ vào <Money {...view.view(last.cost)} className="font-bold" />
        </span>
        <span className="flex items-center gap-1.5 text-fg-secondary">
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: MAU_GIA_TRI }}
            aria-hidden
          />
          Giá trị <Money {...view.view(last.value)} className="font-bold" />
        </span>
      </div>

      {hasMissingRate && (
        <p className="mt-2 text-2xs text-state-warn-fg">
          Một phần tài khoản ngoại tệ chưa quy đổi được nên hai đường còn thiếu một phần.
        </p>
      )}

      <ExplainBox label="Cách đọc">
        <p>
          Khoảng cách giữa hai đường là phần <b>thị trường cho thêm</b> (hoặc lấy đi). Đường
          xanh dương đi lên mà khoảng cách không đổi nghĩa là danh mục lớn lên nhờ bạn nạp
          thêm, không phải nhờ lời.
        </p>
        <p>
          <b>Tiền bạn bỏ vào</b> là số dư sổ: nạp trừ rút, gồm cả số dư mở tài khoản. Nên
          khoảng cách ở mép phải bằng đúng "Lãi/lỗ đầu tư (gồm đã bán)" ở tab Hiện tại — tức
          có tính cả phần lời của những mã đã bán xong.
        </p>
        <p>
          Một tài khoản chỉ lên biểu đồ từ ngày có bản định giá đầu tiên; trước đó nó không
          nằm trong cả hai đường. Tài khoản ngoại tệ quy đổi bằng tỷ giá hôm nay cho mọi
          mốc, nên phần quá khứ chỉ là ước chừng.
        </p>
      </ExplainBox>
    </Card>
  )
}
