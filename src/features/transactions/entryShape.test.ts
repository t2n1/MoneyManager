import { describe, expect, it } from 'vitest'
import {
  SHAPES, shapeOf, kindsOf, directionOf, categoryPickerOf,
  type EntryKind,
} from './entryShape'

/**
 * Bảng này ĐỌC Y NHƯ bảng trong spec §"Mô hình". Sửa spec thì sửa đây, và
 * ngược lại — đó là điểm của việc tách file thuần ra.
 */
const B23: [EntryKind, string, string, string, string][] = [
  // kind,      direction, categoryPicker, capBase,   amountLabel
  ['spend',     'out',     'user',         'full',    'Số tiền'],
  ['split',     'out',     'user',         'myShare', 'Tổng đã trả'],
  ['family',    'out',     'auto',         'full',    'Số gửi'],
  ['lend',      'out',     'auto',         'none',    'Số tiền gốc'],
  ['repay',     'out',     'auto',         'none',    'Số trả'],
  ['earn',      'in',      'user',         'none',    'Số tiền'],
  ['collect',   'in',      'auto',         'none',    'Số nhận lại'],
  ['borrow',    'in',      'auto',         'none',    'Số tiền gốc'],
  ['between',   'move',    'none',         'none',    'Chuyển đi'],
  ['ownvn',     'move',    'none',         'none',    'Số gửi'],
]

describe('bang 10 dang khop spec B23', () => {
  it('co dung 10 dang, khong hon khong kem', () => {
    expect(Object.keys(SHAPES)).toHaveLength(10)
  })

  it.each(B23)('%s: huong/danh muc/tran/nhan o tien', (kind, dir, pick, cap, label) => {
    const s = shapeOf(kind)
    expect(s.direction).toBe(dir)
    expect(s.categoryPicker).toBe(pick)
    expect(s.capBase).toBe(cap)
    expect(s.amountLabel).toBe(label)
  })

  it('kindsOf tra ve dung thu tu chip cua tung huong', () => {
    expect(kindsOf('out')).toEqual(['spend', 'split', 'family', 'lend', 'repay'])
    expect(kindsOf('in')).toEqual(['earn', 'collect', 'borrow'])
    expect(kindsOf('move')).toEqual(['between', 'ownvn'])
  })

  it('moi dang thuoc dung mot huong', () => {
    const all = (['out', 'in', 'move'] as const).flatMap((d) => kindsOf(d))
    expect(new Set(all).size).toBe(10)
    for (const k of all) expect(kindsOf(directionOf(k))).toContain(k)
  })
})

describe('dan xuat ra but toan cu', () => {
  it('tam dang di qua createTransaction, hai dang di qua createDebtPayment', () => {
    const tx = Object.values(SHAPES).filter((s) => s.writes === 'transaction')
    const dp = Object.values(SHAPES).filter((s) => s.writes === 'debtPayment')
    expect(tx).toHaveLength(8)
    expect(dp.map((s) => s.kind).sort()).toEqual(['collect', 'repay'])
  })

  it('gui gia dinh la CHI (roi khoi tai san), tai khoan VN la CHUYEN KHOAN', () => {
    expect(shapeOf('family').txType).toBe('expense')
    expect(shapeOf('family').roleSeed).toEqual({ role: 'remit', remitKind: 'expense' })
    expect(shapeOf('ownvn').txType).toBe('transfer')
    expect(shapeOf('ownvn').roleSeed).toEqual({ role: 'remit', remitKind: 'transfer' })
  })

  it('minh vay duoc la TIEN VAO du no tang', () => {
    expect(shapeOf('borrow').txType).toBe('income')
    expect(shapeOf('borrow').roleSeed).toEqual({ role: 'debt', debtDirection: 'i_owe' })
  })

  it('cho vay la tien ra', () => {
    expect(shapeOf('lend').txType).toBe('expense')
    expect(shapeOf('lend').roleSeed).toEqual({ role: 'debt', debtDirection: 'owed_to_me' })
  })

  it('repay/collect khong khai txType — suy tu chieu khoan no da chon', () => {
    expect(shapeOf('repay').txType).toBeNull()
    expect(shapeOf('collect').txType).toBeNull()
  })
})

describe('categoryPickerOf phu thuoc withTransaction', () => {
  it('lend/borrow tat withTransaction thi khong co giao dich nen khong co danh muc', () => {
    expect(categoryPickerOf('lend', true)).toBe('auto')
    expect(categoryPickerOf('lend', false)).toBe('none')
    expect(categoryPickerOf('borrow', true)).toBe('auto')
    expect(categoryPickerOf('borrow', false)).toBe('none')
  })

  it('cac dang khac khong doi theo withTransaction', () => {
    for (const k of ['spend', 'split', 'family', 'earn', 'between', 'ownvn'] as EntryKind[]) {
      expect(categoryPickerOf(k, false)).toBe(shapeOf(k).categoryPicker)
    }
  })
})

describe('hai dang gui ve VN phai noi ro he qua', () => {
  it('chi hai dang do co chu phu, va chu phu noi ve tai san', () => {
    const withHint = Object.values(SHAPES).filter((s) => s.hint)
    expect(withHint.map((s) => s.kind).sort()).toEqual(['family', 'ownvn'])
    expect(shapeOf('family').hint).toContain('chi tiêu')
    expect(shapeOf('ownvn').hint).toContain('không phải chi tiêu')
  })
})
