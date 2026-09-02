// Khoản ② — Đòi lại năm cũ bằng 還付申告 (NTA No.2030: nộp được từ 1/1 năm sau, trong 5 năm).
//
// Chạy lại bộ kiểm ① cho từng năm đã qua, bằng LUẬT CỦA NĂM ĐÓ (luatChoNam) — 2021–2022
// không có ngưỡng 38万. Năm người dùng đã đánh dấu "đã khai" thì bỏ.
// THUẦN: không React, không Date.
import { calendarYearOf } from '../../lib/dates'
import type { KetLuan } from './ketLuan'
import { tinhFuyo, type FuyoInput, type FuyoNguoi } from './fuyo'

export const SO_NAM_HOAN_THUE = 5

export interface RefundInput extends Omit<FuyoInput, 'year'> {
  fuyoClaimedYears: number[]
}

export interface RefundNam {
  year: number
  /** Hạn nộp 還付申告: 31/12 của (year + 5). */
  han: string
  nguoi: FuyoNguoi[]
  tiet_kiem_uoc: number | null
  /** Luật năm đó có ngưỡng 38万 không — để màn hình nói "năm này chỉ cần chứng từ gửi tiền". */
  co_nguong: boolean
}

export interface RefundKetQua {
  ketLuan: KetLuan
  nam: RefundNam[]
}

export function tinhRefund(input: RefundInput): RefundKetQua {
  const namNay = calendarYearOf(input.todayISO)
  const nam: RefundNam[] = []
  for (let y = namNay - SO_NAM_HOAN_THUE; y <= namNay - 1; y++) {
    if (input.fuyoClaimedYears.includes(y)) continue
    const r = tinhFuyo({ ...input, year: y })
    const du = r.nguoi.filter((n) => n.du)
    if (du.length === 0) continue
    const tk = du.some((n) => n.tiet_kiem_uoc !== null) ? du.reduce((s, n) => s + (n.tiet_kiem_uoc ?? 0), 0) : null
    nam.push({ year: y, han: `${y + SO_NAM_HOAN_THUE}-12-31`, nguoi: du, tiet_kiem_uoc: tk, co_nguong: du.some((n) => n.nguong > 0) })
  }

  const tong = nam.some((n) => n.tiet_kiem_uoc !== null) ? nam.reduce((s, n) => s + (n.tiet_kiem_uoc ?? 0), 0) : null
  const hetHanNamNay = nam.find((n) => n.han.startsWith(String(namNay)))
  const ly_do = [
    'Đây là lần đầu tự khai với sở thuế; nộp 確定申告 thì ワンストップ của ふるさと納税 năm đó vô hiệu, phải khai lại trong cùng tờ khai.',
    input.suatBien === null
      ? 'Chưa ước được tiền vì thiếu phiếu lương.'
      : 'Tiền ước theo thuế suất biên HIỆN TẠI; năm cũ lương khác thì số khác.',
  ]
  const ketLuan: KetLuan =
    nam.length === 0
      ? { id: 'refund', year: namNay, trang_thai: 'du', muc: 'low', tiet_kiem_uoc: null, han: null, viec: 'Không có năm cũ nào còn đòi lại được', ly_do }
      : {
          id: 'refund',
          year: namNay,
          trang_thai: 'thieu',
          muc: hetHanNamNay ? 'high' : 'medium',
          tiet_kiem_uoc: tong,
          han: nam[0].han,
          viec: `${nam.length} năm cũ đủ điều kiện nộp 還付申告 (${nam.map((n) => n.year).join(', ')})${hetHanNamNay ? ` · năm ${hetHanNamNay.year} hết hạn 31/12` : ''}`,
          ly_do,
        }
  return { ketLuan, nam }
}
