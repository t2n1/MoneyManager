import { describe, expect, it } from 'vitest'
import type { DebtPaymentRow, DebtRow, TransactionRow } from '../../types/database.types'
import type { NewDebt, NewDebtPayment } from '../../data'
import { saveSplit } from './roleSave'
import type { RoleBase, RoleSaveDeps } from './roleSave'
import { initialSplit } from './entryRoles'

/**
 * Trả hộ cùng một người đã cho vay trước đó phải CỘNG DỒN vào khoản đang mở
 * (ghi debt_payments amount ÂM = giải ngân thêm), KHÔNG tạo người trùng tên mới.
 */

function makeDeps(debts: DebtRow[]) {
  const calls = {
    createTransaction: [] as unknown[],
    createDebt: [] as NewDebt[],
    createDebtPayment: [] as NewDebtPayment[],
  }
  const deps: RoleSaveDeps = {
    createTransaction: async (input) => {
      calls.createTransaction.push(input)
      return { id: `tx-${calls.createTransaction.length}` } as TransactionRow
    },
    createDebt: async (input) => {
      calls.createDebt.push(input)
      return { id: `debt-new` } as DebtRow
    },
    createDebtPayment: async (input) => {
      calls.createDebtPayment.push(input)
      return { id: `pay-${calls.createDebtPayment.length}` } as DebtPaymentRow
    },
    deleteTransaction: async () => undefined,
    createCategory: async () => ({ id: 'cat' }) as never,
    categories: [],
    debts,
  }
  return { deps, calls }
}

const openLoan = (over: Partial<DebtRow> = {}): DebtRow =>
  ({
    id: 'debt-a',
    counterparty: 'An',
    direction: 'owed_to_me',
    currency: 'JPY',
    principal: 3000,
    status: 'open',
    ...over,
  }) as DebtRow

const base: RoleBase = {
  amount: 5000,
  accountId: 'acc-1',
  categoryId: 'cat-1',
  srcCurrency: 'JPY',
  occurredOn: '2026-07-23',
  note: '',
}

describe('saveSplit — cộng dồn Trả hộ vào khoản cho vay đang mở', () => {
  it('chọn người cũ (existingDebtId) → ghi payment âm, không tạo khoản mới', async () => {
    const { deps, calls } = makeDeps([openLoan()])
    await saveSplit(base, { ...initialSplit(), others: 2000, counterparty: 'An', existingDebtId: 'debt-a' }, deps)

    expect(calls.createDebt).toHaveLength(0)
    expect(calls.createDebtPayment).toHaveLength(1)
    expect(calls.createDebtPayment[0]).toMatchObject({ debt_id: 'debt-a', amount: -2000 })
    // 1 chi phần mình (5000-2000) + 1 giao dịch giải ngân thêm gắn trong payment.
    expect(calls.createTransaction).toHaveLength(1)
    expect(calls.createDebtPayment[0].transaction).toMatchObject({ type: 'expense', amount: 2000 })
  })

  it('gõ trùng tên khoản đang mở (không bấm chip) → vẫn cộng dồn', async () => {
    const { deps, calls } = makeDeps([openLoan({ counterparty: 'An' })])
    await saveSplit(base, { ...initialSplit(), others: 2000, counterparty: '  an  ' }, deps)

    expect(calls.createDebt).toHaveLength(0)
    expect(calls.createDebtPayment[0]).toMatchObject({ debt_id: 'debt-a', amount: -2000 })
  })

  it('người mới → tạo khoản cho vay mới, không ghi payment', async () => {
    const { deps, calls } = makeDeps([openLoan({ counterparty: 'An' })])
    await saveSplit(base, { ...initialSplit(), others: 2000, counterparty: 'Bình' }, deps)

    expect(calls.createDebtPayment).toHaveLength(0)
    expect(calls.createDebt).toHaveLength(1)
    expect(calls.createDebt[0]).toMatchObject({ counterparty: 'Bình', direction: 'owed_to_me', principal: 2000 })
  })

  it('không cộng dồn xuyên loại tiền (khoản JPY, tài khoản USD)', async () => {
    const { deps, calls } = makeDeps([openLoan({ counterparty: 'An', currency: 'JPY' })])
    await saveSplit({ ...base, srcCurrency: 'USD' }, { ...initialSplit(), others: 20, counterparty: 'An' }, deps)

    expect(calls.createDebtPayment).toHaveLength(0)
    expect(calls.createDebt[0]).toMatchObject({ currency: 'USD', principal: 20 })
  })
})
