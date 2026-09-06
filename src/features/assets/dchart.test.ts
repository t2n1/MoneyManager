import { describe, expect, it } from 'vitest'
import { DCHART_INDEX_SCALE, DCHART_STOCK_SCALE, parseDchart, unixDay } from './dchart'

/** 2026-09-04 lúc 00:00 UTC — đúng hình dạng mốc thời gian mà dchart trả về. */
const T_0904 = 1788480000
const T_0903 = T_0904 - 86_400

const ok = (t: number[], c: (number | null)[]) => ({ s: 'ok', t, c })

describe('unixDay', () => {
  it('đổi ngày ISO thành giây UTC của nửa đêm', () => {
    expect(unixDay('1970-01-02')).toBe(86_400)
  })

  it('vòng lại được: unixDay rồi parse ra đúng ngày cũ', () => {
    const bars = parseDchart(ok([unixDay('2026-09-04')], [21.7]), DCHART_STOCK_SCALE)
    expect(bars[0].trading_date).toBe('2026-09-04')
  })
})

describe('parseDchart — cổ phiếu', () => {
  it('nghìn đồng thành ĐỒNG: 21.7 → 21.700 ₫/cổ', () => {
    const bars = parseDchart(ok([T_0904], [21.7]), DCHART_STOCK_SCALE)
    expect(bars).toEqual([{ trading_date: '2026-09-04', close: 21_700 }])
  })

  it('giá ba số lẻ vẫn ra số nguyên đồng: 2.563 → 2.563 ₫', () => {
    const bars = parseDchart(ok([T_0904], [2.563]), DCHART_STOCK_SCALE)
    expect(bars[0].close).toBe(2_563)
  })

  it('làm tròn chứ không cắt: 21.7005 → 21.701 (sai số dấu phẩy động không được rơi xuống)', () => {
    const bars = parseDchart(ok([T_0904], [21.7005]), DCHART_STOCK_SCALE)
    expect(bars[0].close).toBe(21_701)
  })
})

describe('parseDchart — chỉ số', () => {
  it('điểm thành điểm×100: 1853.08 → 185308', () => {
    const bars = parseDchart(ok([T_0904], [1853.08]), DCHART_INDEX_SCALE)
    expect(bars).toEqual([{ trading_date: '2026-09-04', close: 185_308 }])
  })

  it('KHÔNG dùng thang của cổ phiếu cho chỉ số — hai thang khác nhau là cả lý do có hai bảng', () => {
    const chiSo = parseDchart(ok([T_0904], [1853.08]), DCHART_INDEX_SCALE)[0].close
    const nhamThang = parseDchart(ok([T_0904], [1853.08]), DCHART_STOCK_SCALE)[0].close
    expect(chiSo).not.toBe(nhamThang)
  })
})

describe('parseDchart — dữ liệu xấu', () => {
  it('s khác "ok" thì trả rỗng, không đoán', () => {
    expect(parseDchart({ s: 'no_data', t: [], c: [] }, DCHART_STOCK_SCALE)).toEqual([])
  })

  it('thiếu hẳn t hoặc c thì trả rỗng', () => {
    expect(parseDchart({ s: 'ok' }, DCHART_STOCK_SCALE)).toEqual([])
    expect(parseDchart({ s: 'ok', t: [T_0904] }, DCHART_STOCK_SCALE)).toEqual([])
  })

  it('không phải object thì trả rỗng chứ không nổ', () => {
    expect(parseDchart(null, DCHART_STOCK_SCALE)).toEqual([])
    expect(parseDchart('lỗi', DCHART_STOCK_SCALE)).toEqual([])
    expect(parseDchart(42, DCHART_STOCK_SCALE)).toEqual([])
  })

  it('bỏ phiên có giá null, GIỮ những phiên còn lại', () => {
    const bars = parseDchart(ok([T_0903, T_0904], [null, 21.7]), DCHART_STOCK_SCALE)
    expect(bars).toEqual([{ trading_date: '2026-09-04', close: 21_700 }])
  })

  it('bỏ phiên có giá 0 hoặc âm — cột close có check > 0, ghi vào là cả câu upsert đổ', () => {
    expect(parseDchart(ok([T_0903, T_0904], [0, -5]), DCHART_STOCK_SCALE)).toEqual([])
  })

  it('bỏ phiên mà giá tròn về 0 sau khi nhân thang', () => {
    // 0,0004 nghìn đồng × 1.000 = 0,4 → tròn thành 0, vi phạm check > 0.
    expect(parseDchart(ok([T_0904], [0.0004]), DCHART_STOCK_SCALE)).toEqual([])
  })

  it('c dài hơn t thì chỉ lấy phần ghép được', () => {
    const bars = parseDchart(ok([T_0904], [21.7, 22.0]), DCHART_STOCK_SCALE)
    expect(bars).toHaveLength(1)
  })

  it('mốc thời gian không phải số thì bỏ phiên đó', () => {
    const bars = parseDchart(
      { s: 'ok', t: ['xxx', T_0904], c: [20, 21.7] },
      DCHART_STOCK_SCALE,
    )
    expect(bars).toEqual([{ trading_date: '2026-09-04', close: 21_700 }])
  })

  it('trả về theo ngày TĂNG DẦN dù nguồn xếp lộn', () => {
    const bars = parseDchart(ok([T_0904, T_0903], [21.7, 21.0]), DCHART_STOCK_SCALE)
    expect(bars.map((b) => b.trading_date)).toEqual(['2026-09-03', '2026-09-04'])
  })

  it('cùng một ngày hai lần thì giữ MỘT dòng — khoá chính là (mã, ngày)', () => {
    const bars = parseDchart(ok([T_0904, T_0904], [21.7, 21.9]), DCHART_STOCK_SCALE)
    expect(bars).toHaveLength(1)
  })
})
