import { describe, expect, it } from 'vitest'
import { makeUndo, UNDO_WINDOW_MS } from './undoStack'

describe('makeUndo', () => {
  it('chưa xoá gì thì không có gì để hoàn tác', () => {
    expect(makeUndo<number>().peek(0)).toBeNull()
  })

  it('giữ bản chụp và nhãn của lần xoá gần nhất', () => {
    const u = makeUndo<number[]>()
    u.push('Đã xoá mốc "Mua nhà"', [1, 2], 0)
    expect(u.peek(0)?.label).toBe('Đã xoá mốc "Mua nhà"')
    expect(u.peek(0)?.snapshot).toEqual([1, 2])
  })

  it('MỘT bậc: xoá cái thứ hai thì cái thứ nhất mất luôn', () => {
    const u = makeUndo<string>()
    u.push('một', 'A', 0)
    u.push('hai', 'B', 100)
    expect(u.peek(100)?.snapshot).toBe('B')
  })

  it('hết 9 giây thì coi như không còn gì', () => {
    const u = makeUndo<string>()
    u.push('một', 'A', 0)
    expect(u.peek(UNDO_WINDOW_MS - 1)).not.toBeNull()
    expect(u.peek(UNDO_WINDOW_MS)).toBeNull()
  })

  it('take() lấy ra rồi dọn — bấm Hoàn tác hai lần không hoàn tác hai lần', () => {
    const u = makeUndo<string>()
    u.push('một', 'A', 0)
    expect(u.take(0)?.snapshot).toBe('A')
    expect(u.take(0)).toBeNull()
    expect(u.peek(0)).toBeNull()
  })

  it('clear() bỏ luôn bản chụp — dùng khi đổi kịch bản', () => {
    const u = makeUndo<string>()
    u.push('một', 'A', 0)
    u.clear()
    expect(u.peek(0)).toBeNull()
  })
})
