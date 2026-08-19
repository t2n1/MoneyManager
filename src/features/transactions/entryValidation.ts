// Cổng "được bấm Lưu chưa" + câu "còn thiếu gì" của form Nhập. Thuần, test được.
//
// Vì sao gộp: trước đây form có HAI bản luật song song — `canSave` (một biểu thức
// boolean dài) và câu giải thích chỉ viết riêng cho các vai trò đặc biệt.
// Hai bản đã lệch nhau đúng như dự đoán: giao dịch thường thiếu danh mục thì nút Lưu
// mờ mà KHÔNG có dòng nào nói vì sao, còn "Nhắc sau" thì `canSave` đọc cờ thô nên
// đổi sang tab Thu là nút vẫn ghi "Tạo lời nhắc" và tạo ra một khoản sắp CHI.
//
// Một hàm trả cả hai: đóng được thì đóng, và luôn kèm lý do.
import type { TransactionType } from '../../types/database.types'
import type { DebtValue, RemitValue, SplitValue } from './entryRoles'
import { categoryPickerOf, shapeOf, type EntryKind } from './entryShape'

/**
 * "Nhắc sau" có THỰC SỰ hiệu lực hay không.
 *
 * Cờ thô (`remindLater`) không đủ: nút bật/tắt nó chỉ hiện với khoản CHI thường
 * (`kind === 'spend'`), nên đổi sang dạng khác là cờ còn bật mà không còn cách
 * nào tắt — nút mang chữ "Tạo lời nhắc" trong khi việc nó làm là chuyện khác.
 */
export function plannedModeActive(p: {
  remindLater: boolean
  /** form có nhận việc tạo lời nhắc không (màn Nhập có, màn Sửa không) */
  canPlan: boolean
  kind: EntryKind
}): boolean {
  return p.remindLater && p.canPlan && p.kind === 'spend'
}

export interface EntryState {
  /** minor units, đã tính xong biểu thức */
  amount: number
  /** đã có tài khoản nguồn dùng được */
  hasAccount: boolean
  type: TransactionType
  /** Dạng đang chọn — nguồn duy nhất quyết định form đòi gì. Xem entryShape. */
  kind: EntryKind
  /** Chỉ lend/borrow dùng: tắt thì không sinh giao dịch nên không có danh mục. */
  withTransaction: boolean
  /** "Nhắc sau" đang hiệu lực — xem `plannedModeActive` */
  plannedMode: boolean
  hasCategory: boolean
  /** loại đang chọn KHÔNG còn danh mục nào để chọn (đã lưu trữ hết / chưa tạo) */
  categoryGridEmpty: boolean
  note: string
  accountId: string | null
  toAccountId: string | null
  /** chuyển khoản khác loại tiền → phải nhập cả số nhận */
  crossCurrency: boolean
  toAmount: number
  split: SplitValue
  debt: DebtValue
  remit: RemitValue
  /** id các ví hợp lệ ở ô "Nhận lại vào" của Trả hộ */
  splitBackAccountIds: string[]
}

export interface EntryGate {
  canSave: boolean
  /** null = không thiếu gì; ngược lại là câu hiện cạnh nút Lưu */
  missing: string | null
}

/** Trả hộ: còn dòng chi nào của mình thì vẫn cần danh mục. */
export const splitNeedsCategory = (s: Pick<EntryState, 'amount' | 'split'>): boolean =>
  s.split.settle === 'later' || s.amount - s.split.others > 0

/**
 * Phần "còn thiếu gì" riêng của TỪNG dạng, sau khi tiền + tài khoản đã đủ.
 *
 * Trước đây đây là HAI hàm (`normalMissing` cho giao dịch thường, `roleMissing` cho
 * ba vai trò đặc biệt) chọn nhau bằng `role`. Gộp một vì cùng một câu hỏi — "dạng
 * này còn thiếu field riêng nào?" — chỉ có một câu trả lời đúng cho mỗi dạng, đọc
 * thẳng từ `kind`, không cần biết dạng đó "là" giao dịch thường hay vai trò gì.
 */
