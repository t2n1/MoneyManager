// Adapter Node: doc PDF -> OChu[] da LAT y. Ban legacy vi chay trong Node.
//
// Vi sao lat y o DAY chu khong trong boc.ts: pdf.js do y tu DINH trang, pypdf tu
// DAY. Do that tren mot phieu 2022: nhan y=283.3 (pypdf) <-> y=311.7 (pdf.js), so
// y=309.5 <-> y=285.5 — ca hai cap cong lai dung 595 = chieu cao trang.
// boc.ts lam viec trong he "y tang len tren" cua pypdf, va MOI hang so da tinh
// chinh theo he do. Dua phep lat vao boc.ts la tron hai viec, va nguoi sua sau
// khong biet hang so thuoc he nao.
import { readFileSync } from 'node:fs'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'

/** @returns {Promise<{text:string,x:number,y:number}[]>} */
export async function docPdfNode(duongDan) {
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(readFileSync(duongDan)),
    // PDF phieu luong ma hoa AES voi mat khau RONG
    password: '',
    isEvalSupported: false,
  }).promise
  const page = await doc.getPage(1)
  const caoTrang = page.getViewport({ scale: 1 }).viewBox[3]
  const tc = await page.getTextContent({ includeMarkedContent: false })
  return tc.items
    .map((it) => ({ text: (it.str || '').trim(), x: it.transform[4], y: caoTrang - it.transform[5] }))
    .filter((o) => o.text !== '')
}
