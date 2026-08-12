import { describe, expect, it } from 'vitest'
import type { TagGroupRow, TagRow, TransactionTagRow } from '../../types/database.types'
import { collapsedLimit, createTargets, pickerSections, ungroupedQueue } from './groups'

const tag = (id: string, name: string, p: Partial<TagRow> = {}): TagRow => ({
  id,
  user_id: 'u',
  name,
  color: 'sky',
  sort_order: 0,
  group_id: null,
  is_archived: false,
  budget_amount: null,
  budget_period: 'total',
  created_at: '',
  ...p,
})

const group = (id: string, name: string, sort_order: number): TagGroupRow => ({
  id,
  user_id: 'u',
  name,
  sort_order,
  created_at: '',
})

const WHO = group('g-who', 'Với ai?', 0)
const WHERE = group('g-where', 'Ở đâu?', 1)

const link = (transaction_id: string, tag_id: string): TransactionTagRow => ({
  transaction_id,
  tag_id,
  user_id: 'u',
})

describe('ungroupedQueue', () => {
  it('chỉ lấy nhãn ngoài nhóm, giữ nguyên thứ tự đầu vào', () => {
    const tags = [
      tag('t1', 'Về VN 2026'),
      tag('t2', 'Người yêu', { group_id: WHO.id }),
      tag('t3', 'Đám cưới'),
    ]
    expect(ungroupedQueue(tags, [WHO], []).map((t) => t.name)).toEqual([
      'Về VN 2026',
      'Đám cưới',
    ])
  })

  it('nhãn trỏ tới nhóm đã bị xoá vẫn được coi là ngoài nhóm', () => {
    const tags = [tag('t9', 'Mồ côi', { group_id: 'g-da-xoa' })]
    expect(ungroupedQueue(tags, [WHO], []).map((t) => t.name)).toEqual(['Mồ côi'])
  })

  it('bỏ nhãn đã lưu trữ — xếp nhóm cho nhãn không còn dùng là việc vô ích', () => {
    const tags = [tag('t1', 'Cũ', { is_archived: true }), tag('t2', 'Mới')]
    expect(ungroupedQueue(tags, [WHO], []).map((t) => t.name)).toEqual(['Mới'])
  })

  it('bỏ nhãn đã bấm "Để ở Khác" trong phiên này', () => {
    const tags = [tag('t1', 'Về VN 2026'), tag('t2', 'Đám cưới')]
    expect(ungroupedQueue(tags, [WHO], ['t1']).map((t) => t.name)).toEqual(['Đám cưới'])
  })

  it('xếp hết thì hàng đợi rỗng', () => {
    const tags = [tag('t2', 'Người yêu', { group_id: WHO.id })]
    expect(ungroupedQueue(tags, [WHO], [])).toEqual([])
  })
})

describe('pickerSections', () => {
  it('mỗi nhóm một section, theo thứ tự groups, mục Khác nằm CUỐI', () => {
    const tags = [
      tag('t1', 'Về VN 2026'),
      tag('t2', 'Người yêu', { group_id: WHO.id }),
      tag('t3', 'Tokyo', { group_id: WHERE.id }),
    ]
    const out = pickerSections(tags, [WHO, WHERE], [], [], 8)
    expect(out.map((s) => s.group?.name ?? null)).toEqual(['Với ai?', 'Ở đâu?', null])
    expect(out[0].shown.map((t) => t.name)).toEqual(['Người yêu'])
    expect(out[2].shown.map((t) => t.name)).toEqual(['Về VN 2026'])
  })

  it('nhóm RỖNG vẫn có section — không thì nhóm mới tạo vô hình', () => {
    const out = pickerSections([], [WHO, WHERE], [], [], 8)
    expect(out.map((s) => s.group?.name)).toEqual(['Với ai?', 'Ở đâu?'])
    expect(out.every((s) => s.shown.length === 0 && s.rest.length === 0)).toBe(true)
  })

  it('mục Khác rỗng thì KHÔNG có section', () => {
    const tags = [tag('t2', 'Người yêu', { group_id: WHO.id })]
    const out = pickerSections(tags, [WHO], [], [], 8)
    expect(out).toHaveLength(1)
    expect(out[0].group?.name).toBe('Với ai?')
  })

  it('nhãn trỏ tới nhóm đã bị xoá rơi về mục Khác', () => {
    const tags = [tag('t9', 'Mồ côi', { group_id: 'g-da-xoa' })]
    const out = pickerSections(tags, [WHO], [], [], 8)
    expect(out.at(-1)!.group).toBeNull()
    expect(out.at(-1)!.shown.map((t) => t.name)).toEqual(['Mồ côi'])
  })

  it('limit đếm RIÊNG từng nhóm, xếp theo mức dùng giảm dần', () => {
    const tags = [
      tag('a', 'A', { group_id: WHO.id }),
      tag('b', 'B', { group_id: WHO.id }),
      tag('c', 'C', { group_id: WHO.id }),
      tag('x', 'X', { group_id: WHERE.id }),
      tag('y', 'Y', { group_id: WHERE.id }),
    ]
    // B dùng 2 lần, C dùng 1, A chưa dùng → B, C lên trước.
    const links = [link('t1', 'b'), link('t2', 'b'), link('t3', 'c')]
    const out = pickerSections(tags, [WHO, WHERE], links, [], 2)
    expect(out[0].shown.map((t) => t.name)).toEqual(['B', 'C'])
    expect(out[0].rest.map((t) => t.name)).toEqual(['A'])
    expect(out[1].shown.map((t) => t.name)).toEqual(['X', 'Y'])
    expect(out[1].rest).toEqual([])
  })

  it('nhãn đang chọn nằm ngoài top vẫn hiện, và ở CUỐI section (chip không nhảy chỗ)', () => {
    const tags = [
      tag('a', 'A', { group_id: WHO.id }),
      tag('b', 'B', { group_id: WHO.id }),
      tag('c', 'C', { group_id: WHO.id }),
    ]
    const out = pickerSections(tags, [WHO], [], ['c'], 2)
    expect(out[0].shown.map((t) => t.name)).toEqual(['A', 'B', 'C'])
    expect(out[0].rest).toEqual([])
  })

  it('nhãn đã lưu trữ biến mất, TRỪ KHI đang được chọn', () => {
    const tags = [
      tag('a', 'A', { group_id: WHO.id }),
      tag('z', 'Z', { group_id: WHO.id, is_archived: true }),
    ]
    expect(pickerSections(tags, [WHO], [], [], 8)[0].shown.map((t) => t.name)).toEqual(['A'])
    expect(pickerSections(tags, [WHO], [], ['z'], 8)[0].shown.map((t) => t.name)).toEqual([
      'A',
      'Z',
    ])
  })
})

