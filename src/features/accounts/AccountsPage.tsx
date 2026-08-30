// Tài khoản — danh sách, sắp thứ tự, và form thêm/sửa.
//
// ---- Vì sao vẽ lại phần DANH SÁCH (redesign 2026-08-30) -----------------------------
//
// Mỗi dòng trước đây xếp DỌC: tên ở trên, "số dư · loại tiền" ở dưới, và một nút chữ
// "Lưu trữ" ở tít mép phải. Ở 1440px, cột số dư nằm ngay dưới cái tên trong khi bên phải
// còn cả một khoảng trống bằng nửa màn hình — cùng bệnh đã chữa ở Nhóm tài sản và Nhãn.
//
// Nay một dòng là một HÀNG: tên · số dư · loại tiền · nút. Số dư về đúng một cột, nên
// đọc dọc so được các tài khoản với nhau — thứ mà bản xếp dọc không cho làm. Dưới `lg`
// vẫn xuống dòng như cũ (ở 375px bốn cột không vừa).
import { useId, useState } from 'react'
import { Guide } from '../../components/Guide'
import { AlertTriangle, ChevronDown, ChevronUp, GripVertical, Plus } from 'lucide-react'
import { ClassificationToggle } from '../categories/ClassificationToggle'
import { LIQUID_OPTIONS, needsLiquidityAnswer } from '../assets/liquidity'
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
import { DateField } from '../../components/DateField'
import type { AccountRow, AccountType, TaxShelter } from '../../types/database.types'
import {
  SHELTER_DEFAULT_LIMIT_JPY,
  TAX_SHELTER_LABELS,
  TAX_SHELTER_LIST,
} from '../assets/shelter'
import { groupAccountsByType, type CurrencyTotal } from './groupByType'
import { useEscClose } from '../../hooks/useEscClose'
import {
  ActionButton,
  Card,
  EmptyState,
  Money,
  PageHeader,
  PanelHeader,
  SectionTitle,
  Select,
  actionButtonClass,
} from '../../components/ui'

