// Mục lục dính có số thứ tự, để nhảy trong những tab dài.
//
// Vấn đề nó giải: tab Biểu đồ / Thấu hiểu / Sức khỏe mỗi tab là 5–7 thẻ cao, tổng ra
// 3–5 màn cuộn. Muốn xem lại "cơ cấu chi tiêu" thì phải cuộn tìm, và không có gì cho
// biết màn này còn những gì phía dưới.
//
// Số thứ tự KHÔNG phải trang trí: nó cho biết "còn mấy khối nữa" — thứ mà thanh cuộn
// trên mobile không nói được.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { pickActive } from './sectionActive'

/**
 * Bọc một khối để mục lục nhảy tới được. `scroll-mt-16` (64px) vì mục lục dính cao 57px
 * (chip 44px + đệm) — thiếu một pixel là tiêu đề thẻ nằm khuất dưới nó sau khi nhảy.
 */
export function Section({
  id,
  className = '',
  children,
}: {
  id: string
  /** Dùng cho `lg:col-span-2` — thẻ có biểu đồ ngang dài chiếm cả hai cột của lưới PC. */
  className?: string
  children: ReactNode
}) {
  return (
    <div id={id} className={`scroll-mt-16 ${className}`.trim()}>
      {children}
    </div>
  )
}

export interface IndexItem {
  /** id của phần tử bọc khối nội dung (phải có `scroll-mt-*` để không bị mục lục che). */
  id: string
  /** Nhãn ngắn — mục lục là một hàng chip cuộn ngang trên mobile. */
  label: string
}

interface Props {
  /**
   * CHỈ những khối thật sự đang render. Nơi gọi tự lọc theo đúng điều kiện nó dùng để
   * render (vd `anomalies.length > 0`) — thà lặp lại điều kiện ở hai chỗ cạnh nhau còn
   * hơn để mục lục đi dò `document.getElementById` sau mỗi lần vẽ: dò DOM thì phải giữ
   * kết quả trong state, mà setState trong effect không phụ thuộc là cửa ngõ của vòng
   * lặp cập nhật vô tận.
   */
  items: readonly IndexItem[]
}

export function SectionIndex({ items }: Props) {
  const [active, setActive] = useState<string | null>(items[0]?.id ?? null)
  const listRef = useRef<HTMLDivElement>(null)

  // IntersectionObserver chỉ dùng làm CÒI BÁO "có khối vừa vào/ra khung", còn việc chọn
  // khối nào đang xem thì giao cho `pickActive` (thuần, có test riêng). Tách như vậy vì
  // dây nối này không kiểm bằng máy được: IO giao callback trong bước "cập nhật hiển thị"
  // nên ở môi trường không dựng khung hình nó không chạy lấy một lần (đã đo). Ít nhất
  // phần quyết định — chỗ dễ sai — thì kiểm được.
  //
  // Không dùng sự kiện `scroll`: nó chạy trên luồng chính mỗi lần cuộn, mà thứ cần biết
  // chỉ là "đã sang khối khác chưa" — đúng việc của IO.
  useEffect(() => {
    const nodes = items
      .map((i) => document.getElementById(i.id))
      .filter((n): n is HTMLElement => n !== null)
    if (nodes.length === 0) return

    const update = () => {
      const cutoff = (listRef.current?.getBoundingClientRect().bottom ?? 0) + 8
      const id = pickActive(
        nodes.map((n) => ({ id: n.id, top: n.getBoundingClientRect().top })),
        cutoff,
      )
      if (id) setActive(id)
    }
    const io = new IntersectionObserver(update, { threshold: 0 })
    for (const n of nodes) io.observe(n)
    return () => io.disconnect()
  }, [items])

  // Chip đang hoạt động phải tự cuộn vào tầm nhìn: ở mobile hàng chip dài hơn màn hình,
  // nên khi cuộn tới khối thứ 6 mà chip của nó nằm ngoài mép phải thì mục lục vô dụng.
  //
  // Tự đặt `scrollLeft` chứ KHÔNG dùng scrollIntoView: scrollIntoView cuộn mọi tổ tiên
  // cuộn được, tức là đụng luôn <main> — mà bất kỳ cú cuộn nào lên <main> cũng HUỶ cú
  // cuộn mượt vừa phát ra từ nút bấm. Triệu chứng đã gặp: bấm chip thì chip sáng lên
  // nhưng trang đứng im.
  useEffect(() => {
    const list = listRef.current
    if (!active || !list) return
    const chip = list.querySelector<HTMLElement>(`[data-for="${active}"]`)
    if (!chip) return
    const PAD = 8
    const left = chip.offsetLeft
    const right = left + chip.offsetWidth
    if (left < list.scrollLeft) list.scrollLeft = left - PAD
    else if (right > list.scrollLeft + list.clientWidth)
      list.scrollLeft = right - list.clientWidth + PAD
  }, [active])

  // Dưới 3 khối thì cuộn tay nhanh hơn bấm — mục lục chỉ là thêm một hàng chiếm chỗ.
  if (items.length < 3) return null

  return (
    <nav
      aria-label="Mục lục trang"
      // Dính vào đầu vùng cuộn (<main> là vùng cuộn, không phải cả trang — xem AppLayout).
      // -mx-3 để nền trải hết bề ngang, nếu không thì nội dung lộ ra hai bên khi cuộn dưới.
      //
      // `lg:hidden`: từ `lg` các thẻ xếp HAI CỘT, nên hai khối cạnh nhau có cùng mép
      // trên. `pickActive` chọn khối cuối cùng đã qua vạch, tức là khối bên trái của mỗi
      // cặp KHÔNG bao giờ sáng lên được. Mà trên màn rộng trang cũng chỉ còn nửa chiều
      // cao, cuộn tay là thấy hết — mục lục hết việc để làm.
      className="sticky top-0 z-10 -mx-3 border-b border-border-subtle bg-surface-page px-3 py-1.5 lg:hidden lg:-mx-6 lg:px-6 print:hidden"
    >
      <div ref={listRef} className="flex gap-1.5 overflow-x-auto">
        {items.map((item, i) => {
          const on = item.id === active
          return (
            <button
              key={item.id}
              type="button"
              data-for={item.id}
              aria-current={on ? 'true' : undefined}
              onClick={() => {
                const el = document.getElementById(item.id)
                if (!el) return
                // Cuộn TỨC THÌ, không `behavior: 'smooth'`. Cuộn mượt là hoạt ảnh, và
                // hoạt ảnh chỉ chạy khi trình duyệt đang dựng khung hình — đã đo thấy
                // nó im hoàn toàn (scrollTop đứng nguyên 0 sau 1 giây) ở môi trường
                // không compose frame. Mục lục mà bấm không nhảy thì hỏng hẳn công dụng,
                // nên đổi lấy sự chắc chắn.
                el.scrollIntoView({ block: 'start' })
                // Đặt ngay, không chờ observer: observer chỉ báo sau khi khối vào khung.
                setActive(item.id)
              }}
              // min-h-11 = 44px vùng chạm, cùng chuẩn với IconButton. Chip mục lục là
              // thứ người ta bấm giữa lúc đang cuộn, đúng lúc dễ trượt tay nhất.
              className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm transition ${
                on
                  ? 'bg-surface font-medium text-fg-primary shadow-sm'
                  : 'text-fg-on-track hover:bg-surface'
              }`}
            >
              <span className="tabular-nums text-fg-muted">{i + 1}</span>
              {item.label}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
