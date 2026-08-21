// Tool trung tâm: Claude chọn ĐO GÌ và XẺ THEO CHIỀU NÀO, tự do phối.
//
// Vì sao một tool ghép thay vì năm tool bọc năm màn hình: giá trị của việc nối Claude vào
// đây không nằm ở chỗ phục vụ lại số app đã hiện, mà ở những quan hệ KHÔNG màn hình nào
// ghép — chi theo ngày lễ Nhật, tháng gửi tiền về VN so với tháng tiêu ở Nhật, khoản ghi
// muộn so với khoản ghi ngay.
//
// Rổ giao dịch do basket.ts dựng, nên Claude không có đường nào lách được luật lọc/quy đổi.
import { dungRo, thangCuaNgay, type DuLieu, type Khoang, type PhamVi } from '../basket'
import { tien, type Tien } from '../format'
import { expenseSign } from '../../features/reports/aggregate'
import { convertToBase } from '../../lib/rates'
import { isJapaneseHoliday } from '../../lib/jpHolidays'
import type { CurrencyCode } from '../../lib/currencies'
import type { TransactionRow } from '../../types/database.types'

export type DoLuong = 'tong_tien' | 'so_lan' | 'trung_binh_moi_lan' | 'lon_nhat' | 'do_tre_ghi'

export type Chieu =
  | 'danh_muc' | 'danh_muc_cha' | 'nhan' | 'tai_khoan' | 'thang' | 'tuan' | 'thu_trong_tuan'
  | 'gio_nhap' | 'ngay_le_nhat' | 'co_khoan' | 'need_level' | 'cost_type' | 'la_gui_tien'

export type Loai = 'chi' | 'thu' | 'chuyen'

export interface Loc {
  danh_muc?: string[]
  nhan?: string[]
  tai_khoan?: string[]
  tien_te?: CurrencyCode[]
  la_gui_tien?: boolean
  /** Nhận chuỗi thô, không phải enum: giá trị thật của `need_level` nằm ở
   *  types/database.types.ts và không cần lặp lại ở đây — so khớp thẳng với giá trị của
   *  danh mục là đủ, và không sai khi bảng enum đó thay đổi. */
  need_level?: string[]
  cost_type?: string[]
}

export interface TruyVanInput {
  do_luong: DoLuong
  /** 0..2 chiều. Rỗng = một dòng tổng. */
  xe_theo: Chieu[]
  /** Mặc định 'chi' — hỏi "tiêu bao nhiêu" là câu hay gặp nhất, và trộn thu vào là số vô nghĩa. */
  loai?: Loai
  loc?: Loc
  khoang: Khoang
  sap_xep?: 'giam' | 'tang' | 'ten'
  gioi_han?: number
}

export interface DongTruyVan {
  khoa: string[]
  tien?: Tien
  so?: number
  so_lan: number
}

export interface TruyVanKetQua {
  dong: DongTruyVan[]
  pham_vi: PhamVi
  thieu_ty_gia: boolean
  so_khoan_bi_loai: number
  ghi_chu: string[]
}

const KHUNG_GIO: [number, string][] = [
  [6, 'đêm 0–5'],
  [12, 'sáng 6–11'],
  [18, 'chiều 12–17'],
  [24, 'tối 18–23'],
]

const THU = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy']

/**
 * 'YYYY-Www' theo tuần ISO (tuần bắt đầu thứ Hai; tuần chứa thứ Năm quyết định năm).
 * Dùng `new Date(Date.UTC(...))` — CÓ tham số, nên không phạm luật cấm đọc đồng hồ.
 */
function tuanISO(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7) + 3)
  const namISO = dt.getUTCFullYear()
  const moc = new Date(Date.UTC(namISO, 0, 4))
  moc.setUTCDate(moc.getUTCDate() - ((moc.getUTCDay() + 6) % 7) + 3)
  const tuan = 1 + Math.round((dt.getTime() - moc.getTime()) / (7 * 86_400_000))
  return `${namISO}-W${String(tuan).padStart(2, '0')}`
}

/** Ngưỡng cỡ khoản theo minor units của từng đồng tiền gốc. */
const NGUONG_CO: Record<CurrencyCode, number[]> = {
  JPY: [1_000, 5_000, 20_000, 100_000],
  VND: [100_000, 500_000, 2_000_000, 10_000_000],
  USD: [1_000, 5_000, 20_000, 100_000],
}

