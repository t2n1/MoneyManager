import type { NewPlannedExpense } from '../../data/repo'
import type { CurrencyCode } from '../../lib/money'
import type { DuePrecision } from '../../types/database.types'

/** Neo về ngày 1. Kiểu 'month' đòi `due_on` là ngày 1 — ép ở client để không nhận
 *  lỗi Postgres từ một ô người dùng không thấy. */
export function firstOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`
}

export interface PlannedDraft {
  title: string
  /** 0 = chưa biết bao nhiêu. */
  amount: number
  currency: CurrencyCode
  dueOn: string
  precision: DuePrecision
  remind: boolean
  /** chuỗi người dùng gõ; ép về 0–99 lúc dựng payload. */
  remindDays: string
  categoryId: string | null
  note: string
  tagIds: string[]
}

export function initialPlannedDraft(currency: CurrencyCode): PlannedDraft {
  return {
    title: '',
    amount: 0,
    currency,
    dueOn: '',
    precision: 'day',
    // Mặc định của form thật: BẬT nhắc, 0 ngày. (`planned?.remind_days_before !== null`
    // với `planned = null` cho ra `true`.)
    remind: true,
    remindDays: '0',
    categoryId: null,
    note: '',
    tagIds: [],
  }
}

/** `remind_days_before` chỉ nhận 0–99 (ràng buộc DB). */
function clampDays(raw: string): number {
  const n = Number(raw)
  if (!Number.isFinite(n)) return 0
  return Math.min(99, Math.max(0, Math.round(n)))
}

export function plannedFromEntry(d: PlannedDraft): NewPlannedExpense {
  return {
    title: d.title.trim(),
    amount: d.amount,
    currency: d.currency,
    // Neo lần thứ HAI ở đây, dù ô ngày đã neo lúc onChange: đổi "Đúng ngày" →
    // "Khoảng tháng" SAU khi đã chọn ngày 17 thì state còn nguyên ngày 17.
    due_on: d.precision === 'month' ? firstOfMonth(d.dueOn) : d.dueOn,
    due_precision: d.precision,
    // null = chỉ nằm trong danh sách cho nhớ, KHÔNG kêu. 0 = kêu đúng ngày đến hạn.
    // Hai thứ khác nhau — "sửa nhà tháng 10" khác "đóng phí vệ sinh 20/8".
    remind_days_before: d.remind ? clampDays(d.remindDays) : null,
    category_id: d.categoryId,
    note: d.note.trim(),
    tag_ids: d.tagIds,
  }
}

/** Điều kiện lưu: CHỈ CẦN có tên. Số tiền, danh mục, ghi chú đều để trống được. */
export function plannedMissing(d: PlannedDraft): string | null {
  return d.title.trim() ? null : 'Còn thiếu: chi cái gì.'
}
