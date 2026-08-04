// Biến đổi THUẦN các dòng Zaim (đã tách CSV) -> giao dịch app. Không I/O -> test được.
// Quy tắc theo docs/superpowers/specs/2026-07-31-zaim-import-design.md (mục 4).

import { isOutgoingTransferExpense } from './mapping.mjs'

/** Vị trí cột trong CSV Zaim (bản xuất UTF-8, 16 cột). */
export const ZAIM_COL = {
  date: 0, // 日付  YYYY-MM-DD
  method: 1, // 方法  payment/income/transfer/balance
  catMain: 2, // カテゴリ
  catSub: 3, // カテゴリの内訳
  fromWallet: 4, // 支払元 (ví chi ra)
  toWallet: 5, // 入金先 (ví nhận vào)
  item: 6, // 品目
  memo: 7, // メモ
  store: 8, // お店
  currency: 9, // 通貨 (kỳ vọng JPY cho mọi dòng)
  income: 10, // 収入
  expense: 11, // 支出
  transfer: 12, // 振替
  balanceAdj: 13, // 残高調整
  aggFlag: 15, // 集計の設定
}

/** Giá trị cột 集計の設定 nghĩa là "không tính vào tổng". */
const EXCLUDE_FLAG = '集計に含めない'

/** Ghép お店 · メモ · 品目, bỏ phần rỗng và dấu '-'. */
export function buildNote(row) {
  return [row[ZAIM_COL.store], row[ZAIM_COL.memo], row[ZAIM_COL.item]]
    .map((s) => (s ?? '').trim())
    .filter((s) => s !== '' && s !== '-')
    .join(' · ')
}

/** Đồng tiền duy nhất script biết cách nạp (tài khoản app đều JPY ở kỳ lịch sử này). */
const EXPECTED_CURRENCY = 'JPY'

/** Số cột đúng của bản xuất Zaim. */
export const ZAIM_COL_COUNT = 16

/**
 * Dòng lệch cột thì mọi cột sau chỗ lệch đều là dữ liệu của cột khác — đọc tiếp là ghi
 * số tiền của người khác vào sổ. Chỉ tha cột thừa RỖNG (dấu phẩy cuối dòng).
 * @returns {string[]|null} dòng đã chuẩn hoá, hoặc null nếu không dùng được.
 */
export function normalizeRow(row) {
  if (row.length === ZAIM_COL_COUNT) return row
  if (row.length < ZAIM_COL_COUNT) return null
  const extra = row.slice(ZAIM_COL_COUNT)
  return extra.every((s) => (s ?? '').trim() === '') ? row.slice(0, ZAIM_COL_COUNT) : null
}

/** Ngày Zaim phải đúng dạng YYYY-MM-DD và là ngày thật. */
export function isValidDate(s) {
  const t = (s ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return false
  const [y, m, d] = t.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

/**
 * Chuỗi tiền JPY -> số nguyên.
 * - `null`  : ô rỗng hoặc '-' (Zaim để trống cột không dùng) — không phải lỗi.
 * - `NaN`   : CÓ nội dung nhưng không đọc được ra số — phải đếm riêng, tuyệt đối
 *             không được lẫn vào "tiền = 0" rồi im lặng mất dòng.
 * Chấp nhận dấu phân cách nghìn, ¥/￥, khoảng trắng và chữ số toàn rộng.
 */
export function parseYen(s) {
  const t = (s ?? '').trim()
  if (t === '' || t === '-') return null
  const norm = t
    .replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0))
    .replace(/[−ー―]/g, '-')
    .replace(/[¥￥,\s]/g, '')
  if (!/^-?\d+(\.\d+)?$/.test(norm)) return NaN
  return Math.trunc(Number(norm))
}

/**
 * Khóa chống trùng: ngày | dấu+tiền | tài khoản | ghi chú.
 *
 * Chuyển khoản dùng dấu riêng `>` và ghi cả hai đầu tài khoản: cùng ngày, cùng số tiền,
 * một khoản thu 5.000 vào Ví và một lần chuyển 5.000 từ Ví sang chỗ khác là hai chuyện
 * khác nhau — trộn chung khóa thì lần nạp sau sẽ nuốt mất một trong hai.
 * Khóa của expense/income giữ nguyên như cũ để không phá dữ liệu đã nạp.
 */
export function makeKey(occurred_on, type, amount, account_id, note, to_account_id = null) {
  if (type === 'transfer')
    return `${occurred_on}|>${amount}|${account_id}>${to_account_id}|${note}`
  return `${occurred_on}|${type === 'expense' ? '-' : '+'}${amount}|${account_id}|${note}`
}

/**
 * @param {string[][]} rows dòng dữ liệu Zaim (KHÔNG gồm dòng tiêu đề)
 * @param {{
 *   resolveAccountId: (wallet: string) => string,
 *   resolveCategoryId: (type: 'expense'|'income', main: string, sub: string) => string|null,
 *   existingKeys: Set<string>,
 *   userId: string,
 *   now: string,
 *   newId: () => string,
 * }} ctx
 */
