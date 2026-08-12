import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Guide } from '../../components/Guide'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Delete,
  HandCoins,
  type LucideIcon,
  Bell,
  Repeat,
  Send,
  Star,
  Users,
  X,
} from 'lucide-react'
import type { NewPlannedExpense, NewRecurringRule, NewTransaction } from '../../data'
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
import { DateField } from '../../components/DateField'
import { CHIP_BASE, CHIP_OFF } from '../../components/chip'
import { Card, IconButton, SegmentedControl } from '../../components/ui'
import { TagPicker } from '../tags/TagPicker'
import { isAutoAssignedCategory, pickableCategories } from '../categories/flowCategories'
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
import { DebtFields, FeeField, RemitFields, SplitFields } from './roleFields'
import { entryGate, plannedModeActive } from './entryValidation'
import type { RoleBase } from './roleSave'

const LAST_ACCOUNT_KEY = 'sct-last-account'
const lastCategoryKey = (type: TransactionType) => `sct-last-category-${type}`

/**
 * id danh mục lần trước của loại `type`, chỉ trả khi còn hợp lệ (không lưu trữ,
 * không phải loại app tự gán — chọn tay từ trước lần sửa này vẫn còn trong
 * localStorage, điền lại sẽ chọn sẵn một danh mục lưới không còn bày ra).
 */
function lastCategoryFor(
  type: TransactionType,
  categories: { id: string; name: string; type: TransactionType; is_archived: boolean }[],
): string | null {
  const id = localStorage.getItem(lastCategoryKey(type))
  if (!id) return null
  const c = categories.find((x) => x.id === id)
  if (!c || c.type !== type || c.is_archived) return null
  return isAutoAssignedCategory(c) ? null : id
}

const TYPE_TABS: { value: TransactionType; label: string }[] = [
  { value: 'expense', label: 'Chi' },
  { value: 'income', label: 'Thu' },
  { value: 'transfer', label: 'Chuyển khoản' },
]

const DEBT_TABS = [
  { value: 'i_owe' as DebtDirection, label: 'Mình nợ' },
  { value: 'owed_to_me' as DebtDirection, label: 'Cho vay' },
]
const REMIT_TABS = [
  { value: 'expense' as RemitValue['kind'], label: 'Hỗ trợ gia đình' },
  { value: 'transfer' as RemitValue['kind'], label: 'Chuyển tài sản' },
]

const AMOUNT_COLOR: Record<TransactionType, string> = {
  expense: 'text-money-out',
  income: 'text-money-in',
  transfer: 'text-fg-secondary',
}

/** Ô tiền mà NumPad mobile đang nhắm tới: ô chính, ô "nhận được" (CK xuyên tệ),
 *  hoặc các ô tiền phụ của vai trò đặc biệt (trả hộ / gửi về VN). */
