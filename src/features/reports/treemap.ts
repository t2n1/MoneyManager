// Xếp ô theo diện tích cho thẻ "Chi đi vào đâu" — toán thuần, không JSX.
//
// VÌ SAO VIẾT TAY: Recharts CÓ <Treemap>, nhưng nó nhận màu qua prop nên không lật được
// theo chế độ Tối (§"Màu biểu đồ" của design-system), và nó không biết gì về hai thứ
// riêng của sổ này — khung nhóm cha có dòng tiêu đề, và `share` phải đọc theo TỔNG CHI
// THẬT của kỳ chứ không theo tổng các ô. Cùng lý do `sankey.ts` viết tay.
//
// Thuật toán là "squarified" (Bruls–Huizing–van Wijk 2000): xếp từng hàng và chỉ đóng
// hàng khi thêm một ô nữa làm ô méo hơn. Cắt lát tuần tự thì rẻ hơn nhưng 16 khoản bằng
// nhau trong khung 600×300 ra 16 sợi tỉ lệ 8:1 — có test giữ đúng chỗ này.

import { tr } from '../../i18n'

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** Một khoản đi vào hình: danh mục lá, hoặc cả một nhóm cha khi xếp tầng ngoài. */
export interface TreemapLeaf {
  id: string
  label: string
  value: number
}

export interface TreemapTile extends Rect, TreemapLeaf {}

/** Nhóm cha gộp lại khi nó quá nhỏ để vẽ ra hình — xem `collapseSmallGroups`. */
export const SMALL_GROUP_ID = '__nhom-nho__'
export const SMALL_GROUP_LABEL = tr('Nhóm nhỏ khác')

const EPS = 1e-9

/** Tỉ lệ méo nhất của một hàng nếu đặt vào cạnh dài `len`. Càng gần 1 càng vuông. */
function worstRatio(row: readonly { a: number }[], len: number): number {
  const s = row.reduce((t, r) => t + r.a, 0)
  if (s <= EPS || len <= EPS) return Infinity
  let mx = -Infinity
  let mn = Infinity
  for (const r of row) {
    if (r.a > mx) mx = r.a
    if (r.a < mn) mn = r.a
  }
  if (mn <= EPS) return Infinity
  return Math.max((len * len * mx) / (s * s), (s * s) / (len * len * mn))
}

/**
 * Xếp các khoản kín khung, diện tích tỉ lệ với `value`, khoản nặng nhất ở góc trên trái.
 *
 * Khoản ≤ 0 bị loại: chúng không có diện tích để vẽ, mà giữ lại thì `worstRatio` chia
 * cho 0 và cả hàng méo theo.
 */
export function squarify(items: readonly TreemapLeaf[], box: Rect): TreemapTile[] {
  if (box.w <= EPS || box.h <= EPS) return []
  const rest = items.filter((i) => i.value > 0).sort((a, b) => b.value - a.value)
  const total = rest.reduce((s, i) => s + i.value, 0)
  if (total <= EPS) return []

  const out: TreemapTile[] = []
  const scale = (box.w * box.h) / total
  // Phần khung CÒN LẠI sau mỗi hàng đã đóng.
  let rx = box.x
  let ry = box.y
  let rw = box.w
  let rh = box.h
  let row: { item: TreemapLeaf; a: number }[] = []

  const flush = () => {
    const s = row.reduce((t, r) => t + r.a, 0)
    const len = Math.min(rw, rh)
    if (s <= EPS || len <= EPS) {
      row = []
      return
    }
    const thick = s / len
    if (rw >= rh) {
      // Khung còn lại nằm ngang → hàng là một CỘT dọc bên trái.
      let cy = ry
      for (const r of row) {
        const h = r.a / thick
        out.push({ ...r.item, x: rx, y: cy, w: thick, h })
        cy += h
      }
      rx += thick
      rw -= thick
    } else {
      let cx = rx
      for (const r of row) {
        const w = r.a / thick
        out.push({ ...r.item, x: cx, y: ry, w, h: thick })
        cx += w
      }
      ry += thick
      rh -= thick
    }
    row = []
  }

  let i = 0
  while (i < rest.length) {
    const item = rest[i]
    const entry = { item, a: item.value * scale }
    const len = Math.min(rw, rh)
    if (row.length === 0 || worstRatio(row, len) >= worstRatio([...row, entry], len)) {
      row.push(entry)
      i++
    } else {
      flush()
    }
  }
  flush()
  return out
}

// ---------------------------------------------------------------------------
// Kiểu PHẲNG — mọi danh mục lá xếp thẳng, không khung nhóm.
// ---------------------------------------------------------------------------

