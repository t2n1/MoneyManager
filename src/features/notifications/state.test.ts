import { describe, expect, it } from 'vitest'
import {
  lifetimeQueriesSettled,
  notificationInputsReady,
  planNotificationCleanup,
  splitStaleActionKeys,
  unreadActionCount,
  visibleInfoLists,
  visibleActions,
  visibleInfos,
  type NotificationInputsReady,
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
    //    readKeys phải được SUY RA từ plan.staleKeys, không dựng tay một Set rỗng —
    //    dựng tay thì bước này chỉ lặp lại khẳng định của bước 1 và mối nối thật
    //    ("xóa đúng mã trong plan.staleKeys mới làm readKeys rỗng") không hề được thử.
    const afterDelete = new Set([...readKeys].filter((k) => !plan!.staleKeys.includes(k)))
    expect(afterDelete.size).toBe(0)
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

describe('notificationInputsReady', () => {
  /** Mọi nguồn đã về. Mỗi phép thử dưới đây chỉ tắt ĐÚNG một cờ. */
  const ALL: NotificationInputsReady = {
    profileLoaded: true,
    ratesOk: true,
    accountRowsOk: true,
    balancesOk: true,
    categoriesOk: true,
    debtsOk: true,
    recurringRulesOk: true,
    budgetReportComplete: true,
    savingsGoalsOk: true,
    networthSnapshotsOk: true,
    recentTxsOk: true,
    lifetimeOk: true,
    benefitsOk: true,
    notificationStateOk: true,
  }

  it('đủ mọi nguồn thì mới true', () => {
    expect(notificationInputsReady(ALL)).toBe(true)
  })

  // Đây là phép thử QUAN TRỌNG NHẤT của cả tính năng: lỗi C1 sống qua hai lượt sửa
  // đúng vì cái phép AND này nằm trong hook, không ai test, nên thiếu `ratesOk` và
  // `budgetReportComplete` mà không ai thấy. Vòng lặp dưới đây bắt buộc: thêm nguồn
  // dữ liệu mới cho bộ luật mà quên thêm cờ là phép thử này đỏ ngay.
  const flags = Object.keys(ALL) as Array<keyof NotificationInputsReady>
  it.each(flags)('thiếu %s là false', (flag) => {
    expect(notificationInputsReady({ ...ALL, [flag]: false })).toBe(false)
  })

  it('có đúng một cờ cho mỗi nguồn dữ liệu bộ luật đọc', () => {
    // Chốt số lượng: đổi NotificationInput mà không đổi đây thì phép thử này đỏ,
    // buộc người sửa phải đọc lại danh sách thay vì lặng lẽ bỏ sót một nguồn.
    // 14 kể từ khi `input.benefits` (bốn luật Quyền lợi) thành nguồn dữ liệu thứ 14.
    expect(flags).toHaveLength(14)
  })
})

describe('lifetimeQueriesSettled', () => {
  const ok = { isSuccess: true, isError: false }
  const loading = { isSuccess: false, isError: false }
  const failed = { isSuccess: false, isError: true }

  it('cả ba thành công thì true', () => {
    expect(lifetimeQueriesSettled([ok, ok, ok])).toBe(true)
  })

  it('còn một query đang tải thì false', () => {
    expect(lifetimeQueriesSettled([ok, loading, ok])).toBe(false)
  })

  // Ca chính của bản sửa: ba bảng Lifetime lỗi vĩnh viễn (RLS sai, mạng đứt, bảng chưa
  // tồn tại) KHÔNG được làm đông cứng việc dọn dấu-đã-đọc của 12 loại thông báo kia.
  it('lỗi hẳn cũng là ĐÃ NGÃ NGŨ — không được chặn dọn dẹp mãi mãi', () => {
    expect(lifetimeQueriesSettled([failed, failed, failed])).toBe(true)
    expect(lifetimeQueriesSettled([ok, failed, ok])).toBe(true)
  })

  it('mảng rỗng thì true — không có gì để chờ', () => {
    expect(lifetimeQueriesSettled([])).toBe(true)
  })
})

describe('visibleInfoLists', () => {
  it('lọc TRƯỚC rồi mới cắt trần — 4 tin, đọc 3 tin đầu thì tin thứ 4 vẫn hiện', () => {
    // Đúng lỗi I4-R: cắt trần trước thì phần thu gọn rỗng, cả khu "Tin để biết"
    // chỉ còn trơ một nút xám "Xem thêm 1 tin để biết".
    const infos = [info('a:1:2026-07'), info('b:2:2026-07'), info('c:3:2026-07'), info('d:4:2026-07')]
    const read = new Set(['a:1:2026-07', 'b:2:2026-07', 'c:3:2026-07'])
    const out = visibleInfoLists(infos, read, new Set(), 3)
    expect(out.infosAll.map((n) => n.key)).toEqual(['d:4:2026-07'])
    expect(out.infos.map((n) => n.key)).toEqual(['d:4:2026-07'])
  })

  it('tin đã tắt cũng bị lọc trước khi cắt trần', () => {
    const infos = [info('a:1:2026-07'), info('b:2:2026-07'), info('c:3:2026-07'), info('d:4:2026-07')]
    const out = visibleInfoLists(infos, new Set(), new Set(['a:1:2026-07', 'b:2:2026-07']), 3)
    expect(out.infosAll).toHaveLength(2)
    expect(out.infos.map((n) => n.key)).toEqual(['c:3:2026-07', 'd:4:2026-07'])
  })

  it('còn nhiều hơn trần thì phần thu gọn đúng bằng trần, bản đầy đủ giữ hết', () => {
    const infos = [info('a:1:2026-07'), info('b:2:2026-07'), info('c:3:2026-07'), info('d:4:2026-07')]
    const out = visibleInfoLists(infos, new Set(), new Set(), 3)
    expect(out.infos).toHaveLength(3)
    expect(out.infosAll).toHaveLength(4)
  })
})

describe('visibleActions (§4.9 / R5 — ẩn một việc)', () => {
  const n = (key: string): AppNotification =>
    ({ key, kind: 'action', type: 'budget-over', severity: 'high', title: key, to: '/' }) as AppNotification

  it('bỏ đúng việc đã ẩn, giữ nguyên phần còn lại', () => {
    const out = visibleActions([n('a'), n('b'), n('c')], new Set(['b']))
    expect(out.map((x) => x.key)).toEqual(['a', 'c'])
  })

  it('chưa ẩn gì thì giữ nguyên thứ tự', () => {
    const list = [n('a'), n('b')]
    expect(visibleActions(list, new Set()).map((x) => x.key)).toEqual(['a', 'b'])
  })

  // Việc-cần-làm KHÔNG lọc theo đã đọc: đọc một việc không làm nó xong. Chỉ `dismissed`
  // mới giấu nó đi, và `splitStaleActionKeys` dọn trạng thái đó khi tình huống hết.
  it('không đụng tới trạng thái đã đọc', () => {
    const out = visibleActions([n('a')], new Set())
    expect(out).toHaveLength(1)
  })
})
