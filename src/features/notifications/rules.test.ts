import { describe, expect, it } from 'vitest'
import { arrangeNotifications, ACTION_LIMIT, INFO_LIMIT } from './rules'
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

  it('bỏ loại đã tắt', () => {
    const out = arrangeNotifications(
      [n('stale-entry', 'low', 'info'), n('budget-over', 'high', 'action')],
      ['stale-entry'],
    )
    expect(out.infos).toHaveLength(0)
    expect(out.allKeys).toEqual(['budget-over:x'])
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
    expect(out.allKeys).toEqual([
      'account-shortfall:0',
      'account-shortfall:1',
      'account-shortfall:2',
      'account-shortfall:3',
    ])
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
