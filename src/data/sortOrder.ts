/**
 * Áp một thứ tự mới lên mảng đã cache, ghi luôn `sort_order` = chỉ số — đúng con số
 * mà repo sẽ ghi xuống DB (`supabaseRepo.reorderAccounts` và hai hàm anh em của nó
 * đều dùng chỉ số 0-based).
 *
 * Dùng để cập nhật cache TRƯỚC khi gọi máy chủ. Không có bước đó thì thả tay xong
 * danh sách nhảy về thứ tự cũ, đợi máy chủ trả lời rồi mới nhảy sang thứ tự mới —
 * chớp hai lần mỗi lần kéo.
 *
 * Chỉ sắp lại mảng khi `ordered` phủ hết mọi dòng: thiếu dòng nào thì dòng đó giữ
 * `sort_order` cũ, mà sắp chung hai thang số khác nhau sẽ trộn lẫn vị trí. Trường hợp
 * thiếu thì chỉ ghi lại số, để nơi hiển thị tự sắp như trước.
 */
export function applyOrder<T extends { sort_order: number }>(
  rows: readonly T[],
  ordered: readonly string[],
  keyOf: (row: T) => string,
): T[] {
  const rank = new Map(ordered.map((k, i) => [k, i]))
  const next = rows.map((r) => {
    const i = rank.get(keyOf(r))
    return i === undefined ? r : { ...r, sort_order: i }
  })
  if (next.every((r) => rank.has(keyOf(r)))) next.sort((a, b) => a.sort_order - b.sort_order)
  return next
}
