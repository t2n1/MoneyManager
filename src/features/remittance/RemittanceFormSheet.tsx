import { useEffect, useMemo, useState } from 'react'
import type { NewTransaction } from '../../data'
import {
  useAccounts,
  useCategories,
  useCreateCategory,
  useCreateTransaction,
} from '../../hooks/queries'
import { toISODate } from '../../lib/dates'
import { formatMoney, parseMoney } from '../../lib/money'

const SERVICES = ['Wise', 'SBI Remit', 'Brastel', 'DCOM', 'Khác']
const GUI_TIEN_CAT = 'Gửi tiền về VN'

type Kind = 'transfer' | 'expense'

/** Sheet ghi nhận một lần gửi tiền về VN. Tạo một giao dịch (transfer hoặc expense). */
export function RemittanceFormSheet({ onClose }: { onClose: () => void }) {
  const createTx = useCreateTransaction()
  const createCat = useCreateCategory()
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()

  // Nguồn: TK JPY (không phải thẻ, chưa lưu trữ). Đích: TK VND tương tự.
  const jpyAccounts = useMemo(
    () => accounts.filter((a) => !a.is_archived && a.type !== 'card' && a.currency === 'JPY'),
    [accounts],
  )
  const vndAccounts = useMemo(
    () => accounts.filter((a) => !a.is_archived && a.type !== 'card' && a.currency === 'VND'),
    [accounts],
  )

  const [kind, setKind] = useState<Kind>('transfer')
  const [occurredOn, setOccurredOn] = useState(toISODate(new Date()))
  const [sourceId, setSourceId] = useState('')
  const [destId, setDestId] = useState('')
  const [sentDigits, setSentDigits] = useState('')
  const [feeDigits, setFeeDigits] = useState('')
  const [receivedDigits, setReceivedDigits] = useState('')
  const [service, setService] = useState(SERVICES[0])
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!sourceId && jpyAccounts[0]) setSourceId(jpyAccounts[0].id)
  }, [sourceId, jpyAccounts])
  useEffect(() => {
    if (!destId && vndAccounts[0]) setDestId(vndAccounts[0].id)
  }, [destId, vndAccounts])

  const sent = sentDigits === '' ? 0 : Number(sentDigits)
  const fee = feeDigits === '' ? 0 : Number(feeDigits)
  const received = receivedDigits === '' ? 0 : Number(receivedDigits)
  const rate = sent > 0 ? received / sent : 0

  const needDest = kind === 'transfer'
  const canSave =
    sent > 0 &&
    received > 0 &&
    !!sourceId &&
    (!needDest || !!destId) &&
    !saving

  async function ensureGuiTienCategoryId(): Promise<string> {
    const found = categories.find((c) => c.type === 'expense' && c.name === GUI_TIEN_CAT)
    if (found) return found.id
    const created = await createCat.mutateAsync({
      name: GUI_TIEN_CAT,
      type: 'expense',
      icon: '💸',
      parent_id: null,
    })
    return created.id
  }

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    try {
      const amount = sent + fee
      const trimmedNote = note.trim() || 'Gửi tiền về VN'
      let input: NewTransaction
      if (kind === 'transfer') {
        input = {
          type: 'transfer',
          amount,
          to_amount: received,
          category_id: null,
          account_id: sourceId,
          to_account_id: destId,
          occurred_on: occurredOn,
          note: trimmedNote,
          is_remittance: true,
          remit_service: service,
          remit_fee_jpy: fee,
          remit_received_vnd: received,
        }
      } else {
        const categoryId = await ensureGuiTienCategoryId()
        input = {
          type: 'expense',
          amount,
          to_amount: null,
          category_id: categoryId,
          account_id: sourceId,
          to_account_id: null,
          occurred_on: occurredOn,
          note: trimmedNote,
          is_remittance: true,
          remit_service: service,
          remit_fee_jpy: fee,
          remit_received_vnd: received,
        }
      }
      await createTx.mutateAsync(input)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 lg:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white dark:bg-gray-900 p-4 lg:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-3 text-base font-bold text-gray-800 dark:text-gray-100">Gửi tiền về VN</h2>

        {/* Kiểu */}
        <div className="mb-3 grid grid-cols-2 gap-1 rounded-xl bg-gray-200 dark:bg-gray-800 p-1">
          {(
            [
              ['transfer', 'Chuyển tài sản'],
              ['expense', 'Hỗ trợ gia đình'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`rounded-lg py-1.5 text-sm font-medium transition ${
                kind === k
                  ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="mb-3 text-xs text-gray-400 dark:text-gray-500">
          {kind === 'transfer'
            ? 'Tiền vẫn là của bạn ở VN — không giảm Tài sản ròng.'
            : 'Tiền cho gia đình — ghi nhận là chi (giảm Tài sản ròng).'}
        </p>

        <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Ngày</label>
        <input
          type="date"
          value={occurredOn}
          onChange={(e) => setOccurredOn(e.target.value)}
          className="mb-3 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm outline-green-500"
        />

        <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Từ tài khoản (JPY)</label>
        {jpyAccounts.length === 0 ? (
          <p className="mb-3 rounded-lg bg-amber-50 dark:bg-amber-900/30 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            Chưa có tài khoản JPY. Hãy tạo một tài khoản JPY trước.
          </p>
        ) : (
          <select
            value={sourceId}
            onChange={(e) => setSourceId(e.target.value)}
            className="mb-3 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-2 text-sm"
          >
            {jpyAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        )}

        {needDest && (
          <>
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Đến tài khoản VND</label>
            {vndAccounts.length === 0 ? (
              <p className="mb-3 rounded-lg bg-amber-50 dark:bg-amber-900/30 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                Chưa có tài khoản VND. Tạo một tài khoản VND (ví dụ "Tiền ở VN") hoặc chọn "Hỗ trợ gia đình".
              </p>
            ) : (
              <select
                value={destId}
                onChange={(e) => setDestId(e.target.value)}
                className="mb-3 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-2 text-sm"
              >
                {vndAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            )}
          </>
        )}

        <div className="mb-3 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Số gửi (JPY)</label>
            <input
              inputMode="numeric"
              value={sent === 0 ? '' : formatMoney(sent, 'JPY')}
              onChange={(e) => {
                const p = String(parseMoney(e.target.value))
                setSentDigits(p === '0' ? '' : p)
              }}
              placeholder={formatMoney(0, 'JPY')}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-right text-sm font-semibold outline-green-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Phí (JPY)</label>
            <input
              inputMode="numeric"
              value={fee === 0 ? '' : formatMoney(fee, 'JPY')}
              onChange={(e) => {
                const p = String(parseMoney(e.target.value))
                setFeeDigits(p === '0' ? '' : p)
              }}
              placeholder={formatMoney(0, 'JPY')}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-right text-sm font-semibold outline-green-500"
            />
          </div>
        </div>

        <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Số nhận (VND)</label>
        <input
          inputMode="numeric"
          value={received === 0 ? '' : formatMoney(received, 'VND')}
          onChange={(e) => {
            const p = String(parseMoney(e.target.value))
            setReceivedDigits(p === '0' ? '' : p)
          }}
          placeholder={formatMoney(0, 'VND')}
          className="mb-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-right text-lg font-semibold outline-green-500"
        />
        {rate > 0 && (
          <p className="mb-3 text-right text-xs text-gray-400 dark:text-gray-500">
            Tỷ giá: 1 ¥ ≈ {rate.toFixed(1)} ₫
          </p>
        )}

        <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Dịch vụ</label>
        <select
          value={service}
          onChange={(e) => setService(e.target.value)}
          className="mb-3 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-2 text-sm"
        >
          {SERVICES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Người nhận / ghi chú (không bắt buộc)</label>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Ví dụ: gửi mẹ"
          className="mb-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm outline-green-500"
        />

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {saving ? 'Đang lưu…' : 'Lưu'}
          </button>
        </div>
      </div>
    </div>
  )
}
