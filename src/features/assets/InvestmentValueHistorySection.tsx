// Khu "Đầu tư · vốn bỏ vào so với giá trị" trên chế độ Theo thời gian: đường đi của danh
// mục, không phải một con số chốt.
//
// Hai đường thay vì một, vì một đường tổng giá trị đi lên KHÔNG phân biệt được "danh mục
// sinh lời" với "tháng này nạp thêm tiền" — hai chuyện khác hẳn nhau mà người xem sẽ đọc
// thành một. Khoảng cách giữa hai đường mới là phần thị trường cho thêm, và ở mép phải nó
// bằng đúng con số "lãi đầu tư" ở dải KPI đầu trang (xem investHistory.ts).
//
// Bản 2b thêm hai điều, cùng một tinh thần: nói ra chỗ dữ liệu KHÔNG có.
//   · Cắt theo khoảng đang chọn, và ghi rõ mốc đầu thật sự có định giá — biểu đồ tự khai
//     "tôi có dữ liệu từ bao giờ" thay vì để dải chọn ở header nói thay.
//   · Dò KHOẢNG TRỐNG định giá dài nhất và in nó ra. `investHistory` cố ý không vẽ 0 ở
//     những ngày chưa có định giá (một khoảng trắng của dữ liệu vẽ thành khoảng cách giữa
//     hai đường là biến chỗ chưa biết thành một khoản lỗ) — nhưng "không vẽ" mà không nói
//     thì đoạn nối thẳng giữa hai mốc xa nhau trông y như một đoạn có dữ liệu.
//
// Mọi phép tính nằm ở investHistory.ts; file này nối dây, cắt khoảng và vẽ.
import { useMemo } from 'react'
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ExplainBox } from '../../components/ExplainBox'
import { Card, Money, StatusChip } from '../../components/ui'
import {
  useAccounts,
  useAccountValuations,
  useRangeTransactions,
  useRates,
} from '../../hooks/queries'
import { daysBetween, dayMonthLabel, toISODate } from '../../lib/dates'
import { formatCompact } from '../../lib/money'
import type { CurrencyCode } from '../../lib/money'
import type { AssetAccount } from './aggregate'
import { monthLabel, type RangeSpan } from './assetsRange'
import { investHistory, investTxRange, type InvestHistoryAccount } from './investHistory'
import type { MoneyView } from './moneyView'

// Palette v4 qua CSS var, không hex đời v3 chép tay (docs/design-system.md). Cùng cặp màu
// với thanh "Vốn bỏ vào / Thị trường cho thêm" của ô Hiệu quả đầu tư — một câu chuyện.
const MAU_GIA_TRI = 'var(--color-green-600)'
const MAU_VON = 'var(--color-sky-500)'

/** Cách nhau bao nhiêu ngày thì gọi là một khoảng trống đáng nói. */
const NGUONG_TRONG_NGAY = 7

interface Props {
  /** Tài khoản đầu tư đang được tính vào tổng — cùng tập với ô Hiệu quả đầu tư. */
  accounts: AssetAccount[]
  base: CurrencyCode
  /** Bộ "xem thử bằng tiền khác"; lịch sử vẫn tính theo base rồi mới quy đổi lúc vẽ. */
  view: MoneyView
  /** Khoảng đang chọn ở header trang. */
  span: RangeSpan
}