export interface FlatLeafInput extends TreemapLeaf {
  /** Nhóm cha — chỉ để tô màu và để nhãn nói rõ "Cơm ngoài (Ăn uống)". null = không có cha. */
  groupId: string | null
  groupLabel: string | null
}

export interface FlatTile extends TreemapTile {
  groupId: string | null
  groupLabel: string | null
  /** Phần của TỔNG CHI kỳ này, 0–1. Xem ghi chú ở `shareOf`. */
  share: number
}

/**
 * `total` là tổng chi THẬT của kỳ, không phải tổng các ô. Hai số này lệch nhau khi có
 * khoản chưa gắn danh mục hoặc phần "Chưa ghi rõ" — lấy tổng các ô thì mỗi phần trăm in
 * ra đều to hơn sự thật, và nó lệch với đúng cột % của bảng ngay bên dưới.
 */
const shareOf = (value: number, total: number) => (total > EPS ? value / total : 0)

export function layoutFlat(
  leaves: readonly FlatLeafInput[],
  box: Rect,
  total?: number,
): FlatTile[] {
  const sum = leaves.reduce((s, l) => s + Math.max(0, l.value), 0)
  const denom = total ?? sum
  const byId = new Map(leaves.map((l) => [l.id, l]))
  return squarify(leaves, box).map((t) => ({
    ...t,
    groupId: byId.get(t.id)?.groupId ?? null,
    groupLabel: byId.get(t.id)?.groupLabel ?? null,
    share: shareOf(t.value, denom),
  }))
}

// ---------------------------------------------------------------------------
// Kiểu THEO NHÓM — khung nhóm cha, bên trong là danh mục con.
// ---------------------------------------------------------------------------

export interface TreemapGroupInput {
  id: string
  label: string
  children: readonly TreemapLeaf[]
}

export interface GroupFrame extends Rect {
  id: string
  label: string
  value: number
  share: number
  /** Khung có đủ cao để in tên nhóm không. Xem `layoutGrouped`. */
  showHeader: boolean
}

export interface GroupedTile extends TreemapTile {
  groupId: string
  groupLabel: string
  share: number
}

export interface GroupedLayoutOptions {
  /** Khe giữa hai khung nhóm, tính mỗi bên. */
  gap: number
  /** Chiều cao dành cho dòng tên nhóm. */
  header: number
}

/** Khung thấp hơn `header` + chừng này thì bỏ tiêu đề — còn lại không đủ vẽ ô nào. */
const MIN_CONTENT_H = 12
/** Tên nhóm ngắn nhất cũng cần chừng này bề ngang mới đọc ra chữ. */
const MIN_HEADER_W = 56

const groupTotal = (g: TreemapGroupInput) =>
  g.children.reduce((s, c) => s + Math.max(0, c.value), 0)

/**
 * Nhóm chiếm dưới `minShare` gom thành MỘT ô "Nhóm nhỏ khác".
 *
 * Không gom khi chỉ có ĐÚNG MỘT nhóm nhỏ: lúc đó việc gom chỉ là đổi tên nó thành
 * "khác", mất cái tên thật mà không đổi lại được chỗ nào rộng hơn.
 */
export function collapseSmallGroups(
  groups: readonly TreemapGroupInput[],
  minShare: number,
): TreemapGroupInput[] {
  const total = groups.reduce((s, g) => s + groupTotal(g), 0)
  if (total <= EPS) return [...groups]
  const small = groups.filter((g) => groupTotal(g) / total < minShare)
  if (small.length <= 1) return [...groups]
  const smallIds = new Set(small.map((g) => g.id))
  return [
    ...groups.filter((g) => !smallIds.has(g.id)),
    {
      id: SMALL_GROUP_ID,
      label: SMALL_GROUP_LABEL,
      children: small.flatMap((g) => [...g.children]),
    },
  ]
}

/**
 * Hai lượt xếp: nhóm cha kín khung ngoài, rồi từng danh mục con kín khung nhóm của nó.
 *
 * Tiêu đề nhóm ăn vào phần vẽ ô con, nên nó TỰ TẮT khi khung không đủ cao — đẩy ô con
 * xuống dưới đáy khung là vẽ đè lên nhóm bên cạnh, thứ mắt đọc ra là một danh mục nằm
 * nhầm nhóm.
 */
