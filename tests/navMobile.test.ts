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

  // Lối vào phải nằm trong khối `lg:hidden` — đặt ở chỗ chỉ hiện từ lg thì đúng cái bề
  // rộng cần nó lại là bề rộng không thấy nó.
  it('lối vào nằm trong khối chỉ-hiện-dưới-lg', () => {
    const khoi = BULLETIN.match(/className="flex items-center gap-2 lg:hidden"[\s\S]*?\n {6}<\/div>/)
    expect(khoi, 'không tìm thấy khối tiêu đề mobile của Bản tin').not.toBeNull()
    for (const item of navItems().filter((i) => !i.onMobile)) {
      expect(khoi![0], `lối vào ${item.to} nằm ngoài khối lg:hidden`).toContain(`to="${item.to}"`)
    }
  })
})
