// Hai lớp bảo vệ cho đường KHÔI PHỤC backup — hàm thuần, không I/O.
//
// Vì sao cần: `importAll` XOÁ toàn bộ dữ liệu hiện có TRƯỚC khi chèn lại, và mỗi bảng là
// một request riêng (không có transaction bao ngoài). Nên nếu file có một chỗ hỏng — giao
// dịch trỏ tới tài khoản đã bị xoá khỏi file, danh mục con mất cha, số tiền = 0 — thì
// người dùng mất dữ liệu cũ TRƯỚC rồi mới biết là chèn không được. Với file 16.000 giao
// dịch nhập từ Zaim thì đó là mất thật.
//
// - `validateBackupPayload` soát file TRƯỚC khi xoá bất cứ thứ gì.
// - `chunk` cắt nhỏ mảng để không nhồi 14.000 dòng vào một request (dễ vượt giới hạn
//   kích thước body và statement timeout của Postgres, và khi đứt thì đứt cả cục).

import type { BackupData } from './repo'

/** Cỡ lô chèn: đủ lớn để nhanh, đủ nhỏ để không vượt giới hạn request/timeout. */
export const IMPORT_CHUNK_SIZE = 500

/** Cắt mảng thành các lô cỡ `size`. `size <= 0` -> trả nguyên một lô (không treo vòng lặp). */
export function chunk<T>(rows: readonly T[], size: number): T[][] {
  if (rows.length === 0) return []
  if (size <= 0) return [[...rows]]
  const out: T[][] = []
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size))
  return out
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Gom các lỗi cùng loại thành một dòng "n chỗ" + vài ví dụ, thay vì in ra hàng nghìn dòng. */
class Problems {
  private groups = new Map<string, { count: number; samples: string[] }>()

  add(kind: string, sample: string) {
    const g = this.groups.get(kind) ?? { count: 0, samples: [] }
    g.count++
    if (g.samples.length < 3) g.samples.push(sample)
    this.groups.set(kind, g)
  }

  list(): string[] {
    return [...this.groups.entries()].map(([kind, g]) =>
      g.count === 1
        ? `${kind}: ${g.samples[0]}`
        : `${kind} (${g.count} chỗ): ${g.samples.join(', ')}…`,
    )
  }
}

/**
 * Soát tính toàn vẹn của file backup trước khi khôi phục.
 * @returns danh sách vấn đề bằng tiếng Việt; mảng rỗng = file dùng được.
 */
export function validateBackupPayload(data: BackupData): string[] {
  const p = new Problems()

  const ids = <T extends { id: string }>(rows: readonly T[] | undefined, label: string) => {
    const set = new Set<string>()
    for (const r of rows ?? []) {
      if (set.has(r.id)) p.add(`Trùng id trong ${label}`, r.id)
      set.add(r.id)
    }
    return set
  }

  const accountIds = ids(data.accounts, 'tài khoản')
  const categoryIds = ids(data.categories, 'danh mục')
  const transactionIds = ids(data.transactions, 'giao dịch')
  const debtIds = ids(data.debts, 'khoản nợ')
  const tagIds = ids(data.tags, 'nhãn')

  // Tài khoản: thẻ trả tự động trỏ tới tài khoản thanh toán.
  for (const a of data.accounts ?? [])
    if (a.payment_account_id && !accountIds.has(a.payment_account_id))
      p.add('Tài khoản thanh toán không có trong file', `${a.name} → ${a.payment_account_id}`)

  // Danh mục: self-FK cha/con.
  for (const c of data.categories ?? [])
    if (c.parent_id && !categoryIds.has(c.parent_id))
      p.add('Danh mục cha không có trong file', `${c.name} → ${c.parent_id}`)

  // Giao dịch: nơi hầu hết dữ liệu nằm, cũng là nơi hay hỏng nhất.
  for (const t of data.transactions ?? []) {
    const at = `${t.occurred_on} ${t.amount}`
    if (!accountIds.has(t.account_id))
      p.add('Giao dịch trỏ tới tài khoản không có trong file', `${at} → ${t.account_id}`)
    if (t.category_id && !categoryIds.has(t.category_id))
      p.add('Giao dịch trỏ tới danh mục không có trong file', `${at} → ${t.category_id}`)
    if (typeof t.amount !== 'number' || !Number.isFinite(t.amount) || t.amount <= 0)
      p.add('Số tiền phải là số dương', `${t.occurred_on} → ${String(t.amount)}`)
    if (!DATE_RE.test(String(t.occurred_on)))
      p.add('Ngày sai định dạng YYYY-MM-DD', String(t.occurred_on))
    if (t.type === 'transfer') {
      if (!t.to_account_id) p.add('Chuyển khoản thiếu tài khoản đích', at)
      else if (!accountIds.has(t.to_account_id))
        p.add('Tài khoản đích không có trong file', `${at} → ${t.to_account_id}`)
    }
  }

  for (const b of data.budgets ?? [])
    if (!categoryIds.has(b.category_id))
      p.add('Ngân sách trỏ tới danh mục không có trong file', `${b.month_key} → ${b.category_id}`)

  for (const dp of data.debtPayments ?? [])
    if (!debtIds.has(dp.debt_id))
      p.add('Lần trả nợ trỏ tới khoản nợ không có trong file', dp.debt_id)

  for (const tt of data.transactionTags ?? []) {
    if (!transactionIds.has(tt.transaction_id))
      p.add('Nhãn gắn vào giao dịch không có trong file', tt.transaction_id)
    if (!tagIds.has(tt.tag_id)) p.add('Nhãn không có trong file', tt.tag_id)
  }

  for (const v of data.accountValuations ?? [])
    if (!accountIds.has(v.account_id))
      p.add('Định giá trỏ tới tài khoản không có trong file', v.account_id)

  for (const g of data.savingsGoals ?? [])
    if (g.account_id && !accountIds.has(g.account_id))
      p.add('Mục tiêu tiết kiệm trỏ tới tài khoản không có trong file', g.account_id)

  return p.list()
}
