// Sơ đồ dòng tiền của một kỳ — thuần, không phụ thuộc React, để unit-test được.
//
// VÌ SAO CÓ FILE NÀY: khối 01 đã có `outflowTiers` (một thanh ba khúc) trả lời "thu chia
// làm ba đường". Cái nó KHÔNG trả lời được là hai câu kế tiếp — tiền vào từ những nguồn
// nào, và khúc "chi tiêu" vỡ ra thành những nhóm nào. Ba câu đó là một mạch, mà ba hình
// rời thì mỗi hình có mẫu số riêng nên không cộng được với nhau.
//
// RÀNG BUỘC PHẢI GIỮ (giống hệt outflowTiers): mọi cột cộng lại đúng bằng tiền vào. Vì
// vậy khi chi vượt thu, KHÔNG kẹp "phần để lại" về 0 — thêm hẳn một nguồn "Rút từ số dư"
// ở cột đầu. Kẹp về 0 là làm hình cân bằng bằng cách xoá đúng cái tin cần biết.
//
// Hàm ở đây chỉ tính TOẠ ĐỘ; màu và chữ là việc của SankeyCard.tsx.

import { categoryLabel, tr } from '../../i18n'


/** Vai trò của một nút/dải — quyết định màu ở tầng vẽ. */
export type SankeyTone = 'in' | 'deficit' | 'hub' | 'expense' | 'transfer' | 'kept' | 'unknown'

/** Một khoản đã quy về base currency, đã có nhãn để hiện. */
export interface SankeySlice {
  id: string
  label: string
  /** minor units, base currency. Âm hoặc 0 sẽ bị loại. */
  amount: number
}

/** Một nhóm chi (danh mục cha) kèm các danh mục con của nó — nguồn của cột thứ năm. */
export interface SankeyGroup extends SankeySlice {
  /**
   * Danh mục con. KHÔNG có (undefined) nghĩa là nhóm này không vỡ ra được — danh mục cấp
   * một không con, hoặc một mục tổng hợp như "Chưa ghi rõ" — và nó sẽ đi thẳng qua cột
   * con thành một ô cùng giá trị. Có thì tổng các con PHẢI bằng `amount`.
   */
  children?: readonly SankeySlice[]
}

export interface SankeyInput {
  /** Tổng thu của kỳ (minor units, base). */
  income: number
  /** Thu theo danh mục. Tổng có thể nhỏ hơn `income` (khoản thu không gắn danh mục). */
  incomeSlices: readonly SankeySlice[]
  /** Tổng chi ĐÃ GỒM phần chưa ghi — tức `tongChiCoPhanChuaGhi(...)`. */
  expense: number
  /** Chi theo NHÓM (danh mục cha). Tổng phải bằng `expense - chuaGhi`. */
  expenseGroups: readonly SankeyGroup[]
  /** Phần đã rời ví mà chưa ai ghi sổ. ≤ 0 = không có nhánh này. */
  chuaGhi: number
  /** Chuyển tài sản (kind = 'transfer'). */
  transfer: number
}

export interface SankeyOptions {
  /** Số nút tối đa của cột nguồn thu; phần đuôi gộp thành "Nguồn khác". */
  maxNodes?: number
  /**
   * Số nút tối đa của cột nhóm chi. Nhỏ hơn `maxNodes` một bậc là CỐ Ý: cột này chỉ
   * nhận nhánh "Chi tiêu" (thường 30–40% tiền vào) nên cùng số nút thì mỗi nút mỏng
   * bằng một phần ba, mà nhãn thì vẫn cần bấy nhiêu chỗ.
   */
  maxGroupNodes?: number
  /**
   * Số ô tối đa MỖI NHÓM được mở ra ở cột con; phần đuôi gộp thành "Khác". 3 = hai con
   * lớn nhất + một ô gộp.
   *
   * Nhỏ hơn hẳn hai cột kia vì cột con không chia CẢ tiền vào mà chỉ chia nhánh "Chi
   * tiêu" — tháng 8/2026 nhánh đó chỉ 35% tiền vào, nên một ô con 1% của chi chỉ dày
   * 1,4px: không in nổi chữ, mà vẫn ăn một khe 7px. Mở ít mà ô dày còn đọc được.
   */
  maxChildNodes?: number
  /** Chiều cao vùng vẽ (đơn vị viewBox). */
  height?: number
  /** Chiều rộng vùng vẽ (đơn vị viewBox). */
  width?: number
}

