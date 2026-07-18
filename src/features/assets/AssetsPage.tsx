import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import {
  useAccountBalances,
  useAssetGroupSettings,
  useDebtPayments,
  useDebts,
  useRates,
} from '../../hooks/queries'
import { CURRENCIES, formatMoney } from '../../lib/money'
import { debtSummary } from '../debts/aggregate'
import { assetBreakdown, type AssetGroupSetting } from './aggregate'

// Bảng màu cho lát bánh (lặp lại nếu > 12 nhóm) — đồng bộ với ReportsPage
const PALETTE = [
  '#16a34a', '#0ea5e9', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899',
  '#14b8a6', '#f97316', '#6366f1', '#84cc16', '#06b6d4', '#a855f7',
]

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

  // Nhóm bị ẩn, hoặc không còn tài khoản hiện nào (tất cả tài khoản đều ẩn), không hiển thị
  const visibleGroups = breakdown.groups
    .filter((g) => !g.hidden)
    .map((g) => ({ ...g, accounts: g.accounts.filter((a) => !a.hidden) }))
    .filter((g) => g.accounts.length > 0)

  // Biểu đồ tròn = cơ cấu của Tổng tài sản → chỉ nhóm được tính vào tổng
  const pieData = visibleGroups
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
  const accountCount = visibleGroups.reduce((n, g) => n + g.accounts.length, 0)

  return (
    <div className="flex flex-col gap-4 p-3 lg:p-6">
      <div className="flex items-center gap-2">
        <h1 className="flex-1 text-lg font-bold text-gray-800">Tài sản</h1>
        <Link
          to="/settings/asset-groups"
          className="rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-gray-600 shadow-sm active:scale-95"
        >
          ⚙️ Quản lý nhóm
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
            {accountCount} tài khoản · {visibleGroups.length} nhóm
          </p>
        )}
        {breakdown.hasMissingRate && (
          <p className="mt-2 text-xs text-green-100">
            Một phần tài sản ngoại tệ chưa quy đổi được (đang chờ tỷ giá) nên tổng có thể thiếu.
          </p>
        )}
      </section>

      {/* Tài sản ròng (chỉ hiện khi có khoản nợ mở) */}
      {debts_.hasOpen && (
        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-700">Tài sản ròng</span>
            <Link to="/settings/debts" className="text-xs font-medium text-green-700">
              Nợ / cho vay ›
            </Link>
          </div>
          <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900">
            {breakdown.hasForeign || debts_.hasMissingRate ? '≈ ' : ''}
            {formatMoney(breakdown.total + debts_.net, base)}
          </p>
          <div className="mt-3 space-y-1.5 text-sm">
            <div className="flex items-center justify-between text-gray-500">
              <span>Tài sản gộp</span>
              <span className="tabular-nums">{formatMoney(breakdown.total, base)}</span>
            </div>
            {debts_.owedToMe > 0 && (
              <div className="flex items-center justify-between text-green-600">
                <span>+ Cho vay còn lại</span>
                <span className="tabular-nums">{formatMoney(debts_.owedToMe, base)}</span>
              </div>
            )}
            {debts_.iOwe > 0 && (
              <div className="flex items-center justify-between text-red-600">
                <span>− Nợ phải trả</span>
                <span className="tabular-nums">{formatMoney(debts_.iOwe, base)}</span>
              </div>
            )}
          </div>
          {debts_.hasMissingRate && (
            <p className="mt-2 text-xs text-gray-400">
              Một phần khoản nợ ngoại tệ chưa quy đổi được nên số ròng có thể thiếu.
            </p>
          )}
        </section>
      )}

      {/* Biểu đồ tròn + danh sách nhóm */}
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Cơ cấu theo nhóm
        </h2>

        {pieData.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-400">
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
                <span className="text-2xl font-bold leading-none text-gray-800">
                  {pieData.length}
                </span>
                <span className="mt-0.5 text-[11px] text-gray-400">nhóm</span>
              </div>
            </div>

            {/* Chú giải kèm thanh tỷ trọng */}
            <ul className="flex-1 space-y-3 self-stretch">
              {visibleGroups.map((g) => (
                <li key={g.name}>
                  <div className="flex items-center gap-2 text-sm">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: colorOf(g.name) }}
                    />
                    <span className="min-w-0 flex-1 truncate font-medium text-gray-700">
                      {g.name}
                      {!g.includeInTotals && (
                        <span className="ml-1 text-[10px] font-normal text-gray-400">
                          (ngoài tổng)
                        </span>
                      )}
                    </span>
                    {g.includeInTotals && (
                      <span className="shrink-0 text-xs tabular-nums text-gray-400">
                        {(g.share * 100).toFixed(0)}%
                      </span>
                    )}
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-gray-900">
                      {g.hasMissingRate ? '≈ ' : ''}
                      {formatMoney(g.total, base)}
                    </span>
                  </div>
                  {/* thanh tỷ trọng */}
                  <div className="mt-1.5 ml-[18px] h-1.5 overflow-hidden rounded-full bg-gray-100">
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
      {visibleGroups.map((g) => (
        <section
          key={g.name}
          className="overflow-hidden rounded-2xl bg-white shadow-sm"
          style={{ borderLeft: `4px solid ${colorOf(g.name)}` }}
        >
          <div className="flex items-center justify-between px-4 py-3">
            <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-gray-800">
              <span className="truncate">{g.name}</span>
              <span className="shrink-0 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                {g.accounts.length}
              </span>
              {!g.includeInTotals && (
                <span className="shrink-0 text-[10px] font-normal text-gray-400">(ngoài tổng)</span>
              )}
            </span>
            <span className="shrink-0 pl-2 text-sm font-bold tabular-nums text-gray-900">
              {g.hasMissingRate ? '≈ ' : ''}
              {formatMoney(g.total, base)}
            </span>
          </div>
          <div className="divide-y divide-gray-50 border-t border-gray-100">
            {g.accounts.map((a) => (
              <Link
                key={a.id}
                to={`/assets/${a.id}`}
                className="flex items-center gap-2 px-4 py-2.5 transition hover:bg-gray-50 active:bg-gray-100"
              >
                <span className="text-base">{a.type === 'cash' ? '💵' : '🏦'}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-gray-700">
                  {a.name}
                  <span className="ml-1 text-xs text-gray-400">{a.currency}</span>
                  {!a.includeInTotals && (
                    <span className="ml-1 text-[10px] text-gray-400">(ngoài tổng)</span>
                  )}
                </span>
                <span
                  className={`shrink-0 text-sm font-medium tabular-nums ${a.balance < 0 ? 'text-red-600' : 'text-gray-800'}`}
                >
                  {formatMoney(a.balance, a.currency)}
                </span>
                <span className="shrink-0 text-gray-300">›</span>
              </Link>
            ))}
          </div>
        </section>
      ))}

      {breakdown.hasForeign && rates && (
        <p className="text-center text-xs text-gray-400">
          Tỷ giá: ¥1 ≈ {rates.VND?.toFixed(2)} ₫ · $1 ≈ ¥
          {rates.USD ? (1 / rates.USD).toFixed(1) : '?'} (open.er-api.com, cache 12h)
        </p>
      )}
    </div>
  )
}
