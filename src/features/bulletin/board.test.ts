import { describe, expect, it } from 'vitest'
import {
  COLS,
  MODULES,
  addModule,
  addPage,
  bpFor,
  canAdd,
  defaultBoard,
  deriveCells,
  firstFit,
  layoutFor,
  loadBoard,
  normalizePage,
  pxFor,
  removeModule,
  removePage,
  renamePage,
  resetPage,
  rowsFor,
  scaleW,
  setLayout,
  setView,
  viewOf,
  type BoardState,
  type Cell,
} from './board'

/** Sinh id tất định để so được kết quả. */
const counter = () => {
  let n = 0
  return () => String(++n)
}

const overlap = (cells: Cell[]) =>
  cells.some((a, i) =>
    cells.some((b, j) => i !== j && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h),
  )

describe('lưới', () => {
  it('rowsFor và pxFor khớp nhau: đủ chỗ, hụt dưới một nấc', () => {
    for (const px of [1, 11, 12, 100, 333, 1000]) {
      const rows = rowsFor(px)
      expect(pxFor(rows)).toBeGreaterThanOrEqual(px)
      expect(pxFor(rows) - px).toBeLessThan(12)
    }
  })

  it('scaleW giữ nguyên ở 12 cột, co theo tỷ lệ ở lưới hẹp, không bao giờ về 0', () => {
    expect(scaleW(8, 12)).toBe(8)
    expect(scaleW(4, 6)).toBe(2)
    expect(scaleW(12, 6)).toBe(6)
    expect(scaleW(1, 1)).toBe(1)
    expect(scaleW(6, 1)).toBe(1)
  })

  it('firstFit lấp khoảng trống cạnh ô nửa bề ngang, không chồng lên ô cũ', () => {
    const cells: Cell[] = [{ i: 'a', x: 0, y: 0, w: 6, h: 10 }]
    expect(firstFit(cells, 6, 10, 12)).toEqual({ x: 6, y: 0 })
    expect(firstFit(cells, 12, 5, 12)).toEqual({ x: 0, y: 10 })
  })
})

describe('breakpoint chưa sửa', () => {
  it('bpFor theo bề rộng khung chứa', () => {
    expect(bpFor(1200)).toBe('lg')
    expect(bpFor(1000)).toBe('lg')
    expect(bpFor(999)).toBe('md')
    expect(bpFor(360)).toBe('sm')
  })

  it('deriveCells giữ thứ tự đọc khi dồn về một cột', () => {
    const lg: Cell[] = [
      { i: 'phai', x: 6, y: 0, w: 6, h: 5 },
      { i: 'trai', x: 0, y: 0, w: 6, h: 8 },
      { i: 'duoi', x: 0, y: 8, w: 12, h: 3 },
    ]
    const sm = deriveCells(lg, 'sm')
    expect(sm.map((c) => c.i)).toEqual(['trai', 'phai', 'duoi'])
    expect(sm.map((c) => c.y)).toEqual([0, 8, 13])
    expect(overlap(sm)).toBe(false)
    const md = deriveCells(lg, 'md')
    expect(md.find((c) => c.i === 'phai')).toMatchObject({ x: 3, w: 3, y: 0 })
    expect(overlap(md)).toBe(false)
  })

  it('layoutFor ưu tiên bố cục đã lưu của breakpoint đó', () => {
    const p = defaultBoard(counter()).pages[0]
    expect(layoutFor(p, 'sm')).toBe(p.layouts.sm)
    const blank = { ...p, layouts: { lg: p.layouts.lg } }
    expect(layoutFor(blank, 'sm')).toHaveLength(p.modules.length)
  })
})

describe('bảng mặc định', () => {
  it('trang Tổng quan có đủ mười khối cũ, mỗi khối một bản', () => {
    const s = defaultBoard(counter())
    expect(s.pages).toHaveLength(1)
    const types = s.pages[0].modules.map((m) => m.type)
    expect(new Set(types).size).toBe(10)
    expect(types).toEqual(expect.arrayContaining(['today', 'kpi', 'spending', 'recent', 'todo', 'budget']))
  })

  it('lg hai cột (8 + 4), md/sm một cột với Việc cần làm đứng đầu', () => {
    const p = defaultBoard(counter()).pages[0]
    const typeOf = (i: string) => p.modules.find((m) => m.id === i)!.type
    const lg = p.layouts.lg!
    expect(lg.find((c) => typeOf(c.i) === 'spending')).toMatchObject({ x: 0, w: 8 })
    expect(lg.find((c) => typeOf(c.i) === 'todo')).toMatchObject({ x: 8, w: 4, y: 0 })
    for (const bp of ['md', 'sm'] as const) {
      const cells = [...p.layouts[bp]!].sort((a, b) => a.y - b.y)
      expect(typeOf(cells[0].i)).toBe('todo')
      expect(cells.every((c) => c.w === COLS[bp] && c.x === 0)).toBe(true)
    }
    expect(overlap(lg)).toBe(false)
  })

  it('Chi tiêu (31 cột ngày) không bao giờ được xếp hẹp hơn nửa trang ở lg', () => {
    const d = MODULES.find((m) => m.type === 'spending')!
    expect(d.minW).toBeGreaterThanOrEqual(6)
  })
})

