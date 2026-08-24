import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronRight, ChevronUp, Plus } from 'lucide-react'
import { useDebtPayments, useDebts, useRates } from '../../hooks/queries'
import { dayMonthLabel, daysBetween, toISODate } from '../../lib/dates'
import { CURRENCIES, formatMoney } from '../../lib/money'
import { Card, EmptyState, PageHeader, STATUS_FILL, SectionTitle, actionButtonClass } from '../../components/ui'
import type { DebtRow } from '../../types/database.types'
import { debtSummary, disbursedOf, remainingOf } from './aggregate'

export function DebtsPage() {
  const { data: debts = [], isLoading } = useDebts()
  const { data: payments = [] } = useDebtPayments()
  const { base, rates } = useRates()
  const [showSettled, setShowSettled] = useState(false)

  const summary = useMemo(
    () => debtSummary(debts, payments, base, rates ?? {}),
    [debts, payments, base, rates],
  )

  const open = debts.filter((d) => d.status === 'open')
  const settled = debts.filter((d) => d.status === 'settled')
  const iOwe = open.filter((d) => d.direction === 'i_owe')
  const owedToMe = open.filter((d) => d.direction === 'owed_to_me')
  const approx = summary.hasMissingRate ? '≈ ' : ''

  return (
    <div className="p-3 lg:p-6">
      <PageHeader title="Nợ / cho vay" back="/assets">
        <Link
          to="/entry?role=debt"
          className={actionButtonClass('primary')}
        >
          <Plus className="h-4 w-4" /> Thêm
        </Link>
      </PageHeader>

      {/* Tổng quan quy đổi base */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-surface p-4 shadow-sm">
          <p className="text-sm font-medium text-fg-muted">Mình nợ</p>
          <p className="mt-1 text-lg font-bold tabular-nums text-money-out">
            {isLoading ? '…' : `${approx}${formatMoney(summary.iOwe, base)}`}
          </p>
        </div>
        <div className="rounded-2xl bg-surface p-4 shadow-sm">
          {/* "Cho vay" là nhãn CŨ, và nó sai kể từ 0049: con số này giờ gộp hai thứ
              khác bản chất — tiền mình đưa ra, và tiền công người ta chưa trả. */}
          <p className="text-sm font-medium text-fg-muted">Người ta nợ tôi</p>
          <p className="mt-1 text-lg font-bold tabular-nums text-money-in">
            {isLoading ? '…' : `${approx}${formatMoney(summary.owedToMe, base)}`}
          </p>
        </div>
      </div>
      {summary.hasOpen && (
        <p className="-mt-2 mb-4 px-1 text-sm text-fg-muted">
          {summary.net < 0 ? 'Nợ ròng' : 'Cho vay ròng'} {approx}
          {formatMoney(Math.abs(summary.net), base)} · quy đổi {CURRENCIES[base].label}
          {summary.hasMissingRate && ' · một phần chưa có tỷ giá'}
        </p>
      )}

      <DebtSection
        title="Mình nợ"
        emptyLabel="Không có khoản nào bạn đang nợ"
        debts={iOwe}
        payments={payments}
        loading={isLoading}
      />
      <DebtSection
        title="Người ta nợ mình"
        emptyLabel="Chưa cho ai vay"
        debts={owedToMe}
        payments={payments}
        loading={isLoading}
      />

      {settled.length > 0 && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setShowSettled((v) => !v)}
            className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-fg-muted"
          >
            {showSettled ? 'Ẩn đã tất toán' : `Đã tất toán (${settled.length})`}
            {showSettled ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {showSettled && (
            <Card padding="none" className="divide-y divide-border-subtle overflow-hidden">
              {settled.map((d) => (
                <Link
                  key={d.id}
                  to={`/debts/${d.id}`}
                  className="flex items-center gap-2 px-3 py-2.5 opacity-70 hover:bg-surface-sunken"
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-fg-secondary line-through">
                    {d.counterparty}
                  </span>
                  <span className="shrink-0 text-sm tabular-nums text-fg-muted">
                    {formatMoney(disbursedOf(d, payments), d.currency)}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-fg-muted" />
                </Link>
              ))}
            </Card>
          )}
        </div>
      )}
    </div>
  )
}

interface SectionProps {
  title: string
  emptyLabel: string
  debts: DebtRow[]
  payments: Parameters<typeof remainingOf>[1]
  loading: boolean
}