export interface SankeyNode {
  id: string
  label: string
  value: number
  /** 0 nguồn vào · 1 tổng · 2 ba đường · 3 nhóm chi · 4 danh mục con */
  col: number
  tone: SankeyTone
  x0: number
  x1: number
  y0: number
  y1: number
  /** Phần trăm trên tổng tiền vào. null khi tổng ≤ 0. */
  pct: number | null
  /**
   * Ô cột con của một nhóm không vỡ ra được — cùng nhãn, cùng giá trị với ô cột 3 ngay
   * bên trái. Tầng vẽ KHÔNG in nhãn lại cho nó: dải nối chạy ngang, in hai lần cùng một
   * chữ cạnh nhau thì đọc ra như hai khoản khác nhau.
   */
  passThrough?: boolean
  /**
   * Nhãn viết về phía nào của nút. Hai cột cuối luôn viết sang TRÁI — nếu cột 3 viết sang
   * phải thì nhãn của nó đâm thẳng vào nhãn viết-sang-trái của cột 4.
   */
  labelSide: 'left' | 'right'
}

export interface SankeyLink {
  id: string
  source: string
  target: string
  value: number
  tone: SankeyTone
  /** Đường `d` của dải ruy-băng đã đóng kín (fill được). */
  path: string
}

export interface SankeyModel {
  nodes: readonly SankeyNode[]
  links: readonly SankeyLink[]
  width: number
  height: number
  /** Tổng đi qua nút giữa = tiền vào (đã gồm phần rút từ số dư nếu có). */
  total: number
  /** true khi chi + chuyển > thu, tức có nhánh "Rút từ số dư". */
  hasDeficit: boolean
}

const NODE_W = 11
/** Khe dọc giữa hai nút cùng cột. */
const GAP = 7
const DEFAULT_MAX_NODES = 6
const DEFAULT_MAX_GROUP_NODES = 5
const DEFAULT_MAX_CHILD_NODES = 3
const DEFAULT_H = 380
const DEFAULT_W = 720
/** Có cột thứ năm thì nới khung: nhồi năm cột vào 720 là mỗi khoảng nối còn 177px. */
const DEFAULT_W_WIDE = 960

export const SANKEY_OTHER_ID = 'other'
export const SANKEY_CHUA_GHI_ID = 'chua-ghi'
export const SANKEY_DEFICIT_ID = 'deficit'
export const SANKEY_HUB_ID = 'hub'

/**
 * Gộp đuôi danh sách thành một mục "Khác".
 *
 * Cắt theo SỐ NÚT chứ không theo ngưỡng phần trăm: ngưỡng % làm số nút nhảy giữa các
 * tháng, nên cùng một màn hình lúc thì 4 dải lúc thì 11 dải — mắt phải học lại bố cục
 * mỗi lần mở. Số nút cố định thì hình giữ nguyên dáng, chỉ đổi độ dày.
 */
export function capSlices(
  slices: readonly SankeySlice[],
  maxNodes: number,
  otherLabel = tr('Khác'),
): SankeySlice[] {
  const kept = slices.filter((s) => s.amount > 0).sort((a, b) => b.amount - a.amount)
  if (kept.length <= maxNodes) return kept
  const head = kept.slice(0, maxNodes - 1)
  const tailSum = kept.slice(maxNodes - 1).reduce((s, x) => s + x.amount, 0)
  const tailCount = kept.length - (maxNodes - 1)
  head.push({
    id: SANKEY_OTHER_ID,
    label: `${otherLabel} (${tailCount})`,
    amount: tailSum,
  })
  return head
}

/** Chỉ những cột thật sự cần — nhận cả `CategoryRow` lẫn bản rút gọn trong test. */
interface CatLike {
  id: string
  name: string
  icon: string
  parent_id: string | null
}

