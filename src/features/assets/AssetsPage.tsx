import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, CreditCard, Settings2 } from 'lucide-react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { AccountTypeIcon } from '../../components/icons'
import { PrivacyToggle } from '../../components/PrivacyToggle'
import { NetWorthHistorySection } from './NetWorthHistorySection'
import { SavingsGoalsSection } from './SavingsGoalsSection'
import {
  useAccountBalances,
  useAssetGroupSettings,
  useDebtPayments,
  useDebts,
  useRates,
} from '../../hooks/queries'
import { CURRENCIES, formatMoney } from '../../lib/money'
import { daysBetween, nextCardDueDate, toISODate } from '../../lib/dates'
import { debtSummary } from '../debts/aggregate'
import { assetBreakdown, assetTypeGroups, cardFunding, type AssetGroupSetting } from './aggregate'

// Bảng màu cho lát bánh (lặp lại nếu > 12 nhóm) — đồng bộ với ReportsPage
const PALETTE = [
  '#16a34a', '#0ea5e9', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899',
  '#14b8a6', '#f97316', '#6366f1', '#84cc16', '#06b6d4', '#a855f7',
]

// Nhãn thứ trong tuần cho ngày đến hạn (đã dời cuối tuần nên chỉ rơi T2–T6)
const WEEKDAY_VI = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']

/** "T2, 27/7" cho ngày đến hạn ISO. */
function dueDateLabel(iso: string): string {
  const [, m, d] = iso.split('-').map(Number)
  const dow = new Date(iso + 'T00:00:00Z').getUTCDay()
  return `${WEEKDAY_VI[dow]}, ${d}/${m}`
}

/** "hôm nay" · "ngày mai" · "còn N ngày" từ hôm nay đến hạn. */
function dueRelativeLabel(todayISO: string, dueISO: string): string {
  const n = daysBetween(todayISO, dueISO)
  if (n <= 0) return 'hôm nay'
  if (n === 1) return 'ngày mai'
  return `còn ${n} ngày`
}

