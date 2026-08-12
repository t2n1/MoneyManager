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

const FLOW_NAMES = new Set<string>([
  ...Object.values(DEBT_FLOW_CATEGORY_NAMES),
  ADJUST_CATEGORY_NAME,
])

/** true = danh mục dòng chảy, không bao giờ có chi tiêu để so với hạn mức. */
export function isFlowCategory(cat: { name: string }): boolean {
  return FLOW_NAMES.has(cat.name)
}
