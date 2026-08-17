import { describe, expect, it } from 'vitest'
import {
  deltaPct,
  keptBarPct,
  kpiFromSeries,
  recentTransactions,
  seriesAnchor,
  toiNgayLuong,
  type ToiNgayLuongInput,
} from './bulletin'
import type { TransactionRow } from '../../types/database.types'

describe('seriesAnchor', () => {
  const cur = { year: 2026, month: 8 }

  it('tháng đang xem nằm trong dải → dải đứng yên ở tháng này', () => {
    // Đây LÀ điều phép thử này canh: bấm cột thứ 5 không được kéo cả dải trượt theo.
    expect(seriesAnchor({ year: 2026, month: 5 }, cur)).toEqual(cur)
    expect(seriesAnchor({ year: 2026, month: 8 }, cur)).toEqual(cur)
    // Mép trong cùng của dải 8 cột: 2026/01 là cột đầu tiên.
    expect(seriesAnchor({ year: 2026, month: 1 }, cur)).toEqual(cur)
  })

  it('lùi quá mép dải → dải trượt theo để tháng đang xem còn thấy được', () => {
    expect(seriesAnchor({ year: 2025, month: 12 }, cur)).toEqual({ year: 2025, month: 12 })
    expect(seriesAnchor({ year: 2024, month: 3 }, cur)).toEqual({ year: 2024, month: 3 })
  })

  it('tháng ở tương lai cũng kéo dải theo', () => {
    expect(seriesAnchor({ year: 2026, month: 9 }, cur)).toEqual({ year: 2026, month: 9 })
  })

  it('đếm đúng qua mốc năm', () => {
    const dauNam = { year: 2026, month: 2 }
    // 2025/07 cách 2026/02 bảy tháng → vẫn trong dải 8 cột.
    expect(seriesAnchor({ year: 2025, month: 7 }, dauNam)).toEqual(dauNam)
    // 2025/06 cách tám tháng → ra ngoài.
    expect(seriesAnchor({ year: 2025, month: 6 }, dauNam)).toEqual({ year: 2025, month: 6 })
  })
})

describe('deltaPct', () => {
  it('làm tròn về số nguyên phần trăm', () => {
    expect(deltaPct(115, 100)).toBe(15)
    expect(deltaPct(85, 100)).toBe(-15)
    expect(deltaPct(1337, 1000)).toBe(34)
  })

  // Mẫu số 0 thì mọi mức chi đều là "tăng vô hạn" — cùng quy ước với headlineOf.
  it('trả null khi không so được', () => {
    expect(deltaPct(500, 0)).toBeNull()
    expect(deltaPct(500, null)).toBeNull()
    expect(deltaPct(500, -100)).toBeNull()
  })

  it('0% là 0, không phải null — đi ngang vẫn là một câu trả lời', () => {
    expect(deltaPct(100, 100)).toBe(0)
  })
})

describe('kpiFromSeries', () => {
  it('lấy tháng cuối làm giá trị, tháng kề cuối làm mốc so', () => {
    const k = kpiFromSeries([10, 20, 40])
    expect(k.value).toBe(40)
    expect(k.prev).toBe(20)
    expect(k.deltaPct).toBe(100)
    expect(k.spark).toEqual([10, 20, 40])
  })

  it('một tháng thì không có gì để so', () => {
    const k = kpiFromSeries([40])
    expect(k.value).toBe(40)
    expect(k.prev).toBeNull()
    expect(k.deltaPct).toBeNull()
  })

  it('chuỗi rỗng không làm vỡ — giá trị 0, không so', () => {
    const k = kpiFromSeries([])
    expect(k.value).toBe(0)
    expect(k.prev).toBeNull()
    expect(k.deltaPct).toBeNull()
  })

  // Bẫy thật: `values.at(-2)` trên mảng [0, 5] trả về 0, mà 0 là giá trị HỢP LỆ. Dùng
  // `?? null` mà không kiểm độ dài thì mảng một phần tử cũng ra prev = undefined → null,
  // đúng; nhưng mảng [0, 5] phải ra prev = 0 (rồi deltaPct mới trả null vì mẫu số 0),
  // KHÔNG được nhầm thành "không có tháng trước".
  it('tháng trước bằng 0 vẫn là có tháng trước', () => {
    const k = kpiFromSeries([0, 5])
    expect(k.prev).toBe(0)
    expect(k.deltaPct).toBeNull()
  })
})

