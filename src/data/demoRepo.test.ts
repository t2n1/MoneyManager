import { beforeEach, describe, expect, it } from 'vitest'
import { demoRepo, resetDemoData, STORAGE_KEY } from './demoRepo'
import type { NewAccount, NewLifeScenario, NewRecurringRule, NewTransaction } from './repo'

// Vitest chạy môi trường node → không có localStorage. Cài bản giả trong bộ nhớ.
beforeEach(() => {
  const store = new Map<string, string>()
  globalThis.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v)
    },
    removeItem: (k: string) => {
      store.delete(k)
    },
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size
    },
  } as Storage
  resetDemoData()
})

function accountInput(over: Partial<NewAccount> = {}): NewAccount {
  return {
    name: 'TK test',
    type: 'cash',
    currency: 'JPY',
    initial_balance: 0,
    asset_group: null,
    is_hidden: false,
    include_in_totals: true,
    ...over,
  }
}

// Giá trị mặc định lấy đúng theo migration 0031 — demoRepo đọc thẳng từng trường của
// input, nên truyền thiếu là ghi `undefined` vào hàng kịch bản.
function scenarioInput(over: Partial<NewLifeScenario> = {}): NewLifeScenario {
  return {
    name: 'Cơ sở',
    display_currency: 'JPY',
    end_age: 90,
    real_return_bps: 200,
    band_spread_bps: 150,
    starting_assets_minor: 0,
    nominal_terms: false,
    is_primary: false,
    ...over,
  }
}

function expenseTx(accountId: string, categoryId: string): NewTransaction {
  return {
    type: 'expense',
    amount: 100,
    to_amount: null,
    category_id: categoryId,
    account_id: accountId,
    to_account_id: null,
    occurred_on: '2026-07-01',
    note: '',
  }
}

// Seed có NHIỀU tài khoản investment ('Chứng khoán VN' và 'Đầu tư VN') — lấy đúng tên,
// đừng lấy tài khoản investment đầu tiên tìm thấy (thứ tự trong seed có thể đổi).
async function taiKhoanChungKhoanVN() {
  const accounts = await demoRepo.getAccounts()
  const acc = accounts.find((a) => a.name === 'Chứng khoán VN')
  if (!acc) throw new Error('Seed thiếu tài khoản "Chứng khoán VN" — test sổ lệnh cần đúng tài khoản này')
  return acc
}

describe('createTransaction — hình dạng dữ liệu (khớp CHECK của Postgres)', () => {
  it('chi/thu KHÔNG có danh mục thì báo lỗi', async () => {
    const acc = await demoRepo.createAccount(accountInput())
    await expect(
      demoRepo.createTransaction({ ...expenseTx(acc.id, ''), category_id: null }),
    ).rejects.toThrow(/danh mục/i)
  })

  it('chuyển khoản CÓ danh mục thì báo lỗi', async () => {
    const from = await demoRepo.createAccount(accountInput({ name: 'A' }))
    const to = await demoRepo.createAccount(accountInput({ name: 'B' }))
    const cat = (await demoRepo.getCategories()).find((c) => c.type === 'expense')!
    await expect(
      demoRepo.createTransaction({
        ...expenseTx(from.id, cat.id),
        type: 'transfer',
        to_account_id: to.id,
      }),
    ).rejects.toThrow(/danh mục/i)
  })

  it('chuyển khoản về chính nó thì báo lỗi', async () => {
    const acc = await demoRepo.createAccount(accountInput())
    await expect(
      demoRepo.createTransaction({
        ...expenseTx(acc.id, ''),
        type: 'transfer',
        category_id: null,
        to_account_id: acc.id,
      }),
    ).rejects.toThrow(/chính nó/i)
  })

  it('chi/thu có danh mục thì lưu được', async () => {
    const acc = await demoRepo.createAccount(accountInput())
    const cat = (await demoRepo.getCategories()).find((c) => c.type === 'expense')!
    const row = await demoRepo.createTransaction(expenseTx(acc.id, cat.id))
    expect(row.category_id).toBe(cat.id)
  })

  it('số tiền 0 hoặc âm thì báo lỗi (CHECK amount > 0)', async () => {
    const acc = await demoRepo.createAccount(accountInput())
    const cat = (await demoRepo.getCategories()).find((c) => c.type === 'expense')!
    await expect(
      demoRepo.createTransaction({ ...expenseTx(acc.id, cat.id), amount: 0 }),
    ).rejects.toThrow(/số dương/i)
    await expect(
      demoRepo.createTransaction({ ...expenseTx(acc.id, cat.id), amount: -100 }),
    ).rejects.toThrow(/số dương/i)
  })
})

