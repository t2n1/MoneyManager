import { describe, expect, it } from 'vitest'
import { drawerEvents, type DrawerEventLike } from './drawerList'

const e = (
  id: string,
  label: string,
  startYear: number,
  amountMinor: number,
  icon = '',
  kind: 'income' | 'expense' = 'expense',
): DrawerEventLike => ({ id, label, startYear, endYear: null, kind, amountMinor, icon })

const list: DrawerEventLike[] = [
  e('a', 'Nuôi con', 2031, 1_200_000, 'child'),
  e('b', 'Mua nhà', 2034, 300_000, 'house'),
  e('c', 'Cưới', 2029, 3_000_000, 'rings'),
  e('d', 'Lương hưu', 2059, 900_000, 'coin', 'income'),
]

describe('drawerEvents — sắp xếp', () => {
  it('Theo năm: năm bắt đầu tăng dần', () => {
    expect(drawerEvents(list, { q: '', sort: 'year' }).map((x) => x.id)).toEqual(['c', 'a', 'b', 'd'])
  })

  it('Tiền lớn nhất: số tiền giảm dần, bất kể năm', () => {
    expect(drawerEvents(list, { q: '', sort: 'money' }).map((x) => x.id)).toEqual(['c', 'a', 'd', 'b'])
  })

  // Bản vẽ ghi chip thứ ba là "Theo loại". App KHÔNG có cột `type` — và cố ý không có, xem
  // spec §6: mô hình mốc ở đây là một hình chung, loại chỉ tồn tại lúc nhập qua bộ mẫu.
  // Thứ gần nhất với "loại" mà dữ liệu THẬT có là ICON: đó chính là thứ người dùng chọn
  // để nói mốc này là việc gì. Nhóm theo icon, trong mỗi nhóm vẫn theo năm.
  it('Theo loại: gom theo icon, trong nhóm vẫn theo năm', () => {
    const hai = [
      e('x1', 'Con thứ hai', 2035, 1_000_000, 'child'),
      ...list,
    ]
    const ids = drawerEvents(hai, { q: '', sort: 'type' }).map((x) => x.id)
    // Hai mốc cùng icon 'child' phải đứng liền nhau, và 2031 trước 2035.
    expect(ids.indexOf('x1') - ids.indexOf('a')).toBe(1)
  })

  // Mốc chưa chọn icon (`''`) vẫn phải có chỗ đứng ổn định, không rơi ra khỏi danh sách.
  it('Theo loại: mốc chưa chọn icon vẫn còn trong danh sách', () => {
    const co = [...list, e('z', 'Chưa đặt icon', 2040, 500_000, '')]
    expect(drawerEvents(co, { q: '', sort: 'type' })).toHaveLength(5)
  })
})

describe('drawerEvents — ô tìm', () => {
  it('tìm không dấu vẫn ra: "nuoi" khớp "Nuôi con"', () => {
    expect(drawerEvents(list, { q: 'nuoi', sort: 'year' }).map((x) => x.id)).toEqual(['a'])
  })

  it('không phân biệt hoa thường', () => {
    expect(drawerEvents(list, { q: 'MUA NHÀ', sort: 'year' }).map((x) => x.id)).toEqual(['b'])
  })

  it('ô tìm rỗng thì giữ nguyên mọi mốc', () => {
    expect(drawerEvents(list, { q: '   ', sort: 'year' })).toHaveLength(4)
  })

  it('không khớp gì thì trả danh sách rỗng, không nổ', () => {
    expect(drawerEvents(list, { q: 'xyzzy', sort: 'year' })).toEqual([])
  })

  // Lọc TRƯỚC rồi sắp — không phải sắp rồi lọc: kết quả giống nhau nhưng thứ tự trong
  // nhóm "Theo loại" thì không, vì nhóm được dựng từ chính danh sách đã lọc.
  it('lọc rồi sắp: kết quả vẫn đúng thứ tự của cách đang chọn', () => {
    // 'n' bỏ dấu khớp 'nuoi con', 'mua nha', 'luong huu' — KHÔNG khớp 'cuoi'. Nên phép
    // này vừa lọc bớt một mốc vừa còn ba mốc để kiểm thứ tự.
    const r = drawerEvents(list, { q: 'n', sort: 'money' }).map((x) => x.id)
    // Nuôi con 1,2tr · Lương hưu 0,9tr · Mua nhà 0,3tr.
    expect(r).toEqual(['a', 'd', 'b'])
  })
})

describe('drawerEvents — không đụng đầu vào', () => {
  it('không sắp xếp tại chỗ mảng của chỗ gọi', () => {
    const goc = [...list]
    drawerEvents(goc, { q: '', sort: 'money' })
    expect(goc.map((x) => x.id)).toEqual(['a', 'b', 'c', 'd'])
  })
})
