import { describe, expect, it } from 'vitest'
import { NAV_ITEMS, pageTitle, topBarTitle, usesMonth } from './navItems'

describe('NAV_ITEMS', () => {
  // §3 + bản vẽ 17a chốt ĐÚNG bốn tab + nút "+". Đây là ràng buộc BỀ RỘNG, không phải
  // sở thích: ở 320px, sau khi trừ 52px của nút "+" và lề, năm tab chia nhau ~52px mỗi
  // ô, mà nhãn "Ngân sách" ở cỡ 3xs đã ~48px — tab thứ năm đẩy nhãn vào chỗ bị cắt.
  //
  // Phép thử này từng KHÔNG tồn tại, và hệ quả là code ship năm tab suốt nhiều PR trong
  // khi chú thích ở CẢ HAI file (navItems + BulletinPage) đều ghi là bốn. Con số nằm
  // trong một mảng thì không ai đọc lại; nằm trong một phép thử thì nó gãy.
  it('đúng bốn tab trên mobile', () => {
    const onMobile = NAV_ITEMS.filter((t) => t.onMobile)
    expect(onMobile.map((t) => t.label)).toEqual(['Bản tin', 'Sổ', 'Ngân sách', 'Tài sản'])
  })

  // Bỏ khỏi thanh tab mà không mở lối khác thì trên mobile màn đó biến mất hẳn — không
  // có URL nào người dùng gõ được. Hai màn ẩn phải có nút ở đầu Bản tin.
  it('mọi màn không có tab đều còn đường vào mobile ở Bản tin', async () => {
    const src = await import('node:fs/promises').then((fs) =>
      fs.readFile('src/features/bulletin/BulletinPage.tsx', 'utf8'),
    )
    for (const item of NAV_ITEMS.filter((t) => !t.onMobile)) {
      expect(src, `${item.label} (${item.to}) không có lối vào mobile nào ở Bản tin`).toContain(
        `to="${item.to}"`,
      )
    }
  })

  it('mỗi route một mục, không trùng', () => {
    const tos = NAV_ITEMS.map((t) => t.to)
    expect(new Set(tos).size).toBe(tos.length)
  })
})

describe('tiêu đề theo route', () => {
  it('pageTitle khớp cả trang con, và null ở trang gốc', () => {
    expect(pageTitle('/so')).toBe('Sổ')
    expect(pageTitle('/settings/accounts')).toBe('Cài đặt')
    // null là CÓ CHỦ ĐÍCH: tab trình duyệt ở `/` giữ nguyên tên app.
    expect(pageTitle('/')).toBeNull()
  })

  it('topBarTitle lấp chỗ pageTitle bỏ trống, không trả chuỗi rỗng', () => {
    expect(topBarTitle('/')).toBe('Bản tin')
    expect(topBarTitle('/khong-ton-tai')).toBe('Sổ Gạo')
  })

  // Bộ đổi tháng ở top bar chỉ có nghĩa với màn theo tháng. Hiện nó ở /settings là mời
  // người dùng bấm một nút không làm gì.
  it('usesMonth: chỉ các màn theo tháng', () => {
    expect(usesMonth('/')).toBe(true)
    expect(usesMonth('/budget')).toBe(true)
    expect(usesMonth('/settings')).toBe(false)
  })
})
