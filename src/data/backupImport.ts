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
  const tagGroupIds = ids(data.tagGroups, 'nhóm nhãn')
  const scenarioIds = ids(data.lifeScenarios, 'kịch bản Lifetime')
  const recurringIds = ids(data.recurringRules, 'quy tắc định kỳ')

  // Khoá UNIQUE của Postgres: file vi phạm sẽ nổ 23505 SAU khi importAll đã xoá
  // sạch 16 bảng — nên phải bắt ở đây, trước khi xoá bất cứ thứ gì.
  const uniques = (label: string) => {
    const seen = new Set<string>()
    return (key: string, sample: string) => {
      if (seen.has(key)) p.add(`Trùng ${label}`, sample)
      seen.add(key)
    }
  }

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
    // Hình dạng theo loại (CHECK của 0001): file vi phạm sẽ nổ 23514 lúc chèn —
    // tức là SAU khi đã xoá hết dữ liệu cũ. Soát đủ cả hai nhánh ở đây.
    if (t.type === 'transfer') {
      if (!t.to_account_id) p.add('Chuyển khoản thiếu tài khoản đích', at)
      else if (!accountIds.has(t.to_account_id))
        p.add('Tài khoản đích không có trong file', `${at} → ${t.to_account_id}`)
      if (t.to_account_id && t.to_account_id === t.account_id)
        p.add('Chuyển khoản có nguồn và đích là một', at)
      if (t.category_id) p.add('Chuyển khoản không được mang danh mục', at)
    } else {
      if (!t.category_id) p.add('Thu/chi thiếu danh mục', at)
      if (t.to_account_id) p.add('Thu/chi không được có tài khoản đích', at)
      if (t.to_amount != null) p.add('Thu/chi không được có to_amount', at)
    }
    if (t.to_amount != null && (typeof t.to_amount !== 'number' || t.to_amount <= 0))
      p.add('to_amount phải là số dương', `${at} → ${String(t.to_amount)}`)
    if (t.recurring_rule_id && !recurringIds.has(t.recurring_rule_id))
      p.add('Giao dịch trỏ tới quy tắc định kỳ không có trong file', `${at} → ${t.recurring_rule_id}`)
  }

  const budgetKey = uniques('ngân sách (danh mục + tháng)')
  for (const b of data.budgets ?? []) {
    if (!categoryIds.has(b.category_id))
      p.add('Ngân sách trỏ tới danh mục không có trong file', `${b.month_key} → ${b.category_id}`)
    budgetKey(`${b.category_id}|${b.month_key}`, b.month_key)
  }

  for (const r of data.recurringRules ?? []) {
    if (!accountIds.has(r.account_id))
      p.add('Quy tắc định kỳ trỏ tới tài khoản không có trong file', r.account_id)
    if (r.to_account_id && !accountIds.has(r.to_account_id))
      p.add('Quy tắc định kỳ trỏ tới tài khoản đích không có trong file', r.to_account_id)
    if (r.category_id && !categoryIds.has(r.category_id))
      p.add('Quy tắc định kỳ trỏ tới danh mục không có trong file', r.category_id)
  }

  for (const d of data.debts ?? [])
    if (d.disbursement_transaction_id && !transactionIds.has(d.disbursement_transaction_id))
      p.add('Khoản nợ trỏ tới giao dịch giải ngân không có trong file', d.counterparty)

  for (const dp of data.debtPayments ?? []) {
    if (!debtIds.has(dp.debt_id))
      p.add('Lần trả nợ trỏ tới khoản nợ không có trong file', dp.debt_id)
    if (dp.transaction_id && !transactionIds.has(dp.transaction_id))
      p.add('Lần trả nợ trỏ tới giao dịch không có trong file', dp.transaction_id)
  }

  const ttKey = uniques('liên kết nhãn (giao dịch + nhãn)')
  for (const tt of data.transactionTags ?? []) {
    if (!transactionIds.has(tt.transaction_id))
      p.add('Nhãn gắn vào giao dịch không có trong file', tt.transaction_id)
    if (!tagIds.has(tt.tag_id)) p.add('Nhãn không có trong file', tt.tag_id)
    ttKey(`${tt.transaction_id}|${tt.tag_id}`, tt.tag_id)
  }

  const tagName = uniques('tên nhãn')
  for (const t of data.tags ?? []) tagName(t.name, t.name)

  const tagGroupName = uniques('tên nhóm nhãn')
  for (const g of data.tagGroups ?? []) tagGroupName(g.name, g.name)

  // group_id là FK; file trỏ sai sẽ nổ 23503 SAU khi importAll đã xoá sạch dữ liệu cũ.
  for (const t of data.tags ?? [])
    if (t.group_id && !tagGroupIds.has(t.group_id))
      p.add('Nhóm nhãn không có trong file', `${t.name} → ${t.group_id}`)

  const groupName = uniques('tên nhóm tài sản')
  for (const s of data.assetGroupSettings ?? []) groupName(s.name, s.name)

  const valKey = uniques('định giá (tài khoản + ngày)')
  for (const v of data.accountValuations ?? []) {
    if (!accountIds.has(v.account_id))
      p.add('Định giá trỏ tới tài khoản không có trong file', v.account_id)
    valKey(`${v.account_id}|${v.valued_on}`, v.valued_on)
  }

  const snapKey = uniques('snapshot tài sản (ngày)')
  for (const s of data.networthSnapshots ?? []) snapKey(s.snapshot_on, s.snapshot_on)

  for (const g of data.savingsGoals ?? [])
    if (g.account_id && !accountIds.has(g.account_id))
      p.add('Mục tiêu tiết kiệm trỏ tới tài khoản không có trong file', g.account_id)

  // Lifetime: con trỏ về kịch bản + UNIQUE (scenario_id, start_year) của life_phases.
  const phaseKey = uniques('chặng đời (kịch bản + năm bắt đầu)')
  for (const ph of data.lifePhases ?? []) {
    if (!scenarioIds.has(ph.scenario_id))
      p.add('Chặng đời trỏ tới kịch bản không có trong file', ph.label)
    phaseKey(`${ph.scenario_id}|${ph.start_year}`, `${ph.label} (${ph.start_year})`)
  }
  for (const ev of data.lifeEvents ?? [])
    if (!scenarioIds.has(ev.scenario_id))
      p.add('Sự kiện đời trỏ tới kịch bản không có trong file', ev.label)

  // Sổ lệnh cổ phiếu (v7): FK (account_id, user_id) -> accounts + CHECK stock_trades_shape
  // của migration 0035. id trùng đã bắt ở khối `ids` phía trên (dùng chung accountIds).
  ids(data.stockTrades, 'sổ lệnh cổ phiếu')
  for (const st of data.stockTrades ?? []) {
    const at = `${st.symbol} ${st.traded_on}`
    if (!accountIds.has(st.account_id))
      p.add('Lệnh cổ phiếu trỏ tới tài khoản không có trong file', `${at} → ${st.account_id}`)
    // Hình dạng theo kind (CHECK stock_trades_shape): file vi phạm sẽ nổ 23514 lúc chèn —
    // tức là SAU khi đã xoá hết dữ liệu cũ. Soát đủ cả hai nhánh ở đây.
    if (st.kind === 'adjust') {
      if (st.quantity === 0) p.add('Lệnh điều chỉnh phải có số cổ khác 0', at)
      if (st.price !== 0) p.add('Lệnh điều chỉnh không được có giá khác 0', at)
    } else {
      if (typeof st.quantity !== 'number' || !Number.isFinite(st.quantity) || st.quantity <= 0)
        p.add('Lệnh mua/bán phải có số cổ dương', `${at} → ${String(st.quantity)}`)
      if (typeof st.price !== 'number' || !Number.isFinite(st.price) || st.price <= 0)
        p.add('Lệnh mua/bán phải có giá dương', `${at} → ${String(st.price)}`)
    }
  }

  return p.list()
}
