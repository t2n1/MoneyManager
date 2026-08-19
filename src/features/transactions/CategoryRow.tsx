import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronLeft } from 'lucide-react'
import { Card } from '../../components/ui'
import { childCounts, type RecentCategory } from './recentCategories'

/** Sườn tối thiểu component cần — không đòi `type` như `Category` của recentCategories.ts,
 *  vì `TransactionForm` đã lọc đúng loại trước khi truyền vào (`activeOfType`). */
interface CategoryItem {
  id: string
  name: string
  icon: string
  parent_id?: string | null
  is_archived: boolean
}

interface Props {
  /** Danh mục chọn tay của đúng loại đang mở — gồm cả nhóm cha và con (đã lọc archived
   *  + tự gán ở `pickableCategories`, xem TransactionForm.tsx). */
  categories: CategoryItem[]
  /** Tối đa 3 danh mục dùng nhiều nhất (Task 12) — mỗi cái mang theo `parentId` để MỘT
   *  CHẠM đặt cả nhóm cha và danh mục con, không phải hai bước (chọn nhóm → chọn con). */
  recent: RecentCategory[]
  value: string | null
  onChange: (id: string) => void
  /** Câu nhắc khi loại này chưa có danh mục nào để chọn (xem CategoriesPage). */
  emptyNote: string
}

/**
 * Hàng danh mục: "Gần đây" (tối đa 3 chip) + chip "Khác" mở lưới đủ tại chỗ.
 *
 * Thu 250px của lưới 4 cột về một hàng ~42px là ĐIỀU KIỆN màn vừa 360×780, không phải ý
 * thẩm mỹ — xem ngân sách chiều cao ở task-13-brief. Lưới mở ra CHÈN THÊM bên dưới hàng
 * chip (không thay chỗ nó, không phải sheet/modal — gói thiết kế cấm hẳn việc đó), và thu
 * lại ngay sau khi chọn xong để không giữ nguyên 250px cho lần render sau.
 */
