// Tab "Xu hướng" — nhìn 24 tháng thay vì một tháng. Trả lời 4 câu hỏi:
//   1. Mức chi đang đi lên hay xuống? (trung bình trượt 3 tháng)
//   2. So với chính mình năm ngoái thì sao? (cùng kỳ)
//   3. Có thời điểm nào nếp sống đổi hẳn không? (điểm gãy)
//   4. Thu nhập tăng thì chi có phình theo không? (lạm phát cá nhân, co giãn lối sống)
import { useMemo } from 'react'
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ExplainBox } from '../../components/ExplainBox'
import { useAccounts, useProfile, useRangeTransactions, useRates } from '../../hooks/queries'
import { addMonths, getMonthRange, monthKeyForDate, toISODate, type MonthKey } from '../../lib/dates'
import { formatCompact, formatMoney, type CurrencyCode } from '../../lib/money'
import { categoryBreakdown, monthlySeries } from './aggregate'
import {
  detectChangePoints,
  lifestyleElasticity,
  personalInflation,
  rollingAverage,
  yearOverYear,
} from './trends'

/** Cửa sổ phân tích: 24 tháng đủ để so cùng kỳ (12+12) và thấy điểm gãy. */
const WINDOW = 24
const ROLL = 3

const monthLabel = (k: MonthKey) => `${String(k.year).slice(2)}/${k.month}`
const signPct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1).replace('.', ',')}%`

/** Khung thẻ chung của tab này. */
function Card({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl bg-surface p-3 shadow-sm ">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">{title}</h2>
        {hint && <span className="shrink-0 text-2xs text-fg-muted">{hint}</span>}
      </div>
      {children}
    </section>
  )
}

/** Dòng thông báo khi chưa đủ số tháng để tính một chỉ số. */
function NeedMore({ have, need }: { have: number; need: number }) {
  return (
    <p className="rounded-lg bg-surface-page px-3 py-3 text-center text-xs text-fg-muted">
      Cần {need} tháng dữ liệu, hiện có {have}. Ghi chép thêm {need - have} tháng nữa là chỉ số này
      tự hiện ra.
    </p>
  )
}

export function TrendsView() {
  const { data: profile } = useProfile()
  const monthStartDay = profile?.month_start_day ?? 1
  const { base, rates } = useRates()
  const r = rates ?? {}
  const { data: accounts = [] } = useAccounts()

  const todayISO = toISODate(new Date())
  const months = useMemo(() => {
    const current = monthKeyForDate(todayISO, monthStartDay)
    // Gồm cả tháng hiện tại: người dùng muốn thấy tháng đang chạy nằm ở đâu trên đường xu hướng
    return Array.from({ length: WINDOW }, (_, i) => addMonths(current, i - WINDOW + 1))
  }, [todayISO, monthStartDay])

  const range = useMemo(
    () => ({
      start: getMonthRange(months[0], monthStartDay).start,
      end: getMonthRange(months[months.length - 1], monthStartDay).end,
    }),
    [months, monthStartDay],
  )
  const { data: txs = [], isFetched } = useRangeTransactions(range, !!profile)

  const currencyOf = (id: string): CurrencyCode =>
    accounts.find((a) => a.id === id)?.currency ?? base

  const series = useMemo(
    () => monthlySeries(txs, months, monthStartDay, currencyOf, base, r),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [txs, months, monthStartDay, accounts, base, rates],
  )

  // Chỉ tính từ tháng đầu tiên CÓ giao dịch — tháng trống phía trước là "chưa
  // dùng app", không phải "tháng không tiêu gì".
  const firstActive = useMemo(() => {
    const idx = series.points.findIndex((p) => p.income > 0 || p.expense > 0)
    return idx < 0 ? series.points.length : idx
  }, [series])
  const active = useMemo(() => series.points.slice(firstActive), [series, firstActive])
  const monthsWithData = active.length

  const expenses = active.map((p) => p.expense)
  const incomes = active.map((p) => p.income)
  const rolling = useMemo(() => rollingAverage(expenses, ROLL), [expenses])

  const chartData = active.map((p, i) => ({
    label: monthLabel(p.key),
    expense: p.expense,
    rolling: rolling[i],
  }))

  // --- Cùng kỳ năm trước ---
  const yoy = useMemo(
    () => yearOverYear(active.map((p) => ({ key: p.key, value: p.expense }))),
    [active],
  )
  const yoyRows = yoy.filter((p) => p.yearAgo !== null).slice(-6).reverse()
  const last12 = active.slice(-12)
  const prev12 = active.slice(-24, -12)
  const last12Total = last12.reduce((s, p) => s + p.expense, 0)
  const prev12Total = prev12.reduce((s, p) => s + p.expense, 0)
  const yoyTotalPct = prev12Total > 0 ? ((last12Total - prev12Total) / prev12Total) * 100 : null

  // --- Điểm gãy ---
  const changePoints = useMemo(
    () => (monthsWithData >= 8 ? detectChangePoints(expenses) : []),
    [expenses, monthsWithData],
  )

  // --- Lạm phát cá nhân: rổ danh mục chung giữa 12 tháng này và 12 tháng trước ---
  const inflation = useMemo(() => {
    if (prev12.length < 12) return null
    const splitISO = getMonthRange(last12[0].key, monthStartDay).start
    const recentTxs = txs.filter((t) => t.occurred_on >= splitISO)
    const olderTxs = txs.filter((t) => t.occurred_on < splitISO)
    const toMap = (list: typeof txs) =>
      new Map(
        categoryBreakdown(list, 'expense', currencyOf, base, r).slices.map((s) => [
          s.categoryId,
          s.amount,
        ]),
      )
    return personalInflation(toMap(recentTxs), toMap(olderTxs))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txs, last12, prev12, monthStartDay, accounts, base, rates])

  // --- Co giãn lối sống ---
  const elasticity = useMemo(
    () => lifestyleElasticity(incomes, expenses),
    [incomes, expenses],
  )

  const money = (v: number) => formatMoney(Math.round(v), base)

  if (!isFetched) {
    return <p className="py-10 text-center text-sm text-fg-muted">Đang tải…</p>
  }

  if (monthsWithData === 0) {
    return (
      <p className="py-10 text-center text-sm text-fg-muted">
        Chưa có giao dịch nào trong 24 tháng gần đây.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {series.hasMissingRate && (
        <div className="rounded-lg bg-amber-50 p-2 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
          Một phần giao dịch ngoại tệ chưa quy đổi được (đang chờ tỷ giá) nên số liệu có thể thiếu.
        </div>
      )}

      {/* 1. Đường xu hướng chi tiêu */}
      <Card title="Mức chi đang đi về đâu" hint={`${monthsWithData} tháng`}>
        {monthsWithData < ROLL ? (
          <NeedMore have={monthsWithData} need={ROLL} />
        ) : (
          <>
            <div className="h-52 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: 'var(--fg-muted)' }}
                    axisLine={false}
                    tickLine={false}
                    interval={Math.max(0, Math.floor(monthsWithData / 6) - 1)}
                  />
                  <YAxis
                    tickFormatter={(v: number) => formatCompact(v, base)}
                    tick={{ fontSize: 11, fill: 'var(--fg-muted)' }}
                    axisLine={false}
                    tickLine={false}
                    width={44}
                  />
                  <Tooltip
                    formatter={(v, n) => [
                      formatMoney(Number(v), base),
                      n === 'rolling' ? `Trung bình ${ROLL} tháng` : 'Chi tháng đó',
                    ]}
                    contentStyle={{ borderRadius: 8, fontSize: 12 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="expense"
                    stroke="var(--fg-muted)"
                    strokeWidth={1.5}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="rolling"
                    stroke="#ef4444"
                    strokeWidth={2.5}
                    dot={false}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-1 text-xs text-fg-secondary">
              Đường <span className="font-medium text-red-500">đậm</span> là mức chi trung bình{' '}
              {ROLL} tháng gần nhất — nhìn đường này để thấy xu hướng, đừng nhìn đường xám (tháng
              nào cũng nhấp nhô vì lý do vặt).
            </p>
            <ExplainBox label="Cách đọc">
              <p>
                Trung bình trượt làm phẳng những tháng bất thường (mua đồ lớn, đi du lịch) để lộ ra
                mức chi “nền” thật sự của bạn. Đường đậm đi lên đều đặn 3–4 tháng liền là dấu hiệu
                nếp sống đã đổi, không phải chỉ một tháng lỡ tay.
              </p>
            </ExplainBox>
          </>
        )}
      </Card>

      {/* 2. Cùng kỳ năm trước */}
      <Card title="So với chính mình năm ngoái">
        {yoyRows.length === 0 ? (
          <NeedMore have={monthsWithData} need={13} />
        ) : (
          <>
            {yoyTotalPct !== null && (
              <p className="mb-2 text-xs text-fg-secondary">
                12 tháng qua bạn chi <b>{money(last12Total)}</b>,{' '}
                <b className={yoyTotalPct >= 0 ? 'text-money-out' : 'text-money-in'}>
                  {signPct(yoyTotalPct)}
                </b>{' '}
                so với 12 tháng trước đó ({money(prev12Total)}).
              </p>
            )}
            <ul className="space-y-1">
              {yoyRows.map((p) => (
                <li
                  key={`${p.key.year}-${p.key.month}`}
                  className="flex items-center justify-between gap-2 rounded-lg bg-surface-page px-2 py-1.5 text-xs "
                >
                  <span className="w-12 shrink-0 text-fg-muted">
                    {monthLabel(p.key)}
                  </span>
                  <span className="flex-1 truncate text-right tabular-nums text-gray-700 dark:text-gray-200">
                    {money(p.current)}
                  </span>
                  <span className="w-24 shrink-0 text-right tabular-nums text-fg-muted">
                    năm ngoái {formatCompact(p.yearAgo ?? 0, base)}
                  </span>
                  <span
                    className={`w-16 shrink-0 text-right font-medium tabular-nums ${
                      p.deltaPct === null
                        ? 'text-fg-muted'
                        : p.deltaPct >= 0
                          ? 'text-money-out'
                          : 'text-money-in'
                    }`}
                  >
                    {p.deltaPct === null ? '—' : signPct(p.deltaPct)}
                  </span>
                </li>
              ))}
            </ul>
            <ExplainBox label="Cách đọc">
              <p>
                So cùng tháng của năm trước loại được yếu tố mùa vụ: tháng Tết bao giờ cũng tốn hơn
                tháng 3, nên so tháng Tết với tháng Tết mới công bằng.
              </p>
            </ExplainBox>
          </>
        )}
      </Card>

      {/* 3. Điểm gãy */}
      <Card title="Thời điểm nếp sống đổi hẳn">
        {monthsWithData < 8 ? (
          <NeedMore have={monthsWithData} need={8} />
        ) : changePoints.length === 0 ? (
          <p className="rounded-lg bg-green-50 px-3 py-3 text-center text-xs text-green-700 dark:bg-green-900/30 dark:text-green-400">
            Mức chi của bạn ổn định trong suốt {monthsWithData} tháng — không có cú nhảy bậc nào
            đáng kể.
          </p>
        ) : (
          <>
            <ul className="space-y-1.5">
              {changePoints.map((cp) => {
                const at = active[cp.index]
                const up = cp.after > cp.before
                const pct = cp.before > 0 ? ((cp.after - cp.before) / cp.before) * 100 : null
                return (
                  <li
                    key={cp.index}
                    className={`rounded-lg px-2.5 py-2 text-xs ${
                      up
                        ? 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                        : 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                    }`}
                  >
                    <b>Từ {monthLabel(at.key)}</b>: mức chi {up ? 'tăng' : 'giảm'} từ{' '}
                    {money(cp.before)} lên {money(cp.after)}/tháng
                    {pct !== null && ` (${signPct(pct)})`} và giữ nguyên mức mới sau đó.
                  </li>
                )
              })}
            </ul>
            <ExplainBox label="Cách tính">
              <p>
                App chia dãy chi tiêu thành các đoạn và tìm chỗ mà trung bình hai bên khác nhau đủ
                lớn so với mức dao động thường ngày (thống kê t ≥ 2,5). Mỗi đoạn phải dài ít nhất 3
                tháng, nên một tháng lỡ tay sẽ không bị báo nhầm là “đổi nếp sống”.
              </p>
              <p>
                Gãy thường trùng với chuyển nhà, đổi việc, có con, mua xe — đối chiếu với mốc đó để
                biết khoản tăng có xứng đáng không.
              </p>
            </ExplainBox>
          </>
        )}
      </Card>

      {/* 4. Lạm phát cá nhân */}
      <Card title="Lạm phát của riêng bạn" hint="12 tháng vs 12 tháng trước">
        {inflation === null ? (
          <NeedMore have={monthsWithData} need={24} />
        ) : (
          <>
            <p
              className={`text-2xl font-bold tabular-nums ${
                inflation.rate > 0
                  ? 'text-money-out'
                  : 'text-money-in'
              }`}
            >
              {signPct(inflation.rate * 100)}
            </p>
            <p className="mt-1 text-xs text-fg-secondary">
              Cùng {inflation.basketSize} nhóm chi tiêu quen thuộc, năm nay bạn tốn{' '}
              {money(inflation.currentTotal)} so với {money(inflation.previousTotal)} năm ngoái. Rổ
              này chiếm {Math.round(inflation.coverage * 100)}% tổng chi năm nay.
            </p>
            {inflation.coverage < 0.5 && (
              <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1.5 text-2xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                Rổ chung chỉ chiếm dưới một nửa chi tiêu nên con số này chỉ mang tính tham khảo — chi
                tiêu năm nay khác năm ngoái khá nhiều.
              </p>
            )}
            <ExplainBox label="Cách tính & lưu ý quan trọng">
              <p>
                Lấy những danh mục bạn có chi ở CẢ hai năm (rổ chung), cộng tổng mỗi năm rồi so.
                Danh mục chỉ xuất hiện một năm (vd học phí mới phát sinh) bị loại để không tính nhầm
                thành giá tăng.
              </p>
              <p>
                <b>Lưu ý:</b> app chỉ có tổng tiền, không có đơn giá × số lượng. Nên con số này gộp
                cả “giá tăng” lẫn “mua nhiều hơn”. Đọc như chỉ báo “cùng nếp sống đó năm nay tốn hơn
                bao nhiêu”, không phải CPI chính thức.
              </p>
            </ExplainBox>
          </>
        )}
      </Card>

      {/* 5. Co giãn lối sống */}
      <Card title="Thu nhập tăng thì chi có phình theo?">
        {elasticity === null ? (
          monthsWithData < 6 ? (
            <NeedMore have={monthsWithData} need={6} />
          ) : (
            <p className="rounded-lg bg-surface-page px-3 py-3 text-center text-xs text-fg-muted">
              Thu nhập của bạn gần như không đổi giữa hai nửa kỳ, chưa đo được độ co giãn. Chỉ số này
              hiện ra khi có đợt tăng/giảm lương rõ rệt.
            </p>
          )
        ) : (
          <>
            <p
              className={`text-2xl font-bold tabular-nums ${
                elasticity.elasticity >= 0.8
                  ? 'text-money-out'
                  : elasticity.elasticity >= 0.5
                    ? 'text-fg-warn'
                    : 'text-money-in'
              }`}
            >
              {elasticity.elasticity.toFixed(2).replace('.', ',')}
            </p>
            <p className="mt-1 text-xs text-fg-secondary">
              Về <b>tốc độ</b>: thu nhập {signPct(elasticity.incomeChangePct)} thì chi tiêu{' '}
              {signPct(elasticity.expenseChangePct)} — chi chạy bằng{' '}
              {Math.round(elasticity.elasticity * 100)}% tốc độ của thu.
            </p>
            <p className="mt-1 text-xs text-fg-secondary">
              Về <b>tiền mặt</b>: cứ thêm 100 đồng thu nhập, bạn tiêu thêm khoảng{' '}
              <b>{Math.round(elasticity.marginalSpend * 100)} đồng</b> và giữ lại{' '}
              {Math.round((1 - elasticity.marginalSpend) * 100)} đồng.
            </p>
            <p className="mt-2 text-2xs text-fg-muted">
              Trung bình mỗi tháng: thu {money(elasticity.incomeBefore)} →{' '}
              {money(elasticity.incomeAfter)}, chi {money(elasticity.expenseBefore)} →{' '}
              {money(elasticity.expenseAfter)}.
            </p>
            <ExplainBox label="Cách đọc">
              <p>
                Chia {monthsWithData} tháng làm hai nửa rồi so trung bình thu &amp; chi của từng nửa.
                Hệ số <b>0</b> = tăng lương mà giữ nguyên nếp sống (tiết kiệm toàn bộ phần tăng).{' '}
                <b>1</b> = tăng bao nhiêu tiêu hết bấy nhiêu. Trên <b>1</b> = tiêu nhanh hơn cả tốc
                độ tăng lương.
              </p>
              <p>
                Con số lành mạnh thường dưới 0,5 — tức là ít nhất một nửa phần tăng thu nhập được
                giữ lại.
              </p>
              <p>
                Hai dòng trên khác nhau: “tốc độ” so hai con số phần trăm với nhau, còn “tiền mặt”
                lấy thẳng số tiền chi tăng chia cho số tiền thu tăng. Nếu bạn vốn tiêu ít hơn kiếm
                được thì dòng tiền mặt bao giờ cũng nhỏ hơn dòng tốc độ.
              </p>
            </ExplainBox>
          </>
        )}
      </Card>

      <p className="px-1 pb-2 text-center text-2xs text-fg-muted">
        Số liệu tính trên {monthsWithData} tháng có giao dịch, quy đổi về {base}.
      </p>
    </div>
  )
}
