// Thanh bên trái của desktop — HAI DÁNG, một nút đổi qua lại:
//
//   mở rộng (mặc định) — 160px, mỗi mục là icon + tên.
//   thu gọn            — 56px, chỉ icon, như bản trước khi có nhãn.
//
// Vì sao phải có cả hai: nhãn chữ là thứ duy nhất phân biệt "Sổ" với "Ngân sách" cho
// người mở app lần đầu (hai icon không ai đoán đúng từ hình), nhưng 160px đó lấy đi
// 104px của nội dung. Ai đã nhớ hết bảy icon thì trả lại 104px cho bảng số là đúng.
//
// Lựa chọn nằm ở localStorage, KHÔNG ở hồ sơ người dùng — cùng lối với Sáng/Tối và Cỡ
// chữ (xem src/lib/theme.ts): nó phụ thuộc MÀN HÌNH đang ngồi, không phụ thuộc người.
// Máy 13" thu gọn còn màn ngoài 27" mở rộng là chuyện thường; đẩy lên hồ sơ thì hai máy
// giành nhau một giá trị.
//
// `w-40` / `w-14` là 10rem / 3,5rem, KHÔNG phải px cứng: Cài đặt → Cỡ chữ phóng chữ theo
// `font-size` của <html> (xem src/lib/fontScale.ts), nên thanh phải nở cùng nhãn. Đặt
// cứng px là ở mức 1,25× nhãn "Ngân sách" tràn ra khỏi thanh.
//
// NHÃN KHÔNG BIẾN MẤT KHI THU GỌN, nó chỉ thành `sr-only`. Bỏ hẳn chữ đi rồi đắp
// `aria-label` vào là hai đường đặt tên cho cùng một nút, và đường thứ hai chỉ được kiểm
// bằng mắt. Giữ chữ trong DOM thì tên nút ở hai dáng là MỘT chuỗi, còn `title` lo phần
// tooltip cho chuột.
//   Kèm một cái bẫy đã có tiền lệ trong repo: `.sr-only` của Tailwind là
//   `position:absolute`, nên nếu tổ tiên gần nhất đều `static` thì nó nhảy ra khỏi mọi
//   tầng cắt và KÉO DÀI vùng cuộn của <html> (đo được ở /reports: scrollHeight 2763px
//   trên một khung cao 700px — xem chú thích trong AppLayout.tsx). Vì thế mỗi hàng mang
//   `relative`: nó là khối chứa của cái nhãn ẩn.
//
// Vùng chạm 36px < sàn 44px của app, và đây là ngoại lệ CÓ CHỦ Ý: thanh này
// `hidden lg:flex` nên chỉ tồn tại ở màn ≥1024px, nơi thiết bị trỏ là chuột. Sàn 44px là
// ngưỡng ngón tay (Apple HIG); ngưỡng WCAG 2.5.8 cho con trỏ là 24px. Bản mobile của
// thanh này là thanh tab dưới, ở đó 46px.
import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useAuth } from '../features/auth/AuthProvider'
import { AppLogo } from './AppLogo'
import { NAV_ITEMS } from './navItems'

// Icon 17px, nét 1.6 — bộ số của §2.7. rem chứ không px: Cài đặt → Cỡ chữ phóng chữ
// mà icon đứng yên thì nhãn to dần bên cạnh một hình vẽ bé tí.
const ICON = 'h-[1.0625rem] w-[1.0625rem] shrink-0'

const COLLAPSE_KEY = 'rail-collapsed'

// try/catch quanh localStorage theo đúng lối readSortMode() của BudgetView: chế độ riêng
// tư của trình duyệt làm getItem NÉM, và một cái nav không được phép làm trắng màn hình.
function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1'
  } catch {
    return false
  }
}

