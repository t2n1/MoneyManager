// Rail trái 52px — khung điều hướng desktop của bản 1a (§3), thay thanh bên 240px.
//
// Đổi 240px lấy 52px là đổi NHÃN lấy CHỖ: 188px trả về cho nội dung, đủ để bảng giao
// dịch giữ cột "Tài khoản" ở màn 1280. Cái mất là chữ dưới mỗi icon, nên `title` +
// `aria-label` là BẮT BUỘC ở mỗi nút, không phải trang trí — không có chúng thì rail
// chỉ là sáu hình vẽ.
//
// Vùng chạm 34px < sàn 44px của app, và đây là ngoại lệ CÓ CHỦ Ý: rail `hidden lg:flex`
// nên chỉ tồn tại ở màn ≥1024px, nơi thiết bị trỏ là chuột. Sàn 44px là ngưỡng ngón tay
// (Apple HIG); ngưỡng WCAG 2.5.8 cho con trỏ là 24px. Bản mobile của rail là thanh tab
// dưới, ở đó 46px.
import { NavLink } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthProvider'
import { AppLogo } from './AppLogo'
import { NAV_ITEMS } from './navItems'

// Icon 17px, nét 1.6 — bộ số của §2.7. rem chứ không px: Cài đặt → Cỡ chữ phóng chữ
// mà icon đứng yên thì nhãn to dần bên cạnh một hình vẽ bé tí.
const ICON = 'h-[1.0625rem] w-[1.0625rem]'

export function AppRail() {
  const { session } = useAuth()
  const email = session?.user?.email
  return (
    <nav
      aria-label="Điều hướng chính"
      // w cố định 56px (redesign 2) chứ không để padding tự cộng ra: rail là cột NGOÀI
      // CÙNG, lệch 1px ở đây là cả vùng nội dung lệch theo.
      className="hidden w-14 shrink-0 flex-col items-center gap-2 border-r border-border-panel bg-surface-chrome py-3 lg:flex print:hidden"
    >
      {/* Logo là DẤU HIỆU, không phải nút. Trước đây nó là <NavLink to="/"> — cùng đích
          với mục "Bản tin" ngay dưới, nên cột rail có BẢY ô bấm được cho SÁU màn, và hai
          ô đầu đi cùng một chỗ. Đếm trên màn Báo cáo ra đúng bảy hình vẽ xếp dọc: người
          đọc không có cách nào biết ô nào là điều hướng, ô nào là nhãn.
          Bỏ liên kết chứ không bỏ hình: hình còn giữ vai "đây là app nào", mà đường về
          trang chủ thì mục "Bản tin" đã mang sẵn, cách nó 8px.
          `mb-1.5` tách nhãn khỏi cột nút (redesign 2 bỏ đường kẻ dưới logo — khoảng
          cách đủ nói). tests/navMobile.test.ts canh đúng con số sáu. */}
      <span aria-hidden className="mb-1.5">
        <AppLogo className="h-6.5 w-6.5 rounded-lg" />
      </span>
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          title={item.label}
          aria-label={item.label}
          className={({ isActive }) =>
            // Ô 36px bo 12px (redesign 2). Trạng thái chọn = nền accent pha loãng +
            // ring TRONG (box-shadow, không chiếm chỗ) — không có viền thật nên không
            // có chuyện cột icon xê 1px khi đổi trang. Màu chữ là fg-accent (hành
            // động), không phải money-in (giá trị tiền) — hai token đã tách nghĩa.
            `flex h-9 w-9 items-center justify-center rounded-xl transition ${
              isActive
                ? 'bg-accent-soft text-fg-accent-on-track ring-1 ring-accent-soft-ring ring-inset'
                : 'text-fg-muted hover:bg-surface-sunken hover:text-fg-primary'
            }`
          }
        >
          <item.Icon className={ICON} strokeWidth={1.6} />
        </NavLink>
      ))}
      {/* Đang đăng nhập bằng tài khoản nào — thanh bên 240px cũ ghi cả email, rail
          52px chỉ đủ chữ đầu. Không phải nút: nó nói trạng thái, không dẫn đi đâu.
          (Chú thích chế độ demo chuyển xuống AppFooter — ở đó nó là câu đầy đủ và
          hiện trên MỌI cỡ màn, chứ không riêng desktop như trước.) */}
      {email && (
        <span
          title={email}
          className="mt-auto flex h-6 w-6 items-center justify-center rounded-full bg-state-good-bg text-2xs font-semibold text-state-good-fg"
        >
          {email[0].toUpperCase()}
        </span>
      )}
    </nav>
  )
}
