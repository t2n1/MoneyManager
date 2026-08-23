// Xếp danh sách hạn mức của mặt LẬP KẾ HOẠCH thành các khối theo trục — thuần, test được.
//
// Vì sao cần (B30): trần được ĐẶT theo trục (`axisProgress().lines[].target = income ×
// bps`), cảnh báo được VIẾT theo trục ("Trần nhóm Nhà ở đang ¥0"), nhưng danh sách hạn
// mức thì phẳng — 29 dòng cùng một trọng lượng, sắp giảm dần theo tiền. Người dùng phải
// tự cộng nhẩm 6 dòng để biết Thiết yếu còn bao nhiêu trước khi nâng một hạn mức, trong
// khi `axisProgress` đã tính đúng con số đó và đang hiện ở cột trái.
//
// Luật phân khối ở đây PHẢI trùng `axisSlices` từng đồng, và đó là ràng buộc quan trọng
// nhất của file: tiểu tổng của khối được in cạnh `trần trục` lấy từ `axisProgress`. Lệch
// một đồng là hai con số cạnh nhau đọc ra như lỗi tính — đúng cái bệnh B30.4 đang chữa.
// Nên khối của một dòng lấy theo `need_level` của CHÍNH danh mục mang hạn mức, không suy
// từ cha, không gộp lên cha.
//
// Hệ quả đã biết và cố ý: trần đặt ở danh mục CHA luôn rơi vào "Chưa phân loại", vì màn
// Phân loại nhanh chỉ hỏi danh mục lá (`canClassify = !hasChildren`) nên cha không bao
// giờ có `need_level`. Đó không phải lỗi của file này — `axisProgress` đã đếm nó vào
// `unclassified` từ trước, và sửa chỗ đó là đổi số của CẢ mặt theo dõi.

import type { CategoryRow } from '../../types/database.types'
import type { CategorySlice } from '../reports/aggregate'
import { AXIS_LABEL, type AxisKey, type AxisProgress } from './axisTargets'
import type { BudgetDisplayItem } from './budgetDisplay'
import type { CoverageGap } from './commitments'
import type { Suggestion } from './suggest'

export type PlanBlockKey = AxisKey | 'unclassified' | 'markers'

/**
 * Nhãn của khối. Ba trục lấy từ `AXIS_LABEL` — đây là lý do bảng đó tồn tại (đã từng có
 * 4 bản sao và chúng lệch thật: "Tiết kiệm" ở mặt theo dõi, "Để dành" ở mặt lập kế hoạch).
 */
export const PLAN_BLOCK_LABEL: Record<PlanBlockKey, string> = {
  ...AXIS_LABEL,
  unclassified: 'Chưa phân loại',
  markers: 'Mốc con',
}

/** Mốc con nằm BÊN TRONG một trần nhóm — hiện khi xổ dòng cha ra. */
export interface PlanMarkerRow {
  cat: CategoryRow
  limit: number
  suggestion: Suggestion | null
}

export interface PlanRow {
  cat: CategoryRow
  /** hạn mức đang đặt cho chính danh mục này (base minor) */
  limit: number
  /** true = trần đặt ở danh mục cha, phủ cả nhóm */
  groupCap: boolean
  /** số mục con đang hoạt động; 0 khi không phải trần nhóm */
  childCount: number
  /** mốc con bên trong trần nhóm này */
  markers: PlanMarkerRow[]
  suggestion: Suggestion | null
  /** cam kết ghi thẳng vào danh mục này */
  committed: number
  /** trần GOVERNING dòng này đang hụt bao nhiêu; 0 = không hụt */
  short: number
  /** tên trần cha — chỉ có ở khối "Mốc con" (dòng đứng riêng) */
  parentName: string | null
}

export interface PlanBlock {
  key: PlanBlockKey
  label: string
  /** dòng đủ to để đứng riêng */
  rows: PlanRow[]
  /** đuôi dài đã gấp lại (hạn mức dưới ngưỡng) */
  tail: PlanRow[]
  tailTotal: number
  /** tổng cả khối, gồm cả đuôi — bằng `actual` của dòng trục tương ứng */
  total: number
  /** trần trục quy ra tiền; null = khối không có trần nên KHÔNG vẽ thanh */
  target: number | null
  /** target − total; null khi không có trần */
  remaining: number | null
}

