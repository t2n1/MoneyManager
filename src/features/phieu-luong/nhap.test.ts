import { describe, expect, it } from 'vitest'
import {
  cuaSoNeo,
  dauGhiChu,
  dungDong,
  dungKeHoach,
  kiemDong,
  mapNhan,
  gomTrung,
  phieuLoi,
  timNeo,
} from './nhap'
import type { DongMoi, KhoanNeo } from './nhap'
import type { Phieu } from './boc'

const YUCHO = 'acc-yucho'
const IDS = new Map([
  ['Thuế thu nhập (所得税)', 'c-thu-nhap'],
  ['Bảo hiểm việc làm (雇用保険)', 'c-viec-lam'],
  ['Thuế cư trú (住民税)', 'c-cu-tru'],
  ['Bảo hiểm y tế (健康保険)', 'c-y-te'],
  ['Hưu trí (年金)', 'c-huu-tri'],
  ['Đi chợ', 'c-di-cho'],
  ['Tàu xe', 'c-tau-xe'],
])

/**
 * Phieu minh hoa 202608K — cau truc khop phieu that (da doi chieu boc tay), nhung
 * con so la SO MINH HOA (khong phai so that — repo cong khai, xem quy tac o
 * docs/superpowers/specs/2026-08-14-nhap-phieu-luong-design.md).
 */
const P202608: Phieu = {
  file: '(0101)202608K.pdf', empno: '0101', period: '202608', kind: 'K',
  nguonKy: 'noi-dung', canhBao: [],
  gross: 500000, deductTotal: 100000, net: 400000, bank: 400000,
  tru: { 健康保険料: 20000, 厚生年金保険: 50000, 雇用保険料: 3000, 所得税: 7000, 住民税: 20000 },
  ngoaiTong: {}, cap: {}, nhanLa: [], loi: [],
}

const NEO_202608 = {
  id: 'tx-1',
  occurred_on: '2026-08-10',
  amount: 400000,
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

  // 定額減税 la so theo doi phan DUOC GIAM. Coi la khoan tru lam mot thang phong len
  // dung bang tong bo ba (so minh hoa, khong phai so that).
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
    { id: 'tx-2', occurred_on: '2026-08-10', amount: 400000, account_id: 'acc-paypay', category_id: null },
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

  it('timNeo: thiếu period thì throw, không tính bừa cửa sổ ngày', () => {
    const khongKy: Phieu = { ...P202608, period: null }
    expect(() => timNeo([NEO_202608], khongKy, YUCHO)).toThrow(/thieu ky/)
  })
})

