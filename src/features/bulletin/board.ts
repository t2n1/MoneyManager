// Bảng module của Bản tin — phần THUẦN: trang nào có module nào, module nằm ở ô nào của
// lưới, và cách đọc/ghi tất cả những thứ đó vào localStorage.
//
// Không có JSX ở đây (BulletinBoard.tsx lo phần vẽ, BulletinPage.tsx lo phần tính số). Tách
// ra để mọi phép biến đổi bố cục — thêm, xoá, đặt lại, sửa bản lưu hỏng — thử được bằng
// unit test, vì repo không render component trong test.
//
// Bố cục lưu THEO TỪNG BREAKPOINT (lg/md/sm) — đúng mô hình của react-grid-layout: kéo ở
// điện thoại không được làm xô lệch bố cục đã xếp công phu ở máy tính. Breakpoint nào
// chưa từng được sửa thì không có mục trong `layouts`, và lưới tự sinh nó từ breakpoint
// lớn hơn gần nhất.
//
// Lưu ở localStorage (theo máy), không phải hồ sơ: bố cục gắn với cỡ màn hình, và điện
// thoại với máy tính vốn đã có bố cục khác nhau.
import { tr } from '../../i18n'

// ---- Lưới ----------------------------------------------------------------------------

export type Bp = 'lg' | 'md' | 'sm'
export const BPS: readonly Bp[] = ['lg', 'md', 'sm']

/**
 * Ngưỡng theo bề rộng KHUNG CHỨA lưới (không phải cửa sổ): rail bên trái ăn 56–160px nên
 * đo theo cửa sổ là lệch. 1000px ≈ cửa sổ 1280px có rail — đúng chỗ bố cục cũ tách hai cột.
 */
export const BREAKPOINTS: Record<Bp, number> = { lg: 1000, md: 640, sm: 0 }
export const COLS: Record<Bp, number> = { lg: 12, md: 6, sm: 1 }

/**
 * Một hàng lưới = 2px, khe = 10px (bằng `gap-2.5` của trang cũ) → mỗi nấc chiều cao 12px.
 * Nấc nhỏ để module tự-đo-chiều-cao khớp gần sát nội dung (hụt tối đa 11px) và kéo giãn
 * theo chiều dọc mượt thay vì nhảy từng khúc lớn.
 */
export const ROW_H = 2
export const GAP = 10

/** Số hàng lưới cần để chứa `px` điểm ảnh. */
export function rowsFor(px: number): number {
  return Math.max(1, Math.ceil((px + GAP) / (ROW_H + GAP)))
}

/** Chiều cao điểm ảnh của `rows` hàng lưới (khe giữa các hàng tính cả vào). */
export function pxFor(rows: number): number {
  return rows * ROW_H + Math.max(0, rows - 1) * GAP
}

/** Bề ngang khai theo lưới 12 cột → bề ngang ở lưới `cols` cột. */
export function scaleW(wLg: number, cols: number): number {
  if (cols === COLS.lg) return Math.min(wLg, cols)
  return Math.min(cols, Math.max(1, Math.round((wLg * cols) / COLS.lg)))
}

// ---- Danh mục module -----------------------------------------------------------------

export type ModuleType =
  | 'today'
  | 'kpi'
  | 'spending'
  | 'recent'
  | 'todo'
  | 'budget'
  | 'drift'
  | 'accounts'
  | 'quyenloi'
  | 'reliability'
  | 'cashflow'
  | 'categories'
  | 'networth'
  | 'cumulative'
  | 'assetMix'
  | 'upcoming'
  | 'debts'
  | 'goals'
  | 'remittance'
  | 'cardImport'

export interface ModuleView {
  id: string
  label: string
}