export function InvestmentValueHistorySection({ accounts, base, view, span }: Props) {
  const todayISO = toISODate(new Date())
  const { data: accountRows = [] } = useAccounts()
  const { data: valuations = [] } = useAccountValuations()
  const { rates } = useRates()
  const ids = useMemo(() => new Set(accounts.map((a) => a.id)), [accounts])
  // Cùng khoảng với ô Hiệu quả đầu tư và hai cột Δ của bảng nhóm → một lượt đọc dùng chung.
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

  // Cắt theo khoảng đang chọn, nhưng GIỮ mốc cuối cùng trước khoảng: bỏ nó thì đường
  // bắt đầu từ mốc đầu tiên NẰM TRONG khoảng, và đoạn từ mép trái tới đó bị mất — biểu
  // đồ trông như danh mục mới xuất hiện giữa khoảng.
  const trongKhoang = useMemo(() => {
    const start = span.startISO
    if (start == null) return points // "Từ đầu" — không cắt
    const inside = points.filter((p) => p.date >= start)
    const before = points.filter((p) => p.date < start).at(-1)
    return before && inside.length > 0 ? [before, ...inside] : inside
  }, [points, span.startISO])

  const trong = useMemo(() => khoangTrong(trongKhoang.map((p) => p.date)), [trongKhoang])

  if (accounts.length === 0) return null

  if (trongKhoang.length < 2) {
    return (
      <Card as="section" elevation="panel" padding="lg">
        <h2 className="text-sm font-semibold text-fg-primary">
          Đầu tư · vốn bỏ vào so với giá trị
        </h2>
        <p className="mt-2 text-center text-xs text-fg-muted">
          {points.length >= 2
            ? 'Khoảng đang chọn chưa có đủ hai ngày định giá — chọn khoảng rộng hơn.'
            : 'Cần ít nhất hai ngày có giá để vẽ. App tự ghi giá trị danh mục mỗi phiên — vài ngày nữa biểu đồ sẽ hiện.'}
        </p>
      </Card>
    )
  }

  const data = trongKhoang.map((p) => ({ date: p.date.slice(5), value: p.value, cost: p.cost }))
  const last = trongKhoang[trongKhoang.length - 1]
  const growth = last.value - last.cost
  const up = growth >= 0
  const growthPct = last.cost > 0 ? (growth / last.cost) * 100 : null

  return (
    <Card as="section" elevation="panel" padding="lg">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="text-sm font-semibold text-fg-primary">
          Đầu tư · vốn bỏ vào so với giá trị
        </h2>
        {/* Biểu đồ TỰ KHAI nó có dữ liệu từ bao giờ, thay vì để dải chọn nói thay: mốc
            định giá đầu tiên của danh mục không nhất thiết trùng mốc đầu của khoảng. */}
        <span className="text-2xs text-fg-muted">
          từ {monthLabel(trongKhoang[0].date)} · {trongKhoang.length} mốc định giá
        </span>
        <span className="flex items-center gap-1.5 text-2xs text-fg-muted">
          <span className="h-0.5 w-3.5" style={{ background: MAU_VON }} aria-hidden />
          Vốn bỏ vào <Money {...view.view(last.cost)} tone="muted" />
        </span>
        <span className="flex items-center gap-1.5 text-2xs text-fg-muted">
          <span className="h-0.5 w-3.5" style={{ background: MAU_GIA_TRI }} aria-hidden />
          Giá trị <Money {...view.view(last.value)} tone="muted" />
        </span>
        {trong && (
          <StatusChip tone="info">
            {dayMonthLabel(trong.fromISO)}–{dayMonthLabel(trong.toISO)} không có định giá —
            không vẽ 0
          </StatusChip>
        )}
        <span className="ml-auto shrink-0 text-xs font-semibold">
          <Money
            amount={view.view(Math.abs(growth)).amount}
            currency={view.cur}
            tone={up ? 'in' : 'out'}
            showSign
          />
          {growthPct != null && (
            <span className={up ? 'text-money-in' : 'text-money-out'}>
              {' '}· {up ? '+' : '−'}
              {Math.abs(growthPct).toFixed(1).replace('.', ',')}%
            </span>
          )}
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
                name === 'value' ? 'Giá trị' : 'Vốn bỏ vào',
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
          <b>Vốn bỏ vào</b> là số dư sổ: nạp trừ rút, gồm cả số dư mở tài khoản. Nên khoảng
          cách ở mép phải bằng đúng "lãi đầu tư" ở dải số đầu trang — tức có tính cả phần lời
          của những mã đã bán xong.
        </p>
        <p>
          Một tài khoản chỉ lên biểu đồ từ ngày có bản định giá đầu tiên; trước đó nó không
          nằm trong cả hai đường. Những ngày không có định giá thì app KHÔNG vẽ 0 — nó nối
          thẳng qua, và chỗ nối dài nhất được ghi ra ở tiêu đề. Tài khoản ngoại tệ quy đổi
          bằng tỷ giá hôm nay cho mọi mốc, nên phần quá khứ chỉ là ước chừng.
        </p>
      </ExplainBox>
    </Card>
  )
}

/** Khoảng cách DÀI NHẤT giữa hai mốc liên tiếp, nếu nó vượt ngưỡng. */
function khoangTrong(
  dates: string[],
): { fromISO: string; toISO: string; days: number } | null {
  let best: { fromISO: string; toISO: string; days: number } | null = null
  for (let i = 1; i < dates.length; i++) {
    const days = daysBetween(dates[i - 1], dates[i])
    if (days > NGUONG_TRONG_NGAY && (best == null || days > best.days)) {
      best = { fromISO: dates[i - 1], toISO: dates[i], days }
    }
  }
  return best
}