function kindMissing(s: EntryState): string | null {
  if (s.plannedMode) {
    // Lời nhắc chỉ cần một cái TÊN — ghi chú hoặc danh mục. Không đòi số tiền: một
    // lời nhắc có thể là "tìm nhà mới", việc có thật mà chưa ai đoán nổi giá.
    return s.note.trim() || s.hasCategory
      ? null
      : 'Còn thiếu: tên lời nhắc — gõ ghi chú, hoặc chọn một danh mục.'
  }

  // Mọi nhánh dưới đây chỉ trả xong PHẦN RIÊNG của dạng (field nào thiếu tên/địa
  // chỉ). Câu hỏi "có cần danh mục không" KHÔNG được trả lời ở đây nữa — nhánh nào
  // qua được hết các field riêng thì rơi xuống MỘT cổng danh mục chung ở cuối hàm,
  // đọc thẳng từ bảng. Trước đây `between` và bốn case còn lại `return null` ngay
  // khi xong phần riêng, nên cổng danh mục chung không bao giờ được gọi tới cho
  // chúng — "không cần danh mục" là do hardcode, trùng đúng bảng chỉ vì tình cờ.
  //
  // Cổng danh mục LUÔN hỏi SAU CÙNG, cho mọi dạng — nó chỉ thua các field riêng
  // NGAY TRÊN nó (đứng trước trong code), không thua field riêng của phần tử nào
  // khác. Với split cụ thể: ví "Nhận lại vào" không hợp lệ giờ báo trước thiếu
  // danh mục (trước đây ngược lại) — quyết định có chủ đích, xem test "trả hộ: ví
  // nhận lại sai lấn thiếu danh mục" ở file test.
  if (s.kind === 'between') {
    if (!s.toAccountId) return 'Còn thiếu: tài khoản ĐẾN.'
    if (s.toAccountId === s.accountId) return 'Tài khoản đến đang trùng tài khoản nguồn.'
    if (s.crossCurrency && s.toAmount <= 0) return 'Còn thiếu: số tiền nhận được.'
  } else {
    switch (s.kind) {
      case 'split': {
        const { split } = s
        if (split.others <= 0)
          return split.settle === 'now'
            ? 'Còn thiếu: phần người khác trả lại.'
            : 'Còn thiếu: phần người khác nợ lại.'
        if (split.settle === 'later') {
          if (split.others > s.amount)
            return 'Phần người khác nợ đang lớn hơn tổng — giảm bớt lại.'
          if (!split.counterparty.trim()) return 'Còn thiếu: tên người nợ mình (ô "Ai nợ mình").'
          break // danh mục: rơi xuống cổng chung — settle 'later' luôn cần (splitNeedsCategory).
        }
        if (split.receivedAccountId && !s.splitBackAccountIds.includes(split.receivedAccountId))
          return 'Ví "Nhận lại vào" không còn hợp lệ — chọn lại.'
        if (split.others === s.amount && !split.receivedAccountId)
          return 'Người kia trả đủ vào chính ví đã trả → không có gì để ghi. Chọn ví khác ở "Nhận lại vào", hoặc bấm Bỏ nếu không cần ghi.'
        break
      }
      case 'lend':
      case 'borrow':
        if (!s.debt.counterparty.trim())
          return s.kind === 'borrow'
            ? 'Còn thiếu: tên chủ nợ (mình nợ ai).'
            : 'Còn thiếu: tên người vay (ai nợ mình).'
        break
      case 'family':
      case 'ownvn':
        if (s.kind === 'ownvn' && !s.remit.destId)
          return 'Còn thiếu: chọn tài khoản VND nhận tiền.'
        if (s.remit.received <= 0) return 'Còn thiếu: số nhận (VND).'
        break
    }
  }

  // MỘT cổng danh mục cho mọi dạng — hai điều kiện gộp lại:
  // 1. Bảng nói dạng này có lưới danh mục hay không (categoryPickerOf).
  // 2. Riêng Trả hộ: có lưới không có nghĩa đã cần — người kia trả đủ ngay tại chỗ
  //    (`splitNeedsCategory` = false) thì phần chi của MÌNH bằng 0, không có gì để
  //    xếp vào danh mục nào. Thêm dạng mới thì sửa bảng entryShape, không sửa hàm này.
  const needsCategory =
    categoryPickerOf(s.kind, s.withTransaction) === 'user' &&
    (s.kind !== 'split' || splitNeedsCategory(s))
  if (needsCategory && !s.hasCategory) {
    return s.categoryGridEmpty
      ? 'Loại này chưa có danh mục nào — tạo ở Cài đặt → Danh mục.'
      : 'Còn thiếu: chọn danh mục ở lưới phía trên.'
  }
  return null
}

/**
 * Đủ điều kiện lưu chưa, và thiếu gì. `saving` KHÔNG xét ở đây (chuyện của UI).
 *
 * Thứ tự câu trả lời đi theo thứ tự mắt đọc form: tiền → tài khoản → phần riêng của
 * dạng. Nói MỘT thứ thiếu mỗi lần, không liệt kê cả danh sách.
 */
export function entryGate(s: EntryState): EntryGate {
  const shape = shapeOf(s.kind)
  const missing = ((): string | null => {
    if (!s.plannedMode && s.amount <= 0) {
      // .toLowerCase() chỉ khi nhãn ĐÚNG LÀ "Số tiền" — đó là danh từ chung giữa câu
      // ("còn thiếu số tiền"), còn các nhãn khác ("Tổng đã trả", "Số gửi"...) là tên
      // field riêng, viết hoa đúng như trên ô nhập.
      return `Còn thiếu: ${shape.amountLabel === 'Số tiền' ? 'số tiền' : shape.amountLabel}.`
    }
    if (!s.hasAccount) return 'Còn thiếu: tài khoản.'
    return kindMissing(s)
  })()
  return { canSave: missing === null, missing }
}