export interface ModuleDef {
  type: ModuleType
  title: string
  desc: string
  /**
   * `auto` = cao đúng bằng nội dung (panel chữ, danh sách — cắt bớt là mất thông tin);
   * `fill` = người dùng kéo giãn chiều cao, biểu đồ nở theo khung.
   */
  fit: 'auto' | 'fill'
  /** Bề ngang mặc định, theo lưới 12 cột. */
  w: number
  /** Bề ngang tối thiểu, theo lưới 12 cột. */
  minW: number
  /** `fill`: chiều cao mặc định. `auto`: ước lượng trước khi đo được thật. */
  px: number
  /** Nhiều cách xem — phần tử đầu là mặc định. Không có = một cách xem. */
  views?: ModuleView[]
  /** Chỉ một bản mỗi trang: hai khối Việc cần làm cạnh nhau chỉ là lặp lại. */
  single: boolean
}

const V = (id: string, label: string): ModuleView => ({ id, label })

// Thứ tự ở đây là thứ tự trong bảng "Thêm module": các khối quen thuộc trước, biểu đồ sau.
export const MODULES: readonly ModuleDef[] = [
  { type: 'today', title: tr('Hôm nay'), desc: tr('Tới ngày lương còn bao nhiêu, mỗi ngày được tiêu bao nhiêu, và câu kết luận tháng.'), fit: 'auto', w: 8, minW: 4, px: 180, single: true },
  { type: 'kpi', title: tr('Bốn ô số'), desc: tr('Thu, chi, giữ lại và tài sản ròng của tháng đang xem.'), fit: 'auto', w: 8, minW: 4, px: 130, single: true },
  { type: 'spending', title: tr('Chi tiêu'), desc: tr('Dải tám tháng và chi từng ngày của tháng đang chọn.'), fit: 'auto', w: 8, minW: 6, px: 520, single: true },
  { type: 'recent', title: tr('Giao dịch gần đây'), desc: tr('Sáu khoản mới ghi nhất của tháng đang xem.'), fit: 'auto', w: 8, minW: 3, px: 380, single: true },
  { type: 'todo', title: tr('Việc cần làm'), desc: tr('Những việc app thấy bạn nên làm ngay.'), fit: 'auto', w: 4, minW: 3, px: 260, single: true },
  { type: 'budget', title: tr('Ngân sách'), desc: tr('Tháng này đã tiêu bao nhiêu so với hạn mức.'), fit: 'auto', w: 4, minW: 3, px: 300, single: true },
  { type: 'drift', title: tr('Thu nhập & nếp chi'), desc: tr('Thu nhập và các khoản cố định đang trôi đi đâu qua nhiều tháng.'), fit: 'auto', w: 4, minW: 3, px: 200, single: true },
  { type: 'accounts', title: tr('Tài khoản'), desc: tr('Tài sản ròng và số dư từng tài khoản.'), fit: 'auto', w: 4, minW: 3, px: 340, single: true },
  { type: 'quyenloi', title: tr('Quyền lợi'), desc: tr('Tình trạng các khoản quyền lợi năm nay.'), fit: 'auto', w: 4, minW: 3, px: 140, single: true },
  { type: 'reliability', title: tr('Độ tin cậy dữ liệu'), desc: tr('Con số trên màn này đáng tin tới đâu.'), fit: 'auto', w: 4, minW: 3, px: 200, single: true },
  { type: 'upcoming', title: tr('Sắp tới phải chi'), desc: tr('Khoản định kỳ và khoản sắp chi trong 30 ngày tới, theo ngày.'), fit: 'auto', w: 4, minW: 3, px: 260, single: true },
  {
    type: 'debts',
    title: tr('Nợ / cho vay'),
    desc: tr('Còn nợ ai bao nhiêu, ai còn nợ mình, đã trả được bao nhiêu phần.'),
    fit: 'auto', w: 4, minW: 3, px: 240, single: true,
    views: [V('list', tr('Danh sách')), V('summary', tr('Tổng'))],
  },
  { type: 'cardImport', title: tr('Nhập sao kê thẻ'), desc: tr('Thả file CSV sao kê thẻ tín dụng vào là sang thẳng trang nhập; xem mỗi thẻ đã ghi tới ngày nào.'), fit: 'auto', w: 4, minW: 3, px: 260, single: true },
  { type: 'goals', title: tr('Mục tiêu tiết kiệm'), desc: tr('Tiến độ từng mục tiêu và tháng dự kiến đạt theo đà hiện tại.'), fit: 'auto', w: 4, minW: 3, px: 220, single: true },
  {
    type: 'remittance',
    title: tr('Gửi tiền về nhà'),
    desc: tr('Số tiền gửi về mỗi tháng trong 12 tháng qua, và tổng năm nay.'),
    fit: 'fill', w: 6, minW: 3, px: 260, single: true,
    views: [V('bars', tr('Cột theo tháng')), V('summary', tr('Tổng năm'))],
  },
  {
    type: 'cashflow',
    title: tr('Thu & chi theo tháng'),
    desc: tr('Tám tháng gần nhất: thu, chi, chênh lệch và tỷ lệ giữ lại.'),
    fit: 'fill', w: 6, minW: 3, px: 300, single: false,
    views: [V('bars', tr('Cột')), V('line', tr('Đường')), V('area', tr('Vùng')), V('net', tr('Chênh lệch')), V('rate', tr('Tỷ lệ giữ lại'))],
  },
  {
    type: 'categories',
    title: tr('Chi theo danh mục'),
    desc: tr('Tiền tháng này đi vào đâu, gộp theo danh mục cha.'),
    fit: 'fill', w: 6, minW: 3, px: 300, single: false,
    views: [V('donut', tr('Vành khuyên')), V('bars', tr('Thanh ngang')), V('list', tr('Danh sách'))],
  },
  {
    type: 'cumulative',
    title: tr('Chi luỹ kế trong tháng'),
    desc: tr('Tổng chi cộng dồn từng ngày, đặt cạnh hạn mức cả tháng.'),
    fit: 'fill', w: 6, minW: 3, px: 280, single: false,
    views: [V('area', tr('Vùng')), V('line', tr('Đường')), V('bars', tr('Cột từng ngày'))],
  },
  {
    type: 'networth',
    title: tr('Tài sản ròng qua các tháng'),
    desc: tr('Các lần chụp tài sản ròng gần nhất.'),
    fit: 'fill', w: 6, minW: 3, px: 280, single: false,
    views: [V('area', tr('Vùng')), V('line', tr('Đường')), V('bars', tr('Cột'))],
  },
  {
    type: 'assetMix',
    title: tr('Cơ cấu tài sản'),
    desc: tr('Tài sản đang nằm ở những nhóm nào, bao nhiêu phần trăm.'),
    fit: 'fill', w: 6, minW: 3, px: 280, single: false,
    views: [V('donut', tr('Vành khuyên')), V('bars', tr('Thanh ngang'))],
  },
]

