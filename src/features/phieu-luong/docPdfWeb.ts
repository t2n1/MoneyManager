// Adapter trinh duyet: File -> OChu[] da lat y.
//
// pdfjs-dist NAP DONG: chunk pdf.js nang 1,8 MB (0,5 minified + 1,3 worker), trong
// khi toan bo dist/assets hien tai la 2,0 MB. Import cung la gan gap doi trong luong
// app cho MOI nguoi dung, ke ca ai khong bao gio mo trang nay.
import type { OChu } from './boc'

/** pdf.js do y tu DINH trang; boc.ts lam viec trong he cua pypdf (y tang len tren). */
export function latY(y: number, caoTrang: number): number {
  return caoTrang - y
}

export async function docPdfWeb(file: File): Promise<OChu[]> {
  const pdfjs = await import('pdfjs-dist')
  // Worker phai tro dung file trong bundle; Vite giai `?url` thanh duong dan da build.
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

  // isEvalSupported: khong con trong kieu DocumentInitParameters cua ban pdfjs-dist
  // dang cai, nhung van truyen de KHOP tuyet doi voi tuy chon cua docPdfNode.mjs va
  // chot-hai-ban-dung.mjs. Tach thanh bien (khong phai object literal tai cho goi)
  // de tranh loi "excess property" cua TS ma khong phai ep kieu `as any`.
  const tuyChon = {
    data: new Uint8Array(await file.arrayBuffer()),
    // PDF phieu luong ma hoa AES voi mat khau RONG
    password: '',
    isEvalSupported: false,
  }
  const doc = await pdfjs.getDocument(tuyChon).promise
  try {
    const page = await doc.getPage(1)
    const caoTrang = page.getViewport({ scale: 1 }).viewBox[3]
    const tc = await page.getTextContent({ includeMarkedContent: false })
    const out: OChu[] = []
    for (const it of tc.items) {
      if (!('str' in it)) continue
      const text = it.str.trim()
      if (text) out.push({ text, x: it.transform[4], y: latY(it.transform[5], caoTrang) })
    }
    return out
  } finally {
    await doc.cleanup()
  }
}