describe('updateTransaction — soi hình dạng SAU khi trộn patch (khớp CHECK của Postgres)', () => {
  it('patch chi tiêu thành transfer mà vẫn giữ danh mục thì báo lỗi', async () => {
    const from = await demoRepo.createAccount(accountInput({ name: 'A' }))
    const to = await demoRepo.createAccount(accountInput({ name: 'B' }))
    const cat = (await demoRepo.getCategories()).find((c) => c.type === 'expense')!
    const tx = await demoRepo.createTransaction(expenseTx(from.id, cat.id))
    // Đường sửa đổi type: bản thật nổ 23514, demo phải nổ y hệt.
    await expect(
      demoRepo.updateTransaction(tx.id, { type: 'transfer', to_account_id: to.id }),
    ).rejects.toThrow(/danh mục/i)
    // Patch đúng shape (bỏ danh mục) thì phải qua.
    const ok = await demoRepo.updateTransaction(tx.id, {
      type: 'transfer',
      to_account_id: to.id,
      category_id: null,
    })
    expect(ok.type).toBe('transfer')
  })

  it('patch chi tiêu gắn thêm to_account_id thì báo lỗi', async () => {
    const acc = await demoRepo.createAccount(accountInput())
    const cat = (await demoRepo.getCategories()).find((c) => c.type === 'expense')!
    const tx = await demoRepo.createTransaction(expenseTx(acc.id, cat.id))
    await expect(
      demoRepo.updateTransaction(tx.id, { to_account_id: acc.id }),
    ).rejects.toThrow(/tài khoản đích/i)
  })

  it('patch số tiền về 0 thì báo lỗi', async () => {
    const acc = await demoRepo.createAccount(accountInput())
    const cat = (await demoRepo.getCategories()).find((c) => c.type === 'expense')!
    const tx = await demoRepo.createTransaction(expenseTx(acc.id, cat.id))
    await expect(demoRepo.updateTransaction(tx.id, { amount: 0 })).rejects.toThrow(/số dương/i)
  })
})

describe('lifePhases — UNIQUE (scenario_id, start_year) khớp 0031', () => {
  it('hai chặng cùng năm trong một kịch bản thì báo lỗi, khác kịch bản thì được', async () => {
    const sc = await demoRepo.createLifeScenario(scenarioInput())
    const sc2 = await demoRepo.createLifeScenario(scenarioInput({ name: 'Kịch bản B' }))
    const phase = {
      scenario_id: sc.id,
      start_year: 2030,
      label: 'Nhật',
      country: 'JP',
      currency: 'JPY' as const,
      annual_income_minor: 0,
      annual_expense_minor: 0,
      fx_to_display: 1,
    }
    await demoRepo.createLifePhase(phase)
    await expect(demoRepo.createLifePhase({ ...phase, label: 'Mỹ' })).rejects.toThrow(/2030/)
    // Cùng năm nhưng kịch bản khác — Postgres cho phép, demo cũng phải cho.
    await expect(
      demoRepo.createLifePhase({ ...phase, scenario_id: sc2.id }),
    ).resolves.toBeTruthy()
    // update dời một chặng đè lên năm của chặng khác cũng phải bị chặn.
    const other = await demoRepo.createLifePhase({ ...phase, start_year: 2040 })
    await expect(demoRepo.updateLifePhase(other.id, { start_year: 2030 })).rejects.toThrow(/2030/)
  })
})

