// Khoản ⑤ — 医療費控除 (spec 2026-09-05-iryohi-kojo).
//
// Hai nhánh, luật cấm cộng dồn — app tính cả hai rồi lấy nhánh lợi hơn:
//   · nhánh chính (NTA No.1120): (chi y tế − ngưỡng 10万) kẹp trần 200万
//   · self-med   (NTA No.1132): (chi THUỐC − 1,2万) kẹp 8,8万, hết hạn 2026-12-31,
//     cần 一定の取組 (健康診断 công ty là đủ — người làm công ăn lương gần như mặc nhiên có)
//
// MỌI SỐ LÀ CẬN DƯỚI CÓ CHỦ Ý: ngưỡng thật = min(10万, 5% × 総所得金額等) nhưng app không
// ước nổi 総所得金額等 tử tế — dùng thẳng 10万 thì người thu nhập thấp có khấu trừ thật CHỈ
// LỚN HƠN số app hứa. Thà hứa ít giao nhiều. Ba méo mó khác nằm trong `ly_do`.
//
// THUẦN: không React, không Date — vào bundle edge cùng bốn khoản kia.
import { calendarYearOf, calendarYearRange } from '../../lib/dates'
import type { CategoryRow, TransactionRow } from '../../types/database.types'
import type { KetLuan } from './ketLuan'
import { tienTietKiem } from './marginalRate'
import { luatChoNam } from './rules/luat'

/** Tên danh mục được đếm — theo TÊN, cùng lối FURUSATO_CATEGORY_NAME. KHÔNG đếm
 *  "Sức khỏe" (gym/thể chất không thuộc diện). */
export const IRYOHI_CATEGORY_NAMES = ['Thuốc', 'Bệnh viện'] as const

export interface IryohiInput {
  year: number
  todayISO: string
  categories: CategoryRow[]
  txs: TransactionRow[]
  suatBien: number | null
  /** Khoản ①/② đang đề xuất nộp 確定申告 năm nay — câu việc nhắc "khai cùng tờ đó". */
  deXuatKhaiThue: boolean
  fmt: (minorJpy: number) => string
}

export interface IryohiKetQua {
  ketLuan: KetLuan
  /** Σ Thuốc + Bệnh viện trong năm dương lịch (hoàn tiền trừ ra). */
  chi_y: number
  /** Σ riêng Thuốc — đầu vào nhánh self-med. */
  chi_thuoc: number
  nguong: number
  khau_tru_chinh: number
  khau_tru_self: number
  /** max của hai nhánh (luật cấm cộng dồn). */
  khau_tru: number
  /** Nhánh thắng; null khi cả hai bằng 0. */
  nhanh: 'chinh' | 'self' | null
  co_danh_muc: boolean
}

/** Bản riêng của khoản ⑤ (furusato.ts có bản tương tự — hàm cục bộ, không export chéo). */
function idsTheoTen(categories: CategoryRow[], names: readonly string[]): Set<string> {
  return new Set(
    categories.filter((c) => c.type === 'expense' && names.includes(c.name)).map((c) => c.id),
  )
}

function tong(txs: TransactionRow[], ids: Set<string>, start: string, end: string): number {
  let t = 0
  for (const x of txs) {
    if (x.type !== 'expense' || x.category_id == null || !ids.has(x.category_id)) continue
    if (x.occurred_on < start || x.occurred_on >= end) continue
    t += x.is_refund ? -x.amount : x.amount
  }
  return t
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)

