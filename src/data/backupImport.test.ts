import { beforeEach, describe, it, expect } from 'vitest'
import { chunk, validateBackupPayload } from './backupImport'
import { demoRepo, resetDemoData } from './demoRepo'
import type { BackupData } from './repo'

// Vitest chạy môi trường node → không có localStorage. Cài bản giả trong bộ nhớ
// (giống demoRepo.test.ts) để test khôi phục v6 dưới đây dùng được demoRepo thật.
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

/** Backup nhỏ nhất mà hợp lệ, để mỗi test chỉ phá đúng một chỗ. */
function base(): BackupData {
  return {
    version: 6,
    exported_at: '2026-08-01T00:00:00.000Z',
    profile: { user_id: 'u1' } as BackupData['profile'],
    accounts: [{ id: 'a1', name: 'Ví' }] as unknown as BackupData['accounts'],
    categories: [
      { id: 'c1', name: 'Ăn uống', type: 'expense', parent_id: null },
      { id: 'c2', name: 'Bữa trưa', type: 'expense', parent_id: 'c1' },
    ] as unknown as BackupData['categories'],
    transactions: [
      { id: 't1', type: 'expense', amount: 500, account_id: 'a1', category_id: 'c2', occurred_on: '2024-01-02' },
    ] as unknown as BackupData['transactions'],
    budgets: [],
    assetGroupSettings: [],
    debts: [],
    debtPayments: [],
    recurringRules: [],
  }
}

describe('chunk', () => {
  it('cắt theo cỡ, phần cuối ngắn hơn', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })

  it('mảng rỗng -> không có lô nào', () => {
    expect(chunk([], 3)).toEqual([])
  })

  it('cỡ lớn hơn mảng -> một lô', () => {
    expect(chunk([1, 2], 500)).toEqual([[1, 2]])
  })

  it('cỡ <= 0 không được làm treo vòng lặp', () => {
    expect(chunk([1, 2, 3], 0)).toEqual([[1, 2, 3]])
  })
})

