import { describe, expect, it } from 'vitest'
import { arrangeNotifications, ACTION_LIMIT, INFO_LIMIT } from './rules'
import { splitStaleActionKeys } from './state'
import type { AppNotification, NotificationSeverity, NotificationType } from './types'

function n(
  type: NotificationType,
  severity: NotificationSeverity,
  kind: 'action' | 'info',
  key = `${type}:x`,
): AppNotification {
  return { key, kind, type, severity, title: type, to: '/' }
}

describe('arrangeNotifications', () => {
  it('xếp mức cao trước mức thấp', () => {
    const out = arrangeNotifications(
      [n('budget-pace', 'medium', 'action'), n('account-negative', 'high', 'action')],
      [],
    )
    expect(out.actions.map((a) => a.type)).toEqual(['account-negative', 'budget-pace'])
  })

  it('cùng mức thì xếp theo thứ tự trong NOTIFICATION_TYPES', () => {
    const out = arrangeNotifications(
      [n('budget-over', 'high', 'action'), n('account-shortfall', 'high', 'action')],
      [],
    )
    expect(out.actions.map((a) => a.type)).toEqual(['account-shortfall', 'budget-over'])
  })

  it('tách việc cần làm và tin để biết ra hai danh sách', () => {
    const out = arrangeNotifications(
      [n('stale-entry', 'low', 'info'), n('budget-over', 'high', 'action')],
      [],
    )
    expect(out.actions).toHaveLength(1)
    expect(out.infos).toHaveLength(1)
  })

  it('bỏ loại đã tắt khỏi danh sách hiện, nhưng allKeys VẪN giữ mã của nó', () => {
    const out = arrangeNotifications(
      [n('stale-entry', 'low', 'info'), n('budget-over', 'high', 'action')],
      ['stale-entry'],
    )
    expect(out.infos).toHaveLength(0)
    // allKeys tính TRƯỚC khi lọc loại đã tắt: nó là đầu vào của việc dọn trạng thái,
    // mà "tắt một loại" không có nghĩa là "việc đó đã xử lý xong".
    expect(out.allKeys).toEqual(['budget-over:x', 'stale-entry:x'])
  })

  it('cắt trần 5 việc cần làm và 3 tin để biết, đếm phần bị cắt RIÊNG từng nhóm', () => {
    const actions = Array.from({ length: 7 }, (_, i) =>
      n('budget-over', 'high', 'action', `budget-over:${i}`),
    )
    const infos = Array.from({ length: 5 }, (_, i) =>
      n('stale-entry', 'low', 'info', `stale-entry:${i}`),
    )
    const out = arrangeNotifications([...actions, ...infos], [])
    expect(out.actions).toHaveLength(ACTION_LIMIT)
    expect(out.infos).toHaveLength(INFO_LIMIT)
    // Hai con số PHẢI tách nhau: gộp thành một số rồi in dưới nhóm "Tin để biết" là
    // báo một việc-cần-làm bị ẩn như thể chỉ là mẹo nhỏ (lỗi I4).
    expect(out.hiddenActionCount).toBe(2)
    expect(out.hiddenInfoCount).toBe(2)
  })

  it('chỉ việc cần làm quá trần thì hiddenInfoCount = 0 (không lẫn sang nhóm kia)', () => {
    const actions = Array.from({ length: 7 }, (_, i) =>
      n('budget-over', 'high', 'action', `budget-over:${i}`),
    )
    const out = arrangeNotifications([...actions, n('stale-entry', 'low', 'info')], [])
    expect(out.hiddenActionCount).toBe(2)
    expect(out.hiddenInfoCount).toBe(0)
  })

  it('trả luôn hai danh sách ĐẦY ĐỦ để tấm trượt xổ được phần bị cắt', () => {
    const actions = Array.from({ length: 7 }, (_, i) =>
      n('budget-over', 'high', 'action', `budget-over:${i}`),
    )
    const infos = Array.from({ length: 5 }, (_, i) =>
      n('stale-entry', 'low', 'info', `stale-entry:${i}`),
    )
    const out = arrangeNotifications([...actions, ...infos], [])
    expect(out.actionsAll).toHaveLength(7)
    expect(out.infosAll).toHaveLength(5)
    // Phần thu gọn phải là ĐOẠN ĐẦU của bản đầy đủ — tấm trượt lấy phần chênh làm
    // danh sách xổ ra, lệch thứ tự là xổ ra tin đang hiện hoặc bỏ sót tin bị ẩn.
    expect(out.actionsAll.slice(0, ACTION_LIMIT)).toEqual(out.actions)
    expect(out.infosAll.slice(0, INFO_LIMIT)).toEqual(out.infos)
  })

  it('allKeys gồm cả tin bị cắt trần', () => {
    const actions = Array.from({ length: 7 }, (_, i) =>
      n('budget-over', 'high', 'action', `budget-over:${i}`),
    )
    const out = arrangeNotifications(actions, [])
    expect(out.allKeys).toHaveLength(7)
  })

  it('lọc loại đã tắt TRƯỚC rồi mới cắt trần', () => {
    const items = [
      ...Array.from({ length: 4 }, (_, i) =>
        n('budget-over', 'high', 'action', `budget-over:${i}`),
      ),
      ...Array.from({ length: 4 }, (_, i) =>
        n('account-shortfall', 'high', 'action', `account-shortfall:${i}`),
      ),
    ]
    const out = arrangeNotifications(items, ['budget-over'])
    expect(out.actions).toHaveLength(4)
    expect(out.hiddenActionCount).toBe(0)
    expect(out.actions.map((a) => a.key)).toEqual([
      'account-shortfall:0',
      'account-shortfall:1',
      'account-shortfall:2',
      'account-shortfall:3',
    ])
    // allKeys gồm cả 4 mã của loại đã tắt.
    expect(out.allKeys).toHaveLength(8)
  })

  it('danh sách rỗng ra kết quả rỗng, không nổ', () => {
    const out = arrangeNotifications([], [])
    expect(out).toEqual({
      actions: [],
      infos: [],
      actionsAll: [],
      infosAll: [],
      hiddenActionCount: 0,
      hiddenInfoCount: 0,
      allKeys: [],
    })
  })
})

