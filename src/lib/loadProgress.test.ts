import { describe, expect, it } from 'vitest'
import {
  advanceBurst,
  burstPercent,
  IDLE_BURST,
  PROGRESS_DELAY_MS,
  shouldShowProgress,
} from './loadProgress'

const T0 = 1_785_974_400_000 // mốc cố định, không dùng Date.now()

describe('advanceBurst', () => {
  it('đang rảnh mà không có query nào → vẫn rảnh', () => {
    expect(advanceBurst(IDLE_BURST, 0, T0)).toEqual(IDLE_BURST)
  })

  it('query đầu tiên bay lên → mở đợt, ghi mốc bắt đầu', () => {
    expect(advanceBurst(IDLE_BURST, 5, T0)).toEqual({ started: 5, inFlight: 5, startedAt: T0 })
  })

  it('query xong dần → số đã khởi giữ nguyên', () => {
    const s = advanceBurst(IDLE_BURST, 5, T0)
    expect(advanceBurst(s, 3, T0 + 100)).toEqual({ started: 5, inFlight: 3, startedAt: T0 })
  })

  // Query phụ thuộc (`enabled` bật muộn) khởi giữa đợt: mẫu số phải lớn ra, nếu không
  // thanh tiến độ sẽ chạy tới 100% rồi đứng đó chờ đám việc vừa hiện ra.
  it('có việc mới giữa đợt → cộng thêm vào số đã khởi', () => {
    let s = advanceBurst(IDLE_BURST, 5, T0)
    s = advanceBurst(s, 3, T0 + 100)
    expect(advanceBurst(s, 4, T0 + 200)).toEqual({ started: 6, inFlight: 4, startedAt: T0 })
  })

  it('mốc bắt đầu KHÔNG bị dời khi có việc mới — nếu không thì đợt dài không bao giờ đủ 800ms', () => {
    let s = advanceBurst(IDLE_BURST, 1, T0)
    s = advanceBurst(s, 2, T0 + 700)
    expect(s.startedAt).toBe(T0)
  })

  it('về 0 → đóng đợt, quên sạch để đợt sau đếm lại từ đầu', () => {
    let s = advanceBurst(IDLE_BURST, 5, T0)
    s = advanceBurst(s, 0, T0 + 500)
    expect(s).toEqual(IDLE_BURST)
    expect(advanceBurst(s, 2, T0 + 900)).toEqual({ started: 2, inFlight: 2, startedAt: T0 + 900 })
  })
})

describe('burstPercent', () => {
  it('đang rảnh → 0, không chia cho 0', () => {
    expect(burstPercent(IDLE_BURST)).toBe(0)
  })

  it('chưa xong cái nào → 0%', () => {
    expect(burstPercent({ started: 5, inFlight: 5, startedAt: T0 })).toBe(0)
  })

  it('2 trong 5 xong → 40%', () => {
    expect(burstPercent({ started: 5, inFlight: 3, startedAt: T0 })).toBe(40)
  })

  it('xong hết → 100%', () => {
    expect(burstPercent({ started: 5, inFlight: 0, startedAt: T0 })).toBe(100)
  })

  it('làm tròn về số nguyên', () => {
    expect(burstPercent({ started: 3, inFlight: 2, startedAt: T0 })).toBe(33)
  })

  // CỐ Ý không kẹp cho số chỉ tăng: kẹp là hiện một con số không đúng với thực tế, mà cả
  // cái nút này sinh ra để nói thật. Tụt xuống ở đây có nghĩa "vừa lòi thêm việc".
  it('lòi thêm việc thì % tụt — và đó là số đúng', () => {
    expect(burstPercent({ started: 5, inFlight: 3, startedAt: T0 })).toBe(40)
    expect(burstPercent({ started: 6, inFlight: 4, startedAt: T0 })).toBe(33)
  })
})

describe('shouldShowProgress', () => {
  it('đang rảnh → không hiện', () => {
    expect(shouldShowProgress(IDLE_BURST, T0 + 10_000)).toBe(false)
  })

  it(`đợt mới chớm, chưa đủ ${PROGRESS_DELAY_MS}ms → không hiện (lần tải nhanh không nháy)`, () => {
    const s = advanceBurst(IDLE_BURST, 3, T0)
    expect(shouldShowProgress(s, T0 + PROGRESS_DELAY_MS - 1)).toBe(false)
  })

  it(`đủ ${PROGRESS_DELAY_MS}ms → hiện`, () => {
    const s = advanceBurst(IDLE_BURST, 3, T0)
    expect(shouldShowProgress(s, T0 + PROGRESS_DELAY_MS)).toBe(true)
  })

  it('đồng hồ máy lùi → không hiện, thay vì tính ra thời lượng âm rồi hiện bừa', () => {
    const s = advanceBurst(IDLE_BURST, 3, T0)
    expect(shouldShowProgress(s, T0 - 5_000)).toBe(false)
  })
})
