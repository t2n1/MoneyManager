// Đoán danh mục cho dòng CSV + soi dòng nghi nhập trùng. Thuần, không DOM.
//
// Sao kê thẻ chỉ có tên cửa hàng, không có danh mục. Ba nguồn đoán, xét theo thứ tự:
//   1. cột danh mục trong file (nếu file có)  → 'file'
//   2. lịch sử: đã từng ghi đúng tên cửa hàng này thì lấy lại danh mục cũ → 'history'
//   3. từ khoá nhận diện gắn trên danh mục ('ファミマ' → Ăn ngoài)        → 'keyword'
// Không nguồn nào khớp thì dùng danh mục mặc định người dùng chọn ở trang nhập.

import { normalizeText } from '../transactions/filter'
import type { TransactionType } from '../../types/database.types'

export type ImportType = Extract<TransactionType, 'expense' | 'income'>

/** Vì sao dòng này có danh mục đó — để bảng xem trước nói rõ cho người dùng. */
export type CategorySource = 'file' | 'history' | 'keyword' | 'fallback' | 'none'

/** Phần giao dịch cũ cần để học (TransactionRow thỏa type này). */
export interface HistoryTx {
  note: string
  type: TransactionType
  category_id: string | null
  occurred_on: string
}

// normalizeText bỏ dấu theo kiểu tiếng Việt, và với chữ Nhật nó bỏ luôn dấu kéo dài
// "ー" cùng dakuten ("ド" → "ト"). Không sao: hai bên so sánh đều đi qua cùng hàm này,
// nên "ファミリーマート" trong file vẫn khớp "ファミリーマート" trong lịch sử.
const noteKey = (type: ImportType, note: string) => `${type}|${normalizeText(note)}`

/**
 * Bảng tra "chiều|ghi chú" → danh mục đã dùng LẦN GẦN NHẤT cho ghi chú đó.
 *
 * Gần nhất chứ không phải hay dùng nhất: người dùng đổi danh mục cho một cửa hàng
 * là vì lần cũ chọn sai, nên lần mới phải thắng.
 */
export function buildNoteHistory(txs: HistoryTx[]): Map<string, string> {
  const best = new Map<string, { id: string; on: string }>()
  for (const t of txs) {
    if (t.type !== 'expense' && t.type !== 'income') continue
    if (!t.category_id) continue
    const note = t.note?.trim()
    if (!note) continue
    const k = noteKey(t.type, note)
    const cur = best.get(k)
    if (!cur || t.occurred_on >= cur.on) best.set(k, { id: t.category_id, on: t.occurred_on })
  }
  return new Map([...best].map(([k, v]) => [k, v.id]))
}

/** Danh mục kèm từ khoá nhận diện (CategoryRow thỏa type này). */
export interface KeywordCategory {
  id: string
  type: ImportType
  is_archived: boolean
  /** mỗi từ khoá là một chuỗi cần XUẤT HIỆN trong ghi chú; rỗng = không nhận diện */
  import_keywords?: string[] | null
}

/**
 * Danh mục có từ khoá xuất hiện trong ghi chú, cùng chiều Chi/Thu. So sau khi bỏ
 * dấu và hạ chữ thường, nên gõ "an ngoai" hay "Ăn Ngoài" đều khớp.
 *
 * Từ khoá DÀI nhất thắng: "ファミリーマート 渋谷" cụ thể hơn "ファミリーマート", và
 * người dùng đặt cả hai là vì muốn cái cụ thể ăn trước.
 */
export function matchKeyword(
  note: string,
  type: ImportType,
  categories: KeywordCategory[],
): string | null {
  const hay = normalizeText(note)
  if (hay === '') return null
  let found: { id: string; len: number } | null = null
  for (const c of categories) {
    if (c.is_archived || c.type !== type) continue
    for (const raw of c.import_keywords ?? []) {
      const kw = normalizeText(raw)
      if (kw === '' || !hay.includes(kw)) continue
      if (!found || kw.length > found.len) found = { id: c.id, len: kw.length }
    }
  }
  return found?.id ?? null
}

export interface GuessInput {
  note: string
  type: ImportType
  /** danh mục đọc từ cột trong file; null = file không có/không khớp */
  fromFile: string | null
  /** bảng tra từ `buildNoteHistory` */
  history?: Map<string, string>
  categories?: KeywordCategory[]
  /** danh mục mặc định theo chiều; null = người dùng chưa chọn */
  fallback: string | null
}

/** Chọn danh mục cho một dòng theo thứ tự file → lịch sử → từ khoá → mặc định. */
export function guessCategory(input: GuessInput): {
  category_id: string | null
  source: CategorySource
} {
  if (input.fromFile) return { category_id: input.fromFile, source: 'file' }
  const fromHistory = input.history?.get(noteKey(input.type, input.note))
  if (fromHistory) return { category_id: fromHistory, source: 'history' }
  const fromKeyword = matchKeyword(input.note, input.type, input.categories ?? [])
  if (fromKeyword) return { category_id: fromKeyword, source: 'keyword' }
  if (input.fallback) return { category_id: input.fallback, source: 'fallback' }
  return { category_id: null, source: 'none' }
}

// --- Nghi nhập trùng ---

/** Dòng CSV nghi là đã có trong sổ (ghi tay trước đó với tên khác). */
export interface DuplicateCandidate {
  /** dòng CSV bị nghi (theo `ImportItem.rowId`) */
  rowId: string
  matchedTxId: string
  /** ghi chú của giao dịch đã có, để người dùng tự nhận ra */
  matchedNote: string
}

export interface DuplicateItem {
  /** định danh theo dòng: hai dòng giống hệt nhau phải được kể riêng */
  rowId: string
  occurred_on: string
  amount: number
  type: ImportType
  note: string
}

export interface DuplicateExisting extends HistoryTx {
  id: string
  account_id: string
  amount: number
}

/**
 * Dòng CSV CÙNG NGÀY, CÙNG SỐ TIỀN, CÙNG CHIỀU với một giao dịch đã có trên chính
 * tài khoản đó nhưng GHI CHÚ KHÁC — gần như chắc chắn là khoản bạn đã ghi tay rồi,
 * chỉ khác cách gọi tên ("Cơm trưa" vs "ファミリーマート").
 *
 * Trùng giống hệt cả ghi chú thì trang nhập đã lọc thẳng, không cần cảnh báo.
 * Mỗi giao dịch cũ chỉ khớp một dòng CSV, để một lần ghi tay không làm cả ba dòng
 * cùng giá bị nghi oan.
 */
export function detectPossibleDuplicates(
  items: DuplicateItem[],
  existing: DuplicateExisting[],
  opts: { accountId: string },
): DuplicateCandidate[] {
  const pool = existing.filter(
    (t) => t.account_id === opts.accountId && (t.type === 'expense' || t.type === 'income'),
  )
  const used = new Set<string>()
  const out: DuplicateCandidate[] = []
  for (const it of items) {
    const hit = pool.find(
      (t) =>
        !used.has(t.id) &&
        t.type === it.type &&
        t.amount === it.amount &&
        t.occurred_on === it.occurred_on &&
        normalizeText(t.note ?? '') !== normalizeText(it.note),
    )
    if (!hit) continue
    used.add(hit.id)
    out.push({ rowId: it.rowId, matchedTxId: hit.id, matchedNote: hit.note ?? '' })
  }
  return out
}
