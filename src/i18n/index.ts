// Ngôn ngữ giao diện: Tiếng Việt (gốc) / English.
//
// Khoá dịch CHÍNH LÀ câu tiếng Việt: `tr('Lưu')`, `tr('còn {n} ngày', { n })`. Chế độ Việt
// không tra từ điển nào — trả lại đúng câu gốc (sau khi thế biến), nên mọi test đang so
// chữ tiếng Việt vẫn đúng nguyên. Chế độ Anh tra `dict`; câu nào chưa dịch thì rơi về
// tiếng Việt chứ không hiện khoá rỗng.
//
// Ngôn ngữ CHỐT cho cả phiên trang: đổi trong Cài đặt là tải lại trang (setLang). Nhờ đó
// `tr()` gọi được ở bất cứ đâu — hằng số cấp module, hàm thuần trong file `.ts`, không cần
// hook — mà không bao giờ có nửa trang Việt nửa trang Anh.
//
// File này KHÔNG import React và không import từ điển: nó bị gói vào bundle của edge
// function (Deno) qua các file luật trong src/. Từ điển nạp riêng ở ./load.ts, chỉ phía
// trình duyệt, chỉ khi chọn English.

export type Lang = 'vi' | 'en'

/** Bản dịch: một câu, hoặc hai dạng số ít/số nhiều chọn theo biến `n`. */
export type Translation = string | { one: string; other: string }
export type Dict = Record<string, Translation>

const STORAGE_KEY = 'sct-lang'

function readLang(): Lang {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) === 'en' ? 'en' : 'vi'
  } catch {
    return 'vi'
  }
}

const lang: Lang = readLang()
let dict: Dict = {}

export function getLang(): Lang {
  return lang
}

/** Locale cho Intl / toLocaleString theo ngôn ngữ đang chọn. */
export function numLocale(): string {
  return lang === 'en' ? 'en-US' : 'vi-VN'
}

/** Đổi ngôn ngữ = lưu rồi tải lại trang (xem đầu file vì sao). */
export function setLang(next: Lang) {
  if (next === lang) return
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    return
  }
  location.reload()
}

/** Chỉ ./load.ts (và test) gọi. */
export function setDictionary(next: Dict) {
  dict = next
}

export type Vars = Record<string, string | number>

function fill(template: string, vars?: Vars): string {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m))
}

/** Chọn chuỗi đích (chưa thế biến) cho khoá `vi`. */
export function pick(vi: string, vars?: Record<string, unknown>): string {
  if (lang === 'vi') return vi
  const hit = dict[vi]
  if (hit === undefined) return vi
  if (typeof hit === 'string') return hit
  return vars?.n === 1 ? hit.one : hit.other
}

/**
 * Dịch một câu giao diện. `vi` phải là CHUỖI LITERAL (tests/i18n.test.ts quét nguồn để bảo
 * đảm mọi khoá đều có bản tiếng Anh). Biến viết `{ten}` và truyền qua `vars`.
 */
export function tr(vi: string, vars?: Vars): string {
  return fill(pick(vi, vars), vars)
}
