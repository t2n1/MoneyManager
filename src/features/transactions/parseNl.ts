// Parser "nhập nhanh bằng lời" (GĐ 1 — luật thuần, không AI, chạy offline).
// Câu tiếng Việt/Nhật lẫn lộn → gợi ý loại/số tiền/danh mục/ngày để ĐIỀN SẴN form.
// KHÔNG tự lưu: form là bước xác nhận. Trường nào không chắc thì trả null (giữ nguyên).
import type { CategoryRow, TransactionType } from '../../types/database.types'
import type { CurrencyCode } from '../../lib/money'
import { CURRENCIES } from '../../lib/money'
import { addDaysISO } from '../../lib/dates'

export interface NlParseInput {
  text: string
  /** Danh mục đang hoạt động (cả thu lẫn chi) để khớp. */
  categories: Pick<CategoryRow, 'id' | 'name' | 'type' | 'parent_id'>[]
  /** Loại tiền của tài khoản đang chọn — quyết định số lẻ khi quy về minor units. */
  currency: CurrencyCode
  /** Hôm nay dạng 'YYYY-MM-DD' theo giờ địa phương. */
  todayISO: string
}

export interface NlParseResult {
  /** Loại suy ra từ danh mục/từ khóa; null = không chắc, giữ nguyên loại hiện tại. */
  type: TransactionType | null
  /** Số tiền ở minor units; null = không tìm thấy số. */
  amountMinor: number | null
  categoryId: string | null
  /** Ngày 'YYYY-MM-DD'; null = không nhắc tới ngày (giữ mặc định hôm nay). */
  dateISO: string | null
  /** Phần chữ còn lại sau khi bóc số tiền + ngày — gợi ý cho ô ghi chú. */
  note: string
  /** Tên danh mục đã khớp (để hiện phản hồi cho người dùng). */
  matchedCategoryName: string | null
}

/** Bỏ dấu tiếng Việt + đưa về chữ thường; đ→d. Giữ nguyên ký tự CJK (万/円…). */
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
}

// ——— Số tiền ———

const MULTIPLIER: Record<string, number> = {
  man: 1e4,
  van: 1e4,
  万: 1e4,
  k: 1e3,
  nghin: 1e3,
  ngan: 1e3,
  tr: 1e6,
  trieu: 1e6,
  cu: 1e6,
  củ: 1e6,
}
// Đơn vị chỉ đánh dấu "đây là tiền" (nhân 1) — giúp ưu tiên số đứng cạnh nó.
const CURRENCY_UNIT = new Set(['yen', 'yên', '円', '¥', 'dong', 'vnd', 'jpy', 'usd', '₫', 'd'])

/** Chuỗi số (có thể có dấu phân cách/thập phân) → số major theo `decimals`. */
function parseNumber(raw: string, decimals: number): number {
  if (decimals > 0) {
    const dec = raw.match(/[.,](\d{1,2})$/)
    if (dec) {
      const intPart = raw.slice(0, raw.length - dec[0].length).replace(/[.,]/g, '')
      return Number(intPart || '0') + Number(dec[1]) / 10 ** dec[1].length
    }
  }
  return Number(raw.replace(/[.,]/g, ''))
}

interface Span {
  start: number
  end: number
}

/** Tìm số tiền + vị trí trong chuỗi ĐÃ chuẩn hóa. Ưu tiên số đi kèm đơn vị. */
function extractAmount(
  normText: string,
  decimals: number,
): { minor: number; span: Span } | null {
  const re = /(\d[\d.,]*)\s*(万|円|¥|₫|man|van|nghin|ngan|trieu|tr|cu|củ|k|yen|yên|dong|vnd|jpy|usd)?/gi
  let firstPlain: { minor: number; span: Span } | null = null
  let match: RegExpExecArray | null
  while ((match = re.exec(normText)) !== null) {
    const [full, numRaw, unitRaw] = match
    if (!/\d/.test(numRaw)) continue
    const major = parseNumber(numRaw, decimals)
    if (!Number.isFinite(major) || major === 0) continue
    const unit = unitRaw ? unitRaw.toLowerCase() : ''
    const mult = MULTIPLIER[unit] ?? 1
    const minor = Math.round(major * mult * 10 ** decimals)
    const span = { start: match.index, end: match.index + full.trimEnd().length }
    if (unit && (MULTIPLIER[unit] || CURRENCY_UNIT.has(unit))) return { minor, span }
    if (!firstPlain) firstPlain = { minor, span }
  }
  return firstPlain
}

// ——— Ngày ———

