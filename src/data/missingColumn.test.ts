import { describe, expect, it } from 'vitest'
import { COT_GIAO_DICH_MOI, isMissingColumnError, runDropMissingColumns } from './missingColumn'

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

describe('runDropMissingColumns', () => {
  const thieu = (col: string) => ({
    data: null,
    error: { code: 'PGRST204', message: `Could not find the '${col}' column of 'transactions'` },
  })
  const ok = { data: 'ok', error: null }

  it('không lỗi → chạy đúng một lần với payload nguyên', async () => {
    const seen: object[] = []
    const r = await runDropMissingColumns({ a: 1, owner: 'mine' }, COT_GIAO_DICH_MOI, async (p) => {
      seen.push(p)
      return ok
    })
    expect(r).toBe(ok)
    expect(seen).toEqual([{ a: 1, owner: 'mine' }])
  })

  it('thiếu lần lượt hai cột → bỏ từng cột rồi chạy lại, ở mọi dòng của lô', async () => {
    const missing = new Set(['adjust_kind', 'owner'])
    const seen: object[] = []
    const rows = [
      { a: 1, adjust_kind: 'balance', owner: 'mine' },
      { a: 2, owner: 'partner' },
    ]
    const r = await runDropMissingColumns(rows, COT_GIAO_DICH_MOI, async (p) => {
      seen.push(p)
      const col = [...missing].find((c) => p.some((row) => c in row))
      return col ? thieu(col) : ok
    })
    expect(r).toBe(ok)
    expect(seen).toHaveLength(3)
    expect(seen[2]).toEqual([{ a: 1 }, { a: 2 }])
  })

  it('thiếu cột payload KHÔNG mang, hoặc cột ngoài danh sách → trả lỗi, không lặp', async () => {
    let n = 0
    const r1 = await runDropMissingColumns({ a: 1 }, COT_GIAO_DICH_MOI, async () => {
      n++
      return thieu('owner')
    })
    expect(r1.error).not.toBeNull()
    const r2 = await runDropMissingColumns({ la: 1 }, COT_GIAO_DICH_MOI, async () => {
      n++
      return thieu('la')
    })
    expect(r2.error).not.toBeNull()
    expect(n).toBe(2)
  })

  it('DB cứ báo thiếu cùng một cột → dừng sau khi đã bỏ nó một lần', async () => {
    let n = 0
    const r = await runDropMissingColumns({ owner: 'mine' }, COT_GIAO_DICH_MOI, async () => {
      n++
      return thieu('owner')
    })
    expect(r.error).not.toBeNull()
    expect(n).toBe(2)
  })
})
