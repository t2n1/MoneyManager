import { describe, expect, it } from 'vitest'
import type { DebtRow } from '../../types/database.types'
import { matchOpenDebt, type OpenDebtQuery } from './matchOpenDebt'

/** Khoản nợ tối thiểu — `as DebtRow` để không phải dựng cả 16 cột cho mỗi ca. */
const debt = (over: Partial<DebtRow> = {}) =>
  ({
    id: 'd1',
    status: 'open',
    direction: 'owed_to_me',
    currency: 'JPY',
    counterparty: 'Anh Hai',
    origin: null,
    income_category_id: null,
    ...over,
  }) as DebtRow

const q = (over: Partial<OpenDebtQuery> = {}): OpenDebtQuery => ({
  direction: 'owed_to_me',
  currency: 'JPY',
  counterparty: 'Anh Hai',
  existingDebtId: null,
  origin: null,
  incomeCategoryId: null,
  ...over,
})

describe('matchOpenDebt', () => {
  it('cung ten + cung chieu + cung tien → gop', () => {
    expect(matchOpenDebt([debt()], q())?.id).toBe('d1')
  })

  it('KHONG phan biet chu hoa/dau cach o ten', () => {
    expect(matchOpenDebt([debt({ counterparty: '  ANH HAI ' })], q())?.id).toBe('d1')
  })

  it('khac chieu / khac tien / da settled → khong gop', () => {
    expect(matchOpenDebt([debt({ direction: 'i_owe' })], q())).toBeNull()
    expect(matchOpenDebt([debt({ currency: 'VND' })], q())).toBeNull()
    expect(matchOpenDebt([debt({ status: 'settled' })], q())).toBeNull()
  })

  it('KHAC origin → khong gop, du trung ten', () => {
    // Bay im lang: cho "Anh Hai" vay tien mat (origin null) roi ghi "Anh Hai no tien
    // cong". Gop lai la moi lan Anh Hai tra sau do khong vao Thu — khong co cau bao nao.
    expect(
      matchOpenDebt([debt({ origin: null })], q({ origin: 'earned', incomeCategoryId: 'c1' })),
    ).toBeNull()
    expect(matchOpenDebt([debt({ origin: 'earned', income_category_id: 'c1' })], q())).toBeNull()
  })

  it('cung earned nhung KHAC danh muc thu → khong gop', () => {
    // Gop lai thi phai chon mot trong hai danh muc, tuc mot nua so tien vao sai cho.
    const d = debt({ origin: 'earned', income_category_id: 'c1' })
    expect(matchOpenDebt([d], q({ origin: 'earned', incomeCategoryId: 'c2' }))).toBeNull()
    expect(matchOpenDebt([d], q({ origin: 'earned', incomeCategoryId: 'c1' }))?.id).toBe('d1')
  })

  it('existingDebtId van phai qua cong origin', () => {
    // Chon tay mot khoan khac origin cung khong duoc gop. Picker se loc san (Task 7),
    // nhung ham nay khong duoc dua vao viec do.
    const d = debt({ id: 'd9', origin: null })
    expect(
      matchOpenDebt(
        [d],
        q({ existingDebtId: 'd9', counterparty: '', origin: 'earned', incomeCategoryId: 'c1' }),
      ),
    ).toBeNull()
    expect(matchOpenDebt([d], q({ existingDebtId: 'd9', counterparty: '' }))?.id).toBe('d9')
  })

  it('ten trong va khong chon gi → khong gop bua', () => {
    expect(matchOpenDebt([debt({ counterparty: '' })], q({ counterparty: '' }))).toBeNull()
  })

  it('danh sach rong → null', () => {
    expect(matchOpenDebt([], q())).toBeNull()
  })
})
