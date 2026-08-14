import { describe, expect, it } from 'vitest'
import {
  cuaSoNeo,
  dauGhiChu,
  dungDong,
  kiemDong,
  mapNhan,
  gomTrung,
  timNeo,
} from './nhap'
import type { Phieu } from './boc'

const YUCHO = 'acc-yucho'
const IDS = new Map([
  ['Thuế thu nhập (所得税)', 'c-thu-nhap'],
  ['Bảo hiểm việc làm (雇用保険)', 'c-viec-lam'],
  ['Thuế cư trú (住民税)', 'c-cu-tru'],
  ['Bảo hiểm y tế (健康保険)', 'c-y-te'],
  ['Hưu trí (年金)', 'c-huu-tri'],
  ['Đi chợ', 'c-di-cho'],
])

/** Phieu 202608K that — con so lay tu phieu goc, da doi chieu ban boc tay. */
const P202608: Phieu = {
  file: '(0101)202608K.pdf', empno: '0101', period: '202608', kind: 'K',
  nguonKy: 'noi-dung', canhBao: [],
  gross: 481019, deductTotal: 92328, net: 388691, bank: 388691,
  tru: { 健康保険料: 23688, 厚生年金保険: 43005, 雇用保険料: 2405, 所得税: 4430, 住民税: 18800 },
  ngoaiTong: {}, nhanLa: [], loi: [],
}

const NEO_202608 = {
  id: 'tx-1',
  occurred_on: '2026-08-10',
  amount: 388691,
  account_id: YUCHO,
  category_id: 'c-luong',
}

describe('mapNhan', () => {
  it('gom ca 過不足税額 vao Thuế thu nhập', () => {
    expect(mapNhan('所得税').danhMuc).toBe('Thuế thu nhập (所得税)')
    expect(mapNhan('過不足税額').danhMuc).toBe('Thuế thu nhập (所得税)')
  })

  it('gom 厚生年金基金 vao Hưu trí cung voi 厚生年金保険', () => {
    expect(mapNhan('厚生年金保険').danhMuc).toBe('Hưu trí (年金)')
    expect(mapNhan('厚生年金基金').danhMuc).toBe('Hưu trí (年金)')
  })

  // Day la loi tung mac: 社内販売精算 nam trong 控除合計額 nen de bi coi la thue.
  it('KHONG xep 社内販売精算 vao nhom thue', () => {
    const m = mapNhan('社内販売精算')
    expect(m.nhom).toBe('khac')
    expect(m.danhMuc).toBe('Đi chợ')
  })

  it('tu choi その他 va nhan la, khong doan bua', () => {
    expect(() => mapNhan('その他')).toThrow(/khong ro/)
    expect(() => mapNhan('謎の控除')).toThrow(/khong co trong bang map/)
  })

  // 定額減税 la so theo doi phan DUOC GIAM. Coi la khoan tru lam 202406K phong 60.000.
  it('tu choi bo ba 定額減税 (khong phai khoan tru)', () => {
    for (const n of ['月次減税額', '定額減税額(所得税)', '定額減税未済額']) {
      expect(() => mapNhan(n)).toThrow()
    }
  })
})

describe('dauGhiChu', () => {
  it('phan biet duoc luong va thuong cung ky', () => {
    expect(dauGhiChu('2023-02-10', 'K')).toBe('給与 2023/02K')
    expect(dauGhiChu('2023-02-10', 'S')).toBe('給与 2023/02S')
  })

  // Hai phieu neo cung mot ngay -> dau phai khac nhau, neu khong chot chong trung
  // va che do --go deu sai.
  it('202207K va 202209S neo cung 2022-07-08 nhung dau khac nhau', () => {
    expect(dauGhiChu('2022-07-08', 'K')).not.toBe(dauGhiChu('2022-07-08', 'S'))
  })
})

describe('cuaSoNeo', () => {
  it('trum duoc ngay tra som (mung 7) va muon (cuoi thang sau)', () => {
    const w = cuaSoNeo('202608')
    expect(w.tu <= '2026-08-07').toBe(true)
    expect(w.den >= '2026-08-31').toBe(true)
  })

  // 202209S sau khi doc ky tu noi dung PDF thanh 202207; khoan that o 2022-07-08.
  it('ky 202207 trum duoc 2022-07-08', () => {
    const w = cuaSoNeo('202207')
    expect('2022-07-08' >= w.tu && '2022-07-08' <= w.den).toBe(true)
  })
})

