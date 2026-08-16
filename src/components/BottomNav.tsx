// Thanh tab dưới — bản mobile của rail (§3). Từ bản 1a nó là thanh DÍNH MÉP có đường
// kẻ trên, không còn là thẻ nổi cách mép 12px: 1a bỏ shadow, mà một thẻ nổi không có
// bóng thì chỉ là một hình chữ nhật lơ lửng giữa hai khoảng trống.
//
// Nằm trong luồng (flex child của khung app) chứ không `fixed`. Bản cũ phải `fixed` rồi
// chừa `pb-28` ở <main> cho khớp — hai con số ở hai file, lệch nhau là dòng cuối danh
// sách chui xuống dưới thanh. Trong luồng thì chiều cao tự trừ vào phần cuộn.
import { NavLink, useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { NAV_ITEMS } from './navItems'

// Chèn nút "+" vào GIỮA dãy tab: ngón cái với tới đó dễ nhất trên màn dọc.
const PLUS_AFTER = 2

export function BottomNav({ hidden }: { hidden: boolean }) {
  const navigate = useNavigate()
  const tabs = NAV_ITEMS.filter((t) => t.onMobile)

  return (
    // data-bottom-nav: móc để index.css ẩn thanh này khi thanh "chọn nhiều" đang mở
    // (hai thanh cùng dính đáy thì chúng chồng lên nhau).
    <nav
      data-bottom-nav
      aria-label="Điều hướng chính"
      className={`shrink-0 items-stretch border-t border-border-panel bg-surface-chrome pb-[env(safe-area-inset-bottom)] lg:hidden print:hidden ${
        hidden ? 'hidden' : 'flex'
      }`}
    >
      {/* Nút "+" là ANH EM của các tab, không lồng trong tab nào. Đã thử lồng nó vào ô
          `flex-1` của tab đứng trước: 52px của nút bị trừ vào phần chia của ĐÚNG ô đó,
          nên ở 320px nhãn "Ngân sách" co còn 4px — một dấu ba chấm. Là anh em thì 52px
          trừ vào tổng, năm tab chia đều phần còn lại. */}
      {tabs.flatMap((tab, i) => {
        const link = (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.to === '/'}
            className={({ isActive }) =>
              // h-[2.875rem] = 46px: trên sàn vùng chạm 44px của app.
              `flex h-[2.875rem] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-3xs transition ${
                isActive ? 'font-semibold text-money-in' : 'text-fg-muted'
              }`
            }
          >
            {/* Không gắn chấm đỏ thông báo vào icon tab: chấm trên tab "Sổ" đọc thành
                "có gì mới trong Sổ" trong khi thật ra là thông báo của chuông. */}
            <tab.Icon className="h-[1.0625rem] w-[1.0625rem]" strokeWidth={1.6} />
            <span className="max-w-full truncate">{tab.label}</span>
          </NavLink>
        )
        if (i !== PLUS_AFTER - 1) return [link]
        return [
          link,
          <button
            key="plus"
            type="button"
            onClick={() => navigate('/entry')}
            aria-label="Nhập giao dịch"
            className="mx-1 flex h-[2.875rem] w-[3.25rem] shrink-0 items-center justify-center self-center rounded-lg bg-accent text-fg-on-accent transition active:scale-95"
          >
            <Plus className="h-5 w-5" strokeWidth={2.2} />
          </button>,
        ]
      })}
    </nav>
  )
}