/**
 * Ngưỡng gấp đuôi dài (B34.2). Là số tiền TUYỆT ĐỐI, đơn vị `base minor` — cùng quy ước
 * với mọi ngưỡng tiền khác trong app, nên người dùng đổi mệnh giá (`¥` → `₫`) thì ngưỡng
 * đi theo `base`.
 *
 * Vì sao không phải phần trăm hay "10 dòng cuối": ca thật tháng 8/2026 có 12 dòng dưới
 * ¥1,000 chiếm ~40% chiều cao panel cho 1,4% số tiền. Cái đáng gấp là dòng KHÔNG ĐÁNG
 * ĐỌC, mà "không đáng đọc" ở đây là một con số tiền, không phải một thứ hạng.
 */
export const TAIL_LIMIT = 1000

export interface PlanGroupsInput {
  /** `buildBudgetDisplay()` dựng trên một báo cáo có `spent = 0` — xem `usePlanning`. */
  items: BudgetDisplayItem[]
  categories: CategoryRow[]
  suggestions: Map<string, Suggestion>
  /** cam kết theo danh mục (`CommitmentReport.byCategory`) */
  committedByCat: Map<string, number>
  gaps: CoverageGap[]
  /** cơ cấu theo KẾ HOẠCH — nguồn của `trần trục`; null khi chưa biết thu nhập */
  axis: AxisProgress | null
  /** mốc con từ `plannedSlices().markers` — để bắt được đứa không nằm trong nhóm nào đang hiện */
  markerSlices: CategorySlice[]
}

export interface PlanGroups {
  /** bốn khối theo THỨ TỰ CỐ ĐỊNH; khối rỗng đã bị loại */
  blocks: PlanBlock[]
  /** tổng mọi dòng in ra, GỒM mốc con — con số "29 dòng dưới đây cộng lại" của B30.4 */
  lineTotal: number
  /** lineTotal − allocated: phần mốc con không cộng vào kế hoạch */
  markerTotal: number
}

/** Thứ tự khối là CỐ ĐỊNH, không sắp theo tiền: nó là thứ tự người đọc học một lần. */
const ORDER: PlanBlockKey[] = ['essential', 'flexible', 'unclassified', 'markers']

const needKeyOf = (cat: CategoryRow): PlanBlockKey =>
  cat.need_level === 'essential' || cat.need_level === 'flexible'
    ? cat.need_level
    : 'unclassified'

/**
 * Bốn khối của cột hạn mức.
 *
 * KHÔNG có khối `Để dành` (B30.2): `axisSlices().savings` luôn rỗng theo thiết kế — để
 * dành = thu − tổng chi, không phải tổng của danh mục nào. Nó đã có thanh riêng ở cột
 * trái, và đẻ một khối rỗng ở đây là mời người dùng đi tìm danh mục để nhét vào.
 */
