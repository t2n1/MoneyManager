// Gom bốn bộ kiểm thành một kết quả — chạy ở HAI nơi với cùng đầu vào: hook useQuyenLoi
// (trình duyệt) và loadInput.ts của edge function push (qua serverBundle). Nhờ vậy chuông và
// push không bao giờ nói khác nhau về cùng một khoản.
//
// Thứ tự trong `ketLuan`: theo TIỀN, không theo độ dễ code (spec "Quyết định đã chốt").
// THUẦN: không React, không Date.
import { addMonthsISO, calendarYearOf } from '../../lib/dates'
import type { CurrencyCode } from '../../lib/currencies'
import type { Rates } from '../../lib/rates'
import type { AccountRow, CategoryRow, RelativeRow, TransactionRow } from '../../types/database.types'
import { tinhFuyo, type FuyoKetQua } from './fuyo'
import { SO_TAX_NAMES, tinhFurusato, type FurusatoKetQua } from './furusato'
import type { KetLuan } from './ketLuan'
import { suatBienTuThue } from './marginalRate'
import { SO_NAM_HOAN_THUE, tinhRefund, type RefundKetQua } from './refund'
import { luatChoNam } from './rules/luat'
import { tinhShelterYearEnd, type ShelterKetQua } from './shelterYearEnd'

/** Định dạng tiền mặc định cho test — bản thật đi qua `formatMoney`/`serverFormatMoney`. */
export const fmtYen = (n: number) => `¥${n.toLocaleString('en-US')}`

/**
 * Cửa sổ giao dịch cần tải cho Quyền lợi: phủ cả năm ĐANG XEM (`year`, có thể là năm cũ
 * người dùng chọn trên `<Select>`) lẫn cửa sổ 5 năm khoản ② soát từ HÔM NAY (`namNay`).
 * Chọn năm cũ không được làm rơi mất mấy năm gần đây khỏi khoản ②, và ngược lại.
 */
export function benefitRange(year: number, namNay: number): { start: string; end: string } {
  return {
    start: `${Math.min(year, namNay) - SO_NAM_HOAN_THUE}-01-01`,
    end: `${Math.max(year, namNay) + 1}-01-01`,
  }
}

export interface QuyenLoiInput {
  year: number
  todayISO: string
  relatives: RelativeRow[]
  /** Kết quả của repo.listBenefitTransactions cho benefitRange(year, namNay). */
  txs: TransactionRow[]
  categories: CategoryRow[]
  accounts: AccountRow[]
  base: CurrencyCode
  rates: Rates
  fuyoClaimedYears: number[]
  /** Định dạng tiền (minor JPY → chuỗi hiển thị) — xem ghi chú ở FuyoInput. */
  fmt: (minorJpy: number) => string
}

export interface QuyenLoiKetQua {
  fuyo: FuyoKetQua
  refund: RefundKetQua
  furusato: FurusatoKetQua
  shelter: ShelterKetQua
  /** 5 kết luận, thứ tự cố định — bộ luật thông báo và khung Bản tin đọc mảng này. */
  ketLuan: KetLuan[]
  suatBien: number | null
  /** Số tháng có phiếu 所得税 trong cửa sổ 12 tháng — < 12 thì suatBien null. */
  thangCoPhieu: number
}

/** Σ所得税 12 tháng gần nhất và số tháng có phiếu. */
export function thueThuNhap12Thang(txs: TransactionRow[], categories: CategoryRow[], todayISO: string) {
  const ids = new Set(categories.filter((c) => c.type === 'expense' && c.name === SO_TAX_NAMES.shotoku).map((c) => c.id))
  const start = addMonthsISO(todayISO, -12)
  const thang = new Set<string>()
  let tong = 0
  for (const t of txs) {
    if (t.type !== 'expense' || t.category_id == null || !ids.has(t.category_id)) continue
    if (t.occurred_on < start || t.occurred_on > todayISO) continue
    tong += t.is_refund ? -t.amount : t.amount
    thang.add(t.occurred_on.slice(0, 7))
  }
  return { tong, thangCoPhieu: thang.size }
}

export function tinhQuyenLoi(input: QuyenLoiInput): QuyenLoiKetQua {
  const luat = luatChoNam(calendarYearOf(input.todayISO))
  const thue = thueThuNhap12Thang(input.txs, input.categories, input.todayISO)
  const suatBien = thue.thangCoPhieu >= 12 ? suatBienTuThue(thue.tong, luat) : null

  const chung = { todayISO: input.todayISO, relatives: input.relatives, txs: input.txs, accounts: input.accounts, base: input.base, rates: input.rates, suatBien, fmt: input.fmt }
  const fuyo = tinhFuyo({ ...chung, year: input.year })
  const refund = tinhRefund({ ...chung, fuyoClaimedYears: input.fuyoClaimedYears })
  const deXuatKhaiThue = refund.nam.length > 0 && input.year === calendarYearOf(input.todayISO)
  const furusato = tinhFurusato({ year: input.year, todayISO: input.todayISO, categories: input.categories, txs: input.txs, suatBien, deXuatKhaiThue, fmt: input.fmt })
  const shelter = tinhShelterYearEnd({ year: input.year, todayISO: input.todayISO, accounts: input.accounts, txs: input.txs, fmt: input.fmt })

  const chuaGan: KetLuan = {
    id: 'remit-unassigned',
    year: input.year,
    trang_thai: fuyo.chua_gan.so_lan > 0 ? 'thieu' : 'du',
    muc: 'low',
    tiet_kiem_uoc: null,
    han: null,
    viec: fuyo.chua_gan.so_lan > 0 ? `${fuyo.chua_gan.so_lan} lần gửi tiền chưa gán người nhận` : 'Mọi lần gửi đã có người nhận',
    ly_do: ['Chưa gán thì khấu trừ người phụ thuộc đang tính thiếu.'],
  }

  return {
    fuyo,
    refund,
    furusato,
    shelter,
    ketLuan: [fuyo.ketLuan, chuaGan, refund.ketLuan, furusato.ketLuan, shelter.ketLuan],
    suatBien,
    thangCoPhieu: thue.thangCoPhieu,
  }
}
