import type { DebtDirection, TransactionType } from '../../types/database.types'
import type { EntryRole } from './entryRoles'

/**
 * Trục của màn Nhập: tiền ra · tiền vào · đổi chỗ.
 *
 * KHÔNG phải Chi · Thu · Chuyển khoản. Trục cũ vỡ ở hai chỗ: "gửi cho gia đình"
 * bị xếp vào Chuyển khoản dù tiền RỜI KHỎI tài sản (chuyển khoản là tiền vẫn còn
 * của bạn, chỉ đổi chỗ), và "mình nợ" bị xếp vào Chuyển khoản dù số dư TĂNG.
 */
export type Direction = 'out' | 'in' | 'move'

export const DIRECTION_LABEL: Record<Direction, string> = {
  out: 'Tiền ra',
  in: 'Tiền vào',
  move: 'Đổi chỗ',
}

/**
 * Mười dạng giao dịch. `between` chứ không `move` để tên dạng không trùng chữ với
 * một giá trị của Direction — đọc `kind === 'move' && direction === 'move'` thì
 * không ai biết đang so cái nào.
 */
export type EntryKind =
  | 'spend' | 'split' | 'family' | 'lend' | 'repay'
  | 'earn' | 'collect' | 'borrow'
  | 'between' | 'ownvn'

/**
 * `user`  = lưới danh mục HIỆN, người dùng chọn tay.
 * `auto`  = app tự gán, lưới ẨN. Chọn tay thì giao dịch thiếu cờ (is_debt_flow /
 *           is_remittance) nên bị đếm như một khoản chi thường — xem flowCategories.
 * `none`  = giao dịch không có danh mục.
 */
export type CategoryPicker = 'user' | 'auto' | 'none'

/**
 * Cơ sở tính cảnh báo trần ngân sách.
 * `myShare` chỉ dùng ở Trả hộ: cộng vào trần là PHẦN MÌNH CHỊU, không phải tổng
 * đã trả — tính tổng thì sai đúng bằng phần người khác nợ lại.
 */
export type CapBase = 'full' | 'myShare' | 'none'

/** Vai trò cũ + giá trị phân biệt, để dẫn xuất về roleSave đã có. */
export interface RoleSeed {
  role: EntryRole
  debtDirection?: DebtDirection
  remitKind?: 'expense' | 'transfer'
}

export interface EntryShape {
  kind: EntryKind
  direction: Direction
  /** Nhãn chip trong hàng Dạng. KHÔNG rút ngắn để ép một dòng — hàng chip wrap. */
  label: string
  /** Chữ phụ nói hệ quả. Chỉ hai dạng gửi về VN có, vì chỉ chúng có tác động
   *  tài sản trái nhau cho cùng một hành động vật lý. */
  hint?: string
  categoryPicker: CategoryPicker
  capBase: CapBase
  amountLabel: string
  /** `debtPayment` = đi qua createDebtPayment (bọc luôn transaction bên trong). */
  writes: 'transaction' | 'debtPayment'
  /** null ở repay/collect: type suy từ chiều của khoản nợ đã chọn, không từ dạng. */
  txType: TransactionType | null
  roleSeed: RoleSeed
}

const NONE: RoleSeed = { role: 'none' }