describe('deleteAccount', () => {
  it('xóa được tài khoản trống', async () => {
    const acc = await demoRepo.createAccount(accountInput())
    await demoRepo.deleteAccount(acc.id)
    const list = await demoRepo.getAccounts()
    expect(list.some((a) => a.id === acc.id)).toBe(false)
  })

  it('không xóa khi còn giao dịch', async () => {
    const acc = await demoRepo.createAccount(accountInput())
    const cat = await demoRepo.createCategory({ name: 'C', type: 'expense', icon: '📦' })
    await demoRepo.createTransaction(expenseTx(acc.id, cat.id))
    await expect(demoRepo.deleteAccount(acc.id)).rejects.toThrow(/giao dịch/)
    expect((await demoRepo.getAccounts()).some((a) => a.id === acc.id)).toBe(true)
  })

  it('không xóa khi còn mục tiêu tiết kiệm', async () => {
    const acc = await demoRepo.createAccount(accountInput())
    await demoRepo.createSavingsGoal({
      name: 'G',
      account_id: acc.id,
      target_amount: 1000,
      target_date: null,
      note: '',
    })
    await expect(demoRepo.deleteAccount(acc.id)).rejects.toThrow(/mục tiêu/)
  })

  it('không xóa khi đang là nguồn trả cho một thẻ', async () => {
    const bank = await demoRepo.createAccount(accountInput({ name: 'Ngân hàng', type: 'bank' }))
    await demoRepo.createAccount(accountInput({ name: 'Thẻ', type: 'card', payment_account_id: bank.id }))
    await expect(demoRepo.deleteAccount(bank.id)).rejects.toThrow(/thẻ/)
  })

  it('không xóa khi còn giao dịch định kỳ', async () => {
    const acc = await demoRepo.createAccount(accountInput())
    const cat = await demoRepo.createCategory({ name: 'C', type: 'expense', icon: '📦' })
    const rule: NewRecurringRule = {
      type: 'expense',
      amount: 100,
      to_amount: null,
      category_id: cat.id,
      account_id: acc.id,
      to_account_id: null,
      note: '',
      frequency: 'monthly',
      start_on: '2026-07-01',
      end_on: null,
    }
    await demoRepo.createRecurringRule(rule)
    await expect(demoRepo.deleteAccount(acc.id)).rejects.toThrow(/định kỳ/)
  })

  it('không xóa khi còn dữ liệu giá trị đầu tư', async () => {
    const acc = await demoRepo.createAccount(accountInput({ name: 'TK đầu tư', type: 'investment' }))
    await demoRepo.upsertValuation({
      account_id: acc.id,
      valued_on: '2026-07-01',
      market_value: 100000,
      note: '',
    })
    await expect(demoRepo.deleteAccount(acc.id)).rejects.toThrow(/giá trị đầu tư/)
  })
})

// Ép source của một hàng account_valuations thẳng trong localStorage — mô phỏng hàng
// do cron stock-refresh đã ghi (source='auto') trước khi người dùng gõ tay đè lên.
function setStoredValuationSource(accountId: string, valuedOn: string, source: 'manual' | 'auto') {
  const raw = localStorage.getItem(STORAGE_KEY)
  const db = JSON.parse(raw ?? '{}') as {
    accountValuations?: { account_id: string; valued_on: string; source: string }[]
  }
  const row = (db.accountValuations ?? []).find(
    (v) => v.account_id === accountId && v.valued_on === valuedOn,
  )
  if (!row) throw new Error('Không tìm thấy hàng account_valuations để ép source')
  row.source = source
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db))
}

describe('upsertValuation — số gõ tay luôn thắng số máy tính (quyết định 4)', () => {
  it('upsert lần đầu (chưa có hàng nào) -> source luôn là manual', async () => {
    const acc = await demoRepo.createAccount(accountInput({ name: 'TK đầu tư', type: 'investment' }))
    const row = await demoRepo.upsertValuation({
      account_id: acc.id,
      valued_on: '2026-08-01',
      market_value: 100_000,
      note: '',
    })
    expect(row.source).toBe('manual')
  })

  it('gõ tay đè lên hàng đã có source=auto -> claim lại thành manual, không để cron đè tiếp', async () => {
    const acc = await demoRepo.createAccount(accountInput({ name: 'TK đầu tư', type: 'investment' }))
    // Hàng do cron ghi trước đó.
    await demoRepo.upsertValuation({
      account_id: acc.id,
      valued_on: '2026-08-01',
      market_value: 1_000_000,
      note: 'Tự tính theo giá phiên',
    })
    setStoredValuationSource(acc.id, '2026-08-01', 'auto')
    const truocKhiSua = (await demoRepo.getAccountValuations()).find(
      (v) => v.account_id === acc.id && v.valued_on === '2026-08-01',
    )
    expect(truocKhiSua?.source).toBe('auto') // xác nhận đã ép được trạng thái giả lập

    // Người dùng mở sheet "Cập nhật giá trị" và tự sửa lại số cho đúng ngày đó.
    const sau = await demoRepo.upsertValuation({
      account_id: acc.id,
      valued_on: '2026-08-01',
      market_value: 2_000_000,
      note: 'Tôi tự sửa lại',
    })
    expect(sau.source).toBe('manual')
    expect(sau.market_value).toBe(2_000_000)

    // Đọc lại từ "DB" để chắc là đã lưu, không chỉ đúng ở giá trị trả về.
    const doc = (await demoRepo.getAccountValuations()).find(
      (v) => v.account_id === acc.id && v.valued_on === '2026-08-01',
    )
    expect(doc?.source).toBe('manual')
  })
})

