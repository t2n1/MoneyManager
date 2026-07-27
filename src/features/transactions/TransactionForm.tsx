import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Delete,
  HandCoins,
  type LucideIcon,
  Plus,
  Repeat,
  Send,
  Sparkles,
  Star,
  Users,
  X,
} from 'lucide-react'
import type { NewRecurringRule, NewTransaction } from '../../data'
import { toISODate } from '../../lib/dates'
import { promptDialog } from '../../lib/dialog'
import { formatMoney, parseMoney, type CurrencyCode } from '../../lib/money'
import type { RecurringFrequency } from '../../lib/recurring'
import type { DebtDirection, TransactionRow, TransactionType } from '../../types/database.types'
import {
  useAccounts,
  useCategories,
  useDebtPayments,
  useDebts,
  useTransactionTags,
} from '../../hooks/queries'
import { AccountPicker } from '../../components/AccountPicker'
import { TagPicker } from '../tags/TagPicker'
import { remainingOf } from '../debts/aggregate'
import type { DebtPerson } from './roleFields'
import { NumPad, type NumPadKey } from '../../components/NumPad'
import {
  appendKey,
  evalExpression,
  formatExpr,
  hasOperator,
  MAX_AMOUNT_DIGITS,
} from '../../lib/calc'
import { parseNl } from './parseNl'
import {
  addQuickTemplate,
  deleteQuickTemplate,
  useQuickTemplates,
  type QuickTemplate,
} from './quickTemplates'
import {
  type DebtValue,
  type EntryRole,
  initialDebt,
  initialRemit,
  initialSplit,
  type RemitValue,
  roleAmountLabel,
  roleHidesCategoryGrid,
  roleTxType,
  SERVICES,
  type SpecialRole,
  type SplitValue,
} from './entryRoles'
import { DebtFields, RemitFields, SplitFields } from './roleFields'
import type { RoleBase } from './roleSave'

const LAST_ACCOUNT_KEY = 'sct-last-account'
const lastCategoryKey = (type: TransactionType) => `sct-last-category-${type}`

/** id danh mục lần trước của loại `type`, chỉ trả khi còn hợp lệ (không lưu trữ). */
function lastCategoryFor(
  type: TransactionType,
  categories: { id: string; type: TransactionType; is_archived: boolean }[],
): string | null {
  const id = localStorage.getItem(lastCategoryKey(type))
  if (!id) return null
  const c = categories.find((x) => x.id === id)
  return c && c.type === type && !c.is_archived ? id : null
}

const TYPE_TABS: { value: TransactionType; label: string }[] = [
  { value: 'expense', label: 'Chi' },
  { value: 'income', label: 'Thu' },
  { value: 'transfer', label: 'Chuyển khoản' },
]

const AMOUNT_COLOR: Record<TransactionType, string> = {
  expense: 'text-red-600 dark:text-red-400',
  income: 'text-green-600 dark:text-green-400',
  transfer: 'text-gray-600 dark:text-gray-300',
}

/** Ô tiền mà NumPad mobile đang nhắm tới: ô chính, ô "nhận được" (CK xuyên tệ),
 *  hoặc các ô tiền phụ của vai trò đặc biệt (trả hộ / gửi về VN). */
type AmountTarget = 'main' | 'to' | 'split.others' | 'remit.fee' | 'remit.received'

/** Vai trò đặc biệt: nhãn + icon + màu banner. */
const ROLE_ORDER: SpecialRole[] = ['split', 'debt', 'remit']
const ROLE_META: Record<SpecialRole, { label: string; Icon: LucideIcon; banner: string }> = {
  split: {
    label: 'Trả hộ / chia bill',
    Icon: Users,
    banner:
      'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300',
  },
  debt: {
    label: 'Cho vay / Ghi nợ',
    Icon: HandCoins,
    banner:
      'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
  },
  remit: {
    label: 'Gửi về VN',
    Icon: Send,
    banner:
      'border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/40 dark:text-green-300',
  },
}

/** Payload gửi lên EntryPage khi lưu một vai trò đặc biệt. */
export type RoleSubmit =
  | { role: 'split'; base: RoleBase; value: SplitValue }
  | { role: 'debt'; base: RoleBase; value: DebtValue }
  | { role: 'remit'; base: RoleBase; value: RemitValue }

// Nút "Lặp lại" gọn: chip hiện chu kỳ ngắn; menu bấm ra hiện nhãn đầy đủ
const REPEAT_OPTIONS: ('none' | RecurringFrequency)[] = ['none', 'weekly', 'monthly', 'yearly']
const REPEAT_LABEL: Record<'none' | RecurringFrequency, string> = {
  none: 'Không lặp',
  weekly: 'Tuần',
  monthly: 'Tháng',
  yearly: 'Năm',
}
const REPEAT_MENU_LABEL: Record<'none' | RecurringFrequency, string> = {
  none: 'Không lặp',
  weekly: 'Hàng tuần',
  monthly: 'Hàng tháng',
  yearly: 'Hàng năm',
}

/** Áp một phím NumPad vào một số tiền (minor units) — cho ô tiền phụ của vai trò.
 *  Đi qua chuỗi chữ số rồi tính lại; phím phép tính hầu như thành vô hại. */
function applyNumKey(current: number, key: NumPadKey): number {
  const next = appendKey(current === 0 ? '' : String(current), key)
  return evalExpression(next) ?? current
}

