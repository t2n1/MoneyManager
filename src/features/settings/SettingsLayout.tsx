// Khung hai cột của Cài đặt trên PC — menu ĐỨNG YÊN bên trái, nội dung đổi bên phải.
//
// Trước đây mỗi mục là một trang riêng: bấm "Tài khoản" là cả màn Cài đặt biến mất, muốn
// sang "Nhãn" phải bấm ‹ quay lại rồi bấm tiếp. Trên điện thoại đó là đúng (một cột, một
// việc mỗi lần); trên màn 1280px thì nó bỏ trống 2/3 bề ngang để làm một việc mà cột trái
// 15rem làm được mà không phải rời trang.
//
// URL VẪN ĐỔI (`/settings/tags`…). Cố ý: bookmark, nút Back của trình duyệt, link trong
// thông báo và 5 chuỗi route trong bộ luật đều trỏ vào đó. Cái bỏ đi là việc THAY CẢ MÀN,
// không phải việc có địa chỉ riêng — React Router lồng route, `<Outlet />` chỉ vẽ lại cột
// phải còn cột trái giữ nguyên DOM (nên nó không nhấp nháy, không cuộn lại từ đầu).
//
// Cột trái CHỈ có từ `lg` — cùng ngưỡng với rail desktop. Dưới ngưỡng đó nó `hidden`, và
// danh sách mục nằm trong chính trang `/settings` (xem SettingsPage), tức điện thoại giữ
// nguyên lối đi cũ.
import { NavLink, Outlet } from 'react-router-dom'
import {
  Bell,
  Database,
  Landmark,
  Layers,
  Scale,
  SlidersHorizontal,
  Tag as TagIcon,
  Tags,
} from 'lucide-react'

export interface SettingsNavItem {
  to: string
  label: string
  Icon: typeof Landmark
  /** Dòng phụ — chỉ hiện ở danh sách MOBILE, cột 15rem không đủ chỗ. */
  hint?: string
  /** true = mục "Chung", không nằm trong danh sách mobile (mobile ĐANG ở đó). */
  index?: boolean
}

/**
 * MỘT nguồn cho hai chỗ vẽ: cột trái ở PC và danh sách trong trang ở điện thoại. Hai bản
 * chép tay là kiểu nợ chỉ lộ ra khi thêm mục thứ tám vào một bên.
 */
export const SETTINGS_NAV: SettingsNavItem[] = [
  {
    to: '/settings',
    label: 'Chung',
    Icon: SlidersHorizontal,
    hint: 'Giao diện · Hồ sơ · Tỷ giá',
    index: true,
  },
  { to: '/settings/accounts', label: 'Tài khoản', Icon: Landmark },
  {
    to: '/settings/asset-groups',
    label: 'Nhóm tài sản',
    Icon: Layers,
    hint: 'Cách cắt lát Tổng tài sản · tính vào tổng, ẩn',
  },
  { to: '/settings/categories', label: 'Danh mục', Icon: Tags },
  { to: '/settings/categories/classify', label: 'Phân loại chi tiêu', Icon: Scale },
  { to: '/settings/tags', label: 'Nhãn', Icon: TagIcon },
  { to: '/settings/notifications', label: 'Thông báo', Icon: Bell },
  {
    to: '/settings/data',
    label: 'Dữ liệu & sao lưu',
    Icon: Database,
    hint: 'Xuất CSV / PDF · Sao lưu, khôi phục · Nhập CSV',
  },
]

// `end` cho MỌI mục, không riêng mục gốc: không có nó thì ở `/settings/categories/classify`
// cả "Danh mục" lẫn "Phân loại chi tiêu" cùng sáng (NavLink khớp theo tiền tố), và cột trái
// nói người dùng đang ở hai chỗ một lúc.
//
// Viền trái 2px có ở CẢ hai trạng thái, chỉ đổi màu — cùng lý do với ô segmented (§1.3 và
// chú thích trong SegmentedControl): tô viền cho riêng mục đang chọn thì mỗi lần đổi mục,
// chữ của mọi mục kia xê 2px.
//
// Vạch màu `fg-accent` chứ không `state-good-border` như rail: đo trên nền Sáng,
// state-good-border (#c9ecd4) trên thẻ trắng chỉ được ~1,2:1 — một vạch không nhìn thấy.
// fg-accent là màu hành động của app, khai riêng cho từng chế độ (#007a33 ở Sáng,
// green-400 ở Tối) nên thấy được ở cả hai. Dù sao vạch cũng KHÔNG phải tín hiệu duy
// nhất: nền và độ đậm chữ đổi cùng lúc.
function NavItem({ item }: { item: SettingsNavItem }) {
  return (
    <NavLink
      to={item.to}
      end
      className={({ isActive }) =>
        `flex min-h-12 items-center gap-3 border-l-2 px-3 py-3 text-sm transition ${
          isActive
            ? 'border-fg-accent bg-surface-sunken font-semibold text-fg-primary'
            : 'border-transparent text-fg-secondary hover:bg-surface-sunken hover:text-fg-primary'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <item.Icon className={`h-5 w-5 shrink-0 ${isActive ? 'text-fg-primary' : 'text-fg-muted'}`} />
          <span className="min-w-0 flex-1">{item.label}</span>
        </>
      )}
    </NavLink>
  )
}

export function SettingsLayout() {
  return (
    // `items-start` để cột trái không bị kéo cao bằng trang dài bên phải — nếu bị kéo,
    // `sticky` mất tác dụng (phần tử đã cao bằng khối cuộn thì chẳng có gì để dính).
    <div className="flex w-full flex-col lg:flex-row lg:items-start">
      <nav
        aria-label="Mục cài đặt"
        // `sticky top-0` bám vào <main> (khối cuộn duy nhất của app, xem AppLayout), nên
        // menu đứng yên trong lúc trang bên phải cuộn dài.
        // Bề rộng theo rem: đây là danh sách CHỮ, cỡ chữ "Rất lớn" mà cột đứng yên thì
        // "Phân loại chi tiêu" gãy dòng giữa từ.
        className="hidden shrink-0 lg:sticky lg:top-0 lg:block lg:w-[15rem] lg:p-6 lg:pr-0"
      >
        <div className="overflow-hidden rounded-lg border border-border-panel bg-surface">
          <div className="divide-y divide-border-subtle">
            {SETTINGS_NAV.map((item) => (
              <NavItem key={item.to} item={item} />
            ))}
          </div>
        </div>
      </nav>

      {/* `min-w-0`: bảng của Tài khoản/Danh mục rộng hơn cột thì phải tự cuộn ngang trong
          cột, chứ không đẩy cột trái ra khỏi màn. */}
      <div className="min-w-0 flex-1">
        <Outlet />
      </div>
    </div>
  )
}
