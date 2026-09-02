import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Guide } from '../../components/Guide'
import {
  ChevronDown,
  Delete,
  Star,
  TriangleAlert,
  X,
} from 'lucide-react'
import type { NewPlannedExpense, NewTransaction } from '../../data'
import { PlannedFields } from './PlannedFields'
import { initialPlannedDraftForEntry } from './plannedDraftDefaults'
import { plannedFromEntry, plannedMissing, type PlannedDraft } from './plannedFromEntry'
import { addDaysISO, addMonths, getMonthRange, monthKeyForDate, toISODate } from '../../lib/dates'
import { promptDialog, showToast } from '../../lib/dialog'
import { CURRENCIES } from '../../lib/currencies'
import { formatMoney, parseMoney, type CurrencyCode } from '../../lib/money'
import type { DebtDirection, TransactionRow, TransactionType } from '../../types/database.types'
import {
  useAccounts,
  useBudgetReport,
  useCategories,
  useDebtPayments,
  useDebts,
  useProfile,
  useRangeTransactions,
  useRates,
  useRelatives,
  useTransactionTags,
} from '../../hooks/queries'
import { convertToBase } from '../../lib/rates'
// `useRatesFreshness`, không tự đọc `readRatesMeta`: dataFreshness.test.ts (luật 2) chỉ
// cho hooks/useDataFreshness.ts tính tuổi tỷ giá — một cửa duy nhất, để nhãn ở đây không
// bao giờ lệch với trang Cài đặt/Tài sản (cùng nguồn, cùng ưu tiên sourceUpdatedAt).
import { useRatesFreshness } from '../../hooks/useDataFreshness'
import { remitMonthlyTotals, remitStrip } from '../reports/longRange'
import { AccountPicker } from '../../components/AccountPicker'
import { DateField } from '../../components/DateField'
import { IconButton, SegmentedControl, Select } from '../../components/ui'
import { TagPicker } from '../tags/TagPicker'
import { CategoryRow } from './CategoryRow'
import { recentCategories } from './recentCategories'
import { categoryAlert } from './categoryAlert'
import { cappedCategory } from './cappedCategory'
import {
  isAutoAssignedCategory,
  pickableCategories,
  REMIT_CATEGORY_NAME,
} from '../categories/flowCategories'
import { remainingOf } from '../debts/aggregate'
import { accountsForDebt } from './debtPick'
import { DebtPickerField } from './DebtPickerField'
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
  SERVICES,
  type SplitValue,
} from './entryRoles'
import {
  categoryPickerOf,
  counterpartyLabelOf,
  DIRECTION_LABEL,
  directionOf,
  PHASE_LABEL,
  shapeOf,
  type EntryKind,
} from './entryShape'
import { DirectionTabs } from './DirectionTabs'
import { DebtFields, FeeField, RemitFields, RemitMonthStrip, SplitFields } from './roleFields'
import { entryGate, plannedModeActive } from './entryValidation'
import { initialPayment, type PaymentValue, type RoleBase } from './roleSave'
import { NguoiThanSheet } from '../quyen-loi/NguoiThanSheet'

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

/**
 * Ba dạng "thường" — dùng ở form SỬA, nơi không có mười dạng.
 *
 * Form sửa không nhận `enableRoles`: sửa một bút toán đã ghi thì không có đường nào
 * biến nó thành một khoản Trả hộ (việc đó sinh nhiều bút toán + một khoản nợ). Nên ở
 * đó bộ chọn chỉ còn ba dạng thẳng, đọc theo ĐÚNG một bảng với màn Nhập — không phải
 * ba nhãn Chi/Thu/Chuyển khoản riêng nữa.
 */
const PLAIN_KINDS: EntryKind[] = ['spend', 'earn', 'between']

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
  /** Ô "Ước tính" của "Sẽ chi". Bàn số ghim đáy chỉ hiện khi đích là ô này — chạm mới
   *  có, nên "Sẽ chi" (nhiều field chữ) không mất 188px chiều cao khi chưa cần. */
  | 'planned.amount'

/**
 * Payload gửi lên EntryPage khi lưu một dạng đi qua orchestrator riêng.
 *
 * `kind` đi kèm dù `role` đã chọn được orchestrator: một `role` phủ HAI dạng (debt →
 * lend|borrow, remit → family|ownvn) nên người nhận không suy lại được dạng nào, mà nó
 * cần đúng dòng bảng `entryShape` để đặt tên khoản vừa ghi trong "Vừa ghi" (xem
 * `roleSavedEntry` ở EntryPage).
 */
export type RoleSubmit =
  | { kind: EntryKind; role: 'split'; base: RoleBase; value: SplitValue }
  | { kind: EntryKind; role: 'debt'; base: RoleBase; value: DebtValue }
  | { kind: EntryKind; role: 'remit'; base: RoleBase; value: RemitValue }

/**
 * Payload lưu một lần trả nợ (repay/collect) — đi qua `saveDebtPayment`, KHÔNG qua
 * `onSubmitRole`: hai dạng này không có `roleSeed.role` (bảng entryShape đặt `NONE`,
 * xem entryShape.ts) vì chúng không dùng field People/Split/Remit gì, chỉ một khoản
 * nợ đã chọn — orchestrator riêng cho khớp `writes: 'debtPayment'`.
 */
export type PaymentSubmit = { kind: EntryKind; base: RoleBase; value: PaymentValue }

/**
 * Dạng mở sẵn khi vào màn: suy từ `?type=` / `?role=` cũ để mọi đường vào đang có
 * (thông báo, trang Nợ, lối tắt PWA, bản điền sẵn của khoản đến hạn) không đứt.
 *
 * `?role=debt` → `borrow` và `?role=remit` → `family` vì đó ĐÚNG là dạng mà form cũ
 * mở ra: `initialDebt().direction === 'i_owe'` (Mình nợ) và `initialRemit().kind ===
 * 'expense'` (Hỗ trợ gia đình).
 */
function initialKindOf(type: TransactionType | undefined, role: EntryRole): EntryKind {
  if (role === 'split') return 'split'
  if (role === 'debt') return 'borrow'
  if (role === 'remit') return 'family'
  if (type === 'income') return 'earn'
  if (type === 'transfer') return 'between'
  return 'spend'
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
   * Nút phụ "Lưu và nhập tiếp": có mặt → hiện nút thứ hai, lưu xong tự xóa
   * số tiền + ghi chú để nhập giao dịch kế tiếp mà không rời màn hình.
   * Nhãn nút KHÔNG còn nhận từ ngoài — nó là một câu cố định (xem nút Lưu).
   */
  onContinue?: (values: NewTransaction) => Promise<void>
  /** Loại khởi tạo khi mở mới (vd từ lối tắt PWA) — bỏ qua nếu có `initial`. */
  initialType?: TransactionType
  /** Hiện tùy chọn "Không tính vào thống kê" (mục AM) — dùng ở màn sửa, ẩn ở màn nhập nhanh. */
  showExcludeOption?: boolean
  /**
   * Hiện ô tích "Đây là khoản hoàn tiền" — CHỈ màn sửa (2026-08-24).
   *
   * Cùng lý lẽ với `showExcludeOption` ngay trên: một lựa chọn hiếm dùng thì không được
   * chiếm chỗ trên đường đi thường ngày. Ở màn Nhập, người dùng đang gõ một khoản chi vừa
   * xảy ra; biết nó là tiền hoàn hay không là chuyện nhớ ra sau, và mở lại giao dịch để
   * tích một ô là đủ nhanh cho việc mỗi tháng làm một lần.
   */
  showRefundOption?: boolean
  /** Hiện hàng mẫu giao dịch nhanh (mục J) — chỉ màn nhập mới. */
  enableTemplates?: boolean
  /**
   * Màn Nhập: bộ chọn đầy đủ MƯỜI dạng (hàng Hướng + hàng Dạng). Không truyền
   * (form sửa) → chỉ ba dạng thẳng, xem `PLAIN_KINDS`.
   */
  enableRoles?: boolean
  /** Dạng mở sẵn (từ deep-link ?role=). Bỏ qua nếu !enableRoles. */
  initialRole?: EntryRole
  /**
   * Lưu một dạng đi qua orchestrator riêng (thay onSubmit). Bắt buộc khi enableRoles.
   * `keepGoing` = người dùng bấm "Lưu và nhập tiếp" → người nhận PHẢI ở lại màn hình
   * (cùng hợp đồng với `onSubmitWithFee` ngay dưới). Không có cờ này thì nút phụ lưu
   * xong lại điều hướng đi, tức nhãn nút nói ngược việc nó làm ở năm dạng.
   */
  onSubmitRole?: (payload: RoleSubmit, keepGoing: boolean) => Promise<void>
  /**
   * Lưu một lần trả nợ (repay/collect) — xem `PaymentSubmit`. Cùng hợp đồng
   * `keepGoing` với `onSubmitRole` ngay trên. Bắt buộc khi enableRoles (hai dạng
   * này luôn có mặt trong hàng Dạng khi mười dạng được bật).
   */
  onSubmitPayment?: (payload: PaymentSubmit, keepGoing: boolean) => Promise<void>
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
   * "Sẽ chi" (segmented Đã chi|Sẽ chi): KHÔNG ghi giao dịch, mà tạo một khoản sắp chi
   * (migration 0038) qua `PlannedFields` — field riêng, không phải field giao dịch
   * thường. Dành cho việc mình biết sẽ phải chi mà chưa chi. Không truyền → không
   * hiện segmented, và form chỉ còn "Đã chi" như cũ.
   */
  onSubmitPlanned?: (input: NewPlannedExpense) => Promise<void>
}