export const SHAPES: Record<EntryKind, EntryShape> = {
  spend: {
    kind: 'spend', direction: 'out', label: 'Chi thường',
    categoryPicker: 'user', capBase: 'full', amountLabel: 'Số tiền',
    writes: 'transaction', txType: 'expense', roleSeed: NONE,
  },
  split: {
    kind: 'split', direction: 'out', label: 'Trả hộ',
    categoryPicker: 'user', capBase: 'myShare', amountLabel: 'Tổng đã trả',
    writes: 'transaction', txType: 'expense', roleSeed: { role: 'split' },
  },
  family: {
    kind: 'family', direction: 'out', label: 'Gửi gia đình',
    hint: 'Tiền cho đi — tính là chi tiêu, vào trần.',
    categoryPicker: 'auto', capBase: 'full', amountLabel: 'Số gửi',
    writes: 'transaction', txType: 'expense',
    roleSeed: { role: 'remit', remitKind: 'expense' },
  },
  lend: {
    kind: 'lend', direction: 'out', label: 'Cho vay',
    categoryPicker: 'auto', capBase: 'none', amountLabel: 'Số tiền gốc',
    writes: 'transaction', txType: 'expense',
    roleSeed: { role: 'debt', debtDirection: 'owed_to_me' },
  },
  repay: {
    kind: 'repay', direction: 'out', label: 'Tôi trả nợ',
    categoryPicker: 'auto', capBase: 'none', amountLabel: 'Số trả',
    writes: 'debtPayment', txType: null, roleSeed: NONE,
  },
  earn: {
    kind: 'earn', direction: 'in', label: 'Thu thường',
    categoryPicker: 'user', capBase: 'none', amountLabel: 'Số tiền',
    writes: 'transaction', txType: 'income', roleSeed: NONE,
  },
  collect: {
    kind: 'collect', direction: 'in', label: 'Người trả lại',
    categoryPicker: 'auto', capBase: 'none', amountLabel: 'Số nhận lại',
    writes: 'debtPayment', txType: null, roleSeed: NONE,
  },
  borrow: {
    kind: 'borrow', direction: 'in', label: 'Vay được',
    categoryPicker: 'auto', capBase: 'none', amountLabel: 'Số tiền gốc',
    writes: 'transaction', txType: 'income',
    roleSeed: { role: 'debt', debtDirection: 'i_owe' },
  },
  between: {
    kind: 'between', direction: 'move', label: 'Giữa ví của tôi',
    categoryPicker: 'none', capBase: 'none', amountLabel: 'Chuyển đi',
    writes: 'transaction', txType: 'transfer', roleSeed: NONE,
  },
  ownvn: {
    kind: 'ownvn', direction: 'move', label: 'Tài khoản tôi ở VN',
    hint: 'Vẫn là tiền của bạn — không phải chi tiêu, chỉ đổi đồng tiền.',
    categoryPicker: 'none', capBase: 'none', amountLabel: 'Số gửi',
    writes: 'transaction', txType: 'transfer',
    roleSeed: { role: 'remit', remitKind: 'transfer' },
  },
}

/** Thứ tự chip trong hàng Dạng. Tiền ra 5 chip → 2 dòng ở 360px, đã chấp nhận. */
const ORDER: Record<Direction, EntryKind[]> = {
  out: ['spend', 'split', 'family', 'lend', 'repay'],
  in: ['earn', 'collect', 'borrow'],
  move: ['between', 'ownvn'],
}

export function shapeOf(kind: EntryKind): EntryShape {
  return SHAPES[kind]
}

export function directionOf(kind: EntryKind): Direction {
  return SHAPES[kind].direction
}

export function kindsOf(direction: Direction): EntryKind[] {
  return ORDER[direction]
}

/** Dạng mặc định khi bấm sang một hướng: chip đầu tiên của hướng đó. */
export function defaultKindOf(direction: Direction): EntryKind {
  return ORDER[direction][0]
}

/**
 * Danh mục của lend/borrow chỉ tồn tại khi có giao dịch thật: roleSave gán
 * `categoryId = v.withTransaction ? await debtFlowCategoryId(...) : null`. Tắt công
 * tắc đó thì không có bút toán nào nên cũng không có danh mục nào.
 */
export function categoryPickerOf(kind: EntryKind, withTransaction: boolean): CategoryPicker {
  if ((kind === 'lend' || kind === 'borrow') && !withTransaction) return 'none'
  return SHAPES[kind].categoryPicker
}

/** Tên đọc được của chip Dạng. Hint phải vào ĐÂY, không chỉ vào mắt. */
export function chipAriaLabel(kind: EntryKind): string {
  const s = SHAPES[kind]
  return s.hint ? `${s.label} — ${s.hint}` : s.label
}
