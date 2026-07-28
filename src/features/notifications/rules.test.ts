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
    expect(out.actionsAll.map((a) => a.type)).toEqual(['account-negative', 'budget-pace'])
  })

  it('cùng mức thì xếp theo thứ tự trong NOTIFICATION_TYPES', () => {
    const out = arrangeNotifications(
      [n('budget-over', 'high', 'action'), n('account-shortfall', 'high', 'action')],
      [],
    )
    expect(out.actionsAll.map((a) => a.type)).toEqual(['account-shortfall', 'budget-over'])
  })

  it('tách việc cần làm và tin để biết ra hai danh sách', () => {
    const out = arrangeNotifications(
      [n('stale-entry', 'low', 'info'), n('budget-over', 'high', 'action')],
      [],
    )
    expect(out.actionsAll).toHaveLength(1)
    expect(out.infosAll).toHaveLength(1)
  })

  it('bỏ loại đã tắt khỏi danh sách hiện, nhưng allKeys VẪN giữ mã của nó', () => {
    const out = arrangeNotifications(
      [n('stale-entry', 'low', 'info'), n('budget-over', 'high', 'action')],
      ['stale-entry'],
    )
    expect(out.infosAll).toHaveLength(0)
    // allKeys tính TRƯỚC khi lọc loại đã tắt: nó là đầu vào của việc dọn trạng thái,
    // mà "tắt một loại" không có nghĩa là "việc đó đã xử lý xong".
    expect(out.allKeys).toEqual(['budget-over:x', 'stale-entry:x'])
  })

  // Lỗi I4-R: bộ luật cắt sẵn 3 tin RỒI hook mới lọc tin đã đọc/đã tắt trong đúng
  // 3 tin đó → đọc hết 3 tin đầu là phần thu gọn rỗng dù còn tin chưa xem. Trần phải
  // do useNotifications áp SAU khi lọc, nên ở đây arrangeNotifications KHÔNG cắt.
  it('KHÔNG cắt trần — trả đủ cả 7 việc và 5 tin (trần áp sau khi lọc đã đọc)', () => {
    const actions = Array.from({ length: 7 }, (_, i) =>
      n('budget-over', 'high', 'action', `budget-over:${i}`),
    )
    const infos = Array.from({ length: 5 }, (_, i) =>
      n('stale-entry', 'low', 'info', `stale-entry:${i}`),
    )
    const out = arrangeNotifications([...actions, ...infos], [])
    expect(out.actionsAll).toHaveLength(7)
    expect(out.infosAll).toHaveLength(5)
    expect(out.actionsAll.length).toBeGreaterThan(ACTION_LIMIT)
    expect(out.infosAll.length).toBeGreaterThan(INFO_LIMIT)
    // Thứ tự là thứ tự cuối cùng: bên hook chỉ .slice() đoạn đầu, không xếp lại.
    expect(out.actionsAll.map((a) => a.key)).toEqual(actions.map((a) => a.key))
    expect(out.infosAll.map((a) => a.key)).toEqual(infos.map((a) => a.key))
  })

  it('allKeys gồm cả tin bị cắt trần', () => {
    const actions = Array.from({ length: 7 }, (_, i) =>
      n('budget-over', 'high', 'action', `budget-over:${i}`),
    )
    const out = arrangeNotifications(actions, [])
    expect(out.allKeys).toHaveLength(7)
  })

  it('loại đã tắt bị bỏ khỏi danh sách hiện nhưng vẫn còn trong allKeys', () => {
    const items = [
      ...Array.from({ length: 4 }, (_, i) =>
        n('budget-over', 'high', 'action', `budget-over:${i}`),
      ),
      ...Array.from({ length: 4 }, (_, i) =>
        n('account-shortfall', 'high', 'action', `account-shortfall:${i}`),
      ),
    ]
    const out = arrangeNotifications(items, ['budget-over'])
    expect(out.actionsAll.map((a) => a.key)).toEqual([
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
      actionsAll: [],
      infosAll: [],
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
    expect(out.actionsAll).toHaveLength(0) // không hiện nữa — đúng ý người dùng

    // Nhưng dọn dẹp KHÔNG được xóa trạng thái đã đọc: bật lại mà mất trạng thái là
    // dòng cũ đỏ lại như mới dù đã đọc từ lâu.
    expect(splitStaleActionKeys(storedKeys, out.allKeys)).toEqual([])
  })

  it('tình huống xử lý xong thật (bộ luật không sinh mã nữa) thì mới xóa', () => {
    const out = arrangeNotifications([], [])
    expect(splitStaleActionKeys(['budget-over:c1'], out.allKeys)).toEqual(['budget-over:c1'])
  })
})
