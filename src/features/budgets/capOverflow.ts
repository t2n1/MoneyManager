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
 * Gọi tên tối đa `max` phần tử rồi đếm phần còn lại — MỘT luật cho mọi câu "gồm những
 * gì" của trang Ngân sách.
 *
 * Tách ra khỏi `capOverflowNotice` khi khối "Cần bạn quyết" (B31.1) cần đúng luật này
 * để gọi tên các khoản cam kết ("Claude Pro · Google One · Bitwarden"). Lý do y nguyên
 * lý do ghi ở đầu file: in một con số mà không nói nó ở đâu ra thì người dùng đọc như
 * app tự bịa. Viết bản thứ hai thì hai câu trên cùng một màn sẽ cắt ở hai chỗ khác nhau.
 */
export function nameList(names: string[], max = MAX_NAMED): string {
  const shown = names.slice(0, max)
  const rest = names.length - shown.length
  return `${shown.join(' · ')}${rest > 0 ? ` · …và ${rest} mục nữa` : ''}`
}

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

  const list = nameList(named.map((k) => `${k.cat.name} ${money(k.marker!.budgeted)}`))
  return `Mốc các mục con cộng lại ${money(item.markerTotal)} (${list}), vượt trần nhóm ${cap}.`
}
