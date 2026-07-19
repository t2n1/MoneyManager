import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, Plus, Send, Trash2 } from 'lucide-react'
import { useSearchTransactions, useDeleteTransaction } from '../../hooks/queries'
import { formatMoney } from '../../lib/money'
import type { TransactionRow } from '../../types/database.types'
import { remittanceStats } from './aggregate'
import { RemittanceFormSheet } from './RemittanceFormSheet'

/** Năm dương lịch hiện tại (component runtime — Date cho phép ở đây). */
function currentYear(): number {
  return new Date().getFullYear()
}

export function RemittancePage() {
  const year = currentYear()
  const range = { start: `${year}-01-01`, end: `${year + 1}-01-01` }
  const { data: txs = [], isLoading } = useSearchTransactions(range)
  const del = useDeleteTransaction()
  const [adding, setAdding] = useState(false)

  const remittances = useMemo(
    () =>
      txs
        .filter((t) => t.is_remittance)
        .sort((a, b) => (a.occurred_on < b.occurred_on ? 1 : -1)),
    [txs],
  )
  const stats = useMemo(() => remittanceStats(txs), [txs])

  function handleDelete(t: TransactionRow) {
    if (!window.confirm('Xóa lần gửi này? Số dư tài khoản sẽ được hoàn lại.')) return
    del.mutate(t.id)
  }

  return (
    <div className="p-3 lg:p-6">
      <div className="mb-3 flex items-center gap-2">
        <Link
          to="/settings"
          className="rounded-lg bg-white dark:bg-gray-900 px-3 py-1.5 text-lg shadow-sm active:scale-95"
          aria-label="Quay lại"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="flex-1 text-lg font-bold text-gray-800 dark:text-gray-100">Gửi tiền về VN</h1>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm active:scale-95"
        >
          <Plus className="h-4 w-4" /> Gửi tiền
        </button>
      </div>

      {/* Thẻ tổng năm nay */}
      <section className="mb-4 rounded-2xl bg-gradient-to-br from-green-600 to-emerald-700 p-5 text-white shadow-md">
        <p className="text-sm font-medium text-green-50/90">Đã gửi năm {year}</p>
        <p className="mt-1.5 text-3xl font-bold leading-none tabular-nums">
          {formatMoney(stats.totalSentJpy, 'JPY')}
        </p>
        <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-green-50/90">
          <div>
            <p className="text-green-50/70">Người nhận nhận</p>
            <p className="mt-0.5 font-semibold tabular-nums">{formatMoney(stats.totalReceivedVnd, 'VND')}</p>
          </div>
          <div>
            <p className="text-green-50/70">Tỷ giá TB</p>
            <p className="mt-0.5 font-semibold tabular-nums">
              {stats.avgRate ? `${stats.avgRate.toFixed(1)} ₫/¥` : '—'}
            </p>
          </div>
          <div>
            <p className="text-green-50/70">Tổng phí</p>
            <p className="mt-0.5 font-semibold tabular-nums">{formatMoney(stats.totalFeeJpy, 'JPY')}</p>
          </div>
        </div>
      </section>

      {/* Lịch sử */}
      {isLoading ? (
        <p className="py-10 text-center text-gray-400 dark:text-gray-500">Đang tải…</p>
      ) : remittances.length === 0 ? (
        <p className="rounded-xl bg-white dark:bg-gray-900 px-3 py-8 text-center text-sm text-gray-400 dark:text-gray-500 shadow-sm">
          Chưa có lần gửi nào trong năm {year}. Bấm "Gửi tiền" để thêm.
        </p>
      ) : (
        <div className="space-y-2">
          {remittances.map((t) => {
            const fee = t.remit_fee_jpy ?? 0
            const sent = Math.max(t.amount - fee, 0)
            const received = t.remit_received_vnd ?? 0
            const rate = sent > 0 ? received / sent : 0
            const isTransfer = t.type === 'transfer'
            return (
              <div
                key={t.id}
                className="flex items-center gap-3 rounded-xl bg-white dark:bg-gray-900 px-3 py-2.5 shadow-sm"
              >
                <Send className="h-5 w-5 shrink-0 text-gray-400 dark:text-gray-500" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">
                    {formatMoney(sent, 'JPY')} → {formatMoney(received, 'VND')}
                  </p>
                  <p className="truncate text-xs text-gray-400 dark:text-gray-500">
                    {t.occurred_on} · {t.remit_service ?? '—'} · {rate > 0 ? `${rate.toFixed(1)} ₫/¥` : ''}
                    {' · '}
                    <span className={isTransfer ? 'text-sky-600 dark:text-sky-400' : 'text-amber-600 dark:text-amber-400'}>
                      {isTransfer ? 'Chuyển tài sản' : 'Hỗ trợ GĐ'}
                    </span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(t)}
                  className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:text-gray-500 dark:hover:bg-red-900/30 dark:hover:text-red-400"
                  aria-label="Xóa"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {adding && <RemittanceFormSheet onClose={() => setAdding(false)} />}
    </div>
  )
}