describe('deleteCategory', () => {
  it('xóa được danh mục trống', async () => {
    const cat = await demoRepo.createCategory({ name: 'C', type: 'expense', icon: '📦' })
    await demoRepo.deleteCategory(cat.id)
    expect((await demoRepo.getCategories()).some((c) => c.id === cat.id)).toBe(false)
  })

  it('không xóa khi còn giao dịch', async () => {
    const acc = await demoRepo.createAccount(accountInput())
    const cat = await demoRepo.createCategory({ name: 'C', type: 'expense', icon: '📦' })
    await demoRepo.createTransaction(expenseTx(acc.id, cat.id))
    await expect(demoRepo.deleteCategory(cat.id)).rejects.toThrow(/giao dịch/)
    expect((await demoRepo.getCategories()).some((c) => c.id === cat.id)).toBe(true)
  })

  it('xóa cha kèm các con trống', async () => {
    const parent = await demoRepo.createCategory({ name: 'P', type: 'expense', icon: '📦' })
    const child = await demoRepo.createCategory({
      name: 'Con',
      type: 'expense',
      icon: '📦',
      parent_id: parent.id,
    })
    await demoRepo.deleteCategory(parent.id)
    const cats = await demoRepo.getCategories()
    expect(cats.some((c) => c.id === parent.id)).toBe(false)
    expect(cats.some((c) => c.id === child.id)).toBe(false)
  })

  it('không xóa cha khi một con còn giao dịch', async () => {
    const acc = await demoRepo.createAccount(accountInput())
    const parent = await demoRepo.createCategory({ name: 'P', type: 'expense', icon: '📦' })
    const child = await demoRepo.createCategory({
      name: 'Con',
      type: 'expense',
      icon: '📦',
      parent_id: parent.id,
    })
    await demoRepo.createTransaction(expenseTx(acc.id, child.id))
    await expect(demoRepo.deleteCategory(parent.id)).rejects.toThrow(/giao dịch/)
    const cats = await demoRepo.getCategories()
    expect(cats.some((c) => c.id === parent.id)).toBe(true)
    expect(cats.some((c) => c.id === child.id)).toBe(true)
  })
})

describe('deleteTransactions (xóa hàng loạt)', () => {
  const RANGE = { start: '2026-07-01', end: '2026-08-01' }

  // Dữ liệu demo đã seed sẵn vài giao dịch tháng 7 → kiểm theo THÀNH VIÊN id mình tạo,
  // không đếm cứng tổng.
  it('xóa đúng tập id, giữ phần còn lại', async () => {
    const acc = await demoRepo.createAccount(accountInput())
    const cat = await demoRepo.createCategory({ name: 'C', type: 'expense', icon: '📦' })
    const a = await demoRepo.createTransaction(expenseTx(acc.id, cat.id))
    const b = await demoRepo.createTransaction(expenseTx(acc.id, cat.id))
    const c = await demoRepo.createTransaction(expenseTx(acc.id, cat.id))

    await demoRepo.deleteTransactions([a.id, c.id])
    const ids = (await demoRepo.listTransactions(RANGE)).map((t) => t.id)
    expect(ids).not.toContain(a.id)
    expect(ids).not.toContain(c.id)
    expect(ids).toContain(b.id)
  })

  it('rỗng thì không xóa gì', async () => {
    const acc = await demoRepo.createAccount(accountInput())
    const cat = await demoRepo.createCategory({ name: 'C', type: 'expense', icon: '📦' })
    const tx = await demoRepo.createTransaction(expenseTx(acc.id, cat.id))
    await demoRepo.deleteTransactions([])
    const ids = (await demoRepo.listTransactions(RANGE)).map((t) => t.id)
    expect(ids).toContain(tx.id)
  })

  it('gỡ luôn nhãn liên kết của giao dịch bị xóa', async () => {
    const acc = await demoRepo.createAccount(accountInput())
    const cat = await demoRepo.createCategory({ name: 'C', type: 'expense', icon: '📦' })
    const tag = await demoRepo.createTag({ name: 'T', color: 'blue' })
    const tx = await demoRepo.createTransaction({ ...expenseTx(acc.id, cat.id), tag_ids: [tag.id] })
    await demoRepo.deleteTransactions([tx.id])
    const links = await demoRepo.getTransactionTags()
    expect(links.some((l) => l.transaction_id === tx.id)).toBe(false)
  })
})

// Đọc thẳng localStorage rồi ép read_at của một dòng trạng thái thông báo về
// một mốc quá khứ xác định — tránh dựa vào khoảng cách đồng hồ thật giữa 2 lệnh gọi.
function setStoredReadAt(key: string, readAtISO: string) {
  const raw = localStorage.getItem(STORAGE_KEY)
  const db = JSON.parse(raw ?? '{}') as {
    notificationState?: { key: string; read_at: string | null }[]
  }
  const row = (db.notificationState ?? []).find((r) => r.key === key)
  if (!row) throw new Error(`Không tìm thấy trạng thái của mã ${key}`)
  row.read_at = readAtISO
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db))
}

