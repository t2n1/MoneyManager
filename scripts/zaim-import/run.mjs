// CLI nạp Zaim: đọc CSV + backup app -> gộp giao dịch Zaim -> xuất backup mới + báo cáo.
// Dùng: node scripts/zaim-import/run.mjs [duong-dan-csv] [duong-dan-backup] [duong-dan-xuat]
// Không I/O mạng; chỉ đọc/ghi file. Nạp bằng nút "Khôi phục" trong app.

import { readFileSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { parseCsv } from './csv.mjs'
import { transformRows, makeKey } from './transform.mjs'
import { buildResolvers } from './resolve.mjs'

// Mặc định tìm trong Downloads của người đang chạy — đường dẫn cứng theo tên một máy cụ
// thể thì máy khác chạy là lỗi "không thấy file" mà không hiểu vì sao.
const DL = path.join(process.env.USERPROFILE ?? process.env.HOME ?? '.', 'Downloads')
const csvPath = process.argv[2] || path.join(DL, 'Zaim.20260731114811-UTF-08.csv')
const backupPath = process.argv[3] || path.join(DL, 'so-chi-tieu-backup-2026-07-31.json')
const outPath =
  process.argv[4] ||
  path.join(path.dirname(backupPath), path.basename(backupPath, '.json') + '-them-zaim.json')

const fmt = (n) => n.toLocaleString('ja-JP')

// ---- Đọc dữ liệu ----
const csvRows = parseCsv(readFileSync(csvPath, 'utf-8'))
const dataRows = csvRows.slice(1) // bỏ dòng tiêu đề
const backup = JSON.parse(readFileSync(backupPath, 'utf-8'))

// ---- Nối ví/danh mục + tạo danh mục còn thiếu (vd Cắt tóc) ----
const { resolveAccountId, resolveCategoryId, catById, created } = buildResolvers(backup, {
  createMissing: true,
  newId: randomUUID,
})

// ---- Khóa chống trùng từ giao dịch đã có ----
const existingKeys = new Set()
for (const t of backup.transactions) {
  if (t.type === 'expense' || t.type === 'income')
    existingKeys.add(makeKey(t.occurred_on, t.type, t.amount, t.account_id, t.note ?? ''))
}

// ---- Biến đổi ----
const now = new Date().toISOString()
const { items, stats } = transformRows(dataRows, {
  resolveAccountId,
  resolveCategoryId,
  existingKeys,
  userId: backup.profile.user_id,
  now,
  newId: randomUUID,
})

// ---- Gộp & xuất ----
const before = backup.transactions.length
backup.transactions.push(...items)
backup.exported_at = now
writeFileSync(outPath, JSON.stringify(backup, null, 2), 'utf-8')

// ---- Báo cáo đối chiếu ----
const nameOfAcc = (id) => backup.accounts.find((a) => a.id === id)?.name ?? id
const topCatName = (id) => {
  const c = catById.get(id) || backup.categories.find((x) => x.id === id)
  if (!c) return id
  return c.parent_id ? catById.get(c.parent_id)?.name ?? c.name : c.name
}

const byAcc = new Map()
const byCat = new Map()
let sumExpense = 0
let sumRefund = 0
let sumIncome = 0
for (const t of items) {
  const a = byAcc.get(nameOfAcc(t.account_id)) ?? { n: 0, chi: 0, thu: 0 }
  a.n++
  if (t.type === 'expense') { if (t.is_refund) sumRefund += t.amount; else { a.chi += t.amount; sumExpense += t.amount } }
  else { a.thu += t.amount; sumIncome += t.amount }
  byAcc.set(nameOfAcc(t.account_id), a)
  const cn = topCatName(t.category_id)
  const cc = byCat.get(cn) ?? { n: 0, tien: 0 }
  cc.n++
  cc.tien += t.type === 'expense' ? (t.is_refund ? -t.amount : t.amount) : t.amount
  byCat.set(cn, cc)
}

const L = []
L.push('═══════════ BÁO CÁO NẠP ZAIM ═══════════')
L.push(`CSV:    ${csvPath}`)
L.push(`Backup: ${backupPath}`)
L.push(`Xuất:   ${outPath}`)
L.push('')
L.push(`Tổng dòng Zaim:        ${fmt(stats.total)}`)
L.push(`→ Đã tạo giao dịch:    ${fmt(stats.imported)}  (backup: ${fmt(before)} → ${fmt(backup.transactions.length)})`)
L.push(`   trong đó hoàn tiền: ${fmt(stats.refund)} · loại khỏi thống kê: ${fmt(stats.excluded)}`)
L.push('')
L.push('BỎ QUA:')
for (const [m, n] of Object.entries(stats.skipMethod)) L.push(`  ${m.padEnd(20)} ${fmt(n)}`)
L.push(`  ${'tiền = 0'.padEnd(20)} ${fmt(stats.skipZero)}`)
L.push(`  ${'trùng đã có'.padEnd(20)} ${fmt(stats.dup)}`)
L.push(`  ${'danh mục bỏ qua'.padEnd(20)} ${fmt(stats.skipCategoryTotal)}`)
for (const [k, n] of Object.entries(stats.skipCategory).sort((a, b) => b[1] - a[1]))
  L.push(`      ${k.padEnd(30)} ${fmt(n)}`)

// Ba nhóm dưới đây LẼ RA phải bằng 0. Khác 0 = mất dòng ngoài ý muốn, không phải
// quyết định thiết kế -> in kèm ví dụ để tra ngược trong CSV.
if (stats.badAmount) {
  L.push(`  ⚠ ${'tiền KHÔNG đọc được'.padEnd(20)} ${fmt(stats.badAmount)}`)
  for (const s of stats.badAmountSamples) L.push(`      ${s.date}  "${s.raw}"  ${s.note}`)
}
if (stats.badDate) {
  L.push(`  ⚠ ${'ngày sai định dạng'.padEnd(20)} ${fmt(stats.badDate)}`)
  for (const s of stats.badDateSamples) L.push(`      "${s.date}"  ${fmt(s.amount)}  ${s.note}`)
}
const nonJpyTotal = Object.values(stats.nonJpy).reduce((a, b) => a + b, 0)
if (nonJpyTotal) {
  L.push(`  ⚠ ${'tiền tệ khác JPY'.padEnd(20)} ${fmt(nonJpyTotal)}`)
  for (const [c, n] of Object.entries(stats.nonJpy)) L.push(`      ${c}  ${fmt(n)} dòng`)
}
if (stats.badColumns) L.push(`  ⚠ ${'dòng LỆCH SỐ CỘT'.padEnd(20)} ${fmt(stats.badColumns)}`)

// Chốt sổ: mọi dòng CSV phải được kể tên ở đúng một chỗ.
const accounted =
  stats.imported +
  Object.values(stats.skipMethod).reduce((a, b) => a + b, 0) +
  stats.skipZero +
  stats.badAmount +
  stats.badColumns +
  stats.badDate +
  nonJpyTotal +
  stats.skipCategoryTotal +
  stats.dup
L.push('')
L.push(
  accounted === stats.total
    ? `Chốt sổ: ${fmt(accounted)}/${fmt(stats.total)} dòng đều được kể tên ✓`
    : `⚠ Chốt sổ LỆCH: kể tên ${fmt(accounted)} / tổng ${fmt(stats.total)} dòng`,
)
L.push('')
if (created.length) { L.push(`Danh mục MỚI đã tạo: ${created.join(', ')}`); L.push('') }
L.push('THEO TÀI KHOẢN (Chi / Thu, ¥):')
for (const [name, a] of [...byAcc.entries()].sort((x, y) => y[1].n - x[1].n))
  L.push(`  ${name.padEnd(16)} ${String(a.n).padStart(6)} dòng   Chi ${fmt(a.chi).padStart(12)}   Thu ${fmt(a.thu).padStart(12)}`)
L.push('')
L.push('THEO NHÓM DANH MỤC (¥, chi hoàn tiền tính âm):')
for (const [name, c] of [...byCat.entries()].sort((x, y) => Math.abs(y[1].tien) - Math.abs(x[1].tien)))
  L.push(`  ${name.padEnd(20)} ${String(c.n).padStart(6)} dòng   ${fmt(c.tien).padStart(14)}`)
L.push('')
L.push('TỔNG:')
L.push(`  Chi (đã trừ hoàn tiền): ${fmt(sumExpense - sumRefund)} ¥   (chi gộp ${fmt(sumExpense)}, hoàn ${fmt(sumRefund)})`)
L.push(`  Thu:                    ${fmt(sumIncome)} ¥`)
L.push('══════════════════════════════════════════')

const report = L.join('\n')
console.log(report)
writeFileSync(path.join(path.dirname(outPath), 'zaim-import-report.txt'), report, 'utf-8')