const DEF_BY_TYPE = new Map(MODULES.map((m) => [m.type, m]))

export function moduleDef(type: ModuleType): ModuleDef {
  const d = DEF_BY_TYPE.get(type)
  if (!d) throw new Error(`unknown module ${type}`)
  return d
}

/** Cách xem đang dùng — rơi về mặc định khi bản lưu nói một cách xem không còn tồn tại. */
export function viewOf(m: BoardModule): string {
  const views = moduleDef(m.type).views
  if (!views) return ''
  return views.some((v) => v.id === m.view) ? m.view! : views[0].id
}

// ---- Trạng thái ----------------------------------------------------------------------

export interface Cell {
  i: string
  x: number
  y: number
  w: number
  h: number
}

export interface BoardModule {
  id: string
  type: ModuleType
  view?: string
}

/** Trang dựng sẵn — "Khôi phục mặc định" biết dựng lại về đâu. `null` = trang tự lập. */
export type Preset = 'overview' | 'trends' | 'spend'

export interface BoardPage {
  id: string
  /** `null` = trang dựng sẵn chưa đổi tên: in tên theo ngôn ngữ đang chọn, không đóng băng lúc tạo. */
  name: string | null
  preset: Preset | null
  modules: BoardModule[]
  layouts: Partial<Record<Bp, Cell[]>>
}

export interface BoardState {
  v: 1
  pages: BoardPage[]
  activeId: string
}

export const PRESET_NAMES: Record<Preset, string> = {
  overview: tr('Tổng quan'),
  trends: tr('Xu hướng'),
  spend: tr('Chi tiêu'),
}

