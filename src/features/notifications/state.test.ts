import { describe, expect, it } from 'vitest'
import {
  planNotificationCleanup,
  splitStaleActionKeys,
  unreadActionCount,
  visibleInfos,
} from './state'
import type { AppNotification } from './types'

function action(key: string): AppNotification {
  const [type] = key.split(':')
  return {
    key,
    kind: 'action',
    type: type as AppNotification['type'],
    severity: 'high',
    title: key,
    to: '/',
  }
}

function info(key: string): AppNotification {
  const [type] = key.split(':')
  return {
    key,
    kind: 'info',
    type: type as AppNotification['type'],
    severity: 'low',
    title: key,
    to: '/',
  }
}

/** Bộ ba tham số "mọi thứ đã sẵn sàng" — mỗi phép thử chỉ đổi thứ nó quan tâm. */
const READY = { alreadyDone: false, inputsReady: true, engineFailed: false }

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

describe('visibleInfos / unreadActionCount', () => {
  it('tin-để-biết đã đọc từ lượt trước thì không hiện nữa', () => {
    const out = visibleInfos(
      [info('networth-record:2026-07'), info('stale-entry:2026-W31')],
      new Set(['networth-record:2026-07']),
      new Set(),
    )
    expect(out.map((n) => n.key)).toEqual(['stale-entry:2026-W31'])
  })

  it('tin-để-biết đã tắt thì mất hẳn', () => {
    const out = visibleInfos(
      [info('recurring-suggestion:abc')],
      new Set(),
      new Set(['recurring-suggestion:abc']),
    )
    expect(out).toEqual([])
  })

  it('chuông chỉ đếm việc-cần-làm CHƯA đọc', () => {
    const actions = [action('budget-over:c1'), action('account-negative:a1')]
    expect(unreadActionCount(actions, new Set())).toBe(2)
    expect(unreadActionCount(actions, new Set(['budget-over:c1']))).toBe(1)
    expect(unreadActionCount(actions, new Set(actions.map((n) => n.key)))).toBe(0)
  })
})

describe('planNotificationCleanup', () => {
  it('đủ điều kiện thì trả kế hoạch xóa mã đã xong', () => {
    const plan = planNotificationCleanup({
      ...READY,
      storedKeys: ['budget-over:c1', 'account-negative:a1'],
      allKeys: ['account-negative:a1'],
    })
    expect(plan).toEqual({ staleKeys: ['budget-over:c1'] })
  })

  it('mã còn sống thì KHÔNG bị coi là đã xong', () => {
    const plan = planNotificationCleanup({
      ...READY,
      storedKeys: ['budget-over:c1'],
      allKeys: ['budget-over:c1'],
    })
    expect(plan).toEqual({ staleKeys: [] })
  })

  // ĐÂY LÀ PHÉP THỬ CHẶN LỖI C1. Trước khi sửa, cổng dọn chỉ chờ profile + trạng
  // thái đã đọc, còn allKeys do 13 luật trên 8 query KHÁC sinh ra. Ở đúng lượt
  // render mà profile vừa có, useMonthTransactions còn chưa được phép chạy nên
  // budgetReport = undefined, budgetRules trả [], allKeys khuyết hết mã budget-*
  // → mọi dòng "đã đọc" của ngân sách bị xóa. Chốt lại chạy đúng một lần nên không
  // bao giờ tự sửa: thông báo đã đọc đỏ lại như mới MỖI LẦN mở app, mãi mãi.
  it('dữ liệu chưa tải xong (allKeys rỗng) thì TUYỆT ĐỐI không xóa gì', () => {
    const plan = planNotificationCleanup({
      ...READY,
      inputsReady: false,
      storedKeys: ['budget-over:c1', 'account-negative:a1'],
      allKeys: [],
    })
    expect(plan).toBeNull()
  })

  it('dữ liệu chưa tải xong mà allKeys chỉ KHUYẾT một loại thì cũng không xóa', () => {
    const plan = planNotificationCleanup({
      ...READY,
      inputsReady: false,
      storedKeys: ['budget-over:c1', 'account-negative:a1'],
      allKeys: ['account-negative:a1'],
    })
    expect(plan).toBeNull()
  })

  it('bộ luật vừa lỗi thì không xóa (allKeys rỗng vì lỗi, không phải vì đã xong)', () => {
    const plan = planNotificationCleanup({
      ...READY,
      engineFailed: true,
      storedKeys: ['budget-over:c1'],
      allKeys: [],
    })
    expect(plan).toBeNull()
  })

  it('đã dọn lần này rồi thì thôi', () => {
    const plan = planNotificationCleanup({
      ...READY,
      alreadyDone: true,
      storedKeys: ['budget-over:c1'],
      allKeys: [],
    })
    expect(plan).toBeNull()
  })
})

