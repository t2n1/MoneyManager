// Tab thứ tư "Quyết định" — bản 28a. MỚI, không thay thế gì.
//
// Ba tab kia đều trả lời "đã xảy ra gì". Không tab nào trả lời "làm gì thì đổi được gì",
// và khối đó cắt ngang cả ba nên không thuộc tab nào.
//
// Bốn khối:
//   01 phần giữ lại 12 tháng đi đâu   — nối ba tab lại, giải thích vì sao chúng nói khác nhau
//   02 làm gì thì đổi được gì          — bảng đòn bẩy, MỘT thước, mỗi dòng có cột Đánh đổi
//   03 nợ là những khoản gì            — xếp theo TIỀN LÃI; ẩn khi chưa khai khoản nợ nào
//   04 tiến độ mục tiêu                — mục tiêu THẬT; chưa có thì MỜI đặt, không dựng chuẩn
//
// Bản vẽ 28a ghi rằng khối 03 và 04 "cần dữ liệu app chưa có". KHÔNG ĐÚNG với repo này:
// bảng `debts` đã có `interest_bps` / `term_months` và `buildSchedule` dựng được lịch trả,
// còn `savings_goals` đã có tên / số đích / ngày đích / tài khoản. Nên hai khối đó dựng từ
// DỮ LIỆU THẬT, và điều kiện ẩn không phải "thiếu bảng" mà là "người dùng chưa khai hàng nào".

import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Card, EmptyState, Money, Num, SectionTitle, actionButtonClass } from '../../components/ui'
import { ConclusionLine, VerdictNote } from '../../components/VerdictNote'
import { Guide } from '../../components/Guide'
import {
  useAccountBalances,
  useAccounts,
  useCategories,
  useDebtPayments,
  useDebts,
  useProfile,
  useRangeTransactions,
  useRates,
  useRecurringRules,
  useSavingsGoals,
  useTransferCategoryIds,
} from '../../hooks/queries'
import {
  addMonths,
  dayMonthLabel,
  getMonthRange,
  monthKeyForDate,
  toISODate,
} from '../../lib/dates'
import { formatMoney, type CurrencyCode } from '../../lib/money'
import { convertToBase } from '../../lib/rates'
import { inferredCount, isLiquidAccount } from '../assets/liquidity'
import { monthlySeries } from './aggregate'
import { keptDestinations } from './monthReport'
import {
  debtBreakdown,
  goalProgress,
  keptFlow,
  monthsToClose,
  monthYearLabel,
  sortLevers,
  type LeverRow,
} from './decide'
import { ReportBlock } from './ReportBlock'

/** Cửa sổ của cả tab: 12 tháng đã hoàn tất — cùng cửa sổ với tab Sức khỏe. */
const WINDOW = 12

const TIER_DOT: Record<string, string> = {
  now: 'bg-money-in',
  sell: 'bg-fg-warn',
  gone: 'bg-money-out',
}
const TIER_WORD: Record<string, string> = {
  now: 'rút ngay được',
  sell: 'bán mới rút được',
  gone: 'không quay lại',
}

