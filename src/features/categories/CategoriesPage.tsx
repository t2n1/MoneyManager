// Danh mục — cây cha/con, kéo–thả sắp thứ tự, thêm/sửa/lưu trữ, VÀ phân loại chi tiêu.
//
// ---- Vì sao gộp hai màn (06/09/2026) ------------------------------------------------
//
// Trước bản này, /settings/categories và /settings/categories/classify sửa CÙNG một bảng
// `categories` bằng hai giao diện, và ba trục `kind`/`need_level`/`cost_type` gán được ở
// cả hai chỗ. Trang này còn phải in một dòng cảnh báo dẫn sang trang kia — dấu hiệu hai
// màn đáng lẽ là một.
//
// Cái KHÔNG được vứt khi gộp: trang kia là một DÂY CHUYỀN (lọc "chưa xong", "Lưu · mục kế
// tiếp →", "Áp cho cả nhóm"). Nên trang này có hai thân:
//   · CÂY (mặc định) — mỗi dòng hai vùng bấm: tên mở form danh tính, nhãn mở bảng chọn.
//   · DÂY CHUYỀN (`?todo=1` hoặc `?ids=`) — cây duỗi phẳng, kéo–thả tắt, mạch bấm liền.
//
// Hai thân là hai nhánh JSX tách hẳn, không phải một cây có lọc: kéo–thả đo bằng trung
// điểm của các hàng ĐANG HIỂN THỊ, nên thả trong một danh sách đã lọc là ghi sai thứ tự
// vào DB. Form "Sửa danh mục" từ đây chỉ còn DANH TÍNH; ý nghĩa nằm trọn ở ClassifySheet.
//
// ---- Vì sao vẽ lại (redesign 2026-08-30) -------------------------------------------
//
// Đo bản trước ở 1440×900 trên sổ thật: 14 cha + 48 con, trang cao 3.380px = BỐN màn, và
// tên danh mục kết thúc ở x≈471–544 trong khi nút cuối hàng đứng ở x=1345 — **801–874px
// trống** giữa cái tên và nút của nó, lặp 48 lần.
//
// Hai cách chữa, và trang này cần cả hai:
//   · CON THU GỌN sẵn. Mở một cha ra mới thấy con của nó. 14 hàng cha ≈ dưới một màn,
//     thay cho bốn màn. Kéo con sang cha đang đóng thì cha đó TỰ MỞ (xem
//     onChildPointerMove) — không thì hàng đang kéo biến mất khỏi màn.
//   · BÓ BỀ NGANG. Đây là màn một cột có kéo–thả dọc: chia cột thì phép đo trung điểm
//     của DragList sai ngay, mà để nó nở hết 1090px thì sinh ra đúng khoảng trống 800px
//     ở trên. §Phần I cho phép bó với màn một-cột (Nhập đã bó `max-w-2xl lg:max-w-5xl`).
//     Chỗ trống còn lại bên phải là ĐÁNH ĐỔI CÓ CHỦ Ý, không phải bỏ quên.
import {
  useMemo,
  useRef,
  useLayoutEffect,
  useState,
  type ReactNode,
} from 'react'
import { contentTop, useDragPointer } from '../../hooks/useDragPointer'
import { Guide } from '../../components/Guide'
import { Archive, ChevronDown, ChevronRight, ChevronUp, GripVertical, Plus } from 'lucide-react'
import type { NewCategory } from '../../data'
import { DragList, type DragHandleProps } from '../../components/DragList'
import {
  ActionButton,
  Card,
  EmptyState,
  FilterChip,
  IconButton,
  Num,
  PageHeader,
  SectionTitle,
  SegmentedControl,
  Select,
  StatusChip,
  actionButtonClass,
  iconButtonClass,
} from '../../components/ui'
import { useEscClose } from '../../hooks/useEscClose'
import {
  useCategories,
  useCreateCategory,
  useDeleteCategory,
  useReorderCategories,
  useUpdateCategory,
} from '../../hooks/queries'
import { confirmDialog, showToast } from '../../lib/dialog'
import type { CategoryRow, CategoryType } from '../../types/database.types'
import { categoryCounts } from './categoryCounts'
import { isClassified, nextTodo, summaryLabel } from './classifyFlow'
import { ClassifySheet, type ClassifyTarget, type ClassifyValue } from './ClassifySheet'
import { classifiableExpenses, classifyGroups, hasActiveChildren } from './leaf'
import { Link, useSearchParams } from 'react-router-dom'

// Bảng emoji gợi ý khi thêm/sửa danh mục
const EMOJI_CHOICES = [
  '🍜', '🍔', '☕', '🛒', '🚌', '🚕', '⛽', '🛍️', '👕', '🧾', '💡', '🏠',
  '💊', '🏥', '🎮', '🎬', '📚', '✈️', '🎁', '💰', '🎉', '🧧', '📈', '💵',
  '🐶', '🎵', '💇', '🏋️', '📱', '💳', '🍰', '🍺', '⚽', '🌸', '🧸', '📦',
]

const TAB_ITEMS = [
  { value: 'expense' as const, label: 'Chi' },
  { value: 'income' as const, label: 'Thu' },
]

/** Trạng thái mở form: thêm mới (có thể kèm cha) hoặc sửa một danh mục. */
type FormState =
  | { category: null; parent: CategoryRow | null }
  | { category: CategoryRow; parent: CategoryRow | null }

