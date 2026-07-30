import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Send, Trash2 } from 'lucide-react'
import { useDeleteTransaction } from '../../hooks/queries'
import { formatMoney } from '../../lib/money'
import { confirmDialog } from '../../lib/dialog'
import type { TransactionRow } from '../../types/database.types'
import { remittanceShareOfIncome, remittanceStats, remittanceTiming } from './aggregate'

/**
 * Mục "Gửi tiền về VN" trong Báo cáo → Năm. Nhận giao dịch cả năm (đã tải sẵn),
 * tự lọc is_remittance để hiện tổng + lịch sử + xóa. Nút "Gửi tiền" mở form nhập.
 */
export function RemittanceSection({
  txs,
  year,
  annualIncome = 0,
}: {
  txs: TransactionRow[]
  year: number
  /** Tổng thu nhập cả năm quy đổi base — để biết kiều hối chiếm bao nhiêu phần. */
  annualIncome?: number
}) {
  const del = useDeleteTransaction()

  const stats = useMemo(() => remittanceStats(txs), [txs])
  const timing = useMemo(() => remittanceTiming(txs, stats.avgRate), [txs, stats.avgRate])
  const timingById = useMemo(
    () => new Map(timing.map((t) => [t.transactionId, t])),
    [timing],
  )
  const share = remittanceShareOfIncome(stats, annualIncome)
  // Tổng lợi/thiệt do chọn thời điểm: các lần gửi giá tốt bù cho lần gửi giá xấu
  const bestPick = timing.reduce<(typeof timing)[number] | null>(
    (best, t) => (best === null || t.gainVsAvgVnd > best.gainVsAvgVnd ? t : best),
    null,
  )
  const worstPick = timing.reduce<(typeof timing)[number] | null>(
    (worst, t) => (worst === null || t.gainVsAvgVnd < worst.gainVsAvgVnd ? t : worst),
    null,
  )
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
    <section className="rounded-2xl bg-surface p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-fg-muted">
          <Send className="h-3.5 w-3.5" /> Gửi tiền về VN
        </h2>
        <Link
          to="/entry?role=remit"
          className="flex items-center gap-1 rounded-lg bg-green-700 px-2.5 py-1 text-xs font-semibold text-white active:scale-95"
        >
          <Plus className="h-3.5 w-3.5" /> Gửi tiền
        </Link>
      </div>

      {remittances.length === 0 ? (
        <p className="py-4 text-center text-sm text-fg-muted">
          Chưa gửi tiền về VN trong năm {year}.
        </p>
      ) : (
        <>
          {/* Tổng năm */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <p className="text-xs text-fg-muted">Đã gửi</p>
              <p className="mt-0.5 text-sm font-bold tabular-nums text-fg-primary">
                {formatMoney(stats.totalSentJpy, 'JPY')}
              </p>
            </div>
            <div>
              <p className="text-xs text-fg-muted">Người nhận nhận</p>
              <p className="mt-0.5 text-sm font-bold tabular-nums text-fg-primary">
                {formatMoney(stats.totalReceivedVnd, 'VND')}
              </p>
            </div>
            <div>
              <p className="text-xs text-fg-muted">Tỷ giá TB</p>
              <p className="mt-0.5 text-sm font-bold tabular-nums text-fg-primary">
                {stats.avgRate ? `${stats.avgRate.toFixed(1)} ₫/¥` : '—'}
              </p>
            </div>
          </div>
          <p className="mt-1 text-xs text-fg-muted">
            Tổng phí {formatMoney(stats.totalFeeJpy, 'JPY')} · {stats.count} lần gửi
            {share !== null && (
              <> · chiếm {Math.round(share * 100)}% thu nhập năm {year}</>
            )}
          </p>

          {/* Chọn thời điểm gửi được/mất bao nhiêu so với tỷ giá trung bình cả năm */}
          {bestPick && worstPick && bestPick.transactionId !== worstPick.transactionId && (
            <div className="mt-2 rounded-lg bg-surface-page px-2.5 py-2 text-xs ">
              <p className="text-fg-secondary">
                Lần gửi <b>được giá nhất</b> ({bestPick.date}, {bestPick.rate.toFixed(1)} ₫/¥) cho
                thêm{' '}
                <b className="text-green-700 dark:text-green-400">
                  {formatMoney(bestPick.gainVsAvgVnd, 'VND')}
                </b>{' '}
                so với tỷ giá trung bình năm.
              </p>
              <p className="mt-0.5 text-fg-secondary">
                Lần <b>thiệt nhất</b> ({worstPick.date}, {worstPick.rate.toFixed(1)} ₫/¥) mất{' '}
                <b className="text-money-out">
                  {formatMoney(-worstPick.gainVsAvgVnd, 'VND')}
                </b>
                .
              </p>
              <p className="mt-1 text-2xs text-fg-muted">
                Khoảng cách giữa hai lần này là cái giá của việc chọn thời điểm. Chênh lệch lớn thì
                lần sau nên chia nhỏ ra gửi nhiều đợt thay vì dồn một cục.
              </p>
            </div>
          )}

          {/* Lịch sử */}
          <ul className="mt-3 divide-y divide-border-subtle border-t border-border-subtle">
            {remittances.map((t) => {
              const fee = t.remit_fee_jpy ?? 0
              const sent = Math.max(t.amount - fee, 0)
              const received = t.remit_received_vnd ?? 0
              const rate = sent > 0 ? received / sent : 0
              const vs = timingById.get(t.id)
              const isTransfer = t.type === 'transfer'
              return (
                <li key={t.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-fg-primary">
                      {formatMoney(sent, 'JPY')} → {formatMoney(received, 'VND')}
                    </p>
                    <p className="truncate text-xs text-fg-muted">
                      {t.occurred_on} · {t.remit_service ?? '—'}
                      {rate > 0 ? ` · ${rate.toFixed(1)} ₫/¥` : ''}
                      {vs && Math.abs(vs.vsAvgPct) >= 0.5 && (
                        <span
                          className={
                            vs.vsAvgPct > 0
                              ? 'text-money-in'
                              : 'text-money-out'
                          }
                        >
                          {' '}
                          ({vs.vsAvgPct > 0 ? '+' : ''}
                          {vs.vsAvgPct.toFixed(1)}% so với TB)
                        </span>
                      )}{' '}
                      ·{' '}
                      <span className={isTransfer ? 'text-sky-600 dark:text-sky-400' : 'text-fg-warn'}>
                        {isTransfer ? 'Chuyển tài sản' : 'Hỗ trợ GĐ'}
                      </span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(t)}
                    className="rounded-lg p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600 dark:text-gray-400 dark:hover:bg-red-900/30 dark:hover:text-red-400"
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