/**
 * Gộp các lát danh mục LÁ về danh mục CHA của chúng.
 *
 * Vì sao gộp về cha chứ không vẽ thẳng lá: danh mục lá của một tháng thật thường 15–25
 * cái, mà một cột Sankey đọc được tối đa chừng sáu. Cắt thẳng ở lá thì "Khác" nuốt quá
 * nửa hình; gộp về cha trước rồi mới cắt thì mỗi dải còn là một câu có nghĩa.
 *
 * Danh mục đã xoá (không tra ra) vẫn giữ lại thành một mục riêng: bỏ đi là tổng cột chi
 * không còn bằng khúc "Chi tiêu", và cả hình mất cân trong im lặng.
 */
export function groupSlicesByParent(
  slices: readonly { categoryId: string; amount: number }[],
  categories: readonly CatLike[],
): SankeySlice[] {
  const byId = new Map(categories.map((c) => [c.id, c]))
  const out = new Map<string, SankeySlice>()
  for (const s of slices) {
    if (s.amount <= 0) continue
    const leaf = byId.get(s.categoryId)
    const parent = leaf?.parent_id ? byId.get(leaf.parent_id) : undefined
    const node = parent ?? leaf
    const id = node?.id ?? `mat:${s.categoryId}`
    const label = node ? `${node.icon} ${categoryLabel(node.name)}`.trim() : tr('Danh mục đã xoá')
    const cur = out.get(id)
    if (cur) cur.amount += s.amount
    else out.set(id, { id, label, amount: s.amount })
  }
  return [...out.values()].sort((a, b) => b.amount - a.amount)
}

/**
 * Như `groupSlicesByParent`, nhưng mỗi nhóm mang theo danh sách con — nguồn của cột thứ năm.
 *
 * Tách thành hàm RIÊNG chứ không thêm trường vào hàm kia: cột nguồn THU cũng gọi hàm kia,
 * mà thu thì không có cột con nào để vẽ, nên gắn `children` vào đó chỉ là dữ liệu thừa đi
 * qua nửa màn hình.
 *
 * Tiền ghi THẲNG vào danh mục cha (`{ categoryId: 'nha' }` khi 'nha' có con) thành một ô
 * con mang tên chính nó. Bỏ qua nó thì tổng các con nhỏ hơn nút nhóm, và hình mất cân
 * trong im lặng — đúng cái ràng buộc ghi ở đầu file.
 */
export function groupSlicesWithChildren(
  slices: readonly { categoryId: string; amount: number }[],
  categories: readonly CatLike[],
): SankeyGroup[] {
  const byId = new Map(categories.map((c) => [c.id, c]))
  interface Acc {
    id: string
    label: string
    amount: number
    direct: number
    kids: Map<string, SankeySlice>
  }
  const out = new Map<string, Acc>()

  for (const s of slices) {
    if (s.amount <= 0) continue
    const leaf = byId.get(s.categoryId)
    const parent = leaf?.parent_id ? byId.get(leaf.parent_id) : undefined
    const node = parent ?? leaf
    const id = node?.id ?? `mat:${s.categoryId}`
    const label = node ? `${node.icon} ${categoryLabel(node.name)}`.trim() : tr('Danh mục đã xoá')
    let g = out.get(id)
    if (!g) {
      g = { id, label, amount: 0, direct: 0, kids: new Map() }
      out.set(id, g)
    }
    g.amount += s.amount
    if (parent && leaf) {
      const cur = g.kids.get(leaf.id)
      if (cur) cur.amount += s.amount
      else g.kids.set(leaf.id, { id: leaf.id, label: `${leaf.icon} ${categoryLabel(leaf.name)}`.trim(), amount: s.amount })
    } else {
      g.direct += s.amount
    }
  }

  return [...out.values()]
    .map((g): SankeyGroup => {
      if (g.kids.size === 0) return { id: g.id, label: g.label, amount: g.amount }
      const children = [...g.kids.values()]
      if (g.direct > 0) children.push({ id: g.id, label: g.label, amount: g.direct })
      children.sort((a, b) => b.amount - a.amount)
      return { id: g.id, label: g.label, amount: g.amount, children }
    })
    .sort((a, b) => b.amount - a.amount)
}

