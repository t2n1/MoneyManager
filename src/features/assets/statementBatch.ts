// Gom các bản sao kê vừa nạp thành MỘT bản mỗi kỳ.
//
// Vì sao cần: tài khoản "Credit Rakuten" trong sổ gộp HAI thẻ (Master 3737 + Visa 2565),
// mỗi thẻ một file enavi mỗi kỳ. Khoá `card_bills` là (account_id, close_date) ⇒ một kỳ
// một dòng ⇒ hai file phải CỘNG lại. Bản cũ (`statementNeighbours.dedupeByPeriod`) khoá
// theo closeISO "bản sau thắng" — với Rakuten là mất một nửa hoá đơn, tuỳ thứ tự file.
//
// Hai luật, tách bằng `source` (đuôi số thẻ trong tên file):
//   · CÙNG nguồn, cùng kỳ ⇒ chọn nhầm một file hai lần ⇒ bản sau thắng. Postgres từ chối
//     cả lô upsert nếu một câu chạm cùng dòng hai lần; bản demo thì lặng lẽ ghi đè —
//     lỗi chỉ vỡ ở app thật, nên chặn ở đây.
//   · KHÁC nguồn, cùng kỳ ⇒ hai thẻ ⇒ cộng total, nối lines, giữ `parts` để hiện tách.
//
// Thuần, không phụ thuộc React.

import type { NewCardBill } from '../../data/repo'
import type { CardBillingRange } from './cardMonthCharge'
import type { ParsedStatement, StatementLine } from './statementLine'

export interface MergedStatement {
  range: CardBillingRange
  /** Σ total các nguồn. */
  total: number
  /** Từng nguồn, sắp theo `source`, để hiện "Master 165.429 · Visa 880". */
  parts: { source: string; sourceLabel: string; total: number }[]
  lines: StatementLine[]
  /** OR của các nguồn: một nguồn lệch là cả kỳ bị chặn lưu. */
  dueDateMismatch: boolean
}

export function mergeStatements(parsed: ParsedStatement[]): MergedStatement[] {
  const bySource = new Map<string, ParsedStatement>()
  for (const p of parsed) bySource.set(`${p.range.closeISO}|${p.source}`, p)

  const byClose = new Map<string, ParsedStatement[]>()
  for (const p of bySource.values()) {
    const list = byClose.get(p.range.closeISO) ?? []
    list.push(p)
    byClose.set(p.range.closeISO, list)
  }

  return [...byClose.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, ps]) => {
      const sorted = [...ps].sort((a, b) => a.source.localeCompare(b.source))
      return {
        range: sorted[0].range,
        total: sorted.reduce((s, p) => s + p.total, 0),
        parts: sorted.map((p) => ({ source: p.source, sourceLabel: p.sourceLabel, total: p.total })),
        lines: sorted.flatMap((p) => p.lines),
        dueDateMismatch: sorted.some((p) => p.dueDateMismatch),
      }
    })
}

/** Dòng `card_bills` cho một thẻ — mỗi kỳ ĐÚNG một dòng, total đã gộp các nguồn. */
export function billRowsFor(accountId: string, merged: MergedStatement[]): NewCardBill[] {
  return merged.map((m) => ({
    account_id: accountId,
    close_date: m.range.closeISO,
    due_date: m.range.dueISO,
    total: m.total,
  }))
}
