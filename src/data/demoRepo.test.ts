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
    // Số cứng chứ không import BACKUP_VERSION: nâng phiên bản là việc phải CỐ Ý, và
    // test này đỏ lên đúng lúc đó để nhớ kiểm cả nhánh nhập file bản cũ.
    expect(backup.version).toBe(12)
    expect(Array.isArray(backup.stockTrades)).toBe(true)

    await demoRepo.importAll(backup)
    const sau = await demoRepo.getStockTrades()
    expect(sau.length).toBe(backup.stockTrades?.length ?? 0)
  })

  it('thu dự kiến: chưa khai thì null, khai rồi thì đọc lại đúng số', async () => {
    expect(await demoRepo.getMonthPlan('2099-01')).toBeNull()
    await demoRepo.upsertMonthPlan('2099-01', 420_000)
    expect((await demoRepo.getMonthPlan('2099-01'))?.expected_income).toBe(420_000)
    // Khai lại là SỬA chứ không đẻ thêm dòng — unique(user_id, month_key).
    await demoRepo.upsertMonthPlan('2099-01', 800_000)
    expect((await demoRepo.getMonthPlan('2099-01'))?.expected_income).toBe(800_000)
    // Tháng khác không bị đụng tới.
    expect(await demoRepo.getMonthPlan('2099-02')).toBeNull()
  })

  it('thu dự kiến 0 là số THẬT (nghỉ không lương), khác hẳn chưa khai', async () => {
    await demoRepo.upsertMonthPlan('2099-03', 0)
    expect((await demoRepo.getMonthPlan('2099-03'))?.expected_income).toBe(0)
    // Bỏ đè là XOÁ dòng — một hành động riêng, không phải gõ số 0.
    await demoRepo.deleteMonthPlan('2099-03')
    expect(await demoRepo.getMonthPlan('2099-03')).toBeNull()
  })

  it('thu dự kiến không nhận số âm', async () => {
    // demoRepo không có CHECK của Postgres nên phải tự chặn — xem ghi chú trong hàm.
    await expect(demoRepo.upsertMonthPlan('2099-04', -1)).rejects.toThrow()
    expect(await demoRepo.getMonthPlan('2099-04')).toBeNull()
  })

  it('sao lưu/khôi phục mang theo thu dự kiến', async () => {
    await demoRepo.upsertMonthPlan('2099-05', 555_000)
    const backup = await demoRepo.exportAll()
    expect(backup.monthPlans?.some((p) => p.month_key === '2099-05')).toBe(true)

    await demoRepo.deleteMonthPlan('2099-05')
    await demoRepo.importAll(backup)
    expect((await demoRepo.getMonthPlan('2099-05'))?.expected_income).toBe(555_000)
  })

  it('khôi phục bản lưu cũ (chưa có monthPlans) không làm hỏng gì', async () => {
    const backup = await demoRepo.exportAll()
    // Bản lưu xuất trước migration 0041 — trường không tồn tại.
    delete backup.monthPlans
    await demoRepo.importAll(backup)
    expect(await demoRepo.getMonthPlan('2099-05')).toBeNull()
  })

  it('sao lưu/khôi phục mang theo Cách trình bày (density_pref)', async () => {
    // Cột của migration 0040. Đường khôi phục liệt kê TỪNG cột hồ sơ, nên một cột mới
    // rất dễ bị bỏ sót mà không ai thấy: khôi phục vẫn chạy, chỉ âm thầm về mặc định.
    await demoRepo.updateProfile({ density_pref: 'full' })
    const backup = await demoRepo.exportAll()
    expect(backup.profile.density_pref).toBe('full')

    await demoRepo.updateProfile({ density_pref: 'visual' })
    await demoRepo.importAll(backup)
    expect((await demoRepo.getProfile()).density_pref).toBe('full')
  })

  it('khôi phục bản lưu cũ (chưa có density_pref) thì về mặc định, không phải undefined', async () => {
    const backup = await demoRepo.exportAll()
    // Bản lưu xuất trước migration 0040 — trường không tồn tại.
    delete (backup.profile as { density_pref?: string }).density_pref
    await demoRepo.importAll(backup)
    expect((await demoRepo.getProfile()).density_pref).toBe('visual')
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

// getAccountBalances phải tự tính market_value cho tài khoản tự động theo dõi cổ
// phiếu (investment/VND có sổ lệnh) — dùng ĐÚNG các hàm thuần của holdings.ts, y hệt
// cách edge function stock-refresh tính, để demo không bịa ra một con số khác bản thật.
//
// Số đối chiếu tay cho seed 'Chứng khoán VN' (vốn gốc 100.000.000 ₫, không giao dịch
// nào khác chạm vào tài khoản này nên balance = 100.000.000 ₫ nguyên):
//   FPT: mua 500 cổ giá 62.000 + phí 46.500  -> costBasis 31.046.500, số cổ 500
//        thưởng 10% (+50 cổ, costBasis không đổi) -> số cổ 550
//   HPG: mua 1.000 cổ giá 21.000 + phí 31.500 -> costBasis 21.031.500, số cổ 1.000
//   tiền đã bỏ ra mua = 31.046.500 + 21.031.500 = 52.078.000 ₫
//   tiền còn chưa đầu tư (brokerCash) = 100.000.000 − 52.078.000 = 47.922.000 ₫
//   giá phiên 2026-08-05: FPT 70.300 ₫/cổ, HPG 22.000 ₫/cổ (đều có giá, không mã nào thiếu)
//   cổ phiếu theo giá hôm nay = 550×70.300 + 1.000×22.000 = 38.665.000 + 22.000.000 = 60.665.000 ₫
//   market_value = 60.665.000 + 47.922.000 = 108.587.000 ₫
describe('getAccountBalances — tự tính market_value cho tài khoản tự động theo dõi cổ phiếu (demo)', () => {
  const MARKET_VALUE_SEED = 108_587_000

  it('tài khoản seed có market_value = số tính tay từ sổ lệnh + bảng giá, không phải null', async () => {
    const acc = await taiKhoanChungKhoanVN()
    const balances = await demoRepo.getAccountBalances()
    const row = balances.find((b) => b.id === acc.id)
    expect(row?.market_value).toBe(MARKET_VALUE_SEED)
  })

  it('ghi thêm một lệnh mới thì market_value đổi theo (chứng minh số tính SỐNG, không phải seed một lần)', async () => {
    const acc = await taiKhoanChungKhoanVN()
    // Mua thêm VNM đúng giá phiên (58.600 ₫/cổ) nhưng có phí 5.000 ₫: tiền chưa đầu tư
    // giảm đúng (100 × 58.600 + 5.000), cổ phiếu tăng đúng 100 × 58.600 — phần phí
    // không đổi thành cổ phiếu nên tổng market_value giảm đúng bằng phí = 5.000 ₫.
    await demoRepo.createStockTrade({
      account_id: acc.id,
      symbol: 'VNM',
      kind: 'buy',
      traded_on: '2026-08-01',
      quantity: 100,
      price: 58_600,
      fee: 5_000,
      tax: 0,
      note: '',
    })
    const balances = await demoRepo.getAccountBalances()
    const row = balances.find((b) => b.id === acc.id)
    expect(row?.market_value).toBe(MARKET_VALUE_SEED - 5_000)
  })

  it('có định giá "manual" đúng ngày phiên (2026-08-05) thì số gõ tay thắng số tự tính', async () => {
    const acc = await taiKhoanChungKhoanVN()
    await demoRepo.upsertValuation({
      account_id: acc.id,
      valued_on: '2026-08-05',
      market_value: 999_000_000,
      note: 'Tôi tự chốt số khác',
    })
    const balances = await demoRepo.getAccountBalances()
    const row = balances.find((b) => b.id === acc.id)
    expect(row?.market_value).toBe(999_000_000)
  })

  it('có định giá "manual" ở ngày SAU phiên thì số đó thắng (mới hơn)', async () => {
    const acc = await taiKhoanChungKhoanVN()
    await demoRepo.upsertValuation({
      account_id: acc.id,
      valued_on: '2026-08-10',
      market_value: 777_000_000,
      note: 'Chốt cuối tuần',
    })
    const balances = await demoRepo.getAccountBalances()
    const row = balances.find((b) => b.id === acc.id)
    expect(row?.market_value).toBe(777_000_000)
  })

  it('sổ lệnh bán quá số đang giữ (oversold) -> market_value null, không bịa số sai', async () => {
    const acc = await demoRepo.createAccount(
      accountInput({ name: 'TK oversold', type: 'investment', currency: 'VND', initial_balance: 100_000_000 }),
    )
    // Bán 10 cổ FPT mà chưa từng mua -> holdingsFromTrades báo oversold.
    await demoRepo.createStockTrade({
      account_id: acc.id,
      symbol: 'FPT',
      kind: 'sell',
      traded_on: '2026-08-01',
      quantity: 10,
      price: 70_000,
      fee: 0,
      tax: 0,
      note: '',
    })
    const balances = await demoRepo.getAccountBalances()
    const row = balances.find((b) => b.id === acc.id)
    expect(row?.market_value).toBeNull()
  })

  it('mua nhiều hơn tiền đã nạp (brokerCash âm) -> market_value null', async () => {
    const acc = await demoRepo.createAccount(
      accountInput({ name: 'TK thiếu tiền', type: 'investment', currency: 'VND', initial_balance: 1_000_000 }),
    )
    // Mua 1.000 cổ giá 2.000 = 2.000.000 ₫, vượt vốn gốc 1.000.000 ₫ đã khai.
    await demoRepo.createStockTrade({
      account_id: acc.id,
      symbol: 'FPT',
      kind: 'buy',
      traded_on: '2026-08-01',
      quantity: 1_000,
      price: 2_000,
      fee: 0,
      tax: 0,
      note: '',
    })
    const balances = await demoRepo.getAccountBalances()
    const row = balances.find((b) => b.id === acc.id)
    expect(row?.market_value).toBeNull()
  })

  it('tài khoản KHÔNG phải investment thì không bị tự tính, dù có sổ lệnh gắn vào', async () => {
    const acc = await demoRepo.createAccount(
      accountInput({ name: 'TK ngân hàng có sổ lệnh lạc', type: 'bank', currency: 'VND', initial_balance: 100_000_000 }),
    )
    await demoRepo.createStockTrade({
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
    const balances = await demoRepo.getAccountBalances()
    const row = balances.find((b) => b.id === acc.id)
    expect(row?.market_value).toBeNull()
  })

  it('tài khoản investment nhưng KHÔNG phải VND thì không bị tự tính, dù có sổ lệnh gắn vào', async () => {
    const acc = await demoRepo.createAccount(
      accountInput({ name: 'TK đầu tư USD', type: 'investment', currency: 'USD', initial_balance: 100_000_000 }),
    )
    await demoRepo.createStockTrade({
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
    const balances = await demoRepo.getAccountBalances()
    const row = balances.find((b) => b.id === acc.id)
    expect(row?.market_value).toBeNull()
  })
})

async function taiKhoanNisa() {
  const accounts = await demoRepo.getAccounts()
  const acc = accounts.find((a) => a.name === 'NISA Rakuten')
  if (!acc) throw new Error('Seed thiếu tài khoản "NISA Rakuten" — test sổ lệnh quỹ cần đúng tài khoản này')
  return acc
}

// Số đối chiếu tay cho seed 'NISA Rakuten' (số dư sổ 0 — vốn gốc đến từ fund_trades,
// KHÔNG phải số dư sổ, nên market_value không được suy từ balance):
//   S&P500 (9I31223A): mua 28.429 口, amount 50.000 ¥
//     giá phiên 2026-08-10 = 20.053 ¥/1万口
//     giá trị = round(28.429 × 20.053 ÷ 10.000) = round(57.008,6737) = 57.009 ¥
//   NASDAQ-100 (9I314241): mua 12.595 口, amount 20.000 ¥
//     giá phiên 2026-08-10 = 18.855 ¥/1万口
//     giá trị = round(12.595 × 18.855 ÷ 10.000) = round(23.747,8725) = 23.748 ¥
//   market_value = 57.009 + 23.748 = 80.757 ¥   (khớp chú thích của seed fundTrades)
//   giá vốn = 50.000 + 20.000 = 70.000 ¥ ⇒ lời chưa bán +10.757 ¥
//
// Cả hai quỹ cùng nav_date 2026-08-10 nên không quỹ nào "giá lệch phiên cũ", và không quỹ
// nào thiếu giá — tức cron thật cũng sẽ ghi, nên demo phải ghi.
describe('getAccountBalances — tự tính market_value cho tài khoản quỹ Nhật (demo)', () => {
  const MARKET_VALUE_NISA = 80_757

  it('tài khoản NISA seed có market_value = số tính tay từ sổ lệnh quỹ + 基準価額, không phải null', async () => {
    const acc = await taiKhoanNisa()
    const balances = await demoRepo.getAccountBalances()
    const row = balances.find((b) => b.id === acc.id)
    // Trước đợt này là `null`: demo chỉ mô phỏng stock-refresh, nên NISA đứng ở số dư sổ
    // (0) trong Tổng tài sản trong khi khu danh mục quỹ hiện đủ 80.757 ¥.
    expect(row?.market_value).toBe(MARKET_VALUE_NISA)
  })

  it('thiếu 基準価額 của MỘT quỹ đang giữ thì bỏ qua cả tài khoản, không ghi số lệch', async () => {
    // Chốt này KHÔNG có ở bản cổ phiếu (bên đó chỉ bỏ khi thiếu giá MỌI mã). Giữ hai quỹ
    // mà mất giá một quỹ là lệch cỡ 40%, lại đóng dấu 'auto' trông như đúng.
    const acc = await taiKhoanNisa()
    await demoRepo.createFundTrade({
      account_id: acc.id,
      assoc_fund_cd: '0331418A', // quỹ KHÔNG có trong bảng giá seed
      kind: 'buy',
      traded_on: '2026-05-01',
      units: 10_000,
      nav: 21_000,
      amount: 21_000,
      bucket: 'NISA成長投資枠',
      note: '',
    })
    const balances = await demoRepo.getAccountBalances()
    const row = balances.find((b) => b.id === acc.id)
    expect(row?.market_value).toBeNull()
  })
})

describe('nhóm nhãn (migration 0039)', () => {
  it('tạo nhóm và đọc lại theo sort_order', async () => {
    const a = await demoRepo.createTagGroup({ name: 'Với ai?' })
    const b = await demoRepo.createTagGroup({ name: 'Ở đâu?' })
    const list = await demoRepo.getTagGroups()
    expect(list.map((g) => g.name)).toEqual(['Với ai?', 'Ở đâu?'])
    expect(a.sort_order).toBeLessThan(b.sort_order)
  })

  it('chặn trùng tên nhóm — Postgres có unique(user_id, name), demo phải tự làm', async () => {
    await demoRepo.createTagGroup({ name: 'Với ai?' })
    await expect(demoRepo.createTagGroup({ name: 'Với ai?' })).rejects.toThrow('đã tồn tại')
  })

  it('chặn trùng tên khi ĐỔI TÊN nhóm', async () => {
    await demoRepo.createTagGroup({ name: 'Với ai?' })
    const b = await demoRepo.createTagGroup({ name: 'Ở đâu?' })
    await expect(demoRepo.updateTagGroup(b.id, { name: 'Với ai?' })).rejects.toThrow('đã tồn tại')
  })

  it('cắt khoảng trắng thừa ở tên nhóm', async () => {
    const g = await demoRepo.createTagGroup({ name: '  Với ai?  ' })
    expect(g.name).toBe('Với ai?')
  })

  it('tạo nhãn kèm nhóm; nhãn không khai nhóm thì group_id = null', async () => {
    const g = await demoRepo.createTagGroup({ name: 'Với ai?' })
    const withGroup = await demoRepo.createTag({ name: 'Người yêu', color: 'pink', group_id: g.id })
    const without = await demoRepo.createTag({ name: 'Về VN 2026', color: 'sky' })
    expect(withGroup.group_id).toBe(g.id)
    expect(without.group_id).toBeNull()
  })

  it('xoá nhóm THẢ nhãn ra chứ không xoá nhãn, và giữ nguyên liên kết giao dịch', async () => {
    const g = await demoRepo.createTagGroup({ name: 'Ở đâu?' })
    const tag = await demoRepo.createTag({ name: 'Tokyo', color: 'sky', group_id: g.id })
    const acc = await demoRepo.createAccount(accountInput())
    const cat = (await demoRepo.getCategories()).find((c) => c.type === 'expense')!
    const tx = await demoRepo.createTransaction(expenseTx(acc.id, cat.id))
    await demoRepo.setTransactionTags(tx.id, [tag.id])

    await demoRepo.deleteTagGroup(g.id)

    const tags = await demoRepo.getTags()
    expect(tags.map((t) => t.name)).toContain('Tokyo')
    expect(tags.find((t) => t.id === tag.id)?.group_id).toBeNull()
    expect(await demoRepo.getTransactionTags()).toHaveLength(1)
  })

  it('db demo cũ (chưa có cột group_id) đọc ra null chứ không undefined', async () => {
    const tag = await demoRepo.createTag({ name: 'Cũ', color: 'gray' })
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
    for (const t of raw.tags) delete t.group_id
    localStorage.setItem(STORAGE_KEY, JSON.stringify(raw))
    const back = (await demoRepo.getTags()).find((t) => t.id === tag.id)!
    expect(back.group_id).toBeNull()
  })
})

// Nhãn cho quy tắc định kỳ (migration 0042). Cả chuỗi phải chạy được trong bản demo,
// vì đó là bản duy nhất kiểm được không cần mạng.
describe('demoRepo: nhãn của quy tắc định kỳ', () => {
  async function dungQuyTacCoNhan() {
    const [acc] = await demoRepo.getAccounts()
    const cats = await demoRepo.getCategories()
    const cat = cats.find((c) => c.type === 'expense' && !c.parent_id)!
    const nha = await demoRepo.createTag({ name: `Nhà ${Math.random()}`, color: 'sky' })
    const xe = await demoRepo.createTag({ name: `Xe ${Math.random()}`, color: 'amber' })
    const rule = await demoRepo.createRecurringRule({
      type: 'expense',
      amount: 68_000,
      to_amount: null,
      category_id: cat.id,
      account_id: acc.id,
      to_account_id: null,
      note: 'Tiền nhà',
      frequency: 'monthly',
      start_on: '2026-08-01',
      end_on: null,
      tag_ids: [nha.id, xe.id],
    })
    return { rule, nha, xe }
  }

  it('tạo quy tắc kèm nhãn thì đọc lại đúng hai nhãn', async () => {
    const { rule, nha, xe } = await dungQuyTacCoNhan()
    const links = (await demoRepo.listRecurringRuleTags()).filter((l) => l.rule_id === rule.id)
    expect(links.map((l) => l.tag_id).sort()).toEqual([nha.id, xe.id].sort())
  })

  // Đây là điểm chính của cả tính năng: nhãn phải đi xuống từng kỳ engine sinh ra.
  it('giao dịch do quy tắc sinh mang đúng nhãn của quy tắc', async () => {
    const { rule, nha, xe } = await dungQuyTacCoNhan()
    const ok = await demoRepo.insertRecurringOccurrence({
      type: 'expense',
      amount: 68_000,
      to_amount: null,
      category_id: rule.category_id,
      account_id: rule.account_id,
      to_account_id: null,
      occurred_on: '2026-09-01',
      note: 'Tiền nhà',
      recurring_rule_id: rule.id,
    })
    expect(ok).toBe(true)
    const tx = (await demoRepo.listTransactions({ start: '2026-09-01', end: '2026-09-02' })).find(
      (t) => t.recurring_rule_id === rule.id,
    )!
    const gan = (await demoRepo.getTransactionTags()).filter((l) => l.transaction_id === tx.id)
    expect(gan.map((l) => l.tag_id).sort()).toEqual([nha.id, xe.id].sort())
  })

  it('sửa nhãn của quy tắc: bỏ trống thì không đụng, mảng rỗng thì bỏ hết', async () => {
    const { rule, nha } = await dungQuyTacCoNhan()
    await demoRepo.updateRecurringRule(rule.id, { amount: 70_000 })
    expect(
      (await demoRepo.listRecurringRuleTags()).filter((l) => l.rule_id === rule.id).length,
    ).toBe(2)

    await demoRepo.updateRecurringRule(rule.id, { tag_ids: [nha.id] })
    expect(
      (await demoRepo.listRecurringRuleTags()).filter((l) => l.rule_id === rule.id).map((l) => l.tag_id),
    ).toEqual([nha.id])

    await demoRepo.updateRecurringRule(rule.id, { tag_ids: [] })
    expect(
      (await demoRepo.listRecurringRuleTags()).filter((l) => l.rule_id === rule.id).length,
    ).toBe(0)
  })

  it('xóa quy tắc thì liên kết nhãn biến mất theo (Postgres có cascade)', async () => {
    const { rule } = await dungQuyTacCoNhan()
    await demoRepo.deleteRecurringRule(rule.id)
    expect(
      (await demoRepo.listRecurringRuleTags()).filter((l) => l.rule_id === rule.id).length,
    ).toBe(0)
  })

  it('sao lưu mang theo liên kết nhãn của quy tắc', async () => {
    const { rule } = await dungQuyTacCoNhan()
    const backup = await demoRepo.exportAll()
    expect(backup.recurringRuleTags?.some((l) => l.rule_id === rule.id)).toBe(true)
    await demoRepo.importAll(backup)
    expect(
      (await demoRepo.listRecurringRuleTags()).filter((l) => l.rule_id === rule.id).length,
    ).toBe(2)
  })
})

// Nhãn cho khoản sắp chi (migration 0044) + sao lưu mang theo chính khoản sắp chi
// (trước v11 thì không, nên Khôi phục là mất sạch lời nhắc).
describe('demoRepo: nhãn của khoản sắp chi', () => {
  async function dungLoiNhacCoNhan() {
    const con = await demoRepo.createTag({ name: `Con ${Math.random()}`, color: 'pink' })
    const pe = await demoRepo.createPlannedExpense({
      title: 'Tiền học cho con',
      amount: 45_000,
      currency: 'JPY',
      due_on: '2026-09-10',
      tag_ids: [con.id],
    })
    return { pe, con }
  }

  it('tạo lời nhắc kèm nhãn thì đọc lại đúng nhãn', async () => {
    const { pe, con } = await dungLoiNhacCoNhan()
    const links = (await demoRepo.listPlannedExpenseTags()).filter((l) => l.planned_id === pe.id)
    expect(links.map((l) => l.tag_id)).toEqual([con.id])
  })

  it('sửa: bỏ trống tag_ids thì không đụng, mảng rỗng thì bỏ hết', async () => {
    const { pe } = await dungLoiNhacCoNhan()
    await demoRepo.updatePlannedExpense(pe.id, { amount: 50_000 })
    expect(
      (await demoRepo.listPlannedExpenseTags()).filter((l) => l.planned_id === pe.id).length,
    ).toBe(1)
    await demoRepo.updatePlannedExpense(pe.id, { tag_ids: [] })
    expect(
      (await demoRepo.listPlannedExpenseTags()).filter((l) => l.planned_id === pe.id).length,
    ).toBe(0)
  })

  it('xóa lời nhắc thì liên kết nhãn biến mất theo', async () => {
    const { pe } = await dungLoiNhacCoNhan()
    await demoRepo.deletePlannedExpense(pe.id)
    expect(
      (await demoRepo.listPlannedExpenseTags()).filter((l) => l.planned_id === pe.id).length,
    ).toBe(0)
  })

  it('sao lưu mang theo cả lời nhắc lẫn nhãn của nó, khôi phục lại đủ', async () => {
    const { pe } = await dungLoiNhacCoNhan()
    const backup = await demoRepo.exportAll()
    expect(backup.plannedExpenses?.some((p) => p.id === pe.id)).toBe(true)
    expect(backup.plannedExpenseTags?.some((l) => l.planned_id === pe.id)).toBe(true)

    await demoRepo.importAll(backup)
    expect((await demoRepo.getPlannedExpenses()).some((p) => p.id === pe.id)).toBe(true)
    expect(
      (await demoRepo.listPlannedExpenseTags()).filter((l) => l.planned_id === pe.id).length,
    ).toBe(1)
  })
})

describe('demoRepo: xoaPhieuLuong (Task 8)', () => {
  // Bản demo không có tài khoản Yucho Bank thật (listYuchoIncome/listDauPhieuLuong
  // đã rỗng sẵn vì lý do đó) — nút "Xoá mọi dòng phiếu lương" ở demo phải là phép
  // no-op an toàn, không phải throw hay xoá nhầm dữ liệu demo khác.
  it('luôn trả về 0, và dòng mang dấu 給与 vẫn còn nguyên sau đó', async () => {
    const cat = await demoRepo.createCategory({ name: 'Thu khác', type: 'income', icon: '💰' })
    const tx = await demoRepo.createTransaction({
      type: 'income',
      amount: 1000,
      to_amount: null,
      category_id: cat.id,
      account_id: (await demoRepo.getAccounts())[0].id,
      to_account_id: null,
      occurred_on: '2026-08-01',
      note: '給与 2026/08K · phần bị giữ lại',
    })

    expect(await demoRepo.xoaPhieuLuong()).toEqual({ dong: 0, neo: 0, traNo: 0 })

    // Phai doc lai — chi kiem tra gia tri tra ve khong bat duoc mot ham xoa het
    // roi van tra ve 0 (vd do dem sai). Neu demoRepo.xoaPhieuLuong tung bi doi
    // thanh xoa that theo dau, dong nay bien mat va assertion duoi day do do.
    const con = await demoRepo.listTransactions({ start: '2026-08-01', end: '2026-08-02' })
    expect(con.map((t) => t.id)).toContain(tx.id)
  })
})

describe('debts.origin + income_category_id (0049)', () => {
  it('createDebt luu duoc origin earned kem danh muc thu', async () => {
    const cat = await demoRepo.createCategory({
      name: 'Làm thêm',
      type: 'income',
      icon: '💵',
      parent_id: null,
    })
    const debt = await demoRepo.createDebt({
      counterparty: 'Khách A',
      direction: 'owed_to_me',
      currency: 'JPY',
      principal: 30_000,
      due_on: null,
      note: '',
      origin: 'earned',
      income_category_id: cat.id,
      transaction: null,
    })
    expect(debt.origin).toBe('earned')
    expect(debt.income_category_id).toBe(cat.id)
    // Khong co dong nao roi vi: khong sinh giao dich giai ngan nao.
    expect(debt.disbursement_transaction_id).toBeNull()
  })

  it('khong truyen gi thi hai cot la null — duong cu khong doi', async () => {
    const debt = await demoRepo.createDebt({
      counterparty: 'Anh Hai',
      direction: 'owed_to_me',
      currency: 'JPY',
      principal: 50_000,
      due_on: null,
      note: '',
      transaction: null,
    })
    expect(debt.origin).toBeNull()
    expect(debt.income_category_id).toBeNull()
  })
})

describe('khach tra tien cong → THU that (0049)', () => {
  it('lan tra cua khoan earned khong mang co no, va vao danh muc cua khoan no', async () => {
    const acc = await demoRepo.createAccount(accountInput())
    const catThu = await demoRepo.createCategory({
      name: 'Làm thêm',
      type: 'income',
      icon: '💵',
      parent_id: null,
    })
    const debt = await demoRepo.createDebt({
      counterparty: 'Khách A',
      direction: 'owed_to_me',
      currency: 'JPY',
      principal: 30_000,
      due_on: null,
      note: '',
      origin: 'earned',
      income_category_id: catThu.id,
      transaction: null,
    })
    await demoRepo.createDebtPayment({
      debt_id: debt.id,
      amount: 10_000,
      paid_on: '2026-08-20',
      note: '',
      transaction: {
        type: 'income',
        amount: 10_000,
        to_amount: null,
        category_id: 'cat-tu-gan-cua-dong-tien-no',
        account_id: acc.id,
        to_account_id: null,
        occurred_on: '2026-08-20',
        note: '',
        tag_ids: [],
      },
    })
    const paid = (
      await demoRepo.listTransactions({ start: '2026-08-20', end: '2026-08-21' })
    ).find((t) => t.amount === 10_000)
    expect(paid?.is_debt_flow).toBe(false)
    expect(paid?.category_id).toBe(catThu.id)
  })

  it('lan tra cua khoan no thuong van mang co no — duong cu khong doi', async () => {
    const acc = await demoRepo.createAccount(accountInput())
    const debt = await demoRepo.createDebt({
      counterparty: 'Anh Hai',
      direction: 'owed_to_me',
      currency: 'JPY',
      principal: 50_000,
      due_on: null,
      note: '',
      transaction: null,
    })
    await demoRepo.createDebtPayment({
      debt_id: debt.id,
      amount: 20_000,
      paid_on: '2026-08-20',
      note: '',
      transaction: {
        type: 'income',
        amount: 20_000,
        to_amount: null,
        category_id: 'cat-no',
        account_id: acc.id,
        to_account_id: null,
        occurred_on: '2026-08-20',
        note: '',
        tag_ids: [],
      },
    })
    const paid = (
      await demoRepo.listTransactions({ start: '2026-08-20', end: '2026-08-21' })
    ).find((t) => t.amount === 20_000)
    expect(paid?.is_debt_flow).toBe(true)
    expect(paid?.category_id).toBe('cat-no')
  })
})

describe('lệnh cổ phiếu kéo theo dòng tiền khi đã khai ví', () => {
  const KHOANG = { start: '2026-08-01', end: '2026-09-01' }

  async function dungHaiTaiKhoan() {
    const nganHang = await demoRepo.createAccount(
      accountInput({
        name: 'Ngân hàng VN',
        type: 'bank',
        currency: 'VND',
        initial_balance: 50_000_000,
      }),
    )
    const chungKhoan = await demoRepo.createAccount(
      accountInput({
        name: 'iDragon',
        type: 'investment',
        currency: 'VND',
        initial_balance: 0,
        cash_account_id: nganHang.id,
      }),
    )
    return { nganHang, chungKhoan }
  }

  function lenhMua(accountId: string) {
    return {
      account_id: accountId,
      symbol: 'VNM',
      kind: 'buy' as const,
      traded_on: '2026-08-20',
      quantity: 100,
      price: 50_000,
      fee: 7_500,
      tax: 0,
      note: '',
    }
  }

  async function dongTienCuaLenh(tradeId: string) {
    return (await demoRepo.listTransactions(KHOANG)).filter((t) => t.stock_trade_id === tradeId)
  }

  it('ghi lệnh mua → sinh một chuyển khoản từ ngân hàng sang chứng khoán', async () => {
    const { nganHang, chungKhoan } = await dungHaiTaiKhoan()
    const trade = await demoRepo.createStockTrade(lenhMua(chungKhoan.id))

    const sinhRa = await dongTienCuaLenh(trade.id)
    expect(sinhRa).toHaveLength(1)
    expect(sinhRa[0].type).toBe('transfer')
    expect(sinhRa[0].amount).toBe(5_007_500)
    expect(sinhRa[0].account_id).toBe(nganHang.id)
    expect(sinhRa[0].to_account_id).toBe(chungKhoan.id)
    expect(sinhRa[0].note).toBe('Mua 100 VNM')
  })

  it('số dư ngân hàng giảm đúng bằng tiền đã mua, tiền chưa mua hết âm', async () => {
    const { nganHang, chungKhoan } = await dungHaiTaiKhoan()
    await demoRepo.createStockTrade(lenhMua(chungKhoan.id))

    const balances = await demoRepo.getAccountBalances()
    expect(balances.find((b) => b.id === nganHang.id)?.balance).toBe(50_000_000 - 5_007_500)
    // Số dư sổ của tài khoản chứng khoán = đúng tiền đã bỏ ra → brokerCash ra 0, không âm.
    expect(balances.find((b) => b.id === chungKhoan.id)?.balance).toBe(5_007_500)
  })

  it('sửa số lượng lệnh → dòng tiền sửa theo, vẫn đúng một dòng', async () => {
    const { chungKhoan } = await dungHaiTaiKhoan()
    const trade = await demoRepo.createStockTrade(lenhMua(chungKhoan.id))
    await demoRepo.updateStockTrade(trade.id, { quantity: 200 })

    const sinhRa = await dongTienCuaLenh(trade.id)
    expect(sinhRa).toHaveLength(1)
    expect(sinhRa[0].amount).toBe(200 * 50_000 + 7_500)
  })

  it('đổi lệnh mua thành điều chỉnh → dòng tiền biến mất', async () => {
    const { chungKhoan } = await dungHaiTaiKhoan()
    const trade = await demoRepo.createStockTrade(lenhMua(chungKhoan.id))
    await demoRepo.updateStockTrade(trade.id, { kind: 'adjust', price: 0, fee: 0, tax: 0 })

    expect(await dongTienCuaLenh(trade.id)).toEqual([])
  })

  it('xoá lệnh → dòng tiền đi theo (khớp on delete cascade của Postgres)', async () => {
    const { chungKhoan } = await dungHaiTaiKhoan()
    const trade = await demoRepo.createStockTrade(lenhMua(chungKhoan.id))
    await demoRepo.deleteStockTrade(trade.id)

    expect(await dongTienCuaLenh(trade.id)).toEqual([])
  })

  it('chưa khai ví → không sinh dòng tiền nào, y như trước', async () => {
    const chungKhoan = await demoRepo.createAccount(
      accountInput({ name: 'iDragon', type: 'investment', currency: 'VND', initial_balance: 0 }),
    )
    const trade = await demoRepo.createStockTrade(lenhMua(chungKhoan.id))

    expect(await dongTienCuaLenh(trade.id)).toEqual([])
  })
  it('lệnh ghi TRƯỚC khi khai ví được đếm là thiếu, và ghi bù đúng ngày của lệnh', async () => {
    const nganHang = await demoRepo.createAccount(
      accountInput({
        name: 'Ngân hàng VN',
        type: 'bank',
        currency: 'VND',
        initial_balance: 50_000_000,
      }),
    )
    const chungKhoan = await demoRepo.createAccount(
      accountInput({ name: 'iDragon', type: 'investment', currency: 'VND', initial_balance: 0 }),
    )
    const trade = await demoRepo.createStockTrade(lenhMua(chungKhoan.id))
    // Chưa khai ví thì không thiếu gì — app không đoán hộ tiền đi ra từ đâu.
    expect(await demoRepo.countStockTradesWithoutTransfer()).toBe(0)

    await demoRepo.updateAccount(chungKhoan.id, { cash_account_id: nganHang.id })
    expect(await demoRepo.countStockTradesWithoutTransfer()).toBe(1)

    expect(await demoRepo.backfillStockTradeTransfers()).toBe(1)
    const sinhRa = await dongTienCuaLenh(trade.id)
    expect(sinhRa).toHaveLength(1)
    expect(sinhRa[0].occurred_on).toBe('2026-08-20')
    expect(await demoRepo.countStockTradesWithoutTransfer()).toBe(0)
  })

  it('ghi bù lần hai không đẻ dòng thứ hai', async () => {
    const { chungKhoan } = await dungHaiTaiKhoan()
    await demoRepo.createStockTrade(lenhMua(chungKhoan.id))
    expect(await demoRepo.countStockTradesWithoutTransfer()).toBe(0)
    expect(await demoRepo.backfillStockTradeTransfers()).toBe(0)

    // Lọc theo `stock_trade_id`: dữ liệu demo có sẵn chuyển khoản của riêng nó.
    const txs = await demoRepo.listTransactions(KHOANG)
    expect(txs.filter((t) => t.stock_trade_id)).toHaveLength(1)
  })
})

describe('relatives + listBenefitTransactions (0056)', () => {
  it('seed có hai người thân, một lần gửi chưa gán', async () => {
    const rel = await demoRepo.getRelatives()
    expect(rel.map((r) => r.name)).toEqual(['Mẹ', 'Em Hùng'])
    const txs = await demoRepo.listBenefitTransactions(
      { start: '2000-01-01', end: '2100-01-01' },
      { categoryIds: [], toAccountIds: [] },
    )
    expect(txs.every((t) => t.is_remittance)).toBe(true)
    expect(txs.filter((t) => t.remit_recipient_id == null).length).toBe(1)
  })
  it('createRelative mặc định country VN, updateRelative đổi tên', async () => {
    const r = await demoRepo.createRelative({ name: 'Bà', birth_year: 1940, relationship: 'grandparent' })
    expect(r.country).toBe('VN')
    const u = await demoRepo.updateRelative(r.id, { name: 'Bà ngoại' })
    expect(u.name).toBe('Bà ngoại')
  })
  it('listBenefitTransactions gộp OR ba nhánh', async () => {
    const accounts = await demoRepo.getAccounts()
    const nisa = accounts.find((a) => a.name === 'NISA Rakuten')!
    const txs = await demoRepo.listBenefitTransactions(
      { start: '2000-01-01', end: '2100-01-01' },
      { categoryIds: [], toAccountIds: [nisa.id] },
    )
    expect(txs.some((t) => t.to_account_id === nisa.id)).toBe(true)
    expect(txs.some((t) => t.is_remittance)).toBe(true)
  })
})

describe('trips (migration 0058)', () => {
  it('create → list → delete tròn vòng', async () => {
    const t = await demoRepo.createTrip({ start_on: '2026-02-16', end_on: '2026-02-22' })
    expect(t.dismissed).toBe(false)
    expect(t.country).toBe('VN')
    expect(t.label).toBe('')
    const all = await demoRepo.listTrips()
    expect(all.map((x) => x.id)).toContain(t.id)
    await demoRepo.deleteTrip(t.id)
    expect((await demoRepo.listTrips()).map((x) => x.id)).not.toContain(t.id)
  })

  it('dismissed lưu được — trí nhớ "đã hỏi, không phải chuyến đi"', async () => {
    const t = await demoRepo.createTrip({
      start_on: '2026-03-01',
      end_on: '2026-03-05',
      dismissed: true,
    })
    expect(t.dismissed).toBe(true)
  })

  it('list sắp theo start_on tăng dần', async () => {
    await demoRepo.createTrip({ start_on: '2026-05-01', end_on: '2026-05-03' })
    await demoRepo.createTrip({ start_on: '2026-01-01', end_on: '2026-01-03' })
    const all = await demoRepo.listTrips()
    const starts = all.map((t) => t.start_on)
    expect(starts).toEqual([...starts].sort())
  })
})