interface TransactionFormProps {
  /** Có giá trị = form sửa; không = form nhập mới */
  initial?: TransactionRow
  /** Nhãn nút lưu chính (lưu rồi rời màn hình) */
  submitLabel: string
  onSubmit: (values: NewTransaction) => Promise<void>
  /**
   * Nút phụ "lưu rồi nhập tiếp": có mặt → hiện nút thứ hai, lưu xong tự xóa
   * số tiền + ghi chú để nhập giao dịch kế tiếp mà không rời màn hình.
   */
  continueLabel?: string
  onContinue?: (values: NewTransaction) => Promise<void>
  /** Loại khởi tạo khi mở mới (vd từ lối tắt PWA) — bỏ qua nếu có `initial`. */
  initialType?: TransactionType
  /**
   * Màn Nhập: cho phép "Lặp lại". Khi người dùng chọn chu kỳ, submit gọi hàm
   * này (tạo rule + catch-up sinh kỳ đầu) thay vì onSubmit. Không truyền
   * (form sửa) → không hiện selector.
   */
  onSubmitRecurring?: (rule: NewRecurringRule) => Promise<void>
  /** Hiện tùy chọn "Không tính vào thống kê" (mục AM) — dùng ở màn sửa, ẩn ở màn nhập nhanh. */
  showExcludeOption?: boolean
  /** Hiện ô "nhập nhanh bằng lời" (chỉ màn nhập mới). Gõ câu → tự điền các trường. */
  enableNlInput?: boolean
  /** Hiện hàng mẫu giao dịch nhanh (mục J) — chỉ màn nhập mới. */
  enableTemplates?: boolean
  /** Cho phép các "vai trò đặc biệt" (Trả hộ / Cho vay-Nợ / Gửi về VN) ngay trong form. */
  enableRoles?: boolean
  /** Vai trò mở sẵn (từ deep-link ?role=). Bỏ qua nếu !enableRoles. */
  initialRole?: EntryRole
  /** Lưu một vai trò đặc biệt (thay onSubmit). Bắt buộc khi enableRoles. */
  onSubmitRole?: (payload: RoleSubmit) => Promise<void>
}

