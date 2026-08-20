import { describe, expect, it } from 'vitest'
import { debtPaymentPosting } from './debtPaymentPosting'

describe('debtPaymentPosting', () => {
  it('origin earned → THU that: khong co co no, danh muc lay tu khoan no', () => {
    const got = debtPaymentPosting({ origin: 'earned', income_category_id: 'cat-lam-them' }, 'cat-no')
    expect(got).toEqual({ isDebtFlow: false, categoryId: 'cat-lam-them' })
  })

  it('danh muc cua khoan no DE danh muc nguoi goi dung san', () => {
    // Khach tra ba lan tu hai cua khac nhau van vao cung mot danh muc.
    const got = debtPaymentPosting(
      { origin: 'earned', income_category_id: 'cat-lam-them' },
      'cat-khac',
    )
    expect(got.categoryId).toBe('cat-lam-them')
  })

  it('origin lent → y nhu truoc 0049', () => {
    expect(debtPaymentPosting({ origin: 'lent', income_category_id: null }, 'cat-no')).toEqual({
      isDebtFlow: true,
      categoryId: 'cat-no',
    })
  })

  it('origin null (moi khoan no cu) → y nhu truoc 0049', () => {
    expect(debtPaymentPosting({ origin: null, income_category_id: null }, 'cat-no')).toEqual({
      isDebtFlow: true,
      categoryId: 'cat-no',
    })
  })

  it('khong tim thay khoan no → duong cu, KHONG doan la thu that', () => {
    // Hai chieu doan sai khong ngang gia: doan "no thuong" thi te nhat la mot khoan thu
    // bi thieu va sua tay duoc; doan "thu that" thi mot khoan cho vay quay ve tu hien
    // ra thanh thu nhap.
    expect(debtPaymentPosting(null, 'cat-no')).toEqual({ isDebtFlow: true, categoryId: 'cat-no' })
    expect(debtPaymentPosting(undefined, null)).toEqual({ isDebtFlow: true, categoryId: null })
  })
})

describe('ban build len truoc migration 0049', () => {
  it('hang no THIEU HAN hai khoa → duong cu, khong no', () => {
    // Truoc khi 0049 chay, `select('*')` tra ve hang khong co khoa `origin`. Doc no ra
    // undefined, va nhanh 'earned' khong bat — tuc moi lan tra ghi y nhu hom nay.
    // Neu ai doi lai thanh `.select('origin, income_category_id')` thi Postgres bao loi
    // cot khong ton tai va MOI lan tra no hong, ke ca hai duong da chay tot tu truoc.
    const truocMigration = {} as Parameters<typeof debtPaymentPosting>[0]
    expect(debtPaymentPosting(truocMigration, 'cat-no')).toEqual({
      isDebtFlow: true,
      categoryId: 'cat-no',
    })
  })
})
