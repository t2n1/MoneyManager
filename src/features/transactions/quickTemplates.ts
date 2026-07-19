// Mẫu giao dịch nhanh (mục J): lưu các giao dịch hay dùng để nhập 1 chạm.
// Chỉ localStorage (thiết bị này) — nhẹ, không cần bảng/đồng bộ. Store ngoài React
// theo mẫu privacy.ts/undoToast.ts để mọi màn cùng thấy khi thêm/xóa.
import { useSyncExternalStore } from 'react'
import type { TransactionType } from '../../types/database.types'

const KEY = 'sct-quick-templates'
const MAX_TEMPLATES = 12

export interface QuickTemplate {
  id: string
  /** Nhãn hiển thị trên chip (vd "Ăn trưa", "Vé tàu"). */
  label: string
  type: TransactionType
  /** Số tiền ở minor units theo tiền tệ của tài khoản đã lưu. */
  amountMinor: number
  categoryId: string | null
  accountId: string | null
  note: string
}

function readInitial(): QuickTemplate[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? (arr as QuickTemplate[]) : []
  } catch {
    return []
  }
}

let templates = readInitial()
const listeners = new Set<() => void>()

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(templates))
  } catch {
    // bỏ qua nếu localStorage không khả dụng
  }
  for (const l of listeners) l()
}

/** id đơn giản, không cần crypto (dữ liệu cục bộ, không đồng bộ). */
function newId(): string {
  return 't' + Date.now().toString(36) + templates.length.toString(36)
}

export function getQuickTemplates(): QuickTemplate[] {
  return templates
}

/** Thêm mẫu mới lên đầu danh sách; cắt bớt nếu vượt trần. Trả về mẫu đã tạo. */
export function addQuickTemplate(t: Omit<QuickTemplate, 'id'>): QuickTemplate {
  const row: QuickTemplate = { ...t, id: newId() }
  templates = [row, ...templates].slice(0, MAX_TEMPLATES)
  persist()
  return row
}

export function deleteQuickTemplate(id: string) {
  templates = templates.filter((t) => t.id !== id)
  persist()
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

/** Hook React: danh sách mẫu, tự re-render khi thêm/xóa. */
export function useQuickTemplates(): QuickTemplate[] {
  return useSyncExternalStore(subscribe, getQuickTemplates, getQuickTemplates)
}