export function planGroups({
  items,
  categories,
  suggestions,
  committedByCat,
  gaps,
  axis,
  markerSlices,
}: PlanGroupsInput): PlanGroups {
  const byId = new Map(categories.map((c) => [c.id, c]))
  const gapOf = new Map(gaps.map((g) => [g.categoryId, g.short]))
  const parentOf = (id: string) => byId.get(id)?.parent_id ?? null

  /** Trần GOVERNING một danh mục đang hụt bao nhiêu — cam kết đã gộp lên cha (xem `coverageGaps`). */
  const shortOf = (id: string) => {
    const p = parentOf(id)
    return gapOf.get(id) ?? (p !== null ? (gapOf.get(p) ?? 0) : 0)
  }

  const row = (
    cat: CategoryRow,
    limit: number,
    extra: Partial<PlanRow> = {},
  ): PlanRow => ({
    cat,
    limit,
    groupCap: false,
    childCount: 0,
    markers: [],
    suggestion: suggestions.get(cat.id) ?? null,
    committed: committedByCat.get(cat.id) ?? 0,
    short: shortOf(cat.id),
    parentName: null,
    ...extra,
  })

  const all: PlanRow[] = []
  /** id đã có mặt ở đâu đó trên màn — để biết mốc con nào còn mồ côi. */
  const shown = new Set<string>()

  for (const item of items) {
    if (item.kind === 'leaf') {
      all.push(row(item.cat, item.line.budgeted))
      shown.add(item.cat.id)
      continue
    }

    if (item.capped) {
      // Trần đặt ở CHA — MỘT dòng, đúng thứ B30.6 gọi là chặn: `coverageGaps` đã gộp cam
      // kết lên cha và cảnh báo đã gọi tên "Trần nhóm Nhà ở", nên danh sách phải có dòng
      // mang cái tên đó. Bản trước lọc `!categories.some(k => k.parent_id === c.id)` nên
      // cảnh báo trỏ tới một thứ danh sách không biết là có.
      const markers = item.children
        .filter((k) => k.marker !== null)
        .map(
          (k): PlanMarkerRow => ({
            cat: k.cat,
            limit: k.marker!.budgeted,
            suggestion: suggestions.get(k.cat.id) ?? null,
          }),
        )
        .sort((a, b) => b.limit - a.limit || a.cat.sort_order - b.cat.sort_order)
      all.push(
        row(item.cat, item.budgeted, {
          groupCap: true,
          childCount: item.children.length,
          markers,
        }),
      )
      shown.add(item.cat.id)
      for (const m of markers) shown.add(m.cat.id)
      continue
    }

    // Nhóm TỔNG-CON (cha chưa có trần, các con tự có hạn mức): các con KHÔNG phải mốc con
    // — mỗi đứa là một ràng buộc riêng và `plannedSlices` đếm chúng riêng. Nên chúng vào
    // danh sách thành từng dòng, mỗi dòng theo `need_level` của chính nó. Gộp thành một
    // dòng cha ở đây là để tiểu tổng khối lệch với dòng trục, đúng cái lỗi file này chữa.
    for (const k of item.children) {
      if (!k.marker) continue
      all.push(row(k.cat, k.marker.budgeted))
      shown.add(k.cat.id)
    }
  }

  // Mốc con MỒ CÔI: cha của nó không hiện trong nhóm nào (danh mục cha bị lưu trữ, là
  // danh mục dòng chảy, hoặc `kind = 'transfer'` nên `buildBudgetDisplay` đã loại).
  // Trong dữ liệu bình thường rổ này rỗng, và khối tự ẩn — nhưng nếu nó có dòng thì đó
  // đúng là tiền đang không nằm trong khối nào, tức thứ phải nói ra.
  const orphans: PlanRow[] = []
  for (const s of markerSlices) {
    if (shown.has(s.categoryId)) continue
    const cat = byId.get(s.categoryId)
    if (!cat) continue
    const p = cat.parent_id ? byId.get(cat.parent_id) : null
    orphans.push(row(cat, s.amount, { parentName: p?.name ?? null }))
  }

  const markerTotal =
    all.reduce((t, r) => t + r.markers.reduce((s, m) => s + m.limit, 0), 0) +
    orphans.reduce((t, r) => t + r.limit, 0)

  const targetOf = (key: PlanBlockKey): number | null =>
    key === 'essential' || key === 'flexible'
      ? (axis?.lines.find((l) => l.key === key)?.target ?? null)
      : null

  const blocks: PlanBlock[] = []
  for (const key of ORDER) {
    const picked =
      key === 'markers' ? orphans : all.filter((r) => needKeyOf(r.cat) === key)
    if (picked.length === 0) continue

    // Trong mỗi khối: giảm dần theo HẠN MỨC, bằng nhau thì thứ tự Cài đặt.
    //
    // KHÔNG dùng `sortBudgetItems()` — ba chế độ của nó (`pace`/`money`/`manual`) đều
    // tính trên `spent`, mà tháng chưa bắt đầu thì `spent = 0` với mọi dòng, nên hai chế
    // độ đầu ra cùng một thứ tự tuỳ ý.
    picked.sort((a, b) => b.limit - a.limit || a.cat.sort_order - b.cat.sort_order)

    // Dòng trần nhóm KHÔNG bị gấp kể cả khi nhỏ: nó mang danh sách mốc con xổ ra được,
    // mà gấp nó lại là chôn luôn cả nhánh đó.
    const rows = picked.filter((r) => r.limit >= TAIL_LIMIT || r.groupCap)
    const tail = picked.filter((r) => r.limit < TAIL_LIMIT && !r.groupCap)
    const total = picked.reduce((s, r) => s + r.limit, 0)
    const target = targetOf(key)

    blocks.push({
      key,
      label: PLAN_BLOCK_LABEL[key],
      rows,
      tail,
      tailTotal: tail.reduce((s, r) => s + r.limit, 0),
      total,
      target,
      remaining: target !== null ? target - total : null,
    })
  }

  return {
    blocks,
    lineTotal: all.reduce((t, r) => t + r.limit, 0) + markerTotal,
    markerTotal,
  }
}