export function pageName(p: BoardPage): string {
  if (p.name) return p.name
  return p.preset ? PRESET_NAMES[p.preset] : tr('Trang mới')
}

export type IdGen = () => string

export const randomId: IdGen = () => Math.random().toString(36).slice(2, 10)

// ---- Xếp chỗ -------------------------------------------------------------------------

const collide = (a: Cell, b: Cell) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

const bottomOf = (cells: Cell[]) => cells.reduce((m, c) => Math.max(m, c.y + c.h), 0)

/**
 * Chỗ trống ĐẦU TIÊN (trên xuống, trái sang) vừa một ô `w × h`. Không có chỗ nào thì
 * xuống đáy. Module mới vì thế lấp vào khoảng trống cạnh một biểu đồ nửa bề ngang thay vì
 * luôn rơi xuống tận cuối trang.
 */
export function firstFit(cells: Cell[], w: number, h: number, cols: number): { x: number; y: number } {
  const ww = Math.min(w, cols)
  const bottom = bottomOf(cells)
  for (let y = 0; y <= bottom; y++) {
    for (let x = 0; x + ww <= cols; x++) {
      const probe = { i: '', x, y, w: ww, h }
      if (!cells.some((c) => collide(c, probe))) return { x, y }
    }
  }
  return { x: 0, y: bottom }
}

function cellFor(m: BoardModule, cells: Cell[], bp: Bp): Cell {
  const d = moduleDef(m.type)
  const cols = COLS[bp]
  const w = scaleW(d.w, cols)
  const h = rowsFor(d.px)
  return { i: m.id, w, h, ...firstFit(cells, w, h, cols) }
}

/** Xếp chồng theo thứ tự, hai cột (trái `leftW`) hoặc một cột. */
function stack(mods: BoardModule[], bp: Bp, left: ModuleType[]): Cell[] {
  const cols = COLS[bp]
  const out: Cell[] = []
  if (cols < COLS.lg) {
    let y = 0
    for (const m of mods) {
      const h = rowsFor(moduleDef(m.type).px)
      out.push({ i: m.id, x: 0, y, w: cols, h })
      y += h
    }
    return out
  }
  const ys = [0, 0]
  for (const m of mods) {
    const d = moduleDef(m.type)
    const col = left.includes(m.type) ? 0 : 1
    const h = rowsFor(d.px)
    out.push({ i: m.id, x: col === 0 ? 0 : 8, y: ys[col], w: col === 0 ? 8 : 4, h })
    ys[col] += h
  }
  return out
}

/** Breakpoint của một bề rộng khung chứa. */
export function bpFor(width: number): Bp {
  return width >= BREAKPOINTS.lg ? 'lg' : width >= BREAKPOINTS.md ? 'md' : 'sm'
}

/**
 * Bố cục cho một breakpoint CHƯA từng được sửa: lấy bố cục lg, đi theo thứ tự đọc (trên
 * xuống, trái sang), co bề ngang theo số cột rồi thả từng ô xuống chỗ thấp nhất còn trống
 * trong dải cột của nó. Thứ tự đọc được giữ — ở một cột, module trên-trái của máy tính
 * vẫn đứng đầu điện thoại.
 */
export function deriveCells(src: readonly Cell[], bp: Bp): Cell[] {
  const cols = COLS[bp]
  const sorted = [...src].sort((a, b) => a.y - b.y || a.x - b.x)
  const out: Cell[] = []
  for (const c of sorted) {
    const w = scaleW(c.w, cols)
    const x = Math.min(cols - w, Math.round((c.x * cols) / COLS.lg))
    const y = out.filter((o) => o.x < x + w && x < o.x + o.w).reduce((m, o) => Math.max(m, o.y + o.h), 0)
    out.push({ i: c.i, x, y, w, h: c.h })
  }
  return out
}

export function layoutFor(page: BoardPage, bp: Bp): Cell[] {
  return page.layouts[bp] ?? deriveCells(page.layouts.lg ?? [], bp)
}

// ---- Trang dựng sẵn ------------------------------------------------------------------

