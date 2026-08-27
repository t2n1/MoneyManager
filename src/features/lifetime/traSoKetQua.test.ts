import { describe, expect, it } from 'vitest'
import { docKetQua, laLoi, type KetQuaTra } from './traSoKetQua'

const tho = (over: Record<string, unknown> = {}) => ({
  khong_biet: false,
  tien: 'JPY',
  thap: 1_100_000,
  giua: 1_700_000,
  cao: 3_400_000,
  dien_giai: 'Đã trừ ご祝儀 ước tính cho 52 khách.',
  canh_bao: ['Khảo sát 2025 đổi cách đo, không so được với 2024.'],
  nguon: { ten: 'ゼクシィ結婚トレンド調査', url: 'https://souken.zexy.net/', nam: 2024 },
  ...over,
})

describe('docKetQua — ca tốt', () => {
  it('quy sang minor units theo số lẻ của đồng tiền', () => {
    const r = docKetQua(tho(), 'JPY') as KetQuaTra
    expect(laLoi(r)).toBe(false)
    // JPY có 0 số lẻ → minor bằng major
    expect(r.thapMinor).toBe(1_100_000)
    expect(r.giuaMinor).toBe(1_700_000)
    expect(r.caoMinor).toBe(3_400_000)
    expect(r.nguon.ten).toBe('ゼクシィ結婚トレンド調査')
    expect(r.canhBao).toHaveLength(1)
  })
})

describe('docKetQua — bốn ca hỏng', () => {
  it('sai đồng tiền thì chặn, KHÔNG tự quy đổi', () => {
    const r = docKetQua(tho({ tien: 'USD' }), 'JPY')
    expect(laLoi(r) && r.loi).toBe('sai-tien')
  })

  it('không có nguồn thì từ chối', () => {
    const r = docKetQua(tho({ nguon: { ten: '', url: '' } }), 'JPY')
    expect(laLoi(r) && r.loi).toBe('khong-nguon')
  })

  it('model nhận không biết thì trả về lý do, không phải lỗi kỹ thuật', () => {
    const r = docKetQua(tho({ khong_biet: true, dien_giai: 'Không có khảo sát nào.' }), 'JPY')
    expect(laLoi(r) && r.loi).toBe('khong-tim-duoc')
    expect(laLoi(r) && r.noiDung).toBe('Không có khảo sát nào.')
  })

  it('ba mức không tăng dần thì từ chối', () => {
    const r = docKetQua(tho({ thap: 5_000_000 }), 'JPY')
    expect(laLoi(r) && r.loi).toBe('doc-khong-ra')
  })

  it('rác hoàn toàn thì từ chối, không nổ', () => {
    expect(laLoi(docKetQua(null, 'JPY'))).toBe(true)
    expect(laLoi(docKetQua('xin chào', 'JPY'))).toBe(true)
    expect(laLoi(docKetQua({}, 'JPY'))).toBe(true)
  })

  it('đồng tiền có số lẻ thì quy minor đúng', () => {
    const r = docKetQua(tho({ tien: 'USD', thap: 1.5, giua: 2, cao: 3 }), 'USD') as KetQuaTra
    expect(laLoi(r)).toBe(false)
    expect(r.thapMinor).toBe(150)
    expect(r.giuaMinor).toBe(200)
  })
})
