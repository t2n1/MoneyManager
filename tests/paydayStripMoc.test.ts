// Canh cái TÊN của mốc trên thanh "tới ngày lương" (PaydayStrip) không quay lại chỗ cũ.
//
// Vì sao có luật này: mốc là `getMonthRange().end`, tức đầu kỳ SAU, và app cố tình không có
// trường "ngày lương" riêng (xem khối chú thích trong src/features/bulletin/bulletin.ts) —
// nó giả định người dùng đặt "Tháng bắt đầu ngày" = ngày lương của họ. Giả định đó chỉ có
// căn cứ khi họ ĐÃ tự đặt ngày. Để mặc định 1 thì mốc trùng đúng đầu tháng lịch, và câu
// "còn 11 ngày nữa mới tới ngày lương" hoá ra đang nói "còn 11 ngày nữa là hết tháng" —
// một lời hứa về thứ app không biết.
//
// Repo không khai test.environment nên không render được component (xem oNhapSoAm.test.ts
// cho cùng chỗ mù đó). Bài này đọc thẳng nguồn: chữ "ngày lương" chỉ được nằm ở dòng đặt
// tên mốc, không nằm trong bất kỳ câu JSX nào.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// fileURLToPath, không phải `.pathname`: đường dẫn dự án có dấu cách ("Money Manager").
const ROOT = fileURLToPath(new URL('..', import.meta.url))

/** Bỏ mọi chú thích — chú thích còn nhắc "ngày lương" là chuyện đúng, chỉ câu chữ mới bị canh. */
function boChuThich(nguon: string): string {
  return nguon.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
}

describe('PaydayStrip — tên mốc', () => {
  const code = boChuThich(readFileSync(`${ROOT}src/features/bulletin/PaydayStrip.tsx`, 'utf8'))

  it('chữ "ngày lương" chỉ còn đúng một chỗ: dòng đặt tên mốc', () => {
    const dong = code.split(/\r?\n/).filter((d) => d.includes('ngày lương'))
    expect(dong).toHaveLength(1)
    expect(dong[0]).toContain('const moc')
  })

  it('đổi tên mốc theo monthStartDay', () => {
    expect(code).toContain('monthStartDay === 1')
  })

  it('BulletinPage truyền monthStartDay xuống', () => {
    const trang = boChuThich(readFileSync(`${ROOT}src/features/bulletin/BulletinPage.tsx`, 'utf8'))
    expect(trang).toMatch(/<PaydayStrip[^>]*monthStartDay=\{monthStartDay\}/)
  })
})
