import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { NewAccount } from '../../data'
import {
  useAccountBalances,
  useAccounts,
  useCreateAccount,
  useReorderAccounts,
  useUpdateAccount,
} from '../../hooks/queries'
import { CURRENCIES, formatMoney, parseMoney, type CurrencyCode } from '../../lib/money'
import type { AccountRow, AccountType } from '../../types/database.types'

const CURRENCY_LIST = Object.keys(CURRENCIES) as CurrencyCode[]

export function AccountsPage() {
  const { data: accounts = [] } = useAccounts()
  const { data: balances = [] } = useAccountBalances()
  const reorder = useReorderAccounts()
  const update = useUpdateAccount()
  const [editing, setEditing] = useState<AccountRow | 'new' | null>(null)
  const [showArchived, setShowArchived] = useState(false)

  const sorted = [...accounts].sort((a, b) => a.sort_order - b.sort_order)
  const active = sorted.filter((a) => !a.is_archived)
  const archived = sorted.filter((a) => a.is_archived)
  const balanceOf = (id: string) => balances.find((b) => b.id === id)?.balance ?? 0

  function move(index: number, delta: number) {
    const target = index + delta
    if (target < 0 || target >= active.length) return
    const ids = active.map((a) => a.id)
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    // giữ tài khoản đã lưu trữ ở cuối
    reorder.mutate([...ids, ...archived.map((a) => a.id)])
  }

  return (
    <div className="p-3 lg:p-6">
      <div className="mb-3 flex items-center gap-2">
        <Link
          to="/settings"
          className="rounded-lg bg-white px-3 py-1.5 text-lg shadow-sm active:scale-95"
          aria-label="Quay lại"
        >
          ←
        </Link>
        <h1 className="flex-1 text-lg font-bold text-gray-800">Tài khoản</h1>
        <button
          type="button"
          onClick={() => setEditing('new')}
          className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-semibold text-white active:scale-95"
        >
          + Thêm
        </button>
      </div>

      <div className="divide-y divide-gray-100 overflow-hidden rounded-xl bg-white shadow-sm">
        {active.map((a, i) => (
          <div key={a.id} className="flex items-center gap-2 px-3 py-2.5">
            <div className="flex flex-col">
              <button
                type="button"
                onClick={() => move(i, -1)}
                disabled={i === 0}
                className="text-xs text-gray-400 disabled:opacity-20"
                aria-label="Lên"
              >
                ▲
              </button>
              <button
                type="button"
                onClick={() => move(i, 1)}
                disabled={i === active.length - 1}
                className="text-xs text-gray-400 disabled:opacity-20"
                aria-label="Xuống"
              >
                ▼
              </button>
            </div>
            <span className="text-xl">{a.type === 'cash' ? '💵' : '🏦'}</span>
            <button type="button" onClick={() => setEditing(a)} className="min-w-0 flex-1 text-left">
              <span className="block truncate text-sm font-medium text-gray-800">{a.name}</span>
              <span className="block text-xs text-gray-400">
                {formatMoney(balanceOf(a.id), a.currency)} · {a.currency}
              </span>
            </button>
            <button
              type="button"
              onClick={() => update.mutate({ id: a.id, patch: { is_archived: true } })}
              className="rounded-lg px-2 py-1 text-xs text-gray-400 hover:bg-gray-100"
            >
              Lưu trữ
            </button>
          </div>
        ))}
        {active.length === 0 && (
          <p className="px-3 py-6 text-center text-sm text-gray-400">Chưa có tài khoản</p>
        )}
      </div>

      {archived.length > 0 && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            className="mb-2 text-xs font-medium text-gray-500"
          >
            {showArchived ? 'Ẩn đã lưu trữ ▲' : `Đã lưu trữ (${archived.length}) ▼`}
          </button>
          {showArchived && (
            <div className="divide-y divide-gray-100 overflow-hidden rounded-xl bg-white shadow-sm">
              {archived.map((a) => (
                <div key={a.id} className="flex items-center gap-2 px-3 py-2.5 opacity-60">
                  <span className="text-xl">{a.type === 'cash' ? '💵' : '🏦'}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-gray-700">
                    {a.name} · {a.currency}
                  </span>
                  <button
                    type="button"
                    onClick={() => update.mutate({ id: a.id, patch: { is_archived: false } })}
                    className="rounded-lg px-2 py-1 text-xs text-green-700 hover:bg-green-50"
                  >
                    Khôi phục
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {editing && (
        <AccountForm account={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      )}
    </div>
  )
}

interface FormProps {
  account: AccountRow | null
  onClose: () => void
}

function AccountForm({ account, onClose }: FormProps) {
  const create = useCreateAccount()
  const update = useUpdateAccount()
  const { data: balances = [] } = useAccountBalances()

  const [name, setName] = useState(account?.name ?? '')
  const [type, setType] = useState<AccountType>(account?.type ?? 'cash')
  const [currency, setCurrency] = useState<CurrencyCode>(account?.currency ?? 'JPY')
  const [balanceDigits, setBalanceDigits] = useState(
    account ? String(account.initial_balance) : '',
  )
  const [saving, setSaving] = useState(false)

  const initialBalance = balanceDigits === '' ? 0 : Number(balanceDigits)
  const canSave = name.trim().length > 0 && !saving
  // Đổi loại tiền tài khoản đã có giao dịch → số tiền cũ không tự quy đổi
  const hasActivity = account && balances.find((b) => b.id === account.id)?.balance !== account.initial_balance
  const currencyChanged = account && currency !== account.currency

  async function handleSubmit() {
    if (!canSave) return
    setSaving(true)
    try {
      const input: NewAccount = { name: name.trim(), type, currency, initial_balance: initialBalance }
      if (account) await update.mutateAsync({ id: account.id, patch: input })
      else await create.mutateAsync(input)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 lg:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-white p-4 lg:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-3 text-base font-bold text-gray-800">
          {account ? 'Sửa tài khoản' : 'Thêm tài khoản'}
        </h2>

        <label className="mb-1 block text-xs font-medium text-gray-500">Tên</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ví dụ: Ví MoMo"
          className="mb-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-green-500"
        />

        <div className="mb-3 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Loại</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as AccountType)}
              className="w-full rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm"
            >
              <option value="cash">💵 Tiền mặt</option>
              <option value="bank">🏦 Ngân hàng</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Loại tiền</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
              className="w-full rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm"
            >
              {CURRENCY_LIST.map((c) => (
                <option key={c} value={c}>
                  {CURRENCIES[c].symbol} {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        <label className="mb-1 block text-xs font-medium text-gray-500">Số dư ban đầu</label>
        <input
          inputMode="numeric"
          value={initialBalance === 0 ? '' : formatMoney(initialBalance, currency)}
          onChange={(e) => {
            const parsed = String(parseMoney(e.target.value))
            setBalanceDigits(parsed === '0' ? '' : parsed)
          }}
          placeholder={formatMoney(0, currency)}
          className="mb-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-right text-lg font-semibold outline-green-500"
        />

        {currencyChanged && hasActivity && (
          <p className="mb-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-700">
            Tài khoản đã có giao dịch. Đổi loại tiền không tự quy đổi số tiền các giao dịch cũ.
          </p>
        )}

        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm text-gray-500 hover:bg-gray-100"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleSubmit}
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