export function CategoryRow({ categories, recent, value, onChange, emptyNote }: Props) {
  const [expanded, setExpanded] = useState(false)
  // Picker danh mục con: đang mở nhóm cha nào trong lưới (null = màn danh mục chính).
  const [drillId, setDrillId] = useState<string | null>(null)

  const topCategories = categories.filter((c) => !c.parent_id)
  const childrenOf = (id: string) => categories.filter((c) => c.parent_id === id)
  const counts = childCounts(categories)
  const selected = categories.find((c) => c.id === value) ?? null
  const drillParent = drillId ? topCategories.find((c) => c.id === drillId) ?? null : null
  const drillChildren = drillParent ? childrenOf(drillParent.id) : []

  /** Chọn xong một danh mục (chip Gần đây, tile không con, hoặc tile con trong lưới) →
   *  thu lưới lại. Mở sẵn cho lần sau là giữ nguyên 250px, đúng cái task này xoá. */
  function pick(id: string) {
    onChange(id)
    setExpanded(false)
    setDrillId(null)
  }

  /** Mở lưới đúng chỗ đang chọn: nếu danh mục hiện tại thuộc một nhóm cha, mở sẵn vào
   *  nhóm đó — không bắt người dùng dò lại từ đầu để thấy ô đang tô. */
  function openGrid() {
    setDrillId(selected?.parent_id ?? null)
    setExpanded(true)
  }

  if (topCategories.length === 0) {
    // Không còn danh mục nào của loại này (chưa tạo, hoặc lưu trữ hết). Trước đây chỗ
    // này là một vùng TRỐNG TRƠN kèm nút Lưu chết — không đường nào đi tiếp.
    return (
      <Card padding="lg" className="text-center text-xs text-fg-muted">
        {emptyNote}
        <Link to="/settings/categories" className="mt-1 block font-medium text-fg-accent underline">
          Mở Cài đặt → Danh mục
        </Link>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      {/* KHÔNG `flex-wrap`: 3 chip Gần đây + chip "Khác" đủ rộng để vỡ 2 hàng ở 360px,
          mà hàng này phải giữ MỘT hàng ~42px (xem ngân sách chiều cao ở task-13-brief)
          — vỡ hai hàng ăn hết khoảng thu được từ việc gộp lưới. Cuộn ngang thay vỡ hàng. */}
      <div className="flex items-center gap-1.5 overflow-x-auto">
        {recent.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => pick(r.id)}
            className={`flex h-8 shrink-0 items-center gap-1 rounded-full border-2 px-2.5 text-xs transition active:scale-95 ${
              value === r.id
                ? 'border-accent bg-state-good-bg text-fg-primary'
                : 'border-border-strong bg-surface text-fg-secondary'
            }`}
          >
            <span className="text-sm leading-none">{r.icon}</span>
            {r.name}
          </button>
        ))}
        <button
          type="button"
          onClick={() => (expanded ? setExpanded(false) : openGrid())}
          aria-expanded={expanded}
          className="flex h-8 shrink-0 items-center gap-1 rounded-full border-2 border-border-strong bg-surface px-2.5 text-xs text-fg-secondary transition active:scale-95"
        >
          Khác
          <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {expanded &&
        (drillParent ? (
          /* Trong một nhóm cha → chọn danh mục con (bắt buộc) */
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              onClick={() => setDrillId(null)}
              className="flex items-center gap-1.5 self-start rounded-md border border-border-strong bg-surface px-2.5 py-1 text-xs font-medium text-fg-secondary transition active:scale-95"
            >
              <ChevronLeft className="h-4 w-4" /> <span className="text-base leading-none">{drillParent.icon}</span>{' '}
              {drillParent.name}
            </button>
            <div className="grid auto-rows-min grid-cols-4 gap-1.5 lg:grid-cols-5">
              {drillChildren.map((c) => (
                <CategoryTile
                  key={c.id}
                  icon={c.icon}
                  name={c.name}
                  selected={value === c.id}
                  onClick={() => pick(c.id)}
                />
              ))}
              {drillChildren.length === 0 && (
                <p className="col-span-full py-4 text-center text-xs text-fg-muted">
                  Nhóm này chưa có danh mục con
                </p>
              )}
            </div>
          </div>
        ) : (
          /* Lưới danh mục chính — GIỮ 4 CỘT (không đổi sang 3): 4 cột = 4 hàng = 250px,
             3 cột = 5 hàng = 314px. Gói thiết kế đòi 3 cột vì "13 tile là 5 hàng" nhưng
             đó CHÍNH LÀ ca 3 cột gây ra — đổi sẽ làm cái nó viện ra nặng thêm 64px. */
          <div className="grid auto-rows-min grid-cols-4 gap-1.5 lg:grid-cols-5">
            {topCategories.map((c) => {
              const childCount = counts[c.id] ?? 0
              return (
                <CategoryTile
                  key={c.id}
                  icon={c.icon}
                  name={c.name}
                  // Cha có con: chọn selection đang nằm bên trong; cha không con: chọn trực tiếp
                  selected={childCount > 0 ? selected?.parent_id === c.id : value === c.id}
                  childCount={childCount}
                  onClick={() => (childCount > 0 ? setDrillId(c.id) : pick(c.id))}
                />
              )
            })}
          </div>
        ))}
    </div>
  )
}

function CategoryTile({
  icon,
  name,
  selected,
  childCount = 0,
  onClick,
}: {
  icon: string
  name: string
  selected: boolean
  childCount?: number
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      // Tile 1a (§4.6): nền --surface, viền 2px trong suốt, CHỌN = nền/viền accent.
      // Viền 2px có ở cả hai trạng thái nên bấm chọn không làm cả lưới xê 2px.
      // Bỏ `shadow-sm` ở ô chưa chọn: nó là thứ duy nhất còn phân biệt hai trạng thái
      // bằng độ nổi, mà 1a phân cấp bằng nền + viền.
      className={`relative flex flex-col items-center gap-0.5 rounded-md border-2 px-1 py-2 text-xs transition active:scale-95 ${
        selected
          ? 'border-accent bg-state-good-bg text-fg-primary'
          : 'border-transparent bg-surface text-fg-secondary'
      }`}
    >
      <span className="text-xl leading-none">{icon}</span>
      <span className="w-full truncate text-center">{name}</span>
      {/* Số danh mục con thay chevron 10px: tile CÓ con và tile KHÔNG con (Phí chuyển tiền ·
          Phí thủ tục · Khác) trước đây trông y hệt mà hành vi khác — bấm cái này thì mở
          thêm một tầng, bấm cái kia thì chọn xong. */}
      {childCount > 0 && (
        <span className="absolute right-1 top-1 text-3xs font-medium text-fg-muted">
          {childCount}
        </span>
      )}
    </button>
  )
}
