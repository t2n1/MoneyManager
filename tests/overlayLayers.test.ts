// Canh TẦNG XẾP LỚP của các lớp phủ toàn màn.
//
// Vì sao cần canh: 2026-08-11 phát hiện sheet "Sửa giao dịch" bị nút "+" nổi che mất phím
// "−" của bàn số (che 68%). Không phải lỗi CSS khó hiểu — sheet tự dựng lớp phủ ở z-30,
// ĐÚNG BẰNG z-index của nút nổi trong AppLayout. Bằng nhau thì thứ tự DOM quyết định, mà
// nút nổi render sau nên nó nằm trên. Bấm phím "−" trong lúc sửa giao dịch là bấm vào nút
// nổi. Lúc đó có 17 lớp phủ cùng ở z-30, tức 16 cái nữa đang chờ lỗi y hệt.
//
// Tầng đã chốt:  nav 20  <  nút nổi 30  <  sheet/lớp phủ 40  <  hộp thoại + toast 50
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

/** z-index của nút "+" nổi — mốc mà mọi lớp phủ phải vượt qua. */
function floatingActionZ(): number {
  const layout = readFileSync(join(SRC, 'components', 'AppLayout.tsx'), 'utf8')
  // Nút nổi là phần tử `fixed` duy nhất mang aria-label="Nhập giao dịch".
  const block = layout.slice(layout.indexOf('aria-label="Nhập giao dịch"'))
  const m = block.match(/className="[^"]*?\bz-(\d+)\b/)
  if (!m) throw new Error('Không tìm thấy z-index của nút "+" nổi trong AppLayout.tsx')
  return Number(m[1])
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
  it('tìm thấy nút "+" nổi và ít nhất một lớp phủ (nếu không thì test rỗng, canh hờ)', () => {
    expect(floatingActionZ()).toBeGreaterThan(0)
    expect(fullScreenOverlays().length).toBeGreaterThan(10)
  })

  it('không lớp phủ nào ở TỪ z-index của nút nổi trở xuống', () => {
    const fab = floatingActionZ()
    const bad = fullScreenOverlays().filter((o) => o.z <= fab)
    expect(
      bad.map((o) => `${o.file}: z-${o.z} — "${o.snippet}"`),
      `Nút "+" nổi ở z-${fab}. Lớp phủ ở z-index bằng hoặc thấp hơn sẽ bị nút nổi vẽ đè lên` +
        ` (bằng nhau thì thứ tự DOM thắng, và nút nổi render sau). Nâng lên z-40.`,
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
