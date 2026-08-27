import { describe, expect, it } from 'vitest'
import { dungCauHoi, LUAT_HOI, type MocDeTra } from './traSo'

const moc = (over: Partial<MocDeTra> & Pick<MocDeTra, 'nhan'>): MocDeTra => ({
  kind: 'expense',
  namBatDau: 2029,
  namKetThuc: null,
  nuoc: 'JP',
  tien: 'JPY',
  ...over,
})

describe('dungCauHoi — mốc sinh từ mẫu', () => {
  it('nhận ra nhãn có sẵn và dùng luật riêng của nó', () => {
    const r = dungCauHoi(moc({ nhan: 'Chi phí cưới' }))
    expect(r.laMocCoSan).toBe(true)
    expect(r.van).toContain('ご祝儀')
    expect(r.van).toContain('2029')
    expect(r.van).toContain('JPY')
  })

  it('mốc THU được nói rõ là khoản thu', () => {
    const r = dungCauHoi(moc({ nhan: 'Trợ cấp trẻ em (児童手当)', kind: 'income' }))
    expect(r.laMocCoSan).toBe(true)
    expect(r.van).toContain('khoản THU')
  })
})

describe('dungCauHoi — mốc tự đặt tên', () => {
  it('nhãn lạ thì laMocCoSan false và nhãn đi vào câu hỏi nguyên văn', () => {
    const r = dungCauHoi(moc({ nhan: 'Sửa bếp' }))
    expect(r.laMocCoSan).toBe(false)
    expect(r.van).toContain('Sửa bếp')
  })

  it('đổi tên một mốc có sẵn thì rơi về tra chung, không nổ', () => {
    const r = dungCauHoi(moc({ nhan: 'Chi phí cưới ' })) // thừa một dấu cách
    expect(r.laMocCoSan).toBe(false)
  })

  it('mốc có năm kết thúc thì nói rõ là số MỖI NĂM', () => {
    const r = dungCauHoi(moc({ nhan: 'Sửa bếp', namBatDau: 2030, namKetThuc: 2035 }))
    expect(r.van).toContain('mỗi năm trong khoảng 2030–2035')
  })
})

describe('khoá riêng tư', () => {
  const NHAN_CO_SAN = Object.keys(LUAT_HOI)

  it('có đúng 11 loại mốc có sẵn', () => {
    expect(NHAN_CO_SAN).toHaveLength(11)
  })

  it('MocDeTra không mang trường tiền nào', () => {
    const m = moc({ nhan: 'Chi phí cưới' })
    expect(Object.keys(m).sort()).toEqual(
      ['kind', 'nhan', 'namBatDau', 'namKetThuc', 'nuoc', 'tien'].sort(),
    )
  })

  it('câu hỏi của mốc có sẵn KHÔNG chứa nhãn mốc', () => {
    // Đây là tính chất riêng tư thật sự: với mốc có sẵn, câu hỏi dựng TỪ LUẬT, nên
    // không có chữ nào của người dùng đi ra ngoài. Nếu ai đó về sau chèn nhãn vào câu
    // hỏi, test này đỏ — và nó PHẢI đỏ, vì đó là đổi lời hứa.
    for (const nhan of NHAN_CO_SAN) {
      const van = dungCauHoi(moc({ nhan, namBatDau: 2029, namKetThuc: null })).van
      expect(van).not.toContain(nhan)
    }
  })

  it('câu hỏi của mốc có sẵn không chứa số nào ngoài năm', () => {
    // Số dư, thu nhập, số tiền hiện tại của mốc KHÔNG được có đường nào lọt vào.
    // Năm là số duy nhất được phép, và nó nằm trong khoảng 1900–2200.
    //
    // KHÔNG có lối thoát "chữ số này có trong nhãn": test trên đã khẳng định nhãn không
    // hề xuất hiện, nên một lối thoát như vậy chỉ che mất rò rỉ chứ không cứu ca thật nào.
    for (const nhan of NHAN_CO_SAN) {
      const van = dungCauHoi(moc({ nhan, namBatDau: 2029, namKetThuc: null })).van
      // Bỏ phần khuôn trả lời (có đánh số 1. 2. 3.) — chỉ soi phần mô tả mốc.
      const phanMoTa = van.split('CÁCH TRẢ LỜI')[0]
      for (const s of phanMoTa.match(/\d+/g) ?? []) {
        const n = Number(s)
        expect(n >= 1900 && n <= 2200).toBe(true)
      }
    }
  })
})