/**
 * Tổng quan = đúng bố cục Bản tin trước khi có lưới: cột chính (Hôm nay → Bốn ô → Chi
 * tiêu → Giao dịch gần đây), cột phụ (Việc cần làm → Ngân sách → Nếp chi → Tài khoản →
 * Quyền lợi → Độ tin cậy). Dưới lg xếp một cột, Việc cần làm lên ĐẦU — như bản cũ.
 */
const OVERVIEW_ORDER: ModuleType[] = [
  'todo', 'today', 'kpi', 'spending', 'recent', 'budget', 'drift', 'accounts', 'quyenloi', 'reliability',
]
const OVERVIEW_LEFT: ModuleType[] = ['today', 'kpi', 'spending', 'recent']

function presetModules(preset: Preset): { types: ModuleType[]; views?: Partial<Record<number, string>> } {
  switch (preset) {
    case 'overview':
      return { types: OVERVIEW_ORDER }
    case 'trends':
      return { types: ['cashflow', 'categories', 'cashflow', 'networth', 'assetMix', 'cumulative'], views: { 2: 'rate' } }
    case 'spend':
      return { types: ['cumulative', 'categories', 'budget', 'categories', 'recent'], views: { 3: 'list' } }
  }
}

function presetLayouts(preset: Preset, mods: BoardModule[]): Partial<Record<Bp, Cell[]>> {
  if (preset === 'overview') {
    return {
      lg: stack(mods, 'lg', OVERVIEW_LEFT),
      md: stack(mods, 'md', OVERVIEW_LEFT),
      sm: stack(mods, 'sm', OVERVIEW_LEFT),
    }
  }
  // Trang biểu đồ: xếp lần lượt vào chỗ trống đầu tiên → lưới hai cột nửa-nửa ở lg.
  const out: Partial<Record<Bp, Cell[]>> = {}
  for (const bp of BPS) {
    const cells: Cell[] = []
    for (const m of mods) cells.push(cellFor(m, cells, bp))
    out[bp] = cells
  }
  return out
}

export function presetPage(preset: Preset, id: string, gen: IdGen = randomId): BoardPage {
  const { types, views } = presetModules(preset)
  const modules: BoardModule[] = types.map((type, i) => ({
    id: `${type}-${gen()}`,
    type,
    ...(views?.[i] ? { view: views[i] } : {}),
  }))
  return { id, name: null, preset, modules, layouts: presetLayouts(preset, modules) }
}

export function defaultBoard(gen: IdGen = randomId): BoardState {
  const page = presetPage('overview', 'overview', gen)
  return { v: 1, pages: [page], activeId: page.id }
}

// ---- Biến đổi (mọi hàm trả bản MỚI, không sửa tại chỗ) --------------------------------

/**
 * Đưa một trang về trạng thái nhất quán: module trùng id / loại lạ bị bỏ, `single` giữ
 * bản đầu, ô không còn module bị bỏ, module chưa có ô thì được xếp chỗ, ô tràn cột bị kẹp.
 * Gọi sau MỌI lần đọc bản lưu — localStorage là thứ ai cũng sửa tay được.
 */
export function normalizePage(page: BoardPage): BoardPage {
  const seen = new Set<string>()
  const singles = new Set<ModuleType>()
  const modules: BoardModule[] = []
  for (const m of page.modules) {
    const d = DEF_BY_TYPE.get(m.type)
    if (!d || seen.has(m.id)) continue
    if (d.single && singles.has(m.type)) continue
    seen.add(m.id)
    if (d.single) singles.add(m.type)
    modules.push(m)
  }
  const layouts: Partial<Record<Bp, Cell[]>> = {}
  for (const bp of BPS) {
    const src = page.layouts[bp]
    // Breakpoint chưa từng sửa để TRỐNG — lưới tự sinh từ breakpoint lớn hơn. Riêng lg
    // luôn phải có: nó là gốc để sinh hai cái kia.
    if (!src && bp !== 'lg') continue
    const cols = COLS[bp]
    const cells: Cell[] = []
    for (const c of src ?? []) {
      if (!seen.has(c.i) || cells.some((k) => k.i === c.i)) continue
      const w = Math.min(Math.max(1, Math.round(c.w)), cols)
      cells.push({
        i: c.i,
        w,
        h: Math.max(1, Math.round(c.h)),
        x: Math.min(Math.max(0, Math.round(c.x)), cols - w),
        y: Math.max(0, Math.round(c.y)),
      })
    }
    for (const m of modules) if (!cells.some((c) => c.i === m.id)) cells.push(cellFor(m, cells, bp))
    layouts[bp] = cells
  }
  return { ...page, modules, layouts }
}

