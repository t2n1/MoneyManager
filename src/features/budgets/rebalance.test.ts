import { describe, expect, it } from 'vitest'
import { nenHoiLai, planRebalance, type RebalanceLine } from './rebalance'

/** Dòng hạn mức tối thiểu; `budgeted` mặc định bằng `amount` (không bật dồn). */
const line = (over: Partial<RebalanceLine> & { categoryId: string }): RebalanceLine => ({
  name: over.categoryId,
  amount: 0,
  budgeted: over.amount ?? 0,
  spent: 0,
  fixedSpent: 0,
  ...over,
})

// Giữa tháng 30 ngày: đã trôi một nửa, nên nội suy nhân đôi số đã chi.
const GIUA_THANG = { daysElapsed: 15, daysInMonth: 30 }

describe('planRebalance', () => {
  it('đề nghị lấy từ mục dư nhất bù cho mục thiếu nhất', () => {
    const p = planRebalance({
      ...GIUA_THANG,
      lines: [
        line({ categoryId: 'com-ngoai', amount: 60_000, spent: 40_000 }),
        line({ categoryId: 'giai-tri', amount: 30_000, spent: 5_000 }),
      ],
    })
    expect(p?.to.categoryId).toBe('com-ngoai')
    expect(p?.to.deficit).toBe(20_000)
    expect(p?.from?.categoryId).toBe('giai-tri')
    expect(p?.amount).toBe(20_000)
  })

  it('số chuyển đi và số chuyển đến bằng nhau — tổng ngân sách không đổi', () => {
    const p = planRebalance({
      ...GIUA_THANG,
      lines: [
        line({ categoryId: 'com-ngoai', amount: 60_000, spent: 40_000 }),
        line({ categoryId: 'giai-tri', amount: 30_000, spent: 5_000 }),
      ],
    })
    // Một đề nghị là một CẶP trừ–cộng cùng giá trị. Đây là bất biến giữ cho tổng
    // không phình; hỏng nó là hỏng toàn bộ lý do tính năng này tồn tại.
    expect(-p!.amount + p!.amount).toBe(0)
    expect(p!.amount).toBeGreaterThan(0)
    expect(p!.amount).toBeLessThanOrEqual(p!.from!.surplus)
    expect(p!.amount).toBeLessThanOrEqual(p!.to.deficit)
  })

  it('trước ngày 7 thì chưa đoán được gì — im', () => {
    const p = planRebalance({
      daysElapsed: 5,
      daysInMonth: 30,
      lines: [
        line({ categoryId: 'com-ngoai', amount: 60_000, spent: 40_000 }),
        line({ categoryId: 'giai-tri', amount: 30_000, spent: 0 }),
      ],
    })
    expect(p).toBeNull()
  })

  it('thiếu dưới ngưỡng thì im — cảnh báo lúc nào cũng kêu thì mất tác dụng', () => {
    const p = planRebalance({
      ...GIUA_THANG,
      lines: [
        // nội suy ra ¥61.000 trên trần ¥60.000 — thiếu ¥1.000, dưới cả hai ngưỡng
        line({ categoryId: 'com-ngoai', amount: 60_000, spent: 30_500 }),
        line({ categoryId: 'giai-tri', amount: 30_000, spent: 5_000 }),
      ],
    })
    expect(p).toBeNull()
  })

  it('thiếu đủ tiền nhưng chưa tới 10% trần thì cũng im', () => {
    const p = planRebalance({
      ...GIUA_THANG,
      lines: [
        // nội suy ¥504.000 trên trần ¥500.000 — thiếu ¥4.000, qua ngưỡng tiền
        // nhưng chỉ 0,8% trần
        line({ categoryId: 'to-dung', amount: 500_000, spent: 252_000 }),
        line({ categoryId: 'giai-tri', amount: 30_000, spent: 5_000 }),
      ],
    })
    expect(p).toBeNull()
  })

  it('không mục nào còn dư thì NÓI RA số thiếu, không im lặng', () => {
    const p = planRebalance({
      ...GIUA_THANG,
      lines: [
        line({ categoryId: 'com-ngoai', amount: 60_000, spent: 40_000 }),
        line({ categoryId: 'giai-tri', amount: 30_000, spent: 20_000 }),
      ],
    })
    expect(p).not.toBeNull()
    expect(p?.to.categoryId).toBe('com-ngoai')
    expect(p?.from).toBeNull()
    expect(p?.amount).toBe(0)
  })

  it('mục chi cố định đã trả không bị coi là sắp vượt', () => {
    // Tiền nhà trả nguyên một lần ngày 6. Nội suy trơn sẽ ra gấp đôi trần và báo
    // vượt ¥112.760 mỗi tháng — đúng cái bẫy `fixedSoFar` sinh ra để tránh.
    const p = planRebalance({
      ...GIUA_THANG,
      lines: [
        line({ categoryId: 'tien-nha', amount: 112_760, spent: 112_760, fixedSpent: 112_760 }),
      ],
    })
    expect(p).toBeNull()
  })

  it('trần đặt ở NHÓM: phần cố định của con không bị nội suy theo ngày', () => {
    // Ca thật ở dữ liệu demo: trần đặt trên nhóm `Nhà ở` (cost_type null), còn `fixed`
    // nằm ở con `Tiền nhà`. Đọc cờ cố định từ DÒNG HẠN MỨC là bỏ sót, và nhóm bị báo
    // vượt gấp bốn lần sự thật. Cố định phải đọc theo danh mục của CHÍNH giao dịch —
    // cùng quy tắc với useMonthPace.
    //
    // Đã chi ¥125.160 = tiền nhà ¥112.760 (một lần) + điện nước ¥12.400.
    // Chỉ phần biến đổi được nhân đôi: 112.760 + 12.400×2 = 137.560 → vượt ¥17.560.
    const p = planRebalance({
      ...GIUA_THANG,
      lines: [
        line({ categoryId: 'nha-o', amount: 120_000, spent: 125_160, fixedSpent: 112_760 }),
        line({ categoryId: 'giai-tri', amount: 200_000, spent: 10_000 }),
      ],
    })
    expect(p?.to.categoryId).toBe('nha-o')
    expect(p?.to.deficit).toBe(17_560)
  })

  it('không rút quá hạn mức GỐC của mục cho, dù phần dồn làm nó trông dư nhiều', () => {
    const p = planRebalance({
      ...GIUA_THANG,
      lines: [
        line({ categoryId: 'com-ngoai', amount: 60_000, spent: 40_000 }),
        // trần hiệu lực ¥30.000 nhưng chỉ ¥10.000 là của tháng này, ¥20.000 là dồn
        line({ categoryId: 'khach-san', amount: 10_000, budgeted: 30_000, spent: 0 }),
      ],
    })
    expect(p?.from?.categoryId).toBe('khach-san')
    expect(p?.amount).toBe(10_000)
  })

  it('chỉ coi là dư phần mà kể cả trường hợp xấu mục đó vẫn không cần', () => {
    // Cùng mức chi trung bình, nhưng nhịp chi nhấp nhô nên cận trên cao hơn hẳn.
    const deu = planRebalance({
      ...GIUA_THANG,
      lines: [
        line({ categoryId: 'com-ngoai', amount: 60_000, spent: 40_000 }),
        line({ categoryId: 'giai-tri', amount: 30_000, spent: 7_500, daily: Array(15).fill(500) }),
      ],
    })
    const nhapNho = planRebalance({
      ...GIUA_THANG,
      lines: [
        line({ categoryId: 'com-ngoai', amount: 60_000, spent: 40_000 }),
        line({
          categoryId: 'giai-tri',
          amount: 30_000,
          spent: 7_500,
          daily: [...Array(14).fill(0), 7_500],
        }),
      ],
    })
    expect(nhapNho!.amount).toBeLessThan(deu!.amount)
  })

  it('không có dòng nào thì trả null, không nổ', () => {
    expect(planRebalance({ ...GIUA_THANG, lines: [] })).toBeNull()
  })
})

describe('nenHoiLai — sau khi người dùng bấm "Để yên"', () => {
  it('chưa từ chối lần nào thì cứ hỏi', () => {
    expect(nenHoiLai(10_000, null)).toBe(true)
  })

  it('tình hình y như lúc từ chối thì im', () => {
    expect(nenHoiLai(10_000, 10_000)).toBe(false)
  })

  it('thiếu nhiều hơn một chút vẫn im — không rình từng đồng', () => {
    expect(nenHoiLai(12_000, 10_000)).toBe(false)
  })

  it('thiếu tăng rưỡi thì hỏi lại — chuyện đã khác chứ không phải cùng một chuyện', () => {
    expect(nenHoiLai(15_000, 10_000)).toBe(true)
  })

  it('thiếu giảm đi thì càng im', () => {
    expect(nenHoiLai(4_000, 10_000)).toBe(false)
  })
})
