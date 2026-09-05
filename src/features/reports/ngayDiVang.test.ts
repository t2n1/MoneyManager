import { describe, expect, it } from 'vitest'
import type { TripRow } from '../../types/database.types'
import {
  NGUONG_NGAY_VANG,
  boNgayDiVang,
  doKhoangVang,
  ngayDiVang,
  thangCoChuyenDi,
} from './ngayDiVang'

let seq = 0
function trip(p: Partial<TripRow> & Pick<TripRow, 'start_on' | 'end_on'>): TripRow {
  return {
    id: `tr${seq++}`,
    user_id: 'u',
    label: '',
    country: 'VN',
    dismissed: false,
    created_at: '',
    ...p,
  }
}

describe('ngayDiVang', () => {
  it('một chuyến 7 ngày → đúng 7 ngày ISO, gồm cả hai đầu', () => {
    const s = ngayDiVang([trip({ start_on: '2026-02-16', end_on: '2026-02-22' })])
    expect(s.size).toBe(7)
    expect(s.has('2026-02-16')).toBe(true)
    expect(s.has('2026-02-22')).toBe(true)
    expect(s.has('2026-02-23')).toBe(false)
  })

  it('dismissed → KHÔNG vào tập', () => {
    const s = ngayDiVang([trip({ start_on: '2026-02-16', end_on: '2026-02-22', dismissed: true })])
    expect(s.size).toBe(0)
  })

  it('hai chuyến chồng ngày → không đếm trùng', () => {
    const s = ngayDiVang([
      trip({ start_on: '2026-02-16', end_on: '2026-02-20' }),
      trip({ start_on: '2026-02-19', end_on: '2026-02-22' }),
    ])
    expect(s.size).toBe(7)
  })
})

describe('boNgayDiVang', () => {
  const pts = [
    { date: '2026-02-15', expense: 100 },
    { date: '2026-02-16', expense: 0 },
    { date: '2026-02-17', expense: 0 },
    { date: '2026-02-23', expense: 200 },
  ]
  it('bỏ đúng ngày, giữ thứ tự', () => {
    const vang = ngayDiVang([trip({ start_on: '2026-02-16', end_on: '2026-02-22' })])
    expect(boNgayDiVang(pts, vang)).toEqual([
      { date: '2026-02-15', expense: 100 },
      { date: '2026-02-23', expense: 200 },
    ])
  })
  it('tập rỗng → giữ nguyên', () => {
    expect(boNgayDiVang(pts, new Set())).toEqual(pts)
  })
})

describe('thangCoChuyenDi', () => {
  it('chuyến vắt hai tháng → mỗi tháng chỉ đếm phần của mình', () => {
    // monthStartDay = 1: 28/2–3/3 = 1 ngày thuộc tháng 2 + 3 ngày thuộc tháng 3 —
    // cả hai đều DƯỚI ngưỡng 4 → không tháng nào bị coi là tháng chuyến đi.
    const s = thangCoChuyenDi([trip({ start_on: '2026-02-28', end_on: '2026-03-03' })], 1)
    expect(s.size).toBe(0)
  })

  it('tháng đủ ngưỡng thì vào tập, đúng định dạng khoá monthId của aggregate', () => {
    const s = thangCoChuyenDi([trip({ start_on: '2026-02-16', end_on: '2026-02-22' })], 1)
    // monthId là `${year}-${month}` KHÔNG độn số 0 → '2026-2'
    expect(s.has('2026-2')).toBe(true)
    expect(s.size).toBe(1)
  })

  it('đúng bằng ngưỡng (4 ngày) thì vào; 3 ngày thì không', () => {
    expect(NGUONG_NGAY_VANG).toBe(4)
    const dat = thangCoChuyenDi([trip({ start_on: '2026-02-10', end_on: '2026-02-13' })], 1)
    expect(dat.has('2026-2')).toBe(true)
    const truot = thangCoChuyenDi([trip({ start_on: '2026-02-10', end_on: '2026-02-12' })], 1)
    expect(truot.size).toBe(0)
  })

  it('tôn trọng monthStartDay — tháng tài chính, không phải tháng lịch', () => {
    // monthStartDay = 25: 26/2–1/3 nằm TRỌN trong "tháng 2 tài chính" (25/2–24/3)
    // → 4 ngày cùng một tháng, đạt ngưỡng.
    const s = thangCoChuyenDi([trip({ start_on: '2026-02-26', end_on: '2026-03-01' })], 25)
    expect(s.size).toBe(1)
  })
})

describe('doKhoangVang', () => {
  // Cửa sổ 1/2 → hôm nay 28/2. Giao dịch mỗi ngày TRỪ 16–22/2.
  const days: string[] = []
  for (let d = 1; d <= 28; d++) {
    const iso = `2026-02-${String(d).padStart(2, '0')}`
    if (iso < '2026-02-16' || iso > '2026-02-22') days.push(iso)
  }

  it('dải 7 ngày trống, đã đóng → tìm ra đúng một dải', () => {
    const gaps = doKhoangVang(days, '2026-02-01', '2026-02-28', [])
    expect(gaps).toEqual([{ startISO: '2026-02-16', endISO: '2026-02-22', soNgay: 7 }])
  })

  it('dải 3 ngày — dưới ngưỡng → không báo', () => {
    const short = days.filter((d) => d < '2026-02-10' || d > '2026-02-12')
    const gaps = doKhoangVang(short, '2026-02-01', '2026-02-28', [])
    expect(gaps.map((g) => g.startISO)).toEqual(['2026-02-16'])
  })

  it('dải đang mở (chạm hôm nay, chưa có giao dịch trở lại) → không báo', () => {
    const truncated = days.filter((d) => d <= '2026-02-15')
    const gaps = doKhoangVang(truncated, '2026-02-01', '2026-02-28', [])
    expect(gaps).toEqual([])
  })

  it('dải chạm mép đầu cửa sổ → không báo (không biết nó dài từ trước không)', () => {
    const tail = days.filter((d) => d >= '2026-02-05')
    // 1–4/2 trống nhưng chạm mép cửa sổ
    const gaps = doKhoangVang(tail, '2026-02-01', '2026-02-28', [])
    expect(gaps.map((g) => g.startISO)).toEqual(['2026-02-16'])
  })

  it('dải đã có hàng trips phủ (kể cả dismissed) → không báo lại', () => {
    const daXet = [trip({ start_on: '2026-02-16', end_on: '2026-02-22', dismissed: true })]
    expect(doKhoangVang(days, '2026-02-01', '2026-02-28', daXet)).toEqual([])
  })

  it('trips chỉ GIAO một phần với dải cũng đủ để im', () => {
    const giao = [trip({ start_on: '2026-02-20', end_on: '2026-02-25' })]
    expect(doKhoangVang(days, '2026-02-01', '2026-02-28', giao)).toEqual([])
  })
})
