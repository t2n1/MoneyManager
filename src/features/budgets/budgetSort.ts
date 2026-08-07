// Sắp xếp danh sách hạn mức và chọn khối "Cần để ý".
// Thuần, không phụ thuộc React, để unit-test được.
//
// Vì sao không sắp theo phần trăm nữa (lối cũ): phần trăm không biết tiền to hay
// nhỏ, không biết hôm nay ngày mấy, và không phân biệt khoản đã trả xong với
// khoản còn đang tiêu. Ba chế độ dưới đây mỗi cái chữa một khía cạnh, người dùng
// tự chọn cái hợp với cách mình nhìn:
//  - 'pace'   nhịp tiêu = phần trăm đã dùng / phần tháng đã trôi. Ở tháng đã qua
//             (đã trôi trọn) nhịp rơi về đúng phần trăm, tức bằng lối cũ.
//  - 'money'  theo TIỀN: vượt nhiều nhất trước, rồi tới còn ít nhất. Mục trần to
//             không bị mục trần bé vượt vài đồng che mất.
//  - 'manual' đúng thứ tự trong Cài đặt — đứng yên cả tháng để nhớ được chỗ.

import type { BudgetDisplayItem } from './budgetDisplay'

export type BudgetSortMode = 'pace' | 'money' | 'manual'

/** Nhịp ≥ mức này (và đã tiêu quá nửa trần) thì gọi là "đang tiêu nhanh". */
const FAST_PACE = 1.2
/** Chưa tiêu quá nửa trần thì đầu tháng nhịp nào cũng vọt — không gọi, tránh kêu oan. */
const FAST_MIN_RATIO = 0.5
/** Chi cố định chiếm từng này phần chi của nhóm trở lên thì coi cả nhóm là cố định. */
const FIXED_SHARE = 0.8

export function budgetedOf(item: BudgetDisplayItem): number {
  return item.kind === 'leaf' ? item.line.budgeted : item.budgeted
}

export function spentOf(item: BudgetDisplayItem): number {
  return item.kind === 'leaf' ? item.line.spent : item.spent
}

export function ratioOf(item: BudgetDisplayItem): number {
  return item.kind === 'leaf' ? item.line.ratio : item.ratio
}

/** Tiền còn được tiêu; âm nghĩa là đã vượt đúng bằng chừng đó. */
export function remainingOf(item: BudgetDisplayItem): number {
  return budgetedOf(item) - spentOf(item)
}

/**
 * Nhịp tiêu: phần trăm đã dùng chia cho phần tháng đã trôi qua.
 * 1 = đúng nhịp, 2 = đang tiêu nhanh gấp đôi mức chia đều.
 * `monthProgress` ≤ 0 (chưa trôi ngày nào) thì trả thẳng ratio — không chia cho 0.
 */
export function paceOf(ratio: number, monthProgress: number): number {
  return monthProgress > 0 ? ratio / monthProgress : ratio
}

/**
 * Phần chi của item đến từ danh mục cost_type = 'fixed'.
 * Lá tự khai theo cost_type của chính nó. Nhóm thì cha thường chưa được phân
 * loại (màn Phân loại nhanh chỉ hỏi lá), nên đo bằng TIỀN: chi của các con cố
 * định trên tổng chi của nhóm. Chi ghi thẳng vào cha không thuộc con nào sẽ kéo
 * tỉ lệ xuống — nghiêng về "biến đổi", tức thà kêu nhầm còn hơn bỏ sót.
 */
export function fixedShareOf(item: BudgetDisplayItem): number {
  if (item.kind === 'leaf') return item.cat.cost_type === 'fixed' ? 1 : 0
  const spent = item.spent
  if (spent <= 0) return 0
  const fixed = item.children.reduce(
    (s, k) => s + (k.cat.cost_type === 'fixed' ? k.spent : 0),
    0,
  )
  return fixed / spent
}

/** Khoản đã trả xong một lần trong tháng (tiền nhà, bảo hiểm…) — không còn gì để phanh. */
const isFixed = (item: BudgetDisplayItem) => fixedShareOf(item) >= FIXED_SHARE

/** Điểm để sắp xếp, càng lớn càng lên đầu. */
function scoreOf(item: BudgetDisplayItem, mode: BudgetSortMode, monthProgress: number): number {
  if (mode === 'manual') return -item.cat.sort_order
  if (mode === 'money') return -remainingOf(item)
  return paceOf(ratioOf(item), monthProgress)
}

/**
 * Trả về MẢNG MỚI đã sắp. Bằng điểm thì rơi về thứ tự Cài đặt (sort_order) —
 * không dựa vào thứ tự đầu vào, để đầu tháng mọi mục cùng 0% vẫn ra một thứ tự
 * ổn định và đoán được.
 */
export function sortBudgetItems(
  items: BudgetDisplayItem[],
  mode: BudgetSortMode,
  monthProgress: number,
): BudgetDisplayItem[] {
  return [...items].sort((a, b) => {
    const d = scoreOf(b, mode, monthProgress) - scoreOf(a, mode, monthProgress)
    return d !== 0 ? d : a.cat.sort_order - b.cat.sort_order
  })
}

export interface AttentionItem {
  item: BudgetDisplayItem
  /** 'over' = đã quá trần; 'fast' = chưa quá nhưng đang tiêu nhanh hơn nhịp tháng. */
  reason: 'over' | 'fast'
  pace: number
  /** Tiền đã vượt trần (0 nếu chưa vượt). */
  over: number
}

/**
 * Những mục đáng ghim lên đầu. Hai lý do, cố tình hẹp để khối này còn nghĩa:
 *  - vượt trần: luôn tính, kể cả chi cố định (đặt trần sai thì vẫn phải biết).
 *  - tiêu nhanh: chỉ cho khoản BIẾN ĐỔI — tiền nhà trả ngày 1 lúc nào nhịp cũng
 *    vọt trần, ghim lên chỉ tổ chiếm chỗ vì chẳng còn gì để làm với nó.
 * Xếp: vượt trước (vượt nhiều tiền lên trên), rồi tới tiêu nhanh (nhịp cao trước).
 */
export function pickAttention(
  items: BudgetDisplayItem[],
  monthProgress: number,
): AttentionItem[] {
  const picked: AttentionItem[] = []
  for (const item of items) {
    const ratio = ratioOf(item)
    const pace = paceOf(ratio, monthProgress)
    const over = Math.max(0, spentOf(item) - budgetedOf(item))
    if (ratio >= 1) picked.push({ item, reason: 'over', pace, over })
    else if (ratio >= FAST_MIN_RATIO && pace >= FAST_PACE && !isFixed(item)) {
      picked.push({ item, reason: 'fast', pace, over: 0 })
    }
  }
  return picked.sort((a, b) => {
    if (a.reason !== b.reason) return a.reason === 'over' ? -1 : 1
    const d = a.reason === 'over' ? b.over - a.over : b.pace - a.pace
    return d !== 0 ? d : a.item.cat.sort_order - b.item.cat.sort_order
  })
}
