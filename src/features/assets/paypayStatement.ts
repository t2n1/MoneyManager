// Đọc một file sao kê PayPay Card thành HOÁ ĐƠN của một kỳ.
//
// Con số nhà thẻ đòi = Σ当月支払金額 + Σ調整額 — KHÔNG phải Σ利用金額. Đã đối chiếu
// 8 kỳ (hoá đơn 1-8/2026) với ảnh chụp app PayPay: khớp tuyệt đối cả 8.
//
// Cột 調整額 là chỗ PayPay trả lại tiền hoàn, và nó GẮN VÀO MỘT DÒNG KHÔNG LIÊN QUAN,
// có khi xẻ nhỏ ra nhiều dòng. Bỏ quên cột này là bẫy đã sập một lần trong lúc điều
// tra: lọc theo 当月支払金額 rồi cộng, ra số đúng ở 5/8 kỳ và sai ở 3 kỳ còn lại.
//
// Thuần, không phụ thuộc React, để unit-test được.

import { parseCsvText } from '../import/csvImport'
import { detectIssuerFromHeader } from '../import/statementFormat'
import { cardBillingRange } from './cardMonthCharge'
import {
  sourceFromFileName,
  sourceLabelFor,
  type LineKind,
  type ParsedStatement,
  type StatementLine,
} from './statementLine'

/** Re-export để chỗ import cũ (`from './paypayStatement'`) còn chạy tới Đợt 4. */
export type { ParsedStatement, StatementLine } from './statementLine'

/** Bố cục cột đã xác minh trên 13 file thật (2025-08 → 2026-08). */
const COL = { date: 0, name: 1, billed: 8, adjust: 10, dueDate: 11 } as const

const num = (s: string) => Number(String(s ?? '').replace(/[,\s]/g, '')) || 0

const toISO = (s: string): string | null => {
  const m = String(s ?? '').match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/)
  if (!m) return null
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
}

const nfkc = (s: string) => s.normalize('NFKC').trim()
/** `チャージ` TRƠN mới là nạp ví PayPay — `モバイルＳｕｉｃａチャージ` là mua vé, không phải. */
const kindOf = (name: string): LineKind => {
  const n = nfkc(name)
  if (n === 'チャージ') return 'topup'
  if (n.endsWith('(再計算)')) return 'recalculated'
  return 'purchase'
}

/**
 * `null` khi: không phải file PayPay, file rỗng, hoặc thẻ chưa khai đủ ngày chốt +
 * ngày trả (không dựng được kỳ ⇒ không biết hoá đơn này thuộc về đâu).
 */
export function parsePaypayStatement(
  text: string,
  card: { statementDay: number | null; paymentDueDay: number | null },
  fileName = '',
): ParsedStatement | null {
  const rows = parseCsvText(text)
  // Nhận dạng nhà thẻ nằm ở statementFormat.ts, dùng chung với màn Nhập CSV — giữ bảng
  // chữ riêng ở đây là để hai màn trôi khỏi nhau (đã từng xảy ra với phần Rakuten).
  if (detectIssuerFromHeader(rows[0]) !== 'paypay') return null

  const data = rows.slice(1)
  const dueRaw = data.map((r) => toISO(r[COL.dueDate] ?? '')).find((d) => d != null)
  if (!dueRaw) return null

  // CHỈ lấy năm + tháng của 当月お支払日, rồi để cardBillingRange dựng kỳ từ cài đặt của
  // chính thẻ. KHÔNG đưa thẳng ngày này cho statementCloseFor: nó là ngày ĐÃ DỜI cuối
  // tuần (27/6/2026 rơi CN nên file ghi 29/6), còn statementCloseFor đòi ngày CHƯA dời.
  const [y, m] = dueRaw.split('-').map(Number)
  const range = cardBillingRange({
    monthKey: { year: y, month: m },
    statementDay: card.statementDay,
    paymentDueDay: card.paymentDueDay,
  })
  if (!range) return null

  const lines: StatementLine[] = []
  for (const r of data) {
    // Dòng CÓ THU = cột 当月支払金額 không rỗng. Tương đương dấu '*' ở cột 利用者
    // (`本人*`) — đúng 100% trên 13 file — nhưng cột số là bằng chứng, dấu sao là
    // quy ước hiển thị.
    const billedRaw = r[COL.billed] ?? ''
    const iso = toISO(r[COL.date] ?? '') ?? range.closeISO
    const name = (r[COL.name] ?? '').trim()
    if (billedRaw !== '') {
      const amount = num(billedRaw)
      lines.push({ iso, amount, billed: amount, name, kind: kindOf(name) })
    }
    const adj = num(r[COL.adjust] ?? '')
    if (adj !== 0)
      lines.push({
        iso,
        amount: adj,
        billed: adj,
        name: `調整額 · ${name}`,
        kind: 'adjustment',
      })
  }

  return {
    range,
    dueDateFromFile: dueRaw,
    total: lines.reduce((a, l) => a + l.billed, 0),
    lines,
    // Lệch ⇒ ngày chốt / ngày trả khai trong app không khớp thực tế của thẻ. Nói ra,
    // đừng lưu im lặng: sai mốc là mọi kỳ về sau đều xếp nhầm chỗ.
    dueDateMismatch: range.dueISO !== dueRaw,
    source: sourceFromFileName(fileName),
    sourceLabel: sourceLabelFor(sourceFromFileName(fileName)),
  }
}
