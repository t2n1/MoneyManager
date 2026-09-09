// Khung của console Tương lai — CHỈ BỐ CỤC. Không biết gì về kịch bản, không đọc dữ
// liệu, không có state. Mọi thứ đi vào bằng prop, nên nó không có đường nào để mọc
// thêm logic theo thời gian.
//
// Ba vùng của bản vẽ (spec §5): rail trái · vùng vẽ GIÃN · dock 24,5rem CỐ ĐỊNH.
// Rail KHÔNG dựng ở đây — `AppRail` trong `AppLayout` đã là đúng thứ đó ở dáng thu gọn
// (spec §16 nói rõ: rail trong bản vẽ chỉ là đồ giả của prototype, đừng dựng lại).
//
// VÌ SAO DOCK LÀ MỘT CỘT THẬT, KHÁC BẢN VẼ. Trong file `.dc.html` dock là một lớp phủ
// đặt tuyệt đối bên phải vùng vẽ, và lề phải của vùng vẽ được tính trừ đi bề rộng dock
// (`pr = W - (DOCK + 12)`). Cách đó chỉ chạy được vì bản vẽ khoá cứng 1920px. Repo thì
// không: spec §5 chốt "KHÔNG dựng khung cứng 1920×1080" vì Cài đặt → Cỡ chữ phóng theo
// `rem`. Một cột thật cho ra ĐÚNG cùng hình ở 1920 mà vẫn dùng được ở 1280 và 2560.
import type { ReactNode } from 'react'

interface Props {
  /**
   * Các hàng PHỦ HẾT BỀ NGANG nằm trên hai cột — hàng kịch bản, dải thống kê, panel
   * gợi ý (hàng 2–4 của bản vẽ).
   *
   * Vì sao là prop thứ tư chứ không nhét vào `plot`: trong bản vẽ ba hàng này chạy hết
   * bề ngang vùng nội dung (`padding: 0 20px`) và đi NGANG QUA chỗ dock đang phủ lên,
   * vì dock là lớp phủ. Khi dock thành một cột thật, nhét chúng vào cột vẽ sẽ bóp cả ba
   * hàng lại hẹp hơn bản vẽ đúng 24,5rem.
   */
  top?: ReactNode
  /** Vùng vẽ và mọi hàng dính với nó (hàng caption, hàng chú giải, hàng chặng đời). */
  plot: ReactNode
  /**
   * Cột phải. LUÔN được dựng, kể cả khi không chọn gì — lúc đó nó là thẻ "Tóm tắt kế
   * hoạch". Bản vẽ ghi rõ đây là quyết định có chủ đích: chỗ này chừa sẵn để đồ thị
   * KHÔNG co giãn mỗi lần chọn/bỏ chọn một mốc. Đừng đổi thành `dock && <div…>` —
   * làm thế là mỗi cú bấm vào một mốc lại kéo giãn cả vùng vẽ, tức mọi toạ độ năm→pixel
   * nhảy một nhịp ngay dưới ngón tay đang trỏ vào.
   */
  dock: ReactNode
  /** Phần CUỘN bên dưới: vặn nhanh, stress test, bảng theo năm / bản đồ khoản lớn. */
  below?: ReactNode
}

export function ConsoleFrame({ top, plot, dock, below }: Props) {
  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      {top}

      <div className="flex min-w-0 items-start gap-3">
        {/* `min-w-0` bắt buộc trên cột giãn: không có nó thì nội dung bên trong (SVG
            100% bề ngang, bảng có cột tối thiểu) đẩy cột nở quá phần được chia và cột
            dock bị ép hẹp lại — đúng cái mà bề rộng cố định ở đây tồn tại để chặn. */}
        <div className="min-w-0 flex-1">{plot}</div>
        <div className="w-[24.5rem] shrink-0">{dock}</div>
      </div>

      {below}
    </div>
  )
}
