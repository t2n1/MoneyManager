// Khoản ① — Khấu trừ người phụ thuộc ở nước ngoài (国外居住親族に係る扶養控除).
//
// Luật (rules/2026.ts, NTA No.1180 + quận Ōta): tính RIÊNG TỪNG NGƯỜI, theo NĂM DƯƠNG LỊCH.
//   <16      không được khấu trừ (đã thay bằng 児童手当)
//   16–29    có gửi là được, không ngưỡng            → 38万 / 33万
//   30–69    phải nhận ≥ 38万 trong năm (từ 2023)     → 38万 / 33万
//   70+      có gửi là được, không ngưỡng            → 48万 / 38万 (老人扶養親族)
//
// Số gửi của một lần = amount − remit_fee_jpy (quan hệ chốt của sổ, xem đầu
// transactions/remitDerive.ts và remittance/aggregate.ts). Tài khoản nguồn không phải JPY
// thì quy về yên qua convertToBase; thiếu tỷ giá → LOẠI và bật cờ, không quy 1:1.
//
// THUẦN: không React, không Date, KHÔNG nhận monthStartDay — không nhận thì không dùng nhầm.
import { calendarYearOf } from '../../lib/dates'
import type { CurrencyCode } from '../../lib/currencies'
import { convertToBase, type Rates } from '../../lib/rates'
import type { AccountRow, RelativeRow, TransactionRow } from '../../types/database.types'
import type { KetLuan } from './ketLuan'
import { tienTietKiem } from './marginalRate'
import { luatChoNam } from './rules/luat'

export type NhomTuoi = '<16' | '16-29' | '30-69' | '70+'

export interface FuyoInput {
  year: number
  todayISO: string
  relatives: RelativeRow[]
  /** Giao dịch bất kỳ; tự lọc is_remittance + năm. */
  txs: TransactionRow[]
  accounts: Pick<AccountRow, 'id' | 'currency'>[]
  base: CurrencyCode
  rates: Rates
  /** Thuế suất biên ước (marginalRate.ts); null = chưa đủ phiếu lương → không ước tiền. */
  suatBien: number | null
}

export interface FuyoNguoi {
  id: string
  name: string
  tuoi: number
  nhom: NhomTuoi
  /** Σ số gửi trong năm, yên. */
  da_gui: number
  so_lan: number
  /** 0 khi nhóm không có ngưỡng. */
  nguong: number
  con_thieu: number
  du: boolean
  khau_tru_shotoku: number
  khau_tru_jumin: number
  tiet_kiem_uoc: number | null
  /** Tên giấy phải nộp cho công ty khi 年末調整. */
  giay: string[]
}

export interface FuyoKetQua {
  ketLuan: KetLuan
  nguoi: FuyoNguoi[]
  /** Lần gửi trong năm chưa gán người nhận. */
  chua_gan: { so_lan: number; tong: number }
  thang_con_lai: number
  thieu_ty_gia: boolean
  /** Người bị bỏ qua vì country ≠ VN-kiểu (đã cư trú ở Nhật). */
  bo_qua: string[]
}

/** Số gửi (yên) của một lần gửi; null khi thiếu tỷ giá. */
export function soGuiJpy(
  t: TransactionRow,
  currencyOf: (accountId: string) => CurrencyCode,
  base: CurrencyCode,
  rates: Rates,
): number | null {
  const sent = Math.max(t.amount - (t.remit_fee_jpy ?? 0), 0)
  const cur = currencyOf(t.account_id)
  if (cur === 'JPY') return sent
  // rates là tỷ giá so với base; chỉ đổi được khi base là JPY. Base khác → coi như thiếu.
  if (base !== 'JPY') return null
  return convertToBase(sent, cur, 'JPY', rates)
}

export function nhomTuoi(tuoi: number): NhomTuoi {
  if (tuoi < 16) return '<16'
  if (tuoi < 30) return '16-29'
  if (tuoi < 70) return '30-69'
  return '70+'
}

