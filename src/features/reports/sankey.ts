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

/** Vai trò của một nút/dải — quyết định màu ở tầng vẽ. */
export type SankeyTone = 'in' | 'deficit' | 'hub' | 'expense' | 'transfer' | 'kept' | 'unknown'

/** Một khoản đã quy về base currency, đã có nhãn để hiện. */
export interface SankeySlice {
  id: string
  label: string
  /** minor units, base currency. Âm hoặc 0 sẽ bị loại. */
  amount: number
}

export interface SankeyInput {
  /** Tổng thu của kỳ (minor units, base). */
  income: number
  /** Thu theo danh mục. Tổng có thể nhỏ hơn `income` (khoản thu không gắn danh mục). */
  incomeSlices: readonly SankeySlice[]
  /** Tổng chi ĐÃ GỒM phần chưa ghi — tức `tongChiCoPhanChuaGhi(...)`. */
  expense: number
  /** Chi theo NHÓM (danh mục cha). Tổng phải bằng `expense - chuaGhi`. */
  expenseGroups: readonly SankeySlice[]
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
  /** Chiều cao vùng vẽ (đơn vị viewBox). */
  height?: number
  /** Chiều rộng vùng vẽ (đơn vị viewBox). */
  width?: number
}

export interface SankeyNode {
  id: string
  label: string
  value: number
  /** 0 nguồn vào · 1 tổng · 2 ba đường · 3 nhóm chi */
  col: number
  tone: SankeyTone
  x0: number
  x1: number
  y0: number
  y1: number
  /** Phần trăm trên tổng tiền vào. null khi tổng ≤ 0. */
  pct: number | null
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
const DEFAULT_H = 380
const DEFAULT_W = 720

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
  otherLabel = 'Khác',
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
    const label = node ? `${node.icon} ${node.name}`.trim() : 'Danh mục đã xoá'
    const cur = out.get(id)
    if (cur) cur.amount += s.amount
    else out.set(id, { id, label, amount: s.amount })
  }
  return [...out.values()].sort((a, b) => b.amount - a.amount)
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
  const H = opts.height ?? DEFAULT_H
  const W = opts.width ?? DEFAULT_W

  const income = Math.max(0, Math.round(input.income))
  const expense = Math.max(0, Math.round(input.expense))
  const transfer = Math.max(0, Math.round(input.transfer))
  const chuaGhi = Math.max(0, Math.round(input.chuaGhi))

  const kept = income - expense - transfer
  const deficit = kept < 0 ? -kept : 0
  const total = income + deficit
  if (total <= 0) return null

  // ---- cột 0: nguồn tiền vào ------------------------------------------------------
  const sources: Stack[] = capSlices(input.incomeSlices, maxNodes, 'Nguồn khác').map((s) => ({
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
      label: 'Chưa gắn danh mục',
      value: income - namedIncome,
      tone: 'in',
    })
  }
  if (deficit > 0) {
    sources.push({
      id: `in:${SANKEY_DEFICIT_ID}`,
      label: 'Rút từ số dư',
      value: deficit,
      tone: 'deficit',
    })
  }

  // ---- cột 2: ba đường ------------------------------------------------------------
  // Thứ tự CỐ ĐỊNH chi → chuyển → để lại, không sắp theo độ lớn: đây là ba hạng mục có
  // nghĩa riêng, đảo chỗ theo tháng thì không đọc được xu hướng qua nhiều tháng.
  const tiers: Stack[] = []
  if (expense > 0) tiers.push({ id: 'tier:expense', label: 'Chi tiêu', value: expense, tone: 'expense' })
  if (transfer > 0)
    tiers.push({ id: 'tier:transfer', label: 'Chuyển tài sản', value: transfer, tone: 'transfer' })
  if (kept > 0) tiers.push({ id: 'tier:kept', label: 'Phần để lại', value: kept, tone: 'kept' })

  // ---- cột 3: nhóm chi ------------------------------------------------------------
  const groups: Stack[] = capSlices(input.expenseGroups, maxGroupNodes, 'Nhóm khác').map((s) => ({
    id: `g:${s.id}`,
    label: s.label,
    value: s.amount,
    tone: 'expense' as const,
  }))
  const namedExpense = groups.reduce((s, x) => s + x.value, 0)
  const rest = expense - chuaGhi - namedExpense
  if (rest > 0) {
    groups.push({ id: 'g:khong-danh-muc', label: 'Chưa gắn danh mục', value: rest, tone: 'expense' })
  }
  // "Chưa ghi rõ" luôn ở CUỐI cột: nó không phải một nhóm chi, nó là phần ta không biết.
  // Đặt cuối để mắt đọc hết cái đã biết rồi mới tới cái chưa biết.
  if (chuaGhi > 0) {
    groups.push({
      id: `g:${SANKEY_CHUA_GHI_ID}`,
      label: 'Chưa ghi rõ',
      value: chuaGhi,
      tone: 'unknown',
    })
  }

  const hub: Stack[] = [{ id: SANKEY_HUB_ID, label: 'Tiền vào', value: total, tone: 'hub' }]
  const columns: Stack[][] = [sources, hub, tiers, groups]

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

  const colX = (c: number) => (c === 3 ? W - NODE_W : ((W - NODE_W) / 3) * c)
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

  return { nodes, links, width: W, height: H, total, hasDeficit: deficit > 0 }
}