export function AssetsPage() {
  const { data: balances = [], isLoading } = useAccountBalances()
  const { data: groupSettings = [] } = useAssetGroupSettings()
  const { data: debts = [] } = useDebts()
  const { data: debtPayments = [] } = useDebtPayments()
  const { base, rates } = useRates()

  // Tài sản ròng = tổng tài sản gộp + (cho vay còn lại − mình nợ còn lại), quy đổi base
  const debts_ = useMemo(
    () => debtSummary(debts, debtPayments, base, rates ?? {}),
    [debts, debtPayments, base, rates],
  )

  const settings: AssetGroupSetting[] = useMemo(
    () =>
      groupSettings.map((s) => ({
        name: s.name,
        sortOrder: s.sort_order,
        includeInTotals: s.include_in_totals,
        hidden: s.is_hidden,
      })),
    [groupSettings],
  )

  const breakdown = useMemo(
    () => assetBreakdown(balances, base, rates ?? {}, settings),
    [balances, base, rates, settings],
  )

  // Chế độ xem cơ cấu: 'purpose' = theo mục đích (asset_group) · 'type' = theo loại tài khoản
  const [groupMode, setGroupMode] = useState<'purpose' | 'type'>('purpose')

  // Nhóm theo mục đích: bỏ nhóm ẩn / tài khoản ẩn, và nhóm rỗng
  const purposeGroups = useMemo(
    () =>
      breakdown.groups
        .filter((g) => !g.hidden)
        .map((g) => ({ ...g, accounts: g.accounts.filter((a) => !a.hidden) }))
        .filter((g) => g.accounts.length > 0),
    [breakdown.groups],
  )

  // Nhóm theo loại tài khoản (Tiền mặt / Ngân hàng…) — cùng tập tài sản tính vào tổng
  const typeGroups = useMemo(() => assetTypeGroups(breakdown), [breakdown])

  const displayGroups = groupMode === 'purpose' ? purposeGroups : typeGroups

  // Biểu đồ tròn = cơ cấu của Tổng tài sản → chỉ nhóm được tính vào tổng
  const pieData = displayGroups
    .filter((g) => g.includeInTotals && g.total > 0)
    .map((g, i) => ({
      name: g.name,
      value: g.total,
      color: PALETTE[i % PALETTE.length],
    }))

  // Màu theo tên nhóm để chấm tròn trong danh sách khớp với lát bánh
  const colorOf = (name: string) =>
    pieData.find((d) => d.name === name)?.color ?? '#cbd5e1'

  const approx = breakdown.hasForeign ? '≈ ' : ''
  // Đếm tài khoản / nhóm ở khối Tổng tài sản luôn theo mục đích (mô tả toàn cảnh, không đổi theo chart)
  const accountCount = purposeGroups.reduce((n, g) => n + g.accounts.length, 0)
  // Đầu tư: có snapshot giá trị thị trường nào không → hiện dòng lãi/lỗ chưa thực hiện
  const hasValuation = breakdown.groups.some((g) =>
    g.accounts.some((a) => a.marketValue != null),
  )
  const pnl = breakdown.unrealizedPnl

  // Thẻ tín dụng: công nợ, hiển thị riêng và trừ vào Tài sản ròng
  const visibleCards = breakdown.cards.filter((c) => !c.hidden)
  const cardOwed = -breakdown.cardDebt // số dương = đang nợ thẻ (quy đổi base)
  const showNetWorth = debts_.hasOpen || visibleCards.length > 0
  // Đối chiếu tiền trả thẻ: phân bổ số dư nguồn cho các thẻ dùng chung → badge nhất quán
  const cardSources = new Map(
    balances.map((b) => [b.id, { id: b.id, name: b.name, currency: b.currency, balance: b.balance }]),
  )
  const funding = cardFunding(visibleCards, cardSources)
  const todayISO = toISODate(new Date())
  // Chỉ tổng gộp khi ≥2 thẻ chung nguồn và đang thực nợ (dòng "cần nạp thêm")
  const sharedSources = funding.groups.filter((g) => g.cardCount >= 2 && g.totalOwed > 0)
  const netApprox =
    breakdown.hasForeign || debts_.hasMissingRate || breakdown.cardHasMissingRate ? '≈ ' : ''
  // Tài sản ròng để ghi lịch sử (mục AF): chỉ ghi khi số liệu tin cậy (không thiếu tỷ giá)
  const netWorth = breakdown.total + debts_.net + breakdown.cardDebt
  const netWorthReliable =
    !isLoading &&
    !breakdown.hasMissingRate &&
    !debts_.hasMissingRate &&
    !breakdown.cardHasMissingRate

  return (
    <div className="flex flex-col gap-4 p-3 lg:p-6">
      <div className="flex items-center gap-2">
        <h1 className="flex-1 text-lg font-bold text-gray-800 dark:text-gray-100">Tài sản</h1>
        <PrivacyToggle />
        <Link
          to="/settings/asset-groups"
          className="inline-flex items-center gap-1 rounded-lg bg-white dark:bg-gray-900 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 shadow-sm active:scale-95"
        >
          <Settings2 className="h-4 w-4" /> Quản lý nhóm
        </Link>
      </div>

      {/* Tổng tài sản */}
      <section className="rounded-2xl bg-gradient-to-br from-green-600 to-emerald-700 p-5 text-white shadow-md">
        <p className="text-sm font-medium text-green-50/90">
          Tổng tài sản · {CURRENCIES[base].label}
        </p>
        <p className="mt-1.5 text-[2rem] font-bold leading-none tracking-tight tabular-nums">
          {isLoading ? '…' : `${approx}${formatMoney(breakdown.total, base)}`}
        </p>
        {!isLoading && (
          <p className="mt-2.5 text-xs text-green-50/80">
            {accountCount} tài khoản · {purposeGroups.length} nhóm
          </p>
        )}
        {!isLoading && hasValuation && (
          <p className="mt-2 text-xs text-green-50/90">
            Lãi/lỗ đầu tư (chưa thực hiện):{' '}
            <span className="font-semibold tabular-nums text-white">
              {pnl >= 0 ? '+' : '−'}
              {breakdown.pnlHasMissingRate ? '≈ ' : ''}
              {formatMoney(Math.abs(pnl), base)}
            </span>
          </p>
        )}
        {breakdown.hasMissingRate && (
          <p className="mt-2 text-xs text-green-100">
            Một phần tài sản ngoại tệ chưa quy đổi được (đang chờ tỷ giá) nên tổng có thể thiếu.
          </p>
        )}
      </section>

      {/* Tài sản ròng (hiện khi có khoản nợ mở hoặc có thẻ tín dụng) */}
      {showNetWorth && (
        <section className="rounded-2xl bg-white dark:bg-gray-900 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Tài sản ròng</span>
            <Link to="/settings/debts" className="inline-flex items-center gap-0.5 text-xs font-medium text-green-700 dark:text-green-400">
              Nợ / cho vay <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
          <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900 dark:text-gray-100">
            {netApprox}
            {formatMoney(breakdown.total + debts_.net + breakdown.cardDebt, base)}
          </p>
          <div className="mt-3 space-y-1.5 text-sm">
            <div className="flex items-center justify-between text-gray-500 dark:text-gray-400">
              <span>Tổng tài sản</span>
              <span className="tabular-nums">{formatMoney(breakdown.total, base)}</span>
            </div>
            {debts_.owedToMe > 0 && (
              <div className="flex items-center justify-between text-green-600 dark:text-green-400">
                <span>+ Cho vay còn lại</span>
                <span className="tabular-nums">{formatMoney(debts_.owedToMe, base)}</span>
              </div>
            )}
            {debts_.iOwe > 0 && (
              <div className="flex items-center justify-between text-red-600 dark:text-red-400">
                <span>− Nợ phải trả</span>
                <span className="tabular-nums">{formatMoney(debts_.iOwe, base)}</span>
              </div>
            )}
            {cardOwed > 0 && (
              <div className="flex items-center justify-between text-red-600 dark:text-red-400">
                <span>− Nợ thẻ tín dụng</span>
                <span className="tabular-nums">{formatMoney(cardOwed, base)}</span>
              </div>
            )}
          </div>
          {(debts_.hasMissingRate || breakdown.cardHasMissingRate) && (
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              Một phần công nợ ngoại tệ chưa quy đổi được nên số ròng có thể thiếu.
            </p>
          )}
        </section>
      )}

      {/* Mục tiêu tiết kiệm (mục AD) */}
      <SavingsGoalsSection />

      {/* Lịch sử tài sản ròng (mục AF) */}
      <NetWorthHistorySection base={base} currentNetWorth={netWorthReliable ? netWorth : null} />

      {/* Thẻ tín dụng */}
      {visibleCards.length > 0 && (
        <section className="rounded-2xl bg-white dark:bg-gray-900 p-4 shadow-sm">
          <h2 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            <CreditCard className="h-3.5 w-3.5" /> Thẻ tín dụng
          </h2>

          {/* Tổng theo ngân hàng nguồn — con số cần khi chuyển tiền vào để thanh toán */}
          {sharedSources.length > 0 && (
            <div className="mb-3 space-y-2">
              {sharedSources.map((g) => (
                <div
                  key={g.sourceId}
                  className="rounded-xl border border-gray-100 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-800/50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Trả {g.cardCount} thẻ từ {g.sourceName}
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        g.enough
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                          : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                      }`}
                    >
                      {g.enough ? 'đủ trả' : `cần nạp thêm ${formatMoney(g.shortfall, g.currency)}`}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                    <span>Tổng nợ {g.cardCount} thẻ</span>
                    <span className="tabular-nums font-medium text-red-600 dark:text-red-400">
                      − {formatMoney(g.totalOwed, g.currency)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                    <span>Số dư {g.sourceName}</span>
                    <span className="tabular-nums">{formatMoney(g.sourceBalance, g.currency)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <ul className="space-y-3">
            {visibleCards.map((c) => {
              const owed = c.balance < 0 ? -c.balance : 0 // đang nợ (currency gốc)
              const available = c.creditLimit != null ? c.creditLimit - owed : null
              // Đối chiếu nguồn trả thẻ (đã phân bổ nếu dùng chung nguồn)
              const f = funding.byCard.get(c.id)
              // Ngày đến hạn trả kế tiếp (đã dời T7/CN sang T2)
              const dueISO = c.paymentDueDay != null ? nextCardDueDate(c.paymentDueDay, todayISO) : null
              return (
                <li key={c.id}>
                  <Link
                    to={`/assets/${c.id}`}
                    className="block rounded-xl px-2 py-2 transition hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    {/* Tên thẻ + trạng thái đủ/thiếu tiền trả */}
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-700 dark:text-gray-300">
                        {c.name}
                        {!c.includeInTotals && (
                          <span className="ml-1 text-[10px] font-normal text-gray-500 dark:text-gray-400">
                            (ngoài tổng)
                          </span>
                        )}
                      </span>
                      {owed > 0 && f && (
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            f.enough
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                              : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                          }`}
                        >
                          {f.enough ? 'đủ trả' : `thiếu ${formatMoney(f.shortfall, c.currency)}`}
                        </span>
                      )}
                    </div>

                    {/* Số cần trả (nổi bật) + ngày đến hạn */}
                    <div className="mt-1.5 ml-6 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      {owed > 0 ? (
                        <>
                          <span className="text-xs text-gray-500 dark:text-gray-400">Cần trả</span>
                          <span className="text-xl font-bold tabular-nums text-red-600 dark:text-red-400">
                            {formatMoney(owed, c.currency)}
                          </span>
                        </>
                      ) : (
                        <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                          Chưa phát sinh nợ
                        </span>
                      )}
                      {owed > 0 && dueISO && (
                        <span className="ml-auto text-xs text-gray-500 dark:text-gray-400">
                          Đến hạn{' '}
                          <span className="font-semibold text-gray-700 dark:text-gray-200">
                            {dueDateLabel(dueISO)}
                          </span>
                          <span className="text-gray-500 dark:text-gray-400">
                            {' '}· {dueRelativeLabel(todayISO, dueISO)}
                          </span>
                        </span>
                      )}
                    </div>

                    {/* Nguồn trả + hạn mức còn lại */}
                    {(f || available != null) && (
                      <p className="mt-1 ml-6 text-xs text-gray-500 dark:text-gray-400">
                        {f && (
                          <>
                            Trả từ {f.sourceName}
                            {!f.shared && (
                              <>
                                {' '}· số dư{' '}
                                <span className="tabular-nums">
                                  {formatMoney(f.sourceBalance, c.currency)}
                                </span>
                              </>
                            )}
                          </>
                        )}
                        {f && available != null && ' · '}
                        {available != null && (
                          <>
                            còn dùng được{' '}
                            <span className="tabular-nums">{formatMoney(available, c.currency)}</span>
                          </>
                        )}
                      </p>
                    )}
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {/* Biểu đồ tròn + danh sách nhóm */}
      <section className="rounded-2xl bg-white dark:bg-gray-900 p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Cơ cấu tài sản
          </h2>
          <div
            role="tablist"
            aria-label="Chế độ xem cơ cấu"
            className="flex rounded-lg bg-gray-100 dark:bg-gray-800 p-0.5 text-xs font-medium"
          >
            {(
              [
                ['purpose', 'Mục đích'],
                ['type', 'Loại'],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                role="tab"
                aria-selected={groupMode === mode}
                onClick={() => setGroupMode(mode)}
                className={`rounded-md px-2.5 py-2.5 transition ${
                  groupMode === mode
                    ? 'bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 shadow-sm'
                    : 'text-gray-500 dark:text-gray-400'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {pieData.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
            {isLoading ? 'Đang tải…' : 'Chưa có tài sản để hiển thị'}
          </p>
        ) : (
          <div className="flex flex-col items-center gap-5 sm:flex-row sm:gap-6">
            <div className="relative h-44 w-44 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={54}
                    outerRadius={82}
                    paddingAngle={pieData.length > 1 ? 2 : 0}
                    strokeWidth={0}
                  >
                    {pieData.map((d) => (
                      <Cell key={d.name} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v) => formatMoney(Number(v), base)}
                    contentStyle={{ borderRadius: 8, fontSize: 12, border: '1px solid #e5e7eb' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold leading-none text-gray-800 dark:text-gray-100">
                  {pieData.length}
                </span>
                <span className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                  {groupMode === 'purpose' ? 'nhóm' : 'loại'}
                </span>
              </div>
            </div>

            {/* Chú giải kèm thanh tỷ trọng */}
            <ul className="flex-1 space-y-3 self-stretch">
              {displayGroups.map((g) => (
                <li key={g.name}>
                  <div className="flex items-center gap-2 text-sm">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: colorOf(g.name) }}
                    />
                    <span className="min-w-0 flex-1 truncate font-medium text-gray-700 dark:text-gray-300">
                      {g.name}
                      {!g.includeInTotals && (
                        <span className="ml-1 text-[10px] font-normal text-gray-500 dark:text-gray-400">
                          (ngoài tổng)
                        </span>
                      )}
                    </span>
                    {g.includeInTotals && (
                      <span className="shrink-0 text-xs tabular-nums text-gray-500 dark:text-gray-400">
                        {(g.share * 100).toFixed(0)}%
                      </span>
                    )}
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                      {g.hasMissingRate ? '≈ ' : ''}
                      {formatMoney(g.total, base)}
                    </span>
                  </div>
                  {/* thanh tỷ trọng */}
                  <div className="mt-1.5 ml-[18px] h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max(g.includeInTotals ? g.share * 100 : 0, g.includeInTotals && g.total > 0 ? 3 : 0)}%`,
                        backgroundColor: colorOf(g.name),
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Chi tiết từng nhóm và tài khoản bên trong */}
      {displayGroups.map((g) => (
        <section
          key={g.name}
          className="overflow-hidden rounded-2xl bg-white dark:bg-gray-900 shadow-sm"
          style={{ borderLeft: `4px solid ${colorOf(g.name)}` }}
        >
          <div className="flex items-center justify-between px-4 py-3">
            <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-100">
              <span className="truncate">{g.name}</span>
              <span className="shrink-0 rounded-full bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 dark:text-gray-400">
                {g.accounts.length}
              </span>
              {!g.includeInTotals && (
                <span className="shrink-0 text-[10px] font-normal text-gray-500 dark:text-gray-400">(ngoài tổng)</span>
              )}
            </span>
            <span className="shrink-0 pl-2 text-sm font-bold tabular-nums text-gray-900 dark:text-gray-100">
              {g.hasMissingRate ? '≈ ' : ''}
              {formatMoney(g.total, base)}
            </span>
          </div>
          <div className="divide-y divide-gray-50 border-t border-gray-100 dark:border-gray-800">
            {g.accounts.map((a) => (
              <Link
                key={a.id}
                to={`/assets/${a.id}`}
                className="flex items-center gap-2 px-4 py-2.5 transition hover:bg-gray-50 dark:hover:bg-gray-800 active:bg-gray-100"
              >
                <AccountTypeIcon type={a.type} className="h-4 w-4" />
                <span className="min-w-0 flex-1 truncate text-sm text-gray-700 dark:text-gray-300">
                  {a.name}
                  <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">{a.currency}</span>
                  {!a.includeInTotals && (
                    <span className="ml-1 text-[10px] text-gray-500 dark:text-gray-400">(ngoài tổng)</span>
                  )}
                  {a.marketValue != null && a.marketValue !== a.balance && (
                    <span
                      className={`ml-1 text-[10px] tabular-nums ${
                        a.marketValue > a.balance
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {a.marketValue > a.balance ? '▲' : '▼'}
                      {formatMoney(Math.abs(a.marketValue - a.balance), a.currency)}
                    </span>
                  )}
                </span>
                <span
                  className={`shrink-0 text-sm font-medium tabular-nums ${a.value < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-800 dark:text-gray-100'}`}
                >
                  {formatMoney(a.value, a.currency)}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-gray-300 dark:text-gray-600" />
              </Link>
            ))}
          </div>
        </section>
      ))}

      {breakdown.hasForeign && rates && (
        <p className="text-center text-xs text-gray-500 dark:text-gray-400">
          Tỷ giá: ¥1 ≈ {rates.VND?.toFixed(2)} ₫ · $1 ≈ ¥
          {rates.USD ? (1 / rates.USD).toFixed(1) : '?'} (open.er-api.com, cache 12h)
        </p>
      )}
    </div>
  )
}
