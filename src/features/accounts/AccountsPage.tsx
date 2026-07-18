import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { AccountTypeIcon } from '../../components/icons'
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

/** Giữ ô ngày trong tháng hợp lệ: chỉ chữ số, kẹp 1..31, cho phép rỗng. */
function clampDay(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits === '') return ''
  return String(Math.min(Math.max(Number(digits), 1), 31))
}

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
          className="rounded-lg bg-white dark:bg-gray-900 px-3 py-1.5 text-lg shadow-sm active:scale-95"
          aria-label="Quay lại"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="flex-1 text-lg font-bold text-gray-800 dark:text-gray-100">Tài khoản</h1>
        <button
          type="button"
          onClick={() => setEditing('new')}
          className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-semibold text-white active:scale-95"
        >
          + Thêm
        </button>
      </div>

      <div className="divide-y divide-gray-100 dark:divide-gray-800 overflow-hidden rounded-xl bg-white dark:bg-gray-900 shadow-sm">
        {active.map((a, i) => (
          <div key={a.id} className="flex items-center gap-2 px-3 py-2.5">
            <div className="flex flex-col">
              <button
                type="button"
                onClick={() => move(i, -1)}
                disabled={i === 0}
                className="text-xs text-gray-400 dark:text-gray-500 disabled:opacity-20"
                aria-label="Lên"
              >
                ▲
              </button>
              <button
                type="button"
                onClick={() => move(i, 1)}
                disabled={i === active.length - 1}
                className="text-xs text-gray-400 dark:text-gray-500 disabled:opacity-20"
                aria-label="Xuống"
              >
                ▼
              </button>
            </div>
            <AccountTypeIcon type={a.type} className="h-4 w-4" />
            <button type="button" onClick={() => setEditing(a)} className="min-w-0 flex-1 text-left">
              <span className="flex items-center gap-1 truncate text-sm font-medium text-gray-800 dark:text-gray-100">
                <span className="truncate">{a.name}</span>
                {a.is_hidden && (
                  <span className="shrink-0 rounded bg-gray-100 dark:bg-gray-800 px-1 text-[10px] text-gray-500 dark:text-gray-400">
                    ẩn
                  </span>
                )}
                {!a.include_in_totals && (
                  <span className="shrink-0 rounded bg-gray-100 dark:bg-gray-800 px-1 text-[10px] text-gray-500 dark:text-gray-400">
                    ngoài tổng
                  </span>
                )}
              </span>
              <span className="block text-xs text-gray-400 dark:text-gray-500">
                {formatMoney(balanceOf(a.id), a.currency)} · {a.currency}
              </span>
            </button>
            <button
              type="button"
              onClick={() => update.mutate({ id: a.id, patch: { is_archived: true } })}
              className="rounded-lg px-2 py-1 text-xs text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              Lưu trữ
            </button>
          </div>
        ))}
        {active.length === 0 && (
          <p className="px-3 py-6 text-center text-sm text-gray-400 dark:text-gray-500">Chưa có tài khoản</p>
        )}
      </div>

      {archived.length > 0 && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400"
          >
            {showArchived ? 'Ẩn đã lưu trữ ▲' : `Đã lưu trữ (${archived.length}) ▼`}
          </button>
          {showArchived && (
            <div className="divide-y divide-gray-100 dark:divide-gray-800 overflow-hidden rounded-xl bg-white dark:bg-gray-900 shadow-sm">
              {archived.map((a) => (
                <div key={a.id} className="flex items-center gap-2 px-3 py-2.5 opacity-60">
                  <AccountTypeIcon type={a.type} className="h-4 w-4" />
                  <span className="min-w-0 flex-1 truncate text-sm text-gray-700 dark:text-gray-300">
                    {a.name} · {a.currency}
                  </span>
                  <button
                    type="button"
                    onClick={() => update.mutate({ id: a.id, patch: { is_archived: false } })}
                    className="rounded-lg px-2 py-1 text-xs text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/30"
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
  const { data: accounts = [] } = useAccounts()
  const { data: balances = [] } = useAccountBalances()

  const [name, setName] = useState(account?.name ?? '')
  const [type, setType] = useState<AccountType>(account?.type ?? 'cash')
  const [currency, setCurrency] = useState<CurrencyCode>(account?.currency ?? 'JPY')
  const [assetGroup, setAssetGroup] = useState(account?.asset_group ?? '')
  const [isHidden, setIsHidden] = useState(account?.is_hidden ?? false)
  const [includeInTotals, setIncludeInTotals] = useState(account?.include_in_totals ?? true)
  // Với thẻ tín dụng, ô số dư nhập là SỐ ĐANG NỢ (dương); initial_balance lưu âm.
  const [balanceDigits, setBalanceDigits] = useState(
    account ? String(Math.abs(account.initial_balance)) : '',
  )
  const [creditLimitDigits, setCreditLimitDigits] = useState(
    account?.credit_limit != null ? String(account.credit_limit) : '',
  )
  const [statementDay, setStatementDay] = useState(
    account?.statement_day != null ? String(account.statement_day) : '',
  )
  const [paymentDueDay, setPaymentDueDay] = useState(
    account?.payment_due_day != null ? String(account.payment_due_day) : '',
  )
  const [saving, setSaving] = useState(false)

  const isCard = type === 'card'

  // Gợi ý các nhóm đã dùng để nhập nhanh, tránh trùng lặp do gõ khác nhau
  const groupSuggestions = [
    ...new Set(accounts.map((a) => a.asset_group?.trim()).filter((g): g is string => !!g)),
  ].sort((a, b) => a.localeCompare(b, 'vi'))

  // Độ lớn số tiền nhập (luôn dương); dấu quyết định khi lưu theo loại tài khoản
  const balanceMagnitude = balanceDigits === '' ? 0 : Number(balanceDigits)
  const initialBalance = isCard ? -balanceMagnitude : balanceMagnitude
  const canSave = name.trim().length > 0 && !saving
  // Đổi loại tiền tài khoản đã có giao dịch → số tiền cũ không tự quy đổi
  const hasActivity = account && balances.find((b) => b.id === account.id)?.balance !== account.initial_balance
  const currencyChanged = account && currency !== account.currency

  async function handleSubmit() {
    if (!canSave) return
    setSaving(true)
    try {
      const input: NewAccount = {
        name: name.trim(),
        type,
        currency,
        initial_balance: initialBalance,
        // Thẻ tín dụng không thuộc nhóm tài sản
        asset_group: isCard ? null : assetGroup.trim() || null,
        is_hidden: isHidden,
        include_in_totals: includeInTotals,
        credit_limit: isCard && creditLimitDigits !== '' ? Number(creditLimitDigits) : null,
        statement_day: isCard && statementDay !== '' ? Number(statementDay) : null,
        payment_due_day: isCard && paymentDueDay !== '' ? Number(paymentDueDay) : null,
      }
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
        className="w-full max-w-md rounded-t-2xl bg-white dark:bg-gray-900 p-4 lg:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-3 text-base font-bold text-gray-800 dark:text-gray-100">
          {account ? 'Sửa tài khoản' : 'Thêm tài khoản'}
        </h2>

        <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Tên</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ví dụ: Ví MoMo"
          className="mb-3 w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm outline-green-500"
        />

        <div className="mb-3 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Loại</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as AccountType)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-2 text-sm"
            >
              <option value="cash">Tiền mặt</option>
              <option value="bank">Ngân hàng</option>
              <option value="card">Thẻ tín dụng</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Loại tiền</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-2 text-sm"
            >
              {CURRENCY_LIST.map((c) => (
                <option key={c} value={c}>
                  {CURRENCIES[c].symbol} {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        {!isCard && (
          <>
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
              Nhóm tài sản <span className="text-gray-400 dark:text-gray-500">(không bắt buộc)</span>
            </label>
            <input
              value={assetGroup}
              onChange={(e) => setAssetGroup(e.target.value)}
              list="asset-group-suggestions"
              placeholder="Ví dụ: Tiêu dùng, Tiết kiệm, Đầu tư"
              className="mb-3 w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm outline-green-500"
            />
            <datalist id="asset-group-suggestions">
              {groupSuggestions.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </>
        )}

        {isCard && (
          <>
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
              Hạn mức tín dụng <span className="text-gray-400 dark:text-gray-500">(không bắt buộc)</span>
            </label>
            <input
              inputMode="numeric"
              value={creditLimitDigits === '' ? '' : formatMoney(Number(creditLimitDigits), currency)}
              onChange={(e) => {
                const parsed = String(parseMoney(e.target.value))
                setCreditLimitDigits(parsed === '0' ? '' : parsed)
              }}
              placeholder={formatMoney(0, currency)}
              className="mb-3 w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-right text-sm font-semibold outline-green-500"
            />

            <div className="mb-3 grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                  Ngày chốt sao kê
                </label>
                <input
                  inputMode="numeric"
                  value={statementDay}
                  onChange={(e) => setStatementDay(clampDay(e.target.value))}
                  placeholder="1–31"
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm outline-green-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                  Ngày đến hạn
                </label>
                <input
                  inputMode="numeric"
                  value={paymentDueDay}
                  onChange={(e) => setPaymentDueDay(clampDay(e.target.value))}
                  placeholder="1–31"
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm outline-green-500"
                />
              </div>
            </div>
          </>
        )}

        {/* Hiển thị trên trang Tài sản */}
        <div className="mb-3 space-y-2 rounded-lg bg-gray-50 dark:bg-gray-950 p-3">
          <label className="flex items-center justify-between text-sm text-gray-700 dark:text-gray-300">
            <span>
              {isCard ? 'Trừ vào Tài sản ròng' : 'Tính vào Tổng tài sản'}
              <span className="block text-xs text-gray-400 dark:text-gray-500">
                {isCard
                  ? 'Trừ số đang nợ khỏi Tài sản ròng ở trang Tài sản'
                  : 'Cộng số dư vào tổng ở trang Tài sản'}
              </span>
            </span>
            <AccountToggle
              checked={includeInTotals}
              onChange={setIncludeInTotals}
              label={isCard ? 'Trừ vào Tài sản ròng' : 'Tính vào Tổng tài sản'}
            />
          </label>
          <label className="flex items-center justify-between text-sm text-gray-700 dark:text-gray-300">
            <span>
              Ẩn khỏi trang Tài sản
              <span className="block text-xs text-gray-400 dark:text-gray-500">Vẫn dùng bình thường khi nhập giao dịch</span>
            </span>
            <AccountToggle checked={isHidden} onChange={setIsHidden} label="Ẩn khỏi trang Tài sản" />
          </label>
        </div>

        <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
          {isCard ? 'Số đang nợ hiện tại' : 'Số dư ban đầu'}
        </label>
        <input
          inputMode="numeric"
          value={balanceMagnitude === 0 ? '' : formatMoney(balanceMagnitude, currency)}
          onChange={(e) => {
            const parsed = String(parseMoney(e.target.value))
            setBalanceDigits(parsed === '0' ? '' : parsed)
          }}
          placeholder={formatMoney(0, currency)}
          className="mb-2 w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-right text-lg font-semibold outline-green-500"
        />
        {isCard && (
          <p className="mb-2 text-xs text-gray-400 dark:text-gray-500">
            Nhập số bạn đang nợ thẻ (để 0 nếu chưa nợ). Chi tiêu bằng thẻ và trả thẻ ghi như giao dịch bình thường.
          </p>
        )}

        {currencyChanged && hasActivity && (
          <p className="mb-2 rounded-lg bg-amber-50 dark:bg-amber-900/30 p-2 text-xs text-amber-700 dark:text-amber-300">
            Tài khoản đã có giao dịch. Đổi loại tiền không tự quy đổi số tiền các giao dịch cũ.
          </p>
        )}

        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
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

/** Công tắc bật/tắt nhỏ gọn cho form tài khoản. */
function AccountToggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition ${
        checked ? 'bg-green-600' : 'bg-gray-300'
      }`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
          checked ? 'left-[18px]' : 'left-0.5'
        }`}
      />
    </button>
  )
}