describe('trạng thái thông báo', () => {
  it('đánh dấu đã đọc rồi đọc lại thấy read_at', async () => {
    await demoRepo.markNotificationsRead(['budget-over:cat-1', 'stale-entry:2026-W31'])
    const rows = await demoRepo.getNotificationState()
    const over = rows.find((r) => r.key === 'budget-over:cat-1')
    expect(over?.read_at).toBeTruthy()
    expect(over?.dismissed_at).toBeNull()
  })

  it('đánh dấu đã đọc hai lần không tạo dòng trùng, giữ nguyên read_at cũ', async () => {
    await demoRepo.markNotificationsRead(['budget-over:cat-2'])
    setStoredReadAt('budget-over:cat-2', '2020-01-01T00:00:00.000Z')
    await demoRepo.markNotificationsRead(['budget-over:cat-2'])
    const rows = await demoRepo.getNotificationState()
    const matches = rows.filter((r) => r.key === 'budget-over:cat-2')
    expect(matches).toHaveLength(1)
    // Mã đã có thì giữ read_at cũ — không bị lần gọi thứ hai ghi đè.
    expect(matches[0].read_at).toBe('2020-01-01T00:00:00.000Z')
  })

  it('tắt một tin thì có dismissed_at', async () => {
    await demoRepo.dismissNotification('recurring-suggestion:abc')
    const rows = await demoRepo.getNotificationState()
    expect(rows.find((r) => r.key === 'recurring-suggestion:abc')?.dismissed_at).toBeTruthy()
  })

  it('tắt một tin đã đọc từ trước thì đặt lại read_at = lúc tắt', async () => {
    await demoRepo.markNotificationsRead(['recurring-suggestion:xyz'])
    setStoredReadAt('recurring-suggestion:xyz', '2020-01-01T00:00:00.000Z')
    await demoRepo.dismissNotification('recurring-suggestion:xyz')
    const rows = await demoRepo.getNotificationState()
    const row = rows.find((r) => r.key === 'recurring-suggestion:xyz')
    // Bấm tắt = vừa nhìn thấy → read_at phải nhảy tới lúc tắt, không giữ mốc đã đọc cũ.
    expect(row?.read_at).not.toBe('2020-01-01T00:00:00.000Z')
    expect(row?.read_at).toBe(row?.dismissed_at)
  })

  it('đánh dấu đã đọc một mã ĐÃ TẮT thì không xóa mất dismissed_at', async () => {
    // Đây là lớp lệch DUY NHẤT giữa hai bản repo có thể làm một tin đã tắt vĩnh viễn
    // sống lại: nếu markNotificationsRead ghi đè cả dòng (thay vì bỏ qua mã đã có) thì
    // dismissed_at về null và lần tính sau tin đó hiện lại. Bản demo bỏ qua bằng
    // `continue`, bản Supabase bằng `ignoreDuplicates: true` — cả hai đang đúng, nhưng
    // không có phép thử nào ghim nên một lần "sửa cho hợp lý" là mất.
    await demoRepo.dismissNotification('recurring-suggestion:netflix')
    const rowsBefore = (await demoRepo.getNotificationState()).filter(
      (r) => r.key === 'recurring-suggestion:netflix',
    )
    await demoRepo.markNotificationsRead(['recurring-suggestion:netflix'])
    const rowsAfter = (await demoRepo.getNotificationState()).filter(
      (r) => r.key === 'recurring-suggestion:netflix',
    )
    // Đúng MỘT dòng, và mọi dòng mang mã này vẫn còn dismissed_at — kiểm cả tập chứ
    // không chỉ dòng đầu, kẻo một bản sinh dòng trùng chưa-tắt mà phép thử vẫn xanh.
    expect(rowsAfter).toHaveLength(1)
    expect(rowsAfter.every((r) => r.dismissed_at != null)).toBe(true)
    expect(rowsAfter[0].dismissed_at).toBe(rowsBefore[0].dismissed_at)
    expect(rowsAfter[0].read_at).toBe(rowsBefore[0].read_at)
  })

  it('xóa trạng thái theo danh sách mã', async () => {
    await demoRepo.markNotificationsRead(['account-negative:acc-1'])
    await demoRepo.deleteNotificationStates(['account-negative:acc-1'])
    const rows = await demoRepo.getNotificationState()
    expect(rows.find((r) => r.key === 'account-negative:acc-1')).toBeUndefined()
  })

  it('dọn với mốc tương lai thì xóa hết', async () => {
    await demoRepo.markNotificationsRead(['stale-entry:2026-W31', 'budget-over:cat-3'])
    await demoRepo.pruneNotificationState('2099-01-01T00:00:00.000Z')
    const rows = await demoRepo.getNotificationState()
    expect(rows).toHaveLength(0)
  })

  it('dòng ĐÃ TẮT thì dọn rác không xóa (tắt là mất hẳn)', async () => {
    // Mốc dọn ở tương lai nên cả hai dòng đều "cũ hơn mốc"; chỉ dòng chưa tắt được xóa.
    await demoRepo.markNotificationsRead(['stale-entry:2026-W31'])
    await demoRepo.dismissNotification('recurring-suggestion:netflix')
    await demoRepo.pruneNotificationState('2099-01-01T00:00:00.000Z')
    const rows = await demoRepo.getNotificationState()
    expect(rows.map((r) => r.key)).toEqual(['recurring-suggestion:netflix'])
    // Nếu dọn cả dòng đã tắt thì 13 tháng sau gợi ý "tạo quy tắc Netflix" sống lại.
    expect(rows[0].dismissed_at).toBeTruthy()
  })

  it('dọn với mốc quá khứ thì giữ nguyên', async () => {
    await demoRepo.markNotificationsRead(['stale-entry:2026-W31', 'budget-over:cat-3'])
    await demoRepo.pruneNotificationState('2000-01-01T00:00:00.000Z')
    const rows = await demoRepo.getNotificationState()
    expect(rows).toHaveLength(2)
  })
})