export function tinhIryohi(input: IryohiInput): IryohiKetQua {
  const luat = luatChoNam(input.year)
  const namNay = calendarYearOf(input.todayISO)
  const nam = calendarYearRange(input.year)

  const idsY = idsTheoTen(input.categories, IRYOHI_CATEGORY_NAMES)
  const idsThuoc = idsTheoTen(input.categories, ['Thuốc'])
  const co_danh_muc = idsY.size > 0

  const chi_y = tong(input.txs, idsY, nam.start, nam.end)
  const chi_thuoc = tong(input.txs, idsThuoc, nam.start, nam.end)

  const khau_tru_chinh = clamp(chi_y - luat.iryohi.nguong, 0, luat.iryohi.tranKhauTru)
  const selfConHieuLuc =
    luat.iryohi.selfMed.hetHan === null || `${input.year}-12-31` <= luat.iryohi.selfMed.hetHan
  const khau_tru_self = selfConHieuLuc
    ? clamp(chi_thuoc - luat.iryohi.selfMed.nguong, 0, luat.iryohi.selfMed.tran)
    : 0
  const khau_tru = Math.max(khau_tru_chinh, khau_tru_self)
  // Bằng nhau thì coi là nhánh chính: giấy tờ của nó ai cũng có (hoá đơn), không đòi ★OTC.
  const nhanh: IryohiKetQua['nhanh'] =
    khau_tru === 0 ? null : khau_tru_chinh >= khau_tru_self ? 'chinh' : 'self'

  const tiet_kiem_uoc =
    khau_tru > 0 && input.suatBien !== null
      ? tienTietKiem(khau_tru, khau_tru, input.suatBien, luat)
      : null

  // Ba méo mó của phép ước — nói ra thay vì im (spec §3), + điều kiện riêng từng nhánh.
  const ly_do = [
    'Số ước là CẬN DƯỚI: app đếm cả khoản không thuộc diện (thực phẩm chức năng…), bỏ sót tiền tàu đi viện (nằm ở Tàu điện), và không trừ được tiền bảo hiểm bù — ngưỡng thật còn có thể thấp hơn 10万 nếu thu nhập thấp.',
  ]
  if (!co_danh_muc)
    ly_do.push(`Chưa có danh mục "${IRYOHI_CATEGORY_NAMES.join('" / "')}" nên không đếm được.`)
  if (nhanh === 'self')
    ly_do.push(
      'Nhánh セルフメディケーション chỉ tính thuốc OTC có dấu ★ và cần 健康診断 trong năm — app đếm cả danh mục Thuốc nên số thật thấp hơn.',
    )
  if (nhanh === 'chinh' && khau_tru_self > 0)
    ly_do.push(`Nhánh OTC được ≈ ${input.fmt(khau_tru_self)} nhưng nhánh chính lợi hơn — chỉ được chọn một.`)
  if (khau_tru > 0 && input.suatBien === null)
    ly_do.push('Chưa ước được tiền thuế bớt (thiếu phiếu lương 所得税) — khấu trừ thì vẫn chắc.')

  let trang_thai: KetLuan['trang_thai']
  let viec: string
  let han: string | null = null
  if (khau_tru > 0 && input.year === namNay) {
    trang_thai = 'thieu'
    han = `${input.year + 1}-03-15`
    viec = `Chi y tế đã vượt ngưỡng — giữ hoá đơn, khai 医療費控除 ${
      input.deXuatKhaiThue ? 'cùng tờ 確定申告 của khoản phụ thuộc' : 'trong 確定申告'
    } trước 15/3`
  } else if (khau_tru > 0) {
    trang_thai = 'het-han'
    viec = `Năm ${input.year} chi y tế ${input.fmt(chi_y)}, khấu trừ được ≈ ${input.fmt(khau_tru)}`
  } else {
    trang_thai = 'du'
    viec = `Chi y tế ${input.fmt(chi_y)} / ngưỡng ${input.fmt(luat.iryohi.nguong)} — chưa tới mức khấu trừ`
  }

  return {
    ketLuan: {
      id: 'iryohi',
      year: input.year,
      trang_thai,
      muc: 'low',
      tiet_kiem_uoc,
      han,
      viec,
      ly_do,
    },
    chi_y,
    chi_thuoc,
    nguong: luat.iryohi.nguong,
    khau_tru_chinh,
    khau_tru_self,
    khau_tru,
    nhanh,
    co_danh_muc,
  }
}