const WEEKDAY: Record<string, number> = {
  'chu nhat': 0,
  cn: 0,
  'thu 2': 1,
  'thu hai': 1,
  'thu 3': 2,
  'thu ba': 2,
  'thu 4': 3,
  'thu tu': 3,
  'thu 5': 4,
  'thu nam': 4,
  'thu 6': 5,
  'thu sau': 5,
  'thu 7': 6,
  'thu bay': 6,
}

function utcDow(iso: string): number {
  return new Date(iso + 'T00:00:00Z').getUTCDay()
}

/** Tìm ngày trong chuỗi đã chuẩn hóa. Trả ISO + vị trí để bóc khỏi ghi chú. */
function extractDate(normText: string, todayISO: string): { iso: string; span: Span } | null {
  // 1) Ngày tường minh: 20/7, 20-7, 20/07/2026. Không nhận '.' làm dấu ngày —
  //    dễ đụng số thập phân (8.5 usd) và VN/Nhật hiếm khi viết ngày kiểu 20.7.
  const explicit = normText.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/)
  if (explicit) {
    const day = Number(explicit[1])
    const month = Number(explicit[2])
    let year = explicit[3] ? Number(explicit[3]) : Number(todayISO.slice(0, 4))
    if (year < 100) year += 2000
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const start = explicit.index ?? 0
      return { iso, span: { start, end: start + explicit[0].length } }
    }
  }

  // 2) Tương đối — kiểm tra cụm dài trước để "hom kia" không bị "hom qua" nuốt.
  const relatives: { re: RegExp; delta: number }[] = [
    { re: /\bhom kia\b|\bhkia\b/, delta: -2 },
    { re: /\bhom qua\b|\bhqua\b|\b(?:toi|dem|sang|trua|chieu) qua\b/, delta: -1 },
    { re: /\bhom nay\b|\bhnay\b|\b(?:sang|trua|chieu|toi) nay\b/, delta: 0 },
    { re: /\bngay mai\b|\bhom sau\b/, delta: 1 },
  ]
  for (const { re, delta } of relatives) {
    const m = normText.match(re)
    if (m) {
      const start = m.index ?? 0
      return { iso: addDaysISO(todayISO, delta), span: { start, end: start + m[0].length } }
    }
  }

  // 3) Thứ trong tuần → lần xuất hiện gần nhất trong quá khứ (gồm cả hôm nay).
  for (const [kw, targetDow] of Object.entries(WEEKDAY)) {
    const re = new RegExp(`\\b${kw.replace(/ /g, '\\s+')}\\b`)
    const m = normText.match(re)
    if (m) {
      const delta = ((utcDow(todayISO) - targetDow + 7) % 7) * -1
      const start = m.index ?? 0
      return { iso: addDaysISO(todayISO, delta), span: { start, end: start + m[0].length } }
    }
  }
  return null
}

// ——— Danh mục ———

// Từ khóa → mảnh tên danh mục (đã chuẩn hóa) để dò trong danh mục thực tế.
const SYNONYMS: { kw: string[]; frag: string }[] = [
  {
    kw: ['an', 'com', 'trua', 'sang', 'toi', 'banh', 'ca phe', 'cafe', 'tra sua', 'nha hang', 'quan', 'bento', 'ramen', 'sushi', 'lunch', 'gyu', 'nhau', 'do an', 'sieu thi', 'konbini'],
    frag: 'an uong',
  },
  {
    kw: ['taxi', 'tau', 'bus', 'xe', 'densha', 've', 'xang', 'grab', 'uber', 'shinkansen', 'di lai', 've thang', 'ic', 'suica', 'pasmo'],
    frag: 'di lai',
  },
  { kw: ['mua', 'shopping', 'quan ao', 'amazon', 'don', 'daiso', 'uniqlo'], frag: 'mua sam' },
  { kw: ['dien', 'nuoc', 'gas', 'wifi', 'mang', 'hoa don', 'bill', 'dien thoai', 'sim'], frag: 'hoa don' },
  { kw: ['tien nha', 'thue nha', 'rent', 'nha cua', 'yachin'], frag: 'nha cua' },
  { kw: ['thuoc', 'benh vien', 'kham', 'phong kham', 'suc khoe', 'nha khoa', 'byoin'], frag: 'suc khoe' },
  { kw: ['game', 'phim', 'netflix', 'karaoke', 'bia', 'giai tri', 'du lich'], frag: 'giai tri' },
  { kw: ['hoc', 'sach', 'khoa hoc', 'giao duc', 'gakko'], frag: 'giao duc' },
  { kw: ['qua', 'tang', 'tu thien', 'qua tang'], frag: 'qua tang' },
  { kw: ['luong', 'salary', 'kyuuryou', 'kyuryo'], frag: 'luong' },
  { kw: ['thuong', 'bonus'], frag: 'thuong' },
  { kw: ['dau tu', 'co tuc', 'lai'], frag: 'dau tu' },
]

