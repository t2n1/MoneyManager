// Đầu trang — một khuôn cho cả 25 màn.
//
// Đo 2026-08-24: BẢY kiểu đầu trang cho 25 trang, và không có component nào — 18 chỗ tự
// chép lại `<h1 className="flex-1 text-lg font-bold text-fg-primary">`. Người dùng thấy
// đúng cái đó: "cái thì có tiêu đề to góc trái, cái thì không".
//   · Bản tin      — h1 sr-only, chữ đến từ top bar
//   · Sổ           — không tiêu đề, chỉ ‹ 2026/08 › + 4 nút
//   · Ngân sách    — không tiêu đề gì
//   · Báo cáo/Cài đặt — h1 trái, không back, không nút
//   · Tài sản      — h1 + 2 nhóm tab + 6 nút, TẤT CẢ một hàng
//   · Nhập         — tiêu đề canh giữa, 16px, nút "Đóng" trái
//   · 13 trang con — ‹ back + h1 18px  ← đông nhất, và là khuôn lấy ở đây
//
// TIÊU ĐỀ TỰ ẨN Ở `lg`, và đó là mục riêng của bản kiểm kê: từ 1024px `AppTopBar` đã in
// tên màn, mà 16 trang vẫn tự in lại y hệt ngay dưới — "Báo cáo" nằm trên "Báo cáo".
// Ẩn bằng `sr-only` chứ không `hidden`: top bar là <p> (cố ý — xem AppTopBar), nên bỏ
// hẳn h1 là cây tiêu đề của trang thủng, đúng cái ReportsPage từng ghi chú tránh.
//
// `sr-only` là `position:absolute` nên nó rơi khỏi luồng flex — chỗ nào có hành động bên
// phải thì cần một khoảng đệm giữ chúng ở lại mép phải. Xem <span aria-hidden> bên dưới.
import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { BackLink } from '../BackLink'
import { topBarTitle } from '../navItems'

interface Props {
  /** Tên màn. Luôn render ra <h1> thật, kể cả khi ẩn ở desktop. */
  title: ReactNode
  /**
   * Đích của nút quay lại khi KHÔNG lùi được (mở thẳng link, bấm thông báo, tab mới).
   * Có `back` = đây là trang con. Bỏ trống = màn gốc, rail/thanh tab đã nói đang ở đâu.
   */
  back?: string
  /** Thay nút quay lại bằng thứ khác — màn Nhập dùng nút "Đóng" có chữ. */
  left?: ReactNode
  /**
   * Dòng phụ dưới tiêu đề — dùng ở trang chi tiết ("Thẻ tín dụng · JPY · trả từ Rakuten
   * Bank"). Ở `lg` tiêu đề thành sr-only nhưng dòng này Ở LẠI: nó không phải tên màn,
   * nó là thứ quyết định cách đọc mọi con số bên dưới.
   */
  subtitle?: ReactNode
  /** Hành động / bộ đổi tháng ở mép phải. */
  children?: ReactNode
  /** Bỏ khoảng cách dưới — khi khối cha đã tự giãn bằng `gap`. */
  flush?: boolean
  /**
   * Cả hàng chỉ có ở mobile. Dùng cho ba màn theo tháng (Bản tin, Sổ, Ngân sách): thứ
   * chúng đặt bên phải tiêu đề là bộ đổi tháng và lối vào Báo cáo/Cài đặt, mà từ `lg`
   * cả ba đã có chỗ khác — top bar mang bộ ‹ ›, rail mang hai lối vào. Để hàng hiện ở
   * desktop là hai bộ điều khiển giống hệt nhau cách nhau 60px trên cùng một màn.
   *
   * `sr-only` KHÔNG dùng được ở đây: nó nằm trong một khối `lg:hidden` thì cũng bị ẩn
   * theo, tức cây tiêu đề của trang thủng ở desktop. Nên chế độ này render <h1> sr-only
   * RIÊNG, còn chữ nhìn thấy trong hàng là <p> — đúng cách BulletinPage đã làm từ trước.
   */
  mobileOnly?: boolean
  className?: string
}

const TITLE = 'min-w-0 truncate text-lg font-bold text-fg-primary'

export function PageHeader({
  title,
  back,
  left,
  subtitle,
  children,
  flush,
  mobileOnly,
  className = '',
}: Props) {
  const { pathname } = useLocation()
  const gap = flush ? '' : 'mb-3'
  const row = `${gap} flex flex-wrap items-center gap-2`
  const leftSlot = left ?? (back ? <BackLink to={back} aria-label="Quay lại" /> : null)

  // Ẩn ở `lg` CHỈ KHI top bar đang in đúng chữ này. Bảng của top bar khớp theo TIỀN TỐ
  // (`/settings/accounts` → "Cài đặt"), nên ẩn vô điều kiện là trang con mất luôn tên
  // riêng trên desktop: thanh trên nói "Cài đặt", trang không nói "Tài khoản" ở đâu cả.
  // Đo được đúng thế ở 7 trang con trước khi thêm phép so này.
  //
  // Tiêu đề là ReactNode (tên danh mục, tiêu đề kèm số đếm) thì không so được — và cũng
  // không cần: những chỗ đó chắc chắn khác tên khu, nên cứ hiện.
  const trungTopBar = typeof title === 'string' && title === topBarTitle(pathname)
  const titleCls = trungTopBar ? `${TITLE} lg:sr-only` : TITLE

  // Không có gì ngoài tiêu đề: đừng dựng cả một hàng flex chỉ để rồi ở `lg` nó rỗng và
  // vẫn chiếm 44px. Trả thẳng <h1> — ở lg nó thành sr-only nên không chiếm chỗ nào.
  if (mobileOnly) {
    return (
      <>
        <h1 className="sr-only">{title}</h1>
        <div className={`${row} lg:hidden ${className}`.trim()}>
          <p className="min-w-0 truncate text-lg font-bold text-fg-primary">{title}</p>
          {children}
        </div>
      </>
    )
  }

  if (!leftSlot && !children && !subtitle) {
    return <h1 className={`${gap} ${titleCls} ${trungTopBar ? 'lg:mb-0' : ''} ${className}`.trim()}>{title}</h1>
  }

  return (
    <div className={`${row} ${className}`.trim()}>
      {leftSlot}
      {subtitle ? (
        // Có dòng phụ thì tiêu đề cần một CỘT, không phải một ô trên hàng flex — và cột
        // đó giữ `flex-1` kể cả khi h1 bên trong thành sr-only ở lg.
        <div className="min-w-0 flex-1">
          <h1 className={titleCls}>{title}</h1>
          <p className="truncate text-sm text-fg-muted">{subtitle}</p>
        </div>
      ) : (
        <>
          <h1 className={`flex-1 ${titleCls}`}>{title}</h1>
          {/* Đệm thay chỗ của h1 khi nó thành sr-only ở lg — thiếu nó thì hành động bên
              phải trượt sang trái, dính vào nút quay lại. aria-hidden: không mang nghĩa.
              Chỉ cần khi h1 thật sự biến mất ở lg. */}
          {trungTopBar && <span aria-hidden className="hidden flex-1 lg:block" />}
        </>
      )}
      {children}
    </div>
  )
}
