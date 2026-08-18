// Canh TẦNG XẾP LỚP của các lớp phủ toàn màn.
//
// Vì sao cần canh: 2026-08-11 phát hiện sheet "Sửa giao dịch" bị nút "+" nổi che mất phím
// "−" của bàn số (che 68%). Không phải lỗi CSS khó hiểu — sheet tự dựng lớp phủ ở z-30,
// ĐÚNG BẰNG z-index của nút nổi trong AppLayout. Bằng nhau thì thứ tự DOM quyết định, mà
// nút nổi render sau nên nó nằm trên. Bấm phím "−" trong lúc sửa giao dịch là bấm vào nút
// nổi. Lúc đó có 17 lớp phủ cùng ở z-30, tức 16 cái nữa đang chờ lỗi y hệt.
//
// Tầng đã chốt:  khung app < 40  <  sheet/lớp phủ 40  <  hộp thoại + toast 50
//
// 2026-08-16 (PR 3 của redesign 1a): nút "+" nổi bị BỎ — nút "+" nay nằm giữa thanh tab
// dưới, và thanh tab dưới nằm trong luồng (không `fixed`, không z-index) nên nó không
// còn là cái mốc mà lớp phủ phải vượt qua. Phép thử vì vậy đổi từ "so với nút nổi" sang
// "so với DẢI 40": mọi lớp phủ toàn màn phải ≥40, và không mảnh khung app nào được với
// tới dải đó. Ý nghĩa không đổi — khung app không bao giờ được vẽ đè lên sheet — nhưng
// nó không còn phụ thuộc vào sự tồn tại của một cái nút cụ thể.
//
// Đọc CHUỖI NGUỒN chứ không render: jsdom không tính layout/paint nên không dựng lại được
// cảnh "che nhau" trong test. Cái đọc được chắc chắn là con số z-index viết trong class.
//
// File này nằm ở tests/ chứ KHÔNG ở src/ vì nó đọc thư mục bằng node:fs. tsconfig của
// app không cho src/ dùng API Node — `vitest` vẫn xanh nhưng `npm run build` đỏ
// (TS2591). Cùng lý do designSystem.test.ts ở đây.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = join(fileURLToPath(new URL('..', import.meta.url)), 'src')

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e: { name: string; isDirectory(): boolean; isFile(): boolean }) => {
    const p = join(dir, e.name)
    if (e.isDirectory()) return walk(p)
    return e.isFile() && e.name.endsWith('.tsx') ? [p] : []
  })
}

const FILES = walk(SRC)

/** Sàn của dải "sheet / lớp phủ". Khung app phải ở dưới, hộp thoại + toast ở trên. */
const OVERLAY_FLOOR = 40

/** Bốn file dựng khung app. Chúng render QUANH `<Outlet/>`, tức quanh mọi sheet — nên
 *  một z-index chạm dải 40 ở đây là khung app che mất sheet. */
const CHROME = ['AppLayout.tsx', 'AppRail.tsx', 'AppTopBar.tsx', 'BottomNav.tsx']

/** Mọi z-index viết trong `className` của một file: `z-30`, `z-[25]`. */
function zIndexesIn(file: string): number[] {
  const src = readFileSync(join(SRC, 'components', file), 'utf8')
  return [...src.matchAll(/\bz-\[?(\d+)\]?\b/g)].map((m) => Number(m[1]))
}