// Mục I của spec đòi ba khẳng định về vòng đời; "tình huống tái diễn thì lại đỏ như
// mới" là cái chưa từng có phép thử — và đúng là cái C1 làm hỏng.
describe('vòng đời: hiện → đọc → còn nguyên → xong → tái diễn', () => {
  const key = 'budget-over:c1'
  const actions = [action(key)]

  it('năm bước đi đúng như spec', () => {
    // 1) Hiện lần đầu: chưa đọc → chuông đỏ 1.
    let readKeys = new Set<string>()
    expect(unreadActionCount(actions, readKeys)).toBe(1)

    // 2) Mở tấm trượt → đánh dấu đã đọc → chuông về 0, dòng vẫn còn (mờ).
    readKeys = new Set([key])
    expect(unreadActionCount(actions, readKeys)).toBe(0)
    expect(planNotificationCleanup({ ...READY, storedKeys: [key], allKeys: [key] })).toEqual({
      staleKeys: [],
    })

    // 3) TÌNH HUỐNG CÒN NGUYÊN qua nhiều lần mở app: bộ luật vẫn sinh mã đó nên dọn
    //    dẹp không được xóa gì, và chuông phải TIẾP TỤC im (đã đọc thì thôi kêu, chứ
    //    không phải mỗi lần mở app lại đỏ lên một lần — luật "một việc báo một lần").
    for (let day = 0; day < 3; day++) {
      expect(planNotificationCleanup({ ...READY, storedKeys: [key], allKeys: [key] })).toEqual({
        staleKeys: [],
      })
      expect(unreadActionCount(actions, readKeys)).toBe(0)
    }

    // 4) Người dùng xử lý xong (nâng hạn mức) → lượt sau bộ luật không sinh mã nữa
    //    → trạng thái đã đọc bị xóa.
    const plan = planNotificationCleanup({ ...READY, storedKeys: [key], allKeys: [] })
    expect(plan).toEqual({ staleKeys: [key] })

    // 5) Tháng sau lại vượt: DB không còn dòng nào cho mã này nên nó lại đỏ như mới.
    const afterDelete = new Set<string>()
    expect(unreadActionCount(actions, afterDelete)).toBe(1)
  })

  it('tin-để-biết đã tắt thì KHÔNG bao giờ quay lại, kể cả khi tình hình tái diễn', () => {
    const suggestion = 'recurring-suggestion:netflix'
    const infos = [info(suggestion)]
    const dismissed = new Set([suggestion])
    // Bấm ✕ → mất ngay.
    expect(visibleInfos(infos, new Set([suggestion]), dismissed)).toEqual([])

    // Dọn dẹp việc-cần-làm KHÔNG được chạm vào dòng trạng thái của tin-để-biết, dù
    // lượt này bộ luật có sinh lại mã đó (mẫu Netflix vẫn còn) hay không.
    expect(
      planNotificationCleanup({ ...READY, storedKeys: [suggestion], allKeys: [suggestion] }),
    ).toEqual({ staleKeys: [] })
    expect(planNotificationCleanup({ ...READY, storedKeys: [suggestion], allKeys: [] })).toEqual({
      staleKeys: [],
    })

    // Nên lượt sau bộ luật sinh lại mã đó thì nó vẫn bị lọc đi — tắt là mất hẳn.
    expect(visibleInfos(infos, new Set(), dismissed)).toEqual([])
  })

  it('nếu bước 3 không xóa (vì chưa đủ dữ liệu) thì bước 4 vẫn mờ — đúng lỗi C1', () => {
    // Diễn lại kịch bản C1 để thấy hậu quả nếu cổng dọn mở quá sớm rồi xóa oan:
    // ở đây cổng ĐÓNG nên trạng thái đã đọc còn nguyên, việc-cần-làm vẫn im.
    expect(
      planNotificationCleanup({ ...READY, inputsReady: false, storedKeys: [key], allKeys: [] }),
    ).toBeNull()
    expect(unreadActionCount(actions, new Set([key]))).toBe(0)
  })
})