function DebtSection({ title, emptyLabel, debts, payments, loading }: SectionProps) {
  return (
    <section className="mb-4">
      <SectionTitle role="micro" className="mb-2 px-1">
        {title}
      </SectionTitle>
      <Card padding="none" className="divide-y divide-border-subtle overflow-hidden">
        {debts.map((d) => {
          const remaining = Math.max(remainingOf(d, payments), 0)
          const disbursed = disbursedOf(d, payments)
          const paidRatio = disbursed > 0 ? 1 - remaining / disbursed : 0
          const overdue = isOverdue(d)
          return (
            <Link
              key={d.id}
              to={`/debts/${d.id}`}
              className="block px-3 py-2.5 hover:bg-surface-sunken active:bg-gray-100 dark:active:bg-gray-800"
            >
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg-primary">
                  {d.counterparty}
                  {d.note && <span className="ml-1 text-sm font-normal text-fg-muted">· {d.note}</span>}
                </span>
                {/* KHÔNG phải chip trang trí: `earned` là khác biệt làm ĐỔI CÁCH GHI SỔ
                    lúc thu tiền (lần trả vào Thu thật, không phải dòng tiền nợ), nên
                    người dùng phải phân biệt được nó với một khoản cho vay bằng mắt. */}
                {d.origin === 'earned' && (
                  <span className="shrink-0 rounded-full bg-state-warn-bg px-2 py-0.5 text-sm font-semibold text-state-warn-fg">
                    tiền công
                  </span>
                )}
                <span
                  className={`shrink-0 text-sm font-semibold tabular-nums ${
                    d.direction === 'i_owe' ? 'text-money-out' : 'text-money-in'
                  }`}
                >
                  {formatMoney(remaining, d.currency)}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-fg-muted" />
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                {/* Thanh này TỪNG là bg-gray-300 — 1,47:1 trên nền thẻ, tức gần như
                    vô hình, mà nó là đồ hoạ mang thông tin (đã trả được bao nhiêu) nên
                    WCAG 1.4.11 đòi 3:1. Đổi sang bộ STATUS_FILL vừa đạt ngưỡng vừa cho
                    thanh nói luôn tình trạng: quá hạn thì đỏ, còn hạn thì xám trung
                    tính. Nhờ vậy nhìn dải thanh là biết dòng nào cần xử lý, không phải
                    đọc nhãn "hạn ..." bên phải. */}
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-sunken">
                  <div
                    className={`h-full rounded-full ${overdue ? STATUS_FILL.bad : STATUS_FILL.info}`}
                    style={{ width: `${Math.min(Math.max(paidRatio * 100, 0), 100)}%` }}
                  />
                </div>
                <span className="shrink-0 text-sm text-fg-muted">
                  gốc {formatMoney(disbursed, d.currency)}
                </span>
                {/* NGÀY đi qua `dayMonthLabel` như mọi chỗ khác trong app. Trước đây là
                    `d.due_on.slice(5)`, tức cắt thô chuỗi ISO ra "09-04" — một định dạng
                    KHÔNG có ở màn nào khác (mọi nơi in "9/4"). Người dùng gặp hai kiểu
                    ngày trong cùng một app thì phải dịch trong đầu, và với 12/09 vs 09/12
                    thì dịch sai là chuyện thường.
                    QUÁ HẠN nói rõ BAO NHIÊU NGÀY (22b: "quá hạn 6 ngày"). Chỉ tô đỏ thì
                    người đọc biết là muộn mà không biết muộn tới mức nào — mà đó mới là
                    thứ quyết định gọi ngay hay để cuối tuần. */}
                {d.due_on && (
                  <span
                    className={`shrink-0 rounded px-1 text-sm ${
                      overdue ? 'bg-state-bad-bg text-state-bad-fg' : 'bg-surface-sunken text-fg-on-track'
                    }`}
                  >
                    {overdue
                      ? `quá hạn ${daysBetween(d.due_on, toISODate(new Date()))} ngày`
                      : `hạn ${dayMonthLabel(d.due_on)}`}
                  </span>
                )}
              </div>
            </Link>
          )
        })}
        {debts.length === 0 && (
          <EmptyState compact>
            {loading ? 'Đang tải…' : emptyLabel}
          </EmptyState>
        )}
      </Card>
    </section>
  )
}

function isOverdue(d: DebtRow): boolean {
  if (!d.due_on || d.status !== 'open') return false
  return d.due_on < toISODate(new Date())
}