const mapPage = (s: BoardState, id: string, f: (p: BoardPage) => BoardPage): BoardState => ({
  ...s,
  pages: s.pages.map((p) => (p.id === id ? f(p) : p)),
})

export function canAdd(page: BoardPage, type: ModuleType): boolean {
  return !moduleDef(type).single || !page.modules.some((m) => m.type === type)
}

export function addModule(s: BoardState, pageId: string, type: ModuleType, gen: IdGen = randomId): BoardState {
  return mapPage(s, pageId, (p) => {
    if (!canAdd(p, type)) return p
    const m: BoardModule = { id: `${type}-${gen()}`, type }
    const layouts: Partial<Record<Bp, Cell[]>> = {}
    for (const bp of BPS) {
      const cells = p.layouts[bp]
      if (cells) layouts[bp] = [...cells, cellFor(m, cells, bp)]
    }
    return { ...p, modules: [...p.modules, m], layouts }
  })
}

export function removeModule(s: BoardState, pageId: string, moduleId: string): BoardState {
  return mapPage(s, pageId, (p) => {
    const layouts: Partial<Record<Bp, Cell[]>> = {}
    for (const bp of BPS) {
      const cells = p.layouts[bp]
      if (cells) layouts[bp] = cells.filter((c) => c.i !== moduleId)
    }
    return { ...p, modules: p.modules.filter((m) => m.id !== moduleId), layouts }
  })
}

export function setView(s: BoardState, pageId: string, moduleId: string, view: string): BoardState {
  return mapPage(s, pageId, (p) => ({
    ...p,
    modules: p.modules.map((m) => (m.id === moduleId ? { ...m, view } : m)),
  }))
}

/** Ghi bố cục của MỘT breakpoint sau khi người dùng kéo/giãn xong. */
export function setLayout(s: BoardState, pageId: string, bp: Bp, cells: readonly Cell[]): BoardState {
  return mapPage(s, pageId, (p) =>
    normalizePage({
      ...p,
      layouts: { ...p.layouts, [bp]: cells.map(({ i, x, y, w, h }) => ({ i, x, y, w, h })) },
    }),
  )
}

export function addPage(
  s: BoardState,
  opts: { name: string | null; preset: Preset | null },
  gen: IdGen = randomId,
): BoardState {
  const id = `p-${gen()}`
  const page: BoardPage = opts.preset
    ? { ...presetPage(opts.preset, id, gen), name: opts.name }
    : { id, name: opts.name, preset: null, modules: [], layouts: { lg: [] } }
  return { ...s, pages: [...s.pages, page], activeId: id }
}

export function renamePage(s: BoardState, pageId: string, name: string): BoardState {
  const t = name.trim()
  return mapPage(s, pageId, (p) => ({ ...p, name: t || null }))
}

/** Xoá một trang. Trang cuối cùng thì không xoá — Bản tin không được trống trơn. */
export function removePage(s: BoardState, pageId: string): BoardState {
  if (s.pages.length <= 1) return s
  const i = s.pages.findIndex((p) => p.id === pageId)
  if (i < 0) return s
  const pages = s.pages.filter((p) => p.id !== pageId)
  const activeId = s.activeId === pageId ? pages[Math.max(0, i - 1)].id : s.activeId
  return { ...s, pages, activeId }
}

/** Dựng lại trang dựng sẵn về bố cục gốc. Trang tự lập thì chỉ xếp lại chỗ, giữ module. */
export function resetPage(s: BoardState, pageId: string, gen: IdGen = randomId): BoardState {
  return mapPage(s, pageId, (p) => {
    if (p.preset) return { ...presetPage(p.preset, p.id, gen), name: p.name }
    return normalizePage({ ...p, layouts: { lg: [] } })
  })
}

