import { describe, expect, it } from 'vitest'
import { accountsForDebt, openDebtsFor, prefillFor } from './debtPick'

const DEBTS = [
  { id: 'd1', counterparty: 'Lan',  direction: 'i_owe',      currency: 'JPY', principal: 100_000, status: 'open' },
  { id: 'd2', counterparty: 'Hùng', direction: 'owed_to_me', currency: 'JPY', principal:  50_000, status: 'open' },
  { id: 'd3', counterparty: 'Cũ',   direction: 'i_owe',      currency: 'JPY', principal:  10_000, status: 'settled' },
  { id: 'd4', counterparty: 'Mẹ',   direction: 'i_owe',      currency: 'VND', principal: 5_000_000, status: 'open' },
] as never[]

describe('openDebtsFor — chi khoan DANG MO va DUNG CHIEU', () => {
  it('loc theo chieu', () => {
    expect(openDebtsFor(DEBTS, [], 'i_owe').map((d) => d.id)).toEqual(['d1', 'd4'])
    expect(openDebtsFor(DEBTS, [], 'owed_to_me').map((d) => d.id)).toEqual(['d2'])
  })

  it('bo khoan da tat toan', () => {
    expect(openDebtsFor(DEBTS, [], 'i_owe').map((d) => d.id)).not.toContain('d3')
  })

  it('mang theo so CON LAI, khong phai so goc', () => {
    const out = openDebtsFor(DEBTS, [{ debt_id: 'd1', amount: 30_000 }] as never[], 'i_owe')
    expect(out.find((d) => d.id === 'd1')!.remaining).toBe(70_000)
  })

  it('tra het roi (con lai 0) thi khong bay ra nua — khong con gi de tra', () => {
    const out = openDebtsFor(DEBTS, [{ debt_id: 'd1', amount: 100_000 }] as never[], 'i_owe')
    expect(out.map((d) => d.id)).toEqual(['d4'])
  })

  it('lan tra AM la giai ngan them → con lai TANG (xem DebtPaymentRow)', () => {
    const out = openDebtsFor(DEBTS, [{ debt_id: 'd1', amount: -20_000 }] as never[], 'i_owe')
    expect(out.find((d) => d.id === 'd1')!.remaining).toBe(120_000)
  })
})

describe('accountsForDebt — cho tra xuyen te, vi cung te dung truoc', () => {
  const ACC = [
    { id: 'a1', currency: 'JPY', is_archived: false },
    { id: 'a2', currency: 'VND', is_archived: false },
    { id: 'a3', currency: 'JPY', is_archived: true },
    { id: 'a4', currency: 'JPY', is_archived: false },
  ] as never[]

  it('vi KHAC te van hien ra — no ¥ ma tra vao vi ₫ la ca that', () => {
    // Ca that: nguoi ta no minh bang Yen nhung tra bang VND vao tai khoan VN.
    // Ban v1 loc mat vi ₫ nen khong cach nao ghi duoc lan tra do.
    expect(accountsForDebt(ACC, DEBTS[0]).map((a) => a.id)).toContain('a2')
  })

  it('vi CUNG te xep truoc — vi mac dinh phai la vi thuong dung', () => {
    // pickerAccounts[0] la vi mac dinh cua form Nhap; de vi ₫ len dau mot khoan no ¥
    // la mac dinh sai te ma khong ai bam gi.
    expect(accountsForDebt(ACC, DEBTS[0]).map((a) => a.id)).toEqual(['a1', 'a4', 'a2'])
    expect(accountsForDebt(ACC, DEBTS[3]).map((a) => a.id)).toEqual(['a2', 'a1', 'a4'])
  })

  it('giu nguyen thu tu tuong doi trong tung nhom', () => {
    expect(accountsForDebt(ACC, DEBTS[0]).map((a) => a.id)).toEqual(['a1', 'a4', 'a2'])
  })

  it('chua chon khoan no thi bay het vi chua luu tru, khong doi thu tu', () => {
    expect(accountsForDebt(ACC, undefined).map((a) => a.id)).toEqual(['a1', 'a2', 'a4'])
  })

  it('bo vi da luu tru o ca hai nhanh', () => {
    expect(accountsForDebt(ACC, DEBTS[0]).map((a) => a.id)).not.toContain('a3')
    expect(accountsForDebt(ACC, undefined).map((a) => a.id)).not.toContain('a3')
  })
})

describe('prefillFor — dien san so con lai', () => {
  it('chon khoan no thi dien san TOAN BO so con lai', () => {
    // Tra du la ca thuong, va DebtPaymentSheet (duong vao thu nhat) cung mac dinh vay.
    // Hai duong vao cung mot vat thi phai cung mot nep.
    expect(prefillFor(DEBTS, [{ debt_id: 'd1', amount: 30_000 }] as never[], 'd1')).toBe(70_000)
  })

  it('khong tim thay khoan no thi khong dien gi', () => {
    expect(prefillFor(DEBTS, [], 'mat-tieu')).toBeNull()
  })
})