describe('timNeo', () => {
  const thu = [
    NEO_202608,
    { id: 'tx-2', occurred_on: '2026-08-10', amount: 388691, account_id: 'acc-paypay', category_id: null },
  ]

  it('khop duy nhat va bo qua tai khoan khac', () => {
    const r = timNeo(thu, P202608, YUCHO)
    expect(r.ok).toBe(true)
    expect(r.ok && r.row.id).toBe('tx-1')
  })

  it('tu choi khi khong thay', () => {
    const r = timNeo(thu, { ...P202608, net: 999999 }, YUCHO)
    expect(r.ok).toBe(false)
    expect(!r.ok && r.lyDo).toMatch(/khong thay/)
  })

  it('tu choi khi mo ho, khong tu chon bua', () => {
    const trung = [...thu, { ...NEO_202608, id: 'tx-3' }]
    const r = timNeo(trung, P202608, YUCHO)
    expect(r.ok).toBe(false)
    expect(!r.ok && r.lyDo).toMatch(/mo ho/)
  })

  it('khong gianh lai khoan da bi phieu khac dung', () => {
    const r = timNeo(thu, P202608, YUCHO, new Set(['tx-1']))
    expect(r.ok).toBe(false)
  })
})

describe('dungDong — 202608K', () => {
  const { thu, thuKhac, chi } = dungDong(P202608, NEO_202608, IDS)

  it('thu them = tong khau tru, cung ngay cung tai khoan voi dong neo', () => {
    expect(thu.amount).toBe(92328)
    expect(thu.occurred_on).toBe('2026-08-10')
    expect(thu.account_id).toBe(YUCHO)
    expect(thu.category_id).toBe('c-luong')
  })

  it('nam dong chi, khong dong nao la hoan tien', () => {
    expect(chi).toHaveLength(5)
    expect(chi.every((r) => r.is_refund === false)).toBe(true)
    expect(chi.every((r) => r.amount > 0)).toBe(true)
  })

  // PostgREST insert mang thi hop nhat tap khoa -> khoa thieu thanh NULL, khong phai
  // DEFAULT. Dong thu thieu is_refund lam CA LO bi tu choi (NOT NULL). Da gap that.
  it('MOI dong deu co is_refund tuong minh (khong undefined)', () => {
    for (const r of [thu, ...chi]) expect(typeof r.is_refund).toBe('boolean')
    expect(thu.is_refund).toBe(false)
  })

  it('bat bien bang khong, va bang gop tru rong', () => {
    expect(kiemDong(P202608, thu, chi, thuKhac)).toEqual([])
    expect(thu.amount).toBe(P202608.gross! - P202608.net!)
  })
})

