import { describe, expect, it } from 'vitest'
import {
  buildSankey,
  capSlices,
  groupSlicesByParent,
  labelPlan,
  ribbonPath,
  SANKEY_HUB_ID,
  type SankeyInput,
  type SankeyModel,
} from './sankey'

const CATS = [
  { id: 'nha', name: 'Nhà ở', icon: '🏠', parent_id: null },
  { id: 'thue', name: 'Tiền thuê', icon: '🔑', parent_id: 'nha' },
  { id: 'dien', name: 'Điện nước', icon: '💡', parent_id: 'nha' },
  { id: 'an', name: 'Ăn uống', icon: '🍚', parent_id: null },
]

// Một tháng "bình thường": thu 500.000, chi 300.000 (trong đó 20.000 chưa ghi),
// chuyển tài sản 80.000 → để lại 120.000.
const BINH_THUONG: SankeyInput = {
  income: 500_000,
  incomeSlices: [
    { id: 'luong', label: 'Lương', amount: 460_000 },
    { id: 'thuong', label: 'Thưởng', amount: 40_000 },
  ],
  expense: 300_000,
  expenseGroups: [
    { id: 'nha', label: 'Nhà ở', amount: 150_000 },
    { id: 'an', label: 'Ăn uống', amount: 90_000 },
    { id: 'dilai', label: 'Đi lại', amount: 40_000 },
  ],
  chuaGhi: 20_000,
  transfer: 80_000,
}

const nodeById = (m: SankeyModel, id: string) => m.nodes.find((n) => n.id === id)
const colOf = (m: SankeyModel, c: number) => m.nodes.filter((n) => n.col === c)
const sumCol = (m: SankeyModel, c: number) => colOf(m, c).reduce((s, n) => s + n.value, 0)

describe('capSlices', () => {
  it('giữ nguyên khi số lát chưa vượt trần', () => {
    const out = capSlices([{ id: 'a', label: 'A', amount: 3 }], 6)
    expect(out).toHaveLength(1)
  })

  it('sắp giảm dần và gộp đuôi thành một mục có ĐẾM số lượng', () => {
    const out = capSlices(
      [
        { id: 'a', label: 'A', amount: 1 },
        { id: 'b', label: 'B', amount: 9 },
        { id: 'c', label: 'C', amount: 5 },
        { id: 'd', label: 'D', amount: 2 },
      ],
      3,
    )
    expect(out.map((s) => s.id)).toEqual(['b', 'c', 'other'])
    expect(out[2].amount).toBe(3) // 1 + 2
    expect(out[2].label).toBe('Khác (2)')
  })

  it('loại lát ≤ 0 — hoàn tiền nhiều hơn chi thì nhóm đó không vẽ được', () => {
    const out = capSlices(
      [
        { id: 'a', label: 'A', amount: 10 },
        { id: 'b', label: 'B', amount: 0 },
        { id: 'c', label: 'C', amount: -5 },
      ],
      6,
    )
    expect(out.map((s) => s.id)).toEqual(['a'])
  })

  it('tổng KHÔNG đổi sau khi gộp', () => {
    const slices = Array.from({ length: 20 }, (_, i) => ({
      id: `c${i}`,
      label: `C${i}`,
      amount: (i + 1) * 100,
    }))
    const before = slices.reduce((s, x) => s + x.amount, 0)
    const after = capSlices(slices, 5).reduce((s, x) => s + x.amount, 0)
    expect(after).toBe(before)
  })
})

describe('groupSlicesByParent', () => {
  it('cộng các lá về đúng danh mục cha, nhãn có icon', () => {
    const out = groupSlicesByParent(
      [
        { categoryId: 'thue', amount: 100 },
        { categoryId: 'dien', amount: 30 },
        { categoryId: 'an', amount: 60 },
      ],
      CATS,
    )
    expect(out).toEqual([
      { id: 'nha', label: '🏠 Nhà ở', amount: 130 },
      { id: 'an', label: '🍚 Ăn uống', amount: 60 },
    ])
  })

  it('danh mục đã xoá KHÔNG bị bỏ — bỏ là cột chi mất cân trong im lặng', () => {
    const out = groupSlicesByParent([{ categoryId: 'bay-hoi', amount: 50 }], CATS)
    expect(out).toEqual([{ id: 'mat:bay-hoi', label: 'Danh mục đã xoá', amount: 50 }])
  })

  it('giữ nguyên tổng và sắp giảm dần', () => {
    const slices = [
      { categoryId: 'an', amount: 10 },
      { categoryId: 'thue', amount: 90 },
      { categoryId: 'dien', amount: 5 },
    ]
    const out = groupSlicesByParent(slices, CATS)
    expect(out.reduce((s, x) => s + x.amount, 0)).toBe(105)
    expect(out[0].id).toBe('nha')
  })

  it('bỏ lát ≤ 0 (hoàn tiền vượt chi trong tháng)', () => {
    expect(groupSlicesByParent([{ categoryId: 'an', amount: -5 }], CATS)).toEqual([])
  })
})

