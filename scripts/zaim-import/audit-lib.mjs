// Đối chiếu "CSV Zaim" với "dữ liệu app đang có" — hàm THUẦN, không I/O, để test được.
//
// Vì sao cần: script nạp (run.mjs) chỉ báo cáo NÓ đã tạo bao nhiêu giao dịch. Nó không
// biết những giao dịch đó có thật sự vào được app hay không (nút Khôi phục ghi một lượt,
// đứt giữa đường là mất). Muốn trả lời "có đủ không" thì phải so CSV với bản xuất mới
// nhất của app — đó là việc của file này.

import { ZAIM_COL, parseYen, makeKey } from './transform.mjs'
import { explainCategoryPath, WALLET_TO_ACCOUNT_NAME, DEFAULT_ACCOUNT_NAME } from './mapping.mjs'

/** 'YYYY-MM-DD' -> 'YYYY-MM' */
export function monthKeyOf(date) {
  return (date ?? '').slice(0, 7)
}

const keyOf = (t) =>
  makeKey(t.occurred_on, t.type, t.amount, t.account_id, t.note ?? '', t.to_account_id ?? null)

/**
 * So bộ giao dịch KỲ VỌNG (dựng lại từ CSV) với bộ THỰC CÓ trong app.
 *
 * So theo BỘI (multiset) chứ không theo tập hợp: hai bữa trưa 500¥ cùng ngày cùng ví là
 * hai giao dịch thật, app thiếu một cái thì phải báo thiếu một — dùng Set là mất chỗ này.
 *
 * @param {Array<{occurred_on,type,amount,account_id,note}>} expected
 * @param {Array<{occurred_on,type,amount,account_id,note}>} actual
 */
export function reconcile(expected, actual) {
  const pool = new Map() // key -> số bản còn chưa được ghép
  for (const t of actual) {
    const k = keyOf(t)
    pool.set(k, (pool.get(k) ?? 0) + 1)
  }

  const missing = []
  let matched = 0
  for (const t of expected) {
    const k = keyOf(t)
    const left = pool.get(k) ?? 0
    if (left > 0) {
      pool.set(k, left - 1)
      matched++
    } else missing.push(t)
  }

  // Còn dư trong pool = giao dịch app có mà CSV không có: phần lớn là do người dùng tự
  // nhập tay. Không phải lỗi, nhưng đếm ra để thấy tổng bức tranh.
  const extraKeys = [...pool.entries()].filter(([, n]) => n > 0)
  const extra = []
  for (const [k, n] of extraKeys) for (let i = 0; i < n; i++) extra.push(k)

  // Bảng theo tháng: chỉ ra hụt ở đâu thay vì chỉ một con số tổng.
  const months = new Map()
  const bucket = (m) => {
    if (!months.has(m))
      months.set(m, { month: m, expected: 0, found: 0, missing: 0, expectedAmount: 0, missingAmount: 0 })
    return months.get(m)
  }
  for (const t of expected) {
    const b = bucket(monthKeyOf(t.occurred_on))
    b.expected++
    b.expectedAmount += t.amount
  }
  for (const t of missing) {
    const b = bucket(monthKeyOf(t.occurred_on))
    b.missing++
    b.missingAmount += t.amount
  }
  for (const b of months.values()) b.found = b.expected - b.missing

  return {
    matched,
    missing,
    extra,
    isComplete: missing.length === 0,
    byMonth: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)),
  }
}

/** Chỉ những dòng thật sự đi vào danh mục (payment/income). */
function categorizableRows(rows) {
  return rows.filter((r) => r[ZAIM_COL.method] === 'payment' || r[ZAIM_COL.method] === 'income')
}

function amountOf(row) {
  const type = row[ZAIM_COL.method] === 'payment' ? 'expense' : 'income'
  const v = parseYen(type === 'expense' ? row[ZAIM_COL.expense] : row[ZAIM_COL.income])
  return Number.isFinite(v) ? Math.abs(v) : 0
}

