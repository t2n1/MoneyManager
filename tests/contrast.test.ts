// Canh hai CÁCH VIẾT đã từng làm trượt contrast AA. Không đo tỉ số ở đây: đo đúng phải
// vẽ ra pixel trong trình duyệt (xem ghi chú trong index.css), mà vitest chạy trên node
// không có canvas — tự cài lại phép đổi oklch→sRGB thì lệch với Tailwind lúc nào không hay.
// Nên canh cái đọc được chắc chắn: tổ hợp class đã bị đo là trượt thì không được quay lại.
//
// Số đo thật (canvas pixel readback trên app, 2026-08-11):
//   1) text-green-50/90 trên gradient green-700 = 4,14:1 và /80 = 3,58:1 → trượt 4,5.
//      Bỏ alpha thì green-50 đủ 4,72:1. Nền là gradient nên phải đo ở CHẶNG SÁNG NHẤT.
//   2) bg-accent + text-white: ở light (green-700) đạt 4,95:1 nhưng ở dark --accent lật
//      thành green-500 và tụt còn 2,22:1. Phải dùng text-fg-on-accent (dark → gray-950,
//      9,08:1). Đây là bẫy "token gánh hai vai" ghi ở index.css.
//
// ---- BA ĐIỂM MÙ của cách đo bằng máy quét trên trình duyệt -------------------------
//
// Ghi lại ở đây vì đã bị chúng lừa thật (2026-08-17), và cả hai đều tạo ra kết luận
// "0 lỗi" quá tay:
//
//   1) TAILWIND V4 XUẤT `oklch()`. Máy quét nào đọc `getComputedStyle().backgroundColor`
//      bằng regex `rgb(...)` sẽ KHÔNG parse được nền token, rồi lặng lẽ leo tiếp lên cha
//      và lấy nền TRANG làm nền. Hậu quả: chữ trắng trên `bg-accent` bị báo 1,11:1 (sai),
//      và ngược lại mọi bề mặt token khác coi như CHƯA TỪNG được đo. Cách đúng: đổ chuỗi
//      màu vào canvas 1×1 rồi đọc pixel — canvas hiểu mọi cú pháp màu CSS.
//   2) NỀN GRADIENT có `backgroundColor: rgba(0,0,0,0)`. Thẻ "Tổng tài sản" là
//      `bg-gradient-to-br from-green-700 to-emerald-800`, nên máy quét lại rơi về nền
//      trang và báo trượt oan 4 chỗ. Bề mặt đó phải đo tay ở CHẶNG SÁNG NHẤT — đúng con
//      số 4,72:1 ghi ở mục (1) phần "Số đo thật" trên kia.
//   3) CHỮ TRONG SVG (nhãn trục biểu đồ) không có tổ tiên nào mang nền đặc: đo được 7
//      tầng `rgba(0,0,0,0)` từ <tspan> lên tới <div>. Máy quét leo hết rồi rơi về mặc
//      định TRẮNG, nên ở chế độ tối nó báo chữ trắng trên trắng (1,00:1) — hoàn toàn là
//      hiện vật của cái mặc định đó. Nền thật là bề mặt thẻ ở tầng cao hơn.
//
// Tức: một lần quét sạch KHÔNG có nghĩa là mọi bề mặt đã đạt. Nó có nghĩa là mọi bề mặt
// mà máy quét ĐỌC ĐƯỢC đều đạt.
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
    return e.isFile() && (e.name.endsWith('.tsx') || e.name.endsWith('.ts')) ? [p] : []
  })
}

const FILES = walk(SRC).filter((f) => !f.endsWith('.test.ts') && !f.endsWith('.test.tsx'))

/** Bỏ chú thích trước khi quét. BẮT BUỘC: mấy chỗ sửa đều ghi lại cách viết CŨ trong chú
 *  thích để người sau khỏi lặp lại, nên guard không bỏ chú thích sẽ đỏ vì chính tài liệu
 *  của nó — vô dụng và gây hoang mang. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/** Mọi giá trị className trong file (cả "…" và {`…`}). */
