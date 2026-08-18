// Gom báo cáo ngân sách thành danh sách hiển thị cho trang Ngân sách.
// Thuần, không phụ thuộc React, để unit-test được.
//
// Model "đặt ở cha trước":
//  - Cha có trần (budget đặt ở cha) → một NHÓM capped: trần chung, chi = cả nhóm.
//    Các con hiện breakdown; con có budget riêng là mốc theo dõi (marker).
//  - Cha chưa có trần nhưng con có budget (dữ liệu cũ) → NHÓM tổng-con (capped
//    false): trần = tổng các con, chi = tổng các con.
//  - Cha chưa có budget nào cả → vào danh sách "chưa đặt".
//  - Lá độc lập (không con): có budget → item leaf; chưa có → "chưa đặt".

import type { CategoryRow } from '../../types/database.types'
import { isFlowCategory } from '../categories/flowCategories'
import { isBudgetableCategory } from '../categories/kind'
import { statusOf, type BudgetLine, type BudgetReport, type BudgetStatus } from './progress'

export interface BudgetChildRow {
  cat: CategoryRow
  spent: number
  /** Mốc theo dõi của con (budget đặt riêng cho con); null nếu con chưa đặt. */
  marker: BudgetLine | null
}

export type BudgetDisplayItem =
  | { kind: 'leaf'; cat: CategoryRow; line: BudgetLine }
  | {
      kind: 'group'
      cat: CategoryRow
      /** true = trần đặt trực tiếp ở cha; false = trần suy ra từ tổng các con. */
      capped: boolean
      budgeted: number
      spent: number
      carried: number
      ratio: number
      status: BudgetStatus
      /** Tổng các mốc con đã đặt — nhóm capped dùng để cảnh báo khi vượt trần cha.
       *  Nhóm tổng-con (capped false) luôn 0 vì hạn mức con CHÍNH LÀ trần. */
      markerTotal: number
      children: BudgetChildRow[]
    }

export interface BudgetUnbudgetedGroup {
  cat: CategoryRow
  /** Các mục con (rỗng nếu là lá độc lập) — để đặt hạn mức thẳng cho con. */
  children: CategoryRow[]
}

export interface BudgetDisplay {
  /** Nhóm/lá đã có hạn mức, sắp theo ratio giảm dần. */
  items: BudgetDisplayItem[]
  /** Danh mục cha + lá độc lập chưa có hạn mức nào (để chào "đặt hạn mức"). */
  unbudgeted: BudgetUnbudgetedGroup[]
}

const ratioOf = (spent: number, budgeted: number) => (budgeted > 0 ? spent / budgeted : 0)

/**
 * `expenseCats` là danh mục chi chưa lưu trữ, đã sắp theo sort_order. `report`
 * cung cấp lines (mỗi budget một dòng, kèm cờ isMarker) và spentByCategory.
 *
 * Danh mục dòng chảy (Cho vay, Trả nợ, Điều chỉnh số dư — xem flowCategories)
 * bị loại ngay ở đây: chi tiêu của chúng không vào báo cáo nên hạn mức đặt vào
 * đó vĩnh viễn hiện 0. Lọc cả hạn mức cũ lỡ đặt trước khi có lần sửa này.
 */
export function buildBudgetDisplay(
  allExpenseCats: CategoryRow[],
  report: BudgetReport,
): BudgetDisplay {
  // Hai phép lọc, hai lý do khác nhau:
  //  · `isFlowCategory` (theo tên): Cho vay / Trả nợ / Điều chỉnh số dư — chi của chúng
  //    không vào báo cáo nên hạn mức đặt vào đó vĩnh viễn hiện 0.
  //  · `kind = 'transfer'` (cột 0046): chuyển tài sản. "Vượt trần gửi về VN ¥5,000" là
  //    một câu không nói được điều gì làm được — tiền vẫn của mình.
  const expenseCats = allExpenseCats.filter((c) => !isFlowCategory(c) && isBudgetableCategory(c))
  const lineOf = new Map(report.lines.map((l) => [l.categoryId, l]))
  const spentOf = (id: string) => report.spentByCategory.get(id) ?? 0
  const childrenOf = (id: string) => expenseCats.filter((c) => c.parent_id === id)

  const items: BudgetDisplayItem[] = []
  const unbudgeted: BudgetUnbudgetedGroup[] = []

  for (const c of expenseCats.filter((c) => !c.parent_id)) {
    const children = childrenOf(c.id)

    if (children.length === 0) {
      // Lá độc lập.
      const line = lineOf.get(c.id)
      if (line) items.push({ kind: 'leaf', cat: c, line })
      else unbudgeted.push({ cat: c, children: [] })
      continue
    }

    // Danh mục cha.
    const childRows: BudgetChildRow[] = children.map((k) => ({
      cat: k,
      spent: spentOf(k.id),
      marker: lineOf.get(k.id) ?? null,
    }))
    const capLine = lineOf.get(c.id)

    if (capLine) {
      // Trần đặt ở cha.
      items.push({
        kind: 'group',
        cat: c,
        capped: true,
        budgeted: capLine.budgeted,
        spent: capLine.spent,
        carried: capLine.carried,
        ratio: capLine.ratio,
        status: capLine.status,
        markerTotal: childRows.reduce((s, k) => s + (k.marker?.budgeted ?? 0), 0),
        children: childRows,
      })
      continue
    }

    // Cha chưa có trần: nếu có con nào được tính-vào-tổng (không marker) thì gộp
    // thành nhóm tổng-con (tương thích model cũ).
    const counted = children
      .map((k) => lineOf.get(k.id))
      .filter((l): l is BudgetLine => !!l && !l.isMarker)
    if (counted.length > 0) {
      const budgeted = counted.reduce((s, l) => s + l.budgeted, 0)
      const spent = counted.reduce((s, l) => s + l.spent, 0)
      const ratio = ratioOf(spent, budgeted)
      items.push({
        kind: 'group',
        cat: c,
        capped: false,
        budgeted,
        spent,
        carried: 0,
        ratio,
        status: statusOf(ratio),
        markerTotal: 0,
        children: childRows,
      })
    } else {
      unbudgeted.push({ cat: c, children })
    }
  }

  const ratioOfItem = (i: BudgetDisplayItem) => (i.kind === 'leaf' ? i.line.ratio : i.ratio)
  items.sort((a, b) => ratioOfItem(b) - ratioOfItem(a))
  return { items, unbudgeted }
}
