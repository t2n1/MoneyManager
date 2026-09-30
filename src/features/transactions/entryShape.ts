import { tr } from '../../i18n'
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
  out: tr('Tiền ra'),
  in: tr('Tiền vào'),
  move: tr('Đổi chỗ'),
}

/**
 * Một dòng mô tả HIỆN RA dưới hàng Hướng, chỉ cho hướng mà tên không tự nói được nghĩa.
 * "Tiền ra"/"Tiền vào" thì ai cũng hiểu; "Đổi chỗ" là chữ app tự đặt — không nói ra thì
 * người dùng không biết khoản này có bị đếm vào Chi hay không.
 */
export const DIRECTION_HINT: Partial<Record<Direction, string>> = {
  move: tr('Chuyển tiền giữa các tài khoản của bạn — không tính là thu hay chi.'),
}

/**
 * Nhãn hai pha theo hướng, cho segmented "Đã chi | Sẽ chi".
 *
 * Cả hai nhãn nói TRẠNG THÁI CỦA KHOẢN TIỀN. Nút chuông cũ ở đúng chỗ này nói một VIỆC
 * APP LÀM CHO BẠN ("để đó lát nhắc lại") — hai câu hỏi khác nhau, và cái nút đó đã bỏ
 * cùng dropdown "Lặp lại"; ghi lại đây vì nó là lý do bảng này chỉ có hai cột.
 *
 * KHÔNG có `dateLabel`: nhãn ô ngày của khoản sắp chi là một CẶP đọc theo `precision`
 * ("Ngày đến hạn" / "Tháng dự kiến"), mà `precision` là field của `PlannedDraft` chứ
 * không phải của hướng tiền — nên nó nằm ở `PlannedFields.tsx`, nơi có cả hai. Bảng theo
 * hướng cũng chỉ đọc được đúng một dòng: segmented này chỉ hiện ở `kind === 'spend'`
 * (planned_expenses không có cột phân biệt Chi/Thu/Chuyển khoản), nên hai dòng in/move
 * không có đường nào tới.
 */
export const PHASE_LABEL: Record<Direction, { done: string; future: string }> = {
  out: { done: tr('Đã chi'), future: tr('Sẽ chi') },
  in: { done: tr('Đã thu'), future: tr('Sẽ thu') },
  move: { done: tr('Đã chuyển'), future: tr('Sẽ chuyển') },
}

/**
 * Mười dạng giao dịch. `between` chứ không `move` để tên dạng không trùng chữ với
 * một giá trị của Direction — đọc `kind === 'move' && direction === 'move'` thì
 * không ai biết đang so cái nào.
 */
export type EntryKind =
  | 'spend' | 'split' | 'family' | 'lend' | 'repay'
  | 'earn' | 'owed' | 'collect' | 'borrow'
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
  /**
   * `debtPayment` = đi qua createDebtPayment (bọc luôn transaction bên trong).
   * `debtOnly`    = đi qua createDebt và KHÔNG kèm giao dịch nào: không đồng nào rời
   *                 ví, nên dạng đó cũng không có tài khoản để đòi (xem entryGate và
   *                 `handleSubmit` — HAI cổng, phải mở cả hai).
   */
  writes: 'transaction' | 'debtPayment' | 'debtOnly'
  /** null ở repay/collect: type suy từ chiều của khoản nợ đã chọn, không từ dạng. */
  txType: TransactionType | null
  roleSeed: RoleSeed
}

const NONE: RoleSeed = { role: 'none' }

