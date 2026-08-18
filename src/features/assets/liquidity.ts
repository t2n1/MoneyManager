// "Tiền này rút ra tiêu được ngay không?" — MỘT nơi trả lời.
//
// Trước migration 0047 câu này được suy từ LOẠI tài khoản, và phép suy đó sai một ca có
// thật: tiền gửi có kỳ hạn (定期預金) là `type = 'bank'` nên nó bị đếm là tiền tiêu ngay
// được. Con số sai chảy vào quỹ dự phòng, vào khả năng trả nợ ngắn hạn (chỉ số nhạy nhất
// của tab Sức khỏe), và vào khối "phần giữ lại đi đâu".
//
// File này thuần và KHÔNG import React — nó nằm trong đồ thị của `health/snapshot.ts`, mà
// snapshot lại nằm trong đồ thị bộ luật thông báo (purity.test.ts).

import type { AccountType } from '../../types/database.types'

/**
 * Loại tài khoản MẶC ĐỊNH coi là rút ngay được, dùng khi `is_liquid` còn null.
 *
 * Giữ đúng danh sách cũ của `health/snapshot.ts` để việc thêm cột không tự ý đổi số của
 * ai: người chưa đặt cờ thì thấy đúng con số họ đang thấy.
 */
export const LIQUID_BY_TYPE: readonly AccountType[] = ['cash', 'bank', 'ic', 'ewallet']

/** Chỉ cần hai trường này — nhận `Pick` để test dựng dữ liệu gọn. */
export interface LiquidityInput {
  type: AccountType
  /** null = chưa đặt → suy từ `type`. */
  is_liquid?: boolean | null
}

/**
 * Tài khoản này có tiền rút ra tiêu được ngay không.
 *
 * Cờ người dùng đặt THẮNG phép suy, ở cả hai chiều: đánh dấu một tài khoản đầu tư là
 * `is_liquid = true` (ví dụ ví chứng khoán rút T+0) thì nó được tính; đánh dấu một tài
 * khoản bank là `false` (tiền gửi có kỳ hạn) thì nó bị loại.
 */
export function isLiquidAccount(a: LiquidityInput): boolean {
  if (a.is_liquid != null) return a.is_liquid
  return LIQUID_BY_TYPE.includes(a.type)
}

/**
 * Đang ĐOÁN hay đã BIẾT.
 *
 * Chỗ hiển thị dùng cái này để nói ra rằng con số đang dựa trên phép suy — không nói thì
 * "5,0 tháng quỹ dự phòng" đọc như một con số đã xác nhận.
 */
export function isLiquidityInferred(a: LiquidityInput): boolean {
  return a.is_liquid == null
}

/** Bao nhiêu tài khoản còn đang để app suy hộ. 0 = mọi tài khoản đã được xác nhận. */
export function inferredCount(accounts: readonly LiquidityInput[]): number {
  return accounts.filter(isLiquidityInferred).length
}

/**
 * Ba lựa chọn cho form tài khoản. `null` PHẢI là một lựa chọn hiện ra được, không phải một
 * trạng thái ẩn: nó là sự khác biệt giữa "người dùng đã xác nhận" và "app đang đoán", và
 * hai tab đọc chính sự khác biệt đó để cảnh báo.
 */
export const LIQUID_OPTIONS = [
  [true, 'Có'],
  [false, 'Không'],
  [null, 'Để app suy'],
] as const satisfies readonly (readonly [boolean | null, string])[]
