import { describe, expect, it } from 'vitest'
import { consoleKeyAction, isEditableTarget } from './consoleKeys'

describe('isEditableTarget', () => {
  it('ô nhập, ô nhiều dòng và ô chọn đều là chỗ gõ', () => {
    expect(isEditableTarget({ tagName: 'INPUT' })).toBe(true)
    expect(isEditableTarget({ tagName: 'TEXTAREA' })).toBe(true)
    // ←/→ trong một <select> là đổi lựa chọn, không phải dời một mốc.
    expect(isEditableTarget({ tagName: 'SELECT' })).toBe(true)
  })

  it('tên thẻ chữ thường (SVG/DOM lạ) vẫn nhận ra', () => {
    expect(isEditableTarget({ tagName: 'input' })).toBe(true)
  })

  it('nút và div thường KHÔNG phải chỗ gõ', () => {
    expect(isEditableTarget({ tagName: 'BUTTON' })).toBe(false)
    expect(isEditableTarget({ tagName: 'DIV' })).toBe(false)
  })

  it('vùng contenteditable là chỗ gõ', () => {
    expect(isEditableTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true)
  })

  it('tiêu điểm ở phần tử con BÊN TRONG một vùng contenteditable cũng tính', () => {
    // `isContentEditable` chỉ đúng trên chính phần tử; một <span> trong vùng gõ thì
    // không, nên phải hỏi `closest`.
    const span = {
      tagName: 'SPAN',
      isContentEditable: false,
      closest: (sel: string) => (sel.includes('contenteditable') ? { tagName: 'DIV' } : null),
    }
    expect(isEditableTarget(span)).toBe(true)
  })

  it('không có target (window/document) thì không phải chỗ gõ', () => {
    expect(isEditableTarget(null)).toBe(false)
    expect(isEditableTarget(undefined)).toBe(false)
  })
})

describe('consoleKeyAction — bảng phím của README', () => {
  it('Esc đóng', () => {
    expect(consoleKeyAction({ key: 'Escape' })).toEqual({ type: 'close' })
  })

  it('Delete và Backspace đều xoá thứ đang chọn', () => {
    expect(consoleKeyAction({ key: 'Delete' })).toEqual({ type: 'delete' })
    expect(consoleKeyAction({ key: 'Backspace' })).toEqual({ type: 'delete' })
  })

  it('←/→ dời một năm', () => {
    expect(consoleKeyAction({ key: 'ArrowLeft' })).toEqual({ type: 'nudge', step: -1 })
    expect(consoleKeyAction({ key: 'ArrowRight' })).toEqual({ type: 'nudge', step: 1 })
  })

  it('⌘Z và Ctrl+Z hoàn tác', () => {
    expect(consoleKeyAction({ key: 'z', metaKey: true })).toEqual({ type: 'undo' })
    expect(consoleKeyAction({ key: 'z', ctrlKey: true })).toEqual({ type: 'undo' })
    // Bàn phím có CapsLock/Shift đang bật cho `key === 'Z'`.
    expect(consoleKeyAction({ key: 'Z', ctrlKey: true })).toEqual({ type: 'undo' })
  })

  it('⇧⌘Z (làm lại) KHÔNG bị nuốt — app chưa có làm lại', () => {
    expect(consoleKeyAction({ key: 'z', metaKey: true, shiftKey: true })).toEqual({ type: 'none' })
  })

  it('phím tắt của trình duyệt không bị nuốt: ⌘← là lùi lịch sử', () => {
    expect(consoleKeyAction({ key: 'ArrowLeft', metaKey: true })).toEqual({ type: 'none' })
    expect(consoleKeyAction({ key: 'Backspace', altKey: true })).toEqual({ type: 'none' })
  })

  it('phím không thuộc bảng thì không làm gì', () => {
    expect(consoleKeyAction({ key: 'a' })).toEqual({ type: 'none' })
    expect(consoleKeyAction({ key: 'Enter' })).toEqual({ type: 'none' })
  })
})

// Đây là luật đắt nhất của cả lớp bàn phím, và nó KHÔNG có cách nào tự lộ ra: gõ "2034"
// vào ô năm trong dock rồi bấm Backspace để sửa một chữ số sẽ xoá luôn cái mốc đang sửa.
// Sáu phép thử dưới đây là chỗ duy nhất giữ nó, vì repo không có công cụ test DOM để mô
// phỏng một cú bấm phím thật trong một ô nhập.
describe('consoleKeyAction — miễn trừ khi tiêu điểm ở trong ô nhập', () => {
  it('Backspace trong ô nhập KHÔNG xoá mốc đang sửa', () => {
    expect(consoleKeyAction({ key: 'Backspace', editable: true })).toEqual({ type: 'none' })
  })

  it('Delete trong ô nhập cũng không', () => {
    expect(consoleKeyAction({ key: 'Delete', editable: true })).toEqual({ type: 'none' })
  })

  it('←/→ trong ô nhập là dời con trỏ chữ, không dời mốc', () => {
    expect(consoleKeyAction({ key: 'ArrowLeft', editable: true })).toEqual({ type: 'none' })
    expect(consoleKeyAction({ key: 'ArrowRight', editable: true })).toEqual({ type: 'none' })
  })

  it('Esc trong ô nhập cũng không đóng panel — panel là chỗ chứa chính ô đó', () => {
    expect(consoleKeyAction({ key: 'Escape', editable: true })).toEqual({ type: 'none' })
  })

  it('NGOẠI LỆ DUY NHẤT: ⌘Z vẫn hoàn tác dù đang gõ', () => {
    // Sau một lần sửa, tiêu điểm hầu như luôn còn nằm trong ô vừa gõ — chặn ở đây là
    // hoàn tác gần như không bao giờ dùng được.
    expect(consoleKeyAction({ key: 'z', metaKey: true, editable: true })).toEqual({ type: 'undo' })
    expect(consoleKeyAction({ key: 'z', ctrlKey: true, editable: true })).toEqual({ type: 'undo' })
  })
})
