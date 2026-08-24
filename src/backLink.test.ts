// Canh mọi nút "quay lại" giữa các trang đều là <BackLink>, không phải <Link>/<button>
// tự viết.
//
// Vì sao cần: cái sai ở đây KHÔNG nhìn ra được khi đọc một file. `<Link to="/settings">`
// trong TagsPage.tsx trông hoàn toàn hợp lý — nó chỉ sai khi trang đó được mở TỪ tab
// Ngân sách, một sự thật nằm ở file khác. Mười bốn trang chép cùng một đoạn nút đó, nên
// chỉ cần một trang mới quên là lỗi quay lại trở lại mà không gì báo.
//
// Đọc file qua import.meta.glob('?raw') của Vite, cùng lối với routeLinks.test.ts.
import { describe, expect, it } from 'vitest'

const RAW = import.meta.glob('/src/**/*.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const SOURCES = new Map(
  Object.entries(RAW).map(([path, code]) => [path.replace(/^\/src\//, ''), code]),
)

/**
 * Những nút "quay lại" KHÔNG đổi trang — đóng một lớp bên trong màn hình đang mở. Lùi
 * lịch sử ở đây là sai: người dùng chưa hề rời trang nào.
 */
const NOT_NAVIGATION = new Set([
  // "Quay lại" ở đây = đóng bảng chọn mẫu, vẫn đứng nguyên trong tấm trượt.
  'features/lifetime/EventFormSheet.tsx',
  // "Bỏ vai trò, quay lại giao dịch thường" = tắt một chế độ của cùng cái form.
  'features/transactions/TransactionForm.tsx',
])

/** Tên thẻ JSX bọc quanh vị trí `pos` — tức thẻ mở gần nhất phía trước. */
export function enclosingTag(code: string, pos: number): string | null {
  const open = code.lastIndexOf('<', pos)
  if (open < 0) return null
  return /^<\/?([A-Za-z][\w.]*)/.exec(code.slice(open, open + 40))?.[1] ?? null
}

/** Mọi chỗ có nhãn trợ năng nói "quay lại", kèm tên thẻ đang mang nhãn đó. */
export function backButtons(sources: Map<string, string>) {
  const out: { file: string; tag: string | null; label: string }[] = []
  for (const [file, code] of sources) {
    if (file.endsWith('.test.tsx') || NOT_NAVIGATION.has(file)) continue
    for (const m of code.matchAll(/aria-label=(?:"([^"]*[Qq]uay lại[^"]*)")/g)) {
      out.push({ file, tag: enclosingTag(code, m.index), label: m[1] })
    }
  }
  return out
}

/**
 * Từ 2026-08-25 phần lớn nút quay lại KHÔNG còn viết ở trang: chúng nằm trong
 * <PageHeader back="…">, và chính PageHeader dựng <BackLink> với nhãn "Quay lại". Nên
 * phép đếm phải cộng cả lối đó, nếu không nó tụt từ 14 xuống 3 và cái ngưỡng chống-quét-
 * hỏng-câm bên dưới đỏ mà chẳng có lỗi nào thật.
 */
export function pageHeaderBacks(sources: Map<string, string>) {
  const out: string[] = []
  for (const [file, code] of sources) {
    if (file.endsWith('.test.tsx')) continue
    for (const _ of code.matchAll(/<PageHeader[^>]*?\sback=/gs)) out.push(file)
  }
  return out
}

describe('nút quay lại', () => {
  const found = backButtons(SOURCES)

  const viaHeader = pageHeaderBacks(SOURCES)

  it('tìm được các nút quay lại trong nguồn', () => {
    // Ngưỡng thấp, chỉ để phát hiện phép quét hỏng câm (trả [] mà test vẫn xanh)
    expect(found.length + viaHeader.length).toBeGreaterThan(10)
  })

  it('trang con dùng <PageHeader back=…>, không tự dựng <BackLink> cạnh <h1>', () => {
    // <BackLink> trần vẫn hợp lệ ở những chỗ KHÔNG phải đầu trang: nút "Đóng" của màn
    // Nhập (đi qua slot `left`), và lối "Về báo cáo" trong trạng thái lỗi của
    // CategoryDetailPage. Cái phải chặn là một trang tự dựng lại hàng back + tiêu đề.
    const rogue = [...SOURCES]
      .filter(([f]) => !f.endsWith('.test.tsx'))
      .filter(([, code]) => /<BackLink[^>]*\/>\s*<h1/s.test(code))
      .map(([f]) => f)
    expect(rogue, 'Dùng <PageHeader title=… back=…>.').toEqual([])
  })

  it('enclosingTag đọc đúng thẻ đang bọc', () => {
    expect(enclosingTag('<Link to="/x" aria-label="Quay lại">', 20)).toBe('Link')
    expect(enclosingTag('<BackLink\n  to="/x"\n  aria-label="Quay lại"\n>', 30)).toBe('BackLink')
  })

  it('đều là <BackLink>, không phải <Link>/<button> tự viết', () => {
    const rogue = found
      .filter((b) => b.tag !== 'BackLink')
      .map((b) => `${b.file} → <${b.tag}> "${b.label}"`)
    expect(rogue).toEqual([])
  })
})
