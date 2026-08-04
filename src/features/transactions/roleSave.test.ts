import { describe, expect, it } from 'vitest'
import type {
  CategoryRow,
  DebtPaymentRow,
  DebtRow,
  TransactionRow,
} from '../../types/database.types'
import type { NewCategory, NewDebt, NewDebtPayment, NewTransaction } from '../../data'
import { saveDebtEntry, saveSplit, saveWithFee } from './roleSave'
import type { RoleBase, RoleSaveDeps } from './roleSave'
import { initialDebt, initialSplit } from './entryRoles'

/**
 * Trả hộ cùng một người đã cho vay trước đó phải CỘNG DỒN vào khoản đang mở
 * (ghi debt_payments amount ÂM = giải ngân thêm), KHÔNG tạo người trùng tên mới.
 */

function makeDeps(debts: DebtRow[], categories: RoleSaveDeps['categories'] = []) {
  const calls = {
    createTransaction: [] as NewTransaction[],
    createDebt: [] as NewDebt[],
    createDebtPayment: [] as NewDebtPayment[],
    deleteTransaction: [] as string[],
    createCategory: [] as NewCategory[],
  }
  /** Tên giao dịch nào sẽ ném lỗi khi tạo — để thử nhánh hoàn tác. */
  let failOn: ((input: NewTransaction) => boolean) | null = null
  const deps: RoleSaveDeps = {
    createTransaction: async (input) => {
      if (failOn?.(input)) throw new Error('bùm')
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
    deleteTransaction: async (id) => {
      calls.deleteTransaction.push(id)
      return undefined
    },
    createCategory: async (input) => {
      calls.createCategory.push(input)
      return { id: 'cat-moi' } as CategoryRow
    },
    categories,
    debts,
  }
  return { deps, calls, setFailOn: (f: (input: NewTransaction) => boolean) => (failOn = f) }
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

/** Trả hộ còn nợ (settle='later') — nhánh cũ: luôn có khoản cho vay. */
const later = () => ({ ...initialSplit(), settle: 'later' as const })

describe('saveSplit — cộng dồn Trả hộ vào khoản cho vay đang mở', () => {
  it('chọn người cũ (existingDebtId) → ghi payment âm, không tạo khoản mới', async () => {
    const { deps, calls } = makeDeps([openLoan()])
    await saveSplit(base, { ...later(), others: 2000, counterparty: 'An', existingDebtId: 'debt-a' }, deps)

    expect(calls.createDebt).toHaveLength(0)
    expect(calls.createDebtPayment).toHaveLength(1)
    expect(calls.createDebtPayment[0]).toMatchObject({ debt_id: 'debt-a', amount: -2000 })
    // 1 chi phần mình (5000-2000) + 1 giao dịch giải ngân thêm gắn trong payment.
    expect(calls.createTransaction).toHaveLength(1)
    expect(calls.createTransaction[0]).toMatchObject({ type: 'expense', amount: 3000 })
    expect(calls.createDebtPayment[0].transaction).toMatchObject({ type: 'expense', amount: 2000 })
  })

  it('gõ trùng tên khoản đang mở (không bấm chip) → vẫn cộng dồn', async () => {
    const { deps, calls } = makeDeps([openLoan({ counterparty: 'An' })])
    await saveSplit(base, { ...later(), others: 2000, counterparty: '  an  ' }, deps)

    expect(calls.createDebt).toHaveLength(0)
    expect(calls.createDebtPayment[0]).toMatchObject({ debt_id: 'debt-a', amount: -2000 })
  })

  it('người mới → tạo khoản cho vay mới, không ghi payment', async () => {
    const { deps, calls } = makeDeps([openLoan({ counterparty: 'An' })])
    await saveSplit(base, { ...later(), others: 2000, counterparty: 'Bình' }, deps)

    expect(calls.createDebtPayment).toHaveLength(0)
    expect(calls.createDebt).toHaveLength(1)
    expect(calls.createDebt[0]).toMatchObject({ counterparty: 'Bình', direction: 'owed_to_me', principal: 2000 })
  })

  it('không cộng dồn xuyên loại tiền (khoản JPY, tài khoản USD)', async () => {
    const { deps, calls } = makeDeps([openLoan({ counterparty: 'An', currency: 'JPY' })])
    await saveSplit({ ...base, srcCurrency: 'USD' }, { ...later(), others: 20, counterparty: 'An' }, deps)

    expect(calls.createDebtPayment).toHaveLength(0)
    expect(calls.createDebt[0]).toMatchObject({ currency: 'USD', principal: 20 })
  })
})

/**
 * Trả hộ đã hoàn tiền NGAY (settle='now'): không có khoản nợ nào được tạo. Tài khoản
 * đã trả phải trừ đủ TỔNG (khớp sao kê thẻ + số tự trả thẻ cuối kỳ), phần người kia
 * hoàn lại đi vào ví nhận bằng một chuyển khoản — nên Chi báo cáo chỉ là phần của mình.
 */
describe('saveSplit — đã trả lại ngay (settle=now)', () => {
  const now = (over: Partial<ReturnType<typeof initialSplit>> = {}) => ({
    ...initialSplit(),
    others: 3000,
    counterparty: 'An',
    ...over,
  })

  it('hoàn vào ví KHÁC → chi phần mình + chuyển khoản phần người kia, không tạo nợ', async () => {
    const { deps, calls } = makeDeps([])
    await saveSplit(base, now({ receivedAccountId: 'acc-cash' }), deps)

    expect(calls.createDebt).toHaveLength(0)
    expect(calls.createDebtPayment).toHaveLength(0)
    expect(calls.createTransaction).toHaveLength(2)
    expect(calls.createTransaction[0]).toMatchObject({
      type: 'expense',
      amount: 2000, // 5000 − 3000
      account_id: 'acc-1',
      category_id: 'cat-1',
      occurred_on: '2026-07-23',
      note: 'Chia bill · An',
    })
    // Chuyển khoản: rời tài khoản đã trả → về ví nhận, không danh mục (không vào Chi).
    expect(calls.createTransaction[1]).toMatchObject({
      type: 'transfer',
      amount: 3000,
      account_id: 'acc-1',
      to_account_id: 'acc-cash',
      category_id: null,
      note: 'Hoàn phần trả hộ · An',
    })
  })

  it('tổng tiền rời tài khoản đã trả = đúng số đã quẹt (2000 chi + 3000 chuyển)', async () => {
    const { deps, calls } = makeDeps([])
    await saveSplit(base, now({ receivedAccountId: 'acc-cash' }), deps)

    const outOfSource = calls.createTransaction
      .filter((t) => t.account_id === 'acc-1')
      .reduce((s, t) => s + t.amount, 0)
    expect(outOfSource).toBe(5000)
  })

  it('hoàn vào CHÍNH tài khoản đã trả → chỉ một dòng chi, không chuyển khoản', async () => {
    const { deps, calls } = makeDeps([])
    await saveSplit(base, now({ receivedAccountId: '' }), deps)

    expect(calls.createTransaction).toHaveLength(1)
    expect(calls.createTransaction[0]).toMatchObject({ type: 'expense', amount: 2000 })
  })

  it('chọn ví nhận trùng tài khoản nguồn → cũng không sinh chuyển khoản', async () => {
    const { deps, calls } = makeDeps([])
    await saveSplit(base, now({ receivedAccountId: 'acc-1' }), deps)

    expect(calls.createTransaction).toHaveLength(1)
    expect(calls.createTransaction[0]).toMatchObject({ type: 'expense' })
  })

  it('người kia hoàn TOÀN BỘ → không có dòng chi nào, chỉ chuyển khoản', async () => {
    const { deps, calls } = makeDeps([])
    await saveSplit(base, now({ others: 5000, receivedAccountId: 'acc-cash' }), deps)

    expect(calls.createTransaction).toHaveLength(1)
    expect(calls.createTransaction[0]).toMatchObject({ type: 'transfer', amount: 5000 })
  })

  it('không gõ tên → vẫn lưu được, ghi chú không có dấu chấm giữa lơ lửng', async () => {
    const { deps, calls } = makeDeps([])
    await saveSplit(base, now({ counterparty: '', receivedAccountId: 'acc-cash' }), deps)

    expect(calls.createTransaction[0]).toMatchObject({ note: 'Chia bill' })
    expect(calls.createTransaction[1]).toMatchObject({ note: 'Hoàn phần trả hộ' })
  })

  it('ghi chú người dùng gõ được giữ cho dòng chi', async () => {
    const { deps, calls } = makeDeps([])
    await saveSplit({ ...base, note: ' KS Hakone ' }, now({ receivedAccountId: 'acc-cash' }), deps)

    expect(calls.createTransaction[0]).toMatchObject({ note: 'KS Hakone' })
  })

  it('chuyển khoản hỏng → xóa lại dòng chi, không để số dư lệch một nửa', async () => {
    const { deps, calls, setFailOn } = makeDeps([])
    setFailOn((i) => i.type === 'transfer')

    await expect(
      saveSplit(base, now({ receivedAccountId: 'acc-cash' }), deps),
    ).rejects.toThrow('bùm')
    expect(calls.deleteTransaction).toEqual(['tx-1'])
  })

  it('có khoản cho vay đang mở cùng tên → KHÔNG cộng dồn vào đó', async () => {
    const { deps, calls } = makeDeps([openLoan({ counterparty: 'An' })])
    await saveSplit(base, now({ receivedAccountId: 'acc-cash' }), deps)

    expect(calls.createDebtPayment).toHaveLength(0)
    expect(calls.createDebt).toHaveLength(0)
  })
})

/**
 * Phí là một giao dịch CHI RIÊNG vào danh mục "Tài chính" — không cộng vào số tiền
 * chuyển, không cộng vào gốc nợ. Tạo phí trước, bút toán chính hỏng thì xóa phí đi.
 */
const cat = (id: string, name: string, type = 'expense') => ({ id, name, type })

const transfer: NewTransaction = {
  type: 'transfer',
  amount: 100_000,
  to_amount: null,
  category_id: null,
  account_id: 'acc-1',
  to_account_id: 'acc-2',
  occurred_on: '2026-07-28',
  note: 'Chuyển sang tiết kiệm',
}

describe('saveWithFee — chuyển khoản kèm phí', () => {
  it('tạo phí thành giao dịch chi riêng vào "Tài chính", rồi mới tạo chuyển khoản', async () => {
    const { deps, calls } = makeDeps([], [cat('cat-tc', 'Tài chính')])
    await saveWithFee(transfer, 440, 'Phí chuyển khoản', deps)

    expect(calls.createCategory).toHaveLength(0)
    expect(calls.createTransaction).toHaveLength(2)
    // Phí đi trước — hỏng ở bút toán chính thì mới xóa lại được.
    expect(calls.createTransaction[0]).toMatchObject({
      type: 'expense',
      amount: 440,
      category_id: 'cat-tc',
      account_id: 'acc-1',
      occurred_on: '2026-07-28',
      note: 'Phí chuyển khoản',
      to_account_id: null,
    })
    expect(calls.createTransaction[1]).toMatchObject({ type: 'transfer', amount: 100_000 })
  })

  it('phí 0 → chỉ một bút toán, không đụng tới danh mục', async () => {
    const { deps, calls } = makeDeps([], [cat('cat-tc', 'Tài chính')])
    await saveWithFee(transfer, 0, 'Phí chuyển khoản', deps)

    expect(calls.createTransaction).toHaveLength(1)
    expect(calls.createTransaction[0]).toMatchObject({ type: 'transfer' })
    expect(calls.createCategory).toHaveLength(0)
  })

  it('chuyển khoản hỏng → xóa lại bút toán phí, không để phí lơ lửng', async () => {
    const { deps, calls, setFailOn } = makeDeps([], [cat('cat-tc', 'Tài chính')])
    setFailOn((i) => i.type === 'transfer')

    await expect(saveWithFee(transfer, 440, 'Phí chuyển khoản', deps)).rejects.toThrow('bùm')
    expect(calls.deleteTransaction).toEqual(['tx-1'])
  })

  it('DB chưa áp migration 0030 → dùng lại danh mục tên cũ, không tạo trùng', async () => {
    const { deps, calls } = makeDeps([], [cat('cat-cu', 'Tài chính & Đầu tư')])
    await saveWithFee(transfer, 440, 'Phí chuyển khoản', deps)

    expect(calls.createCategory).toHaveLength(0)
    expect(calls.createTransaction[0]).toMatchObject({ category_id: 'cat-cu' })
  })

  it('không có danh mục nào khớp → tạo mới "Tài chính"', async () => {
    const { deps, calls } = makeDeps([], [cat('cat-an', 'Ăn uống')])
    await saveWithFee(transfer, 440, 'Phí chuyển khoản', deps)

    expect(calls.createCategory[0]).toMatchObject({ name: 'Tài chính', type: 'expense' })
    expect(calls.createTransaction[0]).toMatchObject({ category_id: 'cat-moi' })
  })

  it('danh mục THU trùng tên không được nhận nhầm', async () => {
    const { deps, calls } = makeDeps([], [cat('cat-thu', 'Tài chính', 'income')])
    await saveWithFee(transfer, 440, 'Phí chuyển khoản', deps)

    expect(calls.createCategory).toHaveLength(1)
    expect(calls.createTransaction[0]).toMatchObject({ category_id: 'cat-moi' })
  })
})

describe('saveDebtEntry — cho vay kèm phí', () => {
  const lend = { ...initialDebt(), direction: 'owed_to_me' as const, counterparty: 'An', fee: 500 }

  it('phí không cộng vào gốc nợ, đi riêng vào "Tài chính"', async () => {
    const { deps, calls } = makeDeps([], [cat('cat-tc', 'Tài chính')])
    await saveDebtEntry(base, lend, deps)

    expect(calls.createDebt[0]).toMatchObject({ principal: 5000 }) // gốc giữ nguyên
    expect(calls.createDebt[0].transaction).toMatchObject({ type: 'expense', amount: 5000 })
    expect(calls.createTransaction).toHaveLength(1) // chỉ bút toán phí đi qua createTransaction
    expect(calls.createTransaction[0]).toMatchObject({
      type: 'expense',
      amount: 500,
      category_id: 'cat-tc',
      note: 'Phí · An',
    })
  })

  it('ghi khoản nợ hỏng → xóa lại bút toán phí', async () => {
    const { deps, calls } = makeDeps([], [cat('cat-tc', 'Tài chính')])
    deps.createDebt = async () => {
      throw new Error('bùm')
    }

    await expect(saveDebtEntry(base, lend, deps)).rejects.toThrow('bùm')
    expect(calls.deleteTransaction).toEqual(['tx-1'])
  })

  it('không nhập phí → không sinh bút toán phí nào', async () => {
    const { deps, calls } = makeDeps([], [cat('cat-tc', 'Tài chính')])
    await saveDebtEntry(base, { ...lend, fee: 0 }, deps)

    expect(calls.createTransaction).toHaveLength(0)
    expect(calls.createDebt).toHaveLength(1)
  })
})
