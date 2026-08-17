// Số vừa đổi thì BẬT lên, không trôi vào (§12, dòng "Đổi tháng / đổi kỳ").
//
// Bảng §12 viết: "số cũ mờ đi rồi số mới hiện (`opacity`), KHÔNG trượt ngang — 140ms,
// ease-out". Ở đây làm được nửa sau và CỐ Ý không làm nửa đầu:
//
// Nửa "số cũ mờ đi" cần con số cũ còn nằm trên màn trong lúc con số mới đang tới. Các
// truy vấn theo kỳ của app không giữ dữ liệu kỳ trước (không dùng `placeholderData`),
// nên khi đổi sang một tháng CHƯA có trong cache, thứ thay chỗ con số cũ là trạng thái
// đang tải chứ không phải con số mới — làm nó mờ đi là hoạt ảnh cho một khoảng trống.
// Đổi cách nạp dữ liệu để có cái mà mờ đi là quyết định về DỮ LIỆU, không phải về chuyển
// động, nên không lẫn vào đây.
//
// Với tháng đã có trong cache (đường thường gặp: bấm ‹ › qua lại) thì số mới thay số cũ
// ngay trong một khung hình, và cái người dùng thấy là con số mới bật lên trong 140ms —
// đúng thứ nguyên tắc "console không trôi, chỉ bật" mô tả.
//
// KHÔNG áp cho <Money> nói chung: nó nằm trong hàng trăm dòng bảng, mà mỗi lần lọc lại
// sổ mà cả bảng cùng nháy thì đó là nhiễu, không phải tín hiệu. Chỉ những con số TO của
// một kỳ (KpiRow, PeriodHeadline) mới cần nói "kỳ vừa đổi".
import type { ReactNode } from 'react'

interface Props {
  /**
   * Giá trị quyết định "đã đổi hay chưa" — truyền chính CON SỐ đang hiện, không phải mã
   * kỳ. Số không đổi giữa hai kỳ (chi hai tháng bằng nhau) thì không có gì để báo, mà
   * theo mã kỳ thì nó vẫn nháy một lần vô nghĩa.
   */
  on: string | number | null
  children: ReactNode
  className?: string
}

/** Bọc một con số: mỗi lần `on` đổi, nội dung bên trong hiện lên trong --motion-period. */
export function Swap({ on, children, className = '' }: Props) {
  // `key` là toàn bộ máy móc: React tháo span cũ và gắn span mới, nên animation chạy lại
  // từ đầu. Đặt animation bằng class mà không đổi key thì nó chỉ chạy đúng một lần lúc
  // mount, còn mọi lần đổi số sau đó đều im lặng.
  return (
    <span key={String(on)} className={`animate-swap-in ${className}`.trim()}>
      {children}
    </span>
  )
}