export function transformRows(rows, ctx) {
  const items = []
  const stats = {
    total: rows.length,
    imported: 0,
    skipMethod: {}, // 振替 (chuyển khoản) + balance (điều chỉnh số dư) -> số dòng
    skipZero: 0, // tiền = 0 hoặc ô rỗng (app cấm amount > 0)
    badAmount: 0, // CÓ nội dung nhưng không đọc ra số -> mất dòng, phải soi
    badAmountSamples: [], // vài ví dụ để tra lại trong CSV
    badColumns: 0, // dòng lệch số cột -> đọc tiếp là đọc sai cột
    badDate: 0, // ngày sai định dạng
    badDateSamples: [],
    nonJpy: {}, // 'USD' -> số dòng (số tiền sẽ sai nếu nạp, nên bỏ)
    skipCategory: {}, // 'main>sub' -> số dòng (danh mục đánh dấu bỏ qua)
    skipCategoryTotal: 0,
    skipOutgoingTransfer: 0, // chi rơi vào 'Khác' nhưng là chuyển tiền ra ngoài (送金/振込/ワイズ)
    dup: 0, // trùng giao dịch đã có
    refund: 0, // chi hoàn tiền
    excluded: 0, // loại khỏi thống kê
  }
  const sample = (arr, v) => {
    if (arr.length < 5) arr.push(v)
  }

  for (const raw_row of rows) {
    const row = normalizeRow(raw_row)
    if (!row) {
      stats.badColumns++
      continue
    }
    const method = row[ZAIM_COL.method]
    // Chỉ nhận CHI (payment) và THU (income). 振替 (chuyển khoản) và balance (điều
    // chỉnh số dư) đều là tiền luân chuyển nội bộ, không phải chi tiêu — bỏ hết vào
    // skipMethod. Người dùng sẽ chỉnh số dư ví/thẻ một lần cho khớp hiện tại.
    if (method !== 'payment' && method !== 'income') {
      stats.skipMethod[method] = (stats.skipMethod[method] || 0) + 1
      continue
    }

    // Tài khoản app ở kỳ này đều JPY: dòng tiền tệ khác sẽ vào sổ với số tiền sai
    // đơn vị, nên bỏ và đếm riêng thay vì nạp bừa.
    const currency = (row[ZAIM_COL.currency] ?? '').trim()
    if (currency !== '' && currency !== EXPECTED_CURRENCY) {
      stats.nonJpy[currency] = (stats.nonJpy[currency] || 0) + 1
      continue
    }

    const type = method === 'payment' ? 'expense' : 'income'

    const rawText = type === 'expense' ? row[ZAIM_COL.expense] : row[ZAIM_COL.income]
    const raw = parseYen(rawText)
    if (Number.isNaN(raw)) {
      stats.badAmount++
      sample(stats.badAmountSamples, {
        date: row[ZAIM_COL.date],
        raw: (rawText ?? '').trim(),
        note: buildNote(row),
      })
      continue
    }
    if (raw === null || raw === 0) {
      stats.skipZero++
      continue
    }
    if (!isValidDate(row[ZAIM_COL.date])) {
      stats.badDate++
      sample(stats.badDateSamples, { date: row[ZAIM_COL.date], amount: raw, note: buildNote(row) })
      continue
    }
    const isRefund = type === 'expense' && raw < 0
    const amount = Math.abs(raw)

    const category_id = ctx.resolveCategoryId(type, row[ZAIM_COL.catMain], row[ZAIM_COL.catSub])
    if (category_id === null) {
      const k = `${row[ZAIM_COL.catMain]}>${row[ZAIM_COL.catSub]}`
      stats.skipCategory[k] = (stats.skipCategory[k] || 0) + 1
      stats.skipCategoryTotal++
      continue
    }

    const wallet = type === 'expense' ? row[ZAIM_COL.fromWallet] : row[ZAIM_COL.toWallet]
    const account_id = ctx.resolveAccountId(wallet)
    const note = buildNote(row)

    // Chi rơi vào catch-all 'Khác' mà ghi chú là chuyển tiền (gửi người/Wise/振込) thì
    // đó là tiền luân chuyển, không phải chi tiêu — bỏ. Tiền nhà/học phí/điện nước trả
    // bằng chuyển khoản nằm ở danh mục riêng nên KHÔNG bị đụng.
    if (isOutgoingTransferExpense(type, row[ZAIM_COL.catMain], row[ZAIM_COL.catSub], note)) {
      stats.skipOutgoingTransfer++
      continue
    }

    const occurred_on = row[ZAIM_COL.date]
    const key = makeKey(occurred_on, type, amount, account_id, note)
    if (ctx.existingKeys.has(key)) {
      stats.dup++
      continue
    }

    const exclude_from_stats = row[ZAIM_COL.aggFlag] === EXCLUDE_FLAG
    items.push({
      id: ctx.newId(),
      user_id: ctx.userId,
      type,
      amount,
      to_amount: null,
      category_id,
      account_id,
      to_account_id: null,
      recurring_rule_id: null,
      occurred_on,
      note,
      is_remittance: false,
      remit_service: null,
      remit_fee_jpy: null,
      remit_received_vnd: null,
      is_debt_flow: false,
      exclude_from_stats,
      is_refund: isRefund,
      created_at: ctx.now,
      updated_at: ctx.now,
    })
    stats.imported++
    if (exclude_from_stats) stats.excluded++
    if (isRefund) stats.refund++
  }

  return { items, stats }
}