describe('collapsedLimit', () => {
  it('2 nhóm trở xuống thì hiện sẵn 4 nhãn mỗi nhóm', () => {
    expect(collapsedLimit(0)).toBe(4)
    expect(collapsedLimit(1)).toBe(4)
    expect(collapsedLimit(2)).toBe(4)
  })

  it('3 nhóm trở lên thì hạ về 3 — mỗi nhóm thêm một hàng chip', () => {
    expect(collapsedLimit(3)).toBe(3)
    expect(collapsedLimit(9)).toBe(3)
  })
})

describe('createTargets', () => {
  const secs = (tags: TagRow[], groups: TagGroupRow[]) => pickerSections(tags, groups, [], [], 4)

  it('chưa gõ gì thì không mời tạo', () => {
    const tags = [tag('t1', 'Tokyo', { group_id: WHERE.id })]
    expect(createTargets(tags, secs(tags, [WHO, WHERE]), '')).toEqual([])
  })

  it('gõ toàn dấu cách cũng không mời tạo', () => {
    const tags = [tag('t1', 'Tokyo', { group_id: WHERE.id })]
    expect(createTargets(tags, secs(tags, [WHO, WHERE]), '   ')).toEqual([])
  })

  it('trùng tên hẳn thì không mời tạo — việc đúng là chọn nhãn có sẵn', () => {
    const tags = [tag('t1', 'Tokyo', { group_id: WHERE.id })]
    expect(createTargets(tags, secs(tags, [WHO, WHERE]), 'tokyo')).toEqual([])
  })

  it('trùng tên hẳn với nhãn ĐÃ LƯU TRỮ cũng không mời tạo (gõ trùng là làm nó sống lại)', () => {
    const tags = [tag('t1', 'Tokyo', { group_id: WHERE.id, is_archived: true })]
    expect(createTargets(tags, secs(tags, [WHO, WHERE]), 'Tokyo')).toEqual([])
  })

  it('bỏ dấu cách đầu cuối trước khi so tên', () => {
    const tags = [tag('t1', 'Tokyo', { group_id: WHERE.id })]
    expect(createTargets(tags, secs(tags, [WHO, WHERE]), '  Tokyo  ')).toEqual([])
  })

  it('trùng một phần thì mời tạo ở MỌI nhóm thật', () => {
    const tags = [tag('t1', 'Tokyo', { group_id: WHERE.id })]
    const out = createTargets(tags, secs(tags, [WHO, WHERE]), 'Tok')
    expect(out.map((x) => x.group?.name)).toEqual(['Với ai?', 'Ở đâu?'])
  })

  it('có mục Khác thì thêm một chỗ tạo không nhóm', () => {
    const tags = [tag('t1', 'Về VN 2026')]
    const out = createTargets(tags, secs(tags, [WHO, WHERE]), 'Cả nhà')
    expect(out.map((x) => x.group?.name ?? null)).toEqual(['Với ai?', 'Ở đâu?', null])
  })

  it('không có mục Khác thì không mời tạo vào Khác', () => {
    const tags = [tag('t1', 'Tokyo', { group_id: WHERE.id })]
    const out = createTargets(tags, secs(tags, [WHO, WHERE]), 'Cả nhà')
    expect(out.every((x) => x.group !== null)).toBe(true)
  })

  it('chưa có nhóm nào thì vẫn phải có một chỗ tạo, không thì thành ngõ cụt', () => {
    expect(createTargets([], [], 'Cả nhà')).toEqual([{ group: null }])
  })
})