describe('keptBarPct', () => {
  it('giữ nguyên trong khoảng đọc được', () => {
    expect(keptBarPct(0)).toBe(0)
    expect(keptBarPct(40)).toBe(40)
    expect(keptBarPct(100)).toBe(100)
  })

  // Thanh vẽ ngược ra ngoài khung là lỗi hình học; chiều âm đã nói bằng chữ ở dòng trên.
  it('kẹp hai đầu — tỷ lệ âm và tỷ lệ trên 100 không làm tràn thanh', () => {
    expect(keptBarPct(-35)).toBe(0)
    expect(keptBarPct(140)).toBe(100)
  })

  it('chưa có thu thì thanh rỗng', () => {
    expect(keptBarPct(null)).toBe(0)
  })
})

describe('recentTransactions', () => {
  const tx = (id: string, occurred_on: string, created_at: string) =>
    ({ id, occurred_on, created_at }) as TransactionRow

  it('mới nhất đứng đầu, cắt đúng số lượng', () => {
    const list = [
      tx('a', '2026-08-01', '2026-08-01T10:00:00Z'),
      tx('c', '2026-08-09', '2026-08-09T10:00:00Z'),
      tx('b', '2026-08-05', '2026-08-05T10:00:00Z'),
    ]
    expect(recentTransactions(list, 2).map((t) => t.id)).toEqual(['c', 'b'])
  })

  // Cùng ngày thì cái NHẬP SAU đứng trên — đó là cái người dùng vừa động vào.
  it('cùng ngày thì so theo thời điểm tạo', () => {
    const list = [
      tx('som', '2026-08-05', '2026-08-05T08:00:00Z'),
      tx('muon', '2026-08-05', '2026-08-05T21:00:00Z'),
    ]
    expect(recentTransactions(list, 5).map((t) => t.id)).toEqual(['muon', 'som'])
  })

  it('không sửa mảng gốc', () => {
    const list = [tx('a', '2026-08-01', 'x'), tx('b', '2026-08-09', 'y')]
    recentTransactions(list, 1)
    expect(list.map((t) => t.id)).toEqual(['a', 'b'])
  })
})

describe('toiNgayLuong', () => {
  // Kỳ lương 15/08 → 15/09, hôm nay 20/08: đã qua 6 ngày (kể cả hôm nay), còn 26.
  const co = (p: Partial<ToiNgayLuongInput> = {}) =>
    toiNgayLuong({
      todayISO: '2026-08-20',
      kyBatDauISO: '2026-08-15',
      ngayLuongISO: '2026-09-15',
      thu: 400_000,
      chi: 60_000,
      ...p,
    })

  it('đếm ngày tới lương không kể hôm nay, đếm ngày đã qua CÓ kể hôm nay', () => {
    const r = co()!
    expect(r.soNgay).toBe(26)
    // nhịp = chi / (số ngày đã qua kể cả hôm nay) = 60.000 / 6
    expect(r.nhipHienTai).toBe(10_000)
  })

  it('còn lại là dòng tiền của kỳ, không phải số dư', () => {
    expect(co()!.conLai).toBe(340_000)
    expect(co({ chi: 500_000 })!.conLai).toBe(-100_000)
  })

  it('mỗi ngày làm tròn XUỐNG, và null khi không còn gì để chia', () => {
    expect(co()!.moiNgay).toBe(Math.floor(340_000 / 26))
    expect(co({ chi: 500_000 })!.moiNgay).toBeNull()
    // Hôm nay là ngày lương: không còn ngày nào để chia.
    expect(co({ todayISO: '2026-09-15' })!.moiNgay).toBeNull()
  })

  it('hụt trước lương khi giữ nguyên nhịp', () => {
    // nhịp 10.000/ngày, còn 340.000 → đủ 34 ngày > 26 ngày ⇒ không hụt
    expect(co()!.hutTruocLuong).toBe(false)
    // chi 150.000 trong 6 ngày = 25.000/ngày, còn 250.000 → 10 ngày < 26 ⇒ hụt
    expect(co({ chi: 150_000 })!.hutTruocLuong).toBe(true)
  })

  it('chưa tiêu đồng nào thì không bao giờ báo hụt (không chia cho 0)', () => {
    const r = co({ chi: 0 })!
    expect(r.nhipHienTai).toBe(0)
    expect(r.hutTruocLuong).toBe(false)
    expect(Number.isFinite(r.moiNgay!)).toBe(true)
  })

  it('đánh dấu kỳ chưa có khoản thu nào', () => {
    expect(co({ thu: 0 })!.chuaCoThu).toBe(true)
    expect(co()!.chuaCoThu).toBe(false)
  })

  // §14 "chưa biết ≠ 0": ngoài kỳ thì im, không in số 0.
  it('null khi hôm nay nằm ngoài kỳ', () => {
    expect(co({ todayISO: '2026-08-14' })).toBeNull() // trước đầu kỳ
    expect(co({ todayISO: '2026-09-16' })).toBeNull() // sau ngày lương
  })
})
