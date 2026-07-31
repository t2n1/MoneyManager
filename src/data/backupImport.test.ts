import { describe, it, expect } from 'vitest'
import { chunk, validateBackupPayload } from './backupImport'
import type { BackupData } from './repo'

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

  it('trả lỗi cho NHIỀU chỗ cùng lúc, không dừng ở lỗi đầu', () => {
    const d = base()
    d.transactions[0].account_id = 'x'
    d.transactions[0].category_id = 'y'
    expect(validateBackupPayload(d).length).toBeGreaterThanOrEqual(2)
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
