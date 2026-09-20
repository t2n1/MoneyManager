import { describe, expect, it } from 'vitest'
import {
  SMALL_GROUP_ID,
  buildCategoryTreemap,
  collapseSmallGroups,
  layoutFlat,
  layoutGrouped,
  squarify,
  type TreemapGroupInput,
  type TreemapLeaf,
  type Rect,
} from './treemap'

const BOX: Rect = { x: 0, y: 0, w: 600, h: 300 }

const leaf = (id: string, value: number): TreemapLeaf => ({ id, label: id, value })

/** Hai ô chồng nhau khi hình chiếu lên CẢ hai trục đều giao nhau (chạm mép thì không). */
const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.w - 1e-6 &&
  b.x < a.x + a.w - 1e-6 &&
  a.y < b.y + b.h - 1e-6 &&
  b.y < a.y + a.h - 1e-6

const anyOverlap = (rs: readonly Rect[]) =>
  rs.some((a, i) => rs.slice(i + 1).some((b) => overlaps(a, b)))

const inside = (r: Rect, box: Rect) =>
  r.x >= box.x - 1e-6 &&
  r.y >= box.y - 1e-6 &&
  r.x + r.w <= box.x + box.w + 1e-6 &&
  r.y + r.h <= box.y + box.h + 1e-6

describe('squarify', () => {
  it('một khoản chiếm trọn khung', () => {
    const [t] = squarify([leaf('a', 100)], BOX)
    expect(t.w).toBeCloseTo(600)
    expect(t.h).toBeCloseTo(300)
  })

  it('diện tích tỉ lệ đúng với số tiền', () => {
    const tiles = squarify([leaf('a', 300), leaf('b', 100), leaf('c', 100)], BOX)
    const area = (id: string) => {
      const t = tiles.find((x) => x.id === id)!
      return t.w * t.h
    }
    // a gấp ba b → diện tích cũng phải gấp ba, không phải "to hơn một chút"
    expect(area('a') / area('b')).toBeCloseTo(3, 5)
    expect(area('b')).toBeCloseTo(area('c'), 5)
  })

  it('tổng diện tích các ô lấp kín khung', () => {
    const tiles = squarify([leaf('a', 7), leaf('b', 5), leaf('c', 3), leaf('d', 1)], BOX)
    const sum = tiles.reduce((s, t) => s + t.w * t.h, 0)
    expect(sum).toBeCloseTo(BOX.w * BOX.h, 3)
  })

  it('không ô nào chồng lên ô nào', () => {
    const tiles = squarify(
      [112760, 54397, 30000, 28455, 16428, 13100, 8800, 8295, 4890, 4533, 2200, 1205].map(
        (v, i) => leaf(`c${i}`, v),
      ),
      BOX,
    )
    expect(anyOverlap(tiles)).toBe(false)
  })

  it('không ô nào tràn ra ngoài khung', () => {
    const tiles = squarify([9, 8, 7, 6, 5, 4, 3, 2, 1].map((v, i) => leaf(`c${i}`, v)), {
      x: 12,
      y: 7,
      w: 331,
      h: 180,
    })
    expect(tiles.every((t) => inside(t, { x: 12, y: 7, w: 331, h: 180 }))).toBe(true)
  })

  it('ô vuông vức, không ra sợi chỉ', () => {
    // Đây là LÝ DO dùng squarified thay vì cắt lát: 16 khoản bằng nhau trong khung
    // 600×300 cắt lát sẽ ra 16 cột rộng 37px cao 300px (tỉ lệ 8:1), không đọc nổi nhãn.
    const tiles = squarify(
      Array.from({ length: 16 }, (_, i) => leaf(`c${i}`, 10)),
      BOX,
    )
    const worst = Math.max(...tiles.map((t) => Math.max(t.w / t.h, t.h / t.w)))
    expect(worst).toBeLessThan(2)
  })

  it('khoản to đứng trước — góc trên trái là khoản nặng nhất', () => {
    const tiles = squarify([leaf('nho', 1), leaf('to', 100), leaf('vua', 10)], BOX)
    expect(tiles[0].id).toBe('to')
    expect(tiles[0].x).toBeCloseTo(0)
    expect(tiles[0].y).toBeCloseTo(0)
  })

  it('bỏ khoản 0 và khoản âm — chúng không có diện tích để vẽ', () => {
    const tiles = squarify([leaf('a', 100), leaf('khong', 0), leaf('am', -50)], BOX)
    expect(tiles.map((t) => t.id)).toEqual(['a'])
  })

  it('không có gì để vẽ thì trả mảng rỗng, không ném lỗi', () => {
    expect(squarify([], BOX)).toEqual([])
    expect(squarify([leaf('a', 0)], BOX)).toEqual([])
    expect(squarify([leaf('a', 100)], { x: 0, y: 0, w: 0, h: 300 })).toEqual([])
  })
})

