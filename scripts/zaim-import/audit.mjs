// Đối chiếu dữ liệu Zaim đã nạp: "app đang có ĐỦ chưa" và "có bị gán NHẦM NHÓM không".
//
// Dùng:
//   node scripts/zaim-import/audit.mjs <zaim.csv> <backup-moi-xuat.json>
//
// Backup phải là bản xuất MỚI từ app SAU khi đã khôi phục (Cài đặt → Dữ liệu → Sao lưu →
// Xuất dữ liệu) — không phải file `-them-zaim.json` do run.mjs tạo. Có vậy mới biết những
// gì thật sự nằm trong app, thay vì chỉ biết script đã dựng ra gì.
//
// Chỉ đọc file, không ghi gì vào app, không gọi mạng.

import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parseCsv } from './csv.mjs'
import { transformRows } from './transform.mjs'
import { buildResolvers } from './resolve.mjs'
import {
  reconcile,
  reviewMapping,
  reviewWallets,
  balanceImpact,
  categoryPathIndex,
} from './audit-lib.mjs'

const csvPath = process.argv[2]
const backupPath = process.argv[3]
if (!csvPath || !backupPath) {
  console.error('Dùng: node scripts/zaim-import/audit.mjs <zaim.csv> <backup-moi-xuat.json>')
  process.exit(1)
}

const fmt = (n) => Math.round(n).toLocaleString('ja-JP')
const pad = (s, n) => String(s).padEnd(n)
const num = (s, n) => String(s).padStart(n)

const dataRows = parseCsv(readFileSync(csvPath, 'utf-8')).slice(1)
const backup = JSON.parse(readFileSync(backupPath, 'utf-8'))

// ---- Dựng lại bộ giao dịch KỲ VỌNG từ CSV, đúng luật mà run.mjs đã dùng ----
// existingKeys rỗng: ở đây cần "CSV lẽ ra sinh ra những gì", còn chuyện dòng nào trùng với
// giao dịch nhập tay thì phần đối chiếu tự xử (trùng khóa nên vẫn khớp).
const { resolveAccountId, resolveCategoryId, problems } = buildResolvers(backup)
let seq = 0
const { items: expected, stats } = transformRows(dataRows, {
  resolveAccountId,
  resolveCategoryId,
  existingKeys: new Set(),
  userId: backup.profile?.user_id ?? 'user',
  now: '1970-01-01T00:00:00.000Z',
  newId: () => `exp-${++seq}`,
})

// ---- Bộ giao dịch THỰC CÓ trong app ----
const actual = (backup.transactions ?? []).filter(
  (t) => t.type === 'expense' || t.type === 'income',
)
const r = reconcile(expected, actual)

// ---- Báo cáo ----
const L = []
const accName = new Map((backup.accounts ?? []).map((a) => [a.id, a.name]))
const catPath = categoryPathIndex(backup.categories ?? [])
const nonJpyTotal = Object.values(stats.nonJpy).reduce((a, b) => a + b, 0)
const skipMethodTotal = Object.values(stats.skipMethod).reduce((a, b) => a + b, 0)

L.push('════════════ ĐỐI CHIẾU ZAIM ↔ APP ════════════')
L.push(`CSV:    ${csvPath}`)
L.push(`Backup: ${backupPath}   (xuất lúc ${backup.exported_at ?? '?'})`)
L.push('')

// --- KẾT LUẬN trước, chi tiết sau ---
L.push('───── KẾT LUẬN ─────')
L.push(
  r.isComplete
    ? `✓ ĐỦ: cả ${fmt(expected.length)} giao dịch CSV lẽ ra phải có đều đang nằm trong app.`
    : `✗ THIẾU ${fmt(r.missing.length)} / ${fmt(expected.length)} giao dịch ` +
      `(${fmt(r.missing.reduce((a, t) => a + t.amount, 0))} ¥) — chi tiết ở phần B.`,
)
L.push(
  `  Không nạp THEO THIẾT KẾ: ${fmt(
    skipMethodTotal + stats.skipZero + stats.skipCategoryTotal,
  )} dòng (chuyển khoản/điều chỉnh số dư, tiền 0, danh mục đã chốt bỏ).`,
)
const lostTotal = stats.badAmount + stats.badDate + stats.badColumns + nonJpyTotal
if (lostTotal)
  L.push(
    `  ⚠ MẤT NGOÀI Ý MUỐN: ${fmt(lostTotal)} dòng (tiền không đọc được ${stats.badAmount}, ` +
      `ngày sai ${stats.badDate}, lệch cột ${stats.badColumns}, khác JPY ${nonJpyTotal}).`,
  )
