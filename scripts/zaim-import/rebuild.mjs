// Dựng lại backup SẠCH từ file app HIỆN TẠI (đã lỡ nhập Zaim bản cũ/messy).
//
// Vì sao cần: merge thường chỉ THÊM, không xóa — mà chống trùng lại theo nội dung,
// nên nạp Zaim sạch đè lên file đã có Zaim cũ sẽ "không thêm gì" và rác cũ vẫn nguyên.
// Script này: gỡ mọi giao dịch Zaim cũ (nhận diện bằng khóa CSV) -> giữ giao dịch TAY
// (gồm cả 11 dòng nhập gần đây) -> nạp lại Zaim theo luật SẠCH hiện tại.
//
// Dùng: node scripts/zaim-import/rebuild.mjs [csv] [backup-hien-tai] [out]

import { readFileSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { parseCsv } from './csv.mjs'
import { transformRows, makeKey, buildNote, parseYen, normalizeRow, ZAIM_COL } from './transform.mjs'
import { buildResolvers } from './resolve.mjs'

const DL = path.join(process.env.USERPROFILE ?? process.env.HOME ?? '.', 'Downloads')
const csvPath = process.argv[2] || path.join(DL, 'Zaim.20260731114811-UTF-08.csv')
const backupPath = process.argv[3] || path.join(DL, 'so-chi-tieu-backup-2026-08-04.json')
const outPath =
  process.argv[4] ||
  path.join(path.dirname(backupPath), path.basename(backupPath, '.json') + '-sach.json')

const fmt = (n) => n.toLocaleString('ja-JP')

const csvRows = parseCsv(readFileSync(csvPath, 'utf-8'))
const dataRows = csvRows.slice(1)
const backup = JSON.parse(readFileSync(backupPath, 'utf-8'))

// Nối ví/danh mục theo CHÍNH backup hiện tại + tạo danh mục còn thiếu (vd Cắt tóc).
const { resolveAccountId, resolveCategoryId, created } = buildResolvers(backup, {
  createMissing: true,
  newId: randomUUID,
})

// ---- Tập khóa của MỌI dòng Zaim (chi + thu), để nhận diện giao dịch Zaim cũ trong backup ----
// Dùng CÙNG cách nối ví + ghi chú như lúc nạp, nên khóa của bản Zaim cũ sẽ trùng khóa CSV.
// Không xét 振替/balance: chuyển khoản trong backup coi là dữ liệu tay (bản cũ không nạp
// chuyển khoản Zaim — số chuyển khoản trong file vẫn = 4 như bản gốc).
const zaimKeys = new Set()
for (const raw of dataRows) {
  const row = normalizeRow(raw)
  if (!row) continue
  const method = row[ZAIM_COL.method]
  if (method !== 'payment' && method !== 'income') continue
  const currency = (row[ZAIM_COL.currency] ?? '').trim()
  if (currency !== '' && currency !== 'JPY') continue
  const type = method === 'payment' ? 'expense' : 'income'
  const val = parseYen(type === 'expense' ? row[ZAIM_COL.expense] : row[ZAIM_COL.income])
  if (val === null || Number.isNaN(val) || val === 0) continue
  const amount = Math.abs(val)
  const wallet = type === 'expense' ? row[ZAIM_COL.fromWallet] : row[ZAIM_COL.toWallet]
  const account_id = resolveAccountId(wallet)
  zaimKeys.add(makeKey(row[ZAIM_COL.date], type, amount, account_id, buildNote(row)))
}

// ---- Tách backup: giữ giao dịch TAY (không khớp Zaim), gỡ Zaim cũ ----
const manual = []
const removedSamples = []
let removedOld = 0
for (const t of backup.transactions) {
  if (t.type === 'transfer') {
    manual.push(t) // chuyển khoản: luôn coi là dữ liệu tay
    continue
  }
  const key = makeKey(t.occurred_on, t.type, t.amount, t.account_id, t.note ?? '')
  if (zaimKeys.has(key)) {
    removedOld++
    if (removedSamples.length < 3) removedSamples.push(`${t.occurred_on} ¥${fmt(t.amount)} ${(t.note ?? '').slice(0, 30)}`)
    continue
  }
  manual.push(t)
}

// ---- Zaim sạch không được đè lên giao dịch TAY còn giữ ----
const existingKeys = new Set()
for (const t of manual)
  existingKeys.add(makeKey(t.occurred_on, t.type, t.amount, t.account_id, t.note ?? '', t.to_account_id ?? null))

// ---- Nạp Zaim theo luật SẠCH hiện tại ----
const now = new Date().toISOString()
const { items, stats } = transformRows(dataRows, {
  resolveAccountId,
  resolveCategoryId,
  existingKeys,
  userId: backup.profile.user_id,
  now,
  newId: randomUUID,
})

const beforeCount = backup.transactions.length
backup.transactions = [...manual, ...items]
backup.exported_at = now
writeFileSync(outPath, JSON.stringify(backup, null, 2), 'utf-8')

// ---- Báo cáo ----
const manualByType = {}
for (const t of manual) manualByType[t.type] = (manualByType[t.type] || 0) + 1
const L = []
L.push('═══════════ DỰNG LẠI BACKUP SẠCH ═══════════')
L.push(`CSV:    ${csvPath}`)
L.push(`Backup: ${backupPath}`)
L.push(`Xuất:   ${outPath}`)
L.push('')
L.push(`Backup hiện tại:          ${fmt(beforeCount)} giao dịch`)
L.push(`→ Gỡ Zaim CŨ (khớp CSV):  ${fmt(removedOld)}`)
for (const s of removedSamples) L.push(`      vd: ${s}`)
L.push(`→ Giữ giao dịch TAY:      ${fmt(manual.length)}  ${JSON.stringify(manualByType)}`)
L.push(`→ Nạp Zaim SẠCH:          ${fmt(items.length)}  (chi ${fmt(items.filter((t) => t.type === 'expense').length)} · thu ${fmt(items.filter((t) => t.type === 'income').length)})`)
L.push(`   trong đó bỏ chuyển tiền (Khác): ${fmt(stats.skipOutgoingTransfer)}`)
L.push('')
L.push(`TỔNG cuối:                ${fmt(backup.transactions.length)} giao dịch`)
if (created.length) L.push(`Danh mục MỚI đã tạo: ${created.join(', ')}`)
L.push('══════════════════════════════════════════')
const report = L.join('\n')
console.log(report)
