import type { CurrencyCode } from '../../lib/money'

/**
 * Một khoản đã lưu trong LƯỢT NHẬP hiện tại (không phải một trang ghi lâu dài) —
 * chỉ đủ để bày một dòng "Vừa ghi": tên, biểu tượng, số tiền, đơn vị tiền. Sống
 * trong `useState` của EntryPage, mất khi rời màn — không có DB nào để lưu việc này.
 */
export interface SavedEntry {
  id: string
  label: string
  icon: string
  amount: number
  currency: CurrencyCode
}

/** Số khoản còn giữ trong danh sách "Vừa ghi" trên màn hình — không phải số đã ghi. */
export const SAVED_LIST_CAP = 5

/**
 * Chèn khoản mới nhất lên ĐẦU (người dùng vừa ghi xong muốn thấy nó trước, không
 * phải cuộn tới cuối) rồi cắt ở 5 — một ngày ghi 8, 10 khoản không được để danh sách
 * đẩy tràn màn 410px vốn đã tràn sẵn 27px.
 */
export function addSaved(list: SavedEntry[], entry: SavedEntry): SavedEntry[] {
  return [entry, ...list].slice(0, SAVED_LIST_CAP)
}

/** Hoàn tác rút đúng khoản đó ra; id không có trong danh sách thì không đổi gì. */
export function removeSaved(list: SavedEntry[], id: string): SavedEntry[] {
  return list.filter((x) => x.id !== id)
}

/**
 * Nhãn đếm cạnh tiêu đề — nhận `total` RIÊNG với danh sách vì danh sách bị cắt ở 5
 * còn số đếm thì không: ghi khoản thứ 6 xong màn vẫn phải nói "6 khoản lượt này",
 * không phải "5" (độ dài mảng sau khi cắt). Chưa ghi gì thì trả `null` — không có
 * "0 khoản lượt này" bay ra cạnh tiêu đề khi mới mở màn.
 */
export function countLabel(list: SavedEntry[], total: number = list.length): string | null {
  if (total <= 0) return null
  return `${total} khoản lượt này`
}
