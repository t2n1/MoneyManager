// Danh mục "dòng chảy" — app TỰ TẠO chỉ để bút toán có chỗ đứng, không phải
// tiền tiêu. Giao dịch của chúng luôn mang cờ is_debt_flow (dòng nợ) hoặc
// exclude_from_stats (bút toán bù số dư) nên bị loại ngay từ dòng lọc đầu tiên
// của mọi hàm gộp báo cáo (features/reports/aggregate.ts) → chi tiêu đọc ra
// luôn bằng 0.
//
// Hệ quả: đặt hạn mức cho chúng chỉ tạo một thanh trống vĩnh viễn, tệ hơn là
// làm người dùng tưởng mình chưa tiêu gì. Nên màn Ngân sách ẩn hẳn.
//
// Nhận diện theo TÊN vì đó cũng là cách app tìm lại chúng lúc lưu giao dịch
// (roleSave.debtFlowCategoryId, reconcile.findAdjustCategory) — người dùng đổi
// tên thì app coi như danh mục khác ở mọi nơi, nhất quán cả hai chiều.

/** Bốn danh mục cho dòng tiền nợ — xem debtFlowCategoryId. */
export const DEBT_FLOW_CATEGORY_NAMES = {
  /** chi — mình cho người khác vay */
  lend: 'Cho vay',
  /** thu — mình đi vay */
  borrow: 'Đi vay',
  /** thu — người ta trả lại mình */
  collect: 'Thu nợ',
  /** chi — mình trả nợ */
  repay: 'Trả nợ',
} as const

/** Danh mục cho bút toán bù số dư (có cả bản chi lẫn bản thu). */
export const ADJUST_CATEGORY_NAME = 'Điều chỉnh số dư'

/** Danh mục cho khoản gửi tiền về VN — saveRemit tự tìm/tạo rồi gán. */
export const REMIT_CATEGORY_NAME = 'Gửi tiền về VN'

const FLOW_NAMES = new Set<string>([
  ...Object.values(DEBT_FLOW_CATEGORY_NAMES),
  ADJUST_CATEGORY_NAME,
])

/** true = danh mục dòng chảy, không bao giờ có chi tiêu để so với hạn mức. */
export function isFlowCategory(cat: { name: string }): boolean {
  return FLOW_NAMES.has(cat.name)
}

/**
 * true = danh mục app TỰ GÁN lúc lưu, người dùng không bao giờ cần chọn tay:
 * dòng chảy + "Gửi tiền về VN". Bày chúng trong lưới danh mục của form Nhập
 * không chỉ thừa mà còn bẫy: chọn tay xong giao dịch thiếu cờ (is_debt_flow /
 * exclude_from_stats / is_remittance) nên bị đếm như một khoản chi thường,
 * lại không sinh khoản nợ hay bút toán bù nào cả.
 *
 * KHÁC isFlowCategory ở chỗ "Gửi tiền về VN" là tiền đi thật, vẫn vào báo cáo
 * và vẫn đặt được hạn mức — chỉ không cần bày ra để chọn tay.
 */
export function isAutoAssignedCategory(cat: { name: string }): boolean {
  return isFlowCategory(cat) || cat.name === REMIT_CATEGORY_NAME
}

interface PickableCategory {
  id: string
  name: string
  type: string
  is_archived: boolean
}

/**
 * Danh mục bày ra cho người dùng chọn tay ở form Nhập: đúng loại, chưa lưu trữ,
 * bỏ hết danh mục tự gán. `keepId` = danh mục của giao dịch ĐANG SỬA — luôn giữ
 * lại kể cả khi nó là tự gán, nếu không form sửa một khoản cho vay sẽ hiện ra
 * như chưa chọn gì (cùng lý do với danh sách tài khoản trong TransactionForm).
 */
export function pickableCategories<T extends PickableCategory>(
  categories: T[],
  type: string,
  keepId: string | null | undefined,
): T[] {
  const list = categories.filter(
    (c) => c.type === type && !c.is_archived && !isAutoAssignedCategory(c),
  )
  const keep = keepId ? categories.find((c) => c.id === keepId) : null
  if (keep && keep.type === type && !list.some((c) => c.id === keep.id)) list.push(keep)
  return list
}