describe('layoutFlat', () => {
  it('giữ nguyên nhóm cha của từng khoản để tô màu và mở trang chi tiết', () => {
    const tiles = layoutFlat(
      [
        { id: 'thue', label: 'Tiền nhà', value: 112760, groupId: 'nha', groupLabel: 'Nhà ở' },
        { id: 'com', label: 'Cơm ngoài', value: 54397, groupId: 'an', groupLabel: 'Ăn uống' },
      ],
      BOX,
    )
    expect(tiles.map((t) => t.groupId)).toEqual(['nha', 'an'])
    expect(tiles.find((t) => t.id === 'com')!.groupLabel).toBe('Ăn uống')
  })

  it('tỉ lệ đọc theo TỔNG truyền vào, không theo tổng các ô', () => {
    // Tổng thật của kỳ gồm cả khoản không có danh mục. Nếu share tính theo tổng các ô
    // thì "Tiền nhà 40%" sẽ in ra 45% chỉ vì vài khoản không lên hình.
    const tiles = layoutFlat(
      [{ id: 'thue', label: 'Tiền nhà', value: 100, groupId: null, groupLabel: null }],
      BOX,
      200,
    )
    expect(tiles[0].share).toBeCloseTo(0.5)
  })
})

describe('collapseSmallGroups', () => {
  const G = (id: string, value: number): TreemapGroupInput => ({
    id,
    label: id,
    children: [leaf(`${id}-1`, value)],
  })

  it('gom các nhóm dưới ngưỡng thành một ô "khác"', () => {
    const out = collapseSmallGroups([G('to', 900), G('nho', 30), G('teo', 20)], 0.05)
    expect(out.map((g) => g.id)).toEqual(['to', SMALL_GROUP_ID])
    const khac = out.find((g) => g.id === SMALL_GROUP_ID)!
    expect(khac.children.map((c) => c.id)).toEqual(['nho-1', 'teo-1'])
  })

  it('nhóm đúng ngưỡng thì GIỮ, không gom', () => {
    const out = collapseSmallGroups([G('to', 950), G('dung', 50)], 0.05)
    expect(out.map((g) => g.id)).toEqual(['to', 'dung'])
  })

  it('chỉ một nhóm nhỏ thì để nguyên — gom lại chỉ là đổi tên nó thành "khác"', () => {
    const out = collapseSmallGroups([G('to', 990), G('nho', 10)], 0.05)
    expect(out.map((g) => g.id)).toEqual(['to', 'nho'])
  })

  it('không làm mất đồng nào', () => {
    const groups = [G('a', 500), G('b', 300), G('c', 20), G('d', 15), G('e', 5)]
    const before = 840
    const after = collapseSmallGroups(groups, 0.05)
      .flatMap((g) => g.children)
      .reduce((s, c) => s + c.value, 0)
    expect(after).toBe(before)
  })
})

describe('layoutGrouped', () => {
  const GROUPS: TreemapGroupInput[] = [
    {
      id: 'nha',
      label: 'Nhà ở',
      children: [leaf('thue', 112760), leaf('dien', 3994), leaf('dt', 3314)],
    },
    {
      id: 'an',
      label: 'Ăn uống',
      children: [leaf('com', 54397), leaf('cho', 16428), leaf('vat', 8295)],
    },
    { id: 'hoc', label: 'Giáo dục', children: [leaf('sach', 2200)] },
  ]

  it('khung nhóm tỉ lệ với tổng của nhóm', () => {
    const { groups } = layoutGrouped(GROUPS, BOX, { gap: 0, header: 0 })
    const areaOf = (id: string) => {
      const g = groups.find((x) => x.id === id)!
      return g.w * g.h
    }
    expect(areaOf('nha') / areaOf('an')).toBeCloseTo(120068 / 79120, 4)
  })

  it('mọi khoản nằm gọn trong khung nhóm của nó', () => {
    const { groups, leaves } = layoutGrouped(GROUPS, BOX, { gap: 2, header: 14 })
    for (const t of leaves) {
      const g = groups.find((x) => x.id === t.groupId)!
      expect(inside(t, g)).toBe(true)
    }
  })

  it('không khoản nào chồng lên khoản nào, kể cả khác nhóm', () => {
    const { leaves } = layoutGrouped(GROUPS, BOX, { gap: 2, header: 14 })
    expect(anyOverlap(leaves)).toBe(false)
  })

  it('nhường chỗ cho dòng tiêu đề nhóm — khoản đầu không đè lên tên nhóm', () => {
    const { groups, leaves } = layoutGrouped(GROUPS, BOX, { gap: 0, header: 14 })
    const nha = groups.find((g) => g.id === 'nha')!
    for (const t of leaves.filter((l) => l.groupId === 'nha')) {
      expect(t.y).toBeGreaterThanOrEqual(nha.y + 14 - 1e-6)
    }
  })

  it('khung nhóm quá thấp thì BỎ tiêu đề chứ không đẩy khoản ra ngoài', () => {
    // Giáo dục chỉ chiếm 0,7% — khung của nó thấp hơn cả dòng tiêu đề.
    const { groups, leaves } = layoutGrouped(GROUPS, BOX, { gap: 0, header: 14 })
    const hoc = groups.find((g) => g.id === 'hoc')!
    expect(hoc.showHeader).toBe(false)
    expect(leaves.filter((l) => l.groupId === 'hoc').every((t) => inside(t, hoc))).toBe(true)
  })

  it('share của khoản đọc theo tổng toàn kỳ, không theo tổng của nhóm', () => {
    const { leaves } = layoutGrouped(GROUPS, BOX, { gap: 0, header: 0 }, 301036)
    expect(leaves.find((l) => l.id === 'thue')!.share).toBeCloseTo(112760 / 301036, 6)
  })

  it('nhóm rỗng không tạo khung ma', () => {
    const { groups } = layoutGrouped(
      [...GROUPS, { id: 'rong', label: 'Rỗng', children: [] }],
      BOX,
      { gap: 0, header: 0 },
    )
    expect(groups.map((g) => g.id)).not.toContain('rong')
  })
})

