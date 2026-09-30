// Khoản ③ — Trần ふるさと納税 và cảnh báo ワンストップ.
//
// Trần tự chịu 2.000 = 住民税所得割 × 20% ÷ (90% − 所得税率 × 1,021) + 2.000 (NTA No.1155).
// 所得割 ≈ Σ住民税 12 tháng gần nhất − 均等割 5.000. Đây là 住民税 của THU NHẬP NĂM TRƯỚC
// (trừ từ 6/(Y+1) tới 5/(Y+2)) — mọi bộ mô phỏng furusato cũng ước như vậy, và phải nói ra.
//
// ワンストップ特例 vô hiệu toàn bộ khi nộp 確定申告 cùng năm → nếu khoản ①/② đề xuất khai thì
// câu việc ở đây đổi: phải khai lại mọi khoản furusato trong tờ khai đó.
// THUẦN: không React, không Date.
import { addDaysISO, addMonthsISO, calendarYearOf, calendarYearRange } from '../../lib/dates'
import type { CategoryRow, TransactionRow } from '../../types/database.types'
import type { KetLuan } from './ketLuan'
import { luatChoNam, type LuatNam } from './rules/luat'
import { tr } from '../../i18n'

/** Tên danh mục chuẩn — tìm theo TÊN, cùng lối TAX_PARENT_NAME. */
export const FURUSATO_CATEGORY_NAME = 'ふるさと納税 (寄附)'
/** Tên hai danh mục thuế trên phiếu lương (phieu-luong/nhap.ts MAP_THUE + tax/categories.ts). */
// i18n-ignore — tên danh mục trong DB, khớp theo tên
export const SO_TAX_NAMES = { shotoku: 'Thuế thu nhập (所得税)', jumin: 'Thuế cư trú (住民税)' } as const
/** Dưới mức này thì "còn hạn mức" không đáng một dòng thông báo. */
export const FURUSATO_NHAC_TU = 10_000
/** Từ tháng này mới nhắc — trước đó còn hạn mức là chuyện của mọi tháng. */
export const THANG_NHAC_CUOI_NAM = 10

export interface FurusatoInput {
  year: number
  todayISO: string
  categories: CategoryRow[]
  txs: TransactionRow[]
  suatBien: number | null
  /** Khoản ①/② đang đề xuất nộp 確定申告 cho năm này. */
  deXuatKhaiThue: boolean
  /** Định dạng tiền (minor JPY → chuỗi hiển thị) — xem ghi chú ở FuyoInput. */
  fmt: (minorJpy: number) => string
}

export interface FurusatoKetQua {
  ketLuan: KetLuan
  tran: number | null
  shotoku_wari: number | null
  da_gui: number
  con_lai: number | null
  co_danh_muc: boolean
  onestop_rui_ro: boolean
  /** Cửa sổ 住民税 đã dùng [start, end). */
  cua_so: { start: string; end: string }
}

export function tranFurusato(shotokuWari: number, suatBien: number, luat: LuatNam): number {
  const mau = 0.9 - suatBien * luat.phucHung
  return Math.floor((shotokuWari * luat.furusato.tyLeShotokuWari) / mau) + luat.furusato.tuChiu
}

function idsTheoTen(categories: CategoryRow[], name: string): Set<string> {
  return new Set(categories.filter((c) => c.type === 'expense' && c.name === name).map((c) => c.id))
}

/** Σ amount trong [start,end) của các danh mục, hoàn tiền trừ ra. */
function tong(txs: TransactionRow[], ids: Set<string>, start: string, end: string): { tong: number; so_lan: number } {
  let t = 0
  let n = 0
  for (const x of txs) {
    if (x.type !== 'expense' || x.category_id == null || !ids.has(x.category_id)) continue
    if (x.occurred_on < start || x.occurred_on >= end) continue
    t += x.is_refund ? -x.amount : x.amount
    n++
  }
  return { tong: t, so_lan: n }
}