describe('過不足税額 — ca thang 12', () => {
  // 202412K: hoan 19.929, nho hon tong khau tru 85.615 -> van bieu dien duoc.
  const P202412: Phieu = {
    file: '(0101)202412K.pdf', empno: '0101', period: '202412', kind: 'K',
    nguonKy: 'noi-dung', canhBao: [],
    gross: 458750, deductTotal: 85615, net: 393064, bank: 393064,
    tru: { 健康保険料: 23453, 厚生年金保険: 43005, 雇用保険料: 2447, 所得税: 5110, 住民税: 11600 },
    ngoaiTong: { 過不足税額: -19929 }, nhanLa: [], loi: [],
  }
  const neo = { ...NEO_202608, id: 'tx-9', occurred_on: '2024-12-10', amount: 393064 }

  it('hoan thue thanh chi mang is_refund, amount DUONG', () => {
    const { thu, thuKhac, chi } = dungDong(P202412, neo, IDS)
    const hoan = chi.find((r) => r.note.endsWith('過不足税額'))
    expect(hoan!.is_refund).toBe(true)
    expect(hoan!.amount).toBe(19929)
    expect(thu.amount).toBe(65686)
    expect(kiemDong(P202412, thu, chi, thuKhac)).toEqual([])
  })

  // 202212K: nop THEM 28.081 -> chi thuong, khong phai hoan.
  it('過不足税額 duong thanh chi thuong', () => {
    const P: Phieu = {
      file: '(0101)202212K.pdf', empno: '0101', period: '202212', kind: 'K',
      nguonKy: 'noi-dung', canhBao: [],
      gross: 303345, deductTotal: 56991, net: 218273, bank: 218273,
      tru: { 健康保険料: 13594, 厚生年金保険: 25620, 雇用保険料: 1517, 所得税: 6960, 住民税: 9300 },
      ngoaiTong: { 過不足税額: 28081 }, nhanLa: [], loi: [],
    }
    const { thu, thuKhac, chi } = dungDong(P, { ...neo, occurred_on: '2022-12-09', amount: 218273 }, IDS)
    expect(chi.find((r) => r.note.endsWith('過不足税額'))!.is_refund).toBe(false)
    expect(thu.amount).toBe(85072)
    expect(kiemDong(P, thu, chi, thuKhac)).toEqual([])
  })

  /**
   * 202312K — ca duy nhat trong 55 phieu ma rong > gop: hoan 88.544 lon hon tong
   * khau tru 73.476, nen "phan bi giu lai" = -15.068.
   *
   * Bat bien so hoc VAN DUNG (thu == chi == gop - rong == -15.068) — chinh vi vay
   * bon vong kiem truoc do khong thay. Chi chot DAU moi bat duoc.
   */
  it('tu choi khi hoan lon hon tong khau tru (rong > gop)', () => {
    const P: Phieu = {
      file: '(0101)202312K.pdf', empno: '0101', period: '202312', kind: 'K',
      nguonKy: 'noi-dung', canhBao: [],
      gross: 485610, deductTotal: 73476, net: 500678, bank: 500678,
      tru: { 健康保険料: 16694, 厚生年金保険: 31110, 雇用保険料: 2742, 所得税: 10530, 住民税: 12400 },
      ngoaiTong: { 過不足税額: -88544 }, nhanLa: [], loi: [],
    }
    const { thu, chi, thuKhac } = dungDong(P, { ...neo, occurred_on: '2023-12-08', amount: 500678 }, IDS)
    expect(thu.amount).toBe(-15068)
    const loi = kiemDong(P, thu, chi, thuKhac)
    expect(loi.length).toBeGreaterThan(0)
    expect(loi.join(' ')).toMatch(/xu tay/)
  })
})

describe('社内販売精算 — 202601K', () => {
  const P: Phieu = {
    file: '(0101)202601K.pdf', empno: '0101', period: '202601', kind: 'K',
    nguonKy: 'noi-dung', canhBao: [],
    gross: 430365, deductTotal: 108146, net: 322219, bank: 322219,
    tru: {
      健康保険料: 23288, 厚生年金保険: 43005, 雇用保険料: 2367, 所得税: 5530,
      住民税: 22000, 社内販売精算: 11956,
    },
    ngoaiTong: {}, nhanLa: [], loi: [],
  }
  const neo = { ...NEO_202608, id: 'tx-7', occurred_on: '2026-01-09', amount: 322219 }

  it('11.956 vao Đi chợ, khong vao danh muc thue nao', () => {
    const { thu, thuKhac, chi } = dungDong(P, neo, IDS)
    const dong = chi.find((r) => r.note.endsWith('社内販売精算'))
    expect(dong!.category_id).toBe('c-di-cho')
    const idThue = new Set(['c-thu-nhap', 'c-viec-lam', 'c-cu-tru', 'c-y-te', 'c-huu-tri'])
    expect(idThue.has(dong!.category_id!)).toBe(false)
    // Van bang khong tren TONG: no thuoc 控除合計額 nen phai nam trong tong.
    expect(thu.amount + thuKhac!.amount).toBe(108146)
    expect(kiemDong(P, thu, chi, thuKhac)).toEqual([])
  })

  // 社内販売精算 la mua hang THAT -> phai nam trong Chi, khong duoc mang co.
  it('tach hai dong thu: phan thue ngoai thong ke, phan mua hang trong thong ke', () => {
    const { thu, thuKhac, chi } = dungDong(P, neo, IDS)
    expect(thu.amount).toBe(96190) // 5 muc thue
    expect(thu.exclude_from_stats).toBe(true)
    expect(thuKhac!.amount).toBe(11956) // 社内販売精算
    expect(thuKhac!.exclude_from_stats).toBe(false)
    const muaHang = chi.find((r) => r.note.endsWith('社内販売精算'))
    expect(muaHang!.exclude_from_stats).toBe(false)
    for (const r of chi.filter((r) => r !== muaHang)) expect(r.exclude_from_stats).toBe(true)
  })
})

