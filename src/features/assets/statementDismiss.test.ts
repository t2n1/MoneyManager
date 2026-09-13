import { describe, expect, it } from 'vitest'
import { billAfterDismiss, dismissKey, isReviewed, keysFor, splitDismissed, toggleKey } from './statementDismiss'
import type { ReviewRow } from './statementReviewRows'
import type { MergedStatement } from './statementBatch'

const led = (id: string, iso = '2026-06-10', amount = 23000): ReviewRow => ({
  kind: 'ledger', key: `led-${id}`, amount, refund: false,
  tx: { id, occurred_on: iso, amount, type: 'expense', is_refund: false, to_account_id: null, note: 'ks' },
})
const stm = (iso: string, amount: number, name: string): ReviewRow => ({
  kind: 'statement', key: `stm-x`, amount, refund: false,
  line: { iso, amount, billed: amount, name, kind: 'purchase', isAdjustment: false },
})
const topups: ReviewRow = { kind: 'topups', key: 'topups-2026-06-30', count: 2, amount: 3376 }
const rledger: ReviewRow = {
  kind: 'ledger', key: 'refund-led-0', amount: -6990, refund: true,
  tx: { id: '', occurred_on: '2026-01-28', amount: 6990, type: 'expense', is_refund: true, to_account_id: null, note: 'Uniqlo hoan' },
}

describe('dismissKey', () => {
  it('dong so theo id; dong the theo ngay|tien|ten NFKC; hoan tien so theo ngay|tien|ghi chu; cum nap vi theo ky', () => {
    expect(dismissKey(led('abc'))).toBe('tx:abc')
    expect(dismissKey(stm('2026-07-03', 5060, 'ＵＮＩＱＬＯ'))).toBe('stm:2026-07-03|5060|UNIQLO')
    expect(dismissKey(rledger)).toBe('rtx:2026-01-28|-6990|Uniqlo hoan')
    expect(dismissKey(topups)).toBe('topups:2026-06-30')
  })
  it('khoa cum nap vi lay tu key hang (chua closeISO), khong tu so lan', () => {
    expect(dismissKey({ ...topups, count: 9, amount: 1 })).toBe('topups:2026-06-30')
  })
})

describe('splitDismissed / isReviewed / toggleKey', () => {
  const rows = [led('a'), stm('2026-07-03', 5060, 'UNIQLO'), topups]
  it('tach theo khoa; thu tu giu nguyen', () => {
    const { open, hidden } = splitDismissed(rows, ['topups:2026-06-30', 'tx:a'])
    expect(open.map(dismissKey)).toEqual(['stm:2026-07-03|5060|UNIQLO'])
    expect(hidden.map(dismissKey)).toEqual(['tx:a', 'topups:2026-06-30'])
  })
  it('reviewed khi moi hang deu da bo qua; khong hang nao cung la reviewed', () => {
    expect(isReviewed(rows, ['tx:a'])).toBe(false)
    expect(isReviewed(rows, ['tx:a', 'stm:2026-07-03|5060|UNIQLO', 'topups:2026-06-30'])).toBe(true)
    expect(isReviewed([], [])).toBe(true)
  })
  it('toggleKey them khong trung, bo dung khoa, khong dot bien mang cu', () => {
    const d = ['tx:a']
    expect(toggleKey(d, 'tx:a', true)).toEqual(['tx:a'])
    expect(toggleKey(d, 'tx:b', true)).toEqual(['tx:a', 'tx:b'])
    expect(toggleKey(['tx:a', 'tx:b'], 'tx:a', false)).toEqual(['tx:b'])
    expect(d).toEqual(['tx:a'])
  })
})

describe('keysFor', () => {
  it('dong trung thu 2, 3 duoc noi #2, #3; dong doc nhat giu nguyen', () => {
    const dup = stm('2026-06-16', 4950, 'CBTS')
    const rows = [dup, dup, dup, stm('2026-07-03', 5060, 'UNIQLO')]
    expect(keysFor(rows)).toEqual([
      'stm:2026-06-16|4950|CBTS',
      'stm:2026-06-16|4950|CBTS#2',
      'stm:2026-06-16|4950|CBTS#3',
      'stm:2026-07-03|5060|UNIQLO',
    ])
  })
})

describe('splitDismissed voi dong trung', () => {
  it('bo qua mot dong chi an mot dong', () => {
    const dup = stm('2026-06-16', 4950, 'CBTS')
    const rows = [dup, dup, dup]
    const { open, hidden } = splitDismissed(rows, ['stm:2026-06-16|4950|CBTS#2'])
    expect(open.length).toBe(2)
    expect(hidden.length).toBe(1)
    expect(isReviewed(rows, ['stm:2026-06-16|4950|CBTS#2'])).toBe(false)
    expect(
      isReviewed(rows, ['stm:2026-06-16|4950|CBTS', 'stm:2026-06-16|4950|CBTS#2', 'stm:2026-06-16|4950|CBTS#3']),
    ).toBe(true)
  })
})

describe('billAfterDismiss', () => {
  const m: MergedStatement = {
    range: { start: '2026-06-01', end: '2026-07-01', closeISO: '2026-06-30', dueISO: '2026-07-27' },
    total: 158429, parts: [], lines: [], dueDateMismatch: false,
  }
  it('tong/ngay tu file, dismissed tu tham so, reviewed tinh tu rows', () => {
    const rows = [led('a'), topups]
    const nb = billAfterDismiss(m, 'acc', ['tx:a', 'topups:2026-06-30'], rows)
    expect(nb).toEqual({
      account_id: 'acc', close_date: '2026-06-30', due_date: '2026-07-27', total: 158429,
      dismissed: ['tx:a', 'topups:2026-06-30'], reviewed: true,
    })
  })
  it('chua co bill thi van dung duoc (khong con nhan existing)', () => {
    const nb = billAfterDismiss(m, 'acc', ['tx:a'], [led('a'), topups])
    expect(nb.reviewed).toBe(false)
    expect(nb.dismissed).toEqual(['tx:a'])
  })
})