export function TransactionForm({
  initial,
  submitLabel,
  onSubmit,
  onContinue,
  initialType,
  showExcludeOption,
  showRefundOption,
  enableTemplates,
  enableRoles,
  initialRole,
  onSubmitRole,
  onSubmitPayment,
  onSubmitWithFee,
  onSubmitPlanned,
  initialTagIds: initialTagIdsProp,
}: TransactionFormProps) {
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()
  const templates = useQuickTemplates()

  /**
   * DẠNG là state duy nhất của "khoản này là khoản gì". `type` (Chi/Thu/Chuyển khoản),
   * vai trò cũ và chiều nợ đều thành giá trị DẪN XUẤT từ nó — trước đây chúng là ba
   * state song song và ba lần lệch nhau (gửi cho gia đình xếp vào Chuyển khoản, mình
   * nợ xếp vào Chuyển khoản…).
   */
  const [kind, setKind] = useState<EntryKind>(
    initialKindOf(initial?.type ?? initialType, enableRoles && initialRole ? initialRole : 'none'),
  )
  const shape = shapeOf(kind)
  /**
   * `txType` null chỉ ở repay/collect — ở đó loại giao dịch suy từ CHIỀU của khoản nợ
   * đã chọn (đến ở bước sau của gói này). Lấy tạm theo hướng tiền để mọi chỗ đọc
   * `type` (lưới danh mục, ô ghi chú, nhãn) không phải xử một giá trị null.
   */
  const type: TransactionType = shape.txType ?? (shape.direction === 'in' ? 'income' : 'expense')
  /**
   * Màu số tiền đọc từ `txType` THÔ, không từ `type` đã có fallback: hai dạng trả nợ
   * lấy màu trung tính của chuyển khoản, vì chiều bút toán của chúng còn phụ thuộc khoản
   * nợ đã chọn — tô đỏ hay xanh lúc chưa biết là đoán.
   */
  const amountColor = AMOUNT_COLOR[shape.txType ?? 'transfer']
  const [digits, setDigits] = useState(initial ? String(initial.amount) : '')
  const [toDigits, setToDigits] = useState(initial?.to_amount ? String(initial.to_amount) : '')
  /** Mobile: numpad đang gõ vào ô tiền nào (ô chính, "nhận được", hoặc ô phụ của dạng) */
  const [activeField, setActiveField] = useState<AmountTarget>('main')
  const [categoryId, setCategoryId] = useState<string | null>(
    initial?.category_id ?? lastCategoryFor(type, categories),
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
  /**
   * true = segmented "Đã chi | Sẽ chi" đang ở "Sẽ chi" — bấm Lưu sẽ tạo KHOẢN SẮP
   * CHI thay vì ghi giao dịch. Cờ THÔ; hiệu lực thật đọc qua `plannedModeActive` (chỉ
   * ở khoản CHI thường — segmented chỉ hiện ở đó, xem cổng render bên dưới).
   */
  const [wantsPlanned, setWantsPlanned] = useState(false)
  // Nút đang lưu: 'save' | 'continue' | null — để khóa cả hai nút và hiện "Đang lưu…"
  const [pending, setPending] = useState<'save' | 'continue' | null>(null)
  const saving = pending !== null
  const [error, setError] = useState<string | null>(null)
  // Hàng "Nhãn, ghi chú" gộp — đóng mặc định trên mobile để bù chiều cao của khối tùy
  // chọn (khối Nhãn 68 + ghi chú 44) về một hàng 44px (xem task-13-brief). Từ 2026-08-24
  // ô "hoàn tiền" 44px không còn ở màn Nhập nữa nên khối này nhẹ hơn 44px so với lúc
  // task-13 đo, nhưng vẫn gộp: ngân sách chiều cao 360×780 không có 112px dư.
  // Từ lg cột phải luôn hiện đủ, cờ này không có tác dụng (xem class `lg:flex` cố định).
  const [showMore, setShowMore] = useState(false)

  /** Vùng cuộn của form — cần để kéo về đầu khi đổi sang một dạng có field riêng. */
  const scrollRef = useRef<HTMLDivElement>(null)
  const [splitVal, setSplitVal] = useState<SplitValue>(initialSplit)
  const [debtVal, setDebtVal] = useState<DebtValue>(initialDebt)
  const [remitVal, setRemitVal] = useState<RemitValue>(initialRemit)
  const [paymentVal, setPaymentVal] = useState<PaymentValue>(initialPayment)
  /**
   * Chiều nợ và kiểu gửi tiền KHÔNG còn là state riêng — chúng là hạt giống của dạng
   * (bảng entryShape). Trước đây hai segmented con ("Mình nợ | Cho vay",
   * "Hỗ trợ gia đình | Chuyển tài sản") giữ chúng, nên cùng một câu hỏi có hai chỗ
   * trả lời và hai chỗ đó lệch được nhau. Đọc thẳng từ bảng rồi ghép vào giá trị field
   * lúc dùng/lúc lưu là hết đường lệch.
   */
  const debtValue: DebtValue = {
    ...debtVal,
    direction: shape.roleSeed.debtDirection ?? debtVal.direction,
  }
  const remitValue: RemitValue = {
    ...remitVal,
    kind: shape.roleSeed.remitKind ?? remitVal.kind,
  }
  /**
   * `categoryPickerOf` chỉ đổi hành vi ở lend/borrow, nên với mọi dạng khác giá trị này
   * vô hại. Gộp một biến để không có hai đường đọc cùng một ý — hai đường thì sẽ lệch.
   */
  const withTransaction = shape.writes === 'debtPayment' ? paymentVal.withTransaction : debtVal.withTransaction

  // Người đã cho vay/nợ (khoản đang mở) — nguồn để gợi ý cộng dồn.
  const { data: allDebts = [] } = useDebts()
  const { data: allDebtPayments = [] } = useDebtPayments()

  // Điền sẵn danh mục lần trước khi categories tải xong (form mới, chưa chọn gì)
  useEffect(() => {
    if (initial || categoryId !== null || type === 'transfer') return
    const last = lastCategoryFor(type, categories)
    if (last) setCategoryId(last)
  }, [categories, type, initial, categoryId])

  // Không còn effect đồng bộ loại giao dịch theo deep-link `?role=`: `type` giờ đọc
  // thẳng từ bảng theo `kind`, nên nó đúng ngay ở lần bày đầu tiên.

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
  const remitLike = shape.roleSeed.role === 'remit'
  // Trả nợ được từ ví BẤT KỲ, kể cả khác tệ (nợ ¥ trả bằng ₫ vào tài khoản Việt Nam
  // là ca thật) — nhưng ví cùng tệ xếp lên trước để mặc định vẫn đúng. Nên ở
  // repay/collect danh sách ví PHỤ THUỘC khoản nợ đã chọn — đây là chỗ DUY NHẤT của
  // form có hai field phụ thuộc nhau (mọi quyết định lọc/xếp ở debtPick.ts).
  const payDebt =
    shape.writes === 'debtPayment'
      ? allDebts.find((d) => d.id === paymentVal.debtId)
      : undefined
  const pickerAccounts = useMemo(() => {
    if (remitLike) return activeAccounts.filter((a) => a.currency === 'JPY' && a.type !== 'card')
    if (shape.writes === 'debtPayment') return accountsForDebt(activeAccounts, payDebt)
    return activeAccounts
  }, [activeAccounts, remitLike, shape.writes, payDebt])
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
  const selectedCat = categories.find((c) => c.id === categoryId) ?? null

  // Hàng "Gần đây" (Task 12/13): 3 danh mục dùng nhiều nhất 90 ngày qua, đúng loại
  // đang mở. 90 ngày (không phải "tháng này"): đầu tháng mới mở form thì tháng hiện
  // tại gần như trống, mà thói quen dùng gói không đổi qua một mốc lịch tuỳ ý.
  const todayISO = toISODate(new Date())
  const recentRange = useMemo(
    () => ({ start: addDaysISO(todayISO, -90), end: addDaysISO(todayISO, 1) }),
    [todayISO],
  )
  const { data: recentTxs = [] } = useRangeTransactions(recentRange)
  const recentCats = useMemo(
    () => recentCategories(recentTxs, categories, type),
    [recentTxs, categories, type],
  )

  /**
   * Gửi về VN: tỷ giá SỐNG (RemitFields) + dải 12 tháng (cột phụ) — cả hai chỉ tải khi
   * đang mở dạng gửi (`remitLike`), NumPad/field khác không cần trả giá cho hai query này.
   */
  const { data: profile } = useProfile()
  const monthStartDay = profile?.month_start_day ?? 1
  const { base, rates } = useRates()
  // VND trên 1 JPY, tính qua base currency của hồ sơ — thường base đã là JPY (rates.JPY
  // = 1) nên phép chia này là no-op; viết vậy để đúng cả khi ai đó đổi base sang tiền
  // khác (deriveReceived luôn nhận rate = VND/JPY, không phải VND/base).
  const remitRate = useMemo(() => {
    if (!remitLike || !rates) return null
    const vnd = rates.VND
    const jpy = rates.JPY
    if (!vnd || !jpy) return null
    return vnd / jpy
  }, [remitLike, rates])
  // Chuỗi "3 giờ trước" — đọc qua cửa duy nhất (xem import ở trên), không tính lại.
  const ratesFreshness = useRatesFreshness()
  const remitRateAge = remitLike
    ? ratesFreshness?.details.find((d) => d.label === 'Tỷ giá')?.age ?? null
    : null

  // Dải 12 tháng gửi về VN — CÙNG bước filter/convert/bucket với khối "Gửi về VN" ở tab
  // Dài hạn: `remitMonthlyTotals` (features/reports/longRange.ts), không viết lại ở
  // đây. Hai nơi từng có hai bản sao lệch fallback tiền tài khoản với nhau (fix round 1) —
  // gộp về MỘT hàm thì không còn chỗ để lệch lần hai.
  const remitStripRange = useMemo(() => {
    const todayKey = monthKeyForDate(todayISO, monthStartDay)
    const startKey = addMonths(todayKey, -11)
    return { start: getMonthRange(startKey, monthStartDay).start, end: addDaysISO(todayISO, 1) }
  }, [todayISO, monthStartDay])
  const { data: remitTxs = [] } = useRangeTransactions(remitStripRange, remitLike)
  const { data: relatives = [] } = useRelatives()
  const relativesActive = useMemo(() => relatives.filter((r) => !r.is_archived), [relatives])
  const [relativeSheet, setRelativeSheet] = useState(false)
  // Mặc định = người của lần gửi GẦN NHẤT — người gửi đều cho một người thì không phải
  // bấm thêm gì (nguyên tắc dưới 5 giây). Chỉ điền khi ô còn trống, không đạp lên lựa chọn.
  const lastRecipientId = useMemo(() => {
    const last = remitTxs
      .filter((t) => t.is_remittance && t.remit_recipient_id)
      .sort((a, b) => b.occurred_on.localeCompare(a.occurred_on))[0]
    return last?.remit_recipient_id ?? ''
  }, [remitTxs])
  useEffect(() => {
    if (remitLike && remitVal.recipientId === '' && lastRecipientId) {
      setRemitVal((v) => ({ ...v, recipientId: lastRecipientId }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remitLike, lastRecipientId])
  const remitMonthStrip = useMemo(() => {
    if (!remitLike) return null
    const amountOf = remitMonthlyTotals(remitTxs, activeAccounts, base, rates ?? {}, monthStartDay)
    const todayKey = monthKeyForDate(todayISO, monthStartDay)
    const keys = Array.from({ length: 12 }, (_, i) => addMonths(todayKey, i - 11))
    return remitStrip(keys, amountOf)
  }, [remitLike, remitTxs, activeAccounts, base, rates, monthStartDay, todayISO])

  // Tài khoản mặc định = dùng lần trước, fallback tài khoản đầu tiên (trong danh sách hợp lệ)
  const effectiveAccountId =
    accountId && pickerAccounts.some((a) => a.id === accountId)
      ? accountId
      : (pickerAccounts[0]?.id ?? null)

  const srcCurrency = activeAccounts.find((a) => a.id === effectiveAccountId)?.currency ?? 'JPY'
  /** Dạng chỉ ghi khoản nợ, không bút toán nào (Khách nợ công). Đọc từ bảng. */
  const debtOnly = shape.writes === 'debtOnly'
  /**
   * Loại tiền của khoản "Khách nợ công". KHÔNG dùng `srcCurrency` được: cái đó đọc từ ví
   * đang chọn với fallback `?? 'JPY'`, mà dạng này không có ví nào — người làm thêm ăn
   * tiền VND sẽ nhận một khoản nợ ghi bằng JPY và không có gì trên màn nói ra điều đó.
   * Gieo MỘT lần từ ví mặc định rồi không đạp lên lựa chọn của người dùng nữa, đúng lối
   * ô "Ước tính" của "Sẽ chi".
   */
  const [owedCurrency, setOwedCurrency] = useState<CurrencyCode>('JPY')
  const owedCurrencySeeded = useRef(false)
  /** Loại tiền của KHOẢN NỢ đang ghi: dạng debtOnly có ô riêng, còn lại theo ví nguồn. */
  const debtCurrency = debtOnly ? owedCurrency : srcCurrency
  const dstCurrency = activeAccounts.find((a) => a.id === toAccountId)?.currency ?? srcCurrency
  /**
   * Field riêng của "Sẽ chi" — một object độc lập, KHÔNG tái dùng `note`/`categoryId`
   * của giao dịch thường: tên khoản sắp chi và ghi chú giao dịch là hai câu hỏi khác
   * nhau, và PlannedFields có ô riêng cho từng thứ (chép đúng PlannedFormSheet).
   *
   * `dueOn` gieo NGAY HÔM NAY (không phải '' như `initialPlannedDraft` gốc của Task 9)
   * — xem `plannedDraftDefaults.ts`: sheet thật luôn hiện ô ngày ngay khi mở, còn ở
   * đây người dùng có thể bấm Lưu trước khi chạm ô ngày, và `firstOfMonth('')` cho ra
   * '-01', một ngày ISO không hợp lệ.
   */
  const [plannedDraft, setPlannedDraft] = useState<PlannedDraft>(() =>
    initialPlannedDraftForEntry(srcCurrency, toISODate(new Date())),
  )
  /**
   * `currency` của bản nháp trên gieo trong `useState` (chạy MỘT lần), mà lúc đó
   * `useAccounts()` chưa về nên `srcCurrency` còn là fallback 'JPY': người có ví mặc định
   * VND nhận một ô "Ước tính" ghi bằng JPY cho tới khi họ tự chạm ô chọn loại tiền.
   *
   * Gieo lại ĐÚNG MỘT LẦN, ngay khi đã biết tiền của ví nguồn — sau đó không đụng nữa,
   * vì loại tiền của một khoản sắp chi không nhất thiết là loại tiền của ví (vé máy bay
   * tính bằng USD trả từ ví JPY), nên đổi ví không được đạp lên lựa chọn của người dùng.
   */
  const plannedCurrencySeeded = useRef(false)
  useEffect(() => {
    if (plannedCurrencySeeded.current || activeAccounts.length === 0) return
    plannedCurrencySeeded.current = true
    setPlannedDraft((d) => (d.currency === srcCurrency ? d : { ...d, currency: srcCurrency }))
  }, [activeAccounts.length, srcCurrency])
  useEffect(() => {
    if (owedCurrencySeeded.current || activeAccounts.length === 0) return
    owedCurrencySeeded.current = true
    setOwedCurrency(srcCurrency)
  }, [activeAccounts.length, srcCurrency])
  // `kind === 'between'` chứ không `type === 'transfer'`: dạng "Tài khoản tôi ở VN"
  // cũng là chuyển khoản, nhưng ô đích và số nhận của nó nằm trong RemitFields — hỏi
  // thêm một ô "nhận được" nữa là hỏi hai lần cùng một số.
  const crossCurrency = kind === 'between' && !!toAccountId && dstCurrency !== srcCurrency
  /** Ô "+ Phí" — chỉ chuyển khoản giữa ví của tôi (các dạng khác có ô phí riêng). */
  const showTransferFee = kind === 'between' && !!onSubmitWithFee
  // Gợi ý cộng dồn: khoản đang mở cùng chiều + cùng loại tiền với tài khoản đang chọn
  // (khác loại tiền không cộng dồn được nên không đưa vào danh sách).
  // `currency` là THAM SỐ, không đọc `srcCurrency` bên trong: dạng "Khách nợ công" không
  // có ví nào nên loại tiền của nó đến từ ô riêng (`debtCurrency`).
  const peopleFor = useCallback(
    (direction: DebtDirection, currency: CurrencyCode): DebtPerson[] =>
      allDebts
        .filter(
          (d) =>
            d.status === 'open' &&
            d.direction === direction &&
            d.currency === currency &&
            d.counterparty.trim().length > 0,
        )
        .map((d) => ({
          id: d.id,
          name: d.counterparty,
          currency: d.currency,
          remaining: Math.max(remainingOf(d, allDebtPayments), 0),
          origin: d.origin,
          incomeCategoryId: d.income_category_id,
        })),
    [allDebts, allDebtPayments],
  )
  /**
   * Gợi ý cộng dồn — LỌC THÊM theo `origin`, vì `matchOpenDebt` sẽ từ chối gộp hai loại
   * nợ khác nguồn gốc. Mời một khoản mà cổng cuối sẽ từ chối là mời người dùng chọn rồi
   * lặng lẽ tạo dòng thứ hai trùng tên.
   */
  const debtPeople = useMemo<DebtPerson[]>(
    () =>
      enableRoles
        ? peopleFor(debtValue.direction, debtCurrency).filter((p) =>
            debtOnly
              ? p.origin === 'earned' && p.incomeCategoryId === categoryId
              : (p.origin ?? null) === null,
          )
        : [],
    [enableRoles, peopleFor, debtValue.direction, debtCurrency, debtOnly, categoryId],
  )
  // Trả hộ "còn nợ" tạo khoản "người khác nợ mình" (owed_to_me) → gợi ý cộng dồn.
  const splitPeople = useMemo<DebtPerson[]>(
    // Trả hộ tạo khoản CHO VAY (origin null), nên chỉ gợi ý khoản cùng loại đó.
    () =>
      enableRoles
        ? peopleFor('owed_to_me', srcCurrency).filter((p) => (p.origin ?? null) === null)
        : [],
    [enableRoles, peopleFor, srcCurrency],
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
  // Lưới danh mục chỉ hiện khi bảng nói "người dùng chọn tay". `auto` = app tự gán,
  // `none` = dạng này không có danh mục nào — cả hai đều ẩn lưới.
  const hideCategoryGrid = categoryPickerOf(kind, withTransaction) !== 'user'

  /** Áp một mẫu nhanh vào form (người dùng vẫn bấm Lưu để ghi). */
  function applyTemplate(t: QuickTemplate) {
    setKind(initialKindOf(t.type, 'none'))
    setDigits(t.amountMinor > 0 ? String(t.amountMinor) : '')
    if (t.categoryId) setCategoryId(t.categoryId)
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
   * Segmented "Đã chi | Sẽ chi" chỉ hiệu lực với khoản CHI thường — xem
   * `plannedModeActive`. Đọc cờ thô `wantsPlanned` ở những chỗ dưới đây (thay vì đọc
   * `plannedMode` đã lọc) sẽ lặp lại đúng lỗi cũ: đổi sang tab Thu thì segmented biến
   * mất mà cờ vẫn bật, và nút Lưu sẽ tạo một khoản sắp CHI trong khi đang ở tab Thu.
   */
  const plannedMode = plannedModeActive({
    wantsPlanned,
    canPlan: !!onSubmitPlanned,
    kind,
  })

  /**
   * Bàn số ghim đáy có hiện hay không.
   *
   * "Đã chi": luôn — ô số tiền là lý do tồn tại của màn này.
   * "Sẽ chi": khi đích gõ là ô "Ước tính". Từ 2026-08-20 nút "Sẽ chi" tự đặt đích vào
   * đó, nên bàn số có ngay lúc mở — ô "Ước tính" giờ là ô đầu của màn (yêu cầu: "ước
   * tính trước rồi mới Chi cái gì"). Vẫn là MỘT cổng chứ không phải "luôn hiện": chạm
   * vào một ô chữ nào khác thì `activeField` rời đi và 188px kia trả lại cho vùng
   * cuộn — màn "Sẽ chi" phần lớn là field chữ (ngày đến hạn, nhắc trước, ghi chú).
   */
  const padShown = !plannedMode || activeField === 'planned.amount'

  /**
   * Danh mục mà khoản này SẼ được xếp vào — không phải luôn là ô người dùng bấm, và không
   * phải lúc nào cũng có. Cả ba điều kiện (capBase, picker, cột `kind`) nằm trong
   * `cappedCategory` cùng lý lẽ của chúng; chỗ này chỉ nối dây.
   *
   * `REMIT_CATEGORY_NAME` truyền vào không điều kiện được, vì `family` là dạng DUY NHẤT
   * vừa `categoryPicker: 'auto'` vừa có trần — bốn dạng nợ đều `capBase: 'none'` nên dừng
   * ở cổng đầu, chưa tới bước tra tên. Thêm một dạng `auto` CÓ trần thì phải sửa chỗ này.
   */
  const cappedCat = cappedCategory(shape, selectedCat, categories, REMIT_CATEGORY_NAME)

  /**
   * Trần đọc theo THÁNG CỦA NGÀY đang nhập, không phải tháng hiện tại: ghi bù một khoản
   * của tháng trước thì nó đụng trần của tháng trước.
   */
  const capMonthKey = useMemo(() => monthKeyForDate(date, monthStartDay), [date, monthStartDay])
  /**
   * Hạn mức + đã chi tháng này đọc LẠI từ `useBudgetReport` (features/budgets/progress.ts),
   * KHÔNG cộng lần thứ hai ở đây: trần nhóm cha–con, phần hạn mức dồn (mục AH) và việc
   * loại danh mục `kind = 'transfer'` chỉ có MỘT chỗ tính đúng — nhánh này đã phải gộp
   * một bản aggregate trùng bị lệch âm thầm.
   */
  const { report: budgetReport, isComplete: budgetComplete } = useBudgetReport(capMonthKey)
  /**
   * Câu cảnh báo về ĐÚNG danh mục vừa chọn, thay dải đỏ "N danh mục vượt ngân sách" đã bỏ
   * khỏi EntryPage — dải đó hiện ở cả mười dạng, kể cả bảy dạng không thuộc danh mục nào.
   *
   * `budgetComplete` là điều kiện, không phải phòng xa: thiếu tỷ giá thì `spent` BỎ ÂM
   * THẦM mọi giao dịch ngoại tệ, thiếu dữ liệu tháng trước thì `budgeted` thiếu phần dồn
   * (xem chú thích của useBudgetReport). Một câu "đã vượt ¥7,327" tính từ số thiếu còn tệ
   * hơn không có câu nào.
   */
  const capWarning = useMemo(() => {
    if (plannedMode || !cappedCat || !budgetReport || !budgetComplete) return null
    // Trần đặt ở danh mục CHA là trần chung cho cả nhóm (progress.ts): chọn một con chưa
    // có trần riêng thì khoản này vẫn đụng trần của cha, nên rơi về dòng của cha — và câu
    // cảnh báo gọi tên chính danh mục ĐANG GIỮ trần đó, không phải tên con.
    const line =
      budgetReport.lines.find((l) => l.categoryId === cappedCat.id) ??
      (cappedCat.parent_id
        ? budgetReport.lines.find((l) => l.categoryId === cappedCat.parent_id)
        : undefined)
    if (!line) return null
    const owner =
      line.categoryId === cappedCat.id
        ? cappedCat
        : categories.find((c) => c.id === line.categoryId)
    // Báo cáo ngân sách tính bằng tiền quy đổi (base), còn ô số tiền theo tiền của ví
    // nguồn — phải quy đổi trước khi so, không thì ¥ đứng cạnh ₫ trong cùng một câu.
    // Thiếu tỷ giá thì convertToBase trả null → im lặng, cùng lý lẽ với `budgetComplete`.
    const add = convertToBase(amount, srcCurrency, base, rates ?? {})
    const othersShare = convertToBase(splitVal.others, srcCurrency, base, rates ?? {})
    if (add === null || othersShare === null) return null
    return categoryAlert({
      categoryName: owner?.name ?? null,
      currency: base,
      cap: line.budgeted,
      spent: line.spent,
      amount: add,
      // `othersShare`, KHÔNG `myShare`: categoryAlert tự trừ ra phần mình, nên ở đây
      // không có chỗ nào để nối lẫn "tổng đã trả" với "phần mình chịu" (xem module).
      othersShare,
      capBase: shape.capBase,
    })
  }, [
    plannedMode,
    cappedCat,
    budgetReport,
    budgetComplete,
    categories,
    amount,
    srcCurrency,
    base,
    rates,
    splitVal.others,
    shape.capBase,
  ])

  /**
   * Cổng của "Sẽ chi" là `plannedMissing` (Task 9) — KHÔNG đi qua `entryGate` chung:
   * `entryGate` luôn đòi `hasAccount` (đúng cho chín dạng còn lại, nơi mọi bút toán
   * đều trừ/cộng một ví), còn khoản sắp chi CHƯA có bút toán nào — bullet 1 của brief
   * này nói "chỉ cần một cái tên". Đưa `hasAccount` giả vào `entryGate` để né nhánh đó
   * sẽ vá được, nhưng `plannedMissing` đã LÀ đúng cổng cho state mới (`PlannedDraft`,
   * riêng biệt với `note`/`categoryId` của giao dịch thường) — dùng lại nó thay vì vá.
   */
  const plannedError = plannedMode ? plannedMissing(plannedDraft) : null

  // Một cổng duy nhất cho cả "được bấm Lưu chưa" và "còn thiếu gì" — chín dạng còn lại
  // đi qua entryValidation.ts. `EntryState` không còn field `plannedMode`: nhánh đó đã
  // xóa khỏi entryGate/kindMissing (fix round 1) vì không còn đường nào gọi tới —
  // "Sẽ chi" luôn rẽ qua `plannedMissing` ở trên, không bao giờ chạm `entryGate`.
  const gate = plannedMode
    ? { canSave: plannedError === null, missing: plannedError }
    : entryGate({
        amount,
        hasAccount: !!effectiveAccountId,
        kind,
        withTransaction,
        hasCategory,
        // Lưới rỗng ≠ chưa chọn: câu nhắc phải chỉ sang Cài đặt chứ không bảo "chọn ở
        // lưới" khi lưới không có ô nào.
        categoryGridEmpty: !hideCategoryGrid && activeOfType.length === 0,
        accountId: effectiveAccountId,
        toAccountId,
        crossCurrency,
        toAmount,
        split: splitVal,
        debt: debtValue,
        remit: remitValue,
        payment: paymentVal,
        splitBackAccountIds: splitBackAccounts.map((a) => a.id),
      })
  const canSave = gate.canSave && !saving
  const missing = saving ? null : gate.missing
  /** Họ câu ngắn "Còn thiếu: <field>." — hiển thị `sr-only`, xem chỗ render. */
  const shortMissing = missing?.startsWith('Còn thiếu: ') ?? false
  /**
   * Nhãn nút chính là MỘT TỪ, không nội suy gì vào.
   *
   * Bản trước nhắc lại việc sẽ làm ("Lưu · gửi ¥30,000 cho gia đình") để đọc lại con số
   * một lần nữa trước khi bấm. Bỏ (yêu cầu 2026-08-24): số tiền đang nằm ở ô số tiền cỡ
   * lớn và danh mục đang tô accent trong lưới, cả hai CÙNG TRÊN MÀN lúc bấm — nút chỉ
   * chép lại chúng bằng cỡ chữ nhỏ hơn. Cái giá thì thật: nhãn dài hơn bề rộng nút
   * (`flex-1` = 135px ở 375px) nên phải `line-clamp-2`, và ở cỡ chữ 1.25 hàng nút ăn tới
   * 120px chiều cao của vùng cuộn.
   *
   * Không còn nhánh `missing` ở đây: câu "Còn thiếu: …" hiện nguyên văn ở dòng ghim ngay
   * TRÊN nút, ghép lên nút là nói hai lần cùng một câu.
   *
   * Form SỬA và bản điền sẵn khoản đến hạn giữ nhãn của người gọi ("Cập nhật" / "Ghi và
   * đánh dấu đã chi"): ở đó nút không ghi một khoản mới.
   */
  const saveLabel = !plannedMode && initial ? submitLabel : 'Lưu'

  /**
   * Đang ở chế độ mà nhãn + cờ "hoàn tiền" KHÔNG lưu được (quy tắc định kỳ / Sẽ chi).
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
   *  - khoản sắp chi: planned_expense_tags (0044); cờ hoàn tiền thì không có nghĩa ở
   *    đây (chưa chi thì chưa có gì để hoàn) nên ô đó vẫn ẩn khi bật "Sẽ chi".
   */
  const refundDropped = plannedMode
  const refundNote = 'Khoản sắp chi không có cờ "hoàn tiền" (chưa chi thì chưa có gì để hoàn).'

  // Lưu mẫu: chỉ với chi/thu đã đủ số tiền + danh mục
  const canSaveTemplate = type !== 'transfer' && amount > 0 && !!categoryId
  async function saveCurrentAsTemplate() {
    // Chưa đủ thì NÓI RA, không im. Trước đây nút mang `disabled` + `disabled:opacity-40`
    // và người dùng báo "ngôi sao không bấm được" (2026-08-24) — một nút mờ đi vẫn không
    // nói ra nó THIẾU gì, mà đây là chỗ thiếu một trong ba thứ khác nhau.
    //
    // Chú thích cũ ở đây quy lỗi cho preflight Tailwind v4 ("button { opacity: 1 } ở
    // @layer base thắng utilities"). ĐO LẠI 2026-08-30 trên app đang chạy: KHÔNG tái hiện
    // được — `@layer theme, base, components, utilities` xếp utilities sau base, và một
    // <button disabled class="disabled:opacity-40"> cho ra đúng `opacity: 0.4`. Giữ cách
    // làm này vì lý do đầu (nút mờ không nói được thiếu gì), không phải vì lý do đó.
    if (!canSaveTemplate) {
      showToast(
        type === 'transfer'
          ? 'Chuyển khoản không lưu ra mẫu được — mẫu nhanh chỉ chở số tiền + danh mục.'
          : amount <= 0
            ? 'Nhập số tiền trước rồi mới lưu được mẫu.'
            : 'Chọn danh mục trước rồi mới lưu được mẫu.',
      )
      return
    }
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

  /**
   * Đổi dạng. Giữ đúng nếp của `switchType` cũ (gieo lại danh mục theo dạng mới, giữ
   * số tiền và tài khoản) và gộp luôn việc của `enterRole` cũ (khởi tạo field riêng).
   *
   * MỘT hàm cho cả mười dạng: trước đây đổi loại đi qua `switchType`, bật vai trò đi
   * qua `enterRole`, bỏ vai trò đi qua `exitRole`, đổi chiều nợ đi qua
   * `setDebtDirection` — bốn hàm làm gần cùng một việc, và mỗi hàm quên một thứ khác
   * (chỉ `switchType` xóa ô "nhận được", chỉ `enterRole` kéo màn về đầu).
   */
  function switchKind(next: EntryKind) {
    const nextShape = shapeOf(next)
    const nextType = nextShape.txType ?? (nextShape.direction === 'in' ? 'income' : 'expense')
    setKind(next)
    const last = lastCategoryFor(nextType, categories)
    setCategoryId(last)
    // Tắt "Sẽ chi": segmented Đã chi|Sẽ chi chỉ hiện ở khoản CHI thường, giữ cờ qua
    // đây là giữ một chế độ mà người dùng không còn thấy để tắt.
    setWantsPlanned(false)
    setToAccountId(null)
    setToDigits('')
    setActiveField('main')

    const prevRole = shape.roleSeed.role
    const nextRole = nextShape.roleSeed.role
    if (nextRole !== prevRole) {
      // Sang một khối field khác → gieo lại từ đầu, không mang số của khối cũ sang.
      if (nextRole === 'split') setSplitVal(initialSplit())
      if (nextRole === 'debt') setDebtVal(initialDebt())
      if (nextRole === 'remit') setRemitVal(initialRemit())
      // Khối field mới dựng thêm ô ở trên → kéo về đầu (nếp cũ của enterRole).
      if (nextRole !== 'none' || nextShape.writes === 'debtPayment') {
        scrollRef.current?.scrollTo({ top: 0 })
      }
    } else if (nextRole === 'debt') {
      // Đổi chiều nợ: giữ tên đã gõ, nhưng bỏ liên kết khoản cũ — danh sách gợi ý đi
      // theo chiều nên khoản đang chọn có thể không còn trong đó.
      setDebtVal((v) => ({ ...v, existingDebtId: null }))
    } else if (nextRole === 'remit') {
      // Đổi kiểu gửi: giữ phí/số nhận, bỏ tài khoản đích (chỉ Chuyển tài sản mới có).
      setRemitVal((v) => ({ ...v, destId: '' }))
    }
    // Repay/collect không có `roleSeed.role` riêng (bảng đặt NONE ở entryShape) nên
    // hai nhánh trên không chạm tới chúng — xử lý riêng ở đây. GIEO LẠI mỗi lần vào
    // hoặc đổi dạng trả nợ: đổi chiều (repay↔collect) thì khoản cũ sai chiều, chưa
    // từng ở dạng này thì chưa có khoản nào để giữ.
    if (nextShape.writes === 'debtPayment') setPaymentVal(initialPayment())
    // Vào dạng debtOnly: khoá công tắc giải ngân NGAY, không chờ người dùng. `roleSave`
    // cũng tự chặn (`origin !== 'earned' && v.withTransaction`) — hai lớp, vì
    // `withTransaction` là state sống qua lần đổi dạng.
    if (nextShape.writes === 'debtOnly')
      setDebtVal((v) => ({ ...v, withTransaction: false, fee: 0 }))
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
    if (activeField === 'planned.amount') {
      setPlannedDraft((v) => ({ ...v, amount: applyNumKey(v.amount, key) }))
      return
    }
    const setter = activeField === 'to' && crossCurrency ? setToDigits : setDigits
    setter((d) => appendKey(d, key))
  }

  /** Dọn form cho lần nhập kế tiếp: giữ danh mục + tài khoản + ngày, xóa số tiền + ghi chú. */
  function clearForNextEntry() {
    setDigits('')
    setToDigits('')
    setNote('')
    setToAccountId(null)
    setTransferFee(0)
    setActiveField('main')
  }

  async function handleSubmit(mode: 'save' | 'continue' = 'save') {
    // HAI dạng không ghi bút toán nào nên không đòi ví: "Sẽ chi" (chỉ cần một cái tên)
    // và "Khách nợ công" (`writes === 'debtOnly'`). Chín dạng còn lại đều ghi một bút
    // toán thật nên vẫn đòi.
    //
    // Đây là cổng THỨ HAI. Cổng thứ nhất là `entryGate` ở entryValidation — sửa một cổng
    // mà quên cổng kia thì nút Lưu sáng lên rồi bấm không có gì xảy ra: im lặng, không
    // câu báo nào, không cả một dòng console.
    const noAccountNeeded = plannedMode || debtOnly
    if (!canSave || (!noAccountNeeded && !effectiveAccountId)) return

    // MỘT định nghĩa cho cả hai nhánh lưu: nút phụ chỉ có mặt khi màn này nhận
    // `onContinue`, nên hai nhánh không được hiểu chữ "nhập tiếp" khác nhau.
    const keepGoing = mode === 'continue' && !!onContinue

    // Dạng đi qua orchestrator riêng: dựng field gốc dùng chung rồi để EntryPage lưu.
    // Chọn nhánh theo BẢNG (`roleSeed.role`), không theo một state vai trò song song.
    if (shape.roleSeed.role !== 'none' && onSubmitRole) {
      setPending(mode)
      setError(null)
      try {
        const base: RoleBase = {
          amount,
          accountId: effectiveAccountId,
          categoryId,
          // Loại tiền của KHOẢN NỢ, không phải của ví: dạng debtOnly không có ví nào,
          // nên `srcCurrency` ở đó là giá trị rơi về 'JPY' đóng cứng.
          srcCurrency: debtCurrency,
          occurredOn: date,
          note,
          tagIds: effectiveTagIds,
        }
        if (shape.roleSeed.role === 'split') {
          await onSubmitRole({ kind, role: 'split', base, value: splitVal }, keepGoing)
        } else if (shape.roleSeed.role === 'debt') {
          await onSubmitRole({ kind, role: 'debt', base, value: debtValue }, keepGoing)
        } else {
          await onSubmitRole({ kind, role: 'remit', base, value: remitValue }, keepGoing)
        }
        // Không có ví thì không ghi: `setItem(key, null)` lưu ra chuỗi "null", và lần
        // mở màn sau đi tìm một ví có id "null".
        if (effectiveAccountId) localStorage.setItem(LAST_ACCOUNT_KEY, effectiveAccountId)
        if (keepGoing) {
          clearForNextEntry()
          // Gieo lại KHỐI FIELD của dạng, không chỉ số tiền: giữ nguyên thì "phần người
          // khác" / "số nhận" của khoản TRƯỚC còn nằm đó trong khi ô số tiền đã trắng —
          // hai số không còn khớp nhau, và cổng Lưu báo lỗi trước khi người ta gõ gì.
          if (shape.roleSeed.role === 'split') setSplitVal(initialSplit())
          if (shape.roleSeed.role === 'debt') setDebtVal(initialDebt())
          if (shape.roleSeed.role === 'remit') setRemitVal(initialRemit())
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Lưu thất bại, thử lại.')
      } finally {
        setPending(null)
      }
      return
    }

    // Trả nợ / thu lại (repay/collect): ghi qua `createDebtPayment`, không qua
    // `onSubmitRole` — hai dạng này không có `roleSeed.role` (bảng đặt NONE), chúng
    // chỉ cần một khoản nợ đã chọn (paymentVal.debtId), không phải field People/Split.
    if (shape.writes === 'debtPayment' && onSubmitPayment) {
      setPending(mode)
      setError(null)
      try {
        const base: RoleBase = {
          amount,
          accountId: effectiveAccountId,
          categoryId,
          srcCurrency,
          occurredOn: date,
          note,
          tagIds: effectiveTagIds,
        }
        // Lưới an toàn: ví cùng tệ với khoản nợ thì `debtAmount` phải là null để
        // saveDebtPayment dùng chính ô tiền. DebtPickerField đã xoá khi người dùng đổi
        // ví về cùng tệ; chốt lại lần nữa ở đây vì cái giá của việc sót là một số ¥ cũ
        // lặng lẽ ghi đè số vừa gõ — không có gì trên màn báo.
        const payCross = !!payDebt && payDebt.currency !== srcCurrency
        await onSubmitPayment(
          { kind, base, value: { ...paymentVal, debtAmount: payCross ? paymentVal.debtAmount : null } },
          keepGoing,
        )
        // Không có ví thì không ghi: `setItem(key, null)` lưu ra chuỗi "null", và lần
        // mở màn sau đi tìm một ví có id "null".
        if (effectiveAccountId) localStorage.setItem(LAST_ACCOUNT_KEY, effectiveAccountId)
        if (keepGoing) {
          clearForNextEntry()
          // Gieo lại khoản nợ đã chọn: giữ nguyên thì lần nhập kế tiếp vẫn "đang trả"
          // đúng khoản đó dù ô số tiền đã trắng — số điền sẵn của khoản cũ không còn
          // khớp một lần trả MỚI.
          setPaymentVal(initialPayment())
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Lưu thất bại, thử lại.')
      } finally {
        setPending(null)
      }
      return
    }

    setPending(mode)
    setError(null)
    try {
      if (plannedMode && onSubmitPlanned) {
        // Chưa chi đồng nào: không có giao dịch nào được ghi ở nhánh này, và
        // `plannedFromEntry` không đưa `account_id` vào payload — khoản sắp chi
        // không trừ tiền của ví nào nên không cần biết trừ từ đâu.
        // Nhãn đi qua `effectiveTagIds` (TagPicker chung của cả mười dạng), KHÔNG
        // qua `plannedDraft.tagIds` — PlannedFields không có ô nhãn riêng.
        // Không có nhánh "nhập tiếp" ở đây: nút phụ đó bị ẩn khi `plannedMode`
        // (xem JSX), nên `keepGoing` không bao giờ true tới được đây.
        await onSubmitPlanned(plannedFromEntry({ ...plannedDraft, tagIds: effectiveTagIds }))
        return
      }

      // Chín dạng còn lại đều ghi một bút toán thật, luôn cần một ví — cổng ở đầu
      // hàm (`!plannedMode && !effectiveAccountId`) đã chặn trước khi tới đây, nên
      // ép kiểu non-null ở đây là đúng, không phải bỏ qua lỗi.
      const accountId = effectiveAccountId!
      const values: NewTransaction = {
        type,
        amount,
        to_amount: crossCurrency ? toAmount : null,
        category_id: type === 'transfer' ? null : categoryId,
        account_id: accountId,
        to_account_id: type === 'transfer' ? toAccountId : null,
        occurred_on: date,
        note: note.trim(),
        exclude_from_stats: type === 'transfer' ? false : excludeFromStats,
        is_refund: type === 'expense' ? isRefund : false,
        tag_ids: effectiveTagIds,
      }
      if (showTransferFee && transferFee > 0) {
        // Chuyển khoản có phí → 2 bút toán, EntryPage lo thứ tự + hoàn tác
        await onSubmitWithFee!(values, transferFee, keepGoing)
      } else {
        await (keepGoing ? onContinue!(values) : onSubmit(values))
      }
      localStorage.setItem(LAST_ACCOUNT_KEY, accountId)
      if (type !== 'transfer' && categoryId) {
        localStorage.setItem(lastCategoryKey(type), categoryId)
      }
      if (keepGoing) clearForNextEntry()
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
    // LUÔN theo `activeField`, không riêng khi màn có nhiều ô tiền (bỏ điều kiện
    // `multiAmount` cũ): numpad chỉ gõ vào MỘT ô tại một thời điểm, và ô đó chính là
    // `activeField`, bất kể màn có một hay nhiều ô tiền. Vẽ viền cho một ô không phải
    // ô numpad đang gõ vào mới là nói dối; còn "chỉ một ô tiền → khỏi cần vẽ" là bỏ sót
    // đúng lúc người dùng mới mở màn và ô CHÍNH đang là đích gõ (mặc định activeField
    // = 'main') mà không có gì trên màn nói cho họ biết điều đó.
    const isActive = activeField === field
    // `outline` chứ không `ring` (§4.6): ring của Tailwind vẽ bằng box-shadow, mà 1a bỏ
    // hẳn shadow — giữ ring là giữ đúng một cái bóng sót lại trên màn. outline cũng
    // không chiếm chỗ trong bố cục nên hai ô tiền không xê khi đổi ô đang gõ.
    //
    // `-outline-offset-2` KHÔNG phải để cho đẹp: outline vẽ NGOÀI hộp viền, mà ô này rộng
    // đúng bằng lòng của khối cuộn (`overflow-y-auto` → trục ngang thành `auto`, tức cũng
    // clip). Ở 375px ô nằm 12→363 và lòng khối cuộn cũng 12→363, nên 2px outline mỗi bên
    // rơi ra ngoài và bị cắt SẠCH — còn lại đúng hai vạch ngang, trông như cái khung mất
    // hai đầu. Kéo outline vào trong thì không còn gì để cắt, và không đổi bố cục.
    const ring = isActive ? 'outline outline-2 -outline-offset-2 outline-accent' : ''
    const result = evalExpression(expr)
    const showExpr = hasOperator(expr)
    const mobileText = showExpr ? formatExpr(expr, currency) : formatMoney(result ?? 0, currency)
    const inputValue = result && result !== 0 ? formatMoney(result, currency) : ''
    // Chưa nhập gì (0 và không có phép tính) → làm mờ như gợi ý, tránh nhầm là đã có số
    const isEmpty = !showExpr && (result ?? 0) === 0
    // Tách ký hiệu tiền (¥ / ₫ / $ …, gộp cả dấu trừ nếu có) ra khỏi phần số để làm mờ
    // riêng — một ô nhập thật không tô cùng mực cho đơn vị tiền và con số người ta đang
    // gõ. Chỉ bóc phần ĐẦU/CUỐI của chuỗi hiển thị: ở dạng biểu thức (nhiều số hạng, mỗi
    // số hạng tự mang ký hiệu qua formatExpr) chỉ số hạng đầu/cuối bị bóc — đủ để ô đọc
    // như "đang gõ" mà không cần viết một bộ phân tích cú pháp biểu thức riêng.
    const leadSign = mobileText.match(/^[^\d]+/)?.[0] ?? ''
    const trailSign = mobileText.match(/[^\d]+$/)?.[0] ?? ''
    const body = mobileText.slice(leadSign.length, mobileText.length - trailSign.length)
    return (
      <div className="flex flex-col gap-0.5">
        {label && <span className="px-1 text-sm text-fg-muted">{label}</span>}
        <button
          type="button"
          onClick={() => setActiveField(field)}
          aria-label={`${label ?? 'Số tiền'}: ${mobileText}`}
          // 30px mono/600 canh phải (§4.6). rem chứ không px: Cài đặt → Cỡ chữ chỉ co
          // giãn được cái tính theo rem. Ô nhập của 1a là `--surface` + viền control,
          // bán kính 8px, KHÔNG bóng.
          className={`truncate rounded-md border border-border-strong bg-surface px-4 py-2.5 text-right font-mono font-semibold tracking-number ${
            showExpr ? 'text-xl' : 'text-hero'
          } ${isEmpty ? 'text-fg-muted' : amountColor} ${ring} lg:hidden`}
        >
          {leadSign && (
            <span data-currency-sign className="text-fg-muted">
              {leadSign}
            </span>
          )}
          {body}
          {isActive && (
            // Caret giả: ô này là <button>, không phải input thật, nên trình duyệt
            // không tự vẽ con trỏ nháy — mà đây chính là ô numpad app đang gõ vào, nên
            // vẫn cần tín hiệu đó. `bg-current` ăn theo mực của số (accent lúc có tiền,
            // fg-muted lúc rỗng) để không lệch tông với chữ nó đứng cạnh.
            <span
              aria-hidden
              className="ml-0.5 inline-block h-[1.1em] w-px animate-pulse bg-current align-middle"
            />
          )}
          {trailSign && (
            <span data-currency-sign className="text-fg-muted">
              {trailSign}
            </span>
          )}
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
          // Ô tiền CHÍNH tự nhận tiêu điểm khi mở màn (desktop). Không có nó thì ô 30px
          // ngay đầu màn đứng trống, không con trỏ nháy, không viền sáng — đọc thành một
          // dải trang trí chứ không phải chỗ gõ, và người dùng phải bấm vào mới nhập được
          // dù đây là việc DUY NHẤT của màn. Trên mobile không đụng tới: ở đó ô này bị
          // `hidden`, chỗ gõ là nút chạm + bàn phím số của app.
          // Chỉ ô 'main' — `autoFocus` trên ô "nhận được" của CK xuyên tệ sẽ cướp tiêu
          // điểm khỏi ô đứng trước nó.
          autoFocus={field === 'main'}
          value={inputValue}
          onChange={(e) => {
            const parsed = String(parseMoney(e.target.value))
            setDigitsFn(parsed === '0' ? '' : parsed.slice(0, MAX_AMOUNT_DIGITS))
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit()
          }}
          placeholder={formatMoney(0, currency)}
          // Viền nhấn khi gõ: `outline-2 outline-accent` (§4.6 — outline chứ không ring,
          // 1a bỏ hẳn shadow). `outline-accent` một mình chỉ đặt MÀU cho viền mặc định
          // của trình duyệt, mà viền đó mỗi trình duyệt một bề dày — ô chính của màn thì
          // không để trình duyệt quyết định nó dày mỏng ra sao.
          className={`hidden rounded-md border border-border-strong bg-surface px-4 py-3 text-right font-mono text-hero font-semibold tracking-number focus:outline-2 focus:-outline-offset-2 focus:outline-accent lg:block ${amountColor}`}
        />
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Vùng cuộn: mọi nội dung nhập. Đáy (NumPad + nút Lưu) được ghim riêng bên
          dưới nên không bao giờ bị đẩy khuất — kể cả khi một dạng thêm field.
          Trên lg không có numpad, vùng này thôi giành hết chỗ trống (flex-initial)
          để nút Lưu nằm ngay dưới nội dung thay vì ghim tận đáy màn hình. */}
      {/* HAI CỘT từ lg (§B13): trái = số tiền + danh mục (hai bước bắt buộc), phải = nhãn,
          ghi chú, hoàn tiền (những thứ tùy chọn). Trước đây cả form là một cột 640px giữa
          màn, hai bên đen: ở 1440px đo được 764px bỏ không, tức hơn nửa màn trống trong khi
          lưới danh mục bên dưới phải cuộn.

          KHÔNG đổi luồng, không đổi thứ tự field, không biến thành modal — bản `3a` đi
          đường đó và đã bị bỏ; bản đúng là `5a`. Chia cột bằng hai wrapper `contents`
          (đúng lối BudgetView): dưới lg chúng nhả con thẳng ra flex-col nên DOM phẳng ra
          y như cũ, tức thứ tự đọc, thứ tự tiêu điểm và cách cuộn trên điện thoại không
          đổi một ly. Từ lg mới thành lưới — và thứ tự tiêu điểm vẫn là trái-rồi-phải,
          đúng thứ tự nhìn thấy, nên không cần `order-*` (WCAG 2.4.3).

          Cột phải hẹp hơn (20rem): những ô bên đó là chữ một dòng, kéo dài ra chỉ tổ làm
          dòng chữ khó dò về đầu hàng. */}
      {/* `overflow-x-hidden` VIẾT RA, không để mặc: `overflow-y-auto` một mình KHÔNG clip
          trục ngang như mấy chú thích cũ trong file này (và tests/designSystem.test.ts)
          đang nói. Luật CSS là `visible` ở một trục sẽ tính lại thành `auto` khi trục kia
          không phải `visible` — tức trục ngang thành MỘT VÙNG CUỘN THẬT, kéo được bằng
          ngón tay. Hệ quả: một ô nhô ra vài px là cả form panning ngang trên điện thoại,
          đúng triệu chứng của "Sẽ chi" (báo 2026-08-21) — trong khi "Đã chi" không nhô nên
          không ai thấy. Đặt `hidden` là biến clip-tưởng-tượng thành clip thật: dọc vẫn
          cuộn, ngang hết kéo.
          KHÔNG ảnh hưởng hai dải cuộn ngang CÓ CHỦ Ý bên trong (hàng mẫu nhanh, lưới danh
          mục): chúng tự mang `overflow-x-auto` nên vẫn là vùng cuộn riêng. */}
      <div
        ref={scrollRef}
        className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto overflow-x-hidden lg:grid lg:flex-initial lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] lg:items-start lg:gap-x-4"
      >
      <div className="contents lg:flex lg:flex-col lg:gap-1.5">
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
                  className="flex items-center gap-1 rounded-full border border-border-strong bg-surface py-1.5 pl-3 pr-6 text-sm font-medium text-fg-secondary transition active:scale-95"
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

      {/* MỘT bộ chọn loại, không ba. Trước đây chỗ này là ba bộ segmented loại trừ
          nhau (loại giao dịch / chiều nợ / kiểu gửi tiền) cộng một dropdown portal ra
          tiêu đề màn hình — bốn phần tử trả lời cùng MỘT câu hỏi "khoản này là khoản
          gì", và cùng một ô trên màn mang ba nghĩa khác nhau tùy chế độ.
          Form SỬA không có mười dạng (xem PLAIN_KINDS) nên ở đó chỉ còn hàng Hướng. */}
      {enableRoles ? (
        <DirectionTabs kind={kind} onChange={switchKind} />
      ) : (
        <SegmentedControl
          size="lg"
          items={PLAIN_KINDS.map((k) => ({ value: k, label: DIRECTION_LABEL[directionOf(k)] }))}
          value={kind}
          onChange={switchKind}
          label="Hướng tiền"
        />
      )}

      {/* Một dòng RIÊNG, ô 44px+ (size="lg") — không nhét vào hàng tài khoản/ngày như
          nút chuông cũ (đã xóa). "Đã chi" là TRẠNG THÁI CỦA KHOẢN TIỀN, khác hẳn một
          việc app tự làm cho bạn — hai câu hỏi khác nhau, nên tách khỏi hàng đó.
          Chỉ hiện ở khoản CHI thường (`kind === 'spend'`), giống đúng cổng của nút
          chuông cũ: `planned_expenses` chưa có cột phân biệt Chi/Thu/Chuyển khoản, nên
          bật "Sẽ thu"/"Sẽ chuyển" ở các dạng khác sẽ ghi ra một khoản trông y hệt "Sẽ
          chi" — nhãn nói một việc, bảng ghi một việc khác. */}
      {!initial && onSubmitPlanned && kind === 'spend' && (
        <SegmentedControl
          size="lg"
          label="Khoản này đã xảy ra chưa"
          value={plannedMode ? 'future' : 'done'}
          onChange={(v) => {
            setWantsPlanned(v === 'future')
            // Đích gõ đi theo màn, hai chiều:
            // → "Sẽ chi": nhắm ngay ô "Ước tính" — ô ĐẦU TIÊN của màn đó kể từ
            //   2026-08-20 (PlannedFields đảo "Ước tính" lên trước "Chi cái gì"), nên
            //   bàn số ghim đáy có sẵn cho việc đầu tiên người dùng muốn làm. Trước đây
            //   phải chạm ô mới có, mà cùng lúc ô "Chi cái gì" `autoFocus` bật bàn phím
            //   chữ — mở màn ra là hai thứ tranh nhau chỗ ở đáy.
            // → "Đã chi": trả về ô chính. Thiếu nửa này thì lật "Sẽ chi" → "Đã chi"
            //   trong lúc đang gõ ô "Ước tính" sẽ để `activeField` mắc ở
            //   'planned.amount': bàn số hiện lại (vì `!plannedMode`) nhưng mọi phím gõ
            //   vào `plannedDraft.amount` — ô số tiền trên màn đứng im, số chạy vào một
            //   khoản đã rời khỏi màn.
            setActiveField(v === 'future' ? 'planned.amount' : 'main')
          }}
          items={[
            { value: 'done', label: PHASE_LABEL[shape.direction].done },
            { value: 'future', label: PHASE_LABEL[shape.direction].future },
          ]}
        />
      )}

      {plannedMode ? (
        <>
          {/* Chip cảnh báo: khoản này CHƯA xảy ra — không đụng tới ví, không đụng tới
              trần ngân sách, không đụng tới bất kỳ con số Báo cáo nào của kỳ này. */}
          <div className="mb-1.5 flex items-center gap-2 px-1">
            <span className="shrink-0 rounded-full bg-state-warn-bg px-2 py-0.5 text-sm font-semibold text-state-warn-fg">
              chưa xảy ra
            </span>
            <span className="text-sm text-fg-muted">Chưa trừ tiền, chưa vào trần.</span>
          </div>
          <PlannedFields
            value={plannedDraft}
            onChange={setPlannedDraft}
            categories={categories}
            amountActive={activeField === 'planned.amount'}
            onFocusAmount={() => setActiveField('planned.amount')}
            // 'main' ở đây nghĩa là "không ô nào của màn này" — `padShown` đọc
            // `activeField === 'planned.amount'`, nên trả đích về ô chính (ô đang bị
            // `plannedMode` ẩn) là cách ẩn bàn số mà không cần thêm một giá trị 'none'
            // vào `AmountTarget`. Cùng đúng giá trị mà màn này mở ra đã có.
            onLeaveAmount={() => setActiveField('main')}
          />
        </>
      ) : (
        <>
          {/* Số tiền (nguồn); CK xuyên tệ có thêm ô "nhận được". Nhãn đọc từ bảng — mỗi
              dạng gọi số tiền của nó bằng đúng tên của nó ("Tổng đã trả", "Số gửi", "Số
              trả"). */}
          {debtOnly ? (
            // Ô loại tiền đứng CẠNH ô số tiền: dạng này không có ví nào để suy ra loại
            // tiền, nên nó phải là một lựa chọn nhìn thấy được ngay chỗ gõ số.
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                {amountBox('main', digits, debtCurrency, setDigits, shape.amountLabel)}
              </div>
              <Select
                value={owedCurrency}
                onChange={(e) => setOwedCurrency(e.target.value as CurrencyCode)}
                aria-label="Loại tiền của khoản nợ" wrapClassName="w-24 shrink-0">
                {Object.keys(CURRENCIES).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </div>
          ) : (
            <>
              {amountBox('main', digits, srcCurrency, setDigits, shape.amountLabel)}
              {crossCurrency &&
                amountBox('to', toDigits, dstCurrency, setToDigits, `Nhận được (${dstCurrency})`)}
            </>
          )}

          {/* Tài khoản + ngày — ẨN ở "Sẽ chi": khoản chưa xảy ra thì chưa trừ ví nào,
              và PlannedFields có ô ngày riêng của nó (Ngày đến hạn/Tháng dự kiến).
              ẨN luôn ở "Khách nợ công": không bút toán nào nên không có ví nào để trừ,
              và hạn trả nằm ở ô "Hạn" của khối nợ. Cả hàng đi cùng nhau vì ngày ở đây
              là ngày của BÚT TOÁN — không có bút toán thì bày nó ra là hỏi một câu mà
              câu trả lời không đi đâu cả. */}
          {!debtOnly && (
          <div className="flex flex-wrap items-center gap-2">
            {/* `kind === 'between'` chứ không `type === 'transfer'`: "Tài khoản tôi ở VN"
                cũng là chuyển khoản nhưng ví đích của nó là ô "Đến tài khoản VND" trong
                khối field riêng — bày thêm một picker đích ở đây là hỏi hai lần cùng một
                chỗ đến. */}
            {kind === 'between' ? (
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
                // `min-w-[7rem]` như hai picker của chuyển khoản ngay trên, KHÔNG phải
                // `min-w-0`: hàng này có ô ngày rộng 7.5rem cố định, nên ở cỡ chữ "Rất lớn"
                // trên màn 375px cái ô ngày ăn hết chỗ và picker bị bóp còn 36px — chỉ đủ hai
                // cái icon, tên tài khoản mất sạch. Có sàn thì `flex-wrap` của hàng cha mới
                // có việc để làm: picker xuống dòng riêng thay vì teo lại (§13).
                className="min-w-[7rem] flex-1"
              />
            )}
            <DateField
              value={date}
              onChange={setDate}
              ariaLabel="Ngày giao dịch"
              className="w-[7.5rem] shrink-0"
            />
          </div>
          )}
        </>
      )}
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
      {/* Field riêng của từng DẠNG — nằm ngay dưới số tiền/tài khoản.
          Ba cổng dưới đây quyết định FIELD NÀO HIỆN Ở DẠNG NÀO, và bản đồ này phải khớp
          `roleSeed` trong entryShape: split→SplitFields · lend|borrow→DebtFields ·
          family|ownvn→RemitFields. Map sai là bug im lặng (form hiện đúng nhưng ghi sai). */}
      {remitLike && pickerAccounts.length === 0 && (
        <p className="rounded-lg border border-state-bad-border bg-state-bad-bg px-3 py-2 text-sm text-state-bad-fg">
          Chưa có tài khoản JPY. Hãy tạo một tài khoản JPY trước khi gửi tiền về VN.
        </p>
      )}
      {kind === 'split' && (
        <SplitFields
          value={splitVal}
          onChange={setSplitVal}
          total={amount}
          currency={srcCurrency}
          people={splitPeople}
          backAccounts={splitBackAccounts}
          sourceName={srcAccountName}
          counterpartyLabel={counterpartyLabelOf(kind)}
          othersActive={activeField === 'split.others'}
          onFocusOthers={() => setActiveField('split.others')}
          onEnter={() => handleSubmit()}
        />
      )}
      {(kind === 'lend' || kind === 'borrow' || debtOnly) && (
        <DebtFields
          value={debtValue}
          onChange={setDebtVal}
          // Dạng này KHÔNG BAO GIỜ giải ngân → công tắc "ghi giao dịch thật" và ô Phí
          // biến mất. Không dựa vào `canRecordReal` (nó đã false vì chưa có ví): cái đó
          // nói "chưa chọn được ví", còn đây nói "dạng này không có việc đó".
          canRecordReal={!debtOnly && canRecordReal}
          // `neverDisburses` chứ không chỉ `canRecordReal=false`: cái sau chỉ làm mờ công
          // tắc và để lại câu "Chưa có tài khoản để tạo giao dịch thật" — câu đó mời
          // người dùng đi tạo ví để bật một việc mà dạng này không bao giờ có, và ô
          // "+ Phí" (phí GIẢI NGÂN) cũng vẫn còn đó.
          neverDisburses={debtOnly}
          people={debtPeople}
          currency={debtCurrency}
          counterpartyLabel={counterpartyLabelOf(kind)}
          feeActive={activeField === 'debt.fee'}
          onFocusFee={() => setActiveField('debt.fee')}
          onEnter={() => handleSubmit()}
        />
      )}
      {(kind === 'family' || kind === 'ownvn') && (
        <RemitFields
          value={remitValue}
          onChange={setRemitVal}
          sent={amount}
          vndAccounts={vndAccounts}
          services={SERVICES}
          feeActive={activeField === 'remit.fee'}
          receivedActive={activeField === 'remit.received'}
          onFocusFee={() => setActiveField('remit.fee')}
          onFocusReceived={() => setActiveField('remit.received')}
          onEnter={() => handleSubmit()}
          rate={remitRate}
          rateAge={remitRateAge}
          relatives={relativesActive}
          onAddRelative={() => setRelativeSheet(true)}
        />
      )}
      {/* Trả nợ / thu lại: DẠNG DUY NHẤT có field phụ thuộc nhau (chọn nợ trước, chọn
          ví sau — xem pickerAccounts/payDebt ở trên). Đặt CÙNG chỗ các khối field
          riêng khác (dưới ô số tiền + tài khoản/ngày), không phải trên — hai hàng đầu
          (segmented + Dạng) đứng y một chỗ ở mọi dạng.
          Cổng đọc `shape.writes === 'debtPayment'` — CÙNG cổng với `pickerAccounts`
          ngay trên (không đọc `kind === 'repay' || kind === 'collect'` viết tay ở
          đây): hai cổng từng lệch tên, và một dạng debtPayment mới sau này sẽ bị
          lọc ví mà không có picker để chọn nợ. */}
      {shape.writes === 'debtPayment' && (
        <DebtPickerField
          value={paymentVal}
          onChange={(next, prefillAmount) => {
            setPaymentVal(next)
            if (prefillAmount !== undefined) setDigits(String(prefillAmount))
          }}
          debts={allDebts}
          payments={allDebtPayments}
          // out (tiền ra) = mình trả nợ đang MANG (i_owe); in (tiền vào) = người ta trả
          // lại khoản họ ĐANG NỢ MÌNH (owed_to_me). Đọc từ `shape.direction` (bảng
          // entryShape) thay vì so `kind` viết tay — cùng lý do gộp cổng ở trên.
          direction={shape.direction === 'out' ? 'i_owe' : 'owed_to_me'}
          // Ô tiền lớn của form đọc theo tệ VÍ, nên picker phải biết tệ đó để hỏi
          // thêm số xoá nợ khi hai bên lệch tệ.
          accountCurrency={srcCurrency}
          amount={amount}
          base={base}
          rates={rates ?? {}}
        />
      )}

      {/* Danh mục — MỘT điều kiện, đọc từ bảng: chỉ dạng nào `categoryPicker === 'user'`
          mới bày lưới (xem hideCategoryGrid). Ẩn thêm ở "Sẽ chi": PlannedFields đã có
          ô "Danh mục" riêng của nó (một <select>, không phải lưới — số lượng khoản
          sắp chi trên màn nhỏ hơn nhiều so với giao dịch, không cần bấm nhanh bằng
          lưới). */}
      {!plannedMode && !hideCategoryGrid && (
        <CategoryRow
          categories={activeOfType}
          recent={recentCats}
          value={categoryId}
          onChange={setCategoryId}
          emptyNote={emptyGridNote}
        />
      )}

      {/* Cảnh báo trần — NGAY DƯỚI hàng danh mục, vì nó nói về đúng danh mục vừa chọn.
          (Thứ tự dọc của spec đặt nó giữa hàng danh mục và hàng tài khoản+ngày; bản cài
          này để hàng tài khoản+ngày ở TRÊN lưới danh mục, nên "ngay dưới hàng danh mục"
          là chỗ duy nhất giữ đúng quan hệ đó.)
          KHÔNG gác theo `hideCategoryGrid`: `Gửi gia đình` ẩn lưới (app tự gán danh mục)
          mà bảng vẫn ghi `capBase: 'full'` cho nó. Cổng thật là `cappedCategory`: nó im
          lặng khi danh mục được gán mang `kind = 'transfer'` — mặc định của migration 0046,
          và đổi được ở tấm sửa danh mục.
          Token `state-warn-*` chứ không ba hex của spec: tầng token là chỗ DUY NHẤT được
          viết hex (§index.css), và cặp token có sẵn cả bản sáng lẫn bản tối, trong khi
          spec chỉ cho ba giá trị dark. */}
      {capWarning && (
        <p className="flex min-h-11 items-center gap-2 rounded-lg border border-state-warn-border bg-state-warn-bg px-3 py-2 text-sm text-state-warn-fg">
          <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden />
          {capWarning}
        </p>
      )}

      </div>

      {/* ----- CỘT PHẢI (từ lg) ----- */}
      <div className="contents lg:flex lg:flex-col lg:gap-1.5">
      {/* Dải 12 tháng: CHỈ desktop (`hidden lg:block`), không phải "mở/đóng như showMore" —
          `hidden` bằng display:none nên không tốn một pixel chiều cao nào ở luồng cuộn
          mobile (task-13-brief: màn đã tràn 27px, không được cộng thêm). Đặt ở ĐẦU cột
          phải để ngang hàng với ô số tiền, không phải cuộn xuống mới thấy. */}
      {remitLike && remitMonthStrip && (
        <div className="hidden lg:block">
          <RemitMonthStrip strip={remitMonthStrip} currency={base} />
        </div>
      )}
      {/* Dưới lưới danh mục: những thứ tùy chọn/hiếm dùng (ghi chú, nhãn, hoàn tiền).
          Danh mục là bước bắt buộc của mọi giao dịch nên phải nằm trong tầm nhìn đầu
          tiên — ghi chú chen ở trên vừa tách hai bước bắt buộc (tiền → danh mục),
          vừa dễ chạm nhầm làm bàn phím hệ thống bật lên che numpad.
          Từ lg khối này sang cột phải: ở đó nó nằm NGANG hàng với ô tiền, không còn phải
          cuộn qua cả lưới danh mục mới thấy. */}
      {/* Ẩn ở "Sẽ chi": PlannedFields đã có ô "Ghi chú" riêng của nó, và "Lưu mẫu" chở
          một PHÉP GIAO DỊCH (số tiền + danh mục + tài khoản) — khoản sắp chi không có
          cái nào trong ba thứ đó là bắt buộc. */}
      {/* Mobile: gộp ghi chú + khối Nhãn + hoàn tiền (44+68+44=156px) vào MỘT hàng
          44px, bung tại chỗ khi bấm — thu một mình lưới danh mục KHÔNG đủ vừa màn
          360×780 (xem ngân sách chiều cao ở task-13-brief), phải thu cả ba khối này.
          Từ lg đây là cột phải riêng, không tranh chỗ với lưới danh mục nữa nên luôn
          hiện đủ — `lg:flex` ép mở bất kể `showMore`. */}
      <button
        type="button"
        onClick={() => setShowMore((v) => !v)}
        aria-expanded={showMore}
        className="flex min-h-11 items-center justify-between rounded-md border border-border-strong bg-surface px-3 text-sm text-fg-secondary lg:hidden"
      >
        Nhãn, ghi chú
        <ChevronDown className={`h-4 w-4 transition-transform ${showMore ? 'rotate-180' : ''}`} />
      </button>

      <div className={`${showMore ? 'flex' : 'hidden'} flex-col gap-1.5 lg:flex`}>
      {/* NHÃN ĐỨNG TRƯỚC GHI CHÚ (yêu cầu 2026-08-24). Hai ô này trả lời hai câu khác
          nhau: nhãn là thứ Báo cáo lọc được, ghi chú là chữ chỉ người đọc lại mới hiểu.
          Cái nào lọc được thì đứng trước — nó là việc thường làm, ghi chú là việc thỉnh
          thoảng. Trên mobile nó còn là ô ĐẦU của khối vừa bung ra, nên tay không phải
          lướt qua một ô chữ để tới nó. */}
      {/* KHÔNG còn gác bởi dạng nào: `RoleBase.tagIds` đã thông đường xuống cả ba
          orchestrator, nên nhãn đi theo được ở cả mười dạng. Trước đây ô này ẩn ở 5/10
          dạng — kể cả Trả hộ, đúng chỗ cần nhãn "ai" nhất. */}
      <TagPicker value={effectiveTagIds} onChange={setTagIds} />

      {!plannedMode && (
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
          className="min-w-0 flex-1 rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg-secondary"
        />
        {/* "Lưu mẫu" ở ô cố định cạnh ghi chú: không nhảy layout như khi tự chèn
            hàng chip ở đầu form. */}
        {/* KHÔNG `disabled` nữa (báo 2026-08-24: "ngôi sao không bấm được"). Nút luôn
            nhận cú bấm và TỰ NÓI ra nó còn thiếu gì — xem saveCurrentAsTemplate; trạng
            thái sẵn/chưa sẵn vẫn đọc được qua ngôi sao rỗng ↔ đầy. */}
        {/* Mẫu nhanh chỉ chở được số tiền + danh mục + tài khoản, nên chỉ mở ở những
            dạng ghi MỘT giao dịch thường; các dạng khác lưu ra mẫu là mất field riêng. */}
        {enableTemplates && shape.roleSeed.role === 'none' && shape.writes === 'transaction' && (
          <IconButton
            onClick={saveCurrentAsTemplate}
            aria-label="Lưu thành mẫu nhanh"
            title="Lưu thành mẫu nhanh (cần số tiền + danh mục)"
            className="shrink-0"
          >
            <Star className="h-4 w-4 text-amber-400" fill={canSaveTemplate ? 'currentColor' : 'none'} />
          </IconButton>
        )}
      </div>
      )}

      {/* Hoàn tiền — chỉ có nghĩa với khoản CHI.
          `mt-1.5` (cột cuộn đã có gap-1.5 → thành 12px): tách khỏi khối Nhãn ngay trên.
          Không kẻ vạch — trong form này các khối chỉ cách nhau bằng khoảng trống. */}
      {/* `showRefundOption` (mặc định TẮT, 2026-08-24): ô này gần như không được dùng ở
          trang Nhập, mà nó ngồi giữa đường đi thường ngày với một đoạn Guide ba dòng.
          Chỉ sheet SỬA bật nó — đánh dấu hoàn tiền là việc nhớ ra SAU khi đã ghi ("à,
          khoản kia là tiền trả hàng"), nên chỗ đúng của nó là lúc mở lại giao dịch, không
          phải lúc gõ số. Không xóa hẳn: cột `is_refund` và cả đường tính vẫn sống.
          Cờ này cũng chỉ sống được trên một GIAO DỊCH — khoản sắp chi (NewPlannedExpense)
          không có cột nào giữ nó, nên ở "Sẽ chi" ô đó ẩn kèm một dòng nói vì sao
          (`refundNote`), cùng cách xử với ô "+ Phí" của chuyển khoản. */}
      {/* `kind === 'spend'` chứ không `txType === 'expense'`: Trả hộ / Gửi gia đình /
          Cho vay cũng là bút toán chi, nhưng roleSave KHÔNG ghi cờ hoàn tiền — bày ô đó
          ra ở những dạng ấy là nhận một lựa chọn rồi âm thầm bỏ. */}
      {showRefundOption && kind === 'spend' && !refundDropped && (
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
            <Guide as="span" className="block text-sm text-fg-muted">
              Trả hàng, hủy vé, hoàn phí… Tiền quay lại ví và TRỪ vào chi của danh mục đã chọn, thay
              vì bị tính thành thu nhập.
            </Guide>
          </span>
        </label>
      )}

      {/* Cùng cổng `showRefundOption`: câu này giải thích vì sao MỘT Ô ĐANG BIẾN MẤT, nên
          ở màn Nhập (nơi ô đó chưa bao giờ hiện) nó là lời giải thích cho cái không ai
          thấy — chỉ thêm một dòng chữ vào đúng màn đang muốn gọn lại. */}
      {showRefundOption && kind === 'spend' && refundDropped && (
        <p className="px-1 text-sm text-fg-muted">{refundNote}</p>
      )}
      </div>

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

      {/* ĐÃ BỎ (2026-08-24) dòng "Khoản này lặp lại? → Tạo quy tắc".
          Nó là một lối tắt sang /recurring đặt ở cuối form Nhập. Nhưng nó KHÔNG mang gì
          sang được (số tiền, danh mục, ví đang gõ đều rơi lại đây) nên nó không tiết kiệm
          một bước nào — nó chỉ đặt một câu hỏi mới vào cuối một việc đang làm dở, ở đúng
          chỗ đáng lẽ chỉ còn nút Lưu. Ai cần quy tắc định kỳ thì vào thẳng màn đó.
          Đường sang /recurring vẫn còn ở menu và ở Cài đặt. */}

      </div>

      </div>
      {/* Đáy ghim: NumPad + lỗi + nút Lưu — luôn hiển thị, không bị nội dung đẩy khuất.
          Nằm NGOÀI lưới hai cột: nút Lưu là hành động của cả form, không thuộc cột nào. */}
      <div className="flex shrink-0 flex-col gap-1.5 pt-1.5">
      {/* NumPad chỉ trên mobile. Ô tiền phụ không nhận phép tính → mờ ÷×−+.
          Ở "Sẽ chi" nó đi theo đích gõ: bật "Sẽ chi" là đích nhảy vào ô "Ước tính" (ô đầu
          của màn đó) nên bàn số có ngay; chạm sang một ô chữ thì đích rời đi và 188px trả
          lại cho vùng cuộn. Lúc gõ nó vào `plannedDraft.amount` chứ không vào `digits`,
          nên không còn cảnh số âm thầm hiện ra khi lật về "Đã chi".
          Đây là MỘT bàn số cho cả màn: trước đây ô "Ước tính" dùng
          `components/MoneyField`, cái đó tự dựng một bàn số inline thứ hai ngay giữa form
          với nút "Thu bàn phím" riêng — hai kiểu bàn số trên một màn. */}
      {padShown && (
      <div className="lg:hidden">
        <NumPad onKey={onNumPadKey} opsDisabled={activeField !== 'main' && activeField !== 'to'} />
      </div>
      )}

      {error && <p role="alert" className="text-sm text-money-out">{error}</p>}
      {/* Lý do nút Lưu còn mờ — ghim cạnh nút để không bao giờ bị cuộn khuất.
          Nhưng họ câu "Còn thiếu: <field>." thì chỉ còn `sr-only`: nút Lưu đã mờ và ô
          còn trống nằm ngay trên màn, nên câu đó không nói thêm gì cho MẮT. Vẫn ở lại
          trong DOM vì với trình đọc màn hình thì "nút mờ" không tự giải thích được — bỏ
          hẳn là lấy đi lý do duy nhất của đúng nhóm không thấy được ô nào đang trống.
          Họ câu HOÀN CHỈNH ("Tài khoản đến đang trùng tài khoản nguồn.", câu 130 ký tự
          của Trả hộ) thì VẪN HIỆN: chúng nói một ràng buộc không đoán ra được bằng cách
          nhìn quanh màn. */}
      {!error && missing && (
        <p className={shortMissing ? 'sr-only' : 'px-1 text-sm text-fg-warn'}>{missing}</p>
      )}

      {/* Hàng nút: ⌫ (chỉ mobile, thay cho hàng xóa lùi riêng) + Lưu và nhập tiếp / Lưu */}
      <div className="flex gap-2">
        {/* Cùng cổng `padShown` với NumPad ngay trên: ⌫ là phím CỦA numpad, để lại một
            mình thì nó gõ vào một ô không có bàn số nào đang mở. */}
        {padShown && (
        <button
          type="button"
          onClick={() => onNumPadKey('⌫')}
          aria-label="Xóa"
          className="flex shrink-0 items-center justify-center rounded-md border border-border-strong bg-surface-sunken px-5 text-lg font-semibold text-fg-primary transition active:scale-95 active:bg-surface lg:hidden"
        >
          <Delete className="h-5 w-5" />
        </button>
        )}
        {/* MỘT layout ở cả 10 dạng. Trước đây Chi/Chuyển khoản có hai nút còn ba chế độ
            đặc biệt có một nút full-width — cùng hành động mà đổi vị trí giữa các chế độ,
            nên tay phải tìm lại nút Lưu mỗi lần đổi loại.
            Điều kiện `onContinue` KHÔNG phải điều kiện theo dạng: nó nói màn này CÓ nhập
            liên tục hay không (form sửa và bản ghi khoản đến hạn thì không — ở đó "nhập
            tiếp" không có nghĩa gì, và với khoản đến hạn nó còn bỏ sót việc đẩy con trỏ kỳ).
            Ở màn Nhập nó luôn có, nên hai nút có mặt ở đủ mười dạng.
            Nút phụ hẹp hơn từ lg; dưới lg chia đôi, vì 12.5rem + ⌫ ở 360px chỉ còn ~60px
            cho nút CHÍNH — nhãn "Lưu · chi ¥3,480 vào Cơm ngoài" vỡ thành năm dòng. */}
        {onContinue && !plannedMode && (
          <button
            type="button"
            onClick={() => handleSubmit('continue')}
            disabled={!canSave}
            className="flex-1 rounded-md border border-state-good-border bg-transparent px-1 py-3 text-sm font-semibold text-money-in transition enabled:active:scale-95 enabled:hover:bg-state-good-bg disabled:border-border-subtle disabled:text-fg-disabled lg:w-[12.5rem] lg:flex-none lg:text-base"
          >
            {pending === 'continue' ? 'Đang lưu…' : 'Lưu và nhập tiếp'}
          </button>
        )}
        <button
          type="button"
          onClick={() => handleSubmit('save')}
          disabled={!canSave}
          className="min-w-0 flex-1 rounded-md bg-accent px-1 py-3 text-sm font-semibold text-fg-on-accent transition enabled:active:scale-95 enabled:hover:bg-accent-hover disabled:bg-accent-muted-bg disabled:text-accent-muted-fg lg:text-base"
        >
          {/* `line-clamp-2` giờ là LƯỚI AN TOÀN, không phải cơ chế thường ngày: nhãn khi
              thiếu field đã rút về 'Lưu', nên trạng thái mở màn không còn vỡ dòng. Còn lại
              câu nhắc việc ("Lưu · gửi ¥30,000 cho gia đình") — nó vẫn dài hơn 135px của
              nút ở 375px, và ở `--app-font-scale` 1.25 thì dài thêm nữa. Chặn hai dòng để
              khối GHIM đáy không ăn chiều cao vùng cuộn: đo được 120px hàng nút ở 320px
              khi chưa chặn. */}
          <span className="line-clamp-2">{pending === 'save' ? 'Đang lưu…' : saveLabel}</span>
        </button>
      </div>
      </div>
      {relativeSheet && (
        <NguoiThanSheet
          relative={null}
          onClose={() => setRelativeSheet(false)}
          onSaved={(r) => setRemitVal((v) => ({ ...v, recipientId: r.id }))}
        />
      )}
    </div>
  )
}
