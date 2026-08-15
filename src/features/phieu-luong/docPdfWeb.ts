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

  // useSystemFonts: false de PIN gia tri, vi mac dinh cua pdfjs la true trong
  // trinh duyet (khac Node). Bang chung 60/60 cua chot-hai-ban-dung.mjs chi dung
  // cho gia tri da pin nay — pin o day de code chay that KHOP voi gia tri da do.
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    // PDF phieu luong ma hoa AES voi mat khau RONG
    password: '',
    useSystemFonts: false,
  }).promise
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