else L.push('  ✓ Không có dòng nào mất vì lỗi đọc cột/số/ngày/tiền tệ.')
const flagged = reviewMapping(dataRows).filter((m) => !m.skipped && (m.toOther || m.guessed))
if (flagged.length)
  L.push(
    `  ⚠ ${flagged.length} cặp danh mục cần soát lại (rơi vào "Khác" hoặc là phỏng đoán) — phần C.`,
  )
if (problems.length) {
  L.push('  ⚠ Backup thiếu tài khoản/danh mục mà bảng nối cần:')
  for (const p of [...new Set(problems)]) L.push(`      ${p}`)
}
L.push('')

// --- A. Sổ dòng CSV ---
L.push('───── A. CSV có gì ─────')
L.push(`Tổng dòng CSV:              ${num(fmt(stats.total), 8)}`)
L.push(`Lẽ ra nạp vào app:          ${num(fmt(expected.length), 8)}`)
L.push(`  trong đó hoàn tiền:       ${num(fmt(stats.refund), 8)}`)
L.push(`  loại khỏi thống kê:       ${num(fmt(stats.excluded), 8)}`)
L.push('Không nạp:')
for (const [m, n] of Object.entries(stats.skipMethod))
  L.push(`  ${pad(m + ' (Zaim)', 26)}${num(fmt(n), 8)}`)
L.push(`  ${pad('tiền = 0 / ô rỗng', 26)}${num(fmt(stats.skipZero), 8)}`)
L.push(`  ${pad('danh mục đã chốt bỏ', 26)}${num(fmt(stats.skipCategoryTotal), 8)}`)
for (const [k, n] of Object.entries(stats.skipCategory).sort((a, b) => b[1] - a[1]))
  L.push(`      ${pad(k, 30)}${num(fmt(n), 6)}`)
if (stats.badAmount) {
  L.push(`  ⚠ ${pad('tiền KHÔNG đọc được', 24)}${num(fmt(stats.badAmount), 8)}`)
  for (const s of stats.badAmountSamples) L.push(`      ${s.date}  "${s.raw}"  ${s.note}`)
}
if (stats.badDate) {
  L.push(`  ⚠ ${pad('ngày sai định dạng', 24)}${num(fmt(stats.badDate), 8)}`)
  for (const s of stats.badDateSamples) L.push(`      "${s.date}"  ${fmt(s.amount)}  ${s.note}`)
}
if (nonJpyTotal) {
  L.push(`  ⚠ ${pad('tiền tệ khác JPY', 24)}${num(fmt(nonJpyTotal), 8)}`)
  for (const [c, n] of Object.entries(stats.nonJpy)) L.push(`      ${c}: ${fmt(n)} dòng`)
}
if (stats.badColumns) L.push(`  ⚠ ${pad('dòng LỆCH SỐ CỘT', 24)}${num(fmt(stats.badColumns), 8)}`)
const accounted =
  expected.length +
  skipMethodTotal +
  stats.skipZero +
  stats.badAmount +
  stats.badColumns +
  stats.badDate +
  nonJpyTotal +
  stats.skipCategoryTotal +
  stats.dup
L.push(
  accounted === stats.total
    ? `Chốt sổ: ${fmt(accounted)}/${fmt(stats.total)} dòng đều được kể tên ✓`
    : `⚠ Chốt sổ LỆCH: kể tên ${fmt(accounted)} / tổng ${fmt(stats.total)}`,
)
L.push('')

// --- B. App có đủ chưa ---
L.push('───── B. App có đủ chưa ─────')
L.push(`Giao dịch Chi/Thu trong app: ${fmt(actual.length)}`)
L.push(`  khớp với CSV:              ${fmt(r.matched)}`)
L.push(`  CSV có mà app THIẾU:       ${fmt(r.missing.length)}`)
L.push(`  app có mà CSV không có:    ${fmt(r.extra.length)}  (giao dịch tự nhập — bình thường)`)
if (r.missing.length) {
  L.push('')
  L.push('Tháng bị hụt (chỉ liệt kê tháng thiếu):')
  L.push(`  ${pad('Tháng', 9)}${num('cần', 7)}${num('có', 7)}${num('thiếu', 7)}   ${'tiền thiếu'}`)
  for (const m of r.byMonth.filter((x) => x.missing > 0))
    L.push(
      `  ${pad(m.month, 9)}${num(fmt(m.expected), 7)}${num(fmt(m.found), 7)}` +
        `${num(fmt(m.missing), 7)}   ${fmt(m.missingAmount)} ¥`,
    )
  L.push('')
  L.push('20 dòng thiếu đầu tiên:')
  for (const t of r.missing.slice(0, 20))
    L.push(
      `  ${t.occurred_on}  ${pad(t.type === 'expense' ? 'chi' : 'thu', 4)}` +
        `${num(fmt(t.amount), 10)} ¥  ${pad(accName.get(t.account_id) ?? '?', 14)}` +
        `${pad(catPath.get(t.category_id) ?? '?', 22)}${t.note}`,
    )
} else {
  L.push('')
  L.push('Theo năm (đối chiếu nhanh với màn tổng kết của Zaim):')
  const byYear = new Map()
  for (const m of r.byMonth) {
    const y = m.month.slice(0, 4)
    const e = byYear.get(y) ?? { n: 0, tien: 0 }
    e.n += m.expected
    e.tien += m.expectedAmount
    byYear.set(y, e)
  }
  for (const [y, e] of [...byYear.entries()].sort())
    L.push(`  ${y}   ${num(fmt(e.n), 7)} dòng   ${num(fmt(e.tien), 14)} ¥`)
}
L.push('')

