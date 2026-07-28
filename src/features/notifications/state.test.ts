import { describe, expect, it } from 'vitest'
import { splitStaleActionKeys } from './state'

describe('splitStaleActionKeys', () => {
  it('trả về mã việc-cần-làm đã lưu mà lượt này không còn sinh ra', () => {
    const stale = splitStaleActionKeys(
      ['account-negative:a1', 'budget-over:c1'],
      ['budget-over:c1'],
    )
    expect(stale).toEqual(['account-negative:a1'])
  })

  it('KHÔNG đụng tới mã tin-để-biết (đã tắt phải tắt vĩnh viễn)', () => {
    const stale = splitStaleActionKeys(
      ['recurring-suggestion:abc', 'stale-entry:2026-W20'],
      [],
    )
    expect(stale).toEqual([])
  })

  it('mã việc-cần-làm còn trong danh sách thì giữ nguyên', () => {
    expect(splitStaleActionKeys(['budget-over:c1'], ['budget-over:c1'])).toEqual([])
  })

  it('mã gộp debt-overdue:group cũng là việc-cần-làm', () => {
    expect(splitStaleActionKeys(['debt-overdue:group'], [])).toEqual(['debt-overdue:group'])
  })

  it('mã lạ (loại đã bị gỡ khỏi app) thì bỏ qua, không xóa nhầm', () => {
    expect(splitStaleActionKeys(['loai-khong-ton-tai:x'], [])).toEqual([])
  })

  it('danh sách rỗng ra rỗng', () => {
    expect(splitStaleActionKeys([], [])).toEqual([])
  })
})