// Hai module nằm cách nhau nên không phép thử nào ghép chúng lại — mà chỗ SAI lại
// nằm đúng ở mối ghép: arrangeNotifications sinh allKeys, splitStaleActionKeys đọc
// allKeys rồi quyết định XÓA dòng trạng thái nào.
describe('ghép arrangeNotifications với splitStaleActionKeys (vòng đời mục E)', () => {
  it('tắt một loại trong cài đặt thì mã của loại đó KHÔNG bị coi là đã xong', () => {
    const list = [n('budget-over', 'high', 'action', 'budget-over:c1')]
    // Người dùng đã đọc dòng này (nên có dòng trạng thái trong DB).
    const storedKeys = ['budget-over:c1']

    // Rồi vào cài đặt tắt "Vượt ngân sách tháng".
    const out = arrangeNotifications(list, ['budget-over'])
    expect(out.actions).toHaveLength(0) // không hiện nữa — đúng ý người dùng

    // Nhưng dọn dẹp KHÔNG được xóa trạng thái đã đọc: bật lại mà mất trạng thái là
    // dòng cũ đỏ lại như mới dù đã đọc từ lâu.
    expect(splitStaleActionKeys(storedKeys, out.allKeys)).toEqual([])
  })

  it('tình huống xử lý xong thật (bộ luật không sinh mã nữa) thì mới xóa', () => {
    const out = arrangeNotifications([], [])
    expect(splitStaleActionKeys(['budget-over:c1'], out.allKeys)).toEqual(['budget-over:c1'])
  })
})
