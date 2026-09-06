import { describe, expect, it } from 'vitest'
import { demoSessions, demoWalk } from './demoPrices'

describe('demoSessions', () => {
  it('chỉ thứ Hai tới thứ Sáu', () => {
    // 2026-01-03 là thứ Bảy, 04 là Chủ nhật.
    expect(demoSessions('2026-01-02', '2026-01-05')).toEqual(['2026-01-02', '2026-01-05'])
  })

  it('khoảng lộn ngược thì rỗng, không lặp vô hạn', () => {
    expect(demoSessions('2026-01-05', '2026-01-01')).toEqual([])
  })
})

describe('demoWalk', () => {
  it('phiên cuối bằng ĐÚNG giá trị neo — không xê xích', () => {
    const w = demoWalk('HPG', 50, 21_700, 0.03)
    expect(w.at(-1)).toBe(21_700)
  })

  it('cùng hạt giống ra cùng một đường — biểu đồ không được nhảy hình mỗi lần vẽ', () => {
    expect(demoWalk('HPG', 40, 21_700, 0.03)).toEqual(demoWalk('HPG', 40, 21_700, 0.03))
  })

  it('hai mã khác nhau ra hai đường khác nhau', () => {
    expect(demoWalk('HPG', 40, 21_700, 0.03)).not.toEqual(demoWalk('MBB', 40, 21_700, 0.03))
  })

  it('luôn dương — giá 0 hoặc âm làm vỡ mọi phép chia phía sau', () => {
    expect(demoWalk('X', 200, 1, 0.3).every((v) => v > 0)).toBe(true)
  })

  it('n = 0 ra rỗng', () => {
    expect(demoWalk('HPG', 0, 21_700, 0.03)).toEqual([])
  })

  it('neo GIỮA chuỗi cũng khớp đúng, không chỉ neo cuối', () => {
    const w = demoWalk('FPT', 100, 70_300, 0.03, [{ index: 30, value: 62_000 }])
    expect(w[30]).toBe(62_000)
    expect(w.at(-1)).toBe(70_300)
  })

  it('nhiều neo thì khớp hết — mỗi lệnh mua là một neo', () => {
    const w = demoWalk('FPT', 100, 70_300, 0.03, [
      { index: 10, value: 50_000 },
      { index: 60, value: 65_000 },
    ])
    expect([w[10], w[60], w.at(-1)]).toEqual([50_000, 65_000, 70_300])
  })

  it('neo ngoài phạm vi thì bỏ qua chứ không nổ', () => {
    const w = demoWalk('FPT', 20, 70_300, 0.03, [{ index: 99, value: 1_000 }])
    expect(w).toHaveLength(20)
    expect(w.at(-1)).toBe(70_300)
  })
})