/**
 * Soát bảng nối danh mục: mỗi cặp (カテゴリ>内訳) đi về đâu, bao nhiêu dòng, bao nhiêu tiền,
 * và cờ cảnh báo để người dùng biết chỗ nào cần soát lại:
 * - `skipped`  : không nạp vào app.
 * - `toOther`  : rơi vào "Khác" -> mất hẳn thông tin phân loại.
 * - `toParent` : gán vào NHÓM CHA, không phải danh mục lá -> ngân sách (chỉ đặt ở lá) không thấy.
 * - `guessed`  : bảng nối không có cặp này, dùng mặc định của nhóm -> là phỏng đoán.
 */
export function reviewMapping(rows) {
  const out = new Map()
  for (const row of categorizableRows(rows)) {
    const type = row[ZAIM_COL.method] === 'payment' ? 'expense' : 'income'
    const main = row[ZAIM_COL.catMain]
    const sub = row[ZAIM_COL.catSub]
    const key = `${main}>${sub}`
    const id = `${type}|${key}`
    if (!out.has(id)) {
      const { path, source } = explainCategoryPath(type, main, sub)
      out.set(id, {
        type,
        key,
        path,
        source,
        guessed: source === 'default' || source === 'unknown-main',
        skipped: path === 'SKIP',
        toOther: path === 'Khác' || path.endsWith('>Khác'),
        toParent: path !== 'SKIP' && !path.includes('>'),
        count: 0,
        sum: 0,
      })
    }
    const e = out.get(id)
    e.count++
    e.sum += amountOf(row)
  }
  return [...out.values()].sort((a, b) => b.count - a.count)
}

/** Soát bảng nối ví: ví nào về tài khoản nào, và bao nhiêu dòng phải dùng tài khoản mặc định. */
export function reviewWallets(rows) {
  const out = new Map()
  for (const row of categorizableRows(rows)) {
    const type = row[ZAIM_COL.method] === 'payment' ? 'expense' : 'income'
    const wallet = row[type === 'expense' ? ZAIM_COL.fromWallet : ZAIM_COL.toWallet]
    if (!out.has(wallet)) {
      const mapped = WALLET_TO_ACCOUNT_NAME[wallet]
      out.set(wallet, {
        wallet,
        account: mapped ?? DEFAULT_ACCOUNT_NAME,
        isDefault: mapped === undefined,
        count: 0,
        sum: 0,
      })
    }
    const e = out.get(wallet)
    e.count++
    e.sum += amountOf(row)
  }
  return [...out.values()].sort((a, b) => b.count - a.count)
}

/**
 * Ảnh hưởng của lịch sử vừa nạp lên SỐ DƯ từng tài khoản.
 * Số dư app = initial_balance + tổng giao dịch. Nạp 9 năm lịch sử vào là cộng thêm một
 * khoản ròng khổng lồ (thường âm) mà `initial_balance` chưa hề biết -> số dư hiện tại sai
 * đúng bằng con số này. Đây là hệ quả tất yếu, không phải lỗi script, nhưng phải nói ra.
 */
export function balanceImpact(transactions, accountNameById) {
  const out = new Map()
  for (const t of transactions) {
    if (t.type !== 'expense' && t.type !== 'income') continue
    const name = accountNameById(t.account_id)
    if (!out.has(name)) out.set(name, { account: name, income: 0, expense: 0, net: 0, count: 0 })
    const e = out.get(name)
    e.count++
    // Hoàn tiền là chi âm: cộng lại vào số dư (khớp view account_balances của app).
    const signed = t.type === 'income' ? t.amount : t.is_refund ? t.amount : -t.amount
    if (signed >= 0) e.income += Math.abs(signed)
    else e.expense += Math.abs(signed)
    e.net += signed
  }
  return [...out.values()].sort((a, b) => a.net - b.net)
}

/** Dựng lại chỉ số danh mục cho báo cáo: id -> 'Cha>Con'. */
export function categoryPathIndex(categories) {
  const byId = new Map(categories.map((c) => [c.id, c]))
  const out = new Map()
  for (const c of categories) {
    const p = c.parent_id ? byId.get(c.parent_id) : null
    out.set(c.id, p ? `${p.name}>${c.name}` : c.name)
  }
  return out
}