export function layoutGrouped(
  groups: readonly TreemapGroupInput[],
  box: Rect,
  opts: GroupedLayoutOptions,
  total?: number,
): { groups: GroupFrame[]; leaves: GroupedTile[] } {
  const live = groups.filter((g) => groupTotal(g) > EPS)
  const denom = total ?? live.reduce((s, g) => s + groupTotal(g), 0)

  const frames = squarify(
    live.map((g) => ({ id: g.id, label: g.label, value: groupTotal(g) })),
    box,
  )

  const outGroups: GroupFrame[] = []
  const outLeaves: GroupedTile[] = []

  for (const f of frames) {
    const src = live.find((g) => g.id === f.id)!
    const inner: Rect = {
      x: f.x + opts.gap,
      y: f.y + opts.gap,
      w: f.w - opts.gap * 2,
      h: f.h - opts.gap * 2,
    }
    // Nhóm chỉ chứa ĐÚNG CHÍNH NÓ (danh mục cấp một không có con, hoặc danh mục đã
    // xoá) thì cái ô bên trong đã mang tên đó rồi — in thêm dòng tên là viết hai lần
    // cùng một chữ, và ăn mất 14px của một khung vốn đã nhỏ.
    const selfOnly = src.children.length === 1 && src.children[0].id === src.id
    const showHeader =
      opts.header > 0 &&
      !selfOnly &&
      inner.h >= opts.header + MIN_CONTENT_H &&
      inner.w >= MIN_HEADER_W
    const content: Rect = showHeader
      ? { x: inner.x, y: inner.y + opts.header, w: inner.w, h: inner.h - opts.header }
      : inner

    outGroups.push({ ...f, value: f.value, share: shareOf(f.value, denom), showHeader })
    for (const t of squarify(src.children, content)) {
      outLeaves.push({
        ...t,
        groupId: src.id,
        groupLabel: src.label,
        share: shareOf(t.value, denom),
      })
    }
  }

  return { groups: outGroups, leaves: outLeaves }
}

// ---------------------------------------------------------------------------
// Dựng dữ liệu từ đúng những dòng mà bảng danh mục đang hiện.
// ---------------------------------------------------------------------------

/** Chỉ những cột cần tới — nhận cả `MonthTableRow` lẫn bản rút gọn trong test. */
export interface CategoryAmountRow {
  categoryId: string
  name: string
  thisMonth: number
}

/** Chỉ những cột cần tới — nhận cả `CategoryRow` lẫn bản rút gọn trong test. */
export interface CategoryTreeLike {
  id: string
  name: string
  parent_id: string | null
}

/**
 * Nguồn của hình PHẢI là đúng bộ dòng mà bảng ngay bên dưới đang hiện.
 *
 * Hai thẻ cạnh nhau mà lấy hai nguồn khác nhau thì sớm muộn cũng lệch một khoản, và
 * người đọc không có cách nào biết bên nào đúng. Vì vậy hàm này nhận `rows` của bảng chứ
 * không tự gọi `categoryBreakdown` lần nữa — `total` trả ra cũng là đúng mẫu số mà cột %
 * của bảng đang chia.
 *
 * Danh mục đã xoá (không tra ra trong `categories`) vẫn lên hình thành một nhóm riêng:
 * bỏ đi là tổng diện tích không còn bằng tổng bảng, mà lệch trong im lặng.
 */
export function buildCategoryTreemap(
  rows: readonly CategoryAmountRow[],
  categories: readonly CategoryTreeLike[],
): { groups: TreemapGroupInput[]; flat: FlatLeafInput[]; total: number } {
  const catById = new Map(categories.map((c) => [c.id, c]))
  const live = rows.filter((r) => r.thisMonth > 0)
  const total = live.reduce((s, r) => s + r.thisMonth, 0)

  const order: string[] = []
  const byGroup = new Map<string, { label: string; children: TreemapLeaf[]; total: number }>()
  const flat: FlatLeafInput[] = []

  for (const r of live) {
    const cat = catById.get(r.categoryId)
    const parent = cat?.parent_id ? catById.get(cat.parent_id) : undefined
    // Cha đã xoá mà con còn: coi con là một nhóm đứng riêng, đừng dựng nhóm không tên.
    const groupId = parent ? parent.id : r.categoryId
    const groupLabel = parent ? parent.name : r.name

    let g = byGroup.get(groupId)
    if (!g) {
      g = { label: groupLabel, children: [], total: 0 }
      byGroup.set(groupId, g)
      order.push(groupId)
    }
    g.children.push({ id: r.categoryId, label: r.name, value: r.thisMonth })
    g.total += r.thisMonth
    flat.push({ id: r.categoryId, label: r.name, value: r.thisMonth, groupId, groupLabel })
  }

  const groups = order
    .map((id) => {
      const g = byGroup.get(id)!
      return {
        id,
        label: g.label,
        total: g.total,
        children: [...g.children].sort((a, b) => b.value - a.value),
      }
    })
    .sort((a, b) => b.total - a.total)
    .map(({ id, label, children }) => ({ id, label, children }))

  return { groups, flat, total }
}
