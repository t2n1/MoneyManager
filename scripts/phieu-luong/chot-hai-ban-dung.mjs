// CHOT HAI BAN DUNG PDFJS — bang chung PHIA TRINH DUYET cho di tru phieu luong.
//
// boc.ts khong doi giua Node va trinh duyet, chi adapter doc PDF khac nhau:
// docPdfNode.mjs (da chot 60/60, xem chot-di-tru.mjs) dung ban `legacy` cua
// pdfjs-dist; docPdfWeb.ts (trinh duyet) nap ban THUONG (`pdfjs-dist/build/pdf.mjs`,
// dung cho bare `import('pdfjs-dist')` ma Vite se bundle). Khong the chay
// docPdfWeb.ts thang trong Node (dung `import('pdfjs-dist')` DONG va import worker
// qua Vite `?url`), va trinh duyet khong doc duoc thu muc PDF cuc bo de lam mot ban
// Step-5-kieu-DevTools (server.fs.allow chan fetch('/@fs/...'), khong duoc noi long).
//
// Gate nay la bang chung THAY THE: chung minh hai composite build cua pdfjs-dist —
// `legacy` (Node dang dung) va ban THUONG (trinh duyet se dung) — tra ve DUNG CUNG
// toa do x,y cho MOI chunk chu, tren toan bo phieu that. Neu dung 100%, ket qua
// 60/60 cua chot-di-tru.mjs la bang chung hop le cho ca duong di trinh duyet, du
// chua tung chay qua DevTools that.
//
// KHONG co polyfill tu viet trong file nay. Ban THUONG dung 5 API JS ma Node dang
// chay day (v24.14.1) chua co san: DOMMatrix, Uint8Array.prototype.toHex,
// Map.prototype.getOrInsertComputed, WeakMap.prototype.getOrInsertComputed,
// Math.sumPrecise — nhung ban `legacy` TU CAI polyfill CUA CHINH pdf.js cho CA 5 thu
// nay ngay khi import (da do: truoc khi import legacy ca 5 deu `undefined`; ngay sau
// khi import legacy ca 5 deu la `function`). Vi vay import ban `legacy` TRUOC ban
// THUONG trong file nay — ban THUONG se ke thua dung polyfill CUA PDF.JS, khong
// phai ban tu viet tay. Truoc ban sua nay, file co 4 polyfill tu viet (Map/WeakMap
// dung chung 1 vong lap); mot lan sabotage Math.sumPrecise tra ve 0 cho thay pdf.js
// dung that ham do (~230 loi RangeError khi doc that) nhung gate van in 60/60 —
// nghia la polyfill tu viet che mat sai lech co the co O CHINH CAI HAM DUNG DE SO
// SANH. Xoa polyfill tu viet la de tranh dung mot lan nua.
//
// Du con lai (khong sua duoc trong pham vi Node): gate nay chay qua
// `build/pdf.worker.mjs` (ban KHONG minify, vi Node khong co Worker that nen pdf.js
// tu rot ve "fake worker" chay ngay trong tien trinh, xem GlobalWorkerOptions trong
// build/pdf.mjs). docPdfWeb.ts (trinh duyet) tro workerSrc toi
// `build/pdf.worker.min.mjs` (ban DA minify) va chay qua Worker that. Cung mot ma
// nguon, chi khac minify hay khong — khong anh huong toa do, nhung ghi lai de trung
// thuc ve pham vi bang chung.
//
// Chay: node scripts/phieu-luong/chot-hai-ban-dung.mjs "C:/Users/TranTriNguyen/Downloads/Bang luong"
import { readFileSync, readdirSync } from 'node:fs'

// Import legacy TRUOC: day la buoc cai polyfill (xem ghi chu tren), khong chi la
// mot lan trich xuat.
const pdfjsLegacy = await import('pdfjs-dist/legacy/build/pdf.mjs')
const pdfjsThuong = await import('pdfjs-dist/build/pdf.mjs')
const { bocPhieu } = await import('../../src/features/phieu-luong/boc.ts')

const thuMuc = process.argv[2]
if (!thuMuc) {
  console.error('Dung: node scripts/phieu-luong/chot-hai-ban-dung.mjs <thu-muc-pdf>')
  process.exit(1)
}

/** @returns {Promise<{text:string,x:number,y:number}[]>} */
async function trichOChu(pdfjs, duongDan) {
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(readFileSync(duongDan)),
    // PDF phieu luong ma hoa AES voi mat khau RONG
    password: '',
    useSystemFonts: false,
  }).promise
  try {
    const page = await doc.getPage(1)
    const caoTrang = page.getViewport({ scale: 1 }).viewBox[3]
    const tc = await page.getTextContent({ includeMarkedContent: false })
    return tc.items
      .filter((it) => 'str' in it)
      .map((it) => ({ text: it.str.trim(), x: it.transform[4], y: caoTrang - it.transform[5] }))
      .filter((o) => o.text !== '')
  } finally {
    await doc.cleanup()
  }
}

// So sanh o CAP DO TOA DO, khong phai o cap do so cuoi cung: so nguyen van cac so
// bong ra (gross/net/...) se LOT QUA ca khi toa do da lech, vi boc.ts co do co gian
// trong nguong ghep. Diem cua gate nay la bat lech TRUOC khi do co gian nuot mat no.
const boChuoi = (oChu) => oChu.map((o) => `${o.text}@${o.x.toFixed(3)},${o.y.toFixed(3)}`).join('|')

const files = readdirSync(thuMuc).filter((f) => f.endsWith('.pdf')).sort()
if (!files.length) {
  console.error(`Khong tim thay file .pdf nao trong "${thuMuc}"`)
  process.exit(1)
}

let khop = 0
const lech = []
for (const f of files) {
  const duongDan = `${thuMuc}/${f}`
  try {
    const [a, b] = await Promise.all([
      trichOChu(pdfjsLegacy, duongDan),
      trichOChu(pdfjsThuong, duongDan),
    ])
    const giongToaDo = boChuoi(a) === boChuoi(b)
    const phieu = bocPhieu(b, f)
    if (giongToaDo && phieu.loi.length === 0) khop++
    else lech.push([f, !giongToaDo ? 'LECH TOA DO giua legacy va ban thuong' : `bocPhieu tren ban thuong bao loi: ${phieu.loi.join(' ; ')}`])
  } catch (e) {
    lech.push([f, `EXC ${e.name}: ${e.message}`])
  }
}

console.log(`\n=== legacy vs ban thuong: ${khop}/${files.length} toa do GIONG HET ===\n`)
for (const [f, ly] of lech.slice(0, 6)) console.log(`X ${f}\n   ${ly}`)
process.exit(khop === files.length ? 0 : 1)