describe('lịch sử tỷ giá', () => {
  it('ghi rồi ghi đè cùng ngày không tạo dòng trùng', async () => {
    await demoRepo.recordFxRates('2026-07-28', 'JPY', { VND: 170 })
    await demoRepo.recordFxRates('2026-07-28', 'JPY', { VND: 172 })
    const raw = localStorage.getItem(STORAGE_KEY)
    const db = JSON.parse(raw ?? '{}') as { fxHistory?: { on_date: string; rates: Record<string, number> }[] }
    const same = (db.fxHistory ?? []).filter((r) => r.on_date === '2026-07-28')
    expect(same).toHaveLength(1)
    expect(same[0].rates.VND).toBe(172)
  })
})

describe('khôi phục backup', () => {
  /** Backup dựng từ chính dữ liệu demo hiện có -> chắc chắn hợp lệ. */
  async function goodBackup() {
    return await demoRepo.exportAll()
  }

  it('file lành -> khôi phục được', async () => {
    const data = await goodBackup()
    const soTruoc = (await demoRepo.exportAll()).transactions.length
    await demoRepo.importAll(data)
    expect((await demoRepo.exportAll()).transactions.length).toBe(soTruoc)
  })

  it('file hỏng -> BÁO LỖI và dữ liệu cũ CÒN NGUYÊN', async () => {
    const data = await goodBackup()
    const truoc = await demoRepo.exportAll()
    expect(truoc.transactions.length).toBeGreaterThan(0)

    // Giao dịch trỏ tới tài khoản không có trong file: đúng hình dạng lỗi mà file nạp
    // Zaim có thể mắc (sửa tay bảng nối ví rồi quên tài khoản tương ứng).
    data.transactions[0] = { ...data.transactions[0], account_id: 'khong-ton-tai' }
    await expect(demoRepo.importAll(data)).rejects.toThrow(/tài khoản/i)

    const sau = await demoRepo.exportAll()
    expect(sau.transactions.length).toBe(truoc.transactions.length)
    expect(sau.accounts.length).toBe(truoc.accounts.length)
  })

  it('file có số tiền 0 -> chặn trước khi xoá', async () => {
    const data = await goodBackup()
    data.transactions[0] = { ...data.transactions[0], amount: 0 }
    await expect(demoRepo.importAll(data)).rejects.toThrow(/số tiền/i)
    expect((await demoRepo.exportAll()).transactions.length).toBeGreaterThan(0)
  })
})

