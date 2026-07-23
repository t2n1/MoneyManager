import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Send, Trash2 } from 'lucide-react'
import { useDeleteTransaction } from '../../hooks/queries'
import { formatMoney } from '../../lib/money'
import { confirmDialog } from '../../lib/dialog'
import type { TransactionRow } from '../../types/database.types'
import { remittanceStats } from './aggregate'

/**
 * Mục "Gửi tiền về VN" trong Báo cáo → Năm. Nhận giao dịch cả năm (đã tải sẵn),
 * tự lọc is_remittance để hiện tổng + lịch sử + xóa. Nút "Gửi tiền" mở form nhập.
 */
export function RemittanceSection({ txs, year }: { txs: TransactionRow[]; year: number }) {
  const del = useDeleteTransaction()

  const stats = useMemo(() => remittanceStats(txs), [txs])
  const remittances = useMemo(
    () => txs.filter((t) => t.is_remittance).sort((a, b) => (a.occurred_on < b.occurred_on ? 1 : -1)),
    [txs],
  )

  async function handleDelete(t: TransactionRow) {
    if (
      !(await confirmDialog({
        title: 'Xóa lần gửi này?',
        message: 'Số dư tài khoản sẽ được hoàn lại.',
        danger: true,
        confirmLabel: 'Xóa',
      }))
    )
      return
    del.mutate(t.id)
  }

  return (
    <section className="rounded-2xl bg-white dark:bg-gray-900 p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
          <Send className="h-3.5 w-3.5" /> Gửi tiền về VN
        </h2>
        <Link
          to="/entry?role=remit"
          className="flex items-center gap-1 rounded-lg bg-green-600 px-2.5 py-1 text-xs font-semibold text-white active:scale-95"
        >
          <Plus className="h-3.5 w-3.5" /> Gửi tiền
        </Link>
      </div>

      {remittances.length === 0 ? (
        <p className="py-4 text-center text-sm text-gray-400 dark:text-gray-500">
          Chưa gửi tiền về VN trong năm {year}.
        </p>
      ) : (
        <>
          {/* Tổng năm */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Đã gửi</p>
              <p className="mt-0.5 text-sm font-bold tabular-nums text-gray-800 dark:text-gray-100">
                {formatMoney(stats.totalSentJpy, 'JPY')}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Người nhận nhận</p>
              <p className="mt-0.5 text-sm font-bold tabular-nums text-gray-800 dark:text-gray-100">
                {formatMoney(stats.totalReceivedVnd, 'VND')}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Tỷ giá TB</p>
              <p className="mt-0.5 text-sm font-bold tabular-nums text-gray-800 dark:text-gray-100">
                {stats.avgRate ? `${stats.avgRate.toFixed(1)} ₫/¥` : '—'}
              </p>
            </div>
          </div>
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
            Tổng phí {formatMoney(stats.totalFeeJpy, 'JPY')} · {stats.count} lần gửi
          </p>

          {/* Lịch sử */}
          <ul className="mt-3 divide-y divide-gray-100 dark:divide-gray-800 border-t border-gray-100 dark:border-gray-800">
            {remittances.map((t) => {
              const fee = t.remit_fee_jpy ?? 0
              const sent = Math.max(t.amount - fee, 0)
              const received = t.remit_received_vnd ?? 0
              const rate = sent > 0 ? received / sent : 0
              const isTransfer = t.type === 'transfer'
              return (
                <li key={t.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">
                      {formatMoney(sent, 'JPY')} → {formatMoney(received, 'VND')}
                    </p>
                    <p className="truncate text-xs text-gray-400 dark:text-gray-500">
                      {t.occurred_on} · {t.remit_service ?? '—'}
                      {rate > 0 ? ` · ${rate.toFixed(1)} ₫/¥` : ''} ·{' '}
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
                </li>
              )
            })}
          </ul>
        </>
      )}
    </section>
  )
}