/**
 * Dải ruy-băng nối hai cạnh dọc, dùng hai đường Bézier bậc ba đối xứng.
 *
 * Điểm điều khiển đặt ở CHÍNH GIỮA hai cột (không phải 1/3–2/3): giữa thì hai dải cắt
 * nhau tạo góc lớn hơn nên phân biệt được, còn 1/3 làm chúng bám sát nhau ở đoạn giữa.
 */
export function ribbonPath(
  x0: number,
  y0a: number,
  y0b: number,
  x1: number,
  y1a: number,
  y1b: number,
): string {
  const xm = (x0 + x1) / 2
  const r = (n: number) => Math.round(n * 100) / 100
  return [
    `M${r(x0)},${r(y0a)}`,
    `C${r(xm)},${r(y0a)} ${r(xm)},${r(y1a)} ${r(x1)},${r(y1a)}`,
    `L${r(x1)},${r(y1b)}`,
    `C${r(xm)},${r(y1b)} ${r(xm)},${r(y0b)} ${r(x0)},${r(y0b)}`,
    'Z',
  ].join('')
}

interface Stack {
  id: string
  label: string
  value: number
  tone: SankeyTone
  passThrough?: boolean
}

/** Số dòng nhãn được phép in cạnh một nút: 2 = tên + số, 1 = chỉ tên, 0 = không nhãn. */
export type LabelLines = 0 | 1 | 2

/** Chiều cao tối thiểu của nút để nhãn không cao hơn hẳn thứ nó gán nhãn. */
const MIN_H_TWO = 20
const MIN_H_ONE = 9
/** Khoảng cách tối thiểu giữa hai TÂM nhãn liền nhau trong cùng cột. */
const MIN_GAP_TWO = 24
const MIN_GAP_ONE = 13

/**
 * Quyết định nhãn nào được in, theo TỪNG CỘT từ trên xuống.
 *
 * Vì sao không chỉ xét chiều cao của chính nút đó: một nút mỏng ĐỨNG RIÊNG vẫn còn thừa
 * chỗ hai bên, còn hai nút mỏng SÁT NHAU thì không. Xét mình chiều cao thì hoặc bỏ oan
 * nhãn của nút đứng riêng (đo ở tháng 9 demo: "Đầu tư ¥9.073" bị bỏ dù quanh nó trống),
 * hoặc để hai nhãn chồng lên nhau thành một vệt.
 *
 * Nút bị bỏ nhãn KHÔNG mất thông tin: `<title>` vẫn hiện khi rê chuột, và bảng khối 02
 * ngay dưới liệt kê đủ. Thà thiếu nhãn còn hơn in ra một vệt không đọc được.
 */
export function labelPlan(nodes: readonly SankeyNode[]): Map<string, LabelLines> {
  const out = new Map<string, LabelLines>()
  const cols = new Map<number, SankeyNode[]>()
  for (const n of nodes) {
    const arr = cols.get(n.col)
    if (arr) arr.push(n)
    else cols.set(n.col, [n])
  }
  for (const arr of cols.values()) {
    let lastCy = -Infinity
    for (const n of [...arr].sort((a, b) => a.y0 - b.y0)) {
      // Ô đi thẳng mang đúng nhãn của ô bên trái nó — không in lại, và cũng KHÔNG tính
      // vào khoảng cách nhãn, nếu không nó đẩy hàng xóm xuống 0 dòng để giữ chỗ cho một
      // cái nhãn không bao giờ vẽ ra.
      if (n.passThrough) {
        out.set(n.id, 0)
        continue
      }
      const h = n.y1 - n.y0
      const cy = (n.y0 + n.y1) / 2
      let lines: LabelLines = 0
      if (h >= MIN_H_TWO && cy - lastCy >= MIN_GAP_TWO) lines = 2
      else if (h >= MIN_H_ONE && cy - lastCy >= MIN_GAP_ONE) lines = 1
      out.set(n.id, lines)
      if (lines > 0) lastCy = cy
    }
  }
  return out
}