/** Giờ địa phương của một mốc UTC, theo múi giờ IANA. Không đọc đồng hồ hệ thống. */
function gioTai(isoUtc: string, tz: string): number {
  const s = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour: '2-digit', hour12: false,
  }).format(new Date(isoUtc))
  return Number(s) % 24
}

/** 'YYYY-MM-DD' của một mốc UTC theo múi giờ user — để đo độ trễ theo NGÀY địa phương. */
function ngayTai(isoUtc: string, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(isoUtc))
}

function soNgayGiua(tuISO: string, denISO: string): number {
  const [y1, m1, d1] = tuISO.split('-').map(Number)
  const [y2, m2, d2] = denISO.split('-').map(Number)
  const a = Date.UTC(y1, m1 - 1, d1)
  const b = Date.UTC(y2, m2 - 1, d2)
  return Math.round((b - a) / 86_400_000)
}

function coKhoan(minor: number, don_vi: CurrencyCode): string {
  const n = NGUONG_CO[don_vi]
  const abs = Math.abs(minor)
  if (abs < n[0]) return 'rất nhỏ'
  if (abs < n[1]) return 'nhỏ'
  if (abs < n[2]) return 'vừa'
  if (abs < n[3]) return 'to'
  return 'rất to'
}

export function truyVan(input: TruyVanInput, du: DuLieu): TruyVanKetQua {
  if (input.xe_theo.length > 2) {
    throw new Error(
      'Xẻ tối đa 2 chiều một lần. Ba chiều trở lên thì bảng nở ra hàng trăm dòng, ' +
        'khó đọc và tốn token — hãy lọc bớt rồi xẻ lại.',
    )
  }

  const ro = dungRo(du, input.khoang)
  const loai: Loai = input.loai ?? 'chi'
  const ghi_chu: string[] = []

  const tenTaiKhoan = new Map(du.accounts.map((a) => [a.id, a.name]))
  const tienTeCua = new Map(du.accounts.map((a) => [a.id, a.currency]))
  const danhMuc = new Map(du.categories.map((c) => [c.id, c]))
  const tenNhan = new Map(du.tags.map((t) => [t.id, t.name]))
  const nhanCuaTx = new Map<string, string[]>()
  for (const tt of du.txTags) {
    const ten = tenNhan.get(tt.tag_id)
    if (ten === undefined) continue
    const cu = nhanCuaTx.get(tt.transaction_id)
    if (cu) cu.push(ten)
    else nhanCuaTx.set(tt.transaction_id, [ten])
  }

  /** Tên → tập id, so khớp không phân biệt hoa thường. Ném lỗi kèm tên có thật nếu lệch. */
  function idTheoTen(
    ten: string[], nguon: { id: string; name: string }[], nhan: string,
  ): Set<string> {
    const theoTen = new Map(nguon.map((x) => [x.name.toLowerCase(), x.id]))
    const out = new Set<string>()
    for (const t of ten) {
      const id = theoTen.get(t.trim().toLowerCase())
      if (id === undefined) {
        throw new Error(
          `Không có ${nhan} tên "${t}". Tên có thật: ${nguon.map((x) => x.name).join(', ')}`,
        )
      }
      out.add(id)
    }
    return out
  }

  const locDanhMuc = input.loc?.danh_muc
    ? idTheoTen(input.loc.danh_muc, du.categories, 'danh mục')
    : null
  const locTaiKhoan = input.loc?.tai_khoan
    ? idTheoTen(input.loc.tai_khoan, du.accounts, 'tài khoản')
    : null
  const locNhan = input.loc?.nhan ? idTheoTen(input.loc.nhan, du.tags, 'nhãn') : null
  const nhanIdCuaTx = new Map<string, Set<string>>()
  if (locNhan) {
    for (const tt of du.txTags) {
      const cu = nhanIdCuaTx.get(tt.transaction_id)
      if (cu) cu.add(tt.tag_id)
      else nhanIdCuaTx.set(tt.transaction_id, new Set([tt.tag_id]))
    }
  }

  /** Danh mục của giao dịch là chuyển TÀI SẢN (gửi về VN, điều chỉnh số dư)? */
  const danhMucChuyen = (t: TransactionRow) =>
    t.category_id !== null && ro.transferIds.has(t.category_id)

  /**
   * Phân loại PHẢI khớp `sumIncomeExpense` (aggregate.ts:307) từng nhánh một, không thì
   * `truy_van` và `bao_cao_thang` trả hai con số cho cùng một tháng — đúng loại lỗi mà
   * commit 7dc3834 đã phải sửa một lần. parity.test.ts chốt lại điều này.
   *
   * Hệ quả cố ý: `type = 'transfer'` (chuyển giữa hai tài khoản của chính mình) KHÔNG
   * thuộc loại nào cả, vì hàm kia bỏ hẳn nó — tiền không rời tay, và cộng vào thì cộng
   * hai lần cùng một khoản.
   */
  function dungLoai(t: TransactionRow): boolean {
    if (t.type === 'transfer') return false
    if (loai === 'thu') return t.type === 'income'
    if (loai === 'chuyen') return t.type === 'expense' && danhMucChuyen(t)
    return t.type === 'expense' && !danhMucChuyen(t)
  }

  function quaLoc(t: TransactionRow): boolean {
    if (locDanhMuc && (t.category_id === null || !locDanhMuc.has(t.category_id))) return false
    if (locTaiKhoan && !locTaiKhoan.has(t.account_id)) return false
    if (locNhan) {
      const cua = nhanIdCuaTx.get(t.id)
      if (!cua || ![...locNhan].some((x) => cua.has(x))) return false
    }
    if (input.loc?.tien_te) {
      const cur = tienTeCua.get(t.account_id)
      if (cur === undefined || !input.loc.tien_te.includes(cur)) return false
    }
    if (input.loc?.la_gui_tien !== undefined) {
      if ((t.is_remittance ?? false) !== input.loc.la_gui_tien) return false
    }
    // need_level / cost_type nằm trên DANH MỤC, không trên giao dịch — phải tra qua category_id.
    if (input.loc?.need_level || input.loc?.cost_type) {
      const cat = t.category_id === null ? undefined : danhMuc.get(t.category_id)
      if (input.loc.need_level && !input.loc.need_level.includes(cat?.need_level ?? '')) return false
      if (input.loc.cost_type && !input.loc.cost_type.includes(cat?.cost_type ?? '')) return false
    }
    return true
  }

  /** Giá trị các chiều cho một giao dịch. `nhan` trả nhiều giá trị → giao dịch vào nhiều nhóm. */
  function khoaCua(t: TransactionRow, chieu: Chieu): string[] {
    const cat = t.category_id === null ? undefined : danhMuc.get(t.category_id)
    switch (chieu) {
      case 'danh_muc':
        return [cat?.name ?? '(không danh mục)']
      case 'danh_muc_cha': {
        if (cat === undefined) return ['(không danh mục)']
        const cha = cat.parent_id === null ? cat : danhMuc.get(cat.parent_id)
        return [cha?.name ?? cat.name]
      }
      case 'nhan': {
        const ten = nhanCuaTx.get(t.id)
        return ten === undefined || ten.length === 0 ? ['(không nhãn)'] : ten
      }
      case 'tai_khoan':
        return [tenTaiKhoan.get(t.account_id) ?? '(tài khoản đã xoá)']
      case 'thang':
        return [thangCuaNgay(t.occurred_on, du.monthStartDay)]
      case 'tuan':
        return [tuanISO(t.occurred_on)]
      case 'thu_trong_tuan': {
        const [y, m, d] = t.occurred_on.split('-').map(Number)
        return [THU[new Date(y, m - 1, d).getDay()]]
      }
      case 'gio_nhap': {
        const h = gioTai(t.created_at, du.tz)
        return [KHUNG_GIO.find(([tran]) => h < tran)?.[1] ?? 'tối 18–23']
      }
      case 'ngay_le_nhat': {
        if (isJapaneseHoliday(t.occurred_on)) return ['ngày lễ']
        const [y, m, d] = t.occurred_on.split('-').map(Number)
        const wd = new Date(y, m - 1, d).getDay()
        return [wd === 0 || wd === 6 ? 'cuối tuần' : 'ngày thường']
      }
      case 'co_khoan':
        return [coKhoan(t.amount, tienTeCua.get(t.account_id) ?? du.base)]
      case 'need_level':
        return [cat?.need_level ?? '(chưa phân loại)']
      case 'cost_type':
        return [cat?.cost_type ?? '(chưa phân loại)']
      case 'la_gui_tien':
        return [t.is_remittance ? 'gửi tiền về VN' : 'không']
    }
  }

  interface Gom { tong: number; soLan: number; lonNhat: number; treNgay: number }
  const nhom = new Map<string, { khoa: string[]; g: Gom }>()
  let thieu_ty_gia = false
  let so_khoan_bi_loai = 0
  let nhieuNhan = false

  for (const t of ro.txs) {
    if (!dungLoai(t) || !quaLoc(t)) continue

    const cur = tienTeCua.get(t.account_id)
    if (cur === undefined) {
      so_khoan_bi_loai += 1
      thieu_ty_gia = true
      continue
    }
    const v = convertToBase(t.amount, cur, du.base, ro.rates)
    if (v === null) {
      so_khoan_bi_loai += 1
      thieu_ty_gia = true
      continue
    }
    const giaTri = loai === 'thu' ? v : v * expenseSign(t)
    const tre = soNgayGiua(t.occurred_on, ngayTai(t.created_at, du.tz))

    // Tích Descartes các chiều. `nhan` là chiều duy nhất trả nhiều giá trị.
    const phan = input.xe_theo.map((c) => khoaCua(t, c))
    if (phan.some((p) => p.length > 1)) nhieuNhan = true
    const toHop: string[][] = phan.length === 0 ? [[]] : phan.reduce<string[][]>(
      (acc, p) => acc.flatMap((dau) => p.map((x) => [...dau, x])),
      [[]],
    )

    for (const khoa of toHop) {
      const k = khoa.join(' ')
      const cu = nhom.get(k)
      const g = cu?.g ?? { tong: 0, soLan: 0, lonNhat: 0, treNgay: 0 }
      g.tong += giaTri
      g.soLan += 1
      g.lonNhat = Math.max(g.lonNhat, Math.abs(giaTri))
      g.treNgay += tre
      if (cu === undefined) nhom.set(k, { khoa, g })
    }
  }

  if (nhieuNhan) {
    ghi_chu.push(
      'Một giao dịch có thể mang nhiều nhãn nên nó được tính vào nhiều dòng — tổng các ' +
        'dòng có thể LỚN HƠN tổng thật.',
    )
  }
  if (loai === 'chuyen') {
    ghi_chu.push(
      'Chỉ tính khoản CHI thuộc danh mục chuyển tài sản (ví dụ gửi tiền về VN). Khoản ' +
        'chuyển giữa hai tài khoản của chính mình KHÔNG được tính — tiền không rời tay, ' +
        'và tab Báo cáo của app cũng không tính chúng.',
    )
  }
  if (thieu_ty_gia) {
    ghi_chu.push(
      `Thiếu tỷ giá cho ${so_khoan_bi_loai} khoản; chúng bị loại khỏi tổng (không quy 1:1), ` +
        'nên con số dưới đây là CHƯA ĐỦ.',
    )
  }

  let dong: DongTruyVan[] = [...nhom.values()].map(({ khoa, g }) => {
    switch (input.do_luong) {
      case 'so_lan':
        return { khoa, so: g.soLan, so_lan: g.soLan }
      case 'do_tre_ghi':
        return { khoa, so: Math.round(g.treNgay / g.soLan), so_lan: g.soLan }
      case 'trung_binh_moi_lan':
        return { khoa, tien: tien(Math.round(g.tong / g.soLan), du.base), so_lan: g.soLan }
      case 'lon_nhat':
        return { khoa, tien: tien(g.lonNhat, du.base), so_lan: g.soLan }
      case 'tong_tien':
        return { khoa, tien: tien(g.tong, du.base), so_lan: g.soLan }
    }
  })

  const giaTriSap = (d: DongTruyVan) => d.tien?.so ?? d.so ?? 0
  const sap = input.sap_xep ?? 'giam'
  dong.sort((a, b) =>
    sap === 'ten'
      ? a.khoa.join(' ').localeCompare(b.khoa.join(' '), 'vi')
      : sap === 'tang'
        ? giaTriSap(a) - giaTriSap(b)
        : giaTriSap(b) - giaTriSap(a),
  )
  dong = dong.slice(0, input.gioi_han ?? 20)

  if (dong.length === 0) {
    ghi_chu.push(
      `Chưa có giao dịch nào khớp trong khoảng ${ro.phamVi.tu_ngay} → ${ro.phamVi.den_ngay} ` +
        '(mốc cuối không tính). Đây là "không có dữ liệu", KHÔNG phải "tiêu 0 đồng".',
    )
  }

  const loc_da_ap = [
    ...ro.phamVi.loc_da_ap,
    loai === 'chi'
      ? 'chỉ tính khoản CHI'
      : loai === 'thu'
        ? 'chỉ tính khoản THU'
        : 'chỉ tính khoản CHUYỂN TÀI SẢN',
  ]

  return {
    dong,
    pham_vi: { ...ro.phamVi, loc_da_ap },
    thieu_ty_gia,
    so_khoan_bi_loai,
    ghi_chu,
  }
}