describe('ribbonPath', () => {
  it('đóng kín (kết thúc bằng Z) để tô được', () => {
    expect(ribbonPath(0, 0, 10, 100, 20, 40).endsWith('Z')).toBe(true)
  })

  it('điểm điều khiển nằm chính giữa hai cột', () => {
    expect(ribbonPath(0, 0, 10, 100, 0, 10)).toContain('C50,0 50,0 100,0')
  })

  it('làm tròn 2 chữ số — không nhả chuỗi dài vô ích vào DOM', () => {
    expect(ribbonPath(0, 1 / 3, 1, 10, 0, 1)).toContain('0.33')
  })
})

describe('buildSankey — ràng buộc cân bằng', () => {
  const m = buildSankey(BINH_THUONG)!

  it('dựng được', () => {
    expect(m).not.toBeNull()
  })

  it('cột nguồn cộng đúng bằng tiền vào', () => {
    expect(sumCol(m, 0)).toBe(m.total)
  })

  it('nút giữa mang đúng tổng', () => {
    expect(nodeById(m, SANKEY_HUB_ID)!.value).toBe(500_000)
    expect(m.total).toBe(500_000)
  })

  it('ba đường cộng lại đúng bằng tiền vào', () => {
    expect(sumCol(m, 2)).toBe(m.total)
  })

  it('cột nhóm chi cộng đúng bằng khúc "Chi tiêu"', () => {
    expect(sumCol(m, 3)).toBe(nodeById(m, 'tier:expense')!.value)
  })

  it('mọi dải nối đều có nút hai đầu', () => {
    const ids = new Set(m.nodes.map((n) => n.id))
    for (const l of m.links) {
      expect(ids.has(l.source)).toBe(true)
      expect(ids.has(l.target)).toBe(true)
    }
  })

  it('mỗi nút vẽ ra chiều cao dương và nằm trong khung', () => {
    for (const n of m.nodes) {
      expect(n.y1).toBeGreaterThan(n.y0)
      expect(n.y0).toBeGreaterThanOrEqual(0)
      expect(n.y1).toBeLessThanOrEqual(m.height + 0.001)
    }
  })

  it('bốn cột nằm ở bốn hoành độ khác nhau, cột cuối chạm mép phải', () => {
    const xs = [0, 1, 2, 3].map((c) => colOf(m, c)[0].x0)
    expect(new Set(xs).size).toBe(4)
    expect(colOf(m, 3)[0].x1).toBe(m.width)
  })
})

describe('buildSankey — phần chưa ghi và phần chưa gắn danh mục', () => {
  it('"Chưa ghi rõ" là nhánh riêng và nằm CUỐI cột', () => {
    const m = buildSankey(BINH_THUONG)!
    const col3 = colOf(m, 3)
    expect(col3[col3.length - 1].id).toBe('g:chua-ghi')
    expect(col3[col3.length - 1].value).toBe(20_000)
    expect(col3[col3.length - 1].tone).toBe('unknown')
  })

  it('không có phần chưa ghi thì không đẻ ra nhánh rỗng', () => {
    const m = buildSankey({ ...BINH_THUONG, expense: 280_000, chuaGhi: 0 })!
    expect(nodeById(m, 'g:chua-ghi')).toBeUndefined()
  })

  it('khoản thu không gắn danh mục vẫn được vẽ, không bị nuốt', () => {
    const m = buildSankey({
      ...BINH_THUONG,
      incomeSlices: [{ id: 'luong', label: 'Lương', amount: 460_000 }],
    })!
    expect(nodeById(m, 'in:khong-danh-muc')!.value).toBe(40_000)
    expect(sumCol(m, 0)).toBe(m.total)
  })

  it('khoản chi không gắn danh mục vẫn được vẽ', () => {
    const m = buildSankey({
      ...BINH_THUONG,
      expenseGroups: [{ id: 'nha', label: 'Nhà ở', amount: 150_000 }],
    })!
    expect(nodeById(m, 'g:khong-danh-muc')!.value).toBe(130_000)
    expect(sumCol(m, 3)).toBe(280_000 + 20_000)
  })
})

describe('buildSankey — chi vượt thu', () => {
  // Thu 100.000, chi 150.000 → thiếu 50.000 phải rút từ số dư.
  const m = buildSankey({
    income: 100_000,
    incomeSlices: [{ id: 'luong', label: 'Lương', amount: 100_000 }],
    expense: 150_000,
    expenseGroups: [{ id: 'nha', label: 'Nhà ở', amount: 150_000 }],
    chuaGhi: 0,
    transfer: 0,
  })!

  it('thêm nguồn "Rút từ số dư" thay vì kẹp phần để lại về 0', () => {
    expect(m.hasDeficit).toBe(true)
    expect(nodeById(m, 'in:deficit')!.value).toBe(50_000)
  })

  it('không vẽ khúc "Phần để lại" khi nó âm', () => {
    expect(nodeById(m, 'tier:kept')).toBeUndefined()
  })

  it('vẫn cân: cột nguồn = nút giữa = ba đường', () => {
    expect(sumCol(m, 0)).toBe(150_000)
    expect(m.total).toBe(150_000)
    expect(sumCol(m, 2)).toBe(150_000)
  })

  it('phần trăm tính trên tiền vào ĐÃ GỒM phần rút — nên chi là 100%', () => {
    expect(nodeById(m, 'tier:expense')!.pct).toBe(100)
  })
})