/** Mọi lớp phủ full-screen: `fixed inset-0 …` kèm z-index, theo từng file. */
function fullScreenOverlays(): { file: string; z: number; snippet: string }[] {
  const out: { file: string; z: number; snippet: string }[] = []
  for (const f of FILES) {
    const src = readFileSync(f, 'utf8')
    // Bắt cả className="…" và className={`…`}
    for (const m of src.matchAll(/\bfixed inset-0\b[^"`]*/g)) {
      const chunk = m[0]
      const z = chunk.match(/\bz-(\d+)\b/)
      if (!z) continue
      out.push({ file: f.slice(SRC.length + 1), z: Number(z[1]), snippet: chunk.slice(0, 70) })
    }
  }
  return out
}

describe('tầng xếp lớp của lớp phủ toàn màn', () => {
  it('tìm thấy đủ lớp phủ để phép thử có nghĩa (nếu không thì nó canh hờ)', () => {
    expect(fullScreenOverlays().length).toBeGreaterThan(10)
  })

  it('mọi lớp phủ toàn màn nằm từ z-40 trở lên', () => {
    const bad = fullScreenOverlays().filter((o) => o.z < OVERLAY_FLOOR)
    expect(
      bad.map((o) => `${o.file}: z-${o.z} — "${o.snippet}"`),
      `Lớp phủ dưới z-${OVERLAY_FLOOR} lọt vào dải của khung app (rail, top bar, thanh` +
        ` tab, thanh chọn nhiều). Bằng z thì thứ tự DOM thắng — mà khung app render` +
        ` quanh <Outlet/> nên nó thắng. Nâng lên z-40.`,
    ).toEqual([])
  })

  it('khung app không chạm vào dải của lớp phủ', () => {
    const bad: string[] = []
    for (const file of CHROME) {
      // Toast + hộp thoại của AppLayout ở z-50 là CỐ Ý (chúng phải trên sheet) — chỉ
      // xét đúng dải 40–49, tức dải riêng của sheet.
      for (const z of zIndexesIn(file)) {
        if (z >= OVERLAY_FLOOR && z < 50) bad.push(`${file}: z-${z}`)
      }
    }
    expect(
      bad,
      `Khung app đứng ngoài <Outlet/> nên nó render SAU mọi sheet: chạm dải 40–49 là vẽ` +
        ` đè lên sheet. Khung app dùng z dưới 40 (hoặc không z-index — từ bản 1a rail,` +
        ` top bar và thanh tab đều nằm trong luồng).`,
    ).toEqual([])
  })

  it('toast/hộp thoại dùng chung nằm TRÊN các sheet', () => {
    const overlays = fullScreenOverlays()
    const dialog = overlays.find((o) => o.file.replace(/\\/g, '/') === 'lib/dialog.tsx')
    expect(dialog, 'lib/dialog.tsx phải có lớp phủ full-screen').toBeDefined()
    const sheets = overlays.filter((o) => o.file.replace(/\\/g, '/') !== 'lib/dialog.tsx')
    for (const s of sheets) {
      expect(
        s.z,
        `${s.file} (z-${s.z}) không được cao hơn hộp thoại dùng chung (z-${dialog!.z})`,
      ).toBeLessThanOrEqual(dialog!.z)
    }
  })
})

// Vùng cuộn của app phải CẮT được nội dung của nó — kể cả những phần tử
// `position:absolute` không ai nhìn thấy.
//
// Lỗi đã đo (B1 của gói redesign 1a, 2026-08-18): mở /reports ở 1280×700 thì
// `documentElement.scrollHeight` = 2763px trong khi `body` chỉ 700px, tức cửa sổ cuộn
// thêm được hơn 2000px vào một vùng trống trơn. Ảnh chụp cả trang ra một tấm cao gần bốn
// màn — nội dung bị cắt ngang giữa thẻ ở đúng mép màn, phía dưới trắng bốc.
//
// Thủ phạm là `.sr-only`: Tailwind định nghĩa nó bằng `position:absolute`. Khung app
// (`h-dvh overflow-hidden`) và <main> đều `position:static`, nên KHỐI CHỨA của mấy nhãn
// đó là initial containing block — chúng nhảy ra ngoài mọi tầng cắt và kéo dài vùng cuộn
// của <html>. Rộng 1px + `clip` nên không nhìn thấy; chỉ lộ khi chụp cả trang.
//
// `relative` trên <main> biến nó thành khối chứa, và `overflow-y-auto` mới cắt được. Đo
// lại sau khi sửa: <html> về đúng 700px, `window.scrollTo(0,5000)` → scrollY 0.
//
// Canh bằng chuỗi nguồn vì jsdom không tính layout — cùng lối budgetLayout.test.ts.
describe('vùng cuộn của khung app', () => {
  it('<main> có `relative` để cắt được con `position:absolute` (sr-only)', () => {
    // Bỏ chú thích trước khi dò: chú thích ngay trên <main> có nhắc lại chữ "<main>"
    // để giải thích lỗi, và một phép dò không bỏ chú thích sẽ bắt đúng cái nhắc đó.
    const layout = readFileSync(join(SRC, 'components', 'AppLayout.tsx'), 'utf8')
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
    const main = layout.match(/<main\s[\s\S]*?>/)
    expect(main, 'không tìm thấy <main> trong AppLayout.tsx').not.toBeNull()
    expect(
      main![0],
      'Bỏ `relative` khỏi <main> là mở lại đường cho .sr-only kéo dài tài liệu — xem chú' +
        ' thích ngay trên <main>.',
    ).toMatch(/className="relative /)
    // Vùng cuộn vẫn phải là <main>, không phải cả trang: `relative` không được đi kèm
    // việc bỏ `overflow-y-auto` (iOS sẽ rubber-band kéo theo thanh tab dưới).
    expect(main![0]).toMatch(/overflow-y-auto/)
  })
})
