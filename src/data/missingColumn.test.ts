import { describe, expect, it } from 'vitest'
import { isMissingColumnError } from './missingColumn'

describe('isMissingColumnError', () => {
  it('PostgREST PGRST204 nhắc đúng cột → true', () => {
    const e = {
      code: 'PGRST204',
      message: "Could not find the 'adjust_kind' column of 'transactions' in the schema cache",
    }
    expect(isMissingColumnError(e, 'adjust_kind')).toBe(true)
  })

  it('Postgres 42703 nhắc đúng cột → true', () => {
    const e = { code: '42703', message: 'column transactions.adjust_kind does not exist' }
    expect(isMissingColumnError(e, 'adjust_kind')).toBe(true)
  })

  it('thiếu cột KHÁC → false (không nuốt lỗi của cột khác)', () => {
    const e = { code: 'PGRST204', message: "Could not find the 'owner' column of 'transactions'" }
    expect(isMissingColumnError(e, 'adjust_kind')).toBe(false)
  })

  it('lỗi khác (vi phạm CHECK) hoặc không lỗi → false', () => {
    expect(isMissingColumnError({ code: '23514', message: 'adjust_kind check' }, 'adjust_kind')).toBe(false)
    expect(isMissingColumnError(null, 'adjust_kind')).toBe(false)
  })
})
