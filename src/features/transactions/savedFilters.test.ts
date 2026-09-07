import { describe, expect, it } from 'vitest'
import {
  isEmptyFilter,
  MAX_SAVED,
  parseSavedFilters,
  removeSavedFilter,
  upsertSavedFilter,
  type SavedFilter,
  type SavedFilterState,
} from './savedFilters'

const state = (over: Partial<SavedFilterState> = {}): SavedFilterState => ({
  text: '',
  type: 'all',
  from: '2026-06-01',
  to: '2026-09-07',
  categoryIds: [],
  accountIds: [],
  tagIds: [],
  uncategorized: false,
  amountMin: '',
  amountMax: '',
  ...over,
})

const f = (id: string, name: string): SavedFilter => ({ id, name, state: state() })

describe('parseSavedFilters — không tin localStorage', () => {
  it('null hoặc chuỗi hỏng trả mảng rỗng, không nổ', () => {
    expect(parseSavedFilters(null)).toEqual([])
    expect(parseSavedFilters('{{{')).toEqual([])
    expect(parseSavedFilters('"chuỗi"')).toEqual([])
  })

  it('đọc được bản ghi hợp lệ', () => {
    const raw = JSON.stringify([f('a', 'Tiền mặt lớn')])
    expect(parseSavedFilters(raw)).toHaveLength(1)
  })

  it('BỎ bản ghi thiếu trường — một bộ lọc đọc sai còn tệ hơn không có bộ lọc nào', () => {
    const meo = { id: 'x', name: 'Méo', state: { text: 'a' } }
    const raw = JSON.stringify([f('a', 'Tốt'), meo])
    expect(parseSavedFilters(raw).map((x) => x.id)).toEqual(['a'])
  })

  it('BỎ bản ghi có mảng sai kiểu (null thay vì mảng)', () => {
    const meo = { id: 'x', name: 'Méo', state: { ...state(), categoryIds: null } }
    expect(parseSavedFilters(JSON.stringify([meo]))).toEqual([])
  })

  it('cắt về trần khi file có quá nhiều', () => {
    const nhieu = Array.from({ length: MAX_SAVED + 5 }, (_, i) => f(`i${i}`, `Bộ ${i}`))
    expect(parseSavedFilters(JSON.stringify(nhieu))).toHaveLength(MAX_SAVED)
  })
})

describe('upsertSavedFilter', () => {
  it('thêm mới thì lên ĐẦU danh sách', () => {
    const out = upsertSavedFilter([f('a', 'Cũ')], 'Mới', state(), 'b')
    expect(out.map((x) => x.name)).toEqual(['Mới', 'Cũ'])
  })

  it('trùng tên thì GHI ĐÈ, không nhân đôi', () => {
    const out = upsertSavedFilter([f('a', 'Tiền mặt')], 'Tiền mặt', state({ text: 'x' }), 'b')
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe('a')
    expect(out[0].state.text).toBe('x')
  })

  it('so tên KHÔNG phân biệt hoa thường và khoảng trắng thừa', () => {
    const out = upsertSavedFilter([f('a', 'Tiền mặt')], '  tiền MẶT ', state(), 'b')
    expect(out).toHaveLength(1)
    expect(out[0].name).toBe('tiền MẶT')
  })

  it('tên rỗng thì không lưu gì', () => {
    expect(upsertSavedFilter([], '   ', state(), 'b')).toEqual([])
  })

  it('cắt ở ĐUÔI nên cái vừa lưu không bao giờ rơi mất', () => {
    const day = Array.from({ length: MAX_SAVED }, (_, i) => f(`i${i}`, `Bộ ${i}`))
    const out = upsertSavedFilter(day, 'Vừa lưu', state(), 'moi')
    expect(out).toHaveLength(MAX_SAVED)
    expect(out[0].name).toBe('Vừa lưu')
  })

  it('không sửa mảng gốc', () => {
    const goc = [f('a', 'Cũ')]
    upsertSavedFilter(goc, 'Mới', state(), 'b')
    expect(goc).toHaveLength(1)
  })
})

describe('removeSavedFilter', () => {
  it('bỏ đúng một bản ghi', () => {
    expect(removeSavedFilter([f('a', 'A'), f('b', 'B')], 'a').map((x) => x.id)).toEqual(['b'])
  })

  it('id không có thì giữ nguyên', () => {
    expect(removeSavedFilter([f('a', 'A')], 'z')).toHaveLength(1)
  })
})

describe('isEmptyFilter — không mời lưu khi chưa lọc gì', () => {
  it('trạng thái mặc định là rỗng', () => {
    expect(isEmptyFilter(state())).toBe(true)
  })

  it('khoảng NGÀY một mình không tính là đã lọc — nó luôn có giá trị', () => {
    expect(isEmptyFilter(state({ from: '2020-01-01', to: '2020-12-31' }))).toBe(true)
  })

  it.each([
    ['chữ', state({ text: 'lawson' })],
    ['loại', state({ type: 'expense' })],
    ['danh mục', state({ categoryIds: ['c1'] })],
    ['tài khoản', state({ accountIds: ['a1'] })],
    ['nhãn', state({ tagIds: ['t1'] })],
    ['chưa phân loại', state({ uncategorized: true })],
    ['số tiền', state({ amountMin: '5000' })],
  ])('có %s thì KHÔNG rỗng', (_ten, s) => {
    expect(isEmptyFilter(s)).toBe(false)
  })
})