export function TransactionForm({
  initial,
  submitLabel,
  onSubmit,
  continueLabel,
  onContinue,
  initialType,
  onSubmitRecurring,
  showExcludeOption,
  enableNlInput,
  enableTemplates,
  enableRoles,
  initialRole,
  onSubmitRole,
}: TransactionFormProps) {
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()
  const templates = useQuickTemplates()

  const [type, setType] = useState<TransactionType>(initial?.type ?? initialType ?? 'expense')
  const [digits, setDigits] = useState(initial ? String(initial.amount) : '')
  const [toDigits, setToDigits] = useState(initial?.to_amount ? String(initial.to_amount) : '')
  /** Mobile: numpad đang gõ vào ô tiền nào (ô chính, "nhận được", hoặc ô phụ của vai trò) */
  const [activeField, setActiveField] = useState<AmountTarget>('main')
  const [categoryId, setCategoryId] = useState<string | null>(
    initial?.category_id ?? lastCategoryFor(initial?.type ?? initialType ?? 'expense', categories),
  )
  const [accountId, setAccountId] = useState<string | null>(
    initial?.account_id ?? localStorage.getItem(LAST_ACCOUNT_KEY),
  )
  const [toAccountId, setToAccountId] = useState<string | null>(initial?.to_account_id ?? null)
  const [date, setDate] = useState(initial?.occurred_on ?? toISODate(new Date()))
  const [note, setNote] = useState(initial?.note ?? '')
  const [excludeFromStats, setExcludeFromStats] = useState(initial?.exclude_from_stats ?? false)
  // Hoàn tiền: giao dịch CHI mang dấu âm — tiền về ví nhưng không phải thu nhập
  const [isRefund, setIsRefund] = useState(initial?.is_refund ?? false)
  // Nhãn: form sửa nạp sẵn nhãn hiện có của giao dịch
  const { data: allLinks = [] } = useTransactionTags()
  const initialTagIds = useMemo(
    () =>
      initial ? allLinks.filter((l) => l.transaction_id === initial.id).map((l) => l.tag_id) : [],
    [allLinks, initial],
  )
  const [tagIds, setTagIds] = useState<string[] | null>(null)
  // null = chưa người dùng đụng vào → dùng nhãn sẵn có của giao dịch đang sửa
  const effectiveTagIds = tagIds ?? initialTagIds
  // Lặp lại (chỉ form nhập mới): 'none' = không lặp, còn lại là chu kỳ
  const [repeat, setRepeat] = useState<'none' | RecurringFrequency>('none')
  const [repeatOpen, setRepeatOpen] = useState(false)
  // Nút đang lưu: 'save' | 'continue' | null — để khóa cả hai nút và hiện "Đang lưu…"
  const [pending, setPending] = useState<'save' | 'continue' | null>(null)
  const saving = pending !== null
  const [error, setError] = useState<string | null>(null)
  // Nhập nhanh bằng lời: câu đang gõ + tóm tắt những gì vừa nhận diện
  const [nlText, setNlText] = useState('')
  const [nlHint, setNlHint] = useState<string | null>(null)
  // Picker danh mục con: đang mở nhóm cha nào (null = màn danh mục chính)
  const [drillId, setDrillId] = useState<string | null>(() => {
    const cid = initial?.category_id ?? lastCategoryFor(initial?.type ?? initialType ?? 'expense', categories)
    return categories.find((c) => c.id === cid)?.parent_id ?? null
  })

  // Vai trò đặc biệt (chỉ khi enableRoles): 'none' = giao dịch thường
  const [role, setRole] = useState<EntryRole>(
    enableRoles && initialRole ? initialRole : 'none',
  )
  const [roleMenu, setRoleMenu] = useState(false)
  const [splitVal, setSplitVal] = useState<SplitValue>(initialSplit)
  const [debtVal, setDebtVal] = useState<DebtValue>(initialDebt)
  const [remitVal, setRemitVal] = useState<RemitValue>(initialRemit)
  const activeRole: EntryRole = enableRoles ? role : 'none'

  // Người đã cho vay/nợ (khoản đang mở) — nguồn để gợi ý cộng dồn.
  const { data: allDebts = [] } = useDebts()
  const { data: allDebtPayments = [] } = useDebtPayments()

  // Điền sẵn danh mục lần trước khi categories tải xong (form mới, chưa chọn gì)
  useEffect(() => {
    if (initial || categoryId !== null || type === 'transfer') return
    const last = lastCategoryFor(type, categories)
    if (last) setCategoryId(last)
  }, [categories, type, initial, categoryId])

  // Đóng menu "Lặp lại" / menu vai trò khi bấm Esc
  useEffect(() => {
    if (!repeatOpen && !roleMenu) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setRepeatOpen(false)
        setRoleMenu(false)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [repeatOpen, roleMenu])

  // Deep-link ?role=: đồng bộ loại giao dịch theo vai trò mở sẵn (chỉ khi mount)
  useEffect(() => {
    if (activeRole !== 'none') setTypeAndCat(roleTxType(activeRole, debtVal))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Tài khoản chọn được: đang hoạt động + tài khoản của GD đang sửa (kể cả đã
  // lưu trữ) — nếu không, form sửa sẽ âm thầm gán GD sang tài khoản khác.
  const activeAccounts = useMemo(() => {
    const list = accounts.filter((a) => !a.is_archived)
    for (const id of [initial?.account_id, initial?.to_account_id]) {
      if (id && !list.some((a) => a.id === id)) {
        const archived = accounts.find((a) => a.id === id)
        if (archived) list.push(archived)
      }
    }
    return list
  }, [accounts, initial])
  // Gửi về VN: nguồn chỉ được là tài khoản JPY (không phải thẻ); đích là TK VND.
  const pickerAccounts = useMemo(
    () =>
      activeRole === 'remit'
        ? activeAccounts.filter((a) => a.currency === 'JPY' && a.type !== 'card')
        : activeAccounts,
    [activeAccounts, activeRole],
  )
  const vndAccounts = useMemo(
    () => activeAccounts.filter((a) => a.currency === 'VND' && a.type !== 'card'),
    [activeAccounts],
  )
  const activeOfType = useMemo(
    () => categories.filter((c) => c.type === type && !c.is_archived),
    [categories, type],
  )
  const topCategories = useMemo(() => activeOfType.filter((c) => !c.parent_id), [activeOfType])
  const childrenOf = (id: string) => activeOfType.filter((c) => c.parent_id === id)
  const selectedCat = categories.find((c) => c.id === categoryId) ?? null
  const drillParent = drillId ? topCategories.find((c) => c.id === drillId) ?? null : null
  const drillChildren = drillParent ? childrenOf(drillParent.id) : []

  // Tài khoản mặc định = dùng lần trước, fallback tài khoản đầu tiên (trong danh sách hợp lệ)
  const effectiveAccountId =
    accountId && pickerAccounts.some((a) => a.id === accountId)
      ? accountId
      : (pickerAccounts[0]?.id ?? null)

  const srcCurrency = activeAccounts.find((a) => a.id === effectiveAccountId)?.currency ?? 'JPY'
  const dstCurrency = activeAccounts.find((a) => a.id === toAccountId)?.currency ?? srcCurrency
  const crossCurrency = type === 'transfer' && !!toAccountId && dstCurrency !== srcCurrency
  // Có nhiều ô tiền cùng nhận NumPad (CK xuyên tệ, hoặc vai trò có ô tiền phụ)
  // → hiện viền ô đang chọn để biết numpad gõ vào đâu.
  const multiAmount = crossCurrency || activeRole === 'split' || activeRole === 'remit'

  // Gợi ý cộng dồn: khoản đang mở cùng chiều + cùng loại tiền với tài khoản đang chọn
  // (khác loại tiền không cộng dồn được nên không đưa vào danh sách).
  const peopleFor = useCallback(
    (direction: DebtDirection): DebtPerson[] =>
      allDebts
        .filter(
          (d) =>
            d.status === 'open' &&
            d.direction === direction &&
            d.currency === srcCurrency &&
            d.counterparty.trim().length > 0,
        )
        .map((d) => ({
          id: d.id,
          name: d.counterparty,
          currency: d.currency,
          remaining: Math.max(remainingOf(d, allDebtPayments), 0),
        })),
    [allDebts, allDebtPayments, srcCurrency],
  )
  const debtPeople = useMemo<DebtPerson[]>(
    () => (enableRoles ? peopleFor(debtVal.direction) : []),
    [enableRoles, peopleFor, debtVal.direction],
  )
  // Trả hộ luôn tạo khoản "người khác nợ mình" (owed_to_me) → gợi ý cộng dồn.
  const splitPeople = useMemo<DebtPerson[]>(
    () => (enableRoles ? peopleFor('owed_to_me') : []),
    [enableRoles, peopleFor],
  )

  // Ghi nợ: có đủ tài khoản + danh mục để tạo giao dịch giải ngân thật không
  const canRecordReal = !!effectiveAccountId && activeOfType.length > 0
  // Vai trò tự khóa danh mục (remit / ghi sổ nợ) → ẩn lưới danh mục
  const hideCategoryGrid = roleHidesCategoryGrid(activeRole, debtVal)

  /** Phân tích câu nhập nhanh rồi điền sẵn các trường (người dùng vẫn xác nhận trước khi Lưu). */
  function applyNl() {
    const text = nlText.trim()
    if (!text) return
    const r = parseNl({
      text,
      categories: categories.filter((c) => !c.is_archived),
      currency: srcCurrency,
      todayISO: toISODate(new Date()),
    })
    if (r.type && r.type !== 'transfer') setType(r.type)
    if (r.amountMinor != null) setDigits(String(r.amountMinor))
    if (r.categoryId) {
      setCategoryId(r.categoryId)
      setDrillId(categories.find((c) => c.id === r.categoryId)?.parent_id ?? null)
    }
    if (r.dateISO) setDate(r.dateISO)
    if (r.note) setNote(r.note)

    // Tóm tắt cho người dùng đối chiếu; cảnh báo nếu thiếu số tiền / danh mục
    const parts: string[] = []
    if (r.amountMinor != null) parts.push(formatMoney(r.amountMinor, srcCurrency))
    if (r.matchedCategoryName) parts.push(r.matchedCategoryName)
    if (r.dateISO) parts.push(r.dateISO.slice(5).replace('-', '/'))
    const missing: string[] = []
    if (r.amountMinor == null) missing.push('số tiền')
    if (!r.categoryId) missing.push('danh mục')
    setNlHint(
      (parts.length ? `Đã điền: ${parts.join(' · ')}` : 'Chưa nhận ra thông tin') +
        (missing.length ? ` — thiếu ${missing.join(', ')}, kiểm tra lại` : ''),
    )
    setNlText('')
  }

  /** Áp một mẫu nhanh vào form (người dùng vẫn bấm Lưu để ghi). */
  function applyTemplate(t: QuickTemplate) {
    setType(t.type)
    setDigits(t.amountMinor > 0 ? String(t.amountMinor) : '')
    if (t.categoryId) {
      setCategoryId(t.categoryId)
      setDrillId(categories.find((c) => c.id === t.categoryId)?.parent_id ?? null)
    }
    if (t.accountId) setAccountId(t.accountId)
    setNote(t.note)
    setToAccountId(null)
    setActiveField('main')
  }

  const amountResult = evalExpression(digits)
  const amount = amountResult ?? 0
  const toAmountResult = evalExpression(toDigits)
  const toAmount = toAmountResult ?? 0

  const hasCategory = !!categoryId && activeOfType.some((c) => c.id === categoryId)
  // Điều kiện riêng theo vai trò (số tiền gốc > 0 + tài khoản đã kiểm ở ngoài)
  const roleValid = (() => {
    switch (activeRole) {
      case 'split':
        return (
          splitVal.others > 0 &&
          splitVal.others <= amount &&
          splitVal.counterparty.trim().length > 0 &&
          hasCategory
        )
      case 'debt':
        return (
          debtVal.counterparty.trim().length > 0 &&
          (!(canRecordReal && debtVal.withTransaction) || hasCategory)
        )
      case 'remit':
        return remitVal.received > 0 && (remitVal.kind !== 'transfer' || !!remitVal.destId)
      default:
        return true
    }
  })()

  const canSave =
    amount > 0 &&
    !!effectiveAccountId &&
    !saving &&
    (activeRole !== 'none'
      ? roleValid
      : type === 'transfer'
        ? !!toAccountId && toAccountId !== effectiveAccountId && (!crossCurrency || toAmount > 0)
        : hasCategory)

  // Lưu mẫu: chỉ với chi/thu đã đủ số tiền + danh mục
  const canSaveTemplate = type !== 'transfer' && amount > 0 && !!categoryId
  async function saveCurrentAsTemplate() {
    if (!canSaveTemplate) return
    const suggested = selectedCat?.name ?? note.trim()
    const label = (
      await promptDialog({
        title: 'Đặt tên mẫu',
        placeholder: 'vd "Ăn trưa", "Vé tàu"',
        defaultValue: suggested,
        confirmLabel: 'Lưu mẫu',
      })
    )?.trim()
    if (!label) return
    addQuickTemplate({
      label,
      type,
      amountMinor: amount,
      categoryId,
      accountId: effectiveAccountId,
      note: note.trim(),
    })
  }

  /** Đổi loại giao dịch + điền lại danh mục lần trước của loại đó. */
  function setTypeAndCat(next: TransactionType) {
    setType(next)
    const last = lastCategoryFor(next, categories)
    setCategoryId(last)
    setDrillId(categories.find((c) => c.id === last)?.parent_id ?? null)
  }

  function switchType(next: TransactionType) {
    setTypeAndCat(next)
    setToAccountId(null)
    setToDigits('')
    setActiveField('main')
  }

  /** Bật một vai trò đặc biệt: khởi tạo field riêng + set loại theo vai trò. */
  function enterRole(r: SpecialRole) {
    setRole(r)
    setRoleMenu(false)
    const nextDebt = initialDebt()
    if (r === 'split') setSplitVal(initialSplit())
    if (r === 'debt') setDebtVal(nextDebt)
    if (r === 'remit') setRemitVal(initialRemit())
    setTypeAndCat(roleTxType(r, nextDebt))
    setToAccountId(null)
    setToDigits('')
    setActiveField('main')
  }

  /** Bỏ vai trò, quay lại giao dịch thường (Chi). */
  function exitRole() {
    setRole('none')
    setRoleMenu(false)
    setTypeAndCat('expense')
    setActiveField('main') // tránh numpad còn nhắm ô tiền của vai trò vừa bỏ
  }

  /** Đổi chiều nợ (Mình nợ ↔ Cho vay) → đổi luôn loại giao dịch (thu ↔ chi). */
  function setDebtDirection(dir: DebtDirection) {
    // Đổi chiều → bỏ chọn người cũ (danh sách gợi ý theo chiều nên có thể không còn hợp lệ).
    const next = { ...debtVal, direction: dir, existingDebtId: null }
    setDebtVal(next)
    setTypeAndCat(roleTxType('debt', next))
  }

  function onNumPadKey(key: NumPadKey) {
    // Vai trò có ô tiền phụ: numpad gõ thẳng vào số của ô đang chọn
    if (activeField === 'split.others') {
      setSplitVal((v) => ({ ...v, others: applyNumKey(v.others, key) }))
      return
    }
    if (activeField === 'remit.fee') {
      setRemitVal((v) => ({ ...v, fee: applyNumKey(v.fee, key) }))
      return
    }
    if (activeField === 'remit.received') {
      setRemitVal((v) => ({ ...v, received: applyNumKey(v.received, key) }))
      return
    }
    const setter = activeField === 'to' && crossCurrency ? setToDigits : setDigits
    setter((d) => appendKey(d, key))
  }

  async function handleSubmit(mode: 'save' | 'continue' = 'save') {
    if (!canSave || !effectiveAccountId) return

    // Vai trò đặc biệt: dựng field gốc dùng chung rồi để EntryPage chạy orchestrator lưu
    if (activeRole !== 'none' && onSubmitRole) {
      setPending('save')
      setError(null)
      try {
        const base: RoleBase = {
          amount,
          accountId: effectiveAccountId,
          categoryId,
          srcCurrency,
          occurredOn: date,
          note,
        }
        if (activeRole === 'split') await onSubmitRole({ role: 'split', base, value: splitVal })
        else if (activeRole === 'debt') await onSubmitRole({ role: 'debt', base, value: debtVal })
        else await onSubmitRole({ role: 'remit', base, value: remitVal })
        localStorage.setItem(LAST_ACCOUNT_KEY, effectiveAccountId)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Lưu thất bại, thử lại.')
      } finally {
        setPending(null)
      }
      return
    }

    const keepGoing = mode === 'continue' && !!onContinue
    setPending(mode)
    setError(null)
    try {
      const values: NewTransaction = {
        type,
        amount,
        to_amount: crossCurrency ? toAmount : null,
        category_id: type === 'transfer' ? null : categoryId,
        account_id: effectiveAccountId,
        to_account_id: type === 'transfer' ? toAccountId : null,
        occurred_on: date,
        note: note.trim(),
        exclude_from_stats: type === 'transfer' ? false : excludeFromStats,
        is_refund: type === 'expense' ? isRefund : false,
        tag_ids: effectiveTagIds,
      }
      if (repeat !== 'none' && onSubmitRecurring) {
        // Lặp lại: tạo rule (kỳ đầu do engine catch-up sinh, không tạo GD riêng)
        await onSubmitRecurring({
          type,
          amount,
          to_amount: crossCurrency ? toAmount : null,
          category_id: type === 'transfer' ? null : categoryId,
          account_id: effectiveAccountId,
          to_account_id: type === 'transfer' ? toAccountId : null,
          note: note.trim(),
          frequency: repeat,
          start_on: date,
          end_on: null,
        })
      } else {
        await (keepGoing ? onContinue!(values) : onSubmit(values))
      }
      localStorage.setItem(LAST_ACCOUNT_KEY, effectiveAccountId)
      if (type !== 'transfer' && categoryId) {
        localStorage.setItem(lastCategoryKey(type), categoryId)
      }
      if (keepGoing) {
        // Nhập liên tục: giữ danh mục + tài khoản + ngày, chỉ xóa số tiền + ghi chú
        setDigits('')
        setToDigits('')
        setNote('')
        setToAccountId(null)
        setActiveField('main')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lưu thất bại, thử lại.')
    } finally {
      setPending(null)
    }
  }

  /** Ô số tiền: div hiển thị trên mobile (numpad gõ), input trên desktop */
  const amountBox = (
    field: 'main' | 'to',
    expr: string,
    currency: CurrencyCode,
    setDigitsFn: (v: string) => void,
    label?: string,
  ) => {
    const isActive = multiAmount && activeField === field
    const ring = isActive ? 'ring-2 ring-green-500' : ''
    const result = evalExpression(expr)
    const showExpr = hasOperator(expr)
    const mobileText = showExpr ? formatExpr(expr, currency) : formatMoney(result ?? 0, currency)
    const inputValue = result && result !== 0 ? formatMoney(result, currency) : ''
    // Chưa nhập gì (0 và không có phép tính) → làm mờ như gợi ý, tránh nhầm là đã có số
    const isEmpty = !showExpr && (result ?? 0) === 0
    return (
      <div className="flex flex-col gap-0.5">
        {label && <span className="px-1 text-xs text-gray-500 dark:text-gray-400">{label}</span>}
        <button
          type="button"
          onClick={() => setActiveField(field)}
          aria-label={`${label ?? 'Số tiền'}: ${mobileText}`}
          className={`truncate rounded-xl bg-white dark:bg-gray-900 px-4 py-2.5 text-right font-bold shadow-sm ${
            showExpr ? 'text-xl' : 'text-3xl'
          } ${isEmpty ? 'text-gray-300 dark:text-gray-600' : AMOUNT_COLOR[type]} ${ring} lg:hidden`}
        >
          {mobileText}
        </button>
        {showExpr && result !== null && (
          <span className="px-1 text-right text-sm text-gray-500 dark:text-gray-400 lg:hidden">
            = {formatMoney(result, currency)}
          </span>
        )}
        <input
          inputMode="numeric"
          value={inputValue}
          onChange={(e) => {
            const parsed = String(parseMoney(e.target.value))
            setDigitsFn(parsed === '0' ? '' : parsed.slice(0, MAX_AMOUNT_DIGITS))
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit()
          }}
          placeholder={formatMoney(0, currency)}
          className={`hidden rounded-xl bg-white dark:bg-gray-900 px-4 py-3 text-right text-3xl font-bold shadow-sm outline-green-500 lg:block ${AMOUNT_COLOR[type]}`}
        />
      </div>
    )
  }

  const roleMeta = activeRole === 'none' ? null : ROLE_META[activeRole]

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Vùng cuộn: mọi nội dung nhập. Đáy (NumPad + nút Lưu) được ghim riêng bên
          dưới nên không bao giờ bị đẩy khuất — kể cả khi vai trò đặc biệt thêm field. */}
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
      {/* Nhập nhanh bằng lời: gõ "hôm qua trưa 850 yên" → tự điền các trường bên dưới */}
      {enableNlInput && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 rounded-xl border border-green-300 bg-green-50 px-2.5 py-1.5 focus-within:ring-2 focus-within:ring-green-500 dark:border-green-800 dark:bg-green-900/20">
            <Sparkles className="h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />
            <input
              value={nlText}
              onChange={(e) => setNlText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  applyNl()
                }
              }}
              placeholder='Gõ nhanh, vd "hôm qua trưa 850 yên"'
              className="min-w-0 flex-1 bg-transparent text-sm text-gray-800 placeholder:text-gray-500 focus:outline-none dark:text-gray-100 dark:placeholder:text-gray-400"
              aria-label="Nhập nhanh bằng lời"
            />
            <button
              type="button"
              onClick={applyNl}
              disabled={!nlText.trim()}
              className="shrink-0 rounded-lg bg-green-600 px-2.5 py-1 text-xs font-semibold text-white active:scale-95 disabled:opacity-40"
            >
              Điền
            </button>
          </div>
          {nlHint && <p className="px-1 text-xs text-gray-500 dark:text-gray-400">{nlHint}</p>}
        </div>
      )}

      {/* Mẫu giao dịch nhanh (mục J): 1 chạm điền sẵn, hoặc lưu form hiện tại thành mẫu */}
      {enableTemplates && (templates.length > 0 || canSaveTemplate) && (
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {templates.map((t) => {
            const cur =
              accounts.find((a) => a.id === t.accountId)?.currency ?? srcCurrency
            return (
              <span key={t.id} className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => applyTemplate(t)}
                  className="flex items-center gap-1 rounded-full bg-white dark:bg-gray-900 py-1.5 pl-3 pr-6 text-xs font-medium text-gray-700 dark:text-gray-200 shadow-sm active:scale-95"
                >
                  <Star className="h-3 w-3 text-amber-400" fill="currentColor" />
                  <span className="max-w-[9rem] truncate">{t.label}</span>
                  <span className="text-gray-500 dark:text-gray-400">
                    {formatMoney(t.amountMinor, cur)}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => deleteQuickTemplate(t.id)}
                  aria-label={`Xóa mẫu ${t.label}`}
                  className="absolute right-0.5 top-1/2 -translate-y-1/2 rounded-full p-2 text-gray-300 hover:text-red-500 dark:text-gray-600"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )
          })}
          {canSaveTemplate && (
            <button
              type="button"
              onClick={saveCurrentAsTemplate}
              className="flex shrink-0 items-center gap-1 rounded-full border border-dashed border-gray-300 dark:border-gray-600 px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 active:scale-95"
            >
              <Star className="h-3 w-3" /> Lưu mẫu
            </button>
          )}
        </div>
      )}

      {/* Vai trò đặc biệt: nút gọn (ẩn 95% ca thường) hoặc banner khi đang bật */}
      {enableRoles &&
        (roleMeta ? (
          <div
            className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${roleMeta.banner}`}
          >
            <roleMeta.Icon className="h-4 w-4 shrink-0" aria-hidden />
            <span className="flex-1 text-sm font-semibold">{roleMeta.label}</span>
            <button
              type="button"
              onClick={exitRole}
              aria-label="Bỏ vai trò, quay lại giao dịch thường"
              className="flex items-center gap-1 rounded-lg bg-white/70 px-2 py-1 text-xs font-medium active:scale-95 dark:bg-gray-900/50"
            >
              <X className="h-3.5 w-3.5" aria-hidden /> Bỏ
            </button>
          </div>
        ) : (
          <div className="relative flex justify-end">
            <button
              type="button"
              onClick={() => setRoleMenu((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={roleMenu}
              style={{ touchAction: 'manipulation' }}
              className="flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm font-medium text-gray-600 shadow-sm active:scale-95 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
            >
              <Plus className="h-4 w-4" aria-hidden /> Loại đặc biệt
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${roleMenu ? 'rotate-180' : ''}`}
                aria-hidden
              />
            </button>
            {roleMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setRoleMenu(false)} aria-hidden />
                <div
                  role="menu"
                  className="absolute right-0 top-full z-50 mt-1 w-52 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900"
                >
                  {ROLE_ORDER.map((r) => {
                    const m = ROLE_META[r]
                    return (
                      <button
                        key={r}
                        type="button"
                        role="menuitem"
                        onClick={() => enterRole(r)}
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
                      >
                        <m.Icon className="h-4 w-4 shrink-0" aria-hidden /> {m.label}
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        ))}

      {/* Tab loại giao dịch thường, hoặc segmented riêng của vai trò */}
      {activeRole === 'none' ? (
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-gray-200 dark:bg-gray-800 p-1">
          {TYPE_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => switchType(tab.value)}
              className={`rounded-lg py-2.5 text-sm font-medium transition ${
                type === tab.value ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      ) : activeRole === 'debt' ? (
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-gray-200 p-1 dark:bg-gray-800">
          {(
            [
              ['i_owe', 'Mình nợ'],
              ['owed_to_me', 'Cho vay'],
            ] as [DebtDirection, string][]
          ).map(([val, label]) => (
            <button
              key={val}
              type="button"
              onClick={() => setDebtDirection(val)}
              className={`rounded-lg py-2.5 text-sm font-medium transition ${
                debtVal.direction === val
                  ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-900 dark:text-gray-100'
                  : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      ) : activeRole === 'remit' ? (
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-gray-200 p-1 dark:bg-gray-800">
          {(
            [
              ['expense', 'Hỗ trợ gia đình'],
              ['transfer', 'Chuyển tài sản'],
            ] as [RemitValue['kind'], string][]
          ).map(([val, label]) => (
            <button
              key={val}
              type="button"
              onClick={() => setRemitVal({ ...remitVal, kind: val, destId: '' })}
              className={`rounded-lg py-2.5 text-sm font-medium transition ${
                remitVal.kind === val
                  ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-900 dark:text-gray-100'
                  : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      {/* Số tiền (nguồn); CK xuyên tệ có thêm ô "nhận được" */}
      {amountBox(
        'main',
        digits,
        srcCurrency,
        setDigits,
        roleAmountLabel(activeRole) ?? (crossCurrency ? 'Chuyển đi' : undefined),
      )}
      {crossCurrency &&
        amountBox('to', toDigits, dstCurrency, setToDigits, `Nhận được (${dstCurrency})`)}

      {/* Tài khoản + ngày */}
      <div className="flex flex-wrap items-center gap-2">
        {type === 'transfer' ? (
          <>
            <AccountPicker
              accounts={activeAccounts}
              value={effectiveAccountId}
              onChange={setAccountId}
              excludeId={toAccountId}
              className="min-w-[7rem] flex-1"
            />
            <span className="shrink-0 text-gray-400 dark:text-gray-500">→</span>
            <AccountPicker
              accounts={activeAccounts}
              value={toAccountId}
              onChange={setToAccountId}
              excludeId={effectiveAccountId}
              className="min-w-[7rem] flex-1"
            />
          </>
        ) : (
          <AccountPicker
            accounts={pickerAccounts}
            value={effectiveAccountId}
            onChange={setAccountId}
            className="min-w-0 flex-1"
          />
        )}
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          aria-label="Ngày giao dịch"
          className="w-[7.5rem] shrink-0 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1.5 text-sm text-gray-700 dark:text-gray-300"
        />
        {!initial && onSubmitRecurring && activeRole === 'none' && (
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setRepeatOpen((o) => !o)}
              aria-haspopup="listbox"
              aria-expanded={repeatOpen}
              aria-label={`Lặp lại: ${REPEAT_MENU_LABEL[repeat]}`}
              className={`flex items-center gap-1 rounded-lg border px-2 py-1.5 text-sm transition active:scale-95 ${
                repeat === 'none'
                  ? 'border-gray-300 bg-white text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400'
                  : 'border-green-500 bg-green-50 text-green-700 dark:border-green-700 dark:bg-green-900/30 dark:text-green-400'
              }`}
            >
              <Repeat className="h-4 w-4 shrink-0" />
              {repeat !== 'none' && <span>{REPEAT_LABEL[repeat]}</span>}
              <ChevronDown
                className={`h-3.5 w-3.5 shrink-0 transition-transform ${repeatOpen ? 'rotate-180' : ''}`}
                aria-hidden
              />
            </button>
            {repeatOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setRepeatOpen(false)}
                  aria-hidden
                />
                <div
                  role="listbox"
                  className="absolute right-0 z-50 mt-1 w-36 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900"
                >
                  {REPEAT_OPTIONS.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      role="option"
                      aria-selected={repeat === opt}
                      onClick={() => {
                        setRepeat(opt)
                        setRepeatOpen(false)
                      }}
                      className={`flex w-full items-center px-3 py-2 text-left text-sm ${
                        repeat === opt
                          ? 'bg-green-50 font-medium text-green-700 dark:bg-green-900/20 dark:text-green-300'
                          : 'text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800'
                      }`}
                    >
                      {REPEAT_MENU_LABEL[opt]}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
      {/* Field riêng của vai trò (nếu có) — nằm ngay dưới số tiền/tài khoản */}
      {activeRole === 'remit' && pickerAccounts.length === 0 && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
          Chưa có tài khoản JPY. Hãy tạo một tài khoản JPY trước khi gửi tiền về VN.
        </p>
      )}
      {activeRole === 'split' && (
        <SplitFields
          value={splitVal}
          onChange={setSplitVal}
          total={amount}
          currency={srcCurrency}
          people={splitPeople}
          othersActive={activeField === 'split.others'}
          onFocusOthers={() => setActiveField('split.others')}
        />
      )}
      {activeRole === 'debt' && (
        <DebtFields
          value={debtVal}
          onChange={setDebtVal}
          canRecordReal={canRecordReal}
          people={debtPeople}
        />
      )}
      {activeRole === 'remit' && (
        <RemitFields
          value={remitVal}
          onChange={setRemitVal}
          sent={amount}
          vndAccounts={vndAccounts}
          services={SERVICES}
          feeActive={activeField === 'remit.fee'}
          receivedActive={activeField === 'remit.received'}
          onFocusFee={() => setActiveField('remit.fee')}
          onFocusReceived={() => setActiveField('remit.received')}
        />
      )}

      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSubmit()
        }}
        placeholder="Ghi chú (tùy chọn)"
        className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 outline-green-500"
      />

      {activeRole === 'none' && <TagPicker value={effectiveTagIds} onChange={setTagIds} />}

      {/* Hoàn tiền — chỉ có nghĩa với khoản CHI */}
      {type === 'expense' && activeRole === 'none' && (
        <label className="flex items-start gap-2 px-1 text-sm text-gray-600 dark:text-gray-300">
          <input
            type="checkbox"
            checked={isRefund}
            onChange={(e) => setIsRefund(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            Đây là khoản <b>hoàn tiền</b>
            <span className="block text-xs text-gray-500 dark:text-gray-400">
              Trả hàng, hủy vé, hoàn phí… Tiền quay lại ví và TRỪ vào chi của danh mục đã chọn, thay
              vì bị tính thành thu nhập.
            </span>
          </span>
        </label>
      )}

      {showExcludeOption && type !== 'transfer' && (
        <label className="flex items-center gap-2 px-1 text-sm text-gray-600 dark:text-gray-300">
          <input
            type="checkbox"
            checked={excludeFromStats}
            onChange={(e) => setExcludeFromStats(e.target.checked)}
          />
          Không tính vào thống kê (giao dịch nội bộ, ghi bù…)
        </label>
      )}

      {/* Danh mục (ẩn khi chuyển khoản hoặc vai trò tự khóa danh mục) */}
      {type !== 'transfer' &&
        !hideCategoryGrid &&
        (drillParent ? (
          /* Trong một nhóm cha → chọn danh mục con (bắt buộc) */
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              onClick={() => setDrillId(null)}
              className="flex items-center gap-1.5 self-start rounded-lg bg-white dark:bg-gray-900 px-2.5 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 shadow-sm active:scale-95"
            >
              <ChevronLeft className="h-4 w-4" /> <span className="text-base leading-none">{drillParent.icon}</span> {drillParent.name}
            </button>
            <div className="grid auto-rows-min grid-cols-4 gap-1.5 lg:grid-cols-5">
              {drillChildren.map((c) => (
                <CategoryTile
                  key={c.id}
                  icon={c.icon}
                  name={c.name}
                  selected={categoryId === c.id}
                  onClick={() => setCategoryId(c.id)}
                />
              ))}
              {drillChildren.length === 0 && (
                <p className="col-span-full py-4 text-center text-xs text-gray-500 dark:text-gray-400">
                  Nhóm này chưa có danh mục con
                </p>
              )}
            </div>
          </div>
        ) : (
          /* Màn danh mục chính */
          <div className="grid auto-rows-min grid-cols-4 gap-1.5 lg:grid-cols-5">
            {topCategories.map((c) => {
              const kids = childrenOf(c.id)
              const hasKids = kids.length > 0
              return (
                <CategoryTile
                  key={c.id}
                  icon={c.icon}
                  name={c.name}
                  // Cha có con: chọn selection đang nằm bên trong; cha không con: chọn trực tiếp
                  selected={hasKids ? selectedCat?.parent_id === c.id : categoryId === c.id}
                  hasChildren={hasKids}
                  onClick={() => (hasKids ? setDrillId(c.id) : setCategoryId(c.id))}
                />
              )
            })}
          </div>
        ))}
      </div>

      {/* Đáy ghim: NumPad + lỗi + nút Lưu — luôn hiển thị, không bị nội dung đẩy khuất. */}
      <div className="flex shrink-0 flex-col gap-1.5 pt-1.5">
      {/* NumPad chỉ trên mobile */}
      <div className="lg:hidden">
        <NumPad onKey={onNumPadKey} />
      </div>

      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {/* Hàng nút: ⌫ (chỉ mobile, thay cho hàng xóa lùi riêng) + Tiếp tục/Lưu */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onNumPadKey('⌫')}
          aria-label="Xóa"
          className="flex shrink-0 items-center justify-center rounded-xl bg-white dark:bg-gray-800 px-5 text-lg font-semibold text-gray-800 dark:text-gray-100 shadow-sm transition active:scale-95 active:bg-gray-200 lg:hidden"
        >
          <Delete className="h-5 w-5" />
        </button>
        {onContinue && repeat === 'none' && activeRole === 'none' ? (
          <>
            <button
              type="button"
              onClick={() => handleSubmit('continue')}
              disabled={!canSave}
              className="flex-1 rounded-xl border border-green-600 bg-white py-3 text-base font-semibold text-green-700 shadow-sm transition enabled:active:scale-95 enabled:hover:bg-green-50 disabled:opacity-40 dark:bg-gray-900 dark:text-green-400 dark:enabled:hover:bg-gray-800"
            >
              {pending === 'continue' ? 'Đang lưu…' : continueLabel}
            </button>
            <button
              type="button"
              onClick={() => handleSubmit('save')}
              disabled={!canSave}
              className="flex-1 rounded-xl bg-green-600 py-3 text-base font-semibold text-white shadow-sm transition enabled:active:scale-95 enabled:hover:bg-green-700 disabled:opacity-40"
            >
              {pending === 'save' ? 'Đang lưu…' : submitLabel}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => handleSubmit('save')}
            disabled={!canSave}
            className="flex-1 rounded-xl bg-green-600 py-3 text-base font-semibold text-white shadow-sm transition enabled:active:scale-95 enabled:hover:bg-green-700 disabled:opacity-40"
          >
            {saving ? 'Đang lưu…' : submitLabel}
          </button>
        )}
      </div>
      </div>
    </div>
  )
}

function CategoryTile({
  icon,
  name,
  selected,
  hasChildren,
  onClick,
}: {
  icon: string
  name: string
  selected: boolean
  hasChildren?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex flex-col items-center gap-0.5 rounded-xl border-2 bg-white dark:bg-gray-900 px-1 py-2 text-xs text-gray-700 dark:text-gray-300 transition active:scale-95 ${
        selected ? 'border-green-500 bg-green-50 dark:bg-green-900/30' : 'border-transparent shadow-sm'
      }`}
    >
      <span className="text-xl leading-none">{icon}</span>
      <span className="w-full truncate text-center">{name}</span>
      {hasChildren && (
        <span className="absolute top-1 right-1 text-gray-400 dark:text-gray-500">
          <ChevronRight className="h-3 w-3" />
        </span>
      )}
    </button>
  )
}