type AmountTarget =
  | 'main'
  | 'to'
  | 'split.others'
  | 'remit.fee'
  | 'remit.received'
  | 'debt.fee'
  | 'transfer.fee'

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
  /** Hiện hàng mẫu giao dịch nhanh (mục J) — chỉ màn nhập mới. */
  enableTemplates?: boolean
  /** Cho phép các "vai trò đặc biệt" (Trả hộ / Cho vay-Nợ / Gửi về VN) ngay trong form. */
  enableRoles?: boolean
  /** Vai trò mở sẵn (từ deep-link ?role=). Bỏ qua nếu !enableRoles. */
  initialRole?: EntryRole
  /**
   * Nơi render nút mở "Loại đặc biệt" — ô trống bên phải tiêu đề màn Nhập. Nút đi
   * portal ra ngoài form thay vì nhận qua prop `role`/`onRoleChange`: mọi logic bật
   * vai trò (khởi tạo field, đổi loại, kéo về đầu) ở lại một chỗ trong form.
   */
  roleTriggerSlot?: HTMLElement | null
  /** Lưu một vai trò đặc biệt (thay onSubmit). Bắt buộc khi enableRoles. */
  onSubmitRole?: (payload: RoleSubmit) => Promise<void>
  /**
   * Chuyển khoản có phí: lưu giao dịch chính + một giao dịch CHI riêng cho phí
   * (danh mục "Tài chính"). Không truyền → không hiện nút "+ Phí" ở chuyển khoản
   * (form sửa: phí đã là giao dịch riêng, sửa thẳng trên nó).
   */
  onSubmitWithFee?: (main: NewTransaction, fee: number, keepGoing: boolean) => Promise<void>
  /**
   * Nhãn chọn sẵn khi mở form. Dùng cho bản điền sẵn KHÔNG phải giao dịch thật: ghi
   * một khoản sắp chi thì `initial` là TransactionRow giả (id rỗng) nên không tra được
   * nhãn qua bảng liên kết giao dịch — nhãn phải truyền vào từ ngoài.
   */
  initialTagIds?: string[]
  /**
   * "Nhắc sau": KHÔNG ghi giao dịch, mà tạo một khoản sắp chi đến hạn vào đúng ngày
   * đang chọn (migration 0038). Dành cho việc mình biết sẽ phải chi mà chưa chi —
   * gõ y như đang nhập, chỉ khác cái nút. Không truyền → không hiện nút.
   */
  onSubmitPlanned?: (input: NewPlannedExpense) => Promise<void>
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
  enableTemplates,
  enableRoles,
  initialRole,
  roleTriggerSlot,
  onSubmitRole,
  onSubmitWithFee,
  onSubmitPlanned,
  initialTagIds: initialTagIdsProp,
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
    // `||` chứ không `??`: khoản sắp chi có thể chưa gán tài khoản, và bản điền sẵn
    // dựng từ nó mang account_id = ''. Chuỗi rỗng không phải một tài khoản — `??` giữ
    // nguyên nó và nút Lưu khoá vĩnh viễn mà không dòng nào nói vì sao.
    initial?.account_id || localStorage.getItem(LAST_ACCOUNT_KEY),
  )
  const [toAccountId, setToAccountId] = useState<string | null>(initial?.to_account_id ?? null)
  /** Chuyển khoản: phí (minor units theo tài khoản nguồn) → giao dịch chi riêng. */
  const [transferFee, setTransferFee] = useState(0)
  const [date, setDate] = useState(initial?.occurred_on ?? toISODate(new Date()))
  const [note, setNote] = useState(initial?.note ?? '')
  const [excludeFromStats, setExcludeFromStats] = useState(initial?.exclude_from_stats ?? false)
  // Hoàn tiền: giao dịch CHI mang dấu âm — tiền về ví nhưng không phải thu nhập
  const [isRefund, setIsRefund] = useState(initial?.is_refund ?? false)
  // Nhãn: form sửa nạp sẵn nhãn hiện có của giao dịch
  const { data: allLinks = [] } = useTransactionTags()
  const initialTagIds = useMemo(
    () =>
      initialTagIdsProp ??
      (initial ? allLinks.filter((l) => l.transaction_id === initial.id).map((l) => l.tag_id) : []),
    [allLinks, initial, initialTagIdsProp],
  )
  const [tagIds, setTagIds] = useState<string[] | null>(null)
  // null = chưa người dùng đụng vào → dùng nhãn sẵn có của giao dịch đang sửa
  const effectiveTagIds = tagIds ?? initialTagIds
  // Lặp lại (chỉ form nhập mới): 'none' = không lặp, còn lại là chu kỳ
  const [repeat, setRepeat] = useState<'none' | RecurringFrequency>('none')
  const [repeatOpen, setRepeatOpen] = useState(false)
  /** true = bấm lưu sẽ tạo KHOẢN SẮP CHI thay vì ghi giao dịch. */
  const [remindLater, setRemindLater] = useState(false)
  // Nút đang lưu: 'save' | 'continue' | null — để khóa cả hai nút và hiện "Đang lưu…"
  const [pending, setPending] = useState<'save' | 'continue' | null>(null)
  const saving = pending !== null
  const [error, setError] = useState<string | null>(null)
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
  /** Vùng cuộn của form — cần để kéo về đầu khi bật/bỏ vai trò đặc biệt. */
  const scrollRef = useRef<HTMLDivElement>(null)
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
  // Danh mục chọn tay: bỏ loại app tự gán (Cho vay, Điều chỉnh số dư, Gửi tiền
  // về VN…) vì đã có lối nhập riêng; vẫn giữ danh mục của GD đang sửa.
  const activeOfType = useMemo(
    () => pickableCategories(categories, type, initial?.category_id),
    [categories, type, initial?.category_id],
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
  /**
   * Ô "+ Phí" của chuyển khoản. Không cho khi đang đặt lịch lặp: rule chỉ sinh một
   * giao dịch, phí sẽ rơi mất — thà không hiện còn hơn nhận số rồi âm thầm bỏ.
   */
  const showTransferFee =
    type === 'transfer' && activeRole === 'none' && !!onSubmitWithFee && repeat === 'none'
  // Có nhiều ô tiền cùng nhận NumPad (CK xuyên tệ, hoặc vai trò có ô tiền phụ)
  // → hiện viền ô đang chọn để biết numpad gõ vào đâu.
  const multiAmount =
    crossCurrency || activeRole === 'split' || activeRole === 'remit' || activeRole === 'debt'

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
  // Trả hộ "còn nợ" tạo khoản "người khác nợ mình" (owed_to_me) → gợi ý cộng dồn.
  const splitPeople = useMemo<DebtPerson[]>(
    () => (enableRoles ? peopleFor('owed_to_me') : []),
    [enableRoles, peopleFor],
  )
  // Ví có thể nhận lại tiền khi Trả hộ đã được hoàn ngay: cùng loại tiền với tài
  // khoản đã trả (chuyển khoản xuyên tệ cần thêm số nhận — không đưa vào đây) và
  // khác chính nó (về đúng chỗ đã trả thì không cần bút toán nào).
  const splitBackAccounts = useMemo(
    () =>
      enableRoles
        ? activeAccounts.filter(
            (a) => !a.is_archived && a.currency === srcCurrency && a.id !== effectiveAccountId,
          )
        : [],
    [enableRoles, activeAccounts, srcCurrency, effectiveAccountId],
  )
  const srcAccountName = activeAccounts.find((a) => a.id === effectiveAccountId)?.name ?? ''

  // Ghi nợ: có tài khoản để tạo giao dịch giải ngân thật không (danh mục tự gán)
  const canRecordReal = !!effectiveAccountId
  // Vai trò tự khóa danh mục (remit / debt) → ẩn lưới danh mục
  const hideCategoryGrid = roleHidesCategoryGrid(activeRole)

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

  /**
   * "Nhắc sau" chỉ hiệu lực với khoản CHI thường — xem `plannedModeActive`. Đọc cờ thô
   * `remindLater` ở những chỗ dưới đây là đúng cái lỗi cũ: đổi sang tab Thu thì chip
   * biến mất mà nút vẫn ghi "Tạo lời nhắc", bấm vào tạo ra một khoản sắp CHI.
   */
  const plannedMode = plannedModeActive({
    remindLater,
    canPlan: !!onSubmitPlanned,
    type,
    role: activeRole,
  })

  // Một cổng duy nhất cho cả "được bấm Lưu chưa" và "còn thiếu gì" (entryValidation.ts)
  const gate = entryGate({
    amount,
    hasAccount: !!effectiveAccountId,
    type,
    role: activeRole,
    plannedMode,
    hasCategory,
    // Lưới rỗng ≠ chưa chọn: câu nhắc phải chỉ sang Cài đặt chứ không bảo "chọn ở lưới"
    // khi lưới không có ô nào.
    categoryGridEmpty: type !== 'transfer' && !hideCategoryGrid && activeOfType.length === 0,
    note,
    accountId: effectiveAccountId,
    toAccountId,
    crossCurrency,
    toAmount,
    split: splitVal,
    debt: debtVal,
    remit: remitVal,
    splitBackAccountIds: splitBackAccounts.map((a) => a.id),
  })
  const canSave = gate.canSave && !saving
  const missing = saving ? null : gate.missing

  /**
   * Đang ở chế độ mà nhãn + cờ "hoàn tiền" KHÔNG lưu được (quy tắc định kỳ / lời nhắc).
   * Câu chữ đặt ở biến chứ không viết thẳng vào JSX: nó đổi theo chế độ, và test canh
   * chế độ Gọn đếm chữ trong <p> sau khi bỏ các {biểu thức} nên chuỗi lồng sẽ bị tính
   * thành một đoạn văn xuôi mới.
   */
  const emptyGridNote =
    type === 'income'
      ? 'Chưa có danh mục Thu nào để chọn.'
      : 'Chưa có danh mục Chi nào để chọn.'
  /**
   * Nhãn và cờ "hoàn tiền" giờ ĐỀU đi theo được cả ba đường ghi:
   *  - giao dịch: cột trên transactions
   *  - quy tắc định kỳ: recurring_rule_tags (0042) + cột is_refund (0043)
   *  - lời nhắc: planned_expense_tags (0044); cờ hoàn tiền thì không có nghĩa ở đây
   *    (chưa chi thì chưa có gì để hoàn) nên ô đó vẫn ẩn khi bật "Nhắc sau".
   */
  const refundDropped = plannedMode
  const refundNote = 'Lời nhắc không có cờ "hoàn tiền" (chưa chi thì chưa có gì để hoàn).'

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
    // Tắt "Nhắc sau": nút bật/tắt nó chỉ có ở khoản CHI, giữ cờ qua đây là giữ một chế
    // độ mà người dùng không còn thấy để tắt.
    setRemindLater(false)
    setToAccountId(null)
    setToDigits('')
    setActiveField('main')
  }

  /** Bật một vai trò đặc biệt: khởi tạo field riêng + set loại theo vai trò. */
  function enterRole(r: SpecialRole) {
    setRole(r)
    setRoleMenu(false)
    setRemindLater(false) // cùng lý do với switchType
    // Kéo về đầu: vai trò dựng lại banner + ô số tiền ở trên, người dùng có thể đang
    // cuộn ở giữa lưới danh mục lúc bấm.
    scrollRef.current?.scrollTo({ top: 0 })
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
    scrollRef.current?.scrollTo({ top: 0 })
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
    if (activeField === 'debt.fee') {
      setDebtVal((v) => ({ ...v, fee: applyNumKey(v.fee, key) }))
      return
    }
    if (activeField === 'transfer.fee') {
      setTransferFee((v) => applyNumKey(v, key))
      return
    }
    const setter = activeField === 'to' && crossCurrency ? setToDigits : setDigits
    setter((d) => appendKey(d, key))
  }

  // Bật "Nhắc sau" thì nút không còn lưu giao dịch nữa — để nguyên chữ "Lưu" là nói
  // dối về việc nút sắp làm.
  const effectiveSubmitLabel = plannedMode ? 'Tạo lời nhắc' : submitLabel

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
      if (plannedMode && onSubmitPlanned) {
        // Chưa chi đồng nào: không có giao dịch nào được ghi ở nhánh này.
        await onSubmitPlanned({
          // Ghi chú là thứ người dùng tự đặt nên ưu tiên; không có thì mượn tên danh
          // mục, vì một dòng nhắc không tên thì nhắc xong cũng không biết là cái gì.
          title:
            note.trim() ||
            categories.find((c) => c.id === categoryId)?.name ||
            'Khoản sắp chi',
          amount,
          currency: srcCurrency,
          due_on: date,
          due_precision: 'day',
          // Mặc định nhắc đúng ngày; muốn nhắc sớm hơn thì sửa ở màn Sắp chi.
          remind_days_before: 0,
          category_id: categoryId,
          account_id: effectiveAccountId,
          // Nhãn của lời nhắc (migration 0044): lúc ghi thành giao dịch thật, form
          // Nhập lấy lại đúng những nhãn này (xem prop initialTagIds).
          tag_ids: effectiveTagIds,
        })
      } else if (repeat !== 'none' && onSubmitRecurring) {
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
          // Nhãn + cờ hoàn tiền của quy tắc — engine chép xuống mọi kỳ nó sinh ra
          // (migration 0042 và 0043)
          tag_ids: effectiveTagIds,
          is_refund: type === 'expense' ? isRefund : false,
        })
      } else if (showTransferFee && transferFee > 0) {
        // Chuyển khoản có phí → 2 bút toán, EntryPage lo thứ tự + hoàn tác
        await onSubmitWithFee!(values, transferFee, keepGoing)
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
        setTransferFee(0)
        setActiveField('main')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lưu thất bại, thử lại.')
    } finally {
      setPending(null)
    }
  }

  /** Nút mở "Loại đặc biệt". Không nằm trong form mà portal ra ô trống bên phải tiêu
   *  đề màn Nhập: khung ô tiền giữ nguyên là MỘT trường (chạm đâu cũng trỏ numpad vào
   *  đó), và nút không tốn thêm hàng nào. Chỉ hiện khi chưa bật vai trò — bật rồi thì
   *  banner trong form đã có nút "Bỏ". */
  const roleTrigger = (
    <div className="relative">
      <button
        type="button"
        onClick={() => setRoleMenu((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={roleMenu}
        aria-label="Loại đặc biệt"
        style={{ touchAction: 'manipulation' }}
        className="flex min-h-11 items-center gap-0.5 whitespace-nowrap rounded-lg bg-surface px-2.5 py-1.5 text-sm font-medium text-fg-secondary shadow-sm active:scale-95"
      >
        Đặc biệt
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 transition-transform ${roleMenu ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>
      {roleMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setRoleMenu(false)} aria-hidden />
          <div
            role="menu"
            className="absolute right-0 top-full z-50 mt-1 w-52 overflow-hidden rounded-lg border border-gray-200 bg-surface py-1 shadow-lg dark:border-gray-700"
          >
            {ROLE_ORDER.map((r) => {
              const m = ROLE_META[r]
              return (
                <button
                  key={r}
                  type="button"
                  role="menuitem"
                  onClick={() => enterRole(r)}
                  className="flex min-h-11 w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
                >
                  <m.Icon className="h-4 w-4 shrink-0" aria-hidden /> {m.label}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )

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
        {label && <span className="px-1 text-xs text-fg-muted">{label}</span>}
        <button
          type="button"
          onClick={() => setActiveField(field)}
          aria-label={`${label ?? 'Số tiền'}: ${mobileText}`}
          className={`truncate rounded-xl bg-surface px-4 py-2.5 text-right font-bold shadow-sm ${
            showExpr ? 'text-xl' : 'text-3xl'
          } ${isEmpty ? 'text-fg-muted' : AMOUNT_COLOR[type]} ${ring} lg:hidden`}
        >
          {mobileText}
        </button>
        {showExpr && result !== null && (
          <span className="px-1 text-right text-sm text-fg-muted lg:hidden">
            = {formatMoney(result, currency)}
          </span>
        )}
        {/* `aria-label` ở ĐÂY nữa, không chỉ ở nút chạm phía trên: hai ô luôn cùng nằm
            trong DOM, chỉ ẩn/hiện bằng `lg:hidden` / `hidden lg:block` — nên trên desktop
            ô thật sự dùng được là ô này, mà nó đang KHÔNG có tên nào. Nhãn nhìn bằng mắt
            là <span> nên `htmlFor` không cứu được. MoneyField đã sửa đúng chỗ này hôm
            2026-07-30; bản copy trong file này bị bỏ sót. Không ghép giá trị vào tên như
            nút chạm: giá trị đã nằm trong `value`, ghép nữa thì đọc hai lần. */}
        <input
          aria-label={label ?? 'Số tiền'}
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
          className={`hidden rounded-xl bg-surface px-4 py-3 text-right text-3xl font-bold shadow-sm outline-green-500 lg:block ${AMOUNT_COLOR[type]}`}
        />
      </div>
    )
  }

  const roleMeta = activeRole === 'none' ? null : ROLE_META[activeRole]

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {enableRoles &&
        roleTriggerSlot &&
        activeRole === 'none' &&
        createPortal(roleTrigger, roleTriggerSlot)}
      {/* Vùng cuộn: mọi nội dung nhập. Đáy (NumPad + nút Lưu) được ghim riêng bên
          dưới nên không bao giờ bị đẩy khuất — kể cả khi vai trò đặc biệt thêm field.
          Trên lg không có numpad, vùng này thôi giành hết chỗ trống (flex-initial)
          để nút Lưu nằm ngay dưới nội dung thay vì ghim tận đáy màn hình. */}
      <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto lg:flex-initial">
      {/* Mẫu giao dịch nhanh (mục J): 1 chạm điền sẵn. Chỉ hiện khi ĐÃ có mẫu —
          nút "Lưu mẫu" nằm cố định cạnh ô ghi chú, không chèn hàng vào đây giữa
          chừng làm cả trang tụt xuống ngay lúc tay đang bấm danh mục. */}
      {enableTemplates && templates.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {templates.map((t) => {
            const cur =
              accounts.find((a) => a.id === t.accountId)?.currency ?? srcCurrency
            return (
              <span key={t.id} className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => applyTemplate(t)}
                  className="flex items-center gap-1 rounded-full bg-surface py-1.5 pl-3 pr-6 text-xs font-medium text-gray-700 dark:text-gray-200 shadow-sm active:scale-95"
                >
                  <Star className="h-3 w-3 text-amber-400" fill="currentColor" />
                  <span className="max-w-[9rem] truncate">{t.label}</span>
                  <span className="text-fg-muted">
                    {formatMoney(t.amountMinor, cur)}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => deleteQuickTemplate(t.id)}
                  aria-label={`Xóa mẫu ${t.label}`}
                  className="absolute right-0.5 top-1/2 -translate-y-1/2 rounded-full p-2 text-gray-300 after:absolute after:-inset-2 hover:text-money-out dark:text-gray-600"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )
          })}
        </div>
      )}

      {/* Vai trò đặc biệt đang bật: banner ở trên cùng (nút mở nằm dưới lưới danh mục) */}
      {enableRoles && roleMeta && (
        <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${roleMeta.banner}`}>
          <roleMeta.Icon className="h-4 w-4 shrink-0" aria-hidden />
          <span className="flex-1 text-sm font-semibold">{roleMeta.label}</span>
          {/* after:-inset mở rộng vùng chạm lên ~44px mà không phồng banner. */}
          <button
            type="button"
            onClick={exitRole}
            aria-label="Bỏ vai trò, quay lại giao dịch thường"
            className="relative flex items-center gap-1 rounded-lg bg-surface/70 px-2 py-1 text-xs font-medium active:scale-95 after:absolute after:-inset-x-2 after:-inset-y-2.5"
          >
            <X className="h-3.5 w-3.5" aria-hidden /> Bỏ
          </button>
        </div>
      )}

      {/* Tab loại giao dịch thường, hoặc segmented riêng của vai trò.
          Dùng <SegmentedControl> chứ không tự vẽ ba bộ nút: bản chép tay ở đây là
          <button> trơn, không role/aria-selected — nghe bằng trình đọc màn hình thì
          không biết đang ở Chi hay Thu. Component dùng chung đã có role="tablist" +
          aria-selected + màu chữ mục tắt đạt AA (xem SegmentedControl.tsx). */}
      {activeRole === 'none' ? (
        <SegmentedControl
          items={TYPE_TABS.map((t) => ({ value: t.value, label: t.label }))}
          value={type}
          onChange={switchType}
          label="Loại giao dịch"
        />
      ) : activeRole === 'debt' ? (
        <SegmentedControl
          items={DEBT_TABS}
          value={debtVal.direction}
          onChange={setDebtDirection}
          label="Chiều nợ"
        />
      ) : activeRole === 'remit' ? (
        <SegmentedControl
          items={REMIT_TABS}
          value={remitVal.kind}
          onChange={(kind) => setRemitVal({ ...remitVal, kind, destId: '' })}
          label="Kiểu gửi tiền về VN"
        />
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
            {/* `ariaLabel` bắt buộc ở đây: hai picker đứng cạnh nhau, chỉ cách nhau một
                mũi tên "→" mang aria-hidden — không có nó thì cả hai đọc ra y như nhau
                ("Ví MoMo · ¥, button") và không biết đâu là nguồn đâu là đích. */}
            <AccountPicker
              accounts={activeAccounts}
              value={effectiveAccountId}
              onChange={setAccountId}
              excludeId={toAccountId}
              ariaLabel="Từ tài khoản"
              className="min-w-[7rem] flex-1"
            />
            <span aria-hidden className="shrink-0 text-fg-muted">
              →
            </span>
            <AccountPicker
              accounts={activeAccounts}
              value={toAccountId}
              onChange={setToAccountId}
              excludeId={effectiveAccountId}
              ariaLabel="Đến tài khoản"
              className="min-w-[7rem] flex-1"
            />
          </>
        ) : (
          <AccountPicker
            accounts={pickerAccounts}
            value={effectiveAccountId}
            onChange={setAccountId}
            ariaLabel="Tài khoản"
            className="min-w-0 flex-1"
          />
        )}
        <DateField
          value={date}
          onChange={setDate}
          ariaLabel="Ngày giao dịch"
          className="w-[7.5rem] shrink-0"
        />
        {/* "Nhắc sau" — chỉ với khoản CHI mới: nhắc mình đi thu tiền là chuyện khác
            hẳn, và chuyển khoản thì không có gì để nhắc. Bật lên là nút lưu đổi nghĩa,
            nên chữ trên nút cũng phải đổi (xem submitLabel bên dưới). */}
        {!initial && onSubmitPlanned && activeRole === 'none' && type === 'expense' && (
          <button
            type="button"
            onClick={() => setRemindLater((v) => !v)}
            aria-pressed={remindLater}
            aria-label={remindLater ? 'Tắt nhắc sau' : 'Nhắc sau thay vì ghi ngay'}
            title="Chưa chi — chỉ nhắc tôi vào ngày này"
            className={`${CHIP_BASE} ${
              remindLater
                ? 'border-amber-500 bg-amber-50 text-amber-700 dark:border-amber-600 dark:bg-amber-900/30 dark:text-amber-300'
                : CHIP_OFF
            }`}
          >
            <Bell className="h-4 w-4 shrink-0" />
            {remindLater && <span>Nhắc sau</span>}
          </button>
        )}
        {!initial && onSubmitRecurring && activeRole === 'none' && !plannedMode && (
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setRepeatOpen((o) => !o)}
              aria-haspopup="listbox"
              aria-expanded={repeatOpen}
              aria-label={`Lặp lại: ${REPEAT_MENU_LABEL[repeat]}`}
              className={`${CHIP_BASE} ${
                repeat === 'none'
                  ? CHIP_OFF
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
                  className="absolute right-0 z-50 mt-1 w-36 overflow-hidden rounded-lg border border-gray-200 bg-surface py-1 shadow-lg dark:border-gray-700 "
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
                      className={`flex min-h-11 w-full items-center px-3 py-2 text-left text-sm ${
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
      {/* Chuyển khoản: phí ngân hàng/dịch vụ → giao dịch chi riêng vào "Tài chính" */}
      {showTransferFee && (
        <FeeField
          value={transferFee}
          currency={srcCurrency}
          active={activeField === 'transfer.fee'}
          onFocus={() => setActiveField('transfer.fee')}
          onChange={setTransferFee}
          hint={'Ghi riêng thành khoản chi "Tài chính", trừ vào tài khoản nguồn.'}
          onEnter={() => handleSubmit()}
        />
      )}
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
          backAccounts={splitBackAccounts}
          sourceName={srcAccountName}
          othersActive={activeField === 'split.others'}
          onFocusOthers={() => setActiveField('split.others')}
          onEnter={() => handleSubmit()}
        />
      )}
      {activeRole === 'debt' && (
        <DebtFields
          value={debtVal}
          onChange={setDebtVal}
          canRecordReal={canRecordReal}
          people={debtPeople}
          currency={srcCurrency}
          feeActive={activeField === 'debt.fee'}
          onFocusFee={() => setActiveField('debt.fee')}
          onEnter={() => handleSubmit()}
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
          onEnter={() => handleSubmit()}
        />
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
              className="flex items-center gap-1.5 self-start rounded-lg bg-surface px-2.5 py-1 text-xs font-medium text-fg-secondary shadow-sm active:scale-95"
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
                <p className="col-span-full py-4 text-center text-xs text-fg-muted">
                  Nhóm này chưa có danh mục con
                </p>
              )}
            </div>
          </div>
        ) : topCategories.length === 0 ? (
          /* Không còn danh mục nào của loại này (chưa tạo, hoặc lưu trữ hết). Trước đây
             chỗ này là một vùng TRỐNG TRƠN kèm nút Lưu chết — không đường nào đi tiếp.
             Câu nhắc cạnh nút Lưu cũng chỉ sang đây (xem entryValidation). */
          <Card padding="lg" className="text-center text-xs text-fg-muted">
            {emptyGridNote}
            <Link
              to="/settings/categories"
              className="mt-1 block font-medium text-fg-accent underline"
            >
              Mở Cài đặt → Danh mục
            </Link>
          </Card>
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

      {/* Dưới lưới danh mục: những thứ tùy chọn/hiếm dùng (ghi chú, nhãn, hoàn tiền).
          Danh mục là bước bắt buộc của mọi giao dịch nên phải nằm trong tầm nhìn đầu
          tiên — ghi chú chen ở trên vừa tách hai bước bắt buộc (tiền → danh mục),
          vừa dễ chạm nhầm làm bàn phím hệ thống bật lên che numpad. */}
      <div className="flex gap-1.5">
        {/* Không có nhãn nhìn bằng mắt (cố ý — form Nhập ưu tiên gọn), nên tên ô phải đi
            qua `aria-label`. Placeholder KHÔNG phải tên: nó mất ngay khi bắt đầu gõ. */}
        <input
          aria-label="Ghi chú"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit()
          }}
          placeholder="Ghi chú (tùy chọn)"
          className="min-w-0 flex-1 rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-gray-700 dark:text-gray-300 outline-green-500"
        />
        {/* "Lưu mẫu" ở ô cố định cạnh ghi chú: không nhảy layout như khi tự chèn
            hàng chip ở đầu form. Mờ đi (thay vì ẩn) khi chưa đủ số tiền + danh mục. */}
        {enableTemplates && activeRole === 'none' && (
          <IconButton
            onClick={saveCurrentAsTemplate}
            disabled={!canSaveTemplate}
            aria-label="Lưu thành mẫu nhanh"
            title="Lưu thành mẫu nhanh (cần số tiền + danh mục)"
            className="shrink-0 disabled:opacity-40"
          >
            <Star className="h-4 w-4 text-amber-400" fill={canSaveTemplate ? 'currentColor' : 'none'} />
          </IconButton>
        )}
      </div>

      {/* Nhãn + "hoàn tiền" chỉ sống được trên một GIAO DỊCH. Quy tắc định kỳ
          (NewRecurringRule) và khoản sắp chi (NewPlannedExpense) không có cột nào giữ
          chúng, nên trước đây chọn nhãn rồi bấm Lặp lại là nhãn rơi mất không một lời
          — đo thử: 1 nhãn đã chọn, lưu xong còn 0 liên kết. Cờ hoàn tiền cũng vậy, và
          nó còn tệ hơn vì mỗi kỳ sinh ra một khoản chi cộng thêm tiền vào Chi thay vì
          trừ ra.
          Cách xử giống ô "+ Phí" của chuyển khoản: THÀ KHÔNG HIỆN còn hơn nhận rồi âm
          thầm bỏ — kèm một dòng nói vì sao, và nói luôn số nhãn đang chọn sẽ không đi
          theo, để không có gì biến mất trong im lặng. */}
      {activeRole === 'none' && <TagPicker value={effectiveTagIds} onChange={setTagIds} />}

      {/* Hoàn tiền — chỉ có nghĩa với khoản CHI.
          `mt-1.5` (cột cuộn đã có gap-1.5 → thành 12px): tách khỏi khối Nhãn ngay trên.
          Không kẻ vạch — trong form này các khối chỉ cách nhau bằng khoảng trống. */}
      {type === 'expense' && activeRole === 'none' && !refundDropped && (
        // min-h-11 + ô tích h-5: cả hàng trước đây chỉ cao 20px với ô tích 13px, trong
        // khi mọi thứ khác trong form đều 44px.
        <label className="mt-1.5 flex min-h-11 items-start gap-2 px-1 py-1 text-sm text-fg-secondary">
          <input
            type="checkbox"
            checked={isRefund}
            onChange={(e) => setIsRefund(e.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0"
          />
          <span>
            Đây là khoản <b>hoàn tiền</b>
            <Guide as="span" className="block text-xs text-fg-muted">
              Trả hàng, hủy vé, hoàn phí… Tiền quay lại ví và TRỪ vào chi của danh mục đã chọn, thay
              vì bị tính thành thu nhập.
            </Guide>
          </span>
        </label>
      )}

      {type === 'expense' && activeRole === 'none' && refundDropped && (
        <p className="px-1 text-xs text-fg-muted">{refundNote}</p>
      )}

      {showExcludeOption && type !== 'transfer' && (
        <label className="flex items-center gap-2 px-1 text-sm text-fg-secondary">
          <input
            type="checkbox"
            checked={excludeFromStats}
            onChange={(e) => setExcludeFromStats(e.target.checked)}
          />
          Không tính vào thống kê (giao dịch nội bộ, ghi bù…)
        </label>
      )}

      </div>

      {/* Đáy ghim: NumPad + lỗi + nút Lưu — luôn hiển thị, không bị nội dung đẩy khuất. */}
      <div className="flex shrink-0 flex-col gap-1.5 pt-1.5">
      {/* NumPad chỉ trên mobile. Ô tiền phụ không nhận phép tính → mờ ÷×−+. */}
      <div className="lg:hidden">
        <NumPad onKey={onNumPadKey} opsDisabled={activeField !== 'main' && activeField !== 'to'} />
      </div>

      {error && <p role="alert" className="text-sm text-money-out">{error}</p>}
      {/* Lý do nút Lưu còn mờ — ghim cạnh nút để không bao giờ bị cuộn khuất. */}
      {!error && missing && <p className="px-1 text-xs text-fg-warn">{missing}</p>}

      {/* Hàng nút: ⌫ (chỉ mobile, thay cho hàng xóa lùi riêng) + Tiếp tục/Lưu */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onNumPadKey('⌫')}
          aria-label="Xóa"
          className="flex shrink-0 items-center justify-center rounded-xl bg-white dark:bg-gray-800 px-5 text-lg font-semibold text-fg-primary shadow-sm transition active:scale-95 active:bg-gray-200 lg:hidden"
        >
          <Delete className="h-5 w-5" />
        </button>
        {/* "Nhắc sau" cũng ẩn nút Tiếp tục, cùng lý do với "Lặp lại": nút đó nghĩa là
            "lưu rồi nhập tiếp", mà ở chế độ này không có giao dịch nào được lưu cả. */}
        {onContinue && repeat === 'none' && activeRole === 'none' && !plannedMode ? (
          <>
            <button
              type="button"
              onClick={() => handleSubmit('continue')}
              disabled={!canSave}
              className="flex-1 rounded-xl border border-green-600 bg-surface py-3 text-base font-semibold text-green-700 shadow-sm transition enabled:active:scale-95 enabled:hover:bg-green-50 disabled:opacity-40 dark:text-green-400 dark:enabled:hover:bg-gray-800"
            >
              {pending === 'continue' ? 'Đang lưu…' : continueLabel}
            </button>
            <button
              type="button"
              onClick={() => handleSubmit('save')}
              disabled={!canSave}
              className="flex-1 rounded-xl bg-green-700 py-3 text-base font-semibold text-white shadow-sm transition enabled:active:scale-95 enabled:hover:bg-green-800 disabled:opacity-40"
            >
              {pending === 'save' ? 'Đang lưu…' : effectiveSubmitLabel}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => handleSubmit('save')}
            disabled={!canSave}
            className="flex-1 rounded-xl bg-green-700 py-3 text-base font-semibold text-white shadow-sm transition enabled:active:scale-95 enabled:hover:bg-green-800 disabled:opacity-40"
          >
            {saving ? 'Đang lưu…' : effectiveSubmitLabel}
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
      className={`relative flex flex-col items-center gap-0.5 rounded-xl border-2 bg-surface px-1 py-2 text-xs text-gray-700 dark:text-gray-300 transition active:scale-95 ${
        selected ? 'border-green-500 bg-green-50 dark:bg-green-900/30' : 'border-transparent shadow-sm'
      }`}
    >
      <span className="text-xl leading-none">{icon}</span>
      <span className="w-full truncate text-center">{name}</span>
      {hasChildren && (
        <span className="absolute top-1 right-1 text-fg-muted">
          <ChevronRight className="h-3 w-3" />
        </span>
      )}
    </button>
  )
}
