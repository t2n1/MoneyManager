// CHOT DI TRU — dieu kien BAT BUOC de duoc xoa boc.py.
//
// So ban TS voi pypdf-chuan.json do pypdf sinh. Phai 60/60 khop TUYET DOI tung con
// so. Khong dat thi KHONG xoa boc.py.
//
// boc.py DA BI XOA (commit 44c9253). De sinh lai pypdf-chuan.json:
//   git show 44c9253^:scripts/phieu-luong/boc.py > /tmp/boc.py
//   python /tmp/boc.py "<thu muc>" -o /tmp/pypdf-chuan.json   (can pypdf: pip install pypdf)
//
// Chay:
//   node scripts/phieu-luong/chot-di-tru.mjs "<thu muc>" /tmp/pypdf-chuan.json
import { readFileSync, readdirSync } from 'node:fs'
import { docPdfNode } from './docPdfNode.mjs'

const { bocPhieu } = await import('../../src/features/phieu-luong/boc.ts')

const [thuMuc, duongChuan] = process.argv.slice(2)
if (!thuMuc || !duongChuan) {
  console.error('Dung: node scripts/phieu-luong/chot-di-tru.mjs <thu-muc-pdf> <pypdf-chuan.json>')
  process.exit(1)
}
const chuan = JSON.parse(readFileSync(duongChuan, 'utf8'))
const files = readdirSync(thuMuc).filter((f) => f.endsWith('.pdf')).sort()
if (!files.length) {
  console.error(`Khong tim thay file .pdf nao trong "${thuMuc}"`)
  process.exit(1)
}

// So TUNG TRUONG, khong so ca doi tuong: pypdf dung snake_case, boc.ts dung camelCase.
//
// Nam truong duoi day tung bi BO SOT khoi phep so, va do la lo hong nghiem trong:
// `nhan_la` la co che phat hien khi tap nhan da biet (BIET_HET) giua hai ban lech
// nhau, con `loi` la tang tu kiem cuoi cung. Bo sot chung nghia la boc.ts co the sai
// o do ma chot van xanh 60/60 — va sau khi boc.py bi xoa thi khong con cach nao
// phat hien nua.
//
// `canh_bao` va `loi` CHI so SO LUONG, co chu y: hai ban viet chu khac nhau (Python
// khong dau "thieu"/"ky lech", TS co dau "thiếu"/"kỳ lệch"). So nguyen van la bao
// dong gia ca 60 file. So so luong van bat duoc lech NGHIA: ca hai phai cung thay
// loi, hoac cung khong. DUNG "sua" thanh so nguyen van.
const mang = (a) => JSON.stringify([...(a ?? [])].sort())
const sanh = (ts, py) =>
  ts.gross === py.gross && ts.deductTotal === py.deduct_total &&
  ts.net === py.net && ts.bank === py.bank &&
  ts.period === py.period && ts.kind === py.kind &&
  ts.empno === py.empno && ts.nguonKy === py.nguon_ky &&
  mang(ts.nhanLa) === mang(py.nhan_la) &&
  (ts.canhBao ?? []).length === (py.canh_bao ?? []).length &&
  (ts.loi ?? []).length === (py.loi ?? []).length &&
  JSON.stringify(ts.tru, Object.keys(ts.tru).sort()) ===
    JSON.stringify(py.tru, Object.keys(py.tru).sort()) &&
  JSON.stringify(ts.ngoaiTong, Object.keys(ts.ngoaiTong).sort()) ===
    JSON.stringify(py.ngoai_tong, Object.keys(py.ngoai_tong).sort())

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