describe('validateBackupPayload', () => {
  it('backup lành -> không vấn đề gì', () => {
    expect(validateBackupPayload(base())).toEqual([])
  })

  it('giao dịch trỏ tới tài khoản không có trong file', () => {
    const d = base()
    d.transactions[0].account_id = 'a-khong-ton-tai'
    const p = validateBackupPayload(d)
    expect(p).toHaveLength(1)
    expect(p[0]).toMatch(/tài khoản/i)
    expect(p[0]).toContain('a-khong-ton-tai')
  })

  it('giao dịch trỏ tới danh mục không có trong file', () => {
    const d = base()
    d.transactions[0].category_id = 'c-lac'
    expect(validateBackupPayload(d)[0]).toMatch(/danh mục/i)
  })

  it('danh mục con trỏ tới cha không có -> chèn sẽ vỡ FK', () => {
    const d = base()
    d.categories[1].parent_id = 'c-me-bien-mat'
    expect(validateBackupPayload(d)[0]).toMatch(/danh mục cha/i)
  })

  it('id trùng nhau trong cùng bảng', () => {
    const d = base()
    d.transactions.push({ ...d.transactions[0] })
    expect(validateBackupPayload(d)[0]).toMatch(/trùng id/i)
  })

  it('số tiền <= 0 hoặc không phải số -> DB chặn, phải báo trước khi xoá', () => {
    const d = base()
    d.transactions[0].amount = 0
    expect(validateBackupPayload(d)[0]).toMatch(/số tiền/i)
  })

  it('ngày sai định dạng', () => {
    const d = base()
    d.transactions[0].occurred_on = '02/01/2024'
    expect(validateBackupPayload(d)[0]).toMatch(/ngày/i)
  })

  it('chuyển khoản thiếu tài khoản đích', () => {
    const d = base()
    d.transactions.push({
      id: 't2',
      type: 'transfer',
      amount: 100,
      account_id: 'a1',
      category_id: null,
      to_account_id: null,
      occurred_on: '2024-01-03',
    } as unknown as BackupData['transactions'][number])
    expect(validateBackupPayload(d)[0]).toMatch(/tài khoản đích/i)
  })

  it('nhãn giao dịch trỏ tới giao dịch/nhãn không có', () => {
    const d = base()
    d.tags = [{ id: 'g1', name: 'du lịch' }] as unknown as BackupData['tags']
    d.transactionTags = [
      { transaction_id: 't-lac', tag_id: 'g1' },
      { transaction_id: 't1', tag_id: 'g-lac' },
    ] as unknown as BackupData['transactionTags']
    const p = validateBackupPayload(d)
    expect(p).toHaveLength(2)
  })

  // --- Hình dạng theo CHECK của 0001: vi phạm là nổ 23514 SAU khi importAll đã xoá hết ---

  it('chuyển khoản mang danh mục -> vi phạm shape CHECK', () => {
    const d = base()
    d.transactions.push({
      id: 't2',
      type: 'transfer',
      amount: 100,
      account_id: 'a1',
      category_id: 'c2',
      to_account_id: 'a2',
      occurred_on: '2024-01-03',
    } as unknown as BackupData['transactions'][number])
    d.accounts.push({ id: 'a2', name: 'Bank' } as unknown as BackupData['accounts'][number])
    expect(validateBackupPayload(d).join(' ')).toMatch(/không được mang danh mục/i)
  })

  it('chuyển khoản về chính nó', () => {
    const d = base()
    d.transactions.push({
      id: 't2',
      type: 'transfer',
      amount: 100,
      account_id: 'a1',
      category_id: null,
      to_account_id: 'a1',
      occurred_on: '2024-01-03',
    } as unknown as BackupData['transactions'][number])
    expect(validateBackupPayload(d).join(' ')).toMatch(/nguồn và đích/i)
  })

  it('thu/chi thiếu danh mục', () => {
    const d = base()
    d.transactions[0].category_id = null
    expect(validateBackupPayload(d).join(' ')).toMatch(/thiếu danh mục/i)
  })

  it('thu/chi mang to_account_id hoặc to_amount', () => {
    const d = base()
    d.transactions[0].to_account_id = 'a1'
    ;(d.transactions[0] as { to_amount?: number }).to_amount = 50
    const joined = validateBackupPayload(d).join(' ')
    expect(joined).toMatch(/tài khoản đích/i)
    expect(joined).toMatch(/to_amount/i)
  })

  // --- Khoá UNIQUE: vi phạm là nổ 23505 giữa chừng lúc chèn lại ---

  it('trùng ngân sách (danh mục + tháng)', () => {
    const d = base()
    d.budgets = [
      { id: 'b1', category_id: 'c2', month_key: '2024-01', amount: 100 },
      { id: 'b2', category_id: 'c2', month_key: '2024-01', amount: 200 },
    ] as unknown as BackupData['budgets']
    expect(validateBackupPayload(d).join(' ')).toMatch(/trùng ngân sách/i)
  })

  it('trùng tên nhãn / trùng liên kết nhãn', () => {
    const d = base()
    d.tags = [
      { id: 'g1', name: 'du lịch' },
      { id: 'g2', name: 'du lịch' },
    ] as unknown as BackupData['tags']
    d.transactionTags = [
      { transaction_id: 't1', tag_id: 'g1' },
      { transaction_id: 't1', tag_id: 'g1' },
    ] as unknown as BackupData['transactionTags']
    const joined = validateBackupPayload(d).join(' ')
    expect(joined).toMatch(/trùng tên nhãn/i)
    expect(joined).toMatch(/trùng liên kết nhãn/i)
  })

  it('trùng định giá (tài khoản + ngày) và snapshot (ngày)', () => {
    const d = base()
    d.accountValuations = [
      { id: 'v1', account_id: 'a1', valued_on: '2024-01-01', market_value: 1 },
      { id: 'v2', account_id: 'a1', valued_on: '2024-01-01', market_value: 2 },
    ] as unknown as BackupData['accountValuations']
    d.networthSnapshots = [
      { id: 's1', snapshot_on: '2024-01-01', net_worth: 1 },
      { id: 's2', snapshot_on: '2024-01-01', net_worth: 2 },
    ] as unknown as BackupData['networthSnapshots']
    const joined = validateBackupPayload(d).join(' ')
    expect(joined).toMatch(/trùng định giá/i)
    expect(joined).toMatch(/trùng snapshot/i)
  })

  it('chặng đời: trùng (kịch bản + năm) và trỏ tới kịch bản không có', () => {
    const d = base()
    d.lifeScenarios = [{ id: 'sc1', name: 'Cơ sở' }] as unknown as BackupData['lifeScenarios']
    d.lifePhases = [
      { id: 'p1', scenario_id: 'sc1', start_year: 2030, label: 'Nhật' },
      { id: 'p2', scenario_id: 'sc1', start_year: 2030, label: 'Mỹ' },
      { id: 'p3', scenario_id: 'sc-lac', start_year: 2035, label: 'Về hưu' },
    ] as unknown as BackupData['lifePhases']
    const joined = validateBackupPayload(d).join(' ')
    expect(joined).toMatch(/trùng chặng đời/i)
    expect(joined).toMatch(/kịch bản không có/i)
  })

  it('quy tắc định kỳ / lần trả nợ / giải ngân trỏ tới bản ghi không có', () => {
    const d = base()
    d.recurringRules = [
      { id: 'r1', account_id: 'a-lac', to_account_id: null, category_id: 'c2' },
    ] as unknown as BackupData['recurringRules']
    d.debts = [
      { id: 'd1', counterparty: 'Anh Ba', disbursement_transaction_id: 't-lac' },
    ] as unknown as BackupData['debts']
    d.debtPayments = [
      { id: 'dp1', debt_id: 'd1', transaction_id: 't-lac-2' },
    ] as unknown as BackupData['debtPayments']
    const p = validateBackupPayload(d)
    expect(p.join(' ')).toMatch(/quy tắc định kỳ/i)
    expect(p.join(' ')).toMatch(/giải ngân/i)
    expect(p.join(' ')).toMatch(/lần trả nợ trỏ tới giao dịch/i)
  })

  it('trả lỗi cho NHIỀU chỗ cùng lúc, không dừng ở lỗi đầu', () => {
    const d = base()
    d.transactions[0].account_id = 'x'
    d.transactions[0].category_id = 'y'
    expect(validateBackupPayload(d).length).toBeGreaterThanOrEqual(2)
  })

  // --- stockTrades (v7): FK (account_id, user_id) + UNIQUE id + CHECK stock_trades_shape ---

  it('lệnh cổ phiếu trỏ tới tài khoản không có trong file', () => {
    const d = base()
    d.stockTrades = [
      {
        id: 's1',
        account_id: 'a-khong-ton-tai',
        symbol: 'FPT',
        kind: 'buy',
        traded_on: '2024-01-02',
        quantity: 100,
        price: 70_000,
      },
    ] as unknown as BackupData['stockTrades']
    const p = validateBackupPayload(d)
    expect(p.join(' ')).toMatch(/tài khoản/i)
    expect(p.join(' ')).toContain('a-khong-ton-tai')
  })

  it('id trùng nhau trong sổ lệnh cổ phiếu', () => {
    const d = base()
    const row = {
      id: 's1',
      account_id: 'a1',
      symbol: 'FPT',
      kind: 'buy',
      traded_on: '2024-01-02',
      quantity: 100,
      price: 70_000,
    }
    d.stockTrades = [row, { ...row }] as unknown as BackupData['stockTrades']
    expect(validateBackupPayload(d)[0]).toMatch(/trùng id/i)
  })

  it('lệnh điều chỉnh nhưng giá khác 0 -> vi phạm shape CHECK', () => {
    const d = base()
    d.stockTrades = [
      {
        id: 's1',
        account_id: 'a1',
        symbol: 'FPT',
        kind: 'adjust',
        traded_on: '2024-01-02',
        quantity: 50,
        price: 1_000,
      },
    ] as unknown as BackupData['stockTrades']
    expect(validateBackupPayload(d).join(' ')).toMatch(/điều chỉnh/i)
  })

  it('lệnh mua có số cổ bằng 0 -> vi phạm shape CHECK', () => {
    const d = base()
    d.stockTrades = [
      {
        id: 's1',
        account_id: 'a1',
        symbol: 'FPT',
        kind: 'buy',
        traded_on: '2024-01-02',
        quantity: 0,
        price: 70_000,
      },
    ] as unknown as BackupData['stockTrades']
    expect(validateBackupPayload(d).join(' ')).toMatch(/số cổ|giá/i)
  })

  it('sổ lệnh cổ phiếu hợp lệ -> không vấn đề gì', () => {
    const d = base()
    d.stockTrades = [
      {
        id: 's1',
        account_id: 'a1',
        symbol: 'FPT',
        kind: 'buy',
        traded_on: '2024-01-02',
        quantity: 100,
        price: 70_000,
      },
      {
        id: 's2',
        account_id: 'a1',
        symbol: 'FPT',
        kind: 'adjust',
        traded_on: '2024-01-03',
        quantity: -50,
        price: 0,
      },
    ] as unknown as BackupData['stockTrades']
    expect(validateBackupPayload(d)).toEqual([])
  })

  it('gom lỗi cùng loại lại, không in ra 14.000 dòng', () => {
    const d = base()
    d.transactions = Array.from({ length: 300 }, (_, i) => ({
      id: `t${i}`,
      type: 'expense',
      amount: 100,
      account_id: 'khong-co',
      category_id: 'c2',
      occurred_on: '2024-01-02',
    })) as unknown as BackupData['transactions']
    const p = validateBackupPayload(d)
    expect(p.length).toBeLessThanOrEqual(5)
    expect(p.join(' ')).toMatch(/300/)
  })
})

describe('demoRepo.importAll: khôi phục file backup v6 (chưa có sổ lệnh cổ phiếu)', () => {
  it('backup v6 (chưa có sổ lệnh cổ phiếu) vẫn nhập được', async () => {
    const backup = await demoRepo.exportAll()
    const cu = { ...backup, version: 6, stockTrades: undefined }
    await expect(demoRepo.importAll(cu)).resolves.not.toThrow()
    expect(await demoRepo.getStockTrades()).toEqual([])
  })
})