describe('thêm / xoá module', () => {
  it('module chỉ-một-bản không thêm được lần hai', () => {
    const gen = counter()
    const s = defaultBoard(gen)
    const p = s.pages[0]
    expect(canAdd(p, 'todo')).toBe(false)
    expect(addModule(s, p.id, 'todo', gen)).toEqual(s)
  })

  it('biểu đồ thêm được nhiều bản, mỗi bản có ô ở MỌI breakpoint đã lưu', () => {
    const gen = counter()
    let s = defaultBoard(gen)
    const id = s.pages[0].id
    s = addModule(s, id, 'cashflow', gen)
    s = addModule(s, id, 'cashflow', gen)
    const p = s.pages[0]
    const charts = p.modules.filter((m) => m.type === 'cashflow')
    expect(charts).toHaveLength(2)
    for (const bp of ['lg', 'md', 'sm'] as const) {
      for (const m of charts) expect(p.layouts[bp]!.some((c) => c.i === m.id)).toBe(true)
      expect(overlap(p.layouts[bp]!)).toBe(false)
    }
  })

  it('xoá module xoá luôn ô của nó ở mọi breakpoint', () => {
    const gen = counter()
    const s = defaultBoard(gen)
    const p = s.pages[0]
    const todo = p.modules.find((m) => m.type === 'todo')!
    const out = removeModule(s, p.id, todo.id).pages[0]
    expect(out.modules.some((m) => m.id === todo.id)).toBe(false)
    for (const bp of ['lg', 'md', 'sm'] as const) expect(out.layouts[bp]!.some((c) => c.i === todo.id)).toBe(false)
  })

  it('cách xem lạ trong bản lưu rơi về cách xem mặc định', () => {
    expect(viewOf({ id: 'x', type: 'cashflow', view: 'khong-co' })).toBe('bars')
    expect(viewOf({ id: 'x', type: 'cashflow', view: 'rate' })).toBe('rate')
    expect(viewOf({ id: 'x', type: 'todo' })).toBe('')
  })

  it('setView chỉ đổi đúng module đó', () => {
    const gen = counter()
    let s = defaultBoard(gen)
    const id = s.pages[0].id
    s = addModule(s, id, 'categories', gen)
    const m = s.pages[0].modules.find((x) => x.type === 'categories')!
    s = setView(s, id, m.id, 'list')
    expect(s.pages[0].modules.find((x) => x.id === m.id)!.view).toBe('list')
  })
})

describe('bố cục', () => {
  it('setLayout ghi đúng breakpoint, bỏ thuộc tính thừa của lưới', () => {
    const gen = counter()
    const s = defaultBoard(gen)
    const p = s.pages[0]
    const moved = p.layouts.lg!.map((c) => ({ ...c, y: c.y + 1, static: false, moved: true }))
    const out = setLayout(s, p.id, 'lg', moved).pages[0]
    expect(out.layouts.lg![0]).toEqual({ i: moved[0].i, x: moved[0].x, y: moved[0].y, w: moved[0].w, h: moved[0].h })
    expect(out.layouts.md).toEqual(p.layouts.md)
  })

  it('normalizePage kẹp ô tràn cột, bỏ ô mồ côi, xếp chỗ cho module thiếu ô', () => {
    const page = normalizePage({
      id: 'p',
      name: null,
      preset: null,
      modules: [
        { id: 'a', type: 'cashflow' },
        { id: 'b', type: 'networth' },
      ],
      layouts: {
        lg: [
          { i: 'a', x: 10, y: 0, w: 20, h: 5 },
          { i: 'ma', x: 0, y: 0, w: 2, h: 2 },
        ],
        sm: [{ i: 'a', x: 3, y: 0, w: 4, h: 5 }],
      },
    })
    expect(page.layouts.lg!.find((c) => c.i === 'a')).toMatchObject({ x: 0, w: 12 })
    expect(page.layouts.lg!.some((c) => c.i === 'ma')).toBe(false)
    expect(page.layouts.lg!.some((c) => c.i === 'b')).toBe(true)
    expect(page.layouts.sm!.find((c) => c.i === 'a')).toMatchObject({ x: 0, w: 1 })
    expect(page.layouts.md).toBeUndefined()
  })

  it('normalizePage bỏ bản thứ hai của module chỉ-một-bản', () => {
    const page = normalizePage({
      id: 'p',
      name: null,
      preset: null,
      modules: [
        { id: 'a', type: 'todo' },
        { id: 'b', type: 'todo' },
      ],
      layouts: { lg: [] },
    })
    expect(page.modules.map((m) => m.id)).toEqual(['a'])
  })
})

