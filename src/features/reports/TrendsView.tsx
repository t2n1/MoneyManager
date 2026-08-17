// Tab "Xu hướng" — nhìn 24 tháng thay vì một tháng. Trả lời 4 câu hỏi:
//   1. Mức chi đang đi lên hay xuống? (trung bình trượt 3 tháng)
//   2. So với chính mình năm ngoái thì sao? (cùng kỳ)
//   3. Có thời điểm nào nếp sống đổi hẳn không? (điểm gãy)
//   4. Thu nhập tăng thì chi có phình theo không? (lạm phát cá nhân, co giãn lối sống)
import { useMemo } from 'react'
import { useDensity } from '../../hooks/useDensity'
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
  seasonalOutlook,
} from './trends'
import { Card } from '../../components/ui'

/** Cửa sổ phân tích: 24 tháng đủ để so cùng kỳ (12+12) và thấy điểm gãy. */
const WINDOW = 24
const ROLL = 3

const monthLabel = (k: MonthKey) => `${k.year}/${k.month}`
const signPct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1).replace('.', ',')}%`

/** Khung thẻ chung của tab này: <Card> của design system + một dòng tiêu đề.
 *  Tên KHÔNG phải `Card` nữa — nó trùng tên primitive và che mất primitive trong
 *  chính file này (bản dựng bắt được lúc gộp thẻ). */
function TrendCard({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <Card as="section">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-fg-primary">{title}</h2>
        {hint && <span className="shrink-0 text-2xs text-fg-muted">{hint}</span>}
      </div>
      {children}
    </Card>
  )
}

/** Dòng thông báo khi chưa đủ số tháng để tính một chỉ số.
 *
 *  Ở chế độ Gọn chỉ còn con số: câu đầy đủ hiện tới 5 lần trên cùng một màn (mỗi thẻ
 *  chưa mở được một lần), mà mệnh đề "ghi chép thêm… tự hiện ra" thì lặp y nguyên. */
function NeedMore({ have, need }: { have: number; need: number }) {
  const { visual } = useDensity()
  if (visual)
    return (
      <p className="rounded-lg bg-surface-page px-3 py-3 text-center text-xs text-fg-muted">
        Cần {need} tháng, có {have}
      </p>
    )
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

  // --- Mùa vụ NÓI VỀ THÁNG TỚI (15a mục 3) ---
  //
  // Khối "So với chính mình năm ngoái" ngay trên mô tả QUÁ KHỨ — đúng, nhưng không làm
  // được gì với nó. Đây là câu đổi hướng: tháng nào sắp tới vốn nặng hơn thường lệ, và
  // từ giờ tới đó cần để thêm bao nhiêu mỗi tháng. Phép tính ở trends.ts.
  const seasonal = useMemo(
    () =>
      seasonalOutlook(
        active.map((p) => ({ month: p.key.month, expense: p.expense })),
        // Tháng dương lịch của điểm CUỐI chuỗi, không phải của đồng hồ: chuỗi có thể
        // kết thúc ở tháng trước nếu tháng này chưa có giao dịch nào.
        active.length > 0 ? active[active.length - 1].key.month : 1,
      ),
    [active],
  )

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
        <div className="rounded-lg bg-state-warn-bg text-state-warn-fg p-2 text-xs">
          Một phần giao dịch ngoại tệ chưa quy đổi được (đang chờ tỷ giá) nên số liệu có thể thiếu.
        </div>
      )}

      {/* 1. Đường xu hướng chi tiêu */}
      <TrendCard title="Mức chi đang đi về đâu" hint={`${monthsWithData} tháng`}>
        {monthsWithData < ROLL ? (
          <NeedMore have={monthsWithData} need={ROLL} />
        ) : (
          <>
            <div className="h-52 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 14, left: -8, bottom: 0 }}>
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
              Đường <span className="font-medium text-money-out">đậm</span> là mức chi trung bình{' '}
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
      </TrendCard>

      {/* 2. Cùng kỳ năm trước */}
      {/* Mùa vụ, nói về THÁNG TỚI (15a mục 3). Đứng TRƯỚC khối "so với năm ngoái" vì nó
          nói được một việc làm ngay, còn khối kia chỉ mô tả quá khứ. */}
      {seasonal && (
        <TrendCard title={`Tháng ${seasonal.month} vốn là tháng nặng`}>
          <p className="text-[0.8125rem] text-fg-secondary">
            Trung bình tháng {seasonal.month} bạn chi <b>{money(seasonal.avgForMonth)}</b> —{' '}
            <b className="text-money-out">nặng hơn {seasonal.heavierPct}%</b> so với mức thường
            lệ ({money(seasonal.avgOverall)}).
          </p>
          <p className="mt-1.5 text-[0.8125rem] text-fg-primary">
            Còn <b>{seasonal.monthsAway} tháng</b> — để thêm{' '}
            <b className="text-fg-accent">{money(seasonal.savePerMonth)}/tháng</b> là đủ phần
            vượt ({money(seasonal.extra)}).
          </p>
          <ExplainBox label="Cách đọc">
            <p>
              Lấy trung bình chi của riêng tháng {seasonal.month} qua {seasonal.occurrences} lần nó
              xuất hiện trong dữ liệu, so với trung bình mọi tháng. Phải có ít nhất 2 lần mới gọi là
              mùa vụ — một tháng {seasonal.month} duy nhất thì đó chỉ là một tháng, không phải một
              nếp.
            </p>
            <p>
              Con số "để thêm mỗi tháng" chia đều phần vượt cho số tháng còn lại. Nó không tính tới
              các khoản đã cam kết trong những tháng đó — xem Ngân sách mặt lập kế hoạch để ghép hai
              thứ lại.
            </p>
          </ExplainBox>
        </TrendCard>
      )}

      <TrendCard title="So với chính mình năm ngoái">
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
                  className="flex items-center justify-between gap-2 rounded-lg bg-surface-page px-2 py-1.5 text-xs"
                >
                  <span className="w-12 shrink-0 text-fg-muted">
                    {monthLabel(p.key)}
                  </span>
                  <span className="flex-1 truncate text-right tabular-nums text-fg-primary">
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
      </TrendCard>

      {/* 3. Điểm gãy */}
      <TrendCard title="Thời điểm nếp sống đổi hẳn">
        {monthsWithData < 8 ? (
          <NeedMore have={monthsWithData} need={8} />
        ) : changePoints.length === 0 ? (
          <p className="rounded-lg bg-state-good-bg px-3 py-3 text-center text-xs text-state-good-fg">
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
                        ? 'bg-state-warn-bg text-amber-800 dark:text-amber-300'
                        : 'bg-state-good-bg text-state-good-fg'
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
      </TrendCard>

      {/* 4. Lạm phát cá nhân */}
      <TrendCard title="Lạm phát của riêng bạn" hint="12 tháng vs 12 tháng trước">
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
              <p className="mt-2 rounded-lg bg-state-warn-bg text-state-warn-fg px-2 py-1.5 text-2xs">
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
      </TrendCard>

      {/* 5. Co giãn lối sống */}
      <TrendCard title="Thu nhập tăng thì chi có phình theo?">
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
            {/* Con số LỚN là TIỀN, không phải hệ số (15a mục 4: "độ co giãn nói bằng
                tiền, không bằng hệ số"). "0,58" bắt người đọc học một đơn vị mới trước
                khi hiểu được gì; "¥58 mỗi ¥100" thì đọc là hiểu. Hệ số vẫn còn, tụt
                xuống dòng phụ cho ai muốn con số so được giữa các kỳ. */}
            <p
              className={`text-2xl font-bold tabular-nums ${
                elasticity.marginalSpend >= 0.8
                  ? 'text-money-out'
                  : elasticity.marginalSpend >= 0.5
                    ? 'text-fg-warn'
                    : 'text-money-in'
              }`}
            >
              {money(Math.round(elasticity.marginalSpend * 100_00) / 100)}
              <span className="text-sm font-medium text-fg-muted"> mỗi {money(100_00 / 100)}</span>
            </p>
            <p className="mt-1 text-xs text-fg-secondary">
              Cứ thêm <b>{money(100_00 / 100)}</b> thu nhập thì bạn tiêu thêm{' '}
              <b>{money(Math.round(elasticity.marginalSpend * 100_00) / 100)}</b> và giữ lại{' '}
              <b className="text-money-in">
                {money(Math.round((1 - elasticity.marginalSpend) * 100_00) / 100)}
              </b>
              .
            </p>
            {/* Suy ra lần tăng lương tới (§4.5). Đây là chỗ con số này thật sự dùng được:
                nó biến một tỷ lệ quá khứ thành một dự đoán về quyết định sắp tới. */}
            <p className="mt-1 text-xs text-fg-secondary">
              Nếu lần tới lương tăng <b>{money(elasticity.incomeBefore * 0.1)}</b>/tháng, theo nếp
              này bạn sẽ giữ lại khoảng{' '}
              <b className="text-money-in">
                {money(elasticity.incomeBefore * 0.1 * (1 - elasticity.marginalSpend))}
              </b>
              /tháng.
            </p>
            <p className="mt-1 text-2xs text-fg-muted">
              Hệ số co giãn {elasticity.elasticity.toFixed(2).replace('.', ',')} — thu{' '}
              {signPct(elasticity.incomeChangePct)} thì chi {signPct(elasticity.expenseChangePct)}.
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
      </TrendCard>

      <p className="px-1 pb-2 text-center text-2xs text-fg-muted">
        Số liệu tính trên {monthsWithData} tháng có giao dịch, quy đổi về {base}.
      </p>
    </div>
  )
}
