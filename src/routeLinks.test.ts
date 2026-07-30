// Canh MỌI đường dẫn viết cứng trong src phải trỏ vào một route THẬT, và không được
// trỏ vào route CHUYỂN TIẾP.
//
// Vì sao cần: đợt sắp xếp lại IA (docs/information-architecture.md) đổi 8 route. Bản đồ
// liệt kê 15 chỗ link nội bộ phải sửa — và bỏ sót 5 chỗ nữa nằm trong bộ luật thông báo
// (`budgetRules`, `debtRules`, `rhythmRules`, `accountRules`, `cardRules`). Cả 5 vẫn CHẠY
// nhờ các route chuyển tiếp, nên 841 phép thử còn lại xanh y nguyên và không ai biết. Chỉ
// một lần grep tay mới thấy.
//
// Đó là loại lỗi không ai đọc code thấy được: chuỗi route nằm cách file route rất xa, và
// hỏng theo kiểu "vẫn hoạt động, chỉ là đi vòng". Route chuyển tiếp có mặt để BOOKMARK và
// lịch sử trình duyệt của người dùng còn dùng được — không phải để làm đường ống nội bộ.
// Dùng nó bên trong app nghĩa là một ngày dọn route cũ là đứt link mà không có gì báo.
//
// Đọc file qua import.meta.glob('?raw') của Vite, cùng lối với purity.test.ts (không phải
// kéo type Node vào tsconfig.app, nơi chỉ có vite/client).
import { describe, expect, it } from 'vitest'

const RAW = import.meta.glob('/src/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

/** '/src/lib/money.ts' → 'lib/money.ts' */
const SOURCES = new Map(
  Object.entries(RAW).map(([path, code]) => [path.replace(/^\/src\//, ''), code]),
)

// ---------------------------------------------------------------- route trong App.tsx

type RouteDef = {
  path: string
  /** true = route chỉ để chuyển tiếp đường cũ (`<Navigate>` hoặc `Legacy*Redirect`). */
  legacy: boolean
}

/**
 * Bóc `<Route path="…" element={…} />` từ App.tsx.
 *
 * Tách theo `<Route` rồi cắt tới `/>` đầu tiên: mỗi mảnh chứa thuộc tính của đúng một
 * Route. Route bọc không có `path` (`<Route element={<RequireAuth />}>`) tự bị bỏ vì
 * không khớp regex path.
 */
export function parseRoutes(src: string): RouteDef[] {
  return src
    .split('<Route')
    .slice(1)
    .flatMap((chunk) => {
      const end = chunk.indexOf('/>')
      const body = end >= 0 ? chunk.slice(0, end) : chunk
      const m = /path="([^"]+)"/.exec(body)
      if (!m) return []
      return [{ path: m[1], legacy: /<Navigate|Legacy\w*Redirect/.test(body) }]
    })
}

// ---------------------------------------------------------------- link trong nguồn

type LinkRef = { file: string; raw: string }

/**
 * Mọi đường dẫn viết CỨNG bắt đầu bằng '/'. Năm dạng đang dùng trong repo:
 *   to: '/debts'                     (object literal — bộ luật thông báo, TABS của AppLayout)
 *   to="/debts"                      (JSX tĩnh — gồm cả đích của `<Navigate>` trong App.tsx)
 *   to={`/debts/${d.id}`}            (JSX template)
 *   navigate('/debts')               (điều hướng bằng lệnh)
 *   const DEBTS_ROUTE = '/debts'     (hằng số rồi mới truyền vào `to:`)
 *
 * Dạng thứ năm KHÔNG phải cho đủ bộ: `budgetRules` và `debtRules` — hai trong năm chỗ trôi
 * ở đợt IA — dùng đúng dạng đó (`to: DEBTS_ROUTE`), nên bản đầu của phép thử này bỏ sót cả
 * hai và vẫn xanh khi tôi cố tình dựng lại lỗi. Phiên bản này đã được chứng minh đỏ với cả
 * ba hình dạng lỗi (xem docs/information-architecture.md §6).
 *
 * CỐ Ý bắt theo VỊ TRÍ (`to:`, `navigate(`, `= `) chứ không quét mọi chuỗi trông giống
 * đường dẫn: chú thích trong App.tsx nhắc đường cũ (`/settings/debts`, `/reports?view=budget`)
 * để giải thích vì sao có route chuyển tiếp — quét bừa là chính những chú thích đúng đó
 * làm phép thử đỏ. Và trong App.tsx phải bỏ `path="…"` (định nghĩa route, không phải link).
 *
 * Bỏ qua mọi thứ động (`to={n.to}`, `navigate(-1)`) và mọi đường tương đối: không suy ra
 * được đích nên không kiểm được, và cũng không phải chỗ lỗi này xảy ra.
 */
export function collectLinks(sources: Map<string, string>): LinkRef[] {
  const patterns = [
    /\bto:\s*'(\/[^']*)'/g,
    /\bto:\s*`(\/[^`]*)`/g,
    /\bto="(\/[^"]*)"/g,
    /\bto=\{`(\/[^`]*)`\}/g,
    /\bnavigate\('(\/[^']*)'/g,
    /\bnavigate\(`(\/[^`]*)`/g,
    /\b(?:const|let|var)\s+\w+\s*=\s*'(\/[^']*)'/g,
    /\b(?:const|let|var)\s+\w+\s*=\s*`(\/[^`]*)`/g,
  ]
  const out: LinkRef[] = []
  for (const [file, code] of sources) {
    if (file.endsWith('.test.ts') || file.endsWith('.test.tsx')) continue
    // App.tsx là nơi ĐỊNH NGHĨA route: `path="…"` không phải link đi đâu cả, và các
    // path chuyển tiếp nằm ở đó một cách chính đáng.
    const src = file === 'App.tsx' ? code.replace(/path="[^"]*"/g, '') : code
    for (const re of patterns) {
      for (const m of src.matchAll(re)) out.push({ file, raw: m[1] })
    }
  }
  return out
}