describe('trang', () => {
  it('thêm trang trống → trang mới được chọn và chưa có module nào', () => {
    const gen = counter()
    const s = addPage(defaultBoard(gen), { name: 'Của tôi', preset: null }, gen)
    expect(s.pages).toHaveLength(2)
    expect(s.activeId).toBe(s.pages[1].id)
    expect(s.pages[1]).toMatchObject({ name: 'Của tôi', modules: [] })
  })

  it('thêm trang dựng sẵn "Xu hướng" → toàn biểu đồ, xếp không chồng nhau', () => {
    const gen = counter()
    const s = addPage(defaultBoard(gen), { name: null, preset: 'trends' }, gen)
    const p = s.pages[1]
    expect(p.modules.length).toBeGreaterThan(3)
    expect(p.modules.every((m) => MODULES.find((d) => d.type === m.type)!.fit === 'fill')).toBe(true)
    expect(overlap(p.layouts.lg!)).toBe(false)
  })

  it('không xoá được trang cuối cùng; xoá trang đang xem thì chuyển sang trang kề', () => {
    const gen = counter()
    const one = defaultBoard(gen)
    expect(removePage(one, one.pages[0].id)).toBe(one)
    const two = addPage(one, { name: 'B', preset: null }, gen)
    const out = removePage(two, two.activeId)
    expect(out.pages).toHaveLength(1)
    expect(out.activeId).toBe(one.pages[0].id)
  })

  it('đổi tên rỗng = trả về tên mặc định', () => {
    const gen = counter()
    const s = defaultBoard(gen)
    expect(renamePage(s, s.activeId, '  Nhà  ').pages[0].name).toBe('Nhà')
    expect(renamePage(s, s.activeId, '   ').pages[0].name).toBeNull()
  })

  it('khôi phục mặc định dựng lại đủ module, giữ tên đã đổi', () => {
    const gen = counter()
    let s = defaultBoard(gen)
    const p = s.pages[0]
    s = renamePage(s, p.id, 'Nhà')
    s = removeModule(s, p.id, p.modules[0].id)
    const out = resetPage(s, p.id, gen).pages[0]
    expect(out.modules).toHaveLength(10)
    expect(out.name).toBe('Nhà')
  })
})

describe('bản lưu', () => {
  it('đọc lại đúng thứ đã ghi', () => {
    const gen = counter()
    let s: BoardState = defaultBoard(gen)
    s = addPage(s, { name: 'B', preset: 'spend' }, gen)
    expect(loadBoard(JSON.stringify(s), gen)).toEqual(s)
  })

  it('hỏng / trống / sai dạng → bảng mặc định, không ném', () => {
    for (const raw of [null, '', '{', '[]', '{"v":2}', JSON.stringify({ v: 1, activeId: 'x', pages: [] })]) {
      const s = loadBoard(raw, counter())
      expect(s.pages[0].preset).toBe('overview')
    }
  })

  it('module loại lạ bị bỏ, trang vẫn giữ; activeId lạ → trang đầu', () => {
    const gen = counter()
    const s = defaultBoard(gen)
    const raw = JSON.parse(JSON.stringify(s))
    raw.pages[0].modules.push({ id: 'z', type: 'tuong-lai-chua-co' })
    raw.activeId = 'khong-co'
    const out = loadBoard(JSON.stringify(raw), gen)
    expect(out.pages[0].modules.some((m) => m.id === 'z')).toBe(false)
    expect(out.activeId).toBe(out.pages[0].id)
  })
})
