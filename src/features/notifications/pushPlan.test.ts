import { describe, expect, it } from 'vitest'
import { PUSH_BODY_ITEMS, planPush } from './pushPlan'
import type { AppNotification, NotificationSeverity, NotificationType } from './types'
import type { NotificationStateRow } from '../../types/database.types'

function action(
  key: string,
  title: string,
  over: Partial<AppNotification> = {},
): AppNotification {
  return {
    key,
    kind: 'action',
    type: (over.type ?? 'budget-over') as NotificationType,
    severity: (over.severity ?? 'high') as NotificationSeverity,
    title,
    to: over.to ?? '/budget',
    ...over,
  }
}

function state(key: string, over: Partial<NotificationStateRow> = {}): NotificationStateRow {
  return {
    user_id: 'u',
    key,
    read_at: null,
    dismissed_at: null,
    pushed_at: null,
    created_at: '2026-08-01T00:00:00.000Z',
    ...over,
  }
}

describe('planPush', () => {
  it('không có việc nào thì không gửi gì', () => {
    expect(planPush([], [])).toBeNull()
  })

  it('một việc chưa từng đẩy thì gửi đúng tiêu đề của việc đó', () => {
    const out = planPush([action('budget-over:cat-1', 'Ăn uống vượt hạn mức ¥12.000')], [])
    expect(out).not.toBeNull()
    expect(out?.title).toBe('Ăn uống vượt hạn mức ¥12.000')
    expect(out?.keys).toEqual(['budget-over:cat-1'])
    expect(out?.to).toBe('/budget')
  })

  it('một việc có detail thì detail thành nội dung', () => {
    const out = planPush(
      [action('account-negative:a', 'Ví âm ¥1.200', { detail: 'Thường là ghi nhầm.' })],
      [],
    )
    expect(out?.body).toBe('Thường là ghi nhầm.')
  })

  it('việc đã đẩy rồi thì IM, không nhắc lại', () => {
    const out = planPush(
      [action('budget-over:cat-1', 'Ăn uống vượt hạn mức')],
      [state('budget-over:cat-1', { pushed_at: '2026-08-02T23:00:00.000Z' })],
    )
    expect(out).toBeNull()
  })

  it('đã ĐỌC trong app nhưng chưa đẩy thì VẪN đẩy', () => {
    // Đọc trong chuông và nhận push là hai việc khác nhau: mở app xem lúc 7 giờ
    // không có nghĩa là 8 giờ khỏi cần nhắc. Chỉ pushed_at mới chặn đẩy.
    const out = planPush(
      [action('debt-overdue:d1', 'Anh Tuấn nợ mình quá hạn 6 ngày')],
      [state('debt-overdue:d1', { read_at: '2026-08-03T07:00:00.000Z' })],
    )
    expect(out?.keys).toEqual(['debt-overdue:d1'])
  })

  it('nhiều việc thì gộp thành MỘT thông báo, không xếp chồng', () => {
    const out = planPush(
      [
        action('account-negative:a', 'Ví âm ¥1.200'),
        action('debt-overdue:d1', 'Anh Tuấn nợ mình quá hạn'),
        action('budget-over:c', 'Ăn uống vượt hạn mức'),
      ],
      [],
    )
    expect(out?.title).toBe('3 việc cần để ý')
    expect(out?.body).toBe('Ví âm ¥1.200 · Anh Tuấn nợ mình quá hạn · Ăn uống vượt hạn mức')
    expect(out?.keys).toHaveLength(3)
  })

  it('gộp nhiều thì bấm vào mở danh sách chuông, không nhảy vào một việc lẻ', () => {
    const out = planPush(
      [action('account-negative:a', 'Ví âm', { to: '/assets/a' }), action('budget-over:c', 'Vượt')],
      [],
    )
    expect(out?.to).toBe('/?notif=1')
  })

  it(`quá ${PUSH_BODY_ITEMS} việc thì kể ${PUSH_BODY_ITEMS} việc rồi đếm phần còn lại`, () => {
    const many = Array.from({ length: PUSH_BODY_ITEMS + 2 }, (_, i) =>
      action(`budget-over:c${i}`, `Việc ${i}`),
    )
    const out = planPush(many, [])
    expect(out?.title).toBe(`${PUSH_BODY_ITEMS + 2} việc cần để ý`)
    expect(out?.body).toBe(
      [...Array.from({ length: PUSH_BODY_ITEMS }, (_, i) => `Việc ${i}`), 'và 2 việc nữa'].join(
        ' · ',
      ),
    )
  })

  it('việc bị cắt khỏi nội dung VẪN được ghi pushed_at (không đẩy lại ngày mai)', () => {
    const many = Array.from({ length: PUSH_BODY_ITEMS + 2 }, (_, i) =>
      action(`budget-over:c${i}`, `Việc ${i}`),
    )
    const out = planPush(many, [])
    expect(out?.keys).toHaveLength(PUSH_BODY_ITEMS + 2)
  })

  it('trộn việc đã đẩy và việc mới thì chỉ tính việc mới', () => {
    const out = planPush(
      [action('budget-over:cu', 'Việc cũ'), action('budget-over:moi', 'Việc mới')],
      [state('budget-over:cu', { pushed_at: '2026-08-02T23:00:00.000Z' })],
    )
    expect(out?.title).toBe('Việc mới')
    expect(out?.keys).toEqual(['budget-over:moi'])
  })

  it('tin-để-biết lọt vào danh sách cũng bị bỏ (chỉ đẩy việc cần làm)', () => {
    // Gọi đúng thì tham số đã chỉ chứa actionsAll, nhưng hàm này là thứ edge function
    // gọi trực tiếp — chặn ở đây rẻ hơn là tin rằng nơi gọi luôn truyền đúng.
    const out = planPush(
      [
        { ...action('stale-entry:2026-W31', 'Lâu chưa ghi sổ'), kind: 'info' },
        action('budget-over:c', 'Vượt hạn mức'),
      ],
      [],
    )
    expect(out?.keys).toEqual(['budget-over:c'])
  })

  it('việc mức low một mình thì KHÔNG gõ cửa (ở lại trong chuông)', () => {
    const out = planPush(
      [
        action('data-reconcile:all', 'Yucho chưa đối chiếu quá 30 ngày', {
          type: 'data-reconcile',
          severity: 'low',
        }),
        action('trip-gap:2026-08-14', '4 ngày không có giao dịch nào — đi vắng?', {
          type: 'trip-gap',
          severity: 'low',
        }),
      ],
      [],
    )
    expect(out).toBeNull()
  })

  it('việc mức low KHÔNG bị kể vào lượt đẩy của việc khác', () => {
    const out = planPush(
      [
        action('account-shortfall:a', 'Yucho thiếu ¥15.000', { severity: 'high' }),
        action('data-reconcile:all', 'Chưa đối chiếu', {
          type: 'data-reconcile',
          severity: 'low',
        }),
      ],
      [],
    )
    // Chỉ một việc còn lại → nhánh "một việc", nói thẳng tiêu đề của nó.
    expect(out?.title).toBe('Yucho thiếu ¥15.000')
    expect(out?.keys).toEqual(['account-shortfall:a'])
  })

  // Hệ quả của việc KHÔNG ghi keys cho mức low, và là lý do phép lọc nằm ở đây chứ
  // không ở bộ luật: `bill-due` giữ NGUYÊN mã suốt kỳ (`bill-due:<rule>:<dueISO>`) mà
  // mức thì đổi theo ngày — 'low' khi còn xa, 'medium' đúng ngày tới hạn. Vì lần im
  // lặng không ghi `pushed_at`, ngày tới hạn nó vẫn đẩy được.
  it('cùng một mã: im lúc còn low, gõ cửa khi lên medium', () => {
    const key = 'bill-due:r1:2026-09-10'
    const conXa = planPush(
      [action(key, '3 ngày nữa tới hạn "Gửi tiền về nhà"', { type: 'bill-due', severity: 'low' })],
      [],
    )
    expect(conXa).toBeNull()

    // Không có dòng pushed_at nào được ghi ở lượt trên, nên trạng thái vẫn rỗng.
    const toiNgay = planPush(
      [action(key, 'Hôm nay tới hạn "Gửi tiền về nhà"', { type: 'bill-due', severity: 'medium' })],
      [],
    )
    expect(toiNgay?.keys).toEqual([key])
  })

  it('mức cao nhất trong nhóm được đưa ra ngoài để service worker dùng', () => {
    const out = planPush(
      [
        action('budget-pace:c', 'Tiêu nhanh', { severity: 'medium' }),
        action('account-negative:a', 'Ví âm', { severity: 'high' }),
      ],
      [],
    )
    expect(out?.severity).toBe('high')
  })

  it('tag ổn định để push sau THAY push trước chứ không chồng lên', () => {
    const a = planPush([action('budget-over:c', 'Vượt')], [])
    const b = planPush([action('debt-overdue:d', 'Quá hạn')], [])
    expect(a?.tag).toBe(b?.tag)
  })
})