function classChunks(src: string): string[] {
  return [...stripComments(src).matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)].map(
    (m) => m[1] ?? m[2] ?? '',
  )
}

/**
 * Các TỔ HỢP class có thể thật sự cùng xuất hiện trên một phần tử.
 *
 * Vì sao cần: một `className={\`… ${cond ? 'a' : 'b'}\`}` KHÔNG bao giờ nhả cả 'a' lẫn
 * 'b'. Quét cả chuỗi như một khối là coi hai nhánh loại trừ nhau như thể chúng cùng lúc,
 * và phép thử báo lỗi cho một cách viết đúng — gặp thật ở nút xác nhận của `lib/dialog`:
 * nhánh nguy hiểm là `bg-red-600 text-white`, nhánh thường là `bg-accent
 * text-fg-on-accent`; cả hai đều đạt, nhưng gộp lại thì thấy "bg-accent + text-white".
 *
 * Ngược lại KHÔNG được nới thành "xét từng nhánh riêng": ca lỗi thật lại đúng kiểu chữ
 * nằm ở phần CHUNG và nền nằm trong nhánh (`text-white` ở ngoài, `bg-accent` trong
 * ternary) — xét riêng thì nó lọt. Nên phải là phần chung ∪ MỘT nhánh, đúng như trình
 * duyệt thấy.
 *
 * Chỉ bung tối đa 8 tổ hợp: className nhiều ternary lồng nhau thì số tổ hợp nổ theo luỹ
 * thừa, mà thực tế không có chỗ nào quá hai.
 */
function classCombos(chunk: string): string[] {
  const interps = [...chunk.matchAll(/\$\{[\s\S]*?\}/g)].map((m) => m[0])
  const chung = interps.reduce((s, i) => s.replace(i, ' '), chunk)
  let combos = [chung]
  for (const i of interps) {
    // Các chuỗi nháy đơn/kép trong biểu thức = các nhánh có thể chọn.
    const nhanh = [...i.matchAll(/['"]([^'"]*)['"]/g)].map((m) => m[1])
    if (nhanh.length === 0) continue
    combos = combos.flatMap((c) => nhanh.map((n) => `${c} ${n}`)).slice(0, 8)
  }
  return combos
}

