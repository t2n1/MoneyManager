import type { DebtRow } from '../../types/database.types'

/** Cách ghi sổ của MỘT lần trả nợ. */
export interface DebtPaymentPosting {
  /** true = dòng tiền nợ, bị loại khỏi mọi báo cáo Chi/Thu. */
  isDebtFlow: boolean
  categoryId: string | null
}

/**
 * Lần trả này ghi vào sổ thế nào — ĐỌC `origin` của khoản nợ, không đoán.
 *
 * Đây là chỗ DUY NHẤT của repo quyết định việc đó, và nó nằm dưới cả hai cửa ghi (màn
 * Nhập → "Người trả lại", và DebtPaymentSheet ở trang Nợ) cùng cả hai repo (Supabase,
 * demo). Để quyết định này ở tầng gọi thì mỗi cửa phải tự nhớ, và cửa nào quên thì tiền
 * công của người dùng lặng lẽ không vào Thu — số dư ví tăng mà "Thu" tháng đó vẫn 0.
 *
 * `proposedCategoryId` là danh mục người gọi đã dựng sẵn trong `input.transaction` —
 * hôm nay là danh mục tự gán của dòng tiền nợ (`DEBT_FLOW_CATEGORY_NAMES` ở roleSave).
 * Với khoản `earned`, danh mục của KHOẢN NỢ đè nó: khách trả ba lần từ hai cửa khác
 * nhau vẫn phải vào cùng một chỗ.
 *
 * Không tìm thấy khoản nợ → đi đường cũ. Hai chiều đoán sai KHÔNG ngang giá nhau: đoán
 * "nợ thường" thì tệ nhất là một khoản thu bị thiếu và người dùng sửa tay được; đoán
 * "thu thật" thì một khoản tiền cho vay quay về tự hiện ra thành thu nhập.
 */
export function debtPaymentPosting(
  debt: Pick<DebtRow, 'origin' | 'income_category_id'> | null | undefined,
  proposedCategoryId: string | null,
): DebtPaymentPosting {
  if (debt?.origin === 'earned') return { isDebtFlow: false, categoryId: debt.income_category_id }
  return { isDebtFlow: true, categoryId: proposedCategoryId }
}
