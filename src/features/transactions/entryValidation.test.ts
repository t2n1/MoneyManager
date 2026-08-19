import { describe, expect, it } from 'vitest'
import { initialDebt, initialRemit, initialSplit } from './entryRoles'
import { entryGate, plannedModeActive, type EntryState } from './entryValidation'

function st(p: Partial<EntryState> = {}): EntryState {
  return {
    amount: 1_000,
    hasAccount: true,
    type: 'expense',
    kind: 'spend',
    withTransaction: true,
    plannedMode: false,
    hasCategory: true,
    categoryGridEmpty: false,
    note: '',
    accountId: 'a1',
    toAccountId: null,
    crossCurrency: false,
    toAmount: 0,
    split: initialSplit(),
    debt: initialDebt(),
    remit: initialRemit(),
    splitBackAccountIds: [],
    ...p,
  }
}

describe('plannedModeActive', () => {
  const base = { remindLater: true, canPlan: true, kind: 'spend' as const }

  it('bật với khoản chi thường', () => {
    expect(plannedModeActive(base)).toBe(true)
  })

  // Nút bật/tắt "Nhắc sau" chỉ hiện với khoản CHI thường (kind 'spend'). Nếu cờ thô
  // còn hiệu lực sau khi đổi dạng thì nút Lưu ghi "Tạo lời nhắc" mà không cách nào
  // tắt, và bấm vào là tạo một khoản sắp CHI từ một khoản khác.
  it('tắt khi đổi sang thu hoặc chuyển khoản', () => {
    expect(plannedModeActive({ ...base, kind: 'earn' })).toBe(false)
    expect(plannedModeActive({ ...base, kind: 'between' })).toBe(false)
  })

  it('tắt khi đang bật một dạng đặc biệt', () => {
    expect(plannedModeActive({ ...base, kind: 'lend' })).toBe(false)
    expect(plannedModeActive({ ...base, kind: 'split' })).toBe(false)
  })

  it('tắt khi form không nhận việc tạo lời nhắc (màn Sửa)', () => {
    expect(plannedModeActive({ ...base, canPlan: false })).toBe(false)
  })
})

describe('entryGate — giao dịch thường', () => {
  it('đủ tiền + tài khoản + danh mục → lưu được, không câu nào', () => {
    expect(entryGate(st())).toEqual({ canSave: true, missing: null })
  })

  // Đây là chỗ hỏng cũ: nút mờ mà không dòng nào nói vì sao.
  it('thiếu số tiền → nói thiếu số tiền', () => {
    expect(entryGate(st({ amount: 0 }))).toEqual({
      canSave: false,
      missing: 'Còn thiếu: số tiền.',
    })
  })

  it('thiếu danh mục → chỉ đúng chỗ phải bấm', () => {
    const r = entryGate(st({ hasCategory: false }))
    expect(r.canSave).toBe(false)
    expect(r.missing).toMatch(/chọn danh mục/)
  })

  it('loại này không còn danh mục nào → chỉ sang Cài đặt, đừng bảo chọn ở lưới trống', () => {
    const r = entryGate(st({ hasCategory: false, categoryGridEmpty: true }))
    expect(r.missing).toMatch(/Cài đặt/)
  })

  it('thiếu tài khoản', () => {
    expect(entryGate(st({ hasAccount: false })).missing).toBe('Còn thiếu: tài khoản.')
  })

  it('thu cũng đòi danh mục như chi', () => {
    expect(entryGate(st({ kind: 'earn', hasCategory: false })).canSave).toBe(false)
    expect(entryGate(st({ kind: 'earn' })).canSave).toBe(true)
  })
})

describe('entryGate — chuyển khoản', () => {
  const tr = (p: Partial<EntryState> = {}) =>
    entryGate(st({ kind: 'between', hasCategory: false, ...p }))

  it('thiếu tài khoản đến', () => {
    expect(tr().missing).toBe('Còn thiếu: tài khoản ĐẾN.')
  })

  it('đủ hai tài khoản, cùng loại tiền → lưu được (không đòi danh mục)', () => {
    expect(tr({ toAccountId: 'a2' })).toEqual({ canSave: true, missing: null })
  })

  it('trùng tài khoản nguồn → không lưu', () => {
    expect(tr({ toAccountId: 'a1' }).canSave).toBe(false)
  })

  it('khác loại tiền thì phải có số nhận', () => {
    expect(tr({ toAccountId: 'a2', crossCurrency: true }).missing).toBe(
      'Còn thiếu: số tiền nhận được.',
    )
    expect(tr({ toAccountId: 'a2', crossCurrency: true, toAmount: 50 }).canSave).toBe(true)
  })
})

describe('entryGate — Nhắc sau', () => {
  const pl = (p: Partial<EntryState> = {}) =>
    entryGate(st({ plannedMode: true, hasCategory: false, amount: 0, ...p }))

  it('không đòi số tiền, nhưng đòi một cái tên', () => {
    expect(pl().missing).toMatch(/tên lời nhắc/)
    expect(pl({ note: 'Tìm nhà mới' })).toEqual({ canSave: true, missing: null })
    expect(pl({ hasCategory: true }).canSave).toBe(true)
  })
})