describe('layoutGrouped — nhóm chỉ có chính nó', () => {
  it('không tiêu chỗ cho dòng tên khi ô con mang đúng tên nhóm', () => {
    // Danh mục cấp một không có con (hoặc danh mục đã xoá) tự thành một "nhóm" chứa
    // đúng một ô tên y hệt. In tên hai lần chồng lên nhau là vừa xấu vừa ăn mất chỗ.
    const { groups, leaves } = layoutGrouped(
      [
        { id: 'a', label: 'To', children: [leaf('a1', 60), leaf('a2', 40)] },
        { id: 'le', label: 'Lẻ', children: [{ id: 'le', label: 'Lẻ', value: 100 }] },
      ],
      BOX,
      { gap: 0, header: 14 },
    )
    const le = groups.find((g) => g.id === 'le')!
    expect(le.showHeader).toBe(false)
    expect(leaves.find((l) => l.id === 'le')!.h).toBeCloseTo(le.h, 6)
  })
})

describe('buildCategoryTreemap', () => {
  const CATS = [
    { id: 'nha', name: 'Nhà ở', parent_id: null },
    { id: 'thue', name: 'Tiền nhà', parent_id: 'nha' },
    { id: 'dien', name: 'Điện', parent_id: 'nha' },
    { id: 'an', name: 'Ăn uống', parent_id: null },
    { id: 'com', name: 'Cơm ngoài', parent_id: 'an' },
    { id: 'le', name: 'Lặt vặt', parent_id: null },
  ]
  const ROWS = [
    { categoryId: 'thue', name: 'Tiền nhà', thisMonth: 112760 },
    { categoryId: 'com', name: 'Cơm ngoài', thisMonth: 54397 },
    { categoryId: 'dien', name: 'Điện', thisMonth: 3994 },
    { categoryId: 'le', name: 'Lặt vặt', thisMonth: 2000 },
  ]

  it('con về đúng nhóm cha, cha xếp theo tổng giảm dần', () => {
    const { groups } = buildCategoryTreemap(ROWS, CATS)
    expect(groups.map((g) => g.label)).toEqual(['Nhà ở', 'Ăn uống', 'Lặt vặt'])
    expect(groups[0].children.map((c) => c.label)).toEqual(['Tiền nhà', 'Điện'])
  })

  it('danh mục cấp một tự thành nhóm chứa đúng chính nó', () => {
    const { groups } = buildCategoryTreemap(ROWS, CATS)
    const le = groups.find((g) => g.id === 'le')!
    expect(le.children).toEqual([{ id: 'le', label: 'Lặt vặt', value: 2000 }])
  })

  it('danh mục đã xoá vẫn lên hình — bỏ đi là tổng hình lệch tổng bảng', () => {
    const { groups, total } = buildCategoryTreemap(
      [...ROWS, { categoryId: 'mat', name: 'Danh mục đã xoá', thisMonth: 500 }],
      CATS,
    )
    expect(groups.some((g) => g.id === 'mat')).toBe(true)
    expect(total).toBe(173651)
  })

  it('bản phẳng mang theo nhóm cha để tô màu', () => {
    const { flat } = buildCategoryTreemap(ROWS, CATS)
    const com = flat.find((l) => l.id === 'com')!
    expect(com.groupId).toBe('an')
    expect(com.groupLabel).toBe('Ăn uống')
    const le = flat.find((l) => l.id === 'le')!
    expect(le.groupId).toBe('le')
  })

  it('bỏ dòng 0 và dòng âm', () => {
    const { flat, total } = buildCategoryTreemap(
      [...ROWS, { categoryId: 'hoan', name: 'Hoàn tiền', thisMonth: -900 }],
      CATS,
    )
    expect(flat.some((l) => l.id === 'hoan')).toBe(false)
    expect(total).toBe(173151)
  })
})
