// Mốc lần xuất file sao lưu gần nhất — TRÊN MÁY NÀY.
//
// Vì sao localStorage chứ không phải một cột trong hồ sơ: file sao lưu được tải về ổ đĩa
// của đúng cái máy đang bấm. Ghi mốc lên máy chủ là nói "đã sao lưu" ở một máy chưa hề có
// file nào — và người đọc dòng đó sẽ tin là mình an toàn. Giới hạn "máy này" là sự thật,
// nên nó phải nằm cả trong chỗ lưu lẫn trong câu chữ hiện ra.
//
// Đọc/ghi trong hàm chứ không ở cấp module: import file này không được chạm localStorage
// (cùng quy ước với QuickSortStrip).

export const LAST_BACKUP_KEY = 'sct-last-backup'

/** Quá mốc này thì dòng trạng thái chuyển tông cảnh báo. */
export const BACKUP_STALE_DAYS = 30

/** Mốc ISO lần xuất gần nhất; null = chưa từng xuất trên máy này (hoặc đã xoá dữ liệu trình duyệt). */
export function readLastBackup(): string | null {
  try {
    const raw = localStorage.getItem(LAST_BACKUP_KEY)
    // Chuỗi rác (người dùng sửa tay, phiên bản cũ) coi như chưa có: một mốc không đọc
    // được mà vẫn hiện "sao lưu gần nhất: NaN ngày trước" còn tệ hơn là không hiện gì.
    return raw && !Number.isNaN(Date.parse(raw)) ? raw : null
  } catch {
    return null
  }
}

export function writeLastBackup(iso: string): void {
  try {
    localStorage.setItem(LAST_BACKUP_KEY, iso)
  } catch {
    // Riêng tư / hết chỗ → mất mốc, không mất bản sao lưu. Không cần báo gì.
  }
}