describe('entryGate — dạng đặc biệt', () => {
  it('thiếu số tiền thì gọi đúng tên ô của dạng', () => {
    expect(entryGate(st({ kind: 'split', amount: 0 })).missing).toBe('Còn thiếu: Tổng đã trả.')
    expect(entryGate(st({ kind: 'borrow', amount: 0 })).missing).toBe('Còn thiếu: Số tiền gốc.')
    expect(entryGate(st({ kind: 'family', amount: 0 })).missing).toBe('Còn thiếu: Số gửi.')
  })

  it('trả hộ: đòi phần người khác, rồi tên người nợ, rồi danh mục', () => {
    const s = (p: Partial<EntryState['split']>) =>
      entryGate(st({ kind: 'split', split: { ...initialSplit(), ...p } }))
    expect(s({}).missing).toMatch(/phần người khác trả lại/)
    expect(s({ settle: 'later', others: 400 }).missing).toMatch(/tên người nợ mình/)
    expect(s({ settle: 'later', others: 400, counterparty: 'Minh' }).canSave).toBe(true)
    expect(s({ settle: 'later', others: 2_000, counterparty: 'Minh' }).missing).toMatch(
      /lớn hơn tổng/,
    )
  })

  it('trả hộ: trả đủ vào chính ví đã trả → không có gì để ghi', () => {
    const r = entryGate(
      st({ kind: 'split', split: { ...initialSplit(), others: 1_000, settle: 'now' } }),
    )
    expect(r.canSave).toBe(false)
    expect(r.missing).toMatch(/không có gì để ghi/)
  })

  it('trả hộ: ví nhận lại đã lạc khỏi danh sách hợp lệ', () => {
    const r = entryGate(
      st({
        kind: 'split',
        split: { ...initialSplit(), others: 400, receivedAccountId: 'cu' },
        splitBackAccountIds: ['moi'],
      }),
    )
    expect(r.missing).toMatch(/không còn hợp lệ/)
  })

  it('ghi nợ: đòi tên, đúng chiều nợ (lend vs borrow)', () => {
    expect(entryGate(st({ kind: 'borrow' })).missing).toMatch(/tên chủ nợ/)
    expect(
      entryGate(st({ kind: 'lend', debt: { ...initialDebt(), direction: 'owed_to_me' } })).missing,
    ).toMatch(/tên người vay/)
    expect(
      entryGate(st({ kind: 'borrow', debt: { ...initialDebt(), counterparty: 'Hà' } })).canSave,
    ).toBe(true)
  })

  it('gửi về VN: đòi tài khoản đích rồi số nhận', () => {
    // remit.kind ('expense'|'transfer') quyết định EntryState.kind là family hay ownvn —
    // xem bảng chuyển đổi task 4: role 'remit' + remit.kind 'transfer' → 'ownvn'.
    const r = (p: Partial<EntryState['remit']>) => {
      const remit = { ...initialRemit(), ...p }
      return entryGate(st({ kind: remit.kind === 'transfer' ? 'ownvn' : 'family', remit }))
    }
    expect(r({ kind: 'transfer' }).missing).toMatch(/tài khoản VND/)
    expect(r({}).missing).toMatch(/số nhận/)
    expect(r({ received: 1_600_000 }).canSave).toBe(true)
  })
})

describe('gate doc kind, khong doc role', () => {
  it('dang thuong thieu so tien thi noi thieu so tien', () => {
    const g = entryGate(st({ kind: 'spend', amount: 0 }))
    expect(g.canSave).toBe(false)
    expect(g.missing).toBe('Còn thiếu: số tiền.')
  })

  it('dang khong co luoi danh muc thi KHONG doi chon danh muc', () => {
    // family/lend/borrow/between/ownvn: categoryPicker khac 'user' → luoi an, nen
    // "chon danh muc o luoi phia tren" la cau vo nghia (khong co luoi nao).
    for (const kind of ['family', 'lend', 'borrow', 'between', 'ownvn'] as const) {
      const g = entryGate(st({ kind, amount: 1000, hasCategory: false }))
      expect(g.missing).not.toMatch(/chọn danh mục/)
    }
  })

  it('dang co luoi danh muc thi van doi chon danh muc', () => {
    for (const kind of ['spend', 'earn'] as const) {
      const g = entryGate(st({ kind, amount: 1000, hasCategory: false }))
      expect(g.missing).toMatch(/chọn danh mục/)
    }
  })

  it('nhan o tien trong cau thieu lay tu bang, khong hard-code', () => {
    expect(entryGate(st({ kind: 'split', amount: 0 })).missing)
      .toBe('Còn thiếu: Tổng đã trả.')
    expect(entryGate(st({ kind: 'family', amount: 0 })).missing)
      .toBe('Còn thiếu: Số gửi.')
    expect(entryGate(st({ kind: 'lend', amount: 0 })).missing)
      .toBe('Còn thiếu: Số tiền gốc.')
  })
})
