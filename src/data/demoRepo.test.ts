import { beforeEach, describe, expect, it } from 'vitest'
import { demoRepo, resetDemoData } from './demoRepo'
import type { NewAccount, NewRecurringRule, NewTransaction } from './repo'

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

describe('trạng thái thông báo', () => {
  it('đánh dấu đã đọc rồi đọc lại thấy read_at', async () => {
    await demoRepo.markNotificationsRead(['budget-over:cat-1', 'stale-entry:2026-W31'])
    const rows = await demoRepo.getNotificationState()
    const over = rows.find((r) => r.key === 'budget-over:cat-1')
    expect(over?.read_at).toBeTruthy()
    expect(over?.dismissed_at).toBeNull()
  })

  it('đánh dấu đã đọc hai lần không tạo dòng trùng', async () => {
    await demoRepo.markNotificationsRead(['budget-over:cat-2'])
    await demoRepo.markNotificationsRead(['budget-over:cat-2'])
    const rows = await demoRepo.getNotificationState()
    expect(rows.filter((r) => r.key === 'budget-over:cat-2')).toHaveLength(1)
  })

  it('tắt một tin thì có dismissed_at', async () => {
    await demoRepo.dismissNotification('recurring-suggestion:abc')
    const rows = await demoRepo.getNotificationState()
    expect(rows.find((r) => r.key === 'recurring-suggestion:abc')?.dismissed_at).toBeTruthy()
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
    const raw = localStorage.getItem('sct-demo-db-v14')
    const db = JSON.parse(raw ?? '{}') as { fxHistory?: { on_date: string; rates: Record<string, number> }[] }
    const same = (db.fxHistory ?? []).filter((r) => r.on_date === '2026-07-28')
    expect(same).toHaveLength(1)
    expect(same[0].rates.VND).toBe(172)
  })
})