export function DecideView() {
  const { data: profile } = useProfile()
  const monthStartDay = profile?.month_start_day ?? 1
  const { base, rates } = useRates()
  const r = rates ?? {}
  const transferIds = useTransferCategoryIds()
  const { data: accounts = [] } = useAccounts()
  const { data: balances = [] } = useAccountBalances()
  const { data: categories = [] } = useCategories()
  const { data: debts = [] } = useDebts()
  const { data: debtPayments = [] } = useDebtPayments()
  const { data: goals = [] } = useSavingsGoals()
  const { data: recurringRules = [] } = useRecurringRules()

  const currencyOf = (id: string): CurrencyCode =>
    accounts.find((a) => a.id === id)?.currency ?? base

  const todayISO = toISODate(new Date())
  const months = useMemo(() => {
    const current = monthKeyForDate(todayISO, monthStartDay)
    return Array.from({ length: WINDOW }, (_, i) => addMonths(current, i - WINDOW))
  }, [todayISO, monthStartDay])
  const range = useMemo(
    () => ({
      start: getMonthRange(months[0], monthStartDay).start,
      end: getMonthRange(months[months.length - 1], monthStartDay).end,
    }),
    [months, monthStartDay],
  )
  const { data: txs = [], isFetched } = useRangeTransactions(range, !!profile)

  const series = useMemo(
    () => monthlySeries(txs, months, monthStartDay, currencyOf, base, r, transferIds),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [txs, months, monthStartDay, accounts, base, rates, transferIds],
  )
  const active = useMemo(
    () => series.points.filter((p) => p.income > 0 || p.expense > 0),
    [series],
  )
  const monthsCounted = active.length

  // Giữ lại = thu − CHI THẬT. KHÔNG trừ phần chuyển tài sản.
  //
  // Đây là chỗ dễ sai nhất của cả khối, và bản đầu đã sai đúng ở đây: trừ cả `transfer` thì
  // "gửi về VN" biến mất khỏi tử số, nhưng nó vẫn được in làm MỘT TẦNG của phần giữ lại —
  // và ba tầng cộng lại vượt 100% (đo được: 126% + 37% + 54%, kèm một dòng "Chỗ khác"
  // −117% để bù). Ở tab Tháng này thì `transfer` LÀ một tầng ngang hàng với chi tiêu, còn ở
  // đây câu hỏi khác: "phần không tiêu đi đâu", và gửi về VN là một trong những chỗ nó đi.
  //
  // Ràng buộc phải giữ: kept = tăng trưởng số dư (ròng, mọi tài khoản) + phần đã gửi đi.
  const kept = active.reduce((s, p) => s + (p.income - p.expense), 0)
  const remitTotal = active.reduce((s, p) => s + p.transfer, 0)

  // Tiền mặt dày thêm / đầu tư dày thêm: đọc từ BIẾN ĐỘNG SỐ DƯ, không từ thu − chi. Đây
  // chính là chỗ hai tab lệch nhau, nên phải đo bằng nguồn khác.
  const dest = useMemo(
    () => keptDestinations(txs, accounts, range.start, range.end, base, r),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [txs, accounts, range.start, range.end, base, rates],
  )
  const typeOf = useMemo(() => new Map(accounts.map((a) => [a.id, a.type])), [accounts])
  // Tổng RÒNG, không phải tổng phần dương.
  //
  // Lấy `Math.max(0, delta)` là đếm hai lần mọi lần chuyển khoản: nạp NISA ¥45.000/tháng
  // làm NISA +540.000 và ngân hàng −540.000, mà chỉ cộng phần dương thì +540.000 vào tổng
  // còn phần trừ thì không — nên "tiền mặt dày thêm" đọc ra 126% phần giữ lại.
  const growthBy = (pick: (type: string | undefined) => boolean) =>
    dest.rows
      .filter((row) => pick(typeOf.get(row.accountId)))
      .reduce((s, row) => s + (row.deltaBase ?? 0), 0)

  // Đọc CỜ `is_liquid` trước, chỉ suy từ `type` khi cờ còn null — cùng phép hỏi với tab
  // Sức khỏe, nên "tiền mặt dày thêm" ở đây và "quỹ dự phòng" ở đó đếm cùng một rổ.
  const liquidIds = useMemo(
    () => new Set(accounts.filter(isLiquidAccount).map((a) => a.id)),
    [accounts],
  )
  // Bao nhiêu tài khoản còn để app SUY. > 0 thì khối này phải nói ra — không nói thì
  // "82% phần giữ lại bị kẹt" đọc như một con số đã xác nhận.
  const guessing = useMemo(
    () => inferredCount(accounts.filter((a) => !a.is_archived && !a.is_hidden)),
    [accounts],
  )
  const cashGrowth = dest.rows
    .filter((row) => liquidIds.has(row.accountId))
    .reduce((s, row) => s + (row.deltaBase ?? 0), 0)
  const investGrowth = growthBy((t) => t === 'investment')

  const flow = useMemo(
    () => keptFlow({ kept, cashGrowth, investGrowth, remitTotal, months: monthsCounted }),
    [kept, cashGrowth, investGrowth, remitTotal, monthsCounted],
  )

  // ---------------------------------------------------------------- thước duy nhất
  const debtInfo = useMemo(
    () => debtBreakdown(debts, debtPayments, base, r, todayISO),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [debts, debtPayments, base, rates, todayISO],
  )
  const liquidNow = useMemo(
    () =>
      balances
        .filter(
          (b) =>
            !b.is_archived && !b.is_hidden && b.include_in_totals && isLiquidAccount(b),
        )
        .reduce((s, b) => s + (convertToBase(b.balance, b.currency, base, r) ?? 0), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [balances, base, rates],
  )
  const gap = Math.max(0, debtInfo.totalRemaining - liquidNow)
  const cashPace = monthsCounted > 0 ? Math.round(cashGrowth / monthsCounted) : 0
  const baseMonths = monthsToClose(gap, cashPace)

  // Đòn bẩy dựng từ SỐ THẬT của người dùng, không phải năm dòng cố định của bản vẽ.
  const investBalance = useMemo(
    () =>
      balances
        .filter((b) => !b.is_archived && !b.is_hidden && b.type === 'investment')
        .reduce((s, b) => s + (convertToBase(b.balance, b.currency, base, r) ?? 0), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [balances, base, rates],
  )
  const investPace = monthsCounted > 0 ? Math.round(investGrowth / monthsCounted) : 0
  const remitPace = monthsCounted > 0 ? Math.round(remitTotal / monthsCounted) : 0
  const biggestFixed = useMemo(() => {
    // Khoản định kỳ lớn nhất — thường là tiền nhà. Đọc từ recurring_rules chứ không đoán.
    let best: { note: string; amount: number } | null = null
    for (const rule of recurringRules) {
      if (rule.type !== 'expense' || rule.is_paused) continue
      const v = convertToBase(rule.amount, currencyOf(rule.account_id), base, r)
      if (v === null) continue
      if (best === null || v > best.amount) best = { note: rule.note.trim() || 'Khoản định kỳ', amount: v }
    }
    return best
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recurringRules, accounts, base, rates])

  const levers = useMemo<LeverRow[]>(() => {
    if (gap <= 0) return []
    const rows: LeverRow[] = []
    const after = (extraPerMonth: number) => monthsToClose(gap, cashPace + extraPerMonth)

    if (investBalance >= gap) {
      rows.push({
        key: 'sell',
        label: `Bán ${formatMoney(Math.round(gap), base)} đầu tư`,
        cashPerMonth: null,
        monthsAfter: 0,
        tradeoff: 'Chốt lãi/lỗ sớm, và mất chỗ trong hạn mức đầu tư ưu đãi năm nay',
      })
    }
    if (investPace > 0) {
      const halve = Math.round(investPace / 2)
      rows.push({
        key: 'invest',
        label: `Hạ nhịp đầu tư còn ${formatMoney(investPace - halve, base)}/tháng`,
        cashPerMonth: halve,
        monthsAfter: after(halve),
        tradeoff: `Đầu tư 12 tháng tới ít đi ${formatMoney(halve * 12, base)}`,
      })
    }
    if (biggestFixed !== null && biggestFixed.amount > 0) {
      const cut = Math.round(biggestFixed.amount * 0.15)
      rows.push({
        key: 'fixed',
        label: `Giảm "${biggestFixed.note}" ${formatMoney(cut, base)}/tháng`,
        cashPerMonth: cut,
        monthsAfter: after(cut),
        tradeoff: 'Khoản cố định lớn nhất — đổi được thì đổi nhiều, nhưng thường tốn chi phí một lần',
      })
    }
    if (remitPace > 0) {
      rows.push({
        key: 'remit',
        label: `Tạm dừng gửi về VN 3 tháng`,
        cashPerMonth: Math.round((remitPace * 3) / 12),
        monthsAfter: after(Math.round((remitPace * 3) / 12)),
        tradeoff: 'Gián đoạn chuỗi gửi đều — thứ mà người nhận đang tính vào',
      })
    }
    return rows
  }, [gap, cashPace, investBalance, investPace, remitPace, biggestFixed, base])

  // Mục tiêu THẬT đổi thứ tự bảng: mục tiêu nào đang tiến gần nhất mà lại phụ thuộc đúng
  // dòng nào thì dòng đó tụt xuống cuối. Ở đây: có mục tiêu nào nhắc "VN"/"gửi" thì "tạm
  // dừng gửi về VN" không còn là đòn bẩy đáng đề xuất trước.
  const deprioritise = useMemo(() => {
    const names = goals.map((g) => g.name.toLowerCase())
    return names.some((n) => n.includes('vn') || n.includes('việt') || n.includes('gửi'))
      ? ['remit']
      : []
  }, [goals])
  const leverRows = useMemo(() => sortLevers(levers, deprioritise), [levers, deprioritise])

  // ---------------------------------------------------------------- mục tiêu
  const balanceOf = (accountId: string) => {
    const b = balances.find((x) => x.id === accountId)
    return b ? b.balance : null
  }
  const goalLines = useMemo(
    () => goalProgress(goals, balanceOf, cashPace, todayISO),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [goals, balances, cashPace, todayISO],
  )

  if (!isFetched) {
    return <EmptyState>Đang tính…</EmptyState>
  }
  if (monthsCounted === 0) {
    return (
      <EmptyState>
        Chưa có giao dịch nào trong {WINDOW} tháng gần đây nên chưa đo được nhịp nào.
      </EmptyState>
    )
  }

  const money = (v: number) => formatMoney(Math.round(v), base)

  return (
    <div className="flex flex-col gap-2.5">
      <Num tone="muted" className="text-2xs">
        nhịp {monthsCounted} tháng · cập nhật {dayMonthLabel(todayISO)}
      </Num>

      <ConclusionLine
        tone={flow.illiquidPct !== null && flow.illiquidPct > 60 ? 'warn' : 'info'}
        // Bản NGẮN là bản phần lớn người dùng thấy (chế độ Gọn là mặc định), nên nó phải
        // đúng ở cả ba nhánh — kể cả nhánh 0%, chỗ mà "0% không rút ngay được" đọc như một
        // lời cảnh báo trong khi nó là tin tốt.
        short={
          flow.illiquidPct === null
            ? `${monthsCounted} tháng chưa giữ lại được`
            : flow.illiquidPct === 0
              ? 'Phần giữ lại nằm hết ở tiền mặt'
              : `${flow.illiquidPct}% phần giữ lại không rút ngay được`
        }
      >
        {flow.illiquidPct === null ? (
          <>
            {monthsCounted} tháng qua chi bằng hoặc hơn thu, nên chưa có phần giữ lại nào để nói
            nó đã đi đâu.
          </>
        ) : flow.illiquidPct === 0 ? (
          <>
            Giữ lại <b>{money(kept / monthsCounted)}</b>/tháng, và <b>toàn bộ</b> phần đó nằm ở
            tiền mặt — rút ra được ngay. Chưa có đồng nào bị kẹt ở chỗ phải bán mới lấy ra được.
          </>
        ) : (
          <>
            Giữ lại <b>{money(kept / monthsCounted)}</b>/tháng nhưng tiền mặt chỉ dày thêm{' '}
            <b>{money(cashGrowth / monthsCounted)}</b> —{' '}
            <b className="text-fg-warn">{flow.illiquidPct}%</b> phần giữ lại đi vào chỗ không rút
            ra ngay được. Đó là lý do một tab nói “tháng tốt nhất” và một tab nói “rủi ro thanh
            khoản” cùng lúc, và cả hai đều đúng.
          </>
        )}
      </ConclusionLine>

      {/* ---------------------------------------------------------------- 01 */}
      <ReportBlock no="01" title={`Phần giữ lại ${monthsCounted} tháng đi đâu`}>
        <Card as="section" elevation="panel" padding="panel">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-sm font-semibold text-fg-primary">
              Giữ lại {monthsCounted} tháng <Money amount={kept} currency={base} className="text-sm" />
            </span>
            <span className="text-2xs text-fg-muted">rút ra được ngay ↔ không</span>
          </div>
          <ul className="flex flex-col">
            {flow.tiers.map((t) => (
              <li
                key={t.key}
                className="grid grid-cols-[minmax(0,1fr)_minmax(6rem,auto)_2.75rem] items-baseline gap-x-2 border-b border-border-subtle py-2 last:border-0 last:pb-0"
              >
                <span className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
                  <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${TIER_DOT[t.liquid]}`} />
                  <span className="text-sm text-fg-primary">{t.label}</span>
                  {t.perMonth !== null && monthsCounted > 1 && (
                    <span className="text-2xs text-fg-muted">
                      · <Money amount={t.perMonth} currency={base} className="text-2xs" />
                      /tháng
                    </span>
                  )}
                  {t.note && <span className="text-2xs text-fg-muted">· {t.note}</span>}
                  <span className="text-2xs text-fg-muted">· {TIER_WORD[t.liquid]}</span>
                </span>
                <Money
                  amount={t.amount}
                  currency={base}
                  className="text-right text-sm"
                />
                <span className="text-right text-sm">
                  <Num tone="muted">{t.pct === null ? '—' : `${t.pct}%`}</Num>
                </span>
              </li>
            ))}
          </ul>
          {/* KHÔNG bọc <Guide>: đây là cảnh báo con số đang dựa trên phép đoán, không phải
              chữ dạy cách đọc. Ẩn nó ở chế độ Gọn là để người đọc tin một tỷ lệ mà app tự
              suy hộ. Chỉ hiện khi thật sự còn tài khoản chưa đặt cờ. */}
          {guessing > 0 && (
            <p className="mt-2 rounded-lg bg-state-warn-bg px-2.5 py-2 text-2xs text-state-warn-fg">
              <b>{guessing} tài khoản</b> chưa khai “rút ra được ngay”, nên app đang suy từ loại
              tài khoản — tiền gửi có kỳ hạn vì thế đang bị đếm là tiền mặt.{' '}
              <Link to="/settings/accounts" className="font-medium underline">
                Khai ở Cài đặt → Tài khoản: bấm vào TÊN tài khoản có dấu “rút ngay?”
              </Link>
            </p>
          )}
          <Guide className="mt-2 text-2xs text-fg-muted">
            Phần “tiền mặt dày thêm” và “vào đầu tư” đọc từ BIẾN ĐỘNG SỐ DƯ từng tài khoản, không
            từ thu − chi — đó chính là chỗ hai tab kia lệch nhau, nên phải đo bằng nguồn khác.
          </Guide>
        </Card>
      </ReportBlock>

      {/* ---------------------------------------------------------------- 02 */}
      <ReportBlock no="02" title="Làm gì thì đổi được gì">
        <Card as="section" elevation="panel" padding="none">
          <div className="border-b border-border-panel px-4 py-3">
            <SectionTitle as="h3">
              {gap <= 0
                ? 'Tiền mặt đã đủ trả hết nợ tới hạn'
                : `Còn thiếu ${money(gap)} để đủ 1× trả nợ`}
            </SectionTitle>
            <p className="mt-0.5 text-2xs text-fg-muted">
              {gap <= 0 ? (
                <>Không còn khoảng nào phải lấp, nên bảng đòn bẩy dưới đây trống.</>
              ) : baseMonths === null ? (
                <>
                  Với nhịp tiền mặt hiện tại ({money(cashPace)}/tháng) thì <b>không tới được</b> —
                  tiền mặt không dày thêm.
                </>
              ) : (
                <>
                  Theo nhịp tiền mặt hiện tại: <b>{baseMonths} tháng</b>
                  {' '}— tới {monthYearLabel(range.end)} + {Math.ceil(baseMonths)} tháng. Mọi dòng
                  dưới đây đo bằng CÙNG thước đó.
                </>
              )}
            </p>
          </div>

          {leverRows.length === 0 ? (
            <p className="px-4 py-3 text-sm text-fg-muted">
              {gap <= 0
                ? 'Không có gì cần đổi.'
                : 'Chưa đủ dữ liệu để dựng đòn bẩy nào: cần có tài khoản đầu tư, khoản định kỳ, hoặc lịch gửi tiền để biết chỗ nào dịch được.'}
            </p>
          ) : (
            <div role="table" aria-label="Nếu làm X thì rút ngắn còn bao lâu">
              <div
                role="row"
                className="grid grid-cols-[minmax(0,1fr)_minmax(4.5rem,auto)_minmax(4rem,auto)] items-baseline gap-x-2 border-b border-border-panel bg-surface-chrome px-4 py-2.5 text-2xs uppercase tracking-label text-fg-muted lg:grid-cols-[minmax(0,1.1fr)_minmax(4.5rem,auto)_minmax(4rem,auto)_minmax(0,1.2fr)]"
              >
                <span role="columnheader">Nếu làm</span>
                <span role="columnheader" className="text-right">
                  Tiền mặt/th
                </span>
                <span role="columnheader" className="text-right">
                  Còn
                </span>
                <span role="columnheader" className="hidden lg:block">
                  Đánh đổi
                </span>
              </div>
              <ul>
                {leverRows.map((row) => (
                  <li key={row.key} className="border-b border-border-subtle last:border-0">
                    <div
                      role="row"
                      className="grid grid-cols-[minmax(0,1fr)_minmax(4.5rem,auto)_minmax(4rem,auto)] items-baseline gap-x-2 px-4 py-2 lg:grid-cols-[minmax(0,1.1fr)_minmax(4.5rem,auto)_minmax(4rem,auto)_minmax(0,1.2fr)]"
                    >
                      <span role="cell" className="min-w-0 text-sm text-fg-primary">
                        {row.label}
                      </span>
                      <span role="cell" className="text-right text-sm">
                        {row.cashPerMonth === null ? (
                          <Num tone="muted">—</Num>
                        ) : (
                          <Money amount={row.cashPerMonth} currency={base} showSign tone="in" className="text-sm" />
                        )}
                      </span>
                      <span role="cell" className="text-right text-sm">
                        <Num tone={row.monthsAfter === 0 ? 'in' : 'neutral'}>
                          {row.monthsAfter === null
                            ? 'không tới'
                            : row.monthsAfter === 0
                              ? 'ngay'
                              : `${row.monthsAfter} th`}
                        </Num>
                      </span>
                      {/* Cột Đánh đổi BẮT BUỘC. Dưới `lg` nó xuống dòng riêng chứ không bị
                          ẩn: bảng này là ngoại lệ duy nhất được phép gợi ý hành động, và
                          giá của ngoại lệ đó chính là cột này. */}
                      <span role="cell" className="hidden min-w-0 text-2xs text-fg-muted lg:block">
                        {row.tradeoff}
                      </span>
                    </div>
                    <p className="px-4 pb-2 text-2xs text-fg-muted lg:hidden">
                      Đánh đổi: {row.tradeoff}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      </ReportBlock>

      {/* ---------------------------------------------------------------- 03 */}
      {debtInfo.lines.length > 0 ? (
        <ReportBlock no="03" title="Nợ là những khoản gì">
          <Card as="section" elevation="panel" padding="none">
            <div className="border-b border-border-panel px-4 py-3 text-2xs text-fg-muted">
              Dư nợ <Money amount={debtInfo.totalRemaining} currency={base} className="text-2xs" /> · trả{' '}
              <Money amount={debtInfo.totalPerPeriod} currency={base} className="text-2xs" />/kỳ · lãi
              còn phải trả{' '}
              <Money amount={debtInfo.totalInterest} currency={base} className="text-2xs" />
              {debtInfo.hasIncomplete && <> (chưa gồm khoản chưa khai lãi suất)</>}
            </div>
            <div
              role="row"
              className="grid grid-cols-[minmax(0,1fr)_minmax(5.5rem,auto)_minmax(3.5rem,auto)_minmax(5rem,auto)] items-baseline gap-x-2 border-b border-border-panel bg-surface-chrome px-4 py-2.5 text-2xs uppercase tracking-label text-fg-muted"
            >
              <span role="columnheader">Khoản</span>
              <span role="columnheader" className="text-right">
                Dư nợ
              </span>
              <span role="columnheader" className="text-right">
                Lãi/năm
              </span>
              <span role="columnheader" className="text-right">
                Lãi còn
              </span>
            </div>
            <ul>
              {debtInfo.lines.map((l) => (
                <li
                  key={l.id}
                  className="grid grid-cols-[minmax(0,1fr)_minmax(5.5rem,auto)_minmax(3.5rem,auto)_minmax(5rem,auto)] items-baseline gap-x-2 border-b border-border-subtle px-4 py-2 last:border-0"
                >
                  <span className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
                    <span className="min-w-0 truncate text-sm text-fg-primary">{l.label}</span>
                    {l.termsLeft !== null && (
                      <span className="text-2xs text-fg-muted">· còn {l.termsLeft} kỳ</span>
                    )}
                  </span>
                  <Money amount={l.remaining} currency={l.currency} className="text-right text-sm" />
                  <span className="text-right text-sm">
                    <Num tone={l.ratePct === null ? 'muted' : l.ratePct > 10 ? 'out' : 'neutral'}>
                      {l.ratePct === null ? 'chưa khai' : `${l.ratePct.toFixed(1).replace('.', ',')}%`}
                    </Num>
                  </span>
                  <span className="text-right text-sm">
                    {l.interestLeft === null ? (
                      <Num tone="muted">—</Num>
                    ) : (
                      <Money amount={l.interestLeft} currency={l.currency} tone="out" className="text-sm" />
                    )}
                  </span>
                </li>
              ))}
            </ul>
            {/* Insight của khối: xếp theo LÃI đổi hẳn thứ tự ưu tiên so với xếp theo dư nợ. */}
            {debtInfo.lines.length > 1 && debtInfo.totalInterest > 0 && (
              <p className="border-t border-border-panel px-4 py-2.5 text-2xs text-fg-secondary">
                Bảng xếp theo <b>tiền lãi</b>, không theo dư nợ.{' '}
                {(() => {
                  const top = debtInfo.lines[0]
                  const debtShare = Math.round(((top.remainingBase ?? 0) / debtInfo.totalRemaining) * 100)
                  const interestShare = Math.round(((top.interestLeft ?? 0) / debtInfo.totalInterest) * 100)
                  const zero = debtInfo.lines.filter((l) => l.interestLeft === 0)
                  return (
                    <>
                      “{top.label}” là <b>{debtShare}%</b> dư nợ nhưng <b>{interestShare}%</b> tiền
                      lãi — trả trước khoản này tiết kiệm được{' '}
                      <b>{formatMoney(top.interestLeft ?? 0, top.currency)}</b>.
                      {zero.length > 0 && (
                        <>
                          {' '}
                          Còn “{zero[0].label}” lãi 0%: trả trước nó không tiết kiệm đồng nào mà lại
                          làm tiền mặt mỏng đi.
                        </>
                      )}
                    </>
                  )
                })()}
              </p>
            )}
          </Card>
        </ReportBlock>
      ) : (
        <VerdictNote tone="info" short="Chưa khai khoản nợ nào">
          Khối “Nợ là những khoản gì” ẩn vì chưa có khoản nợ nào được khai. App KHÔNG đoán lãi
          suất hộ — có khai lãi suất và số kỳ thì bảng mới nói được khoản nào đáng trả trước.{' '}
          <Link to="/debts" className="font-medium text-fg-accent hover:underline">
            Khai khoản nợ
          </Link>
        </VerdictNote>
      )}

      {/* ---------------------------------------------------------------- 04 */}
      <ReportBlock no="04" title="Tiến độ mục tiêu">
        {goalLines.length === 0 ? (
          <Card as="section" elevation="panel" padding="panel">
            <p className="text-sm text-fg-secondary">
              Chưa có mục tiêu nào. Cả trang này đang đo bạn bằng <b>chuẩn sách vở</b> (6 tháng
              đệm, 50/30/20) vì chưa biết bạn muốn gì — và với người Việt ở Nhật gửi tiền về nhà
              thì mục tiêu thật có thể khác hẳn.
            </p>
            <p className="mt-1.5 text-2xs text-fg-muted">
              Có mục tiêu thật thì <b>bảng đòn bẩy ở khối 02 đổi thứ tự</b>: đích là gửi tiền về
              nhà thì “tạm dừng gửi về VN” tụt xuống cuối, dù nó rút ngắn nhiều nhất.
            </p>
            <Link to="/assets" className={actionButtonClass('primary', 'mt-3')}>
              Đặt mục tiêu
            </Link>
          </Card>
        ) : (
          <Card as="section" elevation="panel" padding="panel">
            <ul className="flex flex-col gap-3">
              {goalLines.map((g) => (
                <li key={g.id} className="flex flex-col gap-1">
                  <span className="flex flex-wrap items-baseline justify-between gap-x-2">
                    <span className="min-w-0 truncate text-sm text-fg-primary">{g.name}</span>
                    <Num tone={g.done ? 'in' : 'neutral'}>{Math.round(g.ratio * 100)}%</Num>
                  </span>
                  <span className="h-2 overflow-hidden rounded-full bg-surface-sunken">
                    <span
                      className={`block h-full rounded-full ${g.done ? 'bg-money-in' : 'bg-accent'}`}
                      style={{ width: `${g.ratio * 100}%` }}
                    />
                  </span>
                  <span className="text-2xs text-fg-muted">
                    <Money amount={g.current} currency={base} className="text-2xs" /> /{' '}
                    <Money amount={g.target} currency={base} className="text-2xs" />
                    {g.done ? (
                      ' · đã đạt'
                    ) : g.etaISO !== null ? (
                      <> · theo nhịp tới {monthYearLabel(g.etaISO)}</>
                    ) : (
                      ' · chưa đo được nhịp'
                    )}
                    {g.targetDate !== null && <> · bạn đặt hạn {monthYearLabel(g.targetDate)}</>}
                  </span>
                </li>
              ))}
            </ul>
            <Guide className="mt-2 text-2xs text-fg-muted">
              Mốc “theo nhịp” dùng nhịp tiền mặt dày thêm của {monthsCounted} tháng qua (
              {money(cashPace)}/tháng), nên nó đổi khi nhịp đổi — không phải một lời hứa.
            </Guide>
          </Card>
        )}
      </ReportBlock>

      <p className="px-1 pb-2 text-2xs text-fg-muted">
        Nhịp tính trên {monthsCounted} tháng gần nhất · quy đổi ≈ {base}
        {debtInfo.hasMissingRate && ' · một phần dư nợ chưa quy đổi được'}
        {categories.length === 0 && ' · chưa có danh mục nào'} · mọi mốc thời gian là suy từ
        nhịp, không phải cam kết
      </p>
    </div>
  )
}
