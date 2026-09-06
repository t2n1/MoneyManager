// Thanh bên trái 160px — khung điều hướng desktop, MỖI MỤC CÓ CHỮ.
//
// Trước đây đây là một rail 56px chỉ có icon, và lý do ghi ở chỗ này là "đổi 240px lấy
// 56px để trả 188px về cho nội dung". Cái giá của nó là chữ: bảy hình vẽ xếp dọc thì
// `title` + `aria-label` chỉ cứu được người CHỊU hover và người dùng trình đọc màn —
// người mở app lần đầu vẫn phải đoán, và "Sổ" với "Ngân sách" là hai icon không ai đoán
// đúng từ hình. Bản này lấy lại 104px để in nhãn.
//
// Vì sao 160px (`w-40`) mà không phải 240px như bản đầu: 240px là bề rộng của một sidebar
// CÓ NHÓM và có dòng phụ. Ở đây mỗi mục là một dòng chữ, nhãn dài nhất là "Ngân sách"
// (~66px ở `text-sm`), nên 160px đã dư chỗ — và phần dư đó thuộc về nội dung.
//
// `w-40` là 10rem, KHÔNG phải 160px cứng: Cài đặt → Cỡ chữ phóng chữ theo `font-size`
// của <html> (xem src/lib/fontScale.ts), nên thanh phải nở cùng nhãn. Đặt cứng px là ở
// mức 1,25× nhãn "Ngân sách" tràn ra khỏi thanh.
//
// Vùng chạm 36px < sàn 44px của app, và đây là ngoại lệ CÓ CHỦ Ý: thanh này
// `hidden lg:flex` nên chỉ tồn tại ở màn ≥1024px, nơi thiết bị trỏ là chuột. Sàn 44px là
// ngưỡng ngón tay (Apple HIG); ngưỡng WCAG 2.5.8 cho con trỏ là 24px. Bản mobile của
// thanh này là thanh tab dưới, ở đó 46px.
import { NavLink } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthProvider'
import { AppLogo } from './AppLogo'
import { NAV_ITEMS } from './navItems'

// Icon 17px, nét 1.6 — bộ số của §2.7. rem chứ không px: Cài đặt → Cỡ chữ phóng chữ
// mà icon đứng yên thì nhãn to dần bên cạnh một hình vẽ bé tí.
const ICON = 'h-[1.0625rem] w-[1.0625rem] shrink-0'

export function AppRail() {
  const { session } = useAuth()
  const email = session?.user?.email
  return (
    <nav
      aria-label="Điều hướng chính"
      // w cố định chứ không để padding tự cộng ra: đây là cột NGOÀI CÙNG, lệch 1px ở
      // đây là cả vùng nội dung lệch theo.
      className="hidden w-40 shrink-0 flex-col gap-1 border-r border-border-panel bg-surface-chrome px-2 py-3 lg:flex print:hidden"
    >
      {/* Logo là DẤU HIỆU, không phải nút. Trước đây nó là <NavLink to="/"> — cùng đích
          với mục "Bản tin" ngay dưới, nên cột này có TÁM ô bấm được cho BẢY màn, và hai
          ô đầu đi cùng một chỗ. Người đọc không có cách nào biết ô nào là điều hướng, ô
          nào là nhãn.
          Bỏ liên kết chứ không bỏ hình: hình còn giữ vai "đây là app nào", mà đường về
          trang chủ thì mục "Bản tin" đã mang sẵn, cách nó 8px.
          Có chữ "Sổ Gạo" từ khi thanh rộng ra: một hình 26px đứng một mình giữa 160px
          đọc thành một icon bị bỏ quên, không phải một nhãn app. `aria-hidden` cho cả
          cụm — tên app không phải mục điều hướng, và nó đã có ở <title> của tài liệu.
          `mb-1.5` tách nhãn khỏi cột nút. tests/navMobile.test.ts canh đúng một
          <NavLink> trong file này. */}
      <span aria-hidden className="mb-1.5 flex items-center gap-2 px-1.5">
        <AppLogo className="h-6.5 w-6.5 shrink-0 rounded-lg" />
        <span className="truncate text-sm font-bold text-fg-primary">Sổ Gạo</span>
      </span>
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          // `title` ở lại dù nhãn đã hiện: `truncate` bên dưới có thể cắt chữ ở cỡ chữ
          // 1,25×, và lúc đó tooltip là thứ duy nhất nói hết tên. `aria-label` thì BỎ —
          // chữ trong nút giờ chính là tên có thể đọc được, thêm aria-label là đặt một
          // cái tên thứ hai lên cùng một nút.
          title={item.label}
          className={({ isActive }) =>
            // Dòng cao 36px bo 12px. Trạng thái chọn = nền accent pha loãng + ring TRONG
            // (box-shadow, không chiếm chỗ) — không có viền thật nên không có chuyện cột
            // nút xê 1px khi đổi trang. Màu chữ là fg-accent (hành động), không phải
            // money-in (giá trị tiền) — hai token đã tách nghĩa.
            `flex h-9 items-center gap-2.5 rounded-xl px-2.5 transition ${
              isActive
                ? 'bg-accent-soft text-fg-accent-on-track ring-1 ring-accent-soft-ring ring-inset'
                : 'text-fg-muted hover:bg-surface-sunken hover:text-fg-primary'
            }`
          }
        >
          <item.Icon className={ICON} strokeWidth={1.6} />
          <span className="truncate text-sm font-medium">{item.label}</span>
        </NavLink>
      ))}
      {/* Đang đăng nhập bằng tài khoản nào. Thanh 56px cũ chỉ đủ chữ đầu của email; ở
          160px thì cả email vào được (cắt bằng `truncate`, `title` giữ bản đầy đủ) —
          "t2n@…" và "vo@…" phân biệt được bằng chữ, không phải bằng cách hover một vòng
          tròn. Không phải nút: nó nói trạng thái, không dẫn đi đâu.
          (Chú thích chế độ demo ở AppFooter — ở đó nó là câu đầy đủ và hiện trên MỌI cỡ
          màn, chứ không riêng desktop.) */}
      {email && (
        <span title={email} className="mt-auto flex items-center gap-2 px-1.5 pt-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-state-good-bg text-2xs font-semibold text-state-good-fg">
            {email[0].toUpperCase()}
          </span>
          <span className="truncate text-2xs text-fg-muted">{email}</span>
        </span>
      )}
    </nav>
  )
}
