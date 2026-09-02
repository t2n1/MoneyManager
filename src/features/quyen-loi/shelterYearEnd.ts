// Khoản ④ — Phần hạn mức NISA/iDeCo chưa dùng, nhắc từ 1/10.
//
// KHÔNG tính lại gì: `shelterUsage` (features/assets/shelter.ts) đã tính "đã nạp / còn lại"
// theo năm dương lịch cho trang chi tiết tài khoản. Ở đây chỉ đóng gói thành KetLuan và
// chỉ lên tiếng cuối năm — trước đó "còn 2.000.000 hạn mức" là chuyện của mọi tháng.
// THUẦN: không React, không Date.
import { shelterUsage } from '../assets/shelter'
import type { AccountRow, TransactionRow } from '../../types/database.types'
import { calendarYearOf } from '../../lib/dates'
import type { KetLuan } from './ketLuan'
import { THANG_NHAC_CUOI_NAM } from './furusato'

export interface ShelterInput {
  year: number
  todayISO: string
  accounts: AccountRow[]
  /** Giao dịch bất kỳ có chuyển khoản vào tài khoản NISA/iDeCo; shelterUsage tự lọc. */
  txs: TransactionRow[]
}

export interface ShelterTaiKhoan {
  id: string
  name: string
  loai: NonNullable<AccountRow['tax_shelter']>
  used: number
  limit: number | null
  remaining: number | null
}

export interface ShelterKetQua {
  ketLuan: KetLuan
  tai_khoan: ShelterTaiKhoan[]
  /** Σ remaining của tài khoản CÓ hạn mức. */
  con_lai: number
}

export function tinhShelterYearEnd(input: ShelterInput): ShelterKetQua {
  const tai_khoan: ShelterTaiKhoan[] = input.accounts
    .filter((a) => a.tax_shelter != null && !a.is_archived)
    .map((a) => {
      const u = shelterUsage(a.id, input.txs, input.year, a.shelter_annual_limit)
      return { id: a.id, name: a.name, loai: a.tax_shelter!, used: u.used, limit: u.limit, remaining: u.remaining }
    })
  const con_lai = tai_khoan.reduce((s, t) => s + (t.remaining ?? 0), 0)
  const namNay = calendarYearOf(input.todayISO)
  const muaNhac = input.year === namNay && Number(input.todayISO.slice(5, 7)) >= THANG_NHAC_CUOI_NAM
  const ly_do = ['Hạn mức NISA không dùng là mất, không dồn sang năm sau (金融庁).']
  if (tai_khoan.some((t) => t.limit === null)) ly_do.push('Có tài khoản chưa đặt hạn mức năm — sửa ở Cài đặt › Tài khoản.')

  let trang_thai: KetLuan['trang_thai'] = 'du'
  let viec = `Đã nạp ${tai_khoan.length} tài khoản ưu đãi thuế năm nay`
  if (tai_khoan.length === 0) {
    trang_thai = 'thieu-du-lieu'
    viec = 'Chưa tài khoản nào được đánh dấu NISA/iDeCo'
  } else if (muaNhac && con_lai > 0) {
    trang_thai = 'thieu'
    viec = `Còn ¥${con_lai.toLocaleString('en-US')} hạn mức NISA/iDeCo chưa dùng · hết 31/12`
  }
  return {
    ketLuan: { id: 'shelter', year: input.year, trang_thai, muc: 'low', tiet_kiem_uoc: null, han: `${input.year}-12-31`, viec, ly_do },
    tai_khoan,
    con_lai,
  }
}
