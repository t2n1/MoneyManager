// Khoản ② — Đòi lại năm cũ bằng 還付申告 (NTA No.2030: nộp được từ 1/1 năm sau, trong 5 năm).
//
// Chạy lại bộ kiểm ① cho từng năm đã qua, bằng LUẬT CỦA NĂM ĐÓ (luatChoNam) — 2021–2022
// không có ngưỡng 38万. Năm người dùng đã đánh dấu "đã khai" thì bỏ.
// THUẦN: không React, không Date.
import { calendarYearOf } from '../../lib/dates'
import type { KetLuan } from './ketLuan'
import { tinhFuyo, type FuyoInput, type FuyoNguoi } from './fuyo'
import { luatChoNam } from './rules/luat'

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
  /**
   * Luật của NĂM ĐÓ có ngưỡng 38万 không — để màn hình nói "năm này chỉ cần chứng từ gửi
   * tiền". Đọc từ `luatChoNam(y).fuyo.nguong30_69`, KHÔNG suy từ nhóm tuổi của người đủ:
   * một năm có ngưỡng (vd 2024) mà chỉ người 16–29 (nhóm không ngưỡng) đủ điều kiện vẫn
   * phải hiện `true`, vì luật năm đó vẫn đòi 38万 cho nhóm 30–69.
   */
  co_nguong: boolean
}

export interface RefundKetQua {
  ketLuan: KetLuan
  nam: RefundNam[]
  /** Năm đã soát (chưa đánh dấu đã khai) có lần gửi CHƯA gán người nhận, mỗi năm một dòng. */
  chua_gan: { year: number; so_lan: number; tong: number }[]
}

export function tinhRefund(input: RefundInput): RefundKetQua {
  const namNay = calendarYearOf(input.todayISO)
  const nam: RefundNam[] = []
  const chua_gan: { year: number; so_lan: number; tong: number }[] = []
  for (let y = namNay - SO_NAM_HOAN_THUE; y <= namNay - 1; y++) {
    if (input.fuyoClaimedYears.includes(y)) continue
    const r = tinhFuyo({ ...input, year: y })
    // Nói NGAY cả khi không ai đủ ở năm này: migration 0056 không backfill, nên năm cũ
    // toàn lần gửi CHƯA gán mà chỉ soát `r.nguoi` là bỏ sót — số dưới đây có thể còn cao hơn.
    if (r.chua_gan.so_lan > 0) chua_gan.push({ year: y, so_lan: r.chua_gan.so_lan, tong: r.chua_gan.tong })
    const du = r.nguoi.filter((n) => n.du)
    if (du.length === 0) continue
    const tk = du.some((n) => n.tiet_kiem_uoc !== null) ? du.reduce((s, n) => s + (n.tiet_kiem_uoc ?? 0), 0) : null
    nam.push({ year: y, han: `${y + SO_NAM_HOAN_THUE}-12-31`, nguoi: du, tiet_kiem_uoc: tk, co_nguong: luatChoNam(y).fuyo.nguong30_69 !== null })
  }

  const tong = nam.some((n) => n.tiet_kiem_uoc !== null) ? nam.reduce((s, n) => s + (n.tiet_kiem_uoc ?? 0), 0) : null
  const hetHanNamNay = nam.find((n) => n.han.startsWith(String(namNay)))
  const ly_do = [
    'Đây là lần đầu tự khai với sở thuế; nộp 確定申告 thì ワンストップ của ふるさと納税 năm đó vô hiệu, phải khai lại trong cùng tờ khai.',
    input.suatBien === null
      ? 'Chưa ước được tiền vì thiếu phiếu lương.'
      : 'Tiền ước theo thuế suất biên HIỆN TẠI; năm cũ lương khác thì số khác.',
  ]

  let ketLuan: KetLuan
  if (nam.length === 0 && chua_gan.length > 0) {
    const soLanTong = chua_gan.reduce((s, c) => s + c.so_lan, 0)
    const namDau = chua_gan[0].year
    const namCuoi = chua_gan[chua_gan.length - 1].year
    const namText = namDau === namCuoi ? String(namDau) : `${namDau}–${namCuoi}`
    ketLuan = {
      id: 'refund',
      year: namNay,
      trang_thai: 'thieu-du-lieu',
      muc: 'medium',
      tiet_kiem_uoc: null,
      han: null,
      viec: `${soLanTong.toLocaleString('en-US')} lần gửi của ${namText} chưa gán người nhận — gán để biết còn đòi lại được không`,
      ly_do,
    }
  } else if (nam.length === 0) {
    ketLuan = { id: 'refund', year: namNay, trang_thai: 'du', muc: 'low', tiet_kiem_uoc: null, han: null, viec: 'Không có năm cũ nào còn đòi lại được', ly_do }
  } else {
    const lyDoDay = chua_gan.length > 0
      ? [
          ...ly_do,
          `Còn ${chua_gan.reduce((s, c) => s + c.so_lan, 0).toLocaleString('en-US')} lần gửi năm ${chua_gan.map((c) => c.year).join(', ')} chưa gán — số trên có thể còn cao hơn.`,
        ]
      : ly_do
    ketLuan = {
      id: 'refund',
      year: namNay,
      trang_thai: 'thieu',
      muc: hetHanNamNay ? 'high' : 'medium',
      tiet_kiem_uoc: tong,
      han: nam[0].han,
      viec: `${nam.length} năm cũ đủ điều kiện nộp 還付申告 (${nam.map((n) => n.year).join(', ')})${hetHanNamNay ? ` · năm ${hetHanNamNay.year} hết hạn 31/12` : ''}`,
      ly_do: lyDoDay,
    }
  }
  return { ketLuan, nam, chua_gan }
}