// ---------------------------------------------------------------- so khớp

/** Bỏ query/hash rồi cắt segment. '/' → []. */
function segmentsOf(path: string): string[] {
  const clean = path.split('?')[0].split('#')[0]
  return clean.split('/').filter((s) => s.length > 0)
}

/**
 * Một link có khớp một route pattern không.
 *
 * Chỗ đắt giá: segment nội suy (`${a.id}`) CHỈ khớp segment động (`:accountId`), không
 * khớp segment tĩnh. Nhờ vậy `/assets/${a.id}` KHÔNG được tính là khớp `/assets/groups`
 * — nếu nới ra thì phép thử này bỏ qua đúng cái bug vừa sửa.
 */
export function matches(link: string, route: string): boolean {
  const l = segmentsOf(link)
  const r = segmentsOf(route)
  if (l.length !== r.length) return false
  return l.every((seg, i) => {
    const routeSeg = r[i]
    if (routeSeg.startsWith(':')) return true
    if (seg.includes('${')) return false // nội suy không khớp segment tĩnh
    return seg === routeSeg
  })
}

describe('đường dẫn viết cứng trong src', () => {
  const appSrc = SOURCES.get('App.tsx')
  const routes = parseRoutes(appSrc ?? '')
  const links = collectLinks(SOURCES)

  it('đọc được route từ App.tsx', () => {
    expect(appSrc).toBeTruthy()
    // Ngưỡng thấp, chỉ để phát hiện parseRoutes bị hỏng câm (trả [] mà test vẫn xanh)
    expect(routes.length).toBeGreaterThan(15)
    expect(routes.some((r) => r.legacy)).toBe(true)
    expect(routes.some((r) => !r.legacy)).toBe(true)
  })

  it('tìm được link trong nguồn', () => {
    expect(links.length).toBeGreaterThan(20)
  })

  it('mọi link trỏ vào một route thật', () => {
    const orphans = links
      .filter((l) => !routes.some((r) => matches(l.raw, r.path)))
      .map((l) => `${l.file} → ${l.raw}`)
    expect(orphans).toEqual([])
  })

  it('không link nào trỏ vào route chuyển tiếp', () => {
    // Chuyển tiếp là để bookmark/lịch sử của NGƯỜI DÙNG còn dùng được. Bên trong app phải
    // trỏ thẳng vào đích, kẻo ngày dọn route cũ là đứt link mà không gì báo.
    const viaLegacy = links
      .filter((l) => {
        const hit = routes.filter((r) => matches(l.raw, r.path))
        return hit.length > 0 && hit.every((r) => r.legacy)
      })
      .map((l) => `${l.file} → ${l.raw}`)
    expect(viaLegacy).toEqual([])
  })
})
