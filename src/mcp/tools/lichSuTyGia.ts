// Lịch sử tỷ giá — bảng `fx_history` mà tới nay CHƯA màn hình nào đọc.
//
// Bảng có từ migration 0029 (cuối tháng 7/2026) và kế hoạch hồi đó ghi thẳng: "đợt này không
// có luật nào đọc fx_history. Nó chỉ tích dữ liệu để bật luật tỷ giá đẹp ở đợt sau (cần ~60
// ngày lịch sử)". Ngoài edge function push-notify thì không ai đọc. Tool này phơi nó ra.
//
// CHIỀU của tỷ giá là chỗ dễ sai nhất: `fx_history.rates` nói "1 đơn vị base đổi được
// rates[X] đơn vị X" — CÙNG chiều với lib/rates.ts nhưng NGƯỢC chiều `life_*.fx_to_display`
// (xem docs/data-model-matrix.md). Nên kết quả luôn kèm câu nói rõ chiều.
import type { DuLieu } from '../basket'

export interface LichSuTyGiaKetQua {
  chieu: string
  /** Nhắc lại phạm vi đã áp — spec mục C.3. `den_ngay` ở đây là mốc ĐÓNG. */
  pham_vi: { tu_ngay: string; den_ngay: string; so_dong: number }
  dong: { ngay: string; ty_gia: Record<string, number> }[]
  ghi_chu: string[]
}

export function lichSuTyGia(
  input: { tu_ngay: string; den_ngay: string },
  du: DuLieu,
): LichSuTyGiaKetQua {
  const dong = du.fx
    .filter((r) => r.base === du.base && r.on_date >= input.tu_ngay && r.on_date <= input.den_ngay)
    .sort((a, b) => a.on_date.localeCompare(b.on_date))
    .map((r) => ({ ngay: r.on_date, ty_gia: r.rates }))

  const ghi_chu: string[] = []
  if (dong.length === 0) {
    ghi_chu.push(
      `Không có dòng tỷ giá nào trong khoảng ${input.tu_ngay} → ${input.den_ngay}. ` +
        'Bảng lịch sử tỷ giá chỉ bắt đầu tích từ cuối tháng 7/2026, và chỉ ghi thêm vào ' +
        'những ngày người dùng có mở app — nên khoảng trống là bình thường, không phải lỗi.',
    )
  }

  return {
    chieu: `1 ${du.base} đổi được bao nhiêu đơn vị đồng tiền kia`,
    pham_vi: { tu_ngay: input.tu_ngay, den_ngay: input.den_ngay, so_dong: dong.length },
    dong,
    ghi_chu,
  }
}