/**
 * Vì sao KHÔNG vẽ được, tách khỏi "tháng rỗng nên không có gì để vẽ".
 *
 * VÌ SAO CÓ HÀM NÀY. `buildSankey` trả `null` khi `income + deficit <= 0`, và nơi gọi thì
 * không vẽ gì cả. Đúng với tháng chưa có đồng nào, nhưng SAI trong một ca có thật: tổng
 * chi đưa vào đây là `tongChiCoPhanChuaGhi`, tức chi đã ghi CỘNG phần đối chiếu. Lần đối
 * chiếu nói "ghi thừa" thì phần đó ÂM, và ghi thừa nhiều hơn cả phần chi đã ghi trong kỳ
 * là tổng về 0 hoặc âm → `Math.max(0, …)` kẹp về 0 → cả thẻ biến mất không một lời nào.
 *
 * Đo trên sổ thật 09/2026: tháng 9 có ¥144.294 chi đã ghi, nên chỉ cần một lần đối chiếu
 * ghi thừa từ ¥144.294 trở lên là mất thẻ. Một kỳ CÓ chi mà không hiện gì thì người đọc
 * kết luận "tính năng hỏng", chứ không đoán được là số liệu đang tự mâu thuẫn.
 */
export function sankeyBlocker(p: {
  income: number
  /** Tổng chi ĐÃ GỒM phần đối chiếu — chính giá trị truyền vào `buildSankey`. */
  expense: number
  transfer: number
  /** Chi đã ghi trong sổ, CHƯA cộng phần đối chiếu. */
  chiDaGhi: number
}): 'ghi-thua' | null {
  // Không có gì trong kỳ → không phải "không vẽ được", mà là "không có gì để vẽ".
  if (p.chiDaGhi <= 0) return null
  // Sổ CÓ ghi chi mà tổng đã gồm phần đối chiếu lại ≤ 0. Chặn kể cả khi kỳ có thu: lúc đó
  // `buildSankey` kẹp chi về 0 rồi vẽ "Phần để lại = 100%", tức là hình nói "kỳ này không
  // tiêu đồng nào" ngay bên dưới thẻ ba đường đang ghi "Chi tiêu −¥110.270". Đo trong chế
  // độ demo 09/2026: đúng hai thẻ cạnh nhau nói hai điều trái ngược.
  return p.expense <= 0 ? 'ghi-thua' : null
}

