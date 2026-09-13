// Đọc một file sao kê 楽天e-NAVI (enavi{YYYYMM}({đuôi thẻ}).csv) thành HOÁ ĐƠN một kỳ.
//
// Ba điều khác PayPay, đo trên 28 file thật (2025-08 → 2026-09):
//   · Cột đổi TÊN theo tháng ("7月支払金額" → "8月支払金額") và số cột là 10, 11 hoặc 12
//     tuỳ file ⇒ tra theo tên, KHÔNG theo vị trí.
//   · Có dòng phụ không ngày (chi tiết tuyến đường của ETC) ⇒ bỏ.
//   · Không có cột ngày trả ⇒ tháng hoá đơn lấy từ tên cột, năm suy từ ngày quẹt muộn
//     nhất; tên file chỉ dùng kiểm chéo.
//
// Số hoá đơn = Σ cột "N月支払金額". Kiểm bằng PDF Visa 2026-07: ご請求金額 880円 = Σ cột
// đó của enavi202607(2565). Với trả góp, cột này là NỬA của tháng — đúng số Rakuten đòi.
//
// Thuần, không phụ thuộc React.

import { parseCsvText } from '../import/csvImport'
import { cardBillingRange } from './cardMonthCharge'
import {
  sourceFromFileName,
  sourceLabelFor,
  type LineKind,
  type ParsedStatement,
  type StatementLine,
} from './statementLine'

const nfkc = (s: string) => String(s ?? '').replace(/^﻿/, '').normalize('NFKC').trim()
const num = (s: string) => Number(String(s ?? '').replace(/[,\s]/g, '')) || 0
const toISO = (s: string): string | null => {
  const m = String(s ?? '').match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/)
  if (!m) return null
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
}

/**
 * Hai cột bắt buộc để nhận là enavi. So KHỚP TUYỆT ĐỐI (không phải includes): cột
 * ngày của PayPay tên `利用日/キャンセル日`, không bằng `利用日` ⇒ đã đủ để không nhận
 * nhầm, khỏi cần `新規サイン` — cột này có ở header 10/11 cột nhưng vắng mặt ở bản
 * 12 cột (enavi202609 trở đi, thêm `支払月` / `N月以降請求額` thay chỗ).
 */
const REQUIRED = ['利用日', '利用店名・商品名']
/** Cột hoá đơn: DUY NHẤT một cột khớp mẫu này trong header. */
const BILLED_COL = /^(\d{1,2})月支払金額$/
/** `分割2回払い(2回目)` → 2. Không khớp → 1 (trả một lần, hoặc `(1回目)`). */
const installmentNo = (how: string): number => {
  const m = nfkc(how).match(/\((\d+)回目\)/)
  return m ? Number(m[1]) : 1
}

const kindOf = (name: string, how: string): LineKind => {
  if (installmentNo(how) > 1) return 'installment-later'
  const n = nfkc(name).replace(/\s+/g, '')
  if (n.includes('楽天キャッシュチャージ')) return 'topup'
  if (n.includes('楽天証券')) return 'investment'
  return 'purchase'
}

/**
 * `null` khi: không phải enavi, không có dòng nào có số, hoặc thẻ chưa khai đủ ngày
 * chốt + ngày trả.
 */
export function parseRakutenStatement(
  text: string,
  card: { statementDay: number | null; paymentDueDay: number | null },
  fileName = '',
): ParsedStatement | null {
  const rows = parseCsvText(text)
  const header = rows[0]
  if (!header) return null
  const cols = header.map(nfkc)
  if (!REQUIRED.every((n) => cols.includes(n))) return null
  const iBilled = cols.findIndex((c) => BILLED_COL.test(c))
  if (iBilled < 0) return null
  const iDate = cols.indexOf('利用日')
  const iName = cols.indexOf('利用店名・商品名')
  const iHow = cols.indexOf('支払方法')
  const iUse = cols.indexOf('利用金額')
  const billMonth = Number(cols[iBilled].match(BILLED_COL)![1])

  // Dòng có ngày VÀ có số ở cột hoá đơn. Dòng phụ ETC không có cả hai.
  const data = rows
    .slice(1)
    .map((r) => ({ r, iso: toISO(r[iDate] ?? '') }))
    .filter((x): x is { r: string[]; iso: string } => x.iso != null && (x.r[iBilled] ?? '').trim() !== '')
  if (data.length === 0) return null

  // Năm: của ngày quẹt muộn nhất; nếu tháng hoá đơn NHỎ HƠN tháng đó thì đã sang năm mới
  // (quẹt tháng 12, hoá đơn tháng 1).
  const latest = data.map((x) => x.iso).sort().at(-1)!
  const [ly, lm] = latest.split('-').map(Number)
  const year = billMonth < lm ? ly + 1 : ly
  const range = cardBillingRange({
    monthKey: { year, month: billMonth },
    statementDay: card.statementDay,
    paymentDueDay: card.paymentDueDay,
  })
  if (!range) return null

  const lines: StatementLine[] = data.map(({ r, iso }) => {
    const name = (r[iName] ?? '').trim()
    const how = iHow >= 0 ? (r[iHow] ?? '') : ''
    const billed = num(r[iBilled] ?? '')
    const kind = kindOf(name, how)
    // Trả góp lần 1: sổ ghi CẢ món một lần ⇒ ghép theo 利用金額, hoá đơn chỉ nhận một nửa.
    const isFirstInstallment = kind === 'purchase' && /\(1回目\)/.test(nfkc(how))
    const amount = isFirstInstallment && iUse >= 0 ? num(r[iUse] ?? '') : billed
    return { iso, amount, billed, name, kind }
  })

  // Kiểm chéo tên file: enavi{YYYY}{MM}. Lệch ⇒ chặn lưu, như PayPay lệch ngày trả.
  const fromName = fileName.match(/enavi(\d{4})(\d{2})/)
  const nameMismatch =
    fromName != null && (Number(fromName[1]) !== year || Number(fromName[2]) !== billMonth)

  const source = sourceFromFileName(fileName)
  return {
    range,
    dueDateFromFile: range.dueISO,
    total: lines.reduce((a, l) => a + l.billed, 0),
    lines,
    dueDateMismatch: nameMismatch,
    source,
    sourceLabel: sourceLabelFor(source),
  }
}