export function CategoriesPage() {
  const { data: categories = [] } = useCategories()
  const reorder = useReorderCategories()
  const update = useUpdateCategory()

  const [params, setParams] = useSearchParams()
  const [tab, setTab] = useState<CategoryType>('expense')
  const [form, setForm] = useState<FormState | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  /** Lựa chọn đã bấm, chờ máy chủ xác nhận — để nhãn đổi ngay chứ không chờ một vòng mạng. */
  const [pending, setPending] = useState<Record<string, ClassifyValue>>({})
  /** Bảng chọn đang mở cho ai. Giữ theo ID chứ không giữ cả hàng: hàng sẽ cũ sau mỗi lần lưu. */
  const [sheetFor, setSheetFor] = useState<
    { mode: 'one'; id: string } | { mode: 'group'; parentId: string } | null
  >(null)
  // Cha ĐANG MỞ. Rỗng = thu gọn hết, và đó là mặc định: xem chú thích đầu file.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())

  const toggleParent = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const ofType = categories
    .filter((c) => c.type === tab)
    .sort((a, b) => a.sort_order - b.sort_order)
  const activeCats = ofType.filter((c) => !c.is_archived)
  const archivedCats = ofType.filter((c) => c.is_archived)

  // "14 chi · 3 thu" của 22e — đếm trên MỌI loại, không riêng tab đang xem: người dùng
  // cần biết cả hai để quyết định có sang tab kia hay không.
  const counts = categoryCounts(categories.filter((c) => !c.is_archived))

  // ---- Phân loại: trạng thái, bộ lọc, lưu ------------------------------------------
  //
  // `?todo=1` và `?ids=` là trạng thái của ĐỊA CHỈ, không phải của component: nút "Phân
  // loại N danh mục này" ở mặt lập kế hoạch gửi sang đúng N id, và trang cũ
  // /settings/categories/classify nay chuyển hướng về đây kèm nguyên query string. Đọc từ
  // URL nên bấm Quay lại / mở lại link đều ra đúng cảnh cũ.
  const onlyTodo = params.get('todo') === '1'
  const pickedIds = useMemo(() => {
    const raw = params.get('ids')
    return raw ? new Set(raw.split(',').filter(Boolean)) : null
  }, [params])
  /** Bật bộ lọc = cây duỗi phẳng thành dây chuyền; kéo–thả tắt (thả trong danh sách đã
      lọc là thả sai vị trí). */
  const classifyMode = onlyTodo || pickedIds !== null

  /** Giá trị đang hiển thị: ưu tiên lựa chọn đang chờ máy chủ xác nhận. */
  const effective = (c: CategoryRow): ClassifyValue =>
    pending[c.id] ?? { kind: c.kind, need_level: c.need_level, cost_type: c.cost_type }

  const classifiable = classifiableExpenses(categories)
  const classifiableIds = new Set(classifiable.map((c) => c.id))
  /**
   * Chưa xong = chưa đủ hai trục. Vừa chọn 'Chuyển tài sản' thì KHÔNG tính là chưa xong
   * dù hai trục rỗng: `classifiableExpenses` sẽ loại nó ngay vòng dữ liệu kế tiếp, và cho
   * tới lúc đó nó không nên nằm trong số việc phải làm.
   */
  const isTodo = (c: CategoryRow) => {
    const e = effective(c)
    return e.kind !== 'transfer' && !isClassified(e)
  }
  const todoCount = classifiable.filter(isTodo).length
  const doneCount = classifiable.length - todoCount

  /** Dòng của chế độ dây chuyền — lọc trước rồi mới gom, nên nhóm rỗng tự biến mất. */
  const classifyRows = classifiable.filter(
    (c) => (!pickedIds || pickedIds.has(c.id)) && (!onlyTodo || isTodo(c)),
  )

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value === null) next.delete(key)
    else next.set(key, value)
    setParams(next, { replace: true })
  }

  /**
   * Nhãn phân loại — vừa là TRẠNG THÁI đọc bằng mắt, vừa là cửa vào bảng chọn.
   *
   * Chỉ vẽ cho danh mục `classifiableExpenses` trả về: danh mục Thu, danh mục đã lưu trữ,
   * danh mục dòng chảy và `kind = 'transfer'` không có nhãn — hai cái sau vì báo cáo
   * không bao giờ đọc hai trục của chúng, xem chú thích trong ./leaf.
   *
   * Nút bọc ngoài cao 44px (chip thì bé) — vùng chạm, không phải trang trí.
   */
  function ClassifyChip({ cat }: { cat: CategoryRow }) {
    if (!classifiableIds.has(cat.id)) return null
    const eff = effective(cat)
    const done = isClassified(eff)
    return (
      <button
        type="button"
        onClick={() => openFor(cat)}
        aria-label={`Phân loại ${cat.name} — hiện là ${summaryLabel(eff)}`}
        className="inline-flex min-h-11 shrink-0 items-center rounded-full"
      >
        <StatusChip tone={done ? 'good' : 'warn'}>{summaryLabel(eff)}</StatusChip>
      </button>
    )
  }

  /**
   * Một dòng của chế độ DÂY CHUYỀN — cả dòng là một nút mở bảng chọn (ở đây không có việc
   * gì khác để làm, nên chia hai vùng bấm như trên cây là chia vô ích).
   */
  function classifyRow(c: CategoryRow, isParent: boolean) {
    const eff = effective(c)
    return (
      <button
        key={c.id}
        type="button"
        onClick={() => openFor(c)}
        className="flex min-h-11 w-full items-center gap-2 border-b border-border-subtle px-3 py-1.5 text-left transition last:border-b-0 hover:bg-surface-sunken"
      >
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          <span aria-hidden>{c.icon}</span>
          <span className="min-w-0 truncate text-sm text-fg-primary">{c.name}</span>
          {/* Chỉ "· cả nhóm", KHÔNG kèm số mục con: header nhóm ngay phía trên đã in
              "N mục con", và ở cỡ chữ 1,25×/375px cái đuôi dài đó (shrink-0) ép tên danh
              mục xuống 0 — dòng cha hiện ra chỉ còn mỗi icon. */}
          {isParent && <span className="shrink-0 text-2xs text-fg-muted">· cả nhóm</span>}
        </span>
        <StatusChip tone={isClassified(eff) ? 'good' : 'warn'} className="shrink-0">
          {summaryLabel(eff)}
        </StatusChip>
      </button>
    )
  }

  const closeSheet = () => setSheetFor(null)
  function openFor(c: CategoryRow) {
    setSheetFor({ mode: 'one', id: c.id })
  }
  function openGroup(parentId: string) {
    setSheetFor({ mode: 'group', parentId })
  }

  /** Mọi danh mục phân loại được của một nhóm — cha + con, KHÔNG theo bộ lọc đang bật. */
  const membersOf = (parentId: string) =>
    classifiable.filter((c) => c.id === parentId || c.parent_id === parentId)

  /**
   * Đếm con để in "N mục con" ở header nhóm của chế độ dây chuyền. Đếm trên `categories`
   * chứ không qua `childrenOf`: hàm kia lọc theo tab Chi/Thu đang chọn, mà chế độ dây
   * chuyền ẩn ô gạt đó đi — vào đây khi tab còn đang ở Thu là mọi nhóm hiện "0 mục con".
   */
  const childCount = (parentId: string) =>
    categories.filter((c) => c.parent_id === parentId && !c.is_archived).length

  /** Lưu CẢ BA trục một lượt: hiện ngay (optimistic), báo lỗi nếu hỏng. */
  function saveOne(id: string, v: ClassifyValue) {
    setPending((p) => ({ ...p, [id]: v }))
    update.mutate(
      { id, patch: v },
      {
        onError: (e) =>
          showToast(e instanceof Error ? e.message : 'Không lưu được phân loại', 'error'),
        onSettled: () =>
          setPending((p) => {
            // Đã có thao tác mới hơn trên danh mục này → để lần đó tự dọn.
            if (p[id] !== v) return p
            const next = { ...p }
            delete next[id]
            return next
          }),
      },
    )
  }

  /**
   * Mục CHƯA XONG kế tiếp sau `fromId` trong danh sách ĐANG THẤY — mạch bấm liền chỉ có ở
   * chế độ dây chuyền. Ở cây thì người dùng đã bấm đúng một dòng họ muốn, tự nhảy sang
   * dòng khác là mở ra một danh mục họ không hỏi tới.
   *
   * Bỏ dòng vừa chọn 'Chuyển tài sản' ra khỏi vòng: hai trục của nó rỗng nên `isClassified`
   * đọc là "chưa xong", mà nó thì không còn gì để làm.
   */
  function nextAfter(fromId: string): CategoryRow | null {
    if (!classifyMode) return null
    const rows = classifyRows.filter((r) => effective(r).kind !== 'transfer')
    const nxt = nextTodo(
      rows.map((r) => ({ id: r.id, ...effective(r) })),
      fromId,
    )
    return nxt ? (rows.find((r) => r.id === nxt.id) ?? null) : null
  }

  /** Lưu xong thì lật sang mục chưa xong kế tiếp; hết thì đóng bảng. */
  function saveAndAdvance(id: string, v: ClassifyValue) {
    saveOne(id, v)
    const nxt = nextAfter(id)
    if (nxt) openFor(nxt)
    else closeSheet()
  }

  /**
   * Gán một tổ hợp cho CẢ nhóm (cha + mọi con), kể cả mục đang bị bộ lọc giấu đi.
   *
   * Cố ý không giới hạn theo bộ lọc: nhãn nút nói "cả nhóm", mà "cả nhóm trừ những cái
   * đang bị ẩn" là một lời hứa khác. Bù lại, câu xác nhận đếm đúng số mục ĐÃ phân loại
   * sắp bị ghi đè — đó là thứ duy nhất không hoàn tác được bằng mắt.
   */
  async function applyToGroup(parent: CategoryRow, v: ClassifyValue, label: string) {
    const members = membersOf(parent.id)
    const overwrite = members.filter((c) => !isTodo(c)).length
    const ok = await confirmDialog({
      title: `Gán “${label}” cho nhóm ${parent.name}?`,
      message:
        `${members.length} danh mục (cả nhóm cha).` +
        (overwrite > 0 ? ` ${overwrite} mục đã có phân loại sẽ bị ghi đè.` : ''),
      confirmLabel: 'Gán',
    })
    if (!ok) return
    closeSheet()
    setPending((p) => {
      const next = { ...p }
      for (const c of members) next[c.id] = v
      return next
    })
    try {
      await Promise.all(members.map((c) => update.mutateAsync({ id: c.id, patch: v })))
      showToast(`Đã gán “${label}” cho ${members.length} danh mục`)
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Không lưu được phân loại', 'error')
    } finally {
      // Dọn TOÀN BỘ trạng thái chờ của nhóm một lượt: từng mục tự dọn như `saveOne` thì
      // phải so lại từng trục, mà ở đây cả nhóm đi cùng một giá trị.
      setPending((p) => {
        const next = { ...p }
        for (const c of members) delete next[c.id]
        return next
      })
    }
  }

  const parents = activeCats.filter((c) => !c.parent_id)
  const parentIds = new Set(parents.map((p) => p.id))
  const childrenOf = (id: string) => activeCats.filter((c) => c.parent_id === id)
  // Con đang hoạt động nhưng cha không còn hiển thị (bảo hiểm cho dữ liệu cũ)
  const orphans = activeCats.filter((c) => c.parent_id && !parentIds.has(c.parent_id))

  const parentOptions = activeCats.filter((c) => !c.parent_id)
  const parentById = (id: string | null | undefined) =>
    id ? ofType.find((c) => c.id === id) ?? null : null

  /** Gán lại thứ tự cho toàn bộ danh mục của loại đang xem theo cây đã sắp. */
  function commitOrder(orderedParents: CategoryRow[], childrenFor: (id: string) => CategoryRow[]) {
    const ids: string[] = []
    for (const p of orderedParents) {
      ids.push(p.id)
      for (const ch of childrenFor(p.id)) ids.push(ch.id)
    }
    reorder.mutate([...ids, ...orphans.map((o) => o.id), ...archivedCats.map((a) => a.id)])
  }

  // Tra nhanh id → CategoryRow (chỉ danh mục đang hoạt động) để dựng lại cây khi kéo–thả.
  const catById = new Map(activeCats.map((c) => [c.id, c]))
  const rowsFromIds = (ids: string[]) =>
    ids.map((id) => catById.get(id)).filter((c): c is CategoryRow => !!c)

  // Sắp lại thứ tự các danh mục CHA (kéo–thả), giữ nguyên con của mỗi cha.
  function reorderParents(newParentIds: string[]) {
    const ordered = rowsFromIds(newParentIds)
    if (ordered.length === parents.length) commitOrder(ordered, childrenOf)
  }

  // --- Kéo–thả danh mục con: trong cùng cha & xuyên cha ---
  // Bắt pointer trên phần tử gốc (ổn định) để hàng đang kéo "nhảy" giữa các cha mà
  // không mất capture. `childDropAt` là vị trí xem trước; commit khi thả.
  const rootRef = useRef<HTMLDivElement>(null)
  const childRowRefs = useRef(new Map<string, HTMLElement>())
  const zoneRefs = useRef(new Map<string, HTMLElement>())
  // Vị trí NGHỈ của từng dòng con, quy về hệ nội dung của `rootRef` (xem `contentTop`).
  // Mốc chèn đọc từ đây chứ không đo lại lúc kéo: đo giữa lúc các dòng đang trôi thì
  // trung điểm nhấp nhô theo hiệu ứng và danh sách rung qua rung lại giữa hai vị trí.
  const childRest = useRef(new Map<string, { top: number; mid: number }>())
  // Điểm cầm: con trỏ và vị trí nghỉ của dòng, đều lúc vừa nhấc lên.
  const grabChild = useRef<{ y: number; top: number } | null>(null)
  const atY = useRef(0)
  // Một lượt bố cục nữa SAU khi thả, để dòng vừa cầm trôi về chỗ thay vì rơi phịch.
  const settle = useRef(false)
  const dragGen = useRef(0)
  const [dragChild, setDragChild] = useState<string | null>(null)
  const [childDropAt, setChildDropAt] = useState<{ parent: string; index: number } | null>(null)

  function setChildRow(id: string, el: HTMLElement | null) {
    if (el) childRowRefs.current.set(id, el)
    else childRowRefs.current.delete(id)
  }
  function setZone(id: string, el: HTMLElement | null) {
    if (el) zoneRefs.current.set(id, el)
    else zoneRefs.current.delete(id)
  }

  const parentOfChild = (id: string) => activeCats.find((c) => c.id === id)?.parent_id ?? null

  // Thứ tự id con hiển thị của một cha, đã áp xem trước khi đang kéo.
  function displayChildIds(parentId: string): string[] {
    const base = childrenOf(parentId).map((c) => c.id)
    if (dragChild == null) return base
    const without = base.filter((id) => id !== dragChild)
    if (childDropAt && childDropAt.parent === parentId) {
      const i = Math.min(childDropAt.index, without.length)
      return [...without.slice(0, i), dragChild, ...without.slice(i)]
    }
    return without
  }

  /** Dán lại thế bám ngón tay cho dòng đang cầm. Ghi thẳng DOM, không qua React. */
  function followChild() {
    const root = rootRef.current
    const g = grabChild.current
    if (!root || !g || dragChild == null) return
    const el = childRowRefs.current.get(dragChild)
    const slot = childRest.current.get(dragChild)
    if (!el || !slot) return
    // Trừ đi phần ô đã tự dịch: dòng đổi chỗ thì ô của nó cũng đi, không trừ ra thì
    // mỗi lần đổi chỗ dòng lại nhảy thêm một khoảng bằng chiều cao một dòng.
    el.style.transition = 'none'
    el.style.transform = `translateY(${atY.current - contentTop(root) - g.y - (slot.top - g.top)}px)`
  }

  /** Đo lại vị trí nghỉ của mọi dòng con. Gọi trước khi đo là phải gỡ hết transform. */
  function measureChildren(root: HTMLElement) {
    const base = contentTop(root)
    const rest = new Map<string, { top: number; mid: number }>()
    for (const [id, el] of childRowRefs.current) {
      const r = el.getBoundingClientRect()
      const top = r.top - base
      rest.set(id, { top, mid: top + r.height / 2 })
    }
    childRest.current = rest
    return base
  }

  // Chỉ chạy khi đang kéo (và đúng một lượt nữa sau khi thả): trang này render lại
  // theo nhiều thứ khác, đo lại mọi dòng ở mỗi lần render là bắt trình duyệt tính bố
  // cục hai lượt không vì gì.
  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return
    if (dragChild == null && !settle.current) return
    settle.current = false
    const gen = ++dragGen.current

    // Chỗ mắt ĐANG THẤY — tính cả hiệu ứng còn chạy dở. FLIP từ đây chứ không từ vị
    // trí nghỉ cũ: dòng bị đổi chỗ lần nữa giữa chừng sẽ đi tiếp từ chỗ nó đang ở.
    const seen = new Map<string, number>()
    for (const [id, el] of childRowRefs.current) seen.set(id, el.getBoundingClientRect().top)
    for (const [, el] of childRowRefs.current) {
      el.style.transition = 'none'
      el.style.transform = ''
    }
    const base = measureChildren(root)

    for (const [id, el] of childRowRefs.current) {
      if (id === dragChild) continue
      const from = seen.get(id)
      const to = childRest.current.get(id)
      if (from === undefined || !to || Math.abs(from - (to.top + base)) < 0.5) continue
      el.style.transform = `translateY(${from - (to.top + base)}px)`
      requestAnimationFrame(() => {
        if (dragGen.current !== gen) return
        el.style.transition = 'transform var(--motion-drag) var(--ease-out)'
        el.style.transform = ''
      })
    }
    // Vòng lặp trên vừa xoá thế bám ngón tay của dòng đang cầm; dán lại ngay trong
    // cùng một lượt bố cục nên mắt không kịp thấy nó nhấp nháy về ô.
    if (dragChild != null) followChild()
  })

  const childDrag = useDragPointer<string>({
    withinRef: rootRef,
    onLift(id, _x, y) {
      const root = rootRef.current
      const pid = parentOfChild(id)
      if (!root || !pid) return
      // Đo lại tại chỗ: có thể vừa thả lượt trước và hiệu ứng trôi về còn đang chạy.
      for (const [, el] of childRowRefs.current) {
        el.style.transition = 'none'
        el.style.transform = ''
      }
      const base = measureChildren(root)
      atY.current = y
      grabChild.current = { y: y - base, top: childRest.current.get(id)?.top ?? 0 }
      const idx = childrenOf(pid).findIndex((c) => c.id === id)
      setDragChild(id)
      setChildDropAt({ parent: pid, index: Math.max(0, idx) })
    },
    onMove(x, y) {
      const root = rootRef.current
      if (!root || dragChild == null) return
      atY.current = y
      followChild()
      let target: string | null = null
      for (const [pid, el] of zoneRefs.current) {
        // Vùng của cha không bị transform (chỉ các DÒNG CON bị), đo trực tiếp vẫn đúng.
        const r = el.getBoundingClientRect()
        if (y >= r.top && y <= r.bottom && x >= r.left && x <= r.right) {
          target = pid
          break
        }
      }
      if (target == null) return // ngoài mọi cha → giữ xem trước cũ
      // Kéo tới một cha đang THU GỌN thì mở nó ra: không mở thì hàng đang kéo biến mất
      // khỏi màn (đã rời cha cũ, mà cha mới thì đang đóng) và người kéo mất dấu.
      if (!expanded.has(target)) {
        const cha = target
        setExpanded((prev) => (prev.has(cha) ? prev : new Set(prev).add(cha)))
      }
      const rowIds = displayChildIds(target).filter((id) => id !== dragChild)
      const py = y - contentTop(root)
      let index = rowIds.length
      for (let i = 0; i < rowIds.length; i++) {
        const m = childRest.current.get(rowIds[i])
        if (!m) continue
        if (py < m.mid) {
          index = i
          break
        }
      }
      setChildDropAt((prev) =>
        prev && prev.parent === target && prev.index === index ? prev : { parent: target, index },
      )
    },
    onDrop(lifted) {
      grabChild.current = null
      if (!lifted || dragChild == null) return
      const id = dragChild
      const at = childDropAt
      settle.current = true
      setDragChild(null)
      setChildDropAt(null)
      if (!at) return
      const src = parentOfChild(id)
      if (!src) return

      if (at.parent === src) {
        // Sắp lại trong cùng một cha.
        const cur = childrenOf(src).map((c) => c.id)
        const without = cur.filter((x) => x !== id)
        const j = Math.min(at.index, without.length)
        const next = [...without.slice(0, j), id, ...without.slice(j)]
        if (next.some((x, k) => x !== cur[k])) {
          commitOrder(parents, (pid) => (pid === src ? rowsFromIds(next) : childrenOf(pid)))
        }
      } else {
        // Chuyển sang cha khác: đổi parent_id và chèn vào đúng vị trí ở cha đích.
        const dstIds = childrenOf(at.parent)
          .map((c) => c.id)
          .filter((x) => x !== id)
        const j = Math.min(at.index, dstIds.length)
        const nextDst = [...dstIds.slice(0, j), id, ...dstIds.slice(j)]
        update.mutate({ id, patch: { parent_id: at.parent } })
        commitOrder(parents, (pid) => {
          if (pid === src) return childrenOf(src).filter((c) => c.id !== id)
          if (pid === at.parent) return rowsFromIds(nextDst)
          return childrenOf(pid)
        })
      }
    },
  })

  /** Lưu trữ: cha kéo theo tất cả con đang hoạt động (ẩn cả nhóm). */
  function archive(c: CategoryRow) {
    const targets = c.parent_id ? [c] : [c, ...childrenOf(c.id)]
    Promise.all(targets.map((t) => update.mutateAsync({ id: t.id, patch: { is_archived: true } })))
  }

  /** Khôi phục: cha kéo theo con; con kéo theo cha (nếu cha đang bị ẩn). */
  function restore(c: CategoryRow) {
    const targets: CategoryRow[] = [c]
    if (!c.parent_id) {
      targets.push(...archivedCats.filter((x) => x.parent_id === c.id))
    } else {
      const parent = parentById(c.parent_id)
      if (parent?.is_archived) targets.push(parent)
    }
    Promise.all(targets.map((t) => update.mutateAsync({ id: t.id, patch: { is_archived: false } })))
  }

  // ---- Dữ liệu cho bảng chọn đang mở -----------------------------------------------
  //
  // Tra lại hàng từ `classifiable` mỗi lần vẽ chứ không giữ hàng trong state: sau mỗi lần
  // lưu thì hàng cũ đã lạc hậu. Hàng truyền vào bảng chọn đã TRỘN pending — bấm "mục kế
  // tiếp" tới một dòng vừa sửa dở trong phiên này thì chip phải mồi theo cái vừa chọn,
  // không phải theo giá trị máy chủ còn đang trên đường về.
  const sheetOne =
    sheetFor?.mode === 'one' ? (classifiable.find((c) => c.id === sheetFor.id) ?? null) : null
  const sheetGroupParent =
    sheetFor?.mode === 'group'
      ? (classifiable.find((c) => c.id === sheetFor.parentId) ?? null)
      : null
  const sheetTarget: ClassifyTarget | null = sheetOne
    ? {
        mode: 'one',
        category: { ...sheetOne, ...effective(sheetOne) },
        parent: sheetOne.parent_id
          ? (categories.find((c) => c.id === sheetOne.parent_id) ?? null)
          : null,
      }
    : sheetGroupParent
      ? {
          mode: 'group',
          parent: sheetGroupParent,
          memberCount: membersOf(sheetGroupParent.id).length,
        }
      : null

  // Vẽ một danh mục cha (thẻ). `handle` = tay nắm kéo để sắp thứ tự cha. Cả thẻ là
  // vùng thả cho danh mục con (kéo con sang cha khác).
  function renderParent(p: CategoryRow, handle: DragHandleProps, dragging: boolean): ReactNode {
    const kids = childrenOf(p.id)
    const childIds = displayChildIds(p.id)
    const isDropTarget = dragChild != null && childDropAt?.parent === p.id
    const isOpen = expanded.has(p.id)
    return (
      <div
        ref={(el) => setZone(p.id, el)}
        className={`overflow-hidden rounded-lg border border-border-panel bg-surface ${
          dragging ? 'bg-surface-sunken' : ''
        } ${isDropTarget ? 'ring-1 ring-inset ring-accent' : ''}`}
      >
        {/* Danh mục cha. Đệm dọc mỏng thôi: các nút bên trong đã cao 44px (chuẩn
            vùng chạm) tự quyết chiều cao hàng — đệm dày nữa chỉ thêm khí chết,
            danh sách ~60 hàng dài ra cả nghìn px. */}
        {/* `flex-wrap`: ở 375px cỡ chữ 1,25×, năm phần tử cố định của hàng (tay nắm,
            mũi mở, biểu tượng, Thêm con, Lưu trữ) ăn 294 trên 343px — cụm tên còn 49px,
            tức tên bị cắt còn ba chữ cái và dòng "8 danh mục con" xếp thành ba tầng. Cho
            hàng xuống dòng thì hai nút hành động rơi xuống tầng dưới và cái tên được đọc.
            Ở cỡ chữ thường mọi thứ vẫn vừa một dòng nên không đổi gì. */}
        <div className="flex flex-wrap items-center gap-2 px-3 py-1">
          <button
            type="button"
            {...handle}
            className="inline-flex min-h-11 min-w-9 shrink-0 cursor-grab touch-none items-center justify-center text-fg-muted active:cursor-grabbing"
            aria-label={`Kéo để sắp thứ tự ${p.name}`}
          >
            <GripVertical className="h-5 w-5" />
          </button>
          {/* Nút mở/đóng RIÊNG, không gộp vào nút tên: tên mở form sửa, và một nút làm
              hai việc tuỳ chỗ bấm là chỗ bấm nhầm. Cha không con thì không có gì để mở. */}
          {kids.length > 0 ? (
            <button
              type="button"
              onClick={() => toggleParent(p.id)}
              aria-expanded={isOpen}
              aria-label={`${isOpen ? 'Thu gọn' : 'Mở'} danh mục con của ${p.name}`}
              className="inline-flex min-h-11 w-5 shrink-0 items-center justify-center text-fg-muted"
            >
              {isOpen ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>
          ) : (
            <span className="w-5" />
          )}
          <span className="shrink-0 text-xl" aria-hidden>
            {p.icon}
          </span>
          {/* Nhãn phân loại đi LIỀN cái tên, không nằm trong cụm nút mép phải: nó là
              TRẠNG THÁI của danh mục, mà bó trang còn 896px thì cụm phải vẫn cách tên
              ~630px — đủ xa để mắt phải bắc cầu mỗi dòng. Nút thì cứ ở mép phải, chúng là
              hành động và thẳng cột mới dễ nhắm.

              Nhãn là nút RIÊNG cạnh nút tên, không lồng bên trong: bấm tên mở form sửa
              danh tính, bấm nhãn mở bảng chọn — hai việc khác nhau thì hai nút, và nút
              lồng nút thì trình duyệt cũng không cho. Ô bọc `flex-1` giữ khoảng trống ở
              BÊN PHẢI nhãn, nên tên và nhãn vẫn dính nhau.

              `flex-wrap` + sàn `min-w-24` trên nút tên, KHÔNG phải `flex-1` trơn: `flex-1` là
              basis 0, nên tên bị bóp về 0 TRƯỚC khi nhãn `shrink-0` chịu xuống dòng — đo ở
              375px cỡ chữ 1,25× thì hàng hiện ra đúng MỘT chữ cái rồi nhãn đè lên hai nút
              mép phải. 5rem là sàn để hàng thà xuống dòng còn hơn nuốt cái tên. */}
          <div className="flex min-w-24 flex-1 flex-wrap items-center gap-x-1.5">
            <button
              type="button"
              onClick={() => setForm({ category: p, parent: null })}
              className="-my-1 min-w-0 py-1 text-left"
            >
              <span className="block truncate text-sm font-semibold text-fg-primary">
                {p.name}
              </span>
              {kids.length > 0 && (
                <span className="text-2xs text-fg-muted">
                  <Num tone="muted">{kids.length}</Num> danh mục con
                </span>
              )}
            </button>
            <ClassifyChip cat={p} />
          </div>
          <button
            type="button"
            onClick={() => setForm({ category: null, parent: p })}
            className={iconButtonClass('accent')}
            aria-label={`Thêm danh mục con cho ${p.name}`}
          >
            <Plus className="h-5 w-5" />
          </button>
          {/* Icon thay chữ: ~60 dòng mỗi dòng lặp chữ "Lưu trữ" là một bức tường chữ.
              Hành động đảo ngược được (khôi phục ở khối "Đã lưu trữ") nên icon là đủ. */}
          <IconButton
            variant="ghost"
            onClick={() => archive(p)}
            aria-label={`Lưu trữ ${p.name}`}
            title="Lưu trữ"
          >
            <Archive className="h-4 w-4" />
          </IconButton>
        </div>

        {/* Danh mục con (kéo–thả để sắp trong cha hoặc chuyển sang cha khác) */}
        {isOpen && (childIds.length > 0 || dragChild != null) && (
          <div className="ml-6 border-l-2 border-border-subtle">
            {childIds.map((cid) => {
              const ch = catById.get(cid)
              if (!ch) return null
              const isDragging = cid === dragChild
              return (
                <div
                  key={cid}
                  ref={(el) => setChildRow(cid, el)}
                  className={`flex flex-wrap items-center gap-2 py-0.5 pr-3 pl-2 ${
                    isDragging ? 'relative z-10 bg-accent-muted-bg shadow-md will-change-transform' : ''
                  }`}
                >
                  <button
                    type="button"
                    onPointerDown={(e) => childDrag.start(cid, e)}
                    style={{ touchAction: 'none' }}
                    className="inline-flex min-h-11 w-5 shrink-0 cursor-grab touch-none items-center justify-center text-fg-muted active:cursor-grabbing"
                    aria-label={`Kéo để sắp thứ tự hoặc chuyển nhóm ${ch.name}`}
                  >
                    <GripVertical className="h-4 w-4" />
                  </button>
                  <span className="text-lg">{ch.icon}</span>
                  <div className="flex min-w-24 flex-1 flex-wrap items-center gap-x-1.5">
                    <button
                      type="button"
                      onClick={() => setForm({ category: ch, parent: p })}
                      className="flex min-h-11 min-w-0 items-center text-left"
                    >
                      <span className="min-w-0 truncate text-sm text-fg-secondary">{ch.name}</span>
                    </button>
                    <ClassifyChip cat={ch} />
                  </div>
                  <IconButton
                    variant="ghost"
                    onClick={() => archive(ch)}
                    aria-label={`Lưu trữ ${ch.name}`}
                    title="Lưu trữ"
                  >
                    <Archive className="h-4 w-4" />
                  </IconButton>
                </div>
              )
            })}
            {childIds.length === 0 && dragChild != null && (
              <p className="px-3 py-3 text-center text-sm text-fg-muted">
                Thả vào đây để chuyển sang nhóm này
              </p>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      ref={rootRef}
      className="max-w-4xl p-3 lg:p-6"
      {...childDrag.surface}
    >
      <PageHeader
        back="/settings"
        title={
          <>
            Danh mục{' '}
            {/* Đếm ở tiêu đề (22e). Cả hai loại, không riêng tab đang xem: nó nói luôn
                rằng tab kia có gì, nên không phải bấm sang mới biết. */}
            <span className="text-sm font-normal tabular-nums text-fg-muted">
              {counts.expense} chi · {counts.income} thu
            </span>
          </>
        }
      >
        <button
          type="button"
          onClick={() => setForm({ category: null, parent: null })}
          className={actionButtonClass('primary')}
        >
          <Plus className="h-4 w-4" /> Thêm
        </button>
      </PageHeader>

      {/* Chi / Thu — <SegmentedControl> chứ hai nút viết tay: đây đúng câu hỏi "đổi CÁCH
          XEM cùng một dữ liệu" mà họ control đó sinh ra để trả lời.

          Ở chế độ dây chuyền thì ẩn cả ô gạt lẫn "Mở hết": phân loại chỉ có ở phía CHI và
          danh sách đã phẳng, nên hai control đó không còn gì để đổi. */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {!classifyMode && (
          <>
            <SegmentedControl
              items={TAB_ITEMS}
              value={tab}
              onChange={setTab}
              label="Loại danh mục"
              stretch="lg"
              // `basis-40`, không để `flex-1` trơn: trong một hàng `flex-wrap`, basis 0
              // nghĩa là ba control nào cũng "vừa" một dòng, rồi phần thừa chia lại làm ô
              // gạt teo dưới cả bề rộng chữ của nó — đo ở 375px cỡ 1,25× thì "Chi Thu" đè
              // lên "Mở hết". Có sàn 10rem thì hàng chịu xuống dòng, đúng việc của
              // flex-wrap.
              className="min-w-0 flex-1 basis-40 lg:flex-none lg:basis-auto"
            />
            {parents.length > 0 && (
              <ActionButton
                className="shrink-0"
                onClick={() =>
                  setExpanded((prev) =>
                    prev.size === parents.length ? new Set() : new Set(parents.map((x) => x.id)),
                  )
                }
              >
                {expanded.size === parents.length ? 'Thu gọn hết' : 'Mở hết'}
              </ActionButton>
            )}
          </>
        )}
        {classifiable.length > 0 && (
          <FilterChip
            className="shrink-0"
            on={onlyTodo}
            onClick={() => setParam('todo', onlyTodo ? null : '1')}
          >
            Chưa phân loại · <Num tone={onlyTodo ? 'neutral' : 'muted'}>{todoCount}</Num>
          </FilterChip>
        )}
        {classifyMode && (
          <span className="shrink-0 text-2xs text-fg-muted">
            <Num tone="muted">{doneCount}</Num>/<Num tone="muted">{classifiable.length}</Num> xong
          </span>
        )}
      </div>

      {/* MỘT dòng báo động thay cho 46 nhãn vàng. Nói ra HẬU QUẢ ("ba chỉ số đang tính
          thiếu") chứ không chỉ nói "chưa gắn": không có mệnh đề đó thì việc này đọc như
          một ô trống trong biểu mẫu, và ô trống thì để đó cũng được.

          Đường đi sửa nay là chính bộ lọc ngay phía trên, không phải một trang khác. */}
      {!classifyMode && todoCount > 0 && (
        <p className="mb-3 rounded-md border border-state-warn-border bg-state-warn-bg px-2.5 py-2 text-sm text-state-warn-fg">
          <Num tone="warn">{todoCount}</Num> danh mục chi chưa phân loại đủ — quỹ dự phòng,
          hai trục Thiết yếu·Linh hoạt và kịch bản “cắt hết chi linh hoạt” đang tính thiếu
          chừng đó.{' '}
          <button
            type="button"
            onClick={() => setParam('todo', '1')}
            className="font-medium underline"
          >
            Phân loại nhanh
          </button>
        </p>
      )}

      {pickedIds && (
        <p className="mb-3 text-sm font-medium text-fg-muted">
          Đang xem <Num tone="muted">{pickedIds.size}</Num> danh mục từ Ngân sách ·{' '}
          <Link to="/settings/categories?todo=1" className="text-fg-accent underline">
            Xem tất cả
          </Link>
        </p>
      )}

      <Guide className="mb-3 rounded-xl bg-surface-sunken p-3 text-sm text-fg-secondary">
        {classifyMode ? (
          <>
            Gán mỗi danh mục Chi vào <b>Tính chất</b> (Thiết yếu, Linh hoạt…) và{' '}
            <b>Loại chi</b> (Cố định/Biến đổi) để xem cơ cấu chi tiêu ở Báo cáo. Bấm vào
            một dòng để chọn. Danh mục <b>cha</b> cũng cần gán: trần nhóm và giao dịch ghi
            thẳng vào cha đều lấy nhãn của chính nó, không suy từ các mục con.
          </>
        ) : (
          <>
            Bấm <b>tên</b> để sửa danh mục, bấm <b>nhãn</b> bên cạnh để phân loại. Nhấn giữ
            biểu tượng <b>⁚⁚</b> rồi kéo–thả để sắp thứ tự danh mục cha, sắp danh mục con
            trong một cha, hoặc kéo danh mục con thả sang cha khác.
          </>
        )}
      </Guide>

      {/* ---- Chế độ DÂY CHUYỀN: cây duỗi phẳng, chỉ còn dòng đang lọc ----------------
          Danh sách riêng chứ không lọc ngay trên cây: kéo–thả đo bằng trung điểm của các
          hàng ĐANG HIỂN THỊ, nên thả trong một danh sách đã lọc là ghi sai thứ tự vào DB.
          Tách hẳn hai thân trang thì không có đường nào lẫn. */}
      {classifyMode ? (
        classifyRows.length === 0 ? (
          <Card padding="none">
            <EmptyState compact>
              {onlyTodo ? 'Đã phân loại hết 🎉' : 'Chưa có danh mục Chi'}
            </EmptyState>
          </Card>
        ) : (
          <Card as="section" elevation="panel" padding="none" className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-border-panel bg-surface-chrome px-3 py-2.5 text-2xs uppercase tracking-label text-fg-muted">
              <span>Danh mục</span>
              <span>Phân loại</span>
            </div>

            {classifyGroups(classifyRows, categories).map((g) => {
              // Cha có dòng riêng thì KHÔNG in thêm tiêu đề xám cùng tên ngay trên nó —
              // chính dòng đó đã mang tên và biểu tượng của nhóm.
              const parentRow = g.parent && g.rows[0]?.id === g.parent.id ? g.rows[0] : null
              const parent = g.parent
              const todoInGroup = parent ? membersOf(parent.id).filter(isTodo).length : 0
              return (
                <div key={parent ? parent.id : `leaf:${g.rows[0].id}`}>
                  {parent && (
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border-panel bg-surface-chrome px-3 py-1.5 lg:py-0.5">
                      {/* basis-24 chứ để flex-1 co tự do: `flex-1` là basis 0, nên tên
                          nhóm bị bóp về 0 TRƯỚC khi nút shrink-0 chịu xuống dòng — ở cỡ
                          chữ 1,25×/375px header hiện ra chỉ còn "🏠 N…". */}
                      <SectionTitle role="micro" className="min-w-0 flex-1 basis-24 truncate">
                        <span aria-hidden>{parent.icon}</span> {parent.name}
                      </SectionTitle>
                      <span className="shrink-0 text-2xs text-fg-muted">
                        <Num tone="muted">{childCount(parent.id)}</Num> mục con
                        {todoInGroup > 0 && (
                          <>
                            {' · '}
                            <Num tone="warn">{todoInGroup}</Num> chưa xong
                          </>
                        )}
                      </span>
                      <ActionButton className="shrink-0" onClick={() => openGroup(parent.id)}>
                        Áp cho cả nhóm
                      </ActionButton>
                    </div>
                  )}
                  {g.rows.map((c) => classifyRow(c, parentRow !== null && c.id === parentRow.id))}
                </div>
              )
            })}
          </Card>
        )
      ) : (
        <>
      {/* Cây danh mục: cha → con */}
      <div className="flex flex-col gap-2">
        {parents.length > 0 && (
          <DragList
            className="flex flex-col gap-2"
            ids={parents.map((p) => p.id)}
            onReorder={reorderParents}
            render={(id, handle, dragging) => {
              const p = parents.find((x) => x.id === id)
              return p ? renderParent(p, handle, dragging) : null
            }}
          />
        )}

        {/* Con mồ côi (dữ liệu cũ) — hiển thị như danh mục thường để không mất */}
        {orphans.map((c) => (
          <div key={c.id} className="flex items-center gap-2 rounded-lg border border-border-panel bg-surface px-3 py-1">
            <span className="text-xl">{c.icon}</span>
            <button
              type="button"
              onClick={() => setForm({ category: c, parent: parentById(c.parent_id) })}
              className="min-h-11 min-w-0 flex-1 truncate text-left text-sm text-fg-secondary"
            >
              {c.name}
            </button>
            <IconButton
              variant="ghost"
              onClick={() => archive(c)}
              aria-label={`Lưu trữ ${c.name}`}
              title="Lưu trữ"
            >
              <Archive className="h-4 w-4" />
            </IconButton>
          </div>
        ))}

        {parents.length === 0 && orphans.length === 0 && (
          <Card padding="none">
            <EmptyState compact>Chưa có danh mục</EmptyState>
          </Card>
        )}
      </div>

      {archivedCats.length > 0 && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            className="mb-2 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-fg-muted"
          >
            {showArchived ? (
              <>
                Ẩn đã lưu trữ <ChevronUp className="h-4 w-4" />
              </>
            ) : (
              <>
                Đã lưu trữ ({archivedCats.length}) <ChevronDown className="h-4 w-4" />
              </>
            )}
          </button>
          {showArchived && (
            <Card padding="none" className="divide-y divide-border-subtle overflow-hidden">
              {archivedCats.map((c) => (
                <div key={c.id} className="flex items-center gap-2 px-3 py-1 opacity-60">
                  {c.parent_id && <span className="text-fg-muted">↳</span>}
                  <span className="text-xl">{c.icon}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-fg-secondary">{c.name}</span>
                  <button
                    type="button"
                    onClick={() => restore(c)}
                    className="inline-flex min-h-11 items-center justify-center rounded-md px-2 py-1 text-sm text-fg-accent hover:bg-accent-muted-bg"
                  >
                    Khôi phục
                  </button>
                </div>
              ))}
            </Card>
          )}
        </div>
      )}

        </>
      )}

      {sheetTarget && (
        <ClassifySheet
          // `key` để mở danh mục khác là draft mới: ClassifySheet mồi state một lần từ
          // props, không có state đó thì bấm "mục kế tiếp" sẽ mang theo lựa chọn cũ.
          key={sheetTarget.mode === 'one' ? sheetTarget.category.id : sheetTarget.parent.id}
          target={sheetTarget}
          onClose={closeSheet}
          saving={update.isPending}
          onSave={(v) => saveAndAdvance(sheetOne!.id, v)}
          onApplyGroup={(v, label) => applyToGroup(sheetGroupParent!, v, label)}
          onClear={
            sheetOne &&
            (effective(sheetOne).need_level !== null || effective(sheetOne).cost_type !== null)
              ? () => {
                  saveOne(sheetOne.id, {
                    kind: effective(sheetOne).kind,
                    need_level: null,
                    cost_type: null,
                  })
                  closeSheet()
                }
              : null
          }
          onSkip={
            sheetOne && nextAfter(sheetOne.id)
              ? () => {
                  const nxt = nextAfter(sheetOne.id)
                  if (nxt) openFor(nxt)
                  else closeSheet()
                }
              : null
          }
        />
      )}

      {form && (
        <CategoryForm
          category={form.category}
          parentContext={form.parent}
          defaultType={tab}
          parentOptions={parentOptions}
          hasChildren={form.category ? hasActiveChildren(form.category.id, categories) : false}
          onCreatedExpense={openFor}
          onClose={() => setForm(null)}
        />
      )}
    </div>
  )
}

interface FormProps {
  category: CategoryRow | null
  /** Cha ngữ cảnh: khi thêm con thì là cha được chọn; khi sửa là cha hiện tại. */
  parentContext: CategoryRow | null
  defaultType: CategoryType
  /** Danh mục cha có thể chọn (danh mục chính đang hoạt động, cả 2 loại). */
  parentOptions: CategoryRow[]
  /** Danh mục đang sửa có con hay không → nếu có thì không thể biến thành con. */
  hasChildren: boolean
  /** Vừa TẠO xong một danh mục Chi — nơi gọi mở bảng chọn phân loại cho nó. */
  onCreatedExpense: (created: CategoryRow) => void
  onClose: () => void
}

function CategoryForm({
  category,
  parentContext,
  defaultType,
  parentOptions,
  hasChildren,
  onCreatedExpense,
  onClose,
}: FormProps) {
  useEscClose(onClose)
  const create = useCreateCategory()
  const update = useUpdateCategory()
  const del = useDeleteCategory()

  async function handleDelete() {
    if (!category) return
    const ok = await confirmDialog({
      title: `Xóa danh mục «${category.name}»?`,
      message: hasChildren
        ? 'Không thể hoàn tác. Xóa cả các danh mục con bên trong (nếu tất cả đều trống).'
        : 'Không thể hoàn tác. Chỉ xóa được khi không còn giao dịch nào dùng nó.',
      confirmLabel: 'Xóa',
      danger: true,
    })
    if (!ok) return
    try {
      await del.mutateAsync(category.id)
      showToast('Đã xóa danh mục', 'success')
      onClose()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Không xóa được', 'error')
    }
  }

  const [name, setName] = useState(category?.name ?? '')
  const [icon, setIcon] = useState(category?.icon ?? '📦')
  const [parentId, setParentId] = useState<string | null>(
    category?.parent_id ?? parentContext?.id ?? null,
  )
  // Loại khi là danh mục chính (con thì thừa kế loại của cha)
  const [topType, setTopType] = useState<CategoryType>(
    category?.type ?? parentContext?.type ?? defaultType,
  )
  const [saving, setSaving] = useState(false)

  const selectedParent = parentId ? parentOptions.find((p) => p.id === parentId) ?? null : null
  // Cha đang có con: khóa loại — đổi Chi/Thu sẽ làm con lệch loại với cha
  const typeLocked = hasChildren && !!category
  const effectiveType: CategoryType = typeLocked
    ? category.type
    : selectedParent
      ? selectedParent.type
      : topType
  const listType = effectiveType
  const availableParents = parentOptions.filter(
    (p) => p.type === listType && p.id !== category?.id,
  )

  const canSave = name.trim().length > 0 && !saving

  async function handleSubmit() {
    if (!canSave) return
    setSaving(true)
    try {
      // Form này chỉ còn DANH TÍNH — ba trục phân loại đi qua bảng chọn (xem
      // ClassifySheet). Nên `input` KHÔNG mang `need_level`/`cost_type`/`kind`: patch
      // thiếu khoá là không đụng tới cột đó, tức sửa tên một danh mục không âm thầm ghi
      // đè nhãn người dùng vừa gán ở bảng chọn.
      const input: NewCategory = {
        name: name.trim(),
        type: effectiveType,
        icon,
        parent_id: hasChildren ? null : parentId,
        // Ngoại lệ: đổi Chi → Thu thì DỌN cả ba. Cột `kind` và hai trục chỉ được đọc ở
        // phía chi, để nguyên là chôn một giá trị chết chờ ngày đổi ngược lại.
        ...(effectiveType === 'income'
          ? { need_level: null, cost_type: null, kind: 'expense' as const }
          : {}),
      }
      if (category) await update.mutateAsync({ id: category.id, patch: input })
      else {
        const created = await create.mutateAsync(input)
        // Danh mục Chi mới luôn "chưa phân loại". Mở bảng chọn ngay thay vì để nó rơi vào
        // đống việc tồn: đây đúng lúc người dùng còn nhớ mình vừa tạo cái gì.
        if (created.type === 'expense') onCreatedExpense(created)
      }
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const title = category ? 'Sửa danh mục' : parentContext ? 'Thêm danh mục con' : 'Thêm danh mục'

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 lg:items-center animate-overlay-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:rounded-2xl animate-sheet-in lg:animate-sheet-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <SectionTitle role="block" className="mb-3">{title}</SectionTitle>

        <div className="mb-3 flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-surface-sunken text-2xl">
            {icon}
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tên danh mục"
            className="flex-1 rounded-md border border-border-strong px-3 py-2 text-sm"
          />
        </div>

        {/* Danh mục cha */}
        {hasChildren ? (
          <p className="mb-3 rounded-lg bg-surface-page px-3 py-2 text-sm text-fg-muted">
            Danh mục này có danh mục con nên là danh mục chính.
          </p>
        ) : (
          <label className="mb-3 block">
            <span className="mb-1 block text-sm font-medium text-fg-muted">Danh mục cha</span>
            <Select
              value={parentId ?? ''}
              onChange={(e) => setParentId(e.target.value || null)} wrapClassName="w-full">
              <option value="">— Danh mục chính —</option>
              {availableParents.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.icon} {p.name}
                </option>
              ))}
            </Select>
          </label>
        )}

        {/* Chi / Thu: chỉ khi là danh mục chính (con thừa kế loại của cha) */}
        {typeLocked ? (
          <p className="mb-3 text-sm text-fg-muted">
            Nhóm {effectiveType === 'expense' ? 'Chi' : 'Thu'} — không đổi được khi còn danh mục
            con.
          </p>
        ) : selectedParent ? (
          <p className="mb-3 text-sm text-fg-muted">
            Thuộc nhóm {selectedParent.type === 'expense' ? 'Chi' : 'Thu'} theo danh mục cha.
          </p>
        ) : (
          <div className="mb-3 grid grid-cols-2 gap-1 rounded-xl bg-surface-sunken p-1">
            {(['expense', 'income'] as CategoryType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTopType(t)}
                className={`rounded-md py-1.5 text-sm font-medium transition ${
 topType === t ? 'bg-surface text-fg-primary shadow-sm' : 'text-fg-on-track hover:text-fg-primary'
 }`}
              >
                {t === 'expense' ? 'Chi' : 'Thu'}
              </button>
            ))}
          </div>
        )}

        <p className="mb-1.5 text-sm font-medium text-fg-muted">Biểu tượng</p>
        {/* 7 cột (không phải 8): trên 375px mỗi ô ~45px — đủ 44px vùng chạm */}
        <div className="mb-3 grid grid-cols-7 gap-1">
          {EMOJI_CHOICES.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => setIcon(e)}
              className={`flex aspect-square items-center justify-center rounded-md text-xl ${
                icon === e ? 'bg-green-100 dark:bg-green-900/40 ring-2 ring-accent' : 'hover:bg-surface-sunken'
              }`}
            >
              {e}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {category && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={del.isPending}
              className="rounded-md px-3 py-2 text-sm font-medium text-state-bad-fg hover:bg-state-bad-bg disabled:opacity-50"
            >
              Xóa
            </button>
          )}
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 rounded-md px-3 py-2 text-sm text-fg-muted hover:bg-surface-sunken"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSave}
              className={actionButtonClass('primary')}
            >
              {saving ? 'Đang lưu…' : 'Lưu'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