export function AppRail() {
  const { session } = useAuth()
  const email = session?.user?.email
  // Đọc ngay trong initializer, không qua effect: đọc ở effect thì lần sơn đầu luôn là
  // dáng mở rộng rồi mới co lại — người chọn thu gọn thấy thanh giật một nhịp mỗi lần
  // mở app.
  const [collapsed, setCollapsed] = useState(readCollapsed)

  function toggle() {
    const next = !collapsed
    setCollapsed(next)
    try {
      localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0')
    } catch {
      // Không lưu được thì thôi — lựa chọn vẫn đúng trong phiên này.
    }
  }

  // Một hàng: 36px cao, bo 12px. Thu gọn thì thành ô vuông 36px, mở rộng thì trải ngang
  // và chừa 10px giữa icon với nhãn. `relative` là khối chứa của nhãn `sr-only` — xem
  // đầu file.
  const row = collapsed
    ? 'relative flex h-9 w-9 items-center justify-center rounded-xl transition'
    : 'relative flex h-9 items-center gap-2.5 rounded-xl px-2.5 transition'

  return (
    <nav
      aria-label="Điều hướng chính"
      // w cố định chứ không để padding tự cộng ra: đây là cột NGOÀI CÙNG, lệch 1px ở
      // đây là cả vùng nội dung lệch theo.
      className={`hidden shrink-0 flex-col gap-1 border-r border-border-panel bg-surface-chrome px-2 py-3 lg:flex print:hidden ${
        collapsed ? 'w-14 items-center' : 'w-40'
      }`}
    >
      {/* Logo là DẤU HIỆU, không phải nút. Trước đây nó là <NavLink to="/"> — cùng đích
          với mục "Bản tin" ngay dưới, nên cột này có một ô bấm được nhiều hơn số màn, và
          hai ô đầu đi cùng một chỗ. Người đọc không có cách nào biết ô nào là điều hướng,
          ô nào là nhãn.
          Bỏ liên kết chứ không bỏ hình: hình còn giữ vai "đây là app nào", mà đường về
          trang chủ thì mục "Bản tin" đã mang sẵn, cách nó 8px.
          Chữ "Sổ Gạo" chỉ có ở dáng mở rộng — ở 56px nó không còn chỗ, và một hình 26px
          đứng một mình giữa 160px thì đọc thành icon bị bỏ quên chứ không phải nhãn app.
          `aria-hidden` cho cả cụm: tên app không phải mục điều hướng, và nó đã có ở
          <title> của tài liệu.
          `mb-1.5` tách nhãn khỏi cột nút. tests/navMobile.test.ts canh đúng một
          <NavLink> trong file này. */}
      <span aria-hidden className="mb-1.5 flex items-center gap-2 px-1.5">
        <AppLogo className="h-6.5 w-6.5 shrink-0 rounded-lg" />
        {!collapsed && <span className="truncate text-sm font-bold text-fg-primary">Sổ Gạo</span>}
      </span>
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          // `title` ở CẢ hai dáng: thu gọn thì nó là thứ duy nhất nói tên cho chuột, mở
          // rộng thì nó lấp phần `truncate` có thể cắt ở cỡ chữ 1,25×.
          title={item.label}
          className={({ isActive }) =>
            // Trạng thái chọn = nền accent pha loãng + ring TRONG (box-shadow, không
            // chiếm chỗ) — không có viền thật nên không có chuyện cột nút xê 1px khi đổi
            // trang. Màu chữ là fg-accent (hành động), không phải money-in (giá trị
            // tiền) — hai token đã tách nghĩa.
            `${row} ${
              isActive
                ? 'bg-accent-soft text-fg-accent-on-track ring-1 ring-accent-soft-ring ring-inset'
                : 'text-fg-muted hover:bg-surface-sunken hover:text-fg-primary'
            }`
          }
        >
          <item.Icon className={ICON} strokeWidth={1.6} />
          <span className={collapsed ? 'sr-only' : 'truncate text-sm font-medium'}>
            {item.label}
          </span>
        </NavLink>
      ))}
      {/* Nút đổi dáng. `mt-auto` đẩy nó xuống đáy — CHỖ ĐỨNG YÊN là điều kiện để nó dùng
          được: một nút đổi bố cục mà tự đổi chỗ theo bố cục thì lượt bấm thứ hai phải đi
          tìm lại nút. Ở đáy thì hai dáng chỉ khác nhau ở chỗ có chữ hay không.
          Không dùng <IconButton>: nó khai 44×44 (ngưỡng ngón tay) còn cả cột này là 36px
          chỉ-dùng-chuột — một nút 44px chen vào là hàng duy nhất lệch khỏi nhịp.
          Dùng chung `row` với các mục nav để nó nằm đúng nhịp đó, nhưng KHÔNG có trạng
          thái chọn: nó không phải một đích đến. */}
      <button
        type="button"
        onClick={toggle}
        title={collapsed ? 'Mở rộng' : 'Thu gọn'}
        aria-expanded={!collapsed}
        className={`${row} mt-auto text-fg-muted hover:bg-surface-sunken hover:text-fg-primary`}
      >
        {collapsed ? (
          <PanelLeftOpen className={ICON} strokeWidth={1.6} />
        ) : (
          <PanelLeftClose className={ICON} strokeWidth={1.6} />
        )}
        <span className={collapsed ? 'sr-only' : 'truncate text-sm font-medium'}>
          {collapsed ? 'Mở rộng' : 'Thu gọn'}
        </span>
      </button>
      {/* Đang đăng nhập bằng tài khoản nào. Ở 56px chỉ đủ chữ đầu của email; ở 160px thì
          cả email vào được (cắt bằng `truncate`, `title` giữ bản đầy đủ) — "t2n@…" và
          "vo@…" phân biệt được bằng chữ, không phải bằng cách hover một vòng tròn.
          Không phải nút: nó nói trạng thái, không dẫn đi đâu.
          (Chú thích chế độ demo ở AppFooter — ở đó nó là câu đầy đủ và hiện trên MỌI cỡ
          màn, chứ không riêng desktop.) */}
      {email && (
        <span title={email} className="flex items-center gap-2 px-1.5 pt-1">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-state-good-bg text-2xs font-semibold text-state-good-fg">
            {email[0].toUpperCase()}
          </span>
          {!collapsed && <span className="truncate text-2xs text-fg-muted">{email}</span>}
        </span>
      )}
    </nav>
  )
}