export function tinhFurusato(input: FurusatoInput): FurusatoKetQua {
  const luat = luatChoNam(input.year)
  const namNay = calendarYearOf(input.todayISO)
  const nam = calendarYearRange(input.year)
  // Năm nay: 12 tháng gần nhất, tới hết hôm nay (end loại trừ = ngày mai). Năm cũ: đúng năm đó.
  const cua_so =
    input.year === namNay
      ? { start: addMonthsISO(input.todayISO, -12), end: addDaysISO(input.todayISO, 1) }
      : { start: nam.start, end: nam.end }

  const juminIds = idsTheoTen(input.categories, SO_TAX_NAMES.jumin)
  const furusatoIds = idsTheoTen(input.categories, FURUSATO_CATEGORY_NAME)
  const co_danh_muc = furusatoIds.size > 0

  const jumin = tong(input.txs, juminIds, cua_so.start, cua_so.end)
  const shotoku_wari = jumin.so_lan === 0 ? null : Math.max(0, jumin.tong - luat.jumin.kinhToDan)
  const tran = shotoku_wari === null || input.suatBien === null ? null : tranFurusato(shotoku_wari, input.suatBien, luat)
  const da_gui = tong(input.txs, furusatoIds, nam.start, nam.end).tong
  const con_lai = tran === null ? null : Math.max(0, tran - da_gui)
  const onestop_rui_ro = input.deXuatKhaiThue && da_gui > 0

  const ly_do = [
    tr('Trần ước từ 住民税 trên phiếu lương 12 tháng gần nhất, tức thu nhập NĂM TRƯỚC; lương tăng thì trần thật cao hơn.'),
  ]
  if (!co_danh_muc) ly_do.push(tr('Chưa có danh mục "{name}" nên không đếm được đã gửi bao nhiêu.', { name: FURUSATO_CATEGORY_NAME }))
  if (input.suatBien === null) ly_do.push(tr('Chưa ước được thuế suất (thiếu phiếu lương 所得税).'))

  const thang = Number(input.todayISO.slice(5, 7))
  const muaNhac = input.year === namNay && thang >= THANG_NHAC_CUOI_NAM
  let trang_thai: KetLuan['trang_thai']
  let viec: string
  if (onestop_rui_ro) {
    trang_thai = 'thieu'
    viec = tr('Nếu nộp 確定申告 cho khoản phụ thuộc thì khai cả {amount} furusato vào đó — ワンストップ sẽ vô hiệu', { amount: input.fmt(da_gui) })
  } else if (shotoku_wari === null) {
    trang_thai = 'thieu-du-lieu'
    viec = tr('Nhập phiếu lương (住民税) để ước trần ふるさと納税')
  } else if (tran === null) {
    trang_thai = 'thieu-du-lieu'
    viec = tr('Nhập phiếu lương (所得税) để ước trần ふるさと納税')
  } else if (!co_danh_muc) {
    // Không đếm được đã gửi bao nhiêu → không được nói "Xong" hay "còn nguyên trần" (chưa biết ≠ 0).
    trang_thai = 'thieu-du-lieu'
    viec = tr('Trần ≈ {cap} · tạo danh mục "{name}" để app đếm được đã gửi bao nhiêu', { cap: input.fmt(tran), name: FURUSATO_CATEGORY_NAME })
  } else if (muaNhac && con_lai !== null && con_lai >= FURUSATO_NHAC_TU) {
    trang_thai = 'thieu'
    viec = tr('Còn ≈ {amount} furusato chưa dùng · hết 31/12', { amount: input.fmt(con_lai) })
  } else if (da_gui <= 0) {
    trang_thai = 'chua-dung'
    viec = input.year < namNay
      ? tr('Năm {year} chưa gửi ふるさと納税 nào · trần khi đó ≈ {cap}', { year: input.year, cap: input.fmt(tran) })
      : tr('Chưa gửi ふるさと納税 nào năm nay · trần ≈ {cap}, hết 31/12', { cap: input.fmt(tran) })
  } else if (input.year < namNay) {
    trang_thai = 'het-han'
    viec = tr('Năm {year} đã gửi {sent} trên trần ≈ {cap}', { year: input.year, sent: input.fmt(da_gui), cap: input.fmt(tran) })
  } else {
    trang_thai = 'du'
    viec = tr('Trần ≈ {cap} · đã gửi {sent}', { cap: input.fmt(tran), sent: input.fmt(da_gui) })
  }

  return {
    ketLuan: {
      id: 'furusato',
      year: input.year,
      trang_thai,
      muc: onestop_rui_ro ? 'high' : 'low',
      tiet_kiem_uoc: null,
      han: input.year === namNay ? `${input.year}-12-31` : null,
      viec,
      ly_do,
    },
    tran,
    shotoku_wari,
    da_gui,
    con_lai,
    co_danh_muc,
    onestop_rui_ro,
    cua_so,
  }
}
