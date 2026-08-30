// Cổng "được bấm Lưu chưa" + câu "còn thiếu gì" của form Nhập. Thuần, test được.
//
// Vì sao gộp: trước đây form có HAI bản luật song song — `canSave` (một biểu thức
// boolean dài) và câu giải thích chỉ viết riêng cho các vai trò đặc biệt.
// Hai bản đã lệch nhau đúng như dự đoán: giao dịch thường thiếu danh mục thì nút Lưu
// mờ mà KHÔNG có dòng nào nói vì sao, còn chế độ "khoản chưa xảy ra" thì `canSave` đọc
// cờ thô nên đổi sang tab Thu là nút vẫn ghi "Tạo lời nhắc" và tạo ra một khoản sắp CHI.
//
// Một hàm trả cả hai: đóng được thì đóng, và luôn kèm lý do.
import type { DebtValue, RemitValue, SplitValue } from './entryRoles'
import { categoryPickerOf, shapeOf, type EntryKind } from './entryShape'
import type { PaymentValue } from './roleSave'

/**
 * Chế độ "Sẽ chi" có THỰC SỰ hiệu lực hay không.
 *
 * Cờ thô (`wantsPlanned`) không đủ: segmented "Đã chi | Sẽ chi" chỉ hiện với khoản CHI
 * thường (`kind === 'spend'`), nên đổi sang dạng khác là cờ còn bật mà không còn cách
 * nào tắt — nút mang chữ "Tạo lời nhắc" trong khi việc nó làm là chuyện khác.
 */
export function plannedModeActive(p: {
  /** cờ THÔ của segmented "Đã chi | Sẽ chi" — cùng tên với state ở TransactionForm. */
  wantsPlanned: boolean
  /** form có nhận việc tạo khoản sắp chi không (màn Nhập có, màn Sửa không) */
  canPlan: boolean
  kind: EntryKind
}): boolean {
  return p.wantsPlanned && p.canPlan && p.kind === 'spend'
}

export interface EntryState {
  /** minor units, đã tính xong biểu thức */
  amount: number
  /** đã có tài khoản nguồn dùng được */
  hasAccount: boolean
  // KHÔNG có `type` ở đây: loại giao dịch là giá trị DẪN XUẤT từ `kind` (bảng
  // entryShape) — đặt lại nó vào chính cái interface tồn tại để chứng minh `kind` là
  // đủ thì mở lại đúng đường lệch mà gói này sinh ra để chặn. Không cổng nào dưới đây
  // đọc nó, và cũng không được đọc.
  /** Dạng đang chọn — nguồn duy nhất quyết định form đòi gì. Xem entryShape. */
  kind: EntryKind
  /** Chỉ lend/borrow dùng: tắt thì không sinh giao dịch nên không có danh mục. */
  withTransaction: boolean
  hasCategory: boolean
  /** loại đang chọn KHÔNG còn danh mục nào để chọn (đã lưu trữ hết / chưa tạo) */
  categoryGridEmpty: boolean
  // KHÔNG có `note`: ghi chú là tùy chọn ở cả mười dạng, nên nó không bao giờ là một câu
  // "còn thiếu" — nhận nó vào đây chỉ mời người sau tưởng cổng có xét tới.
  accountId: string | null
  toAccountId: string | null
  /** chuyển khoản khác loại tiền → phải nhập cả số nhận */
  crossCurrency: boolean
  toAmount: number
  split: SplitValue
  debt: DebtValue
  remit: RemitValue
  /** Chỉ repay/collect dùng: đã chọn khoản nợ nào để trả/thu chưa. */
  payment: PaymentValue
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
          // "chọn dạng Chi thường", KHÔNG "bấm Bỏ": nút "Bỏ" nằm trên banner vai trò, và
          // banner đó đã bị bỏ cùng lúc với dropdown "loại đặc biệt". Đường ra khỏi dạng
          // Trả hộ giờ là hàng Dạng, nên câu nhắc phải chỉ vào thứ đang có trên màn.
          return 'Người kia trả đủ vào chính ví đã trả → không có gì để ghi. Chọn ví khác ở "Nhận lại vào", hoặc chọn dạng Chi thường nếu không cần ghi.'
        break
      }
      case 'owed':
        if (!s.debt.counterparty.trim()) return 'Còn thiếu: tên người nợ (ai nợ bạn).'
        // Ràng buộc DB `debts_earned_needs_income_category` (0049) chặn hàng thiếu danh
        // mục thu. Chặn ở đây nữa để người dùng đọc một câu tiếng Việt thay vì một lỗi
        // Postgres — và để nút Lưu mờ đúng lúc, chứ không mờ sau khi đã bấm.
        if (!s.hasCategory) return 'Còn thiếu: danh mục thu (khách trả thì tiền vào đâu).'
        break
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
      case 'repay':
      case 'collect':
        // Chưa chọn khoản nợ → không có gì để suy chiều bút toán (saveDebtPayment
        // ném lỗi nếu cứ lưu), nên chặn Ở ĐÂY, trước cả cổng danh mục chung.
        if (!s.payment.debtId) return 'Còn thiếu: chọn khoản nợ.'
        // Trả xuyên tệ (nợ ¥, ví ₫): ô tiền lớn giữ số vào/ra ví, còn số xoá nợ là con
        // số THỨ HAI. Thiếu nó thì saveDebtPayment rơi về `base.amount` — tức ghi 15
        // triệu YEN vào một khoản nợ 100 nghìn yen, sổ nợ âm mà không có gì báo.
        if (s.payment.debtAmount !== null && s.payment.debtAmount <= 0)
          return 'Còn thiếu: lần trả này xoá bao nhiêu nợ.'
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
    if (s.amount <= 0) {
      // .toLowerCase() chỉ khi nhãn ĐÚNG LÀ "Số tiền" — đó là danh từ chung giữa câu
      // ("còn thiếu số tiền"), còn các nhãn khác ("Tổng đã trả", "Số gửi"...) là tên
      // field riêng, viết hoa đúng như trên ô nhập.
      return `Còn thiếu: ${shape.amountLabel === 'Số tiền' ? 'số tiền' : shape.amountLabel}.`
    }
    // Cổng tài khoản đọc từ BẢNG, không thêm một cờ song song kiểu `plannedMode`: dạng
    // `debtOnly` (Khách nợ công) không ghi giao dịch nào nên không có ví nào để đòi.
    //
    // ĐÂY LÀ CỔNG THỨ NHẤT. `handleSubmit` ở TransactionForm còn một cổng nữa
    // (`!noAccountNeeded && !effectiveAccountId`) — sửa một cổng mà quên cổng kia thì
    // nút Lưu sáng lên rồi bấm không có gì xảy ra: im lặng, không câu báo nào.
    if (shape.writes !== 'debtOnly' && !s.hasAccount) return 'Còn thiếu: tài khoản.'
    return kindMissing(s)
  })()
  return { canSave: missing === null, missing }
}