/** Dựng mô hình đã có toạ độ. Trả `null` khi không có gì để vẽ. */
export function buildSankey(input: SankeyInput, opts: SankeyOptions = {}): SankeyModel | null {
  const maxNodes = opts.maxNodes ?? DEFAULT_MAX_NODES
  const maxGroupNodes = opts.maxGroupNodes ?? DEFAULT_MAX_GROUP_NODES
  const maxChildNodes = opts.maxChildNodes ?? DEFAULT_MAX_CHILD_NODES
  const H = opts.height ?? DEFAULT_H
  const hasChildCol = input.expenseGroups.some((g) => (g.children?.length ?? 0) > 0)
  const W = opts.width ?? (hasChildCol ? DEFAULT_W_WIDE : DEFAULT_W)

  const income = Math.max(0, Math.round(input.income))
  const expense = Math.max(0, Math.round(input.expense))
  const transfer = Math.max(0, Math.round(input.transfer))
  const chuaGhi = Math.max(0, Math.round(input.chuaGhi))

  const kept = income - expense - transfer
  const deficit = kept < 0 ? -kept : 0
  const total = income + deficit
  if (total <= 0) return null

  // ---- cột 0: nguồn tiền vào ------------------------------------------------------
  const sources: Stack[] = capSlices(input.incomeSlices, maxNodes, tr('Nguồn khác')).map((s) => ({
    id: `in:${s.id}`,
    label: s.label,
    value: s.amount,
    tone: 'in' as const,
  }))
  // Khoản thu không gắn danh mục: phần chênh giữa `income` và tổng các lát. Không im
  // lặng bỏ qua — bỏ qua thì cột 0 không cộng bằng cột 1 và cả hình sai lệch âm thầm.
  const namedIncome = sources.reduce((s, x) => s + x.value, 0)
  if (income - namedIncome > 0) {
    sources.push({
      id: 'in:khong-danh-muc',
      label: tr('Chưa gắn danh mục'),
      value: income - namedIncome,
      tone: 'in',
    })
  }
  if (deficit > 0) {
    sources.push({
      id: `in:${SANKEY_DEFICIT_ID}`,
      label: tr('Rút từ số dư'),
      value: deficit,
      tone: 'deficit',
    })
  }

  // ---- cột 2: ba đường ------------------------------------------------------------
  // Thứ tự CỐ ĐỊNH chi → chuyển → để lại, không sắp theo độ lớn: đây là ba hạng mục có
  // nghĩa riêng, đảo chỗ theo tháng thì không đọc được xu hướng qua nhiều tháng.
  const tiers: Stack[] = []
  if (expense > 0) tiers.push({ id: 'tier:expense', label: tr('Chi tiêu'), value: expense, tone: 'expense' })
  if (transfer > 0)
    tiers.push({ id: 'tier:transfer', label: tr('Chuyển tài sản'), value: transfer, tone: 'transfer' })
  if (kept > 0) tiers.push({ id: 'tier:kept', label: tr('Phần để lại'), value: kept, tone: 'kept' })

  // ---- cột 3: nhóm chi ------------------------------------------------------------
  const groups: Stack[] = capSlices(input.expenseGroups, maxGroupNodes, tr('Nhóm khác')).map((s) => ({
    id: `g:${s.id}`,
    label: s.label,
    value: s.amount,
    tone: 'expense' as const,
  }))
  const namedExpense = groups.reduce((s, x) => s + x.value, 0)
  const rest = expense - chuaGhi - namedExpense
  if (rest > 0) {
    groups.push({ id: 'g:khong-danh-muc', label: tr('Chưa gắn danh mục'), value: rest, tone: 'expense' })
  }
  // "Chưa ghi rõ" luôn ở CUỐI cột: nó không phải một nhóm chi, nó là phần ta không biết.
  // Đặt cuối để mắt đọc hết cái đã biết rồi mới tới cái chưa biết.
  if (chuaGhi > 0) {
    groups.push({
      id: `g:${SANKEY_CHUA_GHI_ID}`,
      label: tr('Chưa ghi rõ'),
      value: chuaGhi,
      tone: 'unknown',
    })
  }

  // ---- cột 4: danh mục con --------------------------------------------------------
  // Chỉ dựng khi có nhóm nào vỡ ra được. Nhóm không có con — danh mục cấp một, "Nhóm
  // khác" do cắt đuôi, "Chưa gắn danh mục", "Chưa ghi rõ" — đi THẲNG qua một ô cùng giá
  // trị. Phải đi qua chứ không được bỏ: bỏ thì cột 4 không cộng bằng nút "Chi tiêu".
  const childrenById = new Map(input.expenseGroups.map((g) => [g.id, g.children]))
  const children: Stack[] = []
  if (hasChildCol) {
    for (const g of groups) {
      const kids = childrenById.get(g.id.slice(2))
      if (!kids || kids.length === 0) {
        children.push({ ...g, id: `p:${g.id}`, passThrough: true })
        continue
      }
      let got = 0
      for (const c of capSlices(kids, maxChildNodes)) {
        children.push({
          id: `c:${g.id.slice(2)}:${c.id}`,
          label: c.label,
          value: c.amount,
          tone: g.tone,
        })
        got += c.amount
      }
      // Chốt an toàn cho ràng buộc cân bằng: nếu người gọi đưa danh sách con cộng KHÔNG
      // đủ giá trị nhóm thì bù phần thiếu, thay vì để hình lệch mà không ai thấy.
      if (g.value - got > 0) {
        children.push({
          id: `c:${g.id.slice(2)}:con-lai`,
          label: g.label,
          value: g.value - got,
          tone: g.tone,
        })
      }
    }
  }

  const hub: Stack[] = [{ id: SANKEY_HUB_ID, label: tr('Tiền vào'), value: total, tone: 'hub' }]
  const columns: Stack[][] = hasChildCol
    ? [sources, hub, tiers, groups, children]
    : [sources, hub, tiers, groups]

  // ---- thang đo -------------------------------------------------------------------
  // MỘT hệ số cho cả hình, lấy cột chật nhất làm chuẩn. Mỗi cột một hệ số thì dải nối
  // hai cột sẽ phình/thóp dọc đường đi, và người đọc hiểu là tiền hao hụt trên đường.
  let k = Infinity
  for (const col of columns) {
    if (col.length === 0) continue
    const sum = col.reduce((s, x) => s + x.value, 0)
    if (sum <= 0) continue
    const usable = H - (col.length - 1) * GAP
    k = Math.min(k, usable / sum)
  }
  if (!Number.isFinite(k) || k <= 0) return null

  const lastCol = columns.length - 1
  const colX = (c: number) => (c === lastCol ? W - NODE_W : ((W - NODE_W) / lastCol) * c)
  // Hai cột cuối viết nhãn sang TRÁI khi có cột thứ năm — xem ghi chú ở `labelSide`.
  const sideOf = (c: number): 'left' | 'right' =>
    c >= lastCol - (lastCol >= 4 ? 1 : 0) ? 'left' : 'right'
  const nodes: SankeyNode[] = []
  const byId = new Map<string, SankeyNode>()
  for (let c = 0; c < columns.length; c++) {
    let y = 0
    for (const s of columns[c]) {
      const h = s.value * k
      const node: SankeyNode = {
        id: s.id,
        label: s.label,
        value: s.value,
        col: c,
        tone: s.tone,
        x0: colX(c),
        x1: colX(c) + NODE_W,
        y0: y,
        y1: y + h,
        pct: total > 0 ? Math.round((s.value / total) * 100) : null,
        passThrough: s.passThrough,
        labelSide: sideOf(c),
      }
      nodes.push(node)
      byId.set(node.id, node)
      y += h + GAP
    }
  }

  // ---- dải nối ---------------------------------------------------------------------
  // Con trỏ chạy dọc mép của nút chung (hub, tier:expense) để các dải xếp kề nhau đúng
  // thứ tự nút, không chồng lên nhau.
  const links: SankeyLink[] = []
  const hubNode = byId.get(SANKEY_HUB_ID)
  if (!hubNode) return null

  let hubIn = hubNode.y0
  for (const s of sources) {
    const n = byId.get(s.id)
    if (!n) continue
    const h = n.y1 - n.y0
    links.push({
      id: `${s.id}->${SANKEY_HUB_ID}`,
      source: s.id,
      target: SANKEY_HUB_ID,
      value: s.value,
      tone: s.tone,
      path: ribbonPath(n.x1, n.y0, n.y1, hubNode.x0, hubIn, hubIn + h),
    })
    hubIn += h
  }

  let hubOut = hubNode.y0
  for (const t of tiers) {
    const n = byId.get(t.id)
    if (!n) continue
    const h = n.y1 - n.y0
    links.push({
      id: `${SANKEY_HUB_ID}->${t.id}`,
      source: SANKEY_HUB_ID,
      target: t.id,
      value: t.value,
      tone: t.tone,
      path: ribbonPath(hubNode.x1, hubOut, hubOut + h, n.x0, n.y0, n.y1),
    })
    hubOut += h
  }

  const expenseNode = byId.get('tier:expense')
  if (expenseNode) {
    let out = expenseNode.y0
    for (const g of groups) {
      const n = byId.get(g.id)
      if (!n) continue
      const h = n.y1 - n.y0
      links.push({
        id: `tier:expense->${g.id}`,
        source: 'tier:expense',
        target: g.id,
        value: g.value,
        tone: g.tone,
        path: ribbonPath(expenseNode.x1, out, out + h, n.x0, n.y0, n.y1),
      })
      out += h
    }
  }

  // ---- dải nối cột 3 → cột 4 -------------------------------------------------------
  for (const g of groups) {
    const gn = byId.get(g.id)
    if (!gn) continue
    let out = gn.y0
    for (const c of children.filter(
      (x) => x.id === `p:${g.id}` || x.id.startsWith(`c:${g.id.slice(2)}:`),
    )) {
      const n = byId.get(c.id)
      if (!n) continue
      const h = n.y1 - n.y0
      links.push({
        id: `${g.id}->${c.id}`,
        source: g.id,
        target: c.id,
        value: c.value,
        tone: c.tone,
        path: ribbonPath(gn.x1, out, out + h, n.x0, n.y0, n.y1),
      })
      out += h
    }
  }

  return { nodes, links, width: W, height: H, total, hasDeficit: deficit > 0 }
}