export const SHAPES: Record<EntryKind, EntryShape> = {
  spend: {
    kind: 'spend', direction: 'out', label: tr('Chi thường'),
    categoryPicker: 'user', capBase: 'full', amountLabel: tr('Số tiền'),
    writes: 'transaction', txType: 'expense', roleSeed: NONE,
  },
  split: {
    kind: 'split', direction: 'out', label: tr('Trả hộ'),
    categoryPicker: 'user', capBase: 'myShare', amountLabel: tr('Tổng đã trả'),
    writes: 'transaction', txType: 'expense', roleSeed: { role: 'split' },
  },
  family: {
    kind: 'family', direction: 'out', label: tr('Gửi gia đình'),
    hint: tr('Tiền cho đi — chọn danh mục để biết nó đi vào việc gì.'),
    /**
     * 'user', KHÔNG phải 'auto'. Bản cũ đóng cứng danh mục `Gửi tiền về VN` — mà đó là
     * PHƯƠNG TIỆN (tiền đi bằng đường nào), không phải MỤC ĐÍCH (tiền đi vào việc gì).
     * Người dùng hỏi "tiền của mình nó đi đâu", và câu đó chỉ trả lời được bằng mục đích:
     * hỗ trợ gia đình là một khoản chi thật, khác hẳn việc chuyển tiền sang tài khoản VN
     * của chính mình (dạng đó đã có nhánh riêng — `remitKind: 'transfer'` ở shape
     * `remit`, ghi thành type='transfer' nên mọi module loại nó theo LOẠI giao dịch).
     */
    categoryPicker: 'user', capBase: 'full', amountLabel: tr('Số gửi'),
    writes: 'transaction', txType: 'expense',
    roleSeed: { role: 'remit', remitKind: 'expense' },
  },
  lend: {
    kind: 'lend', direction: 'out', label: tr('Cho vay'),
    categoryPicker: 'auto', capBase: 'none', amountLabel: tr('Số tiền gốc'),
    writes: 'transaction', txType: 'expense',
    roleSeed: { role: 'debt', debtDirection: 'owed_to_me' },
  },
  repay: {
    kind: 'repay', direction: 'out', label: tr('Trả nợ'),
    categoryPicker: 'auto', capBase: 'none', amountLabel: tr('Số trả'),
    writes: 'debtPayment', txType: null, roleSeed: NONE,
  },
  earn: {
    kind: 'earn', direction: 'in', label: tr('Thu thường'),
    categoryPicker: 'user', capBase: 'none', amountLabel: tr('Số tiền'),
    writes: 'transaction', txType: 'income', roleSeed: NONE,
  },
  owed: {
    kind: 'owed', direction: 'in', label: tr('Khách nợ công'),
    // Chip này nằm dưới tab "Tiền vào" mà KHÔNG có đồng nào vào ví — chỗ dễ nhầm nhất
    // của cả màn, nên hint là bắt buộc. Nó cũng đi vào `chipAriaLabel`.
    hint: tr('Chưa có đồng nào vào ví — chỉ ghi người ta nợ bạn.'),
    categoryPicker: 'user', capBase: 'none', amountLabel: tr('Số tiền công'),
    writes: 'debtOnly', txType: null,
    roleSeed: { role: 'debt', debtDirection: 'owed_to_me' },
  },
  collect: {
    kind: 'collect', direction: 'in', label: tr('Người trả lại'),
    categoryPicker: 'auto', capBase: 'none', amountLabel: tr('Số nhận lại'),
    writes: 'debtPayment', txType: null, roleSeed: NONE,
  },
  borrow: {
    kind: 'borrow', direction: 'in', label: tr('Vay được'),
    categoryPicker: 'auto', capBase: 'none', amountLabel: tr('Số tiền gốc'),
    writes: 'transaction', txType: 'income',
    roleSeed: { role: 'debt', debtDirection: 'i_owe' },
  },
  between: {
    kind: 'between', direction: 'move', label: tr('Giữa ví của tôi'),
    categoryPicker: 'none', capBase: 'none', amountLabel: tr('Chuyển đi'),
    writes: 'transaction', txType: 'transfer', roleSeed: NONE,
  },
  ownvn: {
    kind: 'ownvn', direction: 'move', label: tr('Tài khoản tôi ở VN'),
    hint: tr('Vẫn là tiền của bạn — không phải chi tiêu, chỉ đổi đồng tiền.'),
    categoryPicker: 'none', capBase: 'none', amountLabel: tr('Số gửi'),
    writes: 'transaction', txType: 'transfer',
    roleSeed: { role: 'remit', remitKind: 'transfer' },
  },
}

/** Thứ tự chip trong hàng Dạng. Tiền ra 5 chip → 2 dòng ở 360px, đã chấp nhận. */
const ORDER: Record<Direction, EntryKind[]> = {
  out: ['spend', 'split', 'family', 'lend', 'repay'],
  in: ['earn', 'owed', 'collect', 'borrow'],
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

/**
 * Nhãn ô counterparty. undefined = dạng này không có ô đó.
 *
 * Ô counterparty là KHÓA NỐI để cộng dồn vào khoản nợ đang mở (`norm(d.counterparty)`
 * trong roleSave) nên nó phải ở lại; nhưng một ô dùng cho ba dạng thì phải GỌI ĐÚNG TÊN
 * ở mỗi dạng. Nhãn cũ của ô Trả hộ gộp hai việc vào một tên.
 */
export function counterpartyLabelOf(kind: EntryKind): string | undefined {
  switch (kind) {
    case 'split':  return tr('Ai nợ mình')
    case 'lend':   return tr('Cho ai vay')
    case 'owed':   return tr('Ai nợ bạn')
    case 'borrow': return tr('Vay của ai')
    default:       return undefined
  }
}

/** Tên đọc được của chip Dạng. Hint phải vào ĐÂY, không chỉ vào mắt. */
export function chipAriaLabel(kind: EntryKind): string {
  const s = SHAPES[kind]
  return s.hint ? `${s.label} — ${s.hint}` : s.label
}
