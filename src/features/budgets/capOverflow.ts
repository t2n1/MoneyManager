// Câu nhắc khi mốc các mục con cộng lại vượt trần nhóm — thuần, test được.
//
// Vì sao phải GỌI TÊN mục con, không chỉ in tổng: ca thật tháng 8/2026 — nhóm "Ngoại
// hình" trần ¥1.800, ba mục con, chỉ một đứa (Cắt tóc) có mốc ¥2.400. Câu cũ in đúng
// một con số 2.400 và không nói nó ở đâu ra; ba mục con thì không ai biết đứa nào mang
// số đó, mà con số duy nhất nhìn thấy trên dòng Cắt tóc lại là "đã chi ¥1.800". Kết quả
// người dùng đọc câu cảnh báo như app tự bịa số.
import type { BudgetGroupItem } from './budgetDisplay'

/** Số mục con được gọi tên trong câu; phần còn lại đếm ra thành chữ, không cắt im lặng. */
const MAX_NAMED = 3

/**
 * Câu nhắc cho một nhóm, hoặc `null` khi không có gì phải nhắc.
 *
 * `null` cho nhóm tổng-con (`capped` false): ở đó hạn mức con CHÍNH LÀ trần nhóm nên
 * "cộng lại vượt trần" là một câu tự mâu thuẫn.
 */
export function capOverflowNotice(
  item: BudgetGroupItem,
  money: (v: number) => string,
): string | null {
  if (!item.capped || item.budgeted <= 0) return null
  if (item.markerTotal <= item.budgeted) return null

  const named = item.children
    .filter((k) => k.marker !== null)
    .sort((a, b) => b.marker!.budgeted - a.marker!.budgeted)
  if (named.length === 0) return null

  const cap = money(item.budgeted)
  if (named.length === 1) {
    return `${named[0].cat.name} đặt mốc ${money(named[0].marker!.budgeted)}, vượt trần nhóm ${cap}.`
  }

  const shown = named.slice(0, MAX_NAMED)
  const rest = named.length - shown.length
  const list = shown.map((k) => `${k.cat.name} ${money(k.marker!.budgeted)}`).join(' · ')
  const tail = rest > 0 ? ` · …và ${rest} mục nữa` : ''
  return `Mốc các mục con cộng lại ${money(item.markerTotal)} (${list}${tail}), vượt trần nhóm ${cap}.`
}