export function setActive(s: BoardState, pageId: string): BoardState {
  return s.pages.some((p) => p.id === pageId) ? { ...s, activeId: pageId } : s
}

// ---- Đọc / ghi bản lưu ---------------------------------------------------------------

export const STORAGE_KEY = 'bulletin-board-v1'

const TYPES = new Set<string>(MODULES.map((m) => m.type))
const PRESETS = new Set<string>(['overview', 'trends', 'spend'])

// Kiểm dạng bằng tay chứ không qua zod: zod chỉ có ở phía server (src/mcp), kéo nó vào
// bundle trình duyệt cho đúng một chỗ đọc bản lưu là thêm ~150 kB vào trang chủ.
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

function readCells(v: unknown): Cell[] | undefined | null {
  if (v === undefined) return undefined
  if (!Array.isArray(v)) return null
  const out: Cell[] = []
  for (const c of v) {
    if (!isObj(c) || typeof c.i !== 'string' || !isNum(c.x) || !isNum(c.y) || !isNum(c.w) || !isNum(c.h)) return null
    out.push({ i: c.i, x: c.x, y: c.y, w: c.w, h: c.h })
  }
  return out
}

function readPage(v: unknown): BoardPage | null {
  if (!isObj(v) || typeof v.id !== 'string' || !Array.isArray(v.modules) || !isObj(v.layouts)) return null
  const name = v.name === null || typeof v.name === 'string' ? v.name : undefined
  const preset = v.preset === null || (typeof v.preset === 'string' && PRESETS.has(v.preset)) ? v.preset : undefined
  if (name === undefined || preset === undefined) return null
  const modules: BoardModule[] = []
  for (const m of v.modules) {
    if (!isObj(m) || typeof m.id !== 'string' || typeof m.type !== 'string') return null
    // Loại module lạ (bản lưu của một phiên bản mới hơn) thì bỏ QUA module đó, không vứt
    // cả bản lưu.
    if (!TYPES.has(m.type)) continue
    modules.push({ id: m.id, type: m.type as ModuleType, ...(typeof m.view === 'string' ? { view: m.view } : {}) })
  }
  const layouts: Partial<Record<Bp, Cell[]>> = {}
  for (const bp of BPS) {
    const cells = readCells(v.layouts[bp])
    if (cells === null) return null
    if (cells) layouts[bp] = cells
  }
  return { id: v.id, name, preset: preset as Preset | null, modules, layouts }
}

/**
 * Bản lưu → trạng thái. Hỏng, trống, hay sai dạng thì về bảng mặc định: thà mất bố cục đã
 * xếp còn hơn một Bản tin trắng trơn không mở được.
 */
export function loadBoard(raw: string | null, gen: IdGen = randomId): BoardState {
  if (!raw) return defaultBoard(gen)
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return defaultBoard(gen)
  }
  if (!isObj(parsed) || parsed.v !== 1 || typeof parsed.activeId !== 'string' || !Array.isArray(parsed.pages)) {
    return defaultBoard(gen)
  }
  const pages: BoardPage[] = []
  const ids = new Set<string>()
  for (const item of parsed.pages) {
    const p = readPage(item)
    if (!p) return defaultBoard(gen)
    if (ids.has(p.id)) continue
    ids.add(p.id)
    pages.push(normalizePage(p))
  }
  if (pages.length === 0) return defaultBoard(gen)
  const activeId = ids.has(parsed.activeId) ? parsed.activeId : pages[0].id
  return { v: 1, pages, activeId }
}

export function readBoard(): BoardState {
  try {
    return loadBoard(localStorage.getItem(STORAGE_KEY))
  } catch {
    return defaultBoard()
  }
}

export function writeBoard(s: BoardState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
  } catch {
    // Hết chỗ / chế độ riêng tư: bố cục vẫn chạy trong phiên này, chỉ không nhớ lần sau.
  }
}