const INCOME_KW = /\b(luong|thuong|thu nhap|nhan duoc|duoc tra|tien ve|hoan tien|ban duoc|salary|bonus|co tuc|dau tu)\b/

/** Cụm chữ nhiều tiếng có mặt nguyên vẹn, hoặc từ đơn khớp trọn từ. */
function containsPhrase(text: string, phrase: string): boolean {
  if (phrase.includes(' ')) return text.includes(phrase)
  return new RegExp(`\\b${phrase}\\b`).test(text)
}

function matchCategory(
  normText: string,
  categories: NlParseInput['categories'],
): { id: string; name: string; type: TransactionType } | null {
  // Con trước, cha sau — câu cụ thể ("cà phê") nên rơi vào danh mục con nếu có.
  const ordered = [...categories].sort((a, b) => (a.parent_id ? 0 : 1) - (b.parent_id ? 0 : 1))

  // 1) Khớp trực tiếp: tên đầy đủ, hoặc một từ đặc trưng (>=4 ký tự) của tên.
  for (const c of ordered) {
    const n = norm(c.name)
    if (n.length >= 3 && normText.includes(n)) return { id: c.id, name: c.name, type: c.type }
    const distinctive = n.split(/[^a-z0-9]+/).filter((w) => w.length >= 4)
    if (distinctive.some((w) => containsPhrase(normText, w)))
      return { id: c.id, name: c.name, type: c.type }
  }

  // 2) Từ đồng nghĩa → mảnh tên danh mục.
  for (const { kw, frag } of SYNONYMS) {
    if (!kw.some((k) => containsPhrase(normText, k))) continue
    const hit = ordered.find((c) => norm(c.name).includes(frag))
    if (hit) return { id: hit.id, name: hit.name, type: hit.type }
  }
  return null
}

/** Thay [start,end) bằng khoảng trắng, GIỮ NGUYÊN độ dài để chỉ số không lệch. */
function maskSpan(text: string, span: Span): string {
  return text.slice(0, span.start) + ' '.repeat(span.end - span.start) + text.slice(span.end)
}

/** Bóc các đoạn đã nhận diện khỏi text gốc → gợi ý ghi chú gọn. */
function buildNote(text: string, spans: Span[]): string {
  if (spans.length === 0) return text.trim()
  const sorted = [...spans].sort((a, b) => a.start - b.start)
  let out = ''
  let cursor = 0
  for (const s of sorted) {
    out += text.slice(cursor, s.start)
    cursor = Math.max(cursor, s.end)
  }
  out += text.slice(cursor)
  return out.replace(/\s+/g, ' ').trim()
}

/** Phân tích câu tự nhiên → gợi ý điền form. Không ném lỗi; câu rỗng → mọi trường null. */
export function parseNl(input: NlParseInput): NlParseResult {
  const { text, categories, currency, todayISO } = input
  const decimals = CURRENCIES[currency].decimals
  const normText = norm(text)

  const spans: Span[] = []

  const dateHit = extractDate(normText, todayISO)
  if (dateHit) spans.push(dateHit.span)

  // Che vùng ngày trước khi tách số — tránh đọc "20/7" thành số tiền 20.
  const amountText = dateHit ? maskSpan(normText, dateHit.span) : normText
  const amountHit = extractAmount(amountText, decimals)
  if (amountHit) spans.push(amountHit.span)

  // Khớp danh mục trên câu đã che ngày + số tiền — nếu không "hôm qua" lọt chữ
  // "qua" khớp nhầm danh mục "Quà", hay số tiền lẫn vào tên danh mục.
  let catText = normText
  if (dateHit) catText = maskSpan(catText, dateHit.span)
  if (amountHit) catText = maskSpan(catText, amountHit.span)
  const cat = matchCategory(catText, categories)

  const type: TransactionType | null = cat ? cat.type : INCOME_KW.test(normText) ? 'income' : null

  return {
    type,
    amountMinor: amountHit ? amountHit.minor : null,
    categoryId: cat ? cat.id : null,
    dateISO: dateHit ? dateHit.iso : null,
    note: buildNote(text, spans),
    matchedCategoryName: cat ? cat.name : null,
  }
}
