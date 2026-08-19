import { describe, expect, it } from 'vitest'
import {
  SHAPES, shapeOf, kindsOf, directionOf, categoryPickerOf, chipAriaLabel,
  counterpartyLabelOf, saveVerbOf, PHASE_LABEL,
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

describe('chipAriaLabel', () => {
  it('dang thuong: ten doc duoc = nhan chip', () => {
    expect(chipAriaLabel('spend')).toBe('Chi thường')
    expect(chipAriaLabel('lend')).toBe('Cho vay')
  })

  it('hai dang gui ve VN: he qua vao TEN DOC DUOC, khong chi vao mat', () => {
    // Cung mot hanh dong vat ly, tac dong tai san TRAI NHAU. Nghe bang trinh doc
    // man hinh ma khong co cau nay thi khong the chon dung.
    expect(chipAriaLabel('family')).toBe('Gửi gia đình — Tiền cho đi — tính là chi tiêu, vào trần.')
    expect(chipAriaLabel('ownvn'))
      .toBe('Tài khoản tôi ở VN — Vẫn là tiền của bạn — không phải chi tiêu, chỉ đổi đồng tiền.')
  })

  it('dung tam dang khong co hint thi khong co dau gach thua', () => {
    const plain = (['spend','split','lend','repay','earn','collect','borrow','between'] as const)
    for (const k of plain) expect(chipAriaLabel(k)).not.toContain('—')
  })
})

describe('counterpartyLabelOf', () => {
  it('goi dung ten o tung dang, khong dung mot nhan chung', () => {
    expect(counterpartyLabelOf('split')).toBe('Ai nợ mình')
    expect(counterpartyLabelOf('lend')).toBe('Cho ai vay')
    expect(counterpartyLabelOf('borrow')).toBe('Vay của ai')
  })

  it('bay dang con lai khong co o do', () => {
    for (const k of ['spend','family','repay','earn','collect','between','ownvn'] as const) {
      expect(counterpartyLabelOf(k)).toBeUndefined()
    }
  })

  it('KHONG con nhan "Chia voi ai" — no la ten cua mot o gop hai viec', () => {
    for (const k of ['split','lend','borrow'] as const) {
      expect(counterpartyLabelOf(k)).not.toMatch(/Chia với ai/)
    }
  })
})

describe('saveVerbOf — nhan nut Luu nhac lai viec se lam', () => {
  it('ba moc cua goi ban giao', () => {
    expect(saveVerbOf('family', 30_000, 'JPY', null)).toBe('gửi ¥30,000 cho gia đình')
    expect(saveVerbOf('spend', 3_480, 'JPY', 'Cơm ngoài')).toBe('chi ¥3,480 vào Cơm ngoài')
    expect(saveVerbOf('ownvn', 30_000, 'JPY', null)).toBe('chuyển ¥30,000 sang tài khoản ở VN')
  })

  it('hai dang gui ve VN noi HAI viec khac nhau — cung hanh dong vat ly, khac but toan', () => {
    expect(saveVerbOf('family', 30_000, 'JPY', null))
      .not.toBe(saveVerbOf('ownvn', 30_000, 'JPY', null))
  })

  it('moi dang co mot cau rieng, va cau nao cung co so tien', () => {
    const all = (Object.keys(SHAPES) as EntryKind[]).map((k) => saveVerbOf(k, 1_000, 'JPY', null))
    expect(new Set(all).size).toBe(10)
    for (const s of all) expect(s).toContain('¥1,000')
  })

  it('chua chon danh muc thi khong de lai chu "vao" lung lo', () => {
    expect(saveVerbOf('spend', 3_480, 'JPY', null)).toBe('chi ¥3,480')
    expect(saveVerbOf('earn', 3_480, 'JPY', null)).toBe('thu ¥3,480')
  })
})

describe('PHASE_LABEL', () => {
  it('nhan hai pha di theo huong, va KHONG dung chu "Nhac sau"', () => {
    // Chi hai cot: nhan o ngay cua khoan sap chi doc theo `precision` chu khong theo
    // huong tien, nen no nam o PlannedFields.tsx (xem chu thich cua PHASE_LABEL).
    expect(PHASE_LABEL.out).toEqual({ done: 'Đã chi', future: 'Sẽ chi' })
    expect(PHASE_LABEL.in.future).toBe('Sẽ thu')
    expect(PHASE_LABEL.move.future).toBe('Sẽ chuyển')
    for (const p of Object.values(PHASE_LABEL)) {
      expect(p.done).not.toMatch(/nhắc/i)
      expect(p.future).not.toMatch(/nhắc/i)
    }
  })
})
