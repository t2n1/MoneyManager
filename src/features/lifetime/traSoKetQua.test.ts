import { describe, expect, it } from 'vitest'
import { setPrivacyEnabled } from '../../lib/privacy'
import { docKetQua, ghiChuTu, laLoi, type KetQuaTra } from './traSoKetQua'

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

  it('số âm thì từ chối', () => {
    const r = docKetQua(tho({ thap: -1 }), 'JPY')
    expect(laLoi(r) && r.loi).toBe('doc-khong-ra')
  })

  it('số quá lớn thì từ chối — minor units phải còn là số nguyên an toàn', () => {
    // 1e18 qua được mọi phép kiểm hình dạng (dương, hữu hạn, tăng dần) nhưng nhân lên
    // minor units thì vượt Number.MAX_SAFE_INTEGER và phép cộng của JS im lặng sai.
    const r = docKetQua(tho({ thap: 1e18, giua: 2e18, cao: 3e18 }), 'JPY')
    expect(laLoi(r) && r.loi).toBe('doc-khong-ra')
    // Chỉ MỘT mức vượt trần cũng đủ để từ chối cả kết quả.
    const r2 = docKetQua(tho({ cao: 1e18 }), 'JPY')
    expect(laLoi(r2) && r2.loi).toBe('doc-khong-ra')
  })

  it('thiếu hẳn nguồn, hoặc nguồn không phải object, thì từ chối', () => {
    for (const xau of [undefined, null, 'ゼクシィ', 42, ['a']]) {
      const r = docKetQua(tho({ nguon: xau }), 'JPY')
      expect(laLoi(r) && r.loi).toBe('khong-nguon')
    }
  })
})

describe('ghiChuTu', () => {
  const ok = docKetQua(tho(), 'JPY') as KetQuaTra
  const NGAY = new Date(2026, 7, 27) // 2026-08-27, giờ địa phương

  it('có ngày TRA, tách bạch với năm khảo sát của nguồn', () => {
    const s = ghiChuTu(ok, ok.giuaMinor, NGAY)
    expect(s).toContain('2026-08-27') // ngày tra
    expect(s).toContain('2024') // năm khảo sát
    expect(s).toContain('https://souken.zexy.net/')
  })

  it('in số theo ĐỊNH DẠNG của đồng tiền, không phải minor units thô', () => {
    const usd = docKetQua(tho({ tien: 'USD', thap: 1.5, giua: 2, cao: 3 }), 'USD') as KetQuaTra
    const s = ghiChuTu(usd, usd.thapMinor, NGAY)
    // thapMinor = 150 cent. Nội suy thô sẽ ra "150 USD" — sai gấp 100 lần.
    expect(s).toContain('$1.50')
    expect(s).not.toContain('150 USD')
  })

  it('vẫn in số thật khi chế độ riêng tư đang bật — ghi chú là DỮ LIỆU, không phải màn hình', () => {
    setPrivacyEnabled(true)
    try {
      expect(ghiChuTu(ok, ok.giuaMinor, NGAY)).toContain('¥1,700,000')
    } finally {
      setPrivacyEnabled(false)
    }
  })
})