describe('contrast: cách viết đã bị đo là trượt AA', () => {
  it('không hạ độ mờ chữ green-50 trên thẻ gradient xanh', () => {
    const bad: string[] = []
    for (const f of FILES) {
      // text-green-50/90, /80, … — alpha nào cũng tụt dưới 4,5:1
      for (const m of stripComments(readFileSync(f, 'utf8')).matchAll(/\btext-green-50\/\d+/g)) {
        bad.push(`${f.slice(SRC.length + 1)}: ${m[0]}`)
      }
    }
    expect(
      bad,
      'text-green-50 trên nền gradient green-700 chỉ đủ AA khi KHÔNG có alpha (4,72:1);' +
        ' /90 còn 4,14:1 và /80 còn 3,58:1. Muốn nhạt hơn thì đổi sắc độ, đừng đổi độ mờ.',
    ).toEqual([])
  })

  it('không dùng text-white đè trên bg-accent', () => {
    const bad: string[] = []
    for (const f of FILES) {
      for (const chunk of classChunks(readFileSync(f, 'utf8'))) {
        if (!/\bbg-accent\b/.test(chunk)) continue
        // Xét theo TỔ HỢP thật (phần chung ∪ một nhánh ternary) — xem classCombos.
        for (const combo of classCombos(chunk)) {
          if (/\bbg-accent\b/.test(combo) && /\btext-white\b/.test(combo)) {
            bad.push(`${f.slice(SRC.length + 1)}: "${combo.trim().slice(0, 80)}"`)
            break
          }
        }
      }
    }
    expect(
      bad,
      'bg-accent + text-white chỉ đạt ở light (4,95:1); ở dark --accent là green-500 nên' +
        ' còn 2,22:1. Dùng text-fg-on-accent — token đã lật sẵn theo chế độ.',
    ).toEqual([])
  })

  it('token --fg-on-accent được khai ở CẢ hai chế độ và map ra tiện ích Tailwind', () => {
    const css = readFileSync(join(SRC, 'index.css'), 'utf8')
    // Cắt theo ĐẦU KHỐI ở cột 0 (`:root {` / `.dark {`), không phải indexOf('.dark') —
    // '.dark' xuất hiện sớm hơn ở @custom-variant dòng 4, cắt kiểu đó ra chuỗi rỗng và
    // test xanh/đỏ vì lý do vô nghĩa.
    const at = (re: RegExp) => {
      const m = css.match(re)
      if (m?.index === undefined) throw new Error(`Không tìm thấy khối ${re}`)
      return m.index
    }
    const rootAt = at(/^:root\s*\{/m)
    const darkAt = at(/^\.dark\s*\{/m)
    const themeAt = at(/^@theme inline\s*\{/m)
    const root = css.slice(rootAt, darkAt)
    const dark = css.slice(darkAt, themeAt)
    expect(root, ':root phải khai --fg-on-accent').toMatch(/--fg-on-accent:/)
    expect(dark, '.dark phải khai lại --fg-on-accent (nền accent ở dark sáng hơn)').toMatch(
      /--fg-on-accent:/,
    )
    expect(css, 'phải map --color-fg-on-accent trong @theme inline').toMatch(
      /--color-fg-on-accent:\s*var\(--fg-on-accent\)/,
    )
  })

  // Viết lại 2026-08-18 cùng B9 của gói 1a: thang nền đổi từ amber→orange→red (ba sắc,
  // nằm ngoài bảng màu) sang MỘT sắc `--money-out` với bốn độ mờ 12/30/55/100. Nền đổi
  // thì mực phải đo lại — bộ cũ (`text-gray-950` cho bậc 3–4, `fg-secondary` cho 0–2)
  // không còn đúng trên nền mới: đo được `fg-secondary` chỉ 4,17 ở bậc 2 chế độ SÁNG.
  // Số đo đầy đủ của bộ mới nằm ngay trên `LEVEL_INK` trong SpendHeatmapCard.tsx.
  it('mực chữ ô lịch chi tiêu đúng bộ đã đo', () => {
    const src = stripComments(
      readFileSync(join(SRC, 'features', 'reports', 'SpendHeatmapCard.tsx'), 'utf8'),
    )
    // Bộ mực đi theo BẬC, khai thành bảng cạnh bảng nền — không phải một điều kiện
    // `level >= 3 ? …` rải trong JSX: hai bảng cạnh nhau thì đọc một lượt là biết bậc
    // nào ăn mực nào, và thêm bậc mà quên mực sẽ ra `undefined` chứ không im lặng đúng.
    const ink = src.match(/const LEVEL_INK = \[([\s\S]*?)\]/)
    expect(ink, 'không tìm thấy bảng LEVEL_INK').not.toBeNull()
    const levels = [...ink![1].matchAll(/'([^']+)'/g)].map((m) => m[1])
    expect(levels, 'năm bậc nền thì phải có năm bậc mực').toEqual([
      // Bậc 0 (không chi) im tiếng hơn: 6,32 sáng / 11,37 tối.
      'text-fg-secondary',
      // Bậc 1–3: nền pha vẫn cùng phe với nền trang → mực thường của chế độ.
      'text-fg-primary',
      'text-fg-primary',
      'text-fg-primary',
      // Bậc 4 nền ĐẶC: red-700 ở sáng cần chữ trắng, red-400 ở tối cần chữ gần đen —
      // fg-inverse là token đã lật sẵn đúng chiều đó. 6,42 / 6,97.
      'text-fg-inverse',
    ])
    // Cả hai cách viết dưới đây đều từng có ở file này và đều trượt trên nền mới.
    expect(src, 'không được quay lại text-white cho ô lịch').not.toMatch(/text-white/)
    expect(src, 'không được viết tay màu xám cố định — nền lật theo chế độ').not.toMatch(
      /text-gray-950/,
    )
  })
})
