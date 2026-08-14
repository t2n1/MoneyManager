// CHOT DI TRU — dieu kien BAT BUOC de duoc xoa boc.py.
//
// So ban TS voi phieu-luong.json do pypdf sinh. Phai 60/60 khop TUYET DOI tung con
// so. Khong dat thi KHONG xoa boc.py.
//
// Chay:
//   python scripts/phieu-luong/boc.py "<thu muc>" -o /tmp/pypdf.json   (ban chuan)
//   node scripts/phieu-luong/chot-di-tru.mjs "<thu muc>" /tmp/pypdf.json
import { readFileSync, readdirSync } from 'node:fs'
import { docPdfNode } from './docPdfNode.mjs'

const { bocPhieu } = await import('../../src/features/phieu-luong/boc.ts')

const [thuMuc, duongChuan] = process.argv.slice(2)
if (!thuMuc || !duongChuan) {
  console.error('Dung: node scripts/phieu-luong/chot-di-tru.mjs <thu-muc-pdf> <pypdf.json>')
  process.exit(1)
}
const chuan = JSON.parse(readFileSync(duongChuan, 'utf8'))
const files = readdirSync(thuMuc).filter((f) => f.endsWith('.pdf')).sort()

// pypdf dung snake_case, boc.ts dung camelCase — so tung truong, khong so ca doi tuong.
const sanh = (ts, py) =>
  ts.gross === py.gross && ts.deductTotal === py.deduct_total &&
  ts.net === py.net && ts.bank === py.bank &&
  JSON.stringify(ts.tru, Object.keys(ts.tru).sort()) ===
    JSON.stringify(py.tru, Object.keys(py.tru).sort()) &&
  JSON.stringify(ts.ngoaiTong, Object.keys(ts.ngoaiTong).sort()) ===
    JSON.stringify(py.ngoai_tong, Object.keys(py.ngoai_tong).sort()) &&
  ts.period === py.period && ts.kind === py.kind

let khop = 0
const lech = []
for (const f of files) {
  const py = chuan.find((r) => r.file === f)
  if (!py) { lech.push([f, 'khong co trong ban chuan pypdf']); continue }
  try {
    const ts = bocPhieu(await docPdfNode(`${thuMuc}/${f}`), f)
    if (sanh(ts, py)) khop++
    else lech.push([f, JSON.stringify({ ts, py }).slice(0, 500)])
  } catch (e) {
    lech.push([f, `EXC ${e.name}: ${e.message}`])
  }
}
console.log(`\n=== CHOT DI TRU: ${khop}/${files.length} khop tuyet doi ===\n`)
for (const [f, r] of lech) console.log(`X ${f}\n   ${r}`)
process.exit(khop === files.length ? 0 : 1)