describe('dungDong — 202608K', () => {
  const { thu, thuKhac, chi } = dungDong(P202608, NEO_202608, IDS)

  it('thu them = tong khau tru, cung ngay cung tai khoan voi dong neo', () => {
    expect(thu.amount).toBe(100000)
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

  it('dungDong: thiếu kind thì throw, không ghi chuỗi "null" vào note', () => {
    const khongLoai: Phieu = { ...P202608, kind: null }
    expect(() => dungDong(khongLoai, NEO_202608, IDS)).toThrow(/thieu loai/)
  })
})

describe('過不足税額 — ca thang 12', () => {
  // So minh hoa (khong phai so that). 202412K: hoan 20.000, nho hon tong khau tru
  // 90.000 -> van bieu dien duoc.
  const P202412: Phieu = {
    file: '(0101)202412K.pdf', empno: '0101', period: '202412', kind: 'K',
    nguonKy: 'noi-dung', canhBao: [],
    gross: 450000, deductTotal: 90000, net: 380000, bank: 380000,
    tru: { 健康保険料: 20000, 厚生年金保険: 45000, 雇用保険料: 3000, 所得税: 6000, 住民税: 16000 },
    ngoaiTong: { 過不足税額: -20000 }, cap: {}, nhanLa: [], loi: [],
  }
  const neo = { ...NEO_202608, id: 'tx-9', occurred_on: '2024-12-10', amount: 380000 }

  it('hoan thue thanh chi mang is_refund, amount DUONG', () => {
    const { thu, thuKhac, chi } = dungDong(P202412, neo, IDS)
    const hoan = chi.find((r) => r.note.endsWith('過不足税額'))
    expect(hoan!.is_refund).toBe(true)
    expect(hoan!.amount).toBe(20000)
    expect(thu.amount).toBe(70000)
    expect(kiemDong(P202412, thu, chi, thuKhac)).toEqual([])
  })

  // So minh hoa. 202212K: nop THEM 30.000 -> chi thuong, khong phai hoan.
  it('過不足税額 duong thanh chi thuong', () => {
    const P: Phieu = {
      file: '(0101)202212K.pdf', empno: '0101', period: '202212', kind: 'K',
      nguonKy: 'noi-dung', canhBao: [],
      gross: 350000, deductTotal: 70000, net: 250000, bank: 250000,
      tru: { 健康保険料: 15000, 厚生年金保険: 30000, 雇用保険料: 2000, 所得税: 8000, 住民税: 15000 },
      ngoaiTong: { 過不足税額: 30000 }, cap: {}, nhanLa: [], loi: [],
    }
    const { thu, thuKhac, chi } = dungDong(P, { ...neo, occurred_on: '2022-12-09', amount: 250000 }, IDS)
    expect(chi.find((r) => r.note.endsWith('過不足税額'))!.is_refund).toBe(false)
    expect(thu.amount).toBe(100000)
    expect(kiemDong(P, thu, chi, thuKhac)).toEqual([])
  })

  /**
   * 202312K — ca duy nhat trong 55 phieu ma rong > gop: hoan 90.000 lon hon tong
   * khau tru 70.000, nen "phan bi giu lai" = -20.000. (So minh hoa — khong phai so
   * that, xem quy tac o docs/superpowers/specs/2026-08-14-nhap-phieu-luong-design.md.)
   *
   * Bat bien so hoc VAN DUNG (thu == chi == gop - rong == -20.000) — chinh vi vay
   * bon vong kiem truoc do khong thay. Chi chot DAU moi bat duoc.
   */
  it('hoan lon hon tong khau tru (rong > gop): dong bu tru thanh CHI, khong tu choi', () => {
    const P: Phieu = {
      file: '(0101)202312K.pdf', empno: '0101', period: '202312', kind: 'K',
      nguonKy: 'noi-dung', canhBao: [],
      gross: 400000, deductTotal: 70000, net: 420000, bank: 420000,
      tru: { 健康保険料: 15000, 厚生年金保険: 30000, 雇用保険料: 3000, 所得税: 12000, 住民税: 10000 },
      ngoaiTong: { 過不足税額: -90000 }, cap: {}, nhanLa: [], loi: [],
    }
    const neoP = { ...neo, occurred_on: '2023-12-08', amount: 420000 }
    const { thu, chi, thuKhac, cap } = dungDong(P, neoP, IDS)
    // Dau AM cua nhom -> dong bu tru la CHI |tong|, khong phai thu -20.000 (DB cam).
    expect(thu.type).toBe('expense')
    expect(thu.amount).toBe(20000)
    expect(thu.exclude_from_stats).toBe(true)
    expect(thu.category_id).not.toBeNull()
    expect(kiemDong(P, thu, chi, thuKhac, cap, neoP)).toEqual([])
  })

  /** So THAT tu (0004)202312K.pdf — boc bang chinh parser cua app. */
  it('so that cua 202312K: bu tru 15.068 phia CHI', () => {
    const P: Phieu = {
      file: '(0004)202312K.pdf', empno: '0004', period: '202312', kind: 'K',
      nguonKy: 'noi-dung', canhBao: [],
      gross: 485610, deductTotal: 73476, net: 500678, bank: 500678,
      tru: { 健康保険料: 16694, 厚生年金保険: 31110, 雇用保険料: 2742, 所得税: 10530, 住民税: 12400 },
      ngoaiTong: { 過不足税額: -88544 },
      cap: { 基本給: 325000, 残業手当: 132032, 立替経費精算: 28578 },
      nhanLa: [], loi: [],
    }
    const neoP = { ...neo, occurred_on: '2023-12-08', amount: 500678 }
    const d = dungDong(P, neoP, IDS)
    expect(d.thu.type).toBe('expense')
    expect(d.thu.amount).toBe(88544 - 73476) // = 15.068
    expect(kiemDong(P, d.thu, d.chi, d.thuKhac, d.cap, neoP)).toEqual([])
  })
})

describe('社内販売精算 — 202601K', () => {
  // So minh hoa (khong phai so that).
  const P: Phieu = {
    file: '(0101)202601K.pdf', empno: '0101', period: '202601', kind: 'K',
    nguonKy: 'noi-dung', canhBao: [],
    gross: 420000, deductTotal: 100000, net: 320000, bank: 320000,
    tru: {
      健康保険料: 20000, 厚生年金保険: 40000, 雇用保険料: 3000, 所得税: 5000,
      住民税: 20000, 社内販売精算: 12000,
    },
    ngoaiTong: {}, cap: {}, nhanLa: [], loi: [],
  }
  const neo = { ...NEO_202608, id: 'tx-7', occurred_on: '2026-01-09', amount: 320000 }

  it('12.000 vao Đi chợ, khong vao danh muc thue nao', () => {
    const { thu, thuKhac, chi } = dungDong(P, neo, IDS)
    const dong = chi.find((r) => r.note.endsWith('社内販売精算'))
    expect(dong!.category_id).toBe('c-di-cho')
    const idThue = new Set(['c-thu-nhap', 'c-viec-lam', 'c-cu-tru', 'c-y-te', 'c-huu-tri'])
    expect(idThue.has(dong!.category_id!)).toBe(false)
    // Van bang khong tren TONG: no thuoc 控除合計額 nen phai nam trong tong.
    expect(thu.amount + thuKhac!.amount).toBe(100000)
    expect(kiemDong(P, thu, chi, thuKhac)).toEqual([])
  })

  // 社内販売精算 la mua hang THAT -> phai nam trong Chi, khong duoc mang co.
  it('tach hai dong thu: phan thue ngoai thong ke, phan mua hang trong thong ke', () => {
    const { thu, thuKhac, chi } = dungDong(P, neo, IDS)
    expect(thu.amount).toBe(88000) // 5 muc thue
    expect(thu.exclude_from_stats).toBe(true)
    expect(thuKhac!.amount).toBe(12000) // 社内販売精算
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
      gross: 420000, deductTotal: 100000, net: 320000, bank: 320000,
      tru: { 健康保険料: 20000, 厚生年金保険: 40000, 雇用保険料: 3000, 所得税: 5000,
             住民税: 20000, 社内販売精算: 12000 },
      ngoaiTong: {}, cap: {}, nhanLa: [], loi: [],
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
    const xau = { ...B, net: 999999 }
    const r = gomTrung([A, xau])
    expect(r.giu).toHaveLength(0)
    expect(r.boQua).toHaveLength(1)
    expect(r.boQua[0].lyDo).toMatch(/NOI DUNG KHAC NHAU/)
    // `phieu` phai la MOT THANH VIEN THAT cua chinh nhom bi tu choi (period/kind/empno
    // khop key cua no), khong phai mot phieu bat ky khac trong toan bo lo.
    expect([A.file, xau.file]).toContain(r.boQua[0].phieu.file)
    expect(r.boQua[0].phieu.period).toBe(A.period)
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

  // Ca that tung xay: ba file KHONG DOC DUOC deu co empno/period/kind = null va noi
  // dung rong giong het nhau — neu gom theo noi dung nhu phieu thuong thi hai trong
  // ba file bi NUOT MAT, chi con lai MOT dong "tu choi". Phieu mang loi khong co danh
  // tinh dang tin de so sanh, nen phai di thang qua, moi file mot dong.
  it('ba file khong doc duoc (loi) -> giu nguyen ba dong, khong gop', () => {
    const hong = (file: string): Phieu => ({
      file, empno: null, period: null, kind: null, nguonKy: 'ten-file', canhBao: [],
      gross: null, deductTotal: null, net: null, bank: null, tru: {}, ngoaiTong: {}, cap: {},
      nhanLa: [], loi: [`đọc PDF lỗi: ${file}`],
    })
    const r = gomTrung([hong('a.pdf'), hong('b.pdf'), hong('c.pdf')])
    expect(r.giu).toHaveLength(3)
    expect(r.daGop).toHaveLength(0)
    expect(r.boQua).toHaveLength(0)
  })
})

describe('thieu danh muc', () => {
  it('nem loi thay vi ghi vao danh muc null', () => {
    expect(() => dungDong(P202608, NEO_202608, new Map())).toThrow(/thieu danh muc/)
  })
})

// Web va CLI tung dung hai hinh dang khac nhau cho phieu 'loi' khi khong doc duoc
// PDF (web: du 14 truong, CLI: chi 4 truong) — round review cuoi bat ra, gop lai
// thanh mot ham chung de khong con lech nua.
describe('phieuLoi — hinh dang dong nhat cho web va CLI', () => {
  it('day du 14 truong cua Phieu, loi mang dung thong diep', () => {
    const p = phieuLoi('a.pdf', 'đọc PDF lỗi: boom')
    expect(p.file).toBe('a.pdf')
    expect(p.loi).toEqual(['đọc PDF lỗi: boom'])
    expect(p.tru).toEqual({})
    expect(p.ngoaiTong).toEqual({})
    expect(p.empno).toBeNull()
    expect(p.period).toBeNull()
    expect(p.kind).toBeNull()
    expect(p.gross).toBeNull()
    expect(p.deductTotal).toBeNull()
    expect(p.net).toBeNull()
    expect(p.bank).toBeNull()
    expect(p.nhanLa).toEqual([])
    expect(p.canhBao).toEqual([])
  })

  // dungKeHoach() tu choi phieu mang loi TRUOC khi doc p.period/p.kind (xem
  // gomTrung docstring) — phieuLoi() phai di qua duoc duong do y het truoc day.
  it('di qua dungKeHoach nhu mot phieu tu-choi binh thuong', () => {
    const kh = dungKeHoach([phieuLoi('hong.pdf', 'đọc PDF lỗi: x')], [], YUCHO, IDS, new Set())
    expect(kh).toHaveLength(1)
    expect(kh[0].trangThai).toBe('tu-choi')
    expect(kh[0].lyDo).toMatch(/đọc PDF lỗi/)
  })
})

describe('dungKeHoach', () => {
  const THU: KhoanNeo[] = [NEO_202608]

  it('phiếu đạt thì có dòng, phiếu đã nhập thì không', () => {
    const kh = dungKeHoach([P202608], THU, YUCHO, IDS, new Set())
    expect(kh).toHaveLength(1)
    expect(kh[0].trangThai).toBe('dat')
    expect(kh[0].chi).toHaveLength(5)

    const kh2 = dungKeHoach([P202608], THU, YUCHO, IDS, new Set(['給与 2026/08K']))
    expect(kh2[0].trangThai).toBe('da-nhap')
    expect(kh2[0].chi).toHaveLength(0)
  })

  // Ba trang thai phai phan biet duoc: "da nhap roi" KHONG phai loi. `xau` phai la
  // MOT PHIEU KHAC THAT SU (ky khac) — chung ky + noi dung giong het se bi gomTrung
  // gop lam mot TRUOC khi dungKeHoach kip thay `loi` cua no (dung the la mot phieu
  // rieng nhung y het P202608 se bi coi la "cung mot phieu thay hai lan").
  it('phân biệt ba trạng thái, không gộp', () => {
    const xau: Phieu = { ...P202608, file: 'x.pdf', period: '202607', loi: ['nhãn lạ: 謎'] }
    const kh = dungKeHoach([P202608, xau], THU, YUCHO, IDS, new Set())
    const tt = kh.map((k) => k.trangThai).sort()
    expect(tt).toEqual(['dat', 'tu-choi'])
    expect(kh.find((k) => k.trangThai === 'tu-choi')!.lyDo).toMatch(/謎/)
  })

  // Hai phieu THAT SU KHAC NHAU (ky khac -> khong bi gomTrung gop) nhung cung net
  // -> ca hai deu khop duoc mot khoan neo DUY NHAT: phieu xu ly truoc phai chiem
  // mat no (daDung), phieu sau phai tu choi vi "khong thay" — chu khong phai vi bi
  // gomTrung nuot mat.
  it('không để hai phiếu giành cùng một khoản neo', () => {
    const p2: Phieu = { ...P202608, file: 'y.pdf', period: '202607' }
    const kh = dungKeHoach([P202608, p2], THU, YUCHO, IDS, new Set())
    const dat = kh.filter((k) => k.trangThai === 'dat')
    const tuChoi = kh.filter((k) => k.trangThai === 'tu-choi')
    expect(dat).toHaveLength(1)
    expect(tuChoi).toHaveLength(1)
    expect(tuChoi[0].lyDo).toMatch(/khong thay/)
  })

  // Nhom bi gomTrung tu choi (boQua, noi dung khac nhau) phai tro thanh DUNG MOT
  // dong tu-choi, va dong do phai mang ky/loai cua CHINH nhom bi tu choi — khong
  // phai cua mot phieu bat ky khac trong ca lo (hoi quy cho finding "phieuList[0]").
  it('nhóm bị gomTrung từ chối (boQua) thành một dòng tu-choi mang đúng kỳ của nhóm', () => {
    const doiThu: Phieu = { ...P202608, file: 'z.pdf', net: 999999 }
    const kh = dungKeHoach([P202608, doiThu], THU, YUCHO, IDS, new Set())
    expect(kh).toHaveLength(1)
    expect(kh[0].trangThai).toBe('tu-choi')
    expect(kh[0].lyDo).toMatch(/NOI DUNG KHAC NHAU/)
    expect(kh[0].phieu.period).toBe(P202608.period)
    expect(kh[0].phieu.file).toBe(`${P202608.file} + ${doiThu.file}`)
  })

  it('dungDong ném lỗi (thiếu danh mục) -> tu-choi mang thông điệp lỗi', () => {
    const kh = dungKeHoach([P202608], THU, YUCHO, new Map(), new Set())
    expect(kh).toHaveLength(1)
    expect(kh[0].trangThai).toBe('tu-choi')
    expect(kh[0].lyDo).toMatch(/thieu danh muc/)
  })

  it('timNeo không thấy khoản thu khớp -> tu-choi trực tiếp', () => {
    const khongKhop: Phieu = { ...P202608, file: 'w.pdf', net: 12345 }
    const kh = dungKeHoach([khongKhop], THU, YUCHO, IDS, new Set())
    expect(kh).toHaveLength(1)
    expect(kh[0].trangThai).toBe('tu-choi')
    expect(kh[0].lyDo).toMatch(/khong thay/)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// Khối 支給: 通勤手当 (phụ cấp đi lại) và DB掛金 (退職金)
// Xem docs/superpowers/specs/2026-08-20-phieu-luong-thu-nhap-thuc-notes.md
// ────────────────────────────────────────────────────────────────────────────

const TK_HUU = 'acc-huu'
const DM_PHU_CAP = 'c-phu-cap'

/** P202608 + 通勤手当 77.070 (vé 6 tháng) + DB掛金 −10.000. Ròng vẫn 400.000. */
const P_CAP: Phieu = { ...P202608, cap: { 通勤手当: 77070, DB掛金: -10000 } }

/** Số dư mà một bộ dòng làm đổi trên MỘT tài khoản. Hoàn tiền = chi ÂM (0026). */
function soDu(ds: DongMoi[], accountId: string): number {
  return ds
    .filter((r) => r.account_id === accountId)
    .reduce((s, r) => s + r.amount * (r.type === 'income' ? 1 : r.is_refund ? 1 : -1), 0)
}

/** Thu NẰM TRONG thống kê mà bộ dòng thêm vào. */
function thuTrongTk(ds: DongMoi[]): number {
  return ds
    .filter((r) => r.type === 'income' && !r.exclude_from_stats)
    .reduce((s, r) => s + r.amount, 0)
}

describe('dungDong · 通勤手当', () => {
  it('dựng đủ ba dòng và yêu cầu bật cờ dòng neo', () => {
    const d = dungDong(P_CAP, NEO_202608, IDS, TK_HUU, null, DM_PHU_CAP)
    expect(d.suaNeo).toBe(true)
    const yucho = d.cap.filter((r) => r.account_id === YUCHO)
    expect(yucho).toHaveLength(3)
    // lương thực nhận = ròng − 通勤手当, giữ danh mục CỦA DÒNG NEO (Lương)
    expect(yucho.find((r) => r.type === 'income' && r.category_id === 'c-luong')).toMatchObject({
      amount: 400000 - 77070,
      exclude_from_stats: false,
    })
    // phụ cấp đi lại: dòng THU riêng, danh mục riêng, NGOÀI thống kê
    expect(yucho.find((r) => r.category_id === DM_PHU_CAP)).toMatchObject({
      type: 'income', amount: 77070, exclude_from_stats: true, is_refund: false,
    })
    // trung hoà: chi bằng ĐÚNG số dòng neo, NGOÀI thống kê
    expect(
      yucho.find((r) => r.type === 'expense' && r.exclude_from_stats),
    ).toMatchObject({ amount: 400000 })
  })

  /** Bất biến sống còn: số dư Yucho KHÔNG ĐỔI. Dòng neo giữ nguyên `amount`. */
  it('số dư Yucho không đổi', () => {
    const d = dungDong(P_CAP, NEO_202608, IDS, TK_HUU, null, DM_PHU_CAP)
    expect(soDu(d.cap, YUCHO)).toBe(0)
  })

  /**
   * `通勤手当` KHÔNG phải thu nhập — công ty trả tiền đi lại, tiền đó vào rồi ra để mua
   * vé. Nên nó RA KHỎI Thu, nhưng bằng cờ `exclude_from_stats` chứ KHÔNG bằng dòng chi
   * âm: sổ không có khoản mua vé nào để một dòng hoàn tiền triệt tiêu, nên chi âm sẽ đi
   * khấu vào cơm ngoài và tiền gửi gia đình.
   */
  it('phụ cấp ra khỏi Thu, và KHÔNG thành chi âm', () => {
    const d = dungDong(P_CAP, NEO_202608, IDS, TK_HUU, null, DM_PHU_CAP)
    expect(d.cap.find((r) => r.category_id === DM_PHU_CAP)).toMatchObject({
      type: 'income', amount: 77070, exclude_from_stats: true,
    })
    expect(d.cap.some((r) => r.is_refund)).toBe(false)
    expect(thuTrongTk(d.cap.filter((r) => r.account_id === YUCHO)) - NEO_202608.amount).toBe(-77070)
    expect(soDu(d.cap, YUCHO)).toBe(0)
  })

  /**
   * KHÔNG có mốc kỳ nào. Bản trước từng đặt mốc 202608 (trước mốc thì ẩn, từ mốc thì đếm
   * vào Thu); người dùng bác vì phụ cấp đi lại không phải thu nhập ở BẤT KỲ kỳ nào.
   */
  it('mọi kỳ đều ra khỏi Thu, không phụ thuộc kỳ', () => {
    for (const ky of ['202202', '202602', '202608', '202702']) {
      const d = dungDong({ ...P_CAP, period: ky }, NEO_202608, IDS, TK_HUU, null, DM_PHU_CAP)
      expect(d.cap.find((r) => r.category_id === DM_PHU_CAP)?.exclude_from_stats, ky).toBe(true)
    }
  })

  it('mọi dòng đều mang dấu 給与 để gỡ lô xoá được', () => {
    const d = dungDong(P_CAP, NEO_202608, IDS, TK_HUU, null, DM_PHU_CAP)
    expect(d.cap.every((r) => r.note.startsWith('給与 2026/08K · '))).toBe(true)
  })

  it('thiếu danh mục thu Phụ cấp đi lại thì nổ, không ghi lặng lẽ', () => {
    expect(() => dungDong(P_CAP, NEO_202608, IDS, TK_HUU, null, null)).toThrow(/Phụ cấp đi lại/)
  })

  /** 10/12 tháng nhãn này VẮNG — hành vi cũ phải y nguyên, không thêm dòng nào. */
  it('phiếu không có 支給 thì không thêm dòng, không sửa dòng neo', () => {
    const d = dungDong(P202608, NEO_202608, IDS, TK_HUU, null, DM_PHU_CAP)
    expect(d.cap).toEqual([])
    expect(d.suaNeo).toBe(false)
  })
})

describe('dungDong · DB掛金', () => {
  /**
   * TRONG thống kê, khác 通勤手当: đây là tiền người dùng kiếm được rồi đem tiết kiệm, chỉ
   * là việc tiết kiệm xảy ra trước khi tiền kịp về tài khoản. 退職金 là một tài khoản tài
   * sản trong sổ nên số dư của nó đếm vào tài sản ngay, khác 厚生年金保険 (tiền ra khỏi tay).
   */
  it('ghi thu 10.000 vào tài khoản 退職金, không đụng Yucho', () => {
    const d = dungDong(P_CAP, NEO_202608, IDS, TK_HUU, null, DM_PHU_CAP)
    const huu = d.cap.filter((r) => r.account_id === TK_HUU)
    expect(huu).toHaveLength(1)
    expect(huu[0]).toMatchObject({ type: 'income', amount: 10000, exclude_from_stats: false })
    expect(soDu(d.cap, TK_HUU)).toBe(10000)
  })

  /**
   * Con số người dùng chốt cho kỳ 202608: thu nhập thật ¥321.621 = ¥311.621 về Yucho
   * + ¥10.000 vào quỹ hưu, KHÔNG gồm ¥77.070 tiền đi lại.
   */
  it('thu nhập trong thống kê = ròng − 通勤手当 + DB掛金', () => {
    const d = dungDong(P_CAP, NEO_202608, IDS, TK_HUU, null, DM_PHU_CAP)
    expect(thuTrongTk(d.cap)).toBe(400000 - 77070 + 10000)
  })

  it('thiếu tài khoản 退職金 thì nổ, không bỏ tiền hưu đi', () => {
    expect(() => dungDong(P_CAP, NEO_202608, IDS, null, null, DM_PHU_CAP)).toThrow(/退職金/)
  })

  it('chỉ có DB掛金 (không có 通勤手当) thì không sửa dòng neo', () => {
    const chiDB: Phieu = { ...P202608, cap: { DB掛金: -10000 } }
    const d = dungDong(chiDB, NEO_202608, IDS, TK_HUU, null, DM_PHU_CAP)
    expect(d.suaNeo).toBe(false)
    expect(d.cap).toHaveLength(1)
  })
})

describe('kiemDong · khối 支給', () => {
  it('bộ dòng đúng thì không lỗi', () => {
    const d = dungDong(P_CAP, NEO_202608, IDS, TK_HUU, null, DM_PHU_CAP)
    expect(kiemDong(P_CAP, d.thu, d.chi, d.thuKhac, d.cap, NEO_202608)).toEqual([])
  })

  it('bắt được dòng trung hoà sai số (số dư Yucho lệch)', () => {
    const d = dungDong(P_CAP, NEO_202608, IDS, TK_HUU, null, DM_PHU_CAP)
    const xau = d.cap.map((r) =>
      r.type === 'expense' && !r.is_refund && r.exclude_from_stats ? { ...r, amount: 399999 } : r,
    )
    expect(kiemDong(P_CAP, d.thu, d.chi, d.thuKhac, xau, NEO_202608).join(' ')).toMatch(/số dư/)
  })

  it('bắt được Thu lệch khỏi mức phải có', () => {
    const d = dungDong(P_CAP, NEO_202608, IDS, TK_HUU, null, DM_PHU_CAP)
    const xau = d.cap.map((r) =>
      r.type === 'income' && r.account_id === YUCHO ? { ...r, amount: 400000 } : r,
    )
    expect(kiemDong(P_CAP, d.thu, d.chi, d.thuKhac, xau, NEO_202608).join(' ')).toMatch(/Thu/)
  })

  /** 通勤手当 > ròng: dòng "lương thực nhận" sẽ ≤ 0, mà DB có check(amount > 0). */
  it('通勤手当 lớn hơn ròng thì từ chối, không dựng dòng amount <= 0', () => {
    const qua: Phieu = { ...P202608, cap: { 通勤手当: 450000 } }
    const loi = (() => {
      try {
        const d = dungDong(qua, NEO_202608, IDS, TK_HUU, null, DM_PHU_CAP)
        return kiemDong(qua, d.thu, d.chi, d.thuKhac, d.cap, NEO_202608)
      } catch (e) {
        return [(e as Error).message]
      }
    })()
    expect(loi.length).toBeGreaterThan(0)
  })
})

describe('dungKeHoach · khối 支給', () => {
  it('mang cap và suaNeo ra kế hoạch', () => {
    const kh = dungKeHoach([P_CAP], [NEO_202608], YUCHO, IDS, new Set(), TK_HUU, null, DM_PHU_CAP)
    expect(kh[0].trangThai).toBe('dat')
    expect(kh[0].suaNeo).toBe(true)
    expect(kh[0].cap).toHaveLength(4)
  })

  /** Thiếu tài khoản 退職金 → TỪ CHỐI phiếu, không nổ cả trang. */
  it('thiếu tài khoản 退職金 thì từ chối phiếu, nêu lý do', () => {
    const kh = dungKeHoach([P_CAP], [NEO_202608], YUCHO, IDS, new Set(), null, null, DM_PHU_CAP)
    expect(kh[0].trangThai).toBe('tu-choi')
    expect(kh[0].lyDo).toMatch(/退職金/)
  })

  it('dòng từ chối vẫn có cap rỗng và suaNeo false', () => {
    const kh = dungKeHoach([P_CAP], [], YUCHO, IDS, new Set(), TK_HUU, null, DM_PHU_CAP)
    expect(kh[0].trangThai).toBe('tu-choi')
    expect(kh[0].cap).toEqual([])
    expect(kh[0].suaNeo).toBe(false)
  })
})

/**
 * Ca user nêu, số đo trên sổ thật: cty trả gộp 6 tháng 77.070 nhưng chỉ mua vé 3 tháng
 * 40.680. Bút toán KHÔNG cố khớp — nó ghi đúng số trên phiếu. Phần dư 36.390 hiện ra
 * đúng như nó là: Thu có 77.070, Chi có khoản mua vé mà user tự ghi.
 */
describe('dungDong · trả gộp 6 tháng, mua vé 3 tháng', () => {
  it('ghi đúng số trên phiếu, không cố khớp với khoản đã mua', () => {
    const d = dungDong(P_CAP, NEO_202608, IDS, TK_HUU, null, DM_PHU_CAP)
    expect(d.cap.find((r) => r.category_id === DM_PHU_CAP)?.amount).toBe(77070)
  })
})

/**
 * Ràng buộc DB, không phải luật nghiệp vụ — nhưng đã hỏng THẬT một lần: dòng "trung hoà
 * dòng neo" từng dựng với `category_id: null`, Postgres từ chối (0001_init.sql:89), cả lô
 * dừng giữa đường nên dòng DB掛金 không được ghi và cờ dòng neo không được bật. Sổ khi đó
 * đếm Thu HAI LẦN (dòng neo + 'lương thực nhận') và số dư Yucho phồng đúng một khoản ròng.
 *
 * Test đơn vị không chạm Postgres nên phải tự mang ràng buộc đó vào đây.
 */
describe('dungDong · ràng buộc DB trên mọi dòng dựng ra', () => {
  const moiDong = (d: { thu: DongMoi; thuKhac: DongMoi | null; chi: DongMoi[]; cap: DongMoi[] }) =>
    [d.thu, ...(d.thuKhac ? [d.thuKhac] : []), ...d.chi, ...d.cap]

  it('không dòng nào thiếu category_id (check type<>transfer ⇒ category_id not null)', () => {
    for (const p of [P_CAP, { ...P202608, cap: { DB掛金: -10000 } }, P202608]) {
      const d = dungDong(p, NEO_202608, IDS, TK_HUU, null, DM_PHU_CAP)
      for (const r of moiDong(d)) {
        expect(r.category_id, `${r.note} thiếu category_id`).not.toBeNull()
      }
    }
  })

  it('mọi amount đều > 0 (check amount > 0)', () => {
    const d = dungDong(P_CAP, NEO_202608, IDS, TK_HUU, null, DM_PHU_CAP)
    for (const r of moiDong(d)) expect(r.amount, r.note).toBeGreaterThan(0)
  })

  it('không dòng nào là transfer nên to_amount/to_account_id phải null', () => {
    const d = dungDong(P_CAP, NEO_202608, IDS, TK_HUU, null, DM_PHU_CAP)
    for (const r of moiDong(d)) {
      expect(r.to_amount, r.note).toBeNull()
      expect(r.to_account_id, r.note).toBeNull()
    }
  })

  // transactions_refund_check (0026): is_refund chi co nghia voi CHI.
  it('is_refund chỉ nằm trên dòng chi', () => {
    const d = dungDong(P_CAP, NEO_202608, IDS, TK_HUU, null, DM_PHU_CAP)
    for (const r of moiDong(d)) {
      if (r.is_refund) expect(r.type, r.note).toBe('expense')
    }
  })

  it('kiemCap bắt được dòng 支給 thiếu category_id', () => {
    const d = dungDong(P_CAP, NEO_202608, IDS, TK_HUU, null, DM_PHU_CAP)
    const xau = d.cap.map((r) => (r.exclude_from_stats ? { ...r, category_id: null } : r))
    expect(kiemDong(P_CAP, d.thu, d.chi, d.thuKhac, xau, NEO_202608).join(' ')).toMatch(
      /category_id/,
    )
  })
})

/**
 * 立替経費精算 — tien nguoi dung UNG RA chi ho cong ty roi duoc tra lai. Cung lop voi
 * 通勤手当 (hoan phi, khong phai thu nhap) nhung KHAC mot diem quyet dinh cach lam:
 * cac khoan mua do KHONG co trong so (mua lau roi, khong con nho mua gi). Nen chi RUT
 * khoi Thu, KHONG dung dong hoan tien — khong co khoan chi nao de triet tieu.
 */
describe('dungDong · 立替経費精算', () => {
  const N = NEO_202608.amount // 400.000

  it('chi rut khoi Thu, khong dung dong hoan tien', () => {
    const P: Phieu = { ...P202608, cap: { 立替経費精算: 28578 } }
    const d = dungDong(P, NEO_202608, IDS, TK_HUU, null, DM_PHU_CAP)
    expect(d.suaNeo).toBe(true)
    expect(d.cap).toHaveLength(2) // luong thuc nhan + trung hoa, KHONG co dong hoan
    expect(d.cap.some((r) => r.is_refund)).toBe(false)
    expect(soDu(d.cap, YUCHO)).toBe(0)
    expect(thuTrongTk(d.cap) - N).toBe(-28578)
  })

  /** Dong trung hoa = rong − 立替経費精算, khong phai rong: khong co dong hoan de bu. */
  it('dong trung hoa tru bot phan 立替経費精算', () => {
    const P: Phieu = { ...P202608, cap: { 立替経費精算: 28578 } }
    const d = dungDong(P, NEO_202608, IDS, TK_HUU, null, DM_PHU_CAP)
    const trungHoa = d.cap.find((r) => r.type === 'expense' && r.exclude_from_stats)
    expect(trungHoa?.amount).toBe(N - 28578)
  })

  it('co ca 通勤手当 va 立替経費精算: rut CA HAI khoi Thu, khong dong chi am nao', () => {
    const P: Phieu = { ...P202608, cap: { 通勤手当: 77070, 立替経費精算: 7780 } }
    const d = dungDong(P, NEO_202608, IDS, TK_HUU, null, DM_PHU_CAP)
    expect(soDu(d.cap, YUCHO)).toBe(0)
    expect(thuTrongTk(d.cap) - N).toBe(-(77070 + 7780))
    expect(d.cap.find((r) => r.category_id === DM_PHU_CAP)?.amount).toBe(77070)
    expect(d.cap.some((r) => r.is_refund)).toBe(false)
    expect(d.cap.find((r) => r.type === 'expense' && r.exclude_from_stats)?.amount).toBe(N - 7780)
  })

  /** Chi co 立替経費精算 thi KHONG can danh muc Phu cap — khong dung dong phu cap nao. */
  it('khong doi danh muc Phu cap khi chi co 立替経費精算', () => {
    const P: Phieu = { ...P202608, cap: { 立替経費精算: 28578 } }
    expect(() => dungDong(P, NEO_202608, IDS, TK_HUU, null, null)).not.toThrow()
  })

  it('kiemDong qua sach cho ca ba to hop', () => {
    const toHop: Record<string, number>[] = [
      { 立替経費精算: 28578 },
      { 通勤手当: 77070 },
      { 通勤手当: 77070, 立替経費精算: 7780, DB掛金: -10000 },
    ]
    for (const cap of toHop) {
      const P: Phieu = { ...P202608, cap }
      const d = dungDong(P, NEO_202608, IDS, TK_HUU, null, DM_PHU_CAP)
      expect(kiemDong(P, d.thu, d.chi, d.thuKhac, d.cap, NEO_202608), JSON.stringify(cap)).toEqual([])
    }
  })
})

/**
 * 立替経費精算 di duong NO: cong ty no lai tien user ung ra, tra vao ky luong.
 * Xem docs/superpowers/specs/2026-08-20-phieu-luong-thu-nhap-thuc-notes.md (vong ba).
 */
describe('dungDong · 立替経費精算 di duong no KOME', () => {
  const N = NEO_202608.amount // 400.000
  const L = 28578
  const P_L: Phieu = { ...P202608, cap: { 立替経費精算: L } }
  const NO = { id: 'debt-kome', conLai: 100000 }

  it('dung dong tra no thay vi tru bot dong trung hoa', () => {
    const d = dungDong(P_L, NEO_202608, IDS, TK_HUU, NO, DM_PHU_CAP)
    expect(d.traNo).not.toBeNull()
    expect(d.traNo!.debtId).toBe('debt-kome')
    expect(d.traNo!.amount).toBe(L)
    expect(d.traNo!.dong).toMatchObject({ type: 'income', amount: L, account_id: YUCHO })
    // Trung hoa rut TRON neo.amount — khac duong roi-lai (neo.amount − L)
    const trungHoa = d.cap.find((r) => r.type === 'expense' && r.exclude_from_stats)
    expect(trungHoa?.amount).toBe(N)
  })

  it('so du Yucho van bang 0 khi tinh ca dong tra no', () => {
    const d = dungDong(P_L, NEO_202608, IDS, TK_HUU, NO, DM_PHU_CAP)
    expect(soDu([...d.cap, d.traNo!.dong], YUCHO)).toBe(0)
  })

  /** Dong tra no mang is_debt_flow (repo tu dat) nen KHONG nam trong Thu. */
  it('Thu van giam dung L, dong tra no khong duoc dem vao Thu', () => {
    const d = dungDong(P_L, NEO_202608, IDS, TK_HUU, NO, DM_PHU_CAP)
    expect(thuTrongTk(d.cap.filter((r) => r.account_id === YUCHO)) - N).toBe(-L)
  })

  it('con no < L thi NO, khong lang le roi ve cach cu', () => {
    expect(() => dungDong(P_L, NEO_202608, IDS, TK_HUU, { id: 'd', conLai: L - 1 }, DM_PHU_CAP)).toThrow(/KOME/)
  })

  it('con no dung bang L thi qua', () => {
    const d = dungDong(P_L, NEO_202608, IDS, TK_HUU, { id: 'd', conLai: L }, DM_PHU_CAP)
    expect(d.traNo!.amount).toBe(L)
  })

  it('khong co khoan no -> roi ve cach cu (trung hoa = N − L, khong co traNo)', () => {
    const d = dungDong(P_L, NEO_202608, IDS, TK_HUU, null, DM_PHU_CAP)
    expect(d.traNo).toBeNull()
    expect(d.cap.find((r) => r.type === 'expense' && r.exclude_from_stats)?.amount).toBe(N - L)
  })

  it('phieu khong co 立替経費精算 thi khong tra no du co khoan no', () => {
    const d = dungDong({ ...P202608, cap: { 通勤手当: 77070 } }, NEO_202608, IDS, TK_HUU, NO, DM_PHU_CAP)
    expect(d.traNo).toBeNull()
  })

  it('co ca C va L: hoan ve tau + tra no, so du van 0', () => {
    const P: Phieu = { ...P202608, cap: { 通勤手当: 77070, 立替経費精算: L } }
    const d = dungDong(P, NEO_202608, IDS, TK_HUU, NO, DM_PHU_CAP)
    expect(soDu([...d.cap, d.traNo!.dong], YUCHO)).toBe(0)
    expect(thuTrongTk(d.cap.filter((r) => r.account_id === YUCHO)) - N).toBe(-(77070 + L))
    expect(d.cap.find((r) => r.category_id === DM_PHU_CAP)?.amount).toBe(77070)
  })

  it('kiemDong qua sach ca hai duong', () => {
    for (const no of [NO, null]) {
      const d = dungDong(P_L, NEO_202608, IDS, TK_HUU, no, DM_PHU_CAP)
      expect(
        kiemDong(P_L, d.thu, d.chi, d.thuKhac, d.cap, NEO_202608, d.traNo),
        no ? 'duong no' : 'roi lai',
      ).toEqual([])
    }
  })

  it('kiemDong bat duoc dong tra no sai so', () => {
    const d = dungDong(P_L, NEO_202608, IDS, TK_HUU, NO, DM_PHU_CAP)
    const xau = { ...d.traNo!, dong: { ...d.traNo!.dong, amount: L + 1 } }
    expect(kiemDong(P_L, d.thu, d.chi, d.thuKhac, d.cap, NEO_202608, xau).join(' ')).toMatch(/số dư/)
  })

  it('dungKeHoach mang traNo ra ke hoach va tu choi khi thieu no', () => {
    const ok = dungKeHoach([P_L], [NEO_202608], YUCHO, IDS, new Set(), TK_HUU, NO, DM_PHU_CAP)
    expect(ok[0].trangThai).toBe('dat')
    expect(ok[0].traNo?.amount).toBe(L)
    const thieu = dungKeHoach([P_L], [NEO_202608], YUCHO, IDS, new Set(), TK_HUU, { id: 'd', conLai: 1 }, DM_PHU_CAP)
    expect(thieu[0].trangThai).toBe('tu-choi')
    expect(thieu[0].lyDo).toMatch(/KOME/)
  })
})