// --- C. Nhóm có đúng không ---
L.push('───── C. Bảng nối danh mục ─────')
L.push('Cờ:  ✗ bỏ hẳn · ! rơi vào "Khác" · ^ gán vào NHÓM CHA (ngân sách không thấy) · ? phỏng đoán')
L.push(`  ${pad('Zaim (nhóm>chi tiết)', 34)}${num('dòng', 7)}${num('tiền ¥', 13)}  cờ  → app`)
for (const m of reviewMapping(dataRows)) {
  const flags =
    (m.skipped ? '✗' : ' ') + (m.toOther ? '!' : ' ') + (m.toParent ? '^' : ' ') + (m.guessed ? '?' : ' ')
  L.push(
    `  ${pad(m.key, 34)}${num(fmt(m.count), 7)}${num(fmt(m.sum), 13)}  ${flags}  ` +
      `${m.skipped ? '(không nạp)' : m.path}`,
  )
}
L.push('')
L.push('Cần soát lại (rơi vào "Khác" hoặc phỏng đoán, đã bỏ các cặp chốt-không-nạp):')
if (!flagged.length) L.push('  (không có)')
for (const m of flagged)
  L.push(`  ${pad(m.key, 34)}${num(fmt(m.count), 7)} dòng → ${m.path}${m.guessed ? '  [đoán]' : ''}`)
L.push('')

// --- D. Ví -> tài khoản ---
L.push('───── D. Bảng nối ví ─────')
L.push(`  ${pad('Ví Zaim', 24)}${num('dòng', 7)}${num('tiền ¥', 13)}  → tài khoản app`)
let defRows = 0
for (const w of reviewWallets(dataRows)) {
  if (w.isDefault) defRows += w.count
  L.push(
    `  ${pad(w.wallet, 24)}${num(fmt(w.count), 7)}${num(fmt(w.sum), 13)}  ` +
      `${w.isDefault ? '⚠ mặc định → ' : '→ '}${w.account}`,
  )
}
L.push('')
L.push(`⚠ ${fmt(defRows)} dòng không nối được ví, dồn hết vào "mặc định".`)
L.push('   Nếu con số này lớn thì số dư/lịch sử của tài khoản đó bị pha trộn nhiều ví khác nhau.')
L.push('')

// --- E. Hệ quả lên số dư ---
L.push('───── E. Ảnh hưởng lên SỐ DƯ tài khoản ─────')
L.push('Số dư app = số dư ban đầu + tổng giao dịch. Nạp 9 năm lịch sử vào là cộng thêm phần')
L.push('ròng dưới đây; "số dư ban đầu" của tài khoản chưa biết gì về nó, nên số dư hiện tại')
L.push('lệch đúng bằng con số này. Sửa bằng: mở từng tài khoản → Điều chỉnh số dư về số thực.')
L.push('')
L.push(`  ${pad('Tài khoản', 18)}${num('dòng', 7)}${num('thu +', 14)}${num('chi −', 14)}${num('ròng', 14)}`)
for (const b of balanceImpact(actual, (id) => accName.get(id) ?? id))
  L.push(
    `  ${pad(b.account, 18)}${num(fmt(b.count), 7)}${num(fmt(b.income), 14)}` +
      `${num(fmt(b.expense), 14)}${num(fmt(b.net), 14)}`,
  )
L.push('══════════════════════════════════════════════')

const report = L.join('\n')
console.log(report)
const outPath = path.join(path.dirname(backupPath), 'zaim-audit-report.txt')
writeFileSync(outPath, report, 'utf-8')
console.log(`\n(Đã lưu: ${outPath})`)