describe('exclude_from_stats — Thu/Chi khong duoc phong', () => {
  // Ly do ton tai cua mo hinh nay: thue tru TAI NGUON khong phai chi tuy y, cong vao
  // o Chi lam con so do mat nghia nhu tin hieu tieu tien.
  it('phieu khong co muc ngoai thue: khong sinh dong thu thu hai', () => {
    const { thu, thuKhac, chi } = dungDong(P202608, NEO_202608, IDS)
    expect(thuKhac).toBeNull()
    expect(thu.exclude_from_stats).toBe(true)
    expect(chi.every((r) => r.exclude_from_stats === true)).toBe(true)
  })

  it('can bang TRONG TUNG pham vi, khong chi can bang tong', () => {
    const P: Phieu = {
      file: '(0101)202601K.pdf', empno: '0101', period: '202601', kind: 'K',
      nguonKy: 'noi-dung', canhBao: [],
      gross: 430365, deductTotal: 108146, net: 322219, bank: 322219,
      tru: { 健康保険料: 23288, 厚生年金保険: 43005, 雇用保険料: 2367, 所得税: 5530,
             住民税: 22000, 社内販売精算: 11956 },
      ngoaiTong: {}, nhanLa: [], loi: [],
    }
    const { thu, thuKhac, chi } = dungDong(P, NEO_202608, IDS)
    const tong = (ds: typeof chi) => ds.reduce((s, r) => s + r.amount * (r.is_refund ? -1 : 1), 0)
    // ngoai thong ke can bang voi nhau
    expect(thu.amount).toBe(tong(chi.filter((r) => r.exclude_from_stats)))
    // trong thong ke can bang voi nhau -> Thu/Chi khong phong
    expect(thuKhac!.amount).toBe(tong(chi.filter((r) => !r.exclude_from_stats)))
  })

  it('bat loi khi dat co sai', () => {
    const { thu, thuKhac, chi } = dungDong(P202608, NEO_202608, IDS)
    const xau = { ...thu, exclude_from_stats: false }
    expect(kiemDong(P202608, xau, chi, thuKhac).join(' ')).toMatch(/phai mang co/)
  })
})

describe('gomTrung — file trung trong thu muc', () => {
  const A: Phieu = { ...P202608, file: '(0101)202608K.pdf', empno: '0101' }
  const B: Phieu = { ...P202608, file: '(0101)202608K (1).pdf', empno: '0101' }

  // Ca that: thu muc co ca hai, TRUNG BYTE (cung SHA256).
  it('trung y het noi dung -> giu mot ban, bao da gop', () => {
    const r = gomTrung([A, B])
    expect(r.giu).toHaveLength(1)
    expect(r.daGop).toHaveLength(1)
    expect(r.daGop[0].files).toEqual([A.file, B.file])
    expect(r.boQua).toHaveLength(0)
  })

  it('cung ky nhung noi dung KHAC -> tu choi ca nhom, khong doan', () => {
    const r = gomTrung([A, { ...B, net: 999999 }])
    expect(r.giu).toHaveLength(0)
    expect(r.boQua).toHaveLength(1)
    expect(r.boQua[0].lyDo).toMatch(/NOI DUNG KHAC NHAU/)
  })

  it('khong trung thi giu nguyen het', () => {
    const r = gomTrung([A, { ...A, file: 'x.pdf', period: '202607' }])
    expect(r.giu).toHaveLength(2)
    expect(r.daGop).toHaveLength(0)
  })

  it('luong va thuong cung ky KHONG bi coi la trung', () => {
    const r = gomTrung([A, { ...A, file: 's.pdf', kind: 'S' }])
    expect(r.giu).toHaveLength(2)
    expect(r.boQua).toHaveLength(0)
  })
})

describe('thieu danh muc', () => {
  it('nem loi thay vi ghi vao danh muc null', () => {
    expect(() => dungDong(P202608, NEO_202608, new Map())).toThrow(/thieu danh muc/)
  })
})
