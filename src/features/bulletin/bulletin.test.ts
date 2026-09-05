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
import { dailyAllowance } from '../budgets/dailyAllowance'

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
  // Kỳ lương 15/08 → 15/09 (31 ngày), hôm nay 20/08. Cả HAI mốc đều kể hôm nay vào:
  // đã qua 6 ngày (15→20), còn 26 ngày tiêu được (20/08→14/09) — 15/09 là mốc LOẠI TRỪ,
  // nó đã thuộc kỳ sau.
  const co = (p: Partial<ToiNgayLuongInput> = {}) =>
    toiNgayLuong({
      todayISO: '2026-08-20',
      kyBatDauISO: '2026-08-15',
      ngayLuongISO: '2026-09-15',
      hanMuc: 200_000,
      daTieu: 60_000,
      ...p,
    })

  it('đếm ngày còn lại kể cả hôm nay, đếm ngày đã qua cũng kể hôm nay', () => {
    const r = co()!
    expect(r.soNgay).toBe(26)
    // nhịp = đã tiêu / (số ngày đã qua kể cả hôm nay) = 60.000 / 6
    expect(r.nhipHienTai).toBe(10_000)
  })

  it('còn lại là phần chưa tiêu của HẠN MỨC, không phải lương trừ chi', () => {
    // Đây LÀ điều phép thử này canh: hàm không nhận thu nữa, nên một tháng lương to
    // không thể đẩy con số "còn lại" lên được. Trần do người dùng đặt mới quyết định.
    expect(co()!.conLai).toBe(140_000)
    expect(co({ daTieu: 260_000 })!.conLai).toBe(-60_000)
  })

  it('mỗi ngày khớp ĐÚNG dailyAllowance trên cùng dữ liệu', () => {
    // Ủy quyền chứ không chép công thức: hai phép chia song song là hai con số "mỗi
    // ngày" khác nhau trên cùng một app, và đó là chuyện đã xảy ra rồi.
    expect(co()!.moiNgay).toBe(dailyAllowance(140_000, 6, 31)!.perDay)
    expect(co()!.moiNgay).toBe(Math.floor(140_000 / 26)) // làm tròn XUỐNG
  })

  it('null khi không còn gì để chia', () => {
    expect(co({ daTieu: 260_000 })!.moiNgay).toBeNull() // đã vượt trần
    expect(co({ todayISO: '2026-09-15' })!.moiNgay).toBeNull() // hết ngày
  })

  it('hụt trước lương khi giữ nguyên nhịp', () => {
    // nhịp 10.000/ngày, còn 140.000 → đủ 14 ngày < 26 ngày ⇒ hụt
    expect(co()!.hutTruocLuong).toBe(true)
    // nhịp 3.000/ngày, còn 182.000 → đủ 60 ngày > 26 ⇒ không hụt
    expect(co({ daTieu: 18_000 })!.hutTruocLuong).toBe(false)
  })

  it('chưa tiêu đồng nào thì không bao giờ báo hụt (không chia cho 0)', () => {
    const r = co({ daTieu: 0 })!
    expect(r.nhipHienTai).toBe(0)
    expect(r.hutTruocLuong).toBe(false)
    expect(Number.isFinite(r.moiNgay!)).toBe(true)
  })

  it('đánh dấu kỳ chưa đặt hạn mức nào, và không nặn ra số nào', () => {
    expect(co({ hanMuc: 0 })!.chuaDatHanMuc).toBe(true)
    expect(co()!.chuaDatHanMuc).toBe(false)
    // §14 "chưa biết ≠ 0": không có trần thì không có "mỗi ngày", chứ không phải 0đ.
    expect(co({ hanMuc: 0 })!.moiNgay).toBeNull()
  })

  // §14 "chưa biết ≠ 0": ngoài kỳ thì im, không in số 0.
  it('null khi hôm nay nằm ngoài kỳ', () => {
    expect(co({ todayISO: '2026-08-14' })).toBeNull() // trước đầu kỳ
    expect(co({ todayISO: '2026-09-16' })).toBeNull() // sau ngày lương
  })

  // B36 áp cho CẢ Bản tin: "mỗi ngày còn" chia phần TỰ DO (trần − đã tiêu − cam kết
  // chưa ra), không chia cả phần đã hứa. Đây là lỗi đã in ra thật: Bản tin ¥5,294/ngày
  // trong khi trang Ngân sách ¥4,413/ngày cho cùng một kỳ, lệch đúng phần cam kết.
  it('cam kết chưa ra bị trừ khỏi phép chia mỗi ngày — cùng số với trang Ngân sách', () => {
    const r = co({ camKet: 22_900 })!
    expect(r.conLai).toBe(140_000) // "hạn mức còn" vẫn là trần − đã tiêu
    expect(r.camKet).toBe(22_900)
    expect(r.moiNgay).toBe(dailyAllowance(140_000 - 22_900, 6, 31)!.perDay)
  })

  it('cam kết nuốt hết phần còn lại → không còn gì để chia, nhưng vẫn nói được vì sao', () => {
    const r = co({ camKet: 150_000 })! // conLai 140.000 < cam kết
    expect(r.moiNgay).toBeNull()
    expect(r.conLai).toBe(140_000)
    expect(r.camKet).toBe(150_000)
  })

  it('không truyền cam kết thì như cũ (tương thích ngược)', () => {
    expect(co()!.camKet).toBe(0)
    expect(co()!.moiNgay).toBe(Math.floor(140_000 / 26))
  })

  // Hai thanh "Thời gian / Hạn mức" của khối Hôm nay đọc ba trường này. Hôm nay nằm
  // trong CẢ hai vế (đã qua kể hôm nay, còn lại kể hôm nay) nên tổng = đã qua + còn − 1.
  it('đếm thanh Thời gian: đã qua kể hôm nay, tổng ngày của kỳ', () => {
    const r = co()!
    expect(r.ngayDaQua).toBe(6) // 15→20/08, kể cả hôm nay
    expect(r.tongNgay).toBe(31) // kỳ 15/08 → 15/09
    expect(r.tongNgay).toBe(r.ngayDaQua + r.soNgay - 1)
  })

  it('cạn trước lương mấy ngày — chỉ nói khi có hụt', () => {
    // nhịp 10.000/ngày, tự do 140.000 → đủ 14 ngày nữa, còn 26 ngày ⇒ cạn trước 12 ngày.
    expect(co()!.canTruocLuong).toBe(12)
    // Không hụt thì null, không phải 0 — §14 "chưa biết ≠ 0".
    expect(co({ daTieu: 18_000 })!.canTruocLuong).toBeNull()
    expect(co({ daTieu: 0 })!.canTruocLuong).toBeNull()
    // Cam kết chưa ra cũng ăn vào phần tự do: cùng mẫu với moiNgay.
    const r = co({ camKet: 100_000 })! // tự do 40.000, nhịp 10.000 → đủ 4 ngày
    expect(r.canTruocLuong).toBe(26 - 4)
  })
})
