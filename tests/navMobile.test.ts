// Thanh tab mobile chỉ có bốn chỗ (§3 + bản vẽ 17a), nên hai màn phải đứng ngoài. Phép
// thử này canh cái GIÁ của quyết định đó: bỏ một màn khỏi thanh tab mà không mở lối vào
// nào khác thì trên mobile màn đó biến mất hẳn — không có rail, không có tab, và người
// dùng không có URL nào để gõ.
//
// Ở tests/ vì nó phải đọc file, và ĐỌC DẠNG VĂN BẢN chứ không import: tsconfig.node.json
// dùng `moduleResolution: node16`, nên `import ... from '../src/...'` không có đuôi file
// là lỗi biên dịch (chỉ `tsc -b` bắt được, `tsc --noEmit` thì không). Cả thư mục tests/
// đi theo lối này — xem designSystem.test.ts.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// fileURLToPath, không phải `.pathname`: đường dẫn dự án có dấu cách ("Money Manager")
// nên pathname trả về đã percent-encode → ENOENT.
const ROOT = fileURLToPath(new URL('..', import.meta.url))
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

const NAV_SRC = read('src/components/navItems.ts')
const BULLETIN = read('src/features/bulletin/BulletinPage.tsx')
const RAIL = read('src/components/AppRail.tsx')

/** Các mục `{ to: '/x', …, onMobile: <cờ> }` trong NAV_ITEMS. */
function navItems(): { to: string; onMobile: boolean }[] {
  const out: { to: string; onMobile: boolean }[] = []
  const re = /\{\s*to:\s*'([^']+)'[^}]*onMobile:\s*(true|false)\s*\}/g
  for (const m of NAV_SRC.matchAll(re)) out.push({ to: m[1], onMobile: m[2] === 'true' })
  return out
}

describe('thanh tab mobile', () => {
  it('đọc được NAV_ITEMS từ nguồn', () => {
    // Regex mà trượt thì mọi phép thử dưới đây im lặng đúng. Chốt số mục trước.
    expect(navItems()).toHaveLength(6)
  })

  it('đúng bốn tab', () => {
    expect(navItems().filter((i) => i.onMobile).map((i) => i.to)).toEqual([
      '/',
      '/so',
      '/budget',
      '/assets',
    ])
  })

  it('màn không có tab thì còn một lối vào ở Bản tin', () => {
    const an = navItems().filter((i) => !i.onMobile)
    expect(an.length, 'không còn màn ẩn nào — xem lại phép thử bốn-tab').toBeGreaterThan(0)
    for (const item of an) {
      expect(
        BULLETIN,
        `${item.to} không có tab mobile và cũng không có lối vào nào ở Bản tin`,
      ).toContain(`to="${item.to}"`)
    }
  })

  // Lối vào phải nằm trong khối chỉ hiện DƯỚI lg — đặt ở chỗ chỉ hiện từ lg thì đúng cái
  // bề rộng cần nó lại là bề rộng không thấy nó.
  //
  // Từ 2026-08-25 khối đó là `<PageHeader … mobileOnly>` chứ không còn là một <div> mang
  // `lg:hidden` viết tay: đầu trang của cả 25 màn đã về một component. `mobileOnly` LÀ
  // lời hứa đó — xem PageHeader.tsx, nó render hàng với `lg:hidden` và tách <h1> sr-only
  // ra ngoài để cây tiêu đề không thủng ở desktop.
  it('lối vào nằm trong khối chỉ-hiện-dưới-lg', () => {
    const khoi = BULLETIN.match(/<PageHeader[^>]*\bmobileOnly\b[^>]*>[\s\S]*?<\/PageHeader>/)
    expect(khoi, 'không tìm thấy khối tiêu đề mobile của Bản tin').not.toBeNull()
    for (const item of navItems().filter((i) => !i.onMobile)) {
      expect(khoi![0], `lối vào ${item.to} nằm ngoài khối mobileOnly`).toContain(`to="${item.to}"`)
    }
  })

  // `mobileOnly` chỉ đúng nếu PageHeader thật sự ẩn hàng từ lg VÀ vẫn để lại <h1>. Canh ở
  // nguồn primitive, không ở trang: đây là chỗ lời hứa được thực hiện.
  it('PageHeader mobileOnly ẩn hàng ở lg nhưng giữ <h1>', () => {
    const src = readFileSync(
      join(fileURLToPath(new URL('..', import.meta.url)), 'src/components/ui/PageHeader.tsx'),
      'utf8',
    )
    const nhanh = src.match(/if \(mobileOnly\) \{[\s\S]*?\n {2}\}/)
    expect(nhanh, 'PageHeader không còn nhánh mobileOnly').not.toBeNull()
    expect(nhanh![0], 'hàng mobileOnly phải mang lg:hidden').toContain('lg:hidden')
    expect(nhanh![0], 'phải còn <h1> sr-only ngoài hàng bị ẩn').toContain('className="sr-only"')
  })
})

// Rail desktop: SÁU nút cho sáu màn, không bảy. Từng có một <NavLink to="/"> bọc logo —
// cùng đích với mục "Bản tin" ngay dưới nó — nên cột rail đếm ra bảy hình vẽ xếp dọc và
// hai ô đầu đi cùng một chỗ. Canh bằng số <NavLink> trong nguồn: rail chỉ được có ĐÚNG
// một, cái nằm trong vòng map NAV_ITEMS.
describe('rail desktop', () => {
  // Bỏ chú thích trước khi đếm: chú thích trong AppRail.tsx CHÉP LẠI cách viết cũ
  // (`<NavLink to="/">` bọc logo) để người sau khỏi dựng lại nó — đếm cả chú thích thì
  // phép thử đỏ vì chính tài liệu của nó. Cùng lối stripComments của contrast.test.ts.
  const rail = RAIL.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

  it('chỉ một <NavLink> — mọi nút rail đến từ NAV_ITEMS', () => {
    expect(rail.match(/<NavLink/g) ?? []).toHaveLength(1)
  })

  it('logo không còn là liên kết (nó là nhãn, không phải mục thứ bảy)', () => {
    expect(rail).not.toMatch(/<NavLink[^>]*>\s*<AppLogo/)
    expect(rail).toMatch(/<AppLogo/)
  })
})
