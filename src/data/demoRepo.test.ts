import { beforeEach, describe, expect, it } from 'vitest'
import { demoRepo, resetDemoData } from './demoRepo'
import type { NewAccount, NewTransaction } from './repo'

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
})
