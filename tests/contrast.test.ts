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
        if (/\btext-white\b/.test(chunk)) {
          bad.push(`${f.slice(SRC.length + 1)}: "${chunk.slice(0, 80)}"`)
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

  it('mực chữ ô lịch chi tiêu đúng bộ đã đo', () => {
    const src = stripComments(
      readFileSync(join(SRC, 'features', 'reports', 'SpendHeatmapCard.tsx'), 'utf8'),
    )
    // Bậc 3–4 nền nóng (orange-400 / red-500 ở light, orange-600 / red-500 ở dark):
    // gray-950 đạt cả hai chế độ. text-white từng dùng ở đây chỉ được 2,38 và 3,81.
    expect(src, 'bậc 3–4 phải dùng text-gray-950').toMatch(/level >= 3 \? 'text-gray-950'/)
    // Bậc 0–2 dùng TOKEN fg-secondary (= gray-600 light / gray-300 dark, đúng cặp đã
    // đo), không viết tay cặp sáng/tối — tests/designSystem.test.ts ban cách viết đó.
    expect(src, 'bậc 0–2 phải dùng token text-fg-secondary').toMatch(/'text-fg-secondary'/)
    expect(src, 'không được quay lại text-white cho ô lịch').not.toMatch(/text-white/)
  })
})