describe('đăng ký push của thiết bị', () => {
  const sub = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
    p256dh: 'khoa-cong-khai',
    auth: 'khoa-xac-thuc',
    userAgent: 'iPhone',
  }

  it('lưu rồi đọc lại thấy đúng khoá', async () => {
    await demoRepo.savePushSubscription(sub)
    const rows = await demoRepo.getPushSubscriptions()
    expect(rows).toHaveLength(1)
    expect(rows[0].endpoint).toBe(sub.endpoint)
    expect(rows[0].p256dh).toBe('khoa-cong-khai')
    expect(rows[0].last_ok_at).toBeNull()
  })

  it('cùng endpoint đăng ký lại thì CẬP NHẬT khoá, không thêm dòng thứ hai', async () => {
    await demoRepo.savePushSubscription(sub)
    await demoRepo.savePushSubscription({ ...sub, p256dh: 'khoa-moi' })
    const rows = await demoRepo.getPushSubscriptions()
    expect(rows).toHaveLength(1)
    expect(rows[0].p256dh).toBe('khoa-moi')
  })

  it('hai thiết bị khác endpoint thì giữ cả hai (điện thoại + laptop đều phải nhận)', async () => {
    await demoRepo.savePushSubscription(sub)
    await demoRepo.savePushSubscription({ ...sub, endpoint: 'https://updates.push.services.mozilla.com/xyz', userAgent: 'Firefox' })
    expect(await demoRepo.getPushSubscriptions()).toHaveLength(2)
  })

  it('bỏ đăng ký một thiết bị thì thiết bị kia còn nguyên', async () => {
    const other = { ...sub, endpoint: 'https://updates.push.services.mozilla.com/xyz' }
    await demoRepo.savePushSubscription(sub)
    await demoRepo.savePushSubscription(other)
    await demoRepo.deletePushSubscription(sub.endpoint)
    const rows = await demoRepo.getPushSubscriptions()
    expect(rows.map((r) => r.endpoint)).toEqual([other.endpoint])
  })

  it('bỏ đăng ký endpoint không tồn tại thì im lặng, không nổ', async () => {
    await demoRepo.savePushSubscription(sub)
    await expect(demoRepo.deletePushSubscription('khong-co-that')).resolves.toBeUndefined()
    expect(await demoRepo.getPushSubscriptions()).toHaveLength(1)
  })

  it('profile demo có sẵn giờ gửi mặc định 8 giờ Nhật', async () => {
    const p = await demoRepo.getProfile()
    expect(p.push_hour).toBe(8)
    expect(p.push_tz).toBe('Asia/Tokyo')
    expect(p.push_last_sent_at).toBeNull()
  })

  it('đổi giờ gửi và múi giờ thì lưu được', async () => {
    const p = await demoRepo.updateProfile({ push_hour: 20, push_tz: 'America/Los_Angeles' })
    expect(p.push_hour).toBe(20)
    expect(p.push_tz).toBe('America/Los_Angeles')
  })
})

describe('khôi phục file sao lưu cũ hơn migration 0034', () => {
  it('file không có cột giờ gửi push thì điền mặc định, không để undefined', async () => {
    const data = await demoRepo.exportAll()
    // Dựng lại đúng hình dạng file xuất TRƯỚC khi có push: ba cột chưa tồn tại.
    const old = { ...data, profile: { ...data.profile } }
    delete (old.profile as Partial<typeof old.profile>).push_hour
    delete (old.profile as Partial<typeof old.profile>).push_tz
    delete (old.profile as Partial<typeof old.profile>).push_last_sent_at

    await demoRepo.importAll(old)

    const p = await demoRepo.getProfile()
    expect(p.push_hour).toBe(8)
    expect(p.push_tz).toBe('Asia/Tokyo')
    expect(p.push_last_sent_at).toBeNull()
  })
})