describe('buildSankey — trường hợp biên', () => {
  it('kỳ trống trả null thay vì hình rỗng', () => {
    expect(
      buildSankey({
        income: 0,
        incomeSlices: [],
        expense: 0,
        expenseGroups: [],
        chuaGhi: 0,
        transfer: 0,
      }),
    ).toBeNull()
  })

  it('chỉ có thu, chưa tiêu gì — tất cả rơi vào "Phần để lại"', () => {
    const m = buildSankey({
      income: 100_000,
      incomeSlices: [{ id: 'luong', label: 'Lương', amount: 100_000 }],
      expense: 0,
      expenseGroups: [],
      chuaGhi: 0,
      transfer: 0,
    })!
    expect(colOf(m, 2).map((n) => n.id)).toEqual(['tier:kept'])
    expect(colOf(m, 3)).toHaveLength(0)
    expect(m.links.filter((l) => l.source === 'tier:expense')).toHaveLength(0)
  })

  it('một nút chiếm trọn cột thì cao đúng bằng khung', () => {
    const m = buildSankey({
      income: 100_000,
      incomeSlices: [{ id: 'luong', label: 'Lương', amount: 100_000 }],
      expense: 100_000,
      expenseGroups: [{ id: 'nha', label: 'Nhà ở', amount: 100_000 }],
      chuaGhi: 0,
      transfer: 0,
    })!
    const hub = nodeById(m, SANKEY_HUB_ID)!
    expect(hub.y1 - hub.y0).toBeCloseTo(m.height, 5)
  })

  it('thang đo dùng chung: dải không phình/thóp dọc đường đi', () => {
    const m = buildSankey(BINH_THUONG)!
    for (const l of m.links) {
      const src = nodeById(m, l.source)!
      const dst = nodeById(m, l.target)!
      const kSrc = (src.y1 - src.y0) / src.value
      const kDst = (dst.y1 - dst.y0) / dst.value
      expect(kSrc).toBeCloseTo(kDst, 6)
    }
  })

  it('số tiền lẻ được làm tròn trước khi tính, không rò số thực vào toạ độ', () => {
    const m = buildSankey({ ...BINH_THUONG, income: 500_000.4, transfer: 79_999.6 })!
    expect(Number.isInteger(m.total)).toBe(true)
  })
})

describe('labelPlan', () => {
  const node = (id: string, col: number, y0: number, y1: number) =>
    ({ id, label: id, value: y1 - y0, col, tone: 'in', x0: 0, x1: 11, y0, y1, pct: null }) as const

  it('nút dày và đứng riêng được cả hai dòng nhãn', () => {
    const plan = labelPlan([node('a', 0, 0, 100)])
    expect(plan.get('a')).toBe(2)
  })

  it('nút mỏng ĐỨNG RIÊNG vẫn được một dòng — đây là ca đã đo hụt ở tháng 9 demo', () => {
    // Nút 10 đơn vị, nhưng nút trên nó cách xa: còn thừa chỗ cho tên.
    const plan = labelPlan([node('to', 0, 0, 100), node('nho', 0, 300, 310)])
    expect(plan.get('nho')).toBe(1)
  })

  it('hai nút mỏng SÁT NHAU thì chỉ nút trên được nhãn', () => {
    const plan = labelPlan([node('a', 0, 0, 10), node('b', 0, 11, 21)])
    expect(plan.get('a')).toBe(1)
    expect(plan.get('b')).toBe(0)
  })

  it('nút quá mỏng không bao giờ có nhãn', () => {
    expect(labelPlan([node('x', 0, 0, 3)]).get('x')).toBe(0)
  })

  it('mỗi cột xét riêng — nhãn cột này không chặn nhãn cột kia', () => {
    const plan = labelPlan([node('a', 0, 0, 40), node('b', 1, 0, 40)])
    expect(plan.get('a')).toBe(2)
    expect(plan.get('b')).toBe(2)
  })

  it('xét theo thứ tự TỪ TRÊN XUỐNG dù mảng vào lộn xộn', () => {
    const plan = labelPlan([node('duoi', 0, 11, 21), node('tren', 0, 0, 10)])
    expect(plan.get('tren')).toBe(1)
    expect(plan.get('duoi')).toBe(0)
  })

  it('mọi nút đều có mặt trong kế hoạch — không nút nào rơi ra ngoài', () => {
    const m = buildSankey(BINH_THUONG)!
    const plan = labelPlan(m.nodes)
    for (const n of m.nodes) expect(plan.has(n.id)).toBe(true)
  })
})
