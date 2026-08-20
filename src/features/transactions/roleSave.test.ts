import { describe, expect, it } from 'vitest'
import type {
  CategoryRow,
  DebtPaymentRow,
  DebtRow,
  TransactionRow,
} from '../../types/database.types'
import type { NewCategory, NewDebt, NewDebtPayment, NewTransaction } from '../../data'
import {
  debtFlowCategoryId,
  saveDebtEntry,
  saveDebtPayment,
  saveRemit,
  saveSplit,
  saveWithFee,
} from './roleSave'
import type { RoleBase, RoleSaveDeps } from './roleSave'
import { initialDebt, initialRemit, initialSplit } from './entryRoles'

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
  tagIds: [],
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
 * Người kia đưa DƯ tiền (others > tổng, chỉ có ở settle='now'): phần dư ghi thành
 * khoản THU vào ví nhận. Chi của mình = 0, tài khoản đã trả vẫn trừ đủ tổng
 * (chuyển khoản tối đa bằng tổng — phần dư đi bằng dòng thu, không phải chuyển khoản).
 */
describe('saveSplit — người kia đưa dư tiền (settle=now)', () => {
  const nowOver = (over: Partial<ReturnType<typeof initialSplit>> = {}) => ({
    ...initialSplit(),
    others: 6000, // tổng chỉ 5000 → dư 1000
    counterparty: 'An',
    ...over,
  })
  const catsThu = [{ id: 'cat-thu-khac', name: 'Khác', type: 'income' }]

  it('dư về ví KHÁC → chuyển khoản đủ tổng + khoản thu phần dư vào ví đó, không có dòng chi', async () => {
    const { deps, calls } = makeDeps([], catsThu)
    await saveSplit(base, nowOver({ receivedAccountId: 'acc-cash' }), deps)

    expect(calls.createTransaction).toHaveLength(2)
    expect(calls.createTransaction[0]).toMatchObject({
      type: 'transfer',
      amount: 5000, // chỉ bằng tổng — tài khoản đã trả trừ đủ, không trừ lố
      account_id: 'acc-1',
      to_account_id: 'acc-cash',
    })
    expect(calls.createTransaction[1]).toMatchObject({
      type: 'income',
      amount: 1000,
      account_id: 'acc-cash',
      category_id: 'cat-thu-khac',
      note: 'Trả hộ nhận dư · An',
    })
  })

  it('dư về CHÍNH ví đã trả → chỉ một khoản thu phần dư', async () => {
    const { deps, calls } = makeDeps([], catsThu)
    await saveSplit(base, nowOver({ receivedAccountId: '' }), deps)

    expect(calls.createTransaction).toHaveLength(1)
    expect(calls.createTransaction[0]).toMatchObject({
      type: 'income',
      amount: 1000,
      account_id: 'acc-1',
    })
  })

  it('chưa có danh mục thu "Khác" → tự tạo rồi dùng', async () => {
    const { deps, calls } = makeDeps([], [])
    await saveSplit(base, nowOver({}), deps)

    expect(calls.createCategory).toHaveLength(1)
    expect(calls.createCategory[0]).toMatchObject({ name: 'Khác', type: 'income' })
    expect(calls.createTransaction[0]).toMatchObject({ type: 'income', category_id: 'cat-moi' })
  })

  it('khoản thu hỏng → xóa lại chuyển khoản đã tạo, không để số dư lệch', async () => {
    const { deps, calls, setFailOn } = makeDeps([], catsThu)
    setFailOn((i) => i.type === 'income')

    await expect(
      saveSplit(base, nowOver({ receivedAccountId: 'acc-cash' }), deps),
    ).rejects.toThrow('bùm')
    expect(calls.deleteTransaction).toEqual(['tx-1'])
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

/**
 * Giao dịch giải ngân của vai trò nợ KHÔNG bắt người dùng chọn danh mục nữa
 * (is_debt_flow không vào báo cáo — bắt chọn "Lương" khi đi vay là vô nghĩa).
 * Thay vào đó tự tìm/tạo danh mục cố định: chi "Cho vay", thu "Đi vay".
 */
describe('saveDebtEntry — danh mục tự gán', () => {
  it('cho vay → giải ngân vào danh mục chi "Cho vay" có sẵn, bỏ qua danh mục form', async () => {
    const { deps, calls } = makeDeps([], [cat('cat-chovay', 'Cho vay')])
    await saveDebtEntry('lend', base, { ...initialDebt(), direction: 'owed_to_me' as const, counterparty: 'An' }, deps)

    expect(calls.createCategory).toHaveLength(0)
    expect(calls.createDebt[0].transaction).toMatchObject({
      type: 'expense',
      category_id: 'cat-chovay',
    })
  })

  it('mình nợ → danh mục thu "Đi vay", chưa có thì tự tạo', async () => {
    const { deps, calls } = makeDeps([], [cat('cat-chovay', 'Cho vay')])
    await saveDebtEntry('lend', base, { ...initialDebt(), direction: 'i_owe' as const, counterparty: 'Ngân hàng' }, deps)

    expect(calls.createCategory).toHaveLength(1)
    expect(calls.createCategory[0]).toMatchObject({ name: 'Đi vay', type: 'income' })
    expect(calls.createDebt[0].transaction).toMatchObject({ type: 'income', category_id: 'cat-moi' })
  })

  it('danh mục trùng tên nhưng khác loại không được nhận nhầm', async () => {
    const { deps, calls } = makeDeps([], [cat('cat-thu', 'Cho vay', 'income')])
    await saveDebtEntry('lend', base, { ...initialDebt(), direction: 'owed_to_me' as const, counterparty: 'An' }, deps)

    expect(calls.createCategory[0]).toMatchObject({ name: 'Cho vay', type: 'expense' })
    expect(calls.createDebt[0].transaction).toMatchObject({ category_id: 'cat-moi' })
  })

  it('chỉ ghi sổ (không chuyển tiền thật) → không đụng tới danh mục', async () => {
    const { deps, calls } = makeDeps([], [])
    await saveDebtEntry(
      'lend',
      base,
      { ...initialDebt(), direction: 'owed_to_me' as const, counterparty: 'An', withTransaction: false },
      deps,
    )

    expect(calls.createCategory).toHaveLength(0)
    expect(calls.createDebt[0].transaction).toBeNull()
  })

  it('cộng dồn người cũ có chuyển tiền thật → giao dịch thêm cũng vào danh mục tự gán', async () => {
    const { deps, calls } = makeDeps([openLoan({ counterparty: 'An' })], [cat('cat-chovay', 'Cho vay')])
    await saveDebtEntry(
      'lend',
      base,
      { ...initialDebt(), direction: 'owed_to_me' as const, counterparty: 'An' },
      deps,
    )

    expect(calls.createDebt).toHaveLength(0)
    expect(calls.createDebtPayment[0].transaction).toMatchObject({ category_id: 'cat-chovay' })
  })
})

/**
 * Bảng tên danh mục 🤝 cho dòng tiền nợ — dùng chung form Nhập (giải ngân) và
 * sheet Ghi nhận trả (DebtPaymentSheet): 4 cái tự mô tả để dòng sổ đọc được ngay.
 */
describe('debtFlowCategoryId — trả/thu nợ', () => {
  it('mình trả nợ (i_owe) → danh mục chi "Trả nợ", chưa có thì tự tạo', async () => {
    const { deps, calls } = makeDeps([], [cat('cat-chovay', 'Cho vay')])
    const id = await debtFlowCategoryId('repay', 'i_owe', deps)

    expect(calls.createCategory[0]).toMatchObject({ name: 'Trả nợ', type: 'expense', icon: '🤝' })
    expect(id).toBe('cat-moi')
  })

  it('người ta trả mình (owed_to_me) → danh mục thu "Thu nợ" có sẵn, không tạo trùng', async () => {
    const { deps, calls } = makeDeps([], [cat('cat-thuno', 'Thu nợ', 'income')])
    const id = await debtFlowCategoryId('repay', 'owed_to_me', deps)

    expect(calls.createCategory).toHaveLength(0)
    expect(id).toBe('cat-thuno')
  })

  it('danh mục trùng tên nhưng khác loại không được nhận nhầm', async () => {
    const { deps, calls } = makeDeps([], [cat('cat-sai', 'Trả nợ', 'income')])
    await debtFlowCategoryId('repay', 'i_owe', deps)

    expect(calls.createCategory[0]).toMatchObject({ name: 'Trả nợ', type: 'expense' })
  })
})

describe('saveDebtEntry — cho vay kèm phí', () => {
  const lend = { ...initialDebt(), direction: 'owed_to_me' as const, counterparty: 'An', fee: 500 }

  it('phí không cộng vào gốc nợ, đi riêng vào "Tài chính"', async () => {
    const { deps, calls } = makeDeps([], [cat('cat-tc', 'Tài chính')])
    await saveDebtEntry('lend', base, lend, deps)

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

    await expect(saveDebtEntry('lend', base, lend, deps)).rejects.toThrow('bùm')
    expect(calls.deleteTransaction).toEqual(['tx-1'])
  })

  it('không nhập phí → không sinh bút toán phí nào', async () => {
    const { deps, calls } = makeDeps([], [cat('cat-tc', 'Tài chính')])
    await saveDebtEntry('lend', base, { ...lend, fee: 0 }, deps)

    expect(calls.createTransaction).toHaveLength(0)
    expect(calls.createDebt).toHaveLength(1)
  })
})

/**
 * Nhãn (tagIds) người dùng chọn ở form phải đi theo bút toán CHÍNH ở cả ba vai
 * trò — kể cả Trả hộ, đúng chỗ cần nhãn "ai" nhất. Bút toán phí và bút toán
 * chuyển khoản bù (settle='now') là kỹ thuật app tự sinh nên không nhận nhãn
 * (xem test riêng ở saveSplit/saveDebtEntry phía trên cho các bút toán đó).
 */
describe('nhãn đi theo ở cả ba vai trò', () => {
  it('trả hộ: giao dịch phần mình mang đúng nhãn', async () => {
    const { deps, calls } = makeDeps([])
    await saveSplit(
      { ...base, amount: 12_400, tagIds: ['tag-lan'] },
      { ...later(), others: 8_200, counterparty: 'Lan' },
      deps,
    )
    expect(calls.createTransaction[0]).toMatchObject({ tag_ids: ['tag-lan'] })
  })

  it('gửi về VN: hỗ trợ gia đình mang đúng nhãn', async () => {
    const { deps, calls } = makeDeps([])
    await saveRemit(
      { ...base, amount: 30_000, tagIds: ['tag-me'] },
      { ...initialRemit(), kind: 'expense', fee: 800, received: 4_467_600 },
      deps,
    )
    expect(calls.createTransaction[0]).toMatchObject({ tag_ids: ['tag-me'] })
  })

  it('cho vay: bút toán giải ngân mang đúng nhãn', async () => {
    const { deps, calls } = makeDeps([])
    await saveDebtEntry(
      'lend',
      { ...base, amount: 50_000, tagIds: ['tag-hung'] },
      { ...initialDebt(), direction: 'owed_to_me', counterparty: 'Hùng' },
      deps,
    )
    expect(calls.createDebt[0].transaction).toMatchObject({ tag_ids: ['tag-hung'] })
  })

  it('không chọn nhãn thì không gửi mảng rỗng làm mất nhãn cũ', async () => {
    const { deps, calls } = makeDeps([])
    await saveRemit(
      { ...base, amount: 30_000, tagIds: [] },
      { ...initialRemit(), kind: 'expense' },
      deps,
    )
    expect(calls.createTransaction[0]).toMatchObject({ tag_ids: [] })
  })

  /**
   * Chốt chặn quan trọng nhất của task này: `tagIds` mặc định là `[]` ở khắp nơi,
   * nên nếu chỉ test với tagIds rỗng thì đầu ra ĐÚNG (backTo không có tag_ids) và
   * đầu ra SAI (ai đó lỡ thêm tag_ids: base.tagIds vào backTo) trông GIỐNG HỆT
   * nhau — test sẽ không bao giờ đỏ. Phải dùng nhãn KHÔNG rỗng thì assertion
   * "backTo không mang nhãn" mới có ý nghĩa thật.
   *
   * Đã xác nhận bằng tay: thêm tạm `tag_ids: base.tagIds` vào bút toán backTo
   * trong roleSave.ts làm 2 assertion `.toBeUndefined()` dưới đây đỏ ngay (xem
   * task-5-report.md, mục "Fix round 1" để biết log cụ thể), rồi đã bỏ dòng đó.
   */
  it('trả hộ đã trả lại ngay (settle=now): mine + excess mang nhãn, backTo KHÔNG mang', async () => {
    const catsThu = [{ id: 'cat-thu-khac', name: 'Khác', type: 'income' }]

    // Nhánh A: người kia còn thiếu (mine > 0) → có dòng chi phần mình + chuyển
    // khoản bù. Dòng chi phải mang nhãn, chuyển khoản bù thì không.
    {
      const { deps, calls } = makeDeps([])
      await saveSplit(
        { ...base, amount: 12_000, tagIds: ['tag-x'] },
        { ...initialSplit(), others: 5_000, counterparty: 'Lan', receivedAccountId: 'acc-cash' },
        deps,
      )
      expect(calls.createTransaction).toHaveLength(2)
      expect(calls.createTransaction[0]).toMatchObject({ type: 'expense', tag_ids: ['tag-x'] })
      expect(calls.createTransaction[1].type).toBe('transfer')
      expect(calls.createTransaction[1].tag_ids).toBeUndefined()
    }

    // Nhánh B: người kia đưa DƯ (others > tổng) → chuyển khoản bù đủ tổng +
    // dòng thu phần dư. Dòng thu phải mang nhãn, chuyển khoản bù thì không.
    {
      const { deps, calls } = makeDeps([], catsThu)
      await saveSplit(
        { ...base, amount: 5_000, tagIds: ['tag-x'] },
        { ...initialSplit(), others: 9_000, counterparty: 'Lan', receivedAccountId: 'acc-cash' },
        deps,
      )
      expect(calls.createTransaction).toHaveLength(2)
      expect(calls.createTransaction[0].type).toBe('transfer')
      expect(calls.createTransaction[0].tag_ids).toBeUndefined()
      expect(calls.createTransaction[1]).toMatchObject({ type: 'income', tag_ids: ['tag-x'] })
    }
  })

  it('trả hộ còn nợ (settle=later): bút toán giải ngân (cho vay phần người kia) cũng mang nhãn', async () => {
    const { deps, calls } = makeDeps([])
    await saveSplit(
      { ...base, amount: 12_400, tagIds: ['tag-lan'] },
      { ...later(), others: 8_200, counterparty: 'Lan' },
      deps,
    )
    // Không có khoản nợ mở sẵn trùng tên → tạo mới, giải ngân đi kèm createDebt.
    expect(calls.createDebt).toHaveLength(1)
    expect(calls.createDebt[0].transaction).toMatchObject({ tag_ids: ['tag-lan'] })
  })

  it('cho vay cộng dồn vào khoản đang mở: giao dịch giải ngân thêm cũng mang nhãn', async () => {
    const { deps, calls } = makeDeps([openLoan({ counterparty: 'An' })], [cat('cat-chovay', 'Cho vay')])
    await saveDebtEntry(
      'lend',
      { ...base, amount: 2_000, tagIds: ['tag-an'] },
      { ...initialDebt(), direction: 'owed_to_me' as const, counterparty: 'An' },
      deps,
    )
    expect(calls.createDebt).toHaveLength(0)
    expect(calls.createDebtPayment[0].transaction).toMatchObject({ tag_ids: ['tag-an'] })
  })

  it('gửi về VN dạng chuyển khoản (JPY→VND) cũng mang đúng nhãn', async () => {
    const { deps, calls } = makeDeps([])
    await saveRemit(
      { ...base, amount: 30_000, tagIds: ['tag-me'] },
      { ...initialRemit(), kind: 'transfer', destId: 'acc-vn' },
      deps,
    )
    expect(calls.createTransaction[0]).toMatchObject({ type: 'transfer', tag_ids: ['tag-me'] })
  })
})

/**
 * saveDebtPayment: đường vào thứ hai cho DebtPaymentSheet từ form Nhập, dùng
 * ĐÚNG payload NewDebtPayment (nó bọc luôn transaction). `type` không lấy từ
 * dạng (repay/collect) mà suy từ CHIỀU khoản nợ — sai chiều là lệch cả sổ nợ
 * lẫn báo cáo Thu/Chi, nên test cả hai chiều để bắt được lỗi đảo ngược.
 */
describe('saveDebtPayment — trả nợ từ form Nhập', () => {
  const openDebt = (over: Partial<DebtRow> = {}): DebtRow =>
    ({
      id: 'd1',
      counterparty: 'Lan',
      direction: 'i_owe',
      currency: 'JPY',
      principal: 100_000,
      status: 'open',
      ...over,
    }) as DebtRow

  it('mình trả nợ (i_owe) = giao dịch CHI, danh mục tự gán "Trả nợ"', async () => {
    const { deps, calls } = makeDeps([openDebt()], [cat('cat-tra-no', 'Trả nợ')])
    await saveDebtPayment(
      { ...base, amount: 30_000 },
      { debtId: 'd1', withTransaction: true },
      deps,
    )
    expect(calls.createDebtPayment).toHaveLength(1)
    expect(calls.createDebtPayment[0].debt_id).toBe('d1')
    expect(calls.createDebtPayment[0].amount).toBe(30_000)
    expect(calls.createDebtPayment[0].transaction).toMatchObject({
      type: 'expense',
      category_id: 'cat-tra-no',
    })
  })

  it('người ta trả mình (owed_to_me) = giao dịch THU, danh mục tự gán "Thu nợ"', async () => {
    const { deps, calls } = makeDeps(
      [openDebt({ id: 'd2', direction: 'owed_to_me' })],
      [cat('cat-thu-no', 'Thu nợ', 'income')],
    )
    await saveDebtPayment(
      { ...base, amount: 8_200 },
      { debtId: 'd2', withTransaction: true },
      deps,
    )
    expect(calls.createDebtPayment[0].transaction).toMatchObject({
      type: 'income',
      category_id: 'cat-thu-no',
    })
  })

  it('tắt withTransaction thì chỉ ghi sổ nợ suông, không sinh giao dịch nào', async () => {
    const { deps, calls } = makeDeps([openDebt()])
    await saveDebtPayment(
      { ...base, amount: 30_000 },
      { debtId: 'd1', withTransaction: false },
      deps,
    )
    expect(calls.createDebtPayment[0].transaction).toBeNull()
    expect(calls.createTransaction).toHaveLength(0)
  })

  it('nhãn đi theo giao dịch trả nợ', async () => {
    const { deps, calls } = makeDeps([openDebt()], [cat('cat-tra-no', 'Trả nợ')])
    await saveDebtPayment(
      { ...base, amount: 30_000, tagIds: ['tag-lan'] },
      { debtId: 'd1', withTransaction: true },
      deps,
    )
    expect(calls.createDebtPayment[0].transaction).toMatchObject({ tag_ids: ['tag-lan'] })
  })

  it('không tìm thấy khoản nợ thì ném lỗi, không ghi im lặng', async () => {
    const { deps, calls } = makeDeps([])
    await expect(
      saveDebtPayment({ ...base, amount: 1 }, { debtId: 'mat-tieu', withTransaction: true }, deps),
    ).rejects.toThrow(/khoản nợ/i)
    expect(calls.createDebtPayment).toHaveLength(0)
    expect(calls.createTransaction).toHaveLength(0)
  })

  // Hai test "có phí" / "không nhập phí" cho saveDebtPayment đã BỊ XÓA (fix round 1,
  // task 8): `PaymentValue.fee` là plumbing chết — không cửa nào (DebtPickerField hay
  // DebtPaymentSheet) dựng UI cho phí trả nợ, spec không đòi, và field đã bị gỡ khỏi
  // PaymentValue/saveDebtPayment. Test phí của saveDebtEntry (DebtValue.fee, phí GIẢI
  // NGÂN) vẫn giữ nguyên ở describe khác — đó là tính năng có thật, có UI.
})

describe('dang owed: ghi no KHONG kem dong tien', () => {
  /** Base cua dang debtOnly: khong co vi nao, va categoryId la danh muc THU. */
  const owedBase: RoleBase = { ...base, accountId: null, categoryId: 'cat-lam-them' }
  const owedVal = {
    ...initialDebt(),
    direction: 'owed_to_me' as const,
    counterparty: 'Khách A',
  }

  it('createDebt khong co transaction, co origin earned + danh muc thu', async () => {
    const { deps, calls } = makeDeps([])
    await saveDebtEntry('owed', { ...owedBase, amount: 30_000 }, owedVal, deps)
    expect(calls.createTransaction).toHaveLength(0)
    expect(calls.createDebt).toHaveLength(1)
    expect(calls.createDebt[0]).toMatchObject({
      counterparty: 'Khách A',
      direction: 'owed_to_me',
      principal: 30_000,
      origin: 'earned',
      income_category_id: 'cat-lam-them',
      transaction: null,
    })
  })

  it('withTransaction bat san van KHONG sinh giao dich nao', async () => {
    // `withTransaction` la state song qua lan doi dang, nen roleSave phai tu chan —
    // khong dua vao viec form da tat cong tac.
    const { deps, calls } = makeDeps([])
    await saveDebtEntry('owed', owedBase, { ...owedVal, withTransaction: true }, deps)
    expect(calls.createTransaction).toHaveLength(0)
    expect(calls.createDebt[0].transaction).toBeNull()
  })

  it('phi bi bo qua: dang nay khong giai ngan nen khong co phi giai ngan', async () => {
    const { deps, calls } = makeDeps([])
    await saveDebtEntry('owed', owedBase, { ...owedVal, fee: 500 }, deps)
    expect(calls.createTransaction).toHaveLength(0)
  })

  it('KHONG gop vao khoan cho vay cu cua cung mot nguoi', async () => {
    // Bay im lang: gop lai thi khoan do origin null, nen moi lan tra sau khong vao Thu.
    const { deps, calls } = makeDeps([openLoan({ counterparty: 'Khách A' })])
    await saveDebtEntry('owed', owedBase, owedVal, deps)
    expect(calls.createDebtPayment).toHaveLength(0)
    expect(calls.createDebt).toHaveLength(1)
  })

  it('GOP vao khoan tien cong cu cung danh muc thu', async () => {
    const cu = openLoan({
      id: 'd-cong',
      counterparty: 'Khách A',
      origin: 'earned',
      income_category_id: 'cat-lam-them',
    })
    const { deps, calls } = makeDeps([cu])
    await saveDebtEntry('owed', { ...owedBase, amount: 20_000 }, owedVal, deps)
    expect(calls.createDebt).toHaveLength(0)
    // amount am = "no them", va KHONG kem giao dich nao.
    expect(calls.createDebtPayment[0]).toMatchObject({
      debt_id: 'd-cong',
      amount: -20_000,
      transaction: null,
    })
  })

  it('lend khong bi dinh: origin de null, van co giai ngan', async () => {
    const { deps, calls } = makeDeps([])
    await saveDebtEntry(
      'lend',
      base,
      { ...initialDebt(), direction: 'owed_to_me' as const, counterparty: 'Anh Hai' },
      deps,
    )
    expect(calls.createDebt[0].origin ?? null).toBeNull()
    expect(calls.createDebt[0].income_category_id ?? null).toBeNull()
    // But toan giai ngan di BEN TRONG createDebt (mot mutation ra ca hai), khong qua
    // deps.createTransaction — nen dem `createTransaction` o day la dem sai cho.
    expect(calls.createDebt[0].transaction).not.toBeNull()
  })
})

describe('ban build len truoc migration 0049', () => {
  it('Cho vay / Vay duoc KHONG gui ten cot cua 0049', async () => {
    // PostgREST tu choi cot no khong biet BAT KE gia tri: gui `origin: null` cung ra
    // "Could not find the 'income_category_id' column of 'debts' in the schema cache".
    // Nen mot ban build len truoc migration se lam hong ca hai duong ghi no dang chay
    // tot, khong chi dang moi. Chi gui hai cot do khi chung co nghia.
    for (const kind of ['lend', 'borrow'] as const) {
      const { deps, calls } = makeDeps([])
      await saveDebtEntry(
        kind,
        base,
        { ...initialDebt(), direction: kind === 'lend' ? 'owed_to_me' : 'i_owe', counterparty: 'An' },
        deps,
      )
      expect(Object.keys(calls.createDebt[0])).not.toContain('origin')
      expect(Object.keys(calls.createDebt[0])).not.toContain('income_category_id')
    }
  })

  it('dang owed VAN gui hai cot do — no khong the chay thieu chung', async () => {
    const { deps, calls } = makeDeps([])
    await saveDebtEntry(
      'owed',
      { ...base, accountId: null, categoryId: 'cat-lam-them' },
      { ...initialDebt(), direction: 'owed_to_me' as const, counterparty: 'Khách A' },
      deps,
    )
    expect(calls.createDebt[0].origin).toBe('earned')
    expect(calls.createDebt[0].income_category_id).toBe('cat-lam-them')
  })
})
