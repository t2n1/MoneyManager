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

  // Ràng buộc "màn bị ẩn phải còn lối vào mobile" nằm ở tests/navMobile.test.ts, không
  // ở đây: nó phải ĐỌC FILE, mà tsconfig.app.json cố ý chỉ khai `types: ["vite/client"]`
  // để không ai import được `node:fs` vào code chạy trên trình duyệt. Cùng lý do đã ghi
  // ở đầu tests/designSystem.test.ts.

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