export function tinhFuyo(input: FuyoInput): FuyoKetQua {
  const luat = luatChoNam(input.year)
  const byId = new Map(input.accounts.map((a) => [a.id, a.currency]))
  const currencyOf = (id: string): CurrencyCode => byId.get(id) ?? input.base

  const thangHomNay = Number(input.todayISO.slice(5, 7))
  const namHomNay = calendarYearOf(input.todayISO)
  const thang_con_lai = input.year === namHomNay ? 12 - thangHomNay : input.year > namHomNay ? 12 : 0

  // Gom số gửi theo người
  const daGui = new Map<string, { tong: number; so_lan: number }>()
  const chua_gan = { so_lan: 0, tong: 0 }
  let thieu_ty_gia = false
  for (const t of input.txs) {
    if (!t.is_remittance || calendarYearOf(t.occurred_on) !== input.year) continue
    const yen = soGuiJpy(t, currencyOf, input.base, input.rates)
    if (yen === null) {
      thieu_ty_gia = true
      continue
    }
    if (t.remit_recipient_id == null) {
      chua_gan.so_lan++
      chua_gan.tong += yen
      continue
    }
    const cur = daGui.get(t.remit_recipient_id) ?? { tong: 0, so_lan: 0 }
    cur.tong += yen
    cur.so_lan++
    daGui.set(t.remit_recipient_id, cur)
  }

  const bo_qua: string[] = []
  const nguoi: FuyoNguoi[] = []
  for (const r of input.relatives) {
    if (r.is_archived) continue
    if (r.country === 'JP') {
      bo_qua.push(r.name)
      continue
    }
    const tuoi = input.year - r.birth_year
    const nhom = nhomTuoi(tuoi)
    const g = daGui.get(r.id) ?? { tong: 0, so_lan: 0 }
    const nguong = nhom === '30-69' ? (luat.fuyo.nguong30_69 ?? 0) : 0
    const coGui = g.so_lan > 0
    const du = nhom !== '<16' && coGui && g.tong >= nguong
    const laoNhan = nhom === '70+'
    const khau_tru_shotoku = du ? (laoNhan ? luat.fuyo.khauTruShotoku.laoNhan : luat.fuyo.khauTruShotoku.thuong) : 0
    const khau_tru_jumin = du ? (laoNhan ? luat.fuyo.khauTruJumin.laoNhan : luat.fuyo.khauTruJumin.thuong) : 0
    const giay =
      nhom === '30-69' && nguong > 0
        ? ['親族関係書類', '38万円送金書類']
        : ['親族関係書類', '送金関係書類']
    nguoi.push({
      id: r.id,
      name: r.name,
      tuoi,
      nhom,
      da_gui: g.tong,
      so_lan: g.so_lan,
      nguong,
      con_thieu: nhom === '30-69' ? Math.max(0, nguong - g.tong) : 0,
      du,
      khau_tru_shotoku,
      khau_tru_jumin,
      tiet_kiem_uoc:
        input.suatBien === null || !du
          ? null
          : tienTietKiem(khau_tru_shotoku, khau_tru_jumin, input.suatBien, luat),
      giay,
    })
  }

  const ly_do: string[] = []
  if (input.suatBien === null)
    ly_do.push('Chưa đủ 12 tháng phiếu lương để ước thuế suất — nhập phiếu lương thì mới có số tiền tiết kiệm.')
  else ly_do.push('Tiền tiết kiệm là số ước từ thuế suất biên trên phiếu lương; công ty/sở thuế ra số cuối.')
  if (thieu_ty_gia) ly_do.push('Có lần gửi từ tài khoản ngoại tệ thiếu tỷ giá, đã loại khỏi tổng.')
  if (bo_qua.length) ly_do.push(`${bo_qua.join(', ')} đang cư trú ở Nhật — theo luật người cư trú, ngoài phạm vi khoản này.`)
  ly_do.push(`Người thân phải có 合計所得金額 ≤ ¥${luat.fuyo.thuNhapToiDa.toLocaleString('vi-VN')}/năm — app không kiểm được điều này.`)

  const tongTietKiem = nguoi.some((n) => n.tiet_kiem_uoc !== null)
    ? nguoi.reduce((s, n) => s + (n.tiet_kiem_uoc ?? 0), 0)
    : null
  const han = `${input.year}-12-31`
  const thieu = nguoi.filter((n) => n.nhom === '30-69' && !n.du)
  const muc: KetLuan['muc'] = thang_con_lai <= 2 ? 'high' : 'medium'

  let trang_thai: KetLuan['trang_thai']
  let viec: string
  if (nguoi.length === 0 && bo_qua.length === 0) {
    trang_thai = 'thieu-du-lieu'
    viec = 'Thêm người thân nhận tiền để app tính được khấu trừ người phụ thuộc'
  } else if (chua_gan.so_lan > 0) {
    trang_thai = 'thieu-du-lieu'
    viec = `Gán người nhận cho ${chua_gan.so_lan} lần gửi (¥${chua_gan.tong.toLocaleString('vi-VN')}) — chưa gán thì số dưới đây đang thiếu`
  } else if (thieu.length > 0 && input.year < namHomNay) {
    trang_thai = 'het-han'
    viec = `${thieu.map((n) => n.name).join(', ')} không đủ 38万 năm ${input.year}`
  } else if (thieu.length > 0) {
    trang_thai = 'thieu'
    const n = thieu[0]
    viec =
      thieu.length === 1
        ? `Còn ¥${n.con_thieu.toLocaleString('vi-VN')} để ${n.name} đủ 38万 · ${thang_con_lai} tháng nữa`
        : `${thieu.length} người còn thiếu để đủ 38万 · ${thang_con_lai} tháng nữa`
  } else if (nguoi.some((n) => n.du)) {
    trang_thai = 'du'
    viec = `Nộp ${[...new Set(nguoi.filter((n) => n.du).flatMap((n) => n.giay))].join(' + ')} cho công ty trước 年末調整`
  } else {
    trang_thai = 'thieu-du-lieu'
    viec = 'Chưa có lần gửi nào trong năm được gán cho người thân'
  }

  return {
    ketLuan: { id: 'fuyo', year: input.year, trang_thai, muc, tiet_kiem_uoc: tongTietKiem, han, viec, ly_do },
    nguoi,
    chua_gan,
    thang_con_lai,
    thieu_ty_gia,
    bo_qua,
  }
}
