// Bộ lọc đã lưu của trang Tìm kiếm — thuần, không React, để unit-test được.
//
// VÌ SAO CÓ FILE NÀY: trang Tìm kiếm đã lọc được tám mặt (chữ, loại, khoảng ngày, danh
// mục, tài khoản, nhãn, chưa phân loại, khoảng tiền). Cái thiếu là ĐẶT TÊN cho một tổ
// hợp đã dựng. Câu "chi tiền mặt trên ¥5.000 ba tháng qua" phải dựng lại từ đầu mỗi lần
// muốn xem — sáu thao tác, và sai một ô là ra một câu hỏi khác.
//
// LƯU Ở localStorage, không ở DB: đây là thói quen xem của MỘT người trên MỘT máy, không
// phải dữ liệu tài chính. Đưa lên DB thì phải có migration, phải vào bản sao lưu, phải
// vào cả `exportTables` — cái giá đó không đổi lấy được gì, vì mất bộ lọc đã lưu không
// mất một đồng nào.
//
// PHIÊN BẢN trong khoá: thêm một mặt lọc mới ở tương lai làm bản cũ thiếu trường, mà một
// bộ lọc đọc ra sai còn tệ hơn không có bộ lọc nào — nó trả về một danh sách trông hợp lý
// nhưng trả lời câu hỏi khác.

export const SAVED_FILTERS_KEY = 'sct-saved-filters-v1'

/** Đúng những gì trang Tìm kiếm giữ trong state. Toàn giá trị nguyên thuỷ để JSON hoá. */
export interface SavedFilterState {
  text: string
  type: string
  from: string
  to: string
  categoryIds: string[]
  accountIds: string[]
  tagIds: string[]
  uncategorized: boolean
  amountMin: string
  amountMax: string
}

export interface SavedFilter {
  id: string
  name: string
  state: SavedFilterState
}

/** Tối đa; thêm nữa thì danh sách chọn dài hơn việc tự dựng lại bộ lọc. */
export const MAX_SAVED = 12

const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'string')

/**
 * Đọc và LỌC BỎ mọi bản ghi méo.
 *
 * Không tin localStorage: nó là chuỗi người dùng (hoặc một bản app cũ) ghi vào, và một
 * `categoryIds` là `null` thay vì mảng sẽ nổ ở giữa lượt vẽ danh sách kết quả.
 */
export function parseSavedFilters(raw: string | null): SavedFilter[] {
  if (!raw) return []
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(data)) return []
  const out: SavedFilter[] = []
  for (const item of data) {
    if (typeof item !== 'object' || item === null) continue
    const f = item as Record<string, unknown>
    const s = f.state as Record<string, unknown> | undefined
    if (typeof f.id !== 'string' || typeof f.name !== 'string' || !s) continue
    if (
      typeof s.text !== 'string' ||
      typeof s.type !== 'string' ||
      typeof s.from !== 'string' ||
      typeof s.to !== 'string' ||
      typeof s.uncategorized !== 'boolean' ||
      typeof s.amountMin !== 'string' ||
      typeof s.amountMax !== 'string' ||
      !isStringArray(s.categoryIds) ||
      !isStringArray(s.accountIds) ||
      !isStringArray(s.tagIds)
    ) {
      continue
    }
    out.push({ id: f.id, name: f.name, state: s as unknown as SavedFilterState })
  }
  return out.slice(0, MAX_SAVED)
}

/**
 * Thêm hoặc GHI ĐÈ theo tên.
 *
 * Ghi đè chứ không thêm bản thứ hai cùng tên: hai dòng "Tiền mặt lớn" trong danh sách
 * chọn thì không dòng nào còn nghĩa. Tên so sau khi cắt khoảng trắng và không phân biệt
 * hoa thường — người ta gõ lại tên cũ để SỬA, không phải để nhân đôi.
 */
export function upsertSavedFilter(
  list: readonly SavedFilter[],
  name: string,
  state: SavedFilterState,
  newId: string,
): SavedFilter[] {
  const ten = name.trim()
  if (ten === '') return [...list]
  const chuanHoa = (s: string) => s.trim().toLocaleLowerCase('vi')
  const i = list.findIndex((f) => chuanHoa(f.name) === chuanHoa(ten))
  if (i >= 0) {
    const next = [...list]
    next[i] = { ...next[i], name: ten, state }
    return next
  }
  // Mới nhất lên ĐẦU, và cắt ở trần — cắt ở đuôi nên cái vừa lưu không bao giờ bị rơi.
  return [{ id: newId, name: ten, state }, ...list].slice(0, MAX_SAVED)
}

export function removeSavedFilter(
  list: readonly SavedFilter[],
  id: string,
): SavedFilter[] {
  return list.filter((f) => f.id !== id)
}

/** Bộ lọc có đang ở trạng thái mặc định không — không có gì để lưu thì đừng mời lưu. */
export function isEmptyFilter(s: SavedFilterState): boolean {
  return (
    s.text.trim() === '' &&
    s.type === 'all' &&
    s.categoryIds.length === 0 &&
    s.accountIds.length === 0 &&
    s.tagIds.length === 0 &&
    !s.uncategorized &&
    s.amountMin === '' &&
    s.amountMax === ''
  )
}