describe('demoRepo: sổ lệnh cổ phiếu', () => {
  it('tạo, sửa, xoá một lệnh', async () => {
    const acc = await taiKhoanChungKhoanVN()

    const created = await demoRepo.createStockTrade({
      account_id: acc.id,
      symbol: 'FPT',
      kind: 'buy',
      traded_on: '2026-08-01',
      quantity: 100,
      price: 70_000,
      fee: 10_500,
      tax: 0,
      note: '',
    })
    expect(created.symbol).toBe('FPT')
    expect(created.quantity).toBe(100)

    const sua = await demoRepo.updateStockTrade(created.id, { quantity: 200 })
    expect(sua.quantity).toBe(200)

    await demoRepo.deleteStockTrade(created.id)
    const conLai = await demoRepo.getStockTrades()
    expect(conLai.find((t) => t.id === created.id)).toBeUndefined()
  })

  it('bảng giá seed có mã để xem thử không cần mạng', async () => {
    const prices = await demoRepo.getStockPrices()
    expect(prices.map((p) => p.symbol)).toContain('FPT')
    expect(prices.every((p) => p.price > 0)).toBe(true)
  })

  it('sao lưu mang theo sổ lệnh và khôi phục lại được', async () => {
    const backup = await demoRepo.exportAll()
    expect(backup.version).toBe(7)
    expect(Array.isArray(backup.stockTrades)).toBe(true)

    await demoRepo.importAll(backup)
    const sau = await demoRepo.getStockTrades()
    expect(sau.length).toBe(backup.stockTrades?.length ?? 0)
  })

  it('sao lưu/khôi phục KHÔNG được đổi source của định giá — hàng auto phải vẫn là auto', async () => {
    // Nếu đường khôi phục quên cột `source`, mọi hàng do cron ghi (auto) sẽ biến thành
    // manual sau một lần khôi phục, và từ đó cron không bao giờ tính lại được nữa —
    // xem Fix 2 của đợt sửa lỗi cuối (backup restore silently rewrites source).
    const acc = await taiKhoanChungKhoanVN()
    await demoRepo.upsertValuation({
      account_id: acc.id,
      valued_on: '2026-08-01',
      market_value: 500_000,
      note: 'Tự tính theo giá phiên',
    })
    setStoredValuationSource(acc.id, '2026-08-01', 'auto')

    const backup = await demoRepo.exportAll()
    const truocKhiXuat = backup.accountValuations?.find(
      (v) => v.account_id === acc.id && v.valued_on === '2026-08-01',
    )
    expect(truocKhiXuat?.source).toBe('auto')

    await demoRepo.importAll(backup)
    const sauKhiNhap = (await demoRepo.getAccountValuations()).find(
      (v) => v.account_id === acc.id && v.valued_on === '2026-08-01',
    )
    expect(sauKhiNhap?.source).toBe('auto')
  })

  it('không xoá được tài khoản khi còn sổ lệnh', async () => {
    const acc = await taiKhoanChungKhoanVN()
    await demoRepo.createStockTrade({
      account_id: acc.id,
      symbol: 'VNM',
      kind: 'buy',
      traded_on: '2026-08-01',
      quantity: 10,
      price: 60_000,
      fee: 0,
      tax: 0,
      note: '',
    })
    await expect(demoRepo.deleteAccount(acc.id)).rejects.toThrow(/sổ lệnh/i)
  })

  // --- Soi hình dạng y như CHECK stock_trades_shape của migration 0035: demo
  // phải chặn cùng dữ liệu mà Postgres chặn, không thì bug chỉ nổ ở bản thật (xem
  // tiền lệ commit a321239 với assertTxShape / UNIQUE life_phases). ---

  it('từ chối lệnh mua/bán có số cổ hoặc giá không dương', async () => {
    const acc = await taiKhoanChungKhoanVN()
    await expect(
      demoRepo.createStockTrade({
        account_id: acc.id,
        symbol: 'FPT',
        kind: 'buy',
        traded_on: '2026-08-01',
        quantity: 0,
        price: 70_000,
        fee: 0,
        tax: 0,
        note: '',
      }),
    ).rejects.toThrow()
    await expect(
      demoRepo.createStockTrade({
        account_id: acc.id,
        symbol: 'FPT',
        kind: 'sell',
        traded_on: '2026-08-01',
        quantity: 10,
        price: 0,
        fee: 0,
        tax: 0,
        note: '',
      }),
    ).rejects.toThrow()
  })

  it('từ chối lệnh điều chỉnh có số cổ bằng 0 hoặc giá khác 0', async () => {
    const acc = await taiKhoanChungKhoanVN()
    await expect(
      demoRepo.createStockTrade({
        account_id: acc.id,
        symbol: 'FPT',
        kind: 'adjust',
        traded_on: '2026-08-01',
        quantity: 0,
        price: 0,
        fee: 0,
        tax: 0,
        note: '',
      }),
    ).rejects.toThrow()
    await expect(
      demoRepo.createStockTrade({
        account_id: acc.id,
        symbol: 'FPT',
        kind: 'adjust',
        traded_on: '2026-08-01',
        quantity: 50,
        price: 1_000,
        fee: 0,
        tax: 0,
        note: '',
      }),
    ).rejects.toThrow()
  })

  it('sửa lệnh thành hình dạng sai cũng bị chặn (soi SAU khi trộn patch)', async () => {
    const acc = await taiKhoanChungKhoanVN()
    const created = await demoRepo.createStockTrade({
      account_id: acc.id,
      symbol: 'FPT',
      kind: 'buy',
      traded_on: '2026-08-01',
      quantity: 100,
      price: 70_000,
      fee: 0,
      tax: 0,
      note: '',
    })
    await expect(demoRepo.updateStockTrade(created.id, { price: 0 })).rejects.toThrow()
  })

  it('chữ thường/khoảng trắng trong mã cổ phiếu được chuẩn hoá thành in hoa', async () => {
    const acc = await taiKhoanChungKhoanVN()
    const created = await demoRepo.createStockTrade({
      account_id: acc.id,
      symbol: ' fpt ',
      kind: 'buy',
      traded_on: '2026-08-01',
      quantity: 10,
      price: 70_000,
      fee: 0,
      tax: 0,
      note: '',
    })
    expect(created.symbol).toBe('FPT')
  })
})