// Điện thoại: tên + chip ở trên, số dư xuống dòng. Từ `lg`: bốn cột một hàng.
// `grid` KHÔNG nằm trong hằng số — `hidden` và `grid` cùng là tiện ích display, cái nào
// thắng do thứ tự trong CSS chứ không do thứ tự trong chuỗi.
// rem chứ px (§13): cột số dư chứa CHỮ SỐ, cỡ chữ "Rất lớn" mà cột đứng yên là số bị cắt.
const ROW_GRID =
  'grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 ' +
  'lg:grid-cols-[auto_minmax(0,1fr)_minmax(7rem,auto)_3rem_auto]'

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
      <PageHeader title="Tài khoản" back="/settings">
        <button
          type="button"
          onClick={() => setEditing('new')}
          className={actionButtonClass('primary')}
        >
          <Plus className="h-4 w-4" /> Thêm
        </button>
      </PageHeader>

      {active.length > 0 && (
        <Guide className="mb-3 rounded-xl bg-surface-sunken p-3 text-sm text-fg-secondary">
          Nhấn giữ biểu tượng <b>⁚⁚</b> rồi kéo–thả để sắp thứ tự tài khoản trong cùng một
          loại. Muốn đổi sang loại khác thì mở tài khoản và chỉnh mục <b>Loại</b>.
        </Guide>
      )}

      {active.length === 0 && (
        <Card padding="none" className="overflow-hidden">
          <EmptyState compact>Chưa có tài khoản</EmptyState>
        </Card>
      )}

      {groups.map((g) => (
        <div key={g.type} className="mb-3">
          <Card elevation="panel" padding="none" className="overflow-hidden">
            <PanelHeader right={formatTotals(g.totalsByCurrency)}>{g.label}</PanelHeader>
            <DragList
              className="divide-y divide-border-subtle"
              ids={g.accounts.map((a) => a.id)}
              onReorder={reorderGroup}
              render={(id, handle, dragging) => {
                const a = accountById.get(id)
                if (!a) return null
                return (
                  <div
                    className={`grid ${ROW_GRID} px-3 py-1.5 ${
                      dragging ? 'bg-surface-sunken' : ''
                    }`}
                  >
                    <button
                      type="button"
                      {...handle}
                      className="inline-flex min-h-11 w-5 shrink-0 cursor-grab touch-none items-center justify-center text-fg-muted active:cursor-grabbing"
                      aria-label={`Kéo để sắp thứ tự ${a.name}`}
                    >
                      <GripVertical className="h-4 w-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => setEditing(a)}
                      className="flex min-h-11 min-w-0 flex-col justify-center py-1 text-left"
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        <AccountTypeIcon type={a.type} className="h-4 w-4 shrink-0 text-fg-muted" />
                        <span className="min-w-0 truncate text-sm text-fg-primary">{a.name}</span>
                        {a.is_hidden && (
                          <span className="shrink-0 rounded bg-surface-sunken px-1 text-2xs text-fg-muted">
                            ẩn
                          </span>
                        )}
                        {!a.include_in_totals && (
                          <span className="shrink-0 rounded bg-surface-sunken px-1 text-2xs text-fg-muted">
                            ngoài tổng
                          </span>
                        )}
                        {/* Dấu "rút ngay?" — chỗ DUY NHẤT nói ra tài khoản nào còn thiếu cờ.
                            Tab Sức khỏe đếm "N tài khoản chưa khai" rồi dẫn sang trang này,
                            mà tới đây thì không có gì chỉ N tài khoản đó là những tài khoản
                            nào: phải mở lần lượt từng form mới biết. Dùng chung phép hỏi
                            `needsLiquidityAnswer` với con số đếm bên kia, nên hai chỗ không
                            lệch nhau được. Dấu tự mất khi khai xong. */}
                        {needsLiquidityAnswer(a) && (
                          <span className="shrink-0 rounded bg-state-warn-bg px-1 text-2xs text-state-warn-fg">
                            rút ngay?
                          </span>
                        )}
                      </span>
                      {/* Dòng phụ chỉ ở điện thoại — từ `lg` số dư và loại tiền đã là hai cột. */}
                      <span className="text-2xs text-fg-muted lg:hidden">
                        {formatMoney(balanceOf(a.id), a.currency)} · {a.currency}
                      </span>
                    </button>

                    <span className="hidden justify-self-end text-sm lg:block">
                      {/* Âm thì đỏ, dương thì TRUNG TÍNH — không phải `bySign` (nó tô xanh cả số
                          dương). Số dư là một lượng đang có, không phải một chiều tiền chảy; tô
                          xanh nó là mượn nghĩa "khoản thu". Cùng quy ước với dòng tài khoản ở
                          AssetsNowView. */}
                      <Money
                        amount={balanceOf(a.id)}
                        currency={a.currency}
                        tone={balanceOf(a.id) < 0 ? 'out' : 'neutral'}
                      />
                    </span>
                    <span className="hidden justify-self-end text-2xs text-fg-muted lg:block">
                      {a.currency}
                    </span>

                    {/* KHÔNG `hidden lg:block`: bản nháp đầu giấu nút này ở điện thoại và
                        thế là mất luôn đường lưu trữ trên máy nhỏ — cột thứ ba của lưới
                        mobile chính là chỗ của nó. */}
                    <span className="justify-self-end">
                      <ActionButton
                        onClick={() => update.mutate({ id: a.id, patch: { is_archived: true } })}
                      >
                        Lưu trữ
                      </ActionButton>
                    </span>
                  </div>
                )
              }}
            />
          </Card>
        </div>
      ))}

      {archived.length > 0 && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            className="mb-2 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-fg-muted"
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
            <Card padding="none" className="divide-y divide-border-subtle overflow-hidden">
              {archived.map((a) => (
                <div key={a.id} className="flex items-center gap-2 px-3 py-2.5 opacity-60">
                  <AccountTypeIcon type={a.type} className="h-4 w-4" />
                  <span className="min-w-0 flex-1 truncate text-sm text-fg-secondary">
                    {a.name} · {a.currency}
                  </span>
                  <button
                    type="button"
                    onClick={() => update.mutate({ id: a.id, patch: { is_archived: false } })}
                    className="inline-flex min-h-11 items-center justify-center rounded-md px-2 py-1 text-sm text-fg-accent hover:bg-accent-muted-bg"
                  >
                    Khôi phục
                  </button>
                </div>
              ))}
            </Card>
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
  useEscClose(onClose)
  // `useId` chứ không phải id viết cứng — cùng lý do đã ghi ở PhaseFormSheet: id trùng thì
  // `htmlFor` bắt vào ô ĐẦU TIÊN khớp trong cả trang, tức nhãn trỏ sai ô.
  const uid = useId()
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
  // `is_liquid` ba trạng thái, không phải hai: null = "chưa khai, để app suy từ loại".
  // Giữ null làm mặc định để không tự ý xác nhận hộ người dùng — xem liquidity.ts.
  const [isLiquid, setIsLiquid] = useState<boolean | null>(account?.is_liquid ?? null)
  const [paymentAccountId, setPaymentAccountId] = useState(account?.payment_account_id ?? '')
  // Tài khoản đầu tư VND: ví tiền — nơi tiền THẬT SỰ đi ra khi mua cổ phiếu (0054).
  const [cashAccountId, setCashAccountId] = useState(account?.cash_account_id ?? '')
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
  // Ví tiền của tài khoản đầu tư: cùng loại tiền, không phải chính nó, chưa lưu trữ.
  // KHÔNG lọc theo `type`: điều kiện thật là "cùng loại tiền và không phải chính nó";
  // chặn thêm theo loại là đoán hộ người dùng tiền của họ nằm ở đâu.
  const cashWalletOptions = accounts.filter(
    (a) => a.currency === currency && !a.is_archived && a.id !== account?.id,
  )

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
    // Chỉ nhận ví khi tài khoản là đầu tư VND và lựa chọn còn hợp lệ — đổi loại tiền hay
    // đổi loại tài khoản xong mà vẫn giữ ví cũ là ghi một liên kết đã hết nghĩa, và mỗi
    // lệnh sau đó sẽ ghi tiền đi ra từ một tài khoản không liên quan.
    const validCashAccount =
      isInvestment &&
      currency === 'VND' &&
      cashAccountId !== '' &&
      cashWalletOptions.some((a) => a.id === cashAccountId)
        ? cashAccountId
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
        is_liquid: isLiquid,
        credit_limit: isCard && creditLimit > 0 ? creditLimit : null,
        statement_day: isCard && statementDay !== '' ? Number(statementDay) : null,
        payment_due_day: isCard && paymentDueDay !== '' ? Number(paymentDueDay) : null,
        payment_account_id: validPaymentAccount,
        cash_account_id: validCashAccount,
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
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 lg:items-center animate-overlay-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:rounded-2xl animate-sheet-in lg:animate-sheet-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <SectionTitle role="block" className="mb-3">
          {account ? 'Sửa tài khoản' : 'Thêm tài khoản'}
        </SectionTitle>

        <label htmlFor={`${uid}-name`} className="mb-1 block text-sm font-medium text-fg-muted">
          Tên
        </label>
        <input
          id={`${uid}-name`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ví dụ: Ví MoMo"
          className="mb-3 w-full rounded-md border border-border-strong px-3 py-2 text-sm"
        />

        <div className="mb-3 grid grid-cols-2 gap-3">
          <div>
            <label htmlFor={`${uid}-type`} className="mb-1 block text-sm font-medium text-fg-muted">
              Loại
            </label>
            <Select
              id={`${uid}-type`}
              value={type}
              onChange={(e) => setType(e.target.value as AccountType)} wrapClassName="w-full">
              <option value="cash">Tiền mặt</option>
              <option value="bank">Ngân hàng</option>
              <option value="card">Thẻ tín dụng</option>
              <option value="ic">IC giao thông</option>
              <option value="ewallet">Ví điện tử</option>
              <option value="investment">Đầu tư</option>
              <option value="fixed">Tài sản cố định</option>
            </Select>
          </div>
          <div>
            <label htmlFor={`${uid}-currency`} className="mb-1 block text-sm font-medium text-fg-muted">
              Loại tiền
            </label>
            <Select
              id={`${uid}-currency`}
              value={currency}
              onChange={(e) => setCurrency(e.target.value as CurrencyCode)} wrapClassName="w-full">
              {CURRENCY_LIST.map((c) => (
                <option key={c} value={c}>
                  {CURRENCIES[c].symbol} {c}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {!isCard && (
          <>
            <label htmlFor={`${uid}-group`} className="mb-1 block text-sm font-medium text-fg-muted">
              Nhóm tài sản <span className="text-fg-muted">(không bắt buộc)</span>
            </label>
            <input
              id={`${uid}-group`}
              value={assetGroup}
              onChange={(e) => setAssetGroup(e.target.value)}
              list="asset-group-suggestions"
              placeholder="Ví dụ: Tiêu dùng, Tiết kiệm, Đầu tư"
              className="mb-3 w-full rounded-md border border-border-strong px-3 py-2 text-sm"
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
            {/* <span> chứ không <label htmlFor>: MoneyField có HAI ô (hộp chạm mobile +
                input desktop) luôn cùng nằm trong DOM, nên `for` chắc chắn trỏ vào ô đang
                bị CSS ẩn. Tên ô đến từ `ariaLabel` — phải khớp chữ ở đây. */}
            <span className="mb-1 block text-sm font-medium text-fg-muted">
              Hạn mức tín dụng <span className="text-fg-muted">(không bắt buộc)</span>
            </span>
            <div className="mb-3">
              <MoneyField
                value={creditLimit}
                onChange={setCreditLimit}
                currency={currency}
                autoOpen={false}
                ariaLabel="Hạn mức tín dụng"
                className="w-full rounded-lg border border-border-strong px-3 py-2 text-right text-sm font-semibold"
              />
            </div>

            <div className="mb-3 grid grid-cols-2 gap-3">
              <div>
                <label htmlFor={`${uid}-stmt`} className="mb-1 block text-sm font-medium text-fg-muted">
                  Ngày chốt sao kê
                </label>
                <input
                  id={`${uid}-stmt`}
                  inputMode="numeric"
                  value={statementDay}
                  onChange={(e) => setStatementDay(clampDay(e.target.value))}
                  placeholder="1–31"
                  className="w-full rounded-md border border-border-strong px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label htmlFor={`${uid}-due`} className="mb-1 block text-sm font-medium text-fg-muted">
                  Ngày đến hạn
                </label>
                <input
                  id={`${uid}-due`}
                  inputMode="numeric"
                  value={paymentDueDay}
                  onChange={(e) => setPaymentDueDay(clampDay(e.target.value))}
                  placeholder="1–31"
                  className="w-full rounded-md border border-border-strong px-3 py-2 text-sm"
                />
              </div>
            </div>

            <label htmlFor={`${uid}-payacc`} className="mb-1 block text-sm font-medium text-fg-muted">
              Tài khoản trả thẻ <span className="text-fg-muted">(không bắt buộc)</span>
            </label>
            <Select
              id={`${uid}-payacc`}
              value={paymentAccountId}
              onChange={(e) => setPaymentAccountId(e.target.value)} wrapClassName="mb-1 w-full">
              <option value="">— Không tự trả —</option>
              {paymentSourceOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
            <p className="mb-3 flex items-start gap-1 text-sm text-fg-muted">
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

        {isInvestment && currency === 'VND' && (
          <>
            <label htmlFor={`${uid}-vitien`} className="mb-1 block text-sm font-medium text-fg-muted">
              Ví tiền <span className="text-fg-muted">(không bắt buộc)</span>
            </label>
            <Select
              id={`${uid}-vitien`}
              value={cashAccountId}
              onChange={(e) => setCashAccountId(e.target.value)}
              wrapClassName="mb-1 w-full">
              <option value="">— Không nối —</option>
              {cashWalletOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
            <Guide className="mb-3 text-sm text-fg-muted">
              Tiền mua cổ phiếu đi ra từ tài khoản này. Mỗi lệnh bạn ghi, app tự ghi kèm một
              lần chuyển tiền — số dư ví khỏi cao hơn tiền thật.
            </Guide>
          </>
        )}

        {/* Hiển thị trên trang Tài sản */}
        <div className="mb-3 space-y-2 rounded-lg bg-surface-page p-3">
          <label className="flex items-center justify-between text-sm text-fg-secondary">
            <span>
              {isCard ? 'Trừ vào Tài sản ròng' : 'Tính vào Tổng tài sản'}
              <span className="block text-sm text-fg-muted">
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
          <label className="flex items-center justify-between text-sm text-fg-secondary">
            <span>
              Ẩn khỏi trang Tài sản
              <span className="block text-sm text-fg-muted">Vẫn dùng bình thường khi nhập giao dịch</span>
            </span>
            <AccountToggle checked={isHidden} onChange={setIsHidden} label="Ẩn khỏi trang Tài sản" />
          </label>
        </div>

        {/* Rút ra được ngay? — BA lựa chọn, không phải công tắc hai chiều.
            "Để app suy" là một trạng thái THẬT và phải giữ được: nó khác hẳn "người dùng đã
            xác nhận có", và tab Sức khỏe / Quyết định đọc chính sự khác biệt đó để nói ra
            rằng con số đang dựa trên phép đoán. Một công tắc hai chiều sẽ ép mọi tài khoản
            thành đã-xác-nhận ngay lần mở form đầu tiên.
            Thẻ tín dụng không hỏi: nó là nợ, không phải chỗ chứa tiền. */}
        {!isCard && (
          <div className="mb-3">
            <ClassificationToggle
              label="Rút ra tiêu được ngay?"
              options={LIQUID_OPTIONS}
              value={isLiquid}
              onChange={setIsLiquid}
            />
            <p className="mt-1.5 text-2xs text-fg-muted">
              {isLiquid === null
                ? `Đang để app suy từ loại tài khoản (${type === 'cash' || type === 'bank' || type === 'ic' || type === 'ewallet' ? 'coi là rút ngay được' : 'coi là phải bán/chờ'}). Tiền gửi CÓ KỲ HẠN là loại "Ngân hàng" nên sẽ bị đếm sai — hãy chọn "Không".`
                : isLiquid
                  ? 'Tính vào quỹ dự phòng và khả năng trả nợ ngắn hạn.'
                  : 'KHÔNG tính vào quỹ dự phòng, cũng không vào khả năng trả nợ ngắn hạn.'}
            </p>
          </div>
        )}

        <span className="mb-1 block text-sm font-medium text-fg-muted">
          {isCard ? 'Số nợ ban đầu' : 'Số dư ban đầu'}
        </span>
        <div className="mb-2">
          <MoneyField
            value={balanceMagnitude}
            onChange={setBalanceMagnitude}
            currency={currency}
            ariaLabel={isCard ? 'Số nợ ban đầu' : 'Số dư ban đầu'}
            className="w-full rounded-lg border border-border-strong px-3 py-2 text-right text-lg font-semibold"
          />
        </div>
        {isCard && (
          <Guide className="mb-2 text-sm text-fg-muted">
            Số nợ tại thời điểm bắt đầu ghi sổ (để 0 nếu chưa nợ). Chi tiêu bằng thẻ và trả
            thẻ ghi như giao dịch bình thường. Muốn khớp lại nợ hiện tại thì mở thẻ trong
            trang Tài sản và bấm “Điều chỉnh số nợ” — sửa ô này sẽ dịch cả lịch sử cũ.
          </Guide>
        )}
        {isInvestment && (
          <Guide className="mb-2 text-sm text-fg-muted">
            Nhập vốn gốc ban đầu (tiền đã bỏ vào). Sau khi tạo, vào trang tài khoản để
            “Cập nhật giá trị” theo giá thị trường — chênh lệch là lãi/lỗ chưa thực hiện.
          </Guide>
        )}

        {/* Tài khoản ưu đãi thuế Nhật — theo dõi hạn mức nạp mỗi năm */}
        {isInvestment && (
          <div className="mb-3 rounded-lg bg-surface-page p-2.5">
            <label htmlFor={`${uid}-shelter`} className="mb-1 block text-sm font-medium text-fg-muted">
              Ưu đãi thuế <span className="text-fg-muted">(không bắt buộc)</span>
            </label>
            <Select
              id={`${uid}-shelter`}
              value={taxShelter}
              onChange={(e) => {
                const next = e.target.value as TaxShelter | ''
                setTaxShelter(next)
                // Điền sẵn hạn mức pháp định để khỏi phải tra — vẫn sửa được
                if (next && shelterLimit === 0 && currency === 'JPY') {
                  setShelterLimit(SHELTER_DEFAULT_LIMIT_JPY[next])
                }
              }} wrapClassName="w-full">
              <option value="">Tài khoản thường</option>
              {TAX_SHELTER_LIST.map((s) => (
                <option key={s} value={s}>
                  {TAX_SHELTER_LABELS[s]}
                </option>
              ))}
            </Select>
            {taxShelter !== '' && (
              <>
                <span className="mb-1 mt-2 block text-sm font-medium text-fg-muted">
                  Hạn mức nạp mỗi năm
                </span>
                <MoneyField
                  value={shelterLimit}
                  onChange={setShelterLimit}
                  currency={currency}
                  autoOpen={false}
                  ariaLabel="Hạn mức nạp mỗi năm"
                  className="w-full rounded-lg border border-border-strong px-3 py-2 text-right text-sm"
                />
                <Guide className="mt-1 text-2xs text-fg-muted">
                  App đếm tiền bạn chuyển vào tài khoản này trong năm và cho biết còn bao nhiêu hạn
                  mức chưa dùng.
                </Guide>
              </>
            )}
          </div>
        )}

        {/* Tài sản cố định — khấu hao tuyến tính */}
        {isFixed && (
          <div className="mb-3 rounded-lg bg-surface-page p-2.5">
            <Guide className="mb-2 text-sm text-fg-muted">
              Nhập <b>giá mua</b> ở ô số tiền phía trên. App sẽ tự giảm dần giá trị theo thời gian.
              Bất cứ lúc nào bạn tự “Cập nhật giá trị” trong trang tài khoản thì con số nhập tay được
              ưu tiên.
            </Guide>
            <div className="grid grid-cols-2 gap-2">
              <div>
                {/* <span> chứ không <label>: ô ngày là <button>, tên đi qua ariaLabel. */}
                <span className="mb-1 block text-sm font-medium text-fg-muted">Ngày mua</span>
                <DateField
                  ariaLabel="Ngày mua"
                  value={depFrom}
                  onChange={setDepFrom}
                  className="w-full py-2"
                />
              </div>
              <div>
                <label htmlFor={`${uid}-depmonths`} className="mb-1 block text-sm font-medium text-fg-muted">
                  Khấu hao (tháng)
                </label>
                <input
                  id={`${uid}-depmonths`}
                  inputMode="numeric"
                  value={depMonths}
                  onChange={(e) => setDepMonths(e.target.value.replace(/\D/g, ''))}
                  placeholder="60"
                  className="w-full rounded-md border border-border-strong px-2 py-2 text-sm"
                />
              </div>
            </div>
            <span className="mb-1 mt-2 block text-sm font-medium text-fg-muted">
              Giá trị còn lại cuối vòng đời
            </span>
            <MoneyField
              value={salvage}
              onChange={setSalvage}
              currency={currency}
              autoOpen={false}
              ariaLabel="Giá trị còn lại cuối vòng đời"
              className="w-full rounded-lg border border-border-strong px-3 py-2 text-right text-sm"
            />
            <Guide className="mt-1 text-2xs text-fg-muted">
              Ví dụ xe 5 năm về 0: 60 tháng, còn lại 0. Xe vẫn bán được giá thì điền số bán ước tính.
              Bỏ trống ngày mua hoặc số tháng = không khấu hao tự động.
            </Guide>
          </div>
        )}

        {currencyChanged && hasActivity && (
          <p className="mb-2 rounded-lg bg-state-warn-bg text-state-warn-fg p-2 text-sm">
            Tài khoản đã có giao dịch. Đổi loại tiền không tự quy đổi số tiền các giao dịch cũ.
          </p>
        )}

        <div className="mt-3 flex items-center gap-2">
          {account && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={del.isPending}
              className="rounded-md px-3 py-2 text-sm font-medium text-state-bad-fg hover:bg-state-bad-bg disabled:opacity-50"
            >
              Xóa
            </button>
          )}
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 rounded-md px-3 py-2 text-sm text-fg-muted hover:bg-surface-sunken"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSave}
              className={actionButtonClass('primary')}
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
          checked ? 'bg-accent' : 'bg-gray-300'
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
