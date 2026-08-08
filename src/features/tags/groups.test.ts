import { describe, expect, it } from 'vitest'
import type { TagGroupRow, TagRow } from '../../types/database.types'
import { ungroupedQueue } from './groups'

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
