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
// Ban THUONG gia dinh moi truong da co san mot vai tinh nang JS ma trinh duyet hien
// dai co nhung ban Node dang chay day CO THE chua co: Uint8Array.prototype.toHex,
// Map/WeakMap.prototype.getOrInsertComputed, Math.sumPrecise, DOMMatrix. Ban
// `legacy` tu polyfill nhung thu nay (vi no nham vao moi truong cu, ke ca Node);
// ban THUONG thi khong, vi no gia dinh trinh duyet da co san. Cac polyfill toi
// thieu duoi day CHI de ban THUONG chay duoc trong Node dang dung — chung phuc vu
// bam van ban/dung luong/dan xuat khoa ma hoa, KHONG dung toi phep tinh toa do x,y,
// va khong ton tai trong san pham chay that (trinh duyet that da co san).
//
// Chay: node scripts/phieu-luong/chot-hai-ban-dung.mjs "C:/Users/TranTriNguyen/Downloads/Bang luong"
import { readFileSync, readdirSync } from 'node:fs'

// --- Polyfill toi thieu de ban PDFJS "THUONG" chay duoc trong Node (xem ghi chu tren) ---
if (typeof globalThis.DOMMatrix === 'undefined') {
  globalThis.DOMMatrix = class DOMMatrix {}
}
if (!Uint8Array.prototype.toHex) {
  Uint8Array.prototype.toHex = function toHex() {
    return Array.from(this, (b) => b.toString(16).padStart(2, '0')).join('')
  }
}
for (const Coll of [Map, WeakMap]) {
  if (!Coll.prototype.getOrInsertComputed) {
    Coll.prototype.getOrInsertComputed = function getOrInsertComputed(key, taoGiaTri) {
      if (!this.has(key)) this.set(key, taoGiaTri(key))
      return this.get(key)
    }
  }
}
if (!Math.sumPrecise) {
  Math.sumPrecise = (items) => {
    let tong = 0
    for (const n of items) tong += n
    return tong
  }
}

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
    isEvalSupported: false,
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
