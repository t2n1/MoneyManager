import { describe, expect, it } from 'vitest'
import type { DebtPaymentRow, DebtRow } from '../../types/database.types'
import { KHOA_LUU_NO_CU, KHONG_TRU_NO, chonNoMacDinh, khoaLuuNo, khoanNoCoTheChon, noDaChon, tenGanGiong } from './chonNo'

const debt = (p: Partial<DebtRow> & { id: string; counterparty: string }): DebtRow =>
  ({
    user_id: 'u', direction: 'owed_to_me', currency: 'JPY', principal: 50_000, due_on: null, status: 'open',
    origin: null, income_category_id: null, note: '', interest_bps: null, term_months: null,
    disbursement_transaction_id: null, created_at: '', updated_at: '', ...p,
  }) as DebtRow
const pay = (debtId: string, amount: number): DebtPaymentRow =>
  ({ id: `p${amount}`, user_id: 'u', debt_id: debtId, amount, paid_on: '2026-07-01', transaction_id: null, note: '', created_at: '' }) as DebtPaymentRow

const KOME = debt({ id: 'kome', counterparty: 'KOME' })
const MINH = debt({ id: 'minh', counterparty: 'Minh KOME' })
const CTY = debt({ id: 'cty', counterparty: 'Công ty Kome' })

describe('khoanNoCoTheChon', () => {
  it('chỉ khoản người ta nợ mình, còn mở', () => {
    const ds = khoanNoCoTheChon([
      KOME,
      debt({ id: 'no', counterparty: 'Ngân hàng', direction: 'i_owe' }),
      debt({ id: 'xong', counterparty: 'KOME cũ', status: 'settled' }),
    ])
    expect(ds.map((d) => d.id)).toEqual(['kome'])
  })
})

describe('chonNoMacDinh', () => {
  it('chưa lưu gì + có khoản tên đúng "KOME" → chọn sẵn khoản đó', () => {
    expect(chonNoMacDinh([MINH, KOME], null)).toBe('kome')
  })
  it('chưa lưu gì + chỉ có "Minh KOME" → KHÔNG tự chọn (đó là một người khác)', () => {
    expect(chonNoMacDinh([MINH, CTY], null)).toBeNull()
  })
  it('đã lưu một khoản còn mở → dùng khoản đó, kể cả tên khác "KOME"', () => {
    expect(chonNoMacDinh([MINH, KOME, CTY], 'cty')).toBe('cty')
  })
  it('đã lưu "Không trừ vào nợ" → null dù có khoản tên đúng', () => {
    expect(chonNoMacDinh([KOME], KHONG_TRU_NO)).toBeNull()
  })
  it('khoản đã lưu không còn mở / đã xoá → quay về luật mặc định', () => {
    expect(chonNoMacDinh([KOME, debt({ id: 'cty', counterparty: 'Công ty Kome', status: 'settled' })], 'cty')).toBe('kome')
    expect(chonNoMacDinh([MINH], 'da-xoa')).toBeNull()
  })
})

describe('noDaChon', () => {
  it('tính số còn nợ = gốc − các lần trả, kèm tên đối tác', () => {
    expect(noDaChon([KOME], [pay('kome', 20_000), pay('khac', 1)], 'kome')).toEqual({ id: 'kome', conLai: 30_000, ten: 'KOME' })
  })
  it('null khi không chọn hoặc id không có', () => {
    expect(noDaChon([KOME], [], null)).toBeNull()
    expect(noDaChon([KOME], [], 'x')).toBeNull()
  })
})

describe('tenGanGiong', () => {
  it('không phân biệt hoa/thường, bỏ tên đúng', () => {
    expect(tenGanGiong([KOME, MINH, CTY])).toEqual(['Minh KOME', 'Công ty Kome'])
  })
})

describe('khoaLuuNo', () => {
  it('mỗi người dùng một khoá, không trùng khoá cũ dùng chung', () => {
    expect(khoaLuuNo('u1')).not.toBe(khoaLuuNo('demo-user'))
    expect(khoaLuuNo('u1')).not.toBe(KHOA_LUU_NO_CU)
  })
})
