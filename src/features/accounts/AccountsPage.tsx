import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ChevronDown, ChevronLeft, ChevronUp, GripVertical } from 'lucide-react'
import { AccountTypeIcon } from '../../components/icons'
import { DragList } from '../../components/DragList'
import type { NewAccount } from '../../data'
import {
  useAccountBalances,
  useAccounts,
  useAssetGroupSettings,
  useCreateAccount,
  useDeleteAccount,
  useReorderAccounts,
  useUpdateAccount,
} from '../../hooks/queries'
import { confirmDialog, showToast } from '../../lib/dialog'
import { toISODate } from '../../lib/dates'
import { CURRENCIES, formatMoney, type CurrencyCode } from '../../lib/money'
import { MoneyField } from '../../components/MoneyField'
import type { AccountRow, AccountType, TaxShelter } from '../../types/database.types'
import {
  SHELTER_DEFAULT_LIMIT_JPY,
  TAX_SHELTER_LABELS,
  TAX_SHELTER_LIST,
} from '../assets/shelter'
import { groupAccountsByType, type CurrencyTotal } from './groupByType'

/** Ghép tổng theo loại tiền thành chuỗi hiển thị: "¥545,860" hoặc "¥X · ₫Y". */
function formatTotals(totals: CurrencyTotal[]): string {
  return totals.map((t) => formatMoney(t.total, t.currency)).join(' · ')
}

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
  const groups = groupAccountsByType(active, balanceOf)
  const accountById = new Map(active.map((a) => [a.id, a]))

  // Sắp lại thứ tự tài khoản TRONG một loại (kéo–thả): chỉ hoán vị các thành viên
  // của loại đó giữa những chỗ chúng đang chiếm trong thứ tự toàn cục (theo
  // sort_order), giữ nguyên vị trí mọi tài khoản khác. Lưu trữ luôn ở cuối.
  function reorderGroup(newGroupIds: string[]) {
    const member = new Set(newGroupIds)
    const queue = [...newGroupIds]
    const globalIds = active.map((a) => (member.has(a.id) ? queue.shift()! : a.id))
    reorder.mutate([...globalIds, ...archived.map((a) => a.id)])
  }

  return (
    <div className="p-3 lg:p-6">
      <div className="mb-3 flex items-center gap-2">
        <Link
          to="/settings"
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-surface px-3 py-1.5 text-lg shadow-sm active:scale-95"
          aria-label="Quay lại"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="flex-1 text-lg font-bold text-fg-primary">Tài khoản</h1>
        <button
          type="button"
          onClick={() => setEditing('new')}
          className="rounded-lg bg-green-700 px-3 py-1.5 text-sm font-semibold text-white active:scale-95"
        >
          + Thêm
        </button>
      </div>

      {active.length > 0 && (
        <p className="mb-3 rounded-xl bg-blue-50 dark:bg-blue-900/30 p-3 text-xs text-blue-800 dark:text-blue-300">
          Nhấn giữ biểu tượng <b>⁚⁚</b> rồi kéo–thả để sắp thứ tự tài khoản trong cùng một
          loại. Muốn đổi sang loại khác thì mở tài khoản và chỉnh mục <b>Loại</b>.
        </p>
      )}

      {active.length === 0 && (
        <div className="overflow-hidden rounded-xl bg-surface shadow-sm">
          <p className="px-3 py-6 text-center text-sm text-fg-muted">Chưa có tài khoản</p>
        </div>
      )}

      {groups.map((g) => (
        <div key={g.type} className="mb-3">
          <div className="mb-1.5 flex items-baseline justify-between px-1">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
              {g.label}
            </h2>
            <span className="text-xs font-medium text-fg-secondary">
              {formatTotals(g.totalsByCurrency)}
            </span>
          </div>
          <div className="overflow-hidden rounded-xl bg-surface shadow-sm">
            <DragList
              className="divide-y divide-border-subtle"
              ids={g.accounts.map((a) => a.id)}
              onReorder={reorderGroup}
              render={(id, handle, dragging) => {
                const a = accountById.get(id)
                if (!a) return null
                return (
                  <div
                    className={`flex items-center gap-2 px-3 py-2.5 ${
                      dragging ? 'bg-green-50 shadow-md dark:bg-green-900/20' : ''
                    }`}
                  >
                    <button
                      type="button"
                      {...handle}
                      className="inline-flex min-h-11 min-w-9 shrink-0 cursor-grab touch-none items-center justify-center text-fg-muted active:cursor-grabbing"
                      aria-label={`Kéo để sắp thứ tự ${a.name}`}
                    >
                      <GripVertical className="h-5 w-5" />
                    </button>
                    <AccountTypeIcon type={a.type} className="h-4 w-4" />
                    <button type="button" onClick={() => setEditing(a)} className="min-w-0 flex-1 text-left">
                      <span className="flex items-center gap-1 truncate text-sm font-medium text-fg-primary">
                        <span className="truncate">{a.name}</span>
                        {a.is_hidden && (
                          <span className="shrink-0 rounded bg-surface-sunken px-1 text-xs text-fg-muted">
                            ẩn
                          </span>
                        )}
                        {!a.include_in_totals && (
                          <span className="shrink-0 rounded bg-surface-sunken px-1 text-xs text-fg-muted">
                            ngoài tổng
                          </span>
                        )}
                      </span>
                      <span className="block text-xs text-fg-muted">
                        {formatMoney(balanceOf(a.id), a.currency)} · {a.currency}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => update.mutate({ id: a.id, patch: { is_archived: true } })}
                      className="inline-flex min-h-11 items-center justify-center rounded-lg px-2 py-1 text-xs text-fg-muted hover:bg-gray-100 dark:hover:bg-gray-800"
                    >
                      Lưu trữ
                    </button>
                  </div>
                )
              }}
            />
          </div>
        </div>
      ))}

      {archived.length > 0 && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            className="mb-2 inline-flex min-h-11 items-center gap-1 text-xs font-medium text-fg-muted"
          >
            {showArchived ? (
              <>
                Ẩn đã lưu trữ <ChevronUp className="h-4 w-4" />
              </>
            ) : (
              <>
                Đã lưu trữ ({archived.length}) <ChevronDown className="h-4 w-4" />
              </>
            )}
          </button>
          {showArchived && (
            <div className="divide-y divide-border-subtle overflow-hidden rounded-xl bg-surface shadow-sm">
              {archived.map((a) => (
                <div key={a.id} className="flex items-center gap-2 px-3 py-2.5 opacity-60">
                  <AccountTypeIcon type={a.type} className="h-4 w-4" />
                  <span className="min-w-0 flex-1 truncate text-sm text-gray-700 dark:text-gray-300">
                    {a.name} · {a.currency}
                  </span>
                  <button
                    type="button"
                    onClick={() => update.mutate({ id: a.id, patch: { is_archived: false } })}
                    className="inline-flex min-h-11 items-center justify-center rounded-lg px-2 py-1 text-xs text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/30"
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
  const del = useDeleteAccount()

  async function handleDelete() {
    if (!account) return
    const ok = await confirmDialog({
      title: `Xóa tài khoản «${account.name}»?`,
      message: 'Không thể hoàn tác. Chỉ xóa được khi không còn giao dịch nào dùng nó.',
      confirmLabel: 'Xóa',
      danger: true,
    })
    if (!ok) return
    try {
      await del.mutateAsync(account.id)
      showToast('Đã xóa tài khoản', 'success')
      onClose()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Không xóa được', 'error')
    }
  }
  const { data: accounts = [] } = useAccounts()
  const { data: balances = [] } = useAccountBalances()
  const { data: groupSettings = [] } = useAssetGroupSettings()

  const [name, setName] = useState(account?.name ?? '')
  const [type, setType] = useState<AccountType>(account?.type ?? 'cash')
  const [currency, setCurrency] = useState<CurrencyCode>(account?.currency ?? 'JPY')
  const [assetGroup, setAssetGroup] = useState(account?.asset_group ?? '')
  const [isHidden, setIsHidden] = useState(account?.is_hidden ?? false)
  const [includeInTotals, setIncludeInTotals] = useState(account?.include_in_totals ?? true)
  const [paymentAccountId, setPaymentAccountId] = useState(account?.payment_account_id ?? '')
  // Với thẻ tín dụng, ô số dư nhập là SỐ ĐANG NỢ (dương); initial_balance lưu âm.
  const [balanceMagnitude, setBalanceMagnitude] = useState(
    account ? Math.abs(account.initial_balance) : 0,
  )
  const [creditLimit, setCreditLimit] = useState(account?.credit_limit ?? 0)
  const [statementDay, setStatementDay] = useState(
    account?.statement_day != null ? String(account.statement_day) : '',
  )
  const [paymentDueDay, setPaymentDueDay] = useState(
    account?.payment_due_day != null ? String(account.payment_due_day) : '',
  )
  // Tài sản cố định: khấu hao tuyến tính từ giá mua về giá trị còn lại
  const [depMonths, setDepMonths] = useState(
    account?.depreciation_months != null ? String(account.depreciation_months) : '',
  )
  const [depFrom, setDepFrom] = useState(account?.depreciation_from ?? '')
  const [salvage, setSalvage] = useState(account?.salvage_value ?? 0)
  // Tài khoản ưu đãi thuế Nhật: theo dõi hạn mức nạp theo năm
  const [taxShelter, setTaxShelter] = useState<TaxShelter | ''>(account?.tax_shelter ?? '')
  const [shelterLimit, setShelterLimit] = useState(account?.shelter_annual_limit ?? 0)
  const [saving, setSaving] = useState(false)

  const isCard = type === 'card'
  const isFixed = type === 'fixed'
  const isInvestment = type === 'investment'

  // Gợi ý nhóm để nhập nhanh: gộp nhóm đã tạo trong Cài đặt (kể cả nhóm rỗng)
  // với nhóm đang được tài khoản dùng, tránh trùng lặp do gõ khác nhau
  const groupSuggestions = [
    ...new Set(
      [
        ...groupSettings.map((s) => s.name.trim()),
        ...accounts.map((a) => a.asset_group?.trim() ?? ''),
      ].filter((g): g is string => !!g),
    ),
  ].sort((a, b) => a.localeCompare(b, 'vi'))

  // Tài khoản nguồn trả thẻ: không phải thẻ, cùng loại tiền với thẻ, chưa lưu trữ
  const paymentSourceOptions = accounts.filter(
    (a) => a.type !== 'card' && a.currency === currency && !a.is_archived && a.id !== account?.id,
  )
  // Tự trả cần đủ ngày chốt + đến hạn để tính số tiền theo sao kê
  const autopayNeedsDays = paymentAccountId !== '' && (statementDay === '' || paymentDueDay === '')

  // Số tiền nhập luôn dương; dấu quyết định khi lưu theo loại tài khoản
  const initialBalance = isCard ? -balanceMagnitude : balanceMagnitude
  const canSave = name.trim().length > 0 && !saving
  // Đổi loại tiền tài khoản đã có giao dịch → số tiền cũ không tự quy đổi
  const hasActivity = account && balances.find((b) => b.id === account.id)?.balance !== account.initial_balance
  const currencyChanged = account && currency !== account.currency

  async function handleSubmit() {
    if (!canSave) return
    // Chỉ tự trả khi chọn tài khoản nguồn hợp lệ (cùng currency) + đủ ngày chốt/đến hạn
    const validPaymentAccount =
      isCard &&
      paymentAccountId !== '' &&
      statementDay !== '' &&
      paymentDueDay !== '' &&
      paymentSourceOptions.some((a) => a.id === paymentAccountId)
        ? paymentAccountId
        : null
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
        credit_limit: isCard && creditLimit > 0 ? creditLimit : null,
        statement_day: isCard && statementDay !== '' ? Number(statementDay) : null,
        payment_due_day: isCard && paymentDueDay !== '' ? Number(paymentDueDay) : null,
        payment_account_id: validPaymentAccount,
        // Bật tự trả lần đầu → neo con trỏ từ hôm nay (không sinh bù quá khứ); đã bật thì giữ nguyên
        card_autopay_through: validPaymentAccount
          ? (account?.card_autopay_through ?? toISODate(new Date()))
          : null,
        depreciation_months: isFixed && depMonths !== '' ? Number(depMonths) : null,
        depreciation_from: isFixed && depFrom !== '' ? depFrom : null,
        salvage_value: isFixed ? salvage : 0,
        tax_shelter: isInvestment && taxShelter !== '' ? taxShelter : null,
        shelter_annual_limit:
          isInvestment && taxShelter !== '' && shelterLimit > 0 ? shelterLimit : null,
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
        className="w-full max-w-md rounded-t-2xl bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-3 text-base font-bold text-fg-primary">
          {account ? 'Sửa tài khoản' : 'Thêm tài khoản'}
        </h2>

        <label className="mb-1 block text-xs font-medium text-fg-muted">Tên</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ví dụ: Ví MoMo"
          className="mb-3 w-full rounded-lg border border-border-strong px-3 py-2 text-sm outline-green-500"
        />

        <div className="mb-3 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-fg-muted">Loại</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as AccountType)}
              className="w-full rounded-lg border border-border-strong bg-surface px-2 py-2 text-sm"
            >
              <option value="cash">Tiền mặt</option>
              <option value="bank">Ngân hàng</option>
              <option value="card">Thẻ tín dụng</option>
              <option value="ic">IC giao thông</option>
              <option value="ewallet">Ví điện tử</option>
              <option value="investment">Đầu tư</option>
              <option value="fixed">Tài sản cố định</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-fg-muted">Loại tiền</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
              className="w-full rounded-lg border border-border-strong bg-surface px-2 py-2 text-sm"
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
            <label className="mb-1 block text-xs font-medium text-fg-muted">
              Nhóm tài sản <span className="text-fg-muted">(không bắt buộc)</span>
            </label>
            <input
              value={assetGroup}
              onChange={(e) => setAssetGroup(e.target.value)}
              list="asset-group-suggestions"
              placeholder="Ví dụ: Tiêu dùng, Tiết kiệm, Đầu tư"
              className="mb-3 w-full rounded-lg border border-border-strong px-3 py-2 text-sm outline-green-500"
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
            <label className="mb-1 block text-xs font-medium text-fg-muted">
              Hạn mức tín dụng <span className="text-fg-muted">(không bắt buộc)</span>
            </label>
            <div className="mb-3">
              <MoneyField
                value={creditLimit}
                onChange={setCreditLimit}
                currency={currency}
                autoOpen={false}
                ariaLabel="Hạn mức tín dụng"
                className="w-full rounded-lg border border-border-strong px-3 py-2 text-right text-sm font-semibold outline-green-500"
              />
            </div>

            <div className="mb-3 grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-fg-muted">
                  Ngày chốt sao kê
                </label>
                <input
                  inputMode="numeric"
                  value={statementDay}
                  onChange={(e) => setStatementDay(clampDay(e.target.value))}
                  placeholder="1–31"
                  className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm outline-green-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-fg-muted">
                  Ngày đến hạn
                </label>
                <input
                  inputMode="numeric"
                  value={paymentDueDay}
                  onChange={(e) => setPaymentDueDay(clampDay(e.target.value))}
                  placeholder="1–31"
                  className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm outline-green-500"
                />
              </div>
            </div>

            <label className="mb-1 block text-xs font-medium text-fg-muted">
              Tài khoản trả thẻ <span className="text-fg-muted">(không bắt buộc)</span>
            </label>
            <select
              value={paymentAccountId}
              onChange={(e) => setPaymentAccountId(e.target.value)}
              className="mb-1 w-full rounded-lg border border-border-strong bg-surface px-2 py-2 text-sm"
            >
              <option value="">— Không tự trả —</option>
              {paymentSourceOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <p className="mb-3 flex items-start gap-1 text-xs text-fg-muted">
              {autopayNeedsDays ? (
                <>
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>Cần điền Ngày chốt sao kê và Ngày đến hạn để tự trả.</span>
                </>
              ) : (
                'Vào ngày đến hạn, app tự tạo chuyển khoản từ tài khoản này sang thẻ, đúng bằng dư nợ chốt sao kê.'
              )}
            </p>
          </>
        )}

        {/* Hiển thị trên trang Tài sản */}
        <div className="mb-3 space-y-2 rounded-lg bg-surface-page p-3">
          <label className="flex items-center justify-between text-sm text-gray-700 dark:text-gray-300">
            <span>
              {isCard ? 'Trừ vào Tài sản ròng' : 'Tính vào Tổng tài sản'}
              <span className="block text-xs text-fg-muted">
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
              <span className="block text-xs text-fg-muted">Vẫn dùng bình thường khi nhập giao dịch</span>
            </span>
            <AccountToggle checked={isHidden} onChange={setIsHidden} label="Ẩn khỏi trang Tài sản" />
          </label>
        </div>

        <label className="mb-1 block text-xs font-medium text-fg-muted">
          {isCard ? 'Số nợ ban đầu' : 'Số dư ban đầu'}
        </label>
        <div className="mb-2">
          <MoneyField
            value={balanceMagnitude}
            onChange={setBalanceMagnitude}
            currency={currency}
            ariaLabel={isCard ? 'Số nợ ban đầu' : 'Số dư ban đầu'}
            className="w-full rounded-lg border border-border-strong px-3 py-2 text-right text-lg font-semibold outline-green-500"
          />
        </div>
        {isCard && (
          <p className="mb-2 text-xs text-fg-muted">
            Số nợ tại thời điểm bắt đầu ghi sổ (để 0 nếu chưa nợ). Chi tiêu bằng thẻ và trả
            thẻ ghi như giao dịch bình thường. Muốn khớp lại nợ hiện tại thì mở thẻ trong
            trang Tài sản và bấm “Điều chỉnh số nợ” — sửa ô này sẽ dịch cả lịch sử cũ.
          </p>
        )}
        {isInvestment && (
          <p className="mb-2 text-xs text-fg-muted">
            Nhập vốn gốc ban đầu (tiền đã bỏ vào). Sau khi tạo, vào trang tài khoản để
            “Cập nhật giá trị” theo giá thị trường — chênh lệch là lãi/lỗ chưa thực hiện.
          </p>
        )}

        {/* Tài khoản ưu đãi thuế Nhật — theo dõi hạn mức nạp mỗi năm */}
        {isInvestment && (
          <div className="mb-3 rounded-lg bg-surface-page p-2.5 ">
            <label className="mb-1 block text-xs font-medium text-fg-muted">
              Ưu đãi thuế <span className="text-fg-muted">(không bắt buộc)</span>
            </label>
            <select
              value={taxShelter}
              onChange={(e) => {
                const next = e.target.value as TaxShelter | ''
                setTaxShelter(next)
                // Điền sẵn hạn mức pháp định để khỏi phải tra — vẫn sửa được
                if (next && shelterLimit === 0 && currency === 'JPY') {
                  setShelterLimit(SHELTER_DEFAULT_LIMIT_JPY[next])
                }
              }}
              className="w-full rounded-lg border border-gray-300 bg-surface px-2 py-2 text-sm dark:border-gray-700 "
            >
              <option value="">Tài khoản thường</option>
              {TAX_SHELTER_LIST.map((s) => (
                <option key={s} value={s}>
                  {TAX_SHELTER_LABELS[s]}
                </option>
              ))}
            </select>
            {taxShelter !== '' && (
              <>
                <label className="mb-1 mt-2 block text-xs font-medium text-fg-muted">
                  Hạn mức nạp mỗi năm
                </label>
                <MoneyField
                  value={shelterLimit}
                  onChange={setShelterLimit}
                  currency={currency}
                  autoOpen={false}
                  ariaLabel="Hạn mức nạp mỗi năm"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-right text-sm outline-green-500 dark:border-gray-700"
                />
                <p className="mt-1 text-2xs text-fg-muted">
                  App đếm tiền bạn chuyển vào tài khoản này trong năm và cho biết còn bao nhiêu hạn
                  mức chưa dùng.
                </p>
              </>
            )}
          </div>
        )}

        {/* Tài sản cố định — khấu hao tuyến tính */}
        {isFixed && (
          <div className="mb-3 rounded-lg bg-surface-page p-2.5 ">
            <p className="mb-2 text-xs text-fg-muted">
              Nhập <b>giá mua</b> ở ô số tiền phía trên. App sẽ tự giảm dần giá trị theo thời gian.
              Bất cứ lúc nào bạn tự “Cập nhật giá trị” trong trang tài khoản thì con số nhập tay được
              ưu tiên.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-fg-muted">
                  Ngày mua
                </label>
                <input
                  type="date"
                  value={depFrom}
                  onChange={(e) => setDepFrom(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-2 py-2 text-sm outline-green-500 dark:border-gray-700 dark:bg-gray-900"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-fg-muted">
                  Khấu hao (tháng)
                </label>
                <input
                  inputMode="numeric"
                  value={depMonths}
                  onChange={(e) => setDepMonths(e.target.value.replace(/\D/g, ''))}
                  placeholder="60"
                  className="w-full rounded-lg border border-gray-300 px-2 py-2 text-sm outline-green-500 dark:border-gray-700"
                />
              </div>
            </div>
            <label className="mb-1 mt-2 block text-xs font-medium text-fg-muted">
              Giá trị còn lại cuối vòng đời
            </label>
            <MoneyField
              value={salvage}
              onChange={setSalvage}
              currency={currency}
              autoOpen={false}
              ariaLabel="Giá trị còn lại cuối vòng đời"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-right text-sm outline-green-500 dark:border-gray-700"
            />
            <p className="mt-1 text-2xs text-fg-muted">
              Ví dụ xe 5 năm về 0: 60 tháng, còn lại 0. Xe vẫn bán được giá thì điền số bán ước tính.
              Bỏ trống ngày mua hoặc số tháng = không khấu hao tự động.
            </p>
          </div>
        )}

        {currencyChanged && hasActivity && (
          <p className="mb-2 rounded-lg bg-amber-50 dark:bg-amber-900/30 p-2 text-xs text-amber-700 dark:text-amber-300">
            Tài khoản đã có giao dịch. Đổi loại tiền không tự quy đổi số tiền các giao dịch cũ.
          </p>
        )}

        <div className="mt-3 flex items-center gap-2">
          {account && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={del.isPending}
              className="rounded-lg px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/30 disabled:opacity-50"
            >
              Xóa
            </button>
          )}
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-3 py-2 text-sm text-fg-muted hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSave}
              className="rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              {saving ? 'Đang lưu…' : 'Lưu'}
            </button>
          </div>
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
      className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center"
    >
      <span
        className={`relative block h-5 w-9 rounded-full transition ${
          checked ? 'bg-green-700' : 'bg-gray-300'
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
            checked ? 'left-[18px]' : 'left-0.5'
          }`}
        />
      </span>
    </button>
  )
}
