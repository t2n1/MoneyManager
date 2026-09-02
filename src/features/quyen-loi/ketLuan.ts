// Hình dạng kết luận CHUNG của bốn bộ kiểm — màn Quyền lợi, khung trên Bản tin và bộ luật
// thông báo cùng đọc một kiểu này, nên luật thông báo không cần biết từng khoản tính thế nào.
// THUẦN: không React, không Date.

export type KetLuanId = 'fuyo' | 'remit-unassigned' | 'refund' | 'furusato' | 'shelter'

/**
 * 'du'           = đủ điều kiện / không còn việc gì
 * 'thieu'        = còn việc phải làm và còn hạn → thành thông báo việc-cần-làm
 * 'het-han'      = đã qua hạn, chỉ còn để biết
 * 'thieu-du-lieu'= app không nói được vì thiếu dữ liệu — KHÔNG phải 0 (§14: chưa biết ≠ 0)
 */
export type TrangThai = 'du' | 'thieu' | 'het-han' | 'thieu-du-lieu'

export interface KetLuan {
  id: KetLuanId
  /** Năm thuế (dương lịch) mà kết luận nói về. */
  year: number
  trang_thai: TrangThai
  /** Mức khẩn cho thông báo; bộ kiểm quyết, luật chỉ chép. */
  muc: 'high' | 'medium' | 'low'
  /** Tiền ƯỚC tiết kiệm được (yên); null = không nói được. Màn hình LUÔN gắn ≈. */
  tiet_kiem_uoc: number | null
  /** Hạn ISO; null = không có hạn. */
  han: string | null
  /** MỘT câu việc-cần-làm, có động từ. Đây là tiêu đề thông báo. */
  viec: string
  /** Vì sao là số ước / vì sao thiếu dữ liệu. Câu đầu là `detail` của thông báo. */
  ly_do: string[]
}
