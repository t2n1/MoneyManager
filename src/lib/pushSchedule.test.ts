import { describe, expect, it } from 'vitest'
import { dueForPush, localPartsIn } from './pushSchedule'

const TOKYO = 'Asia/Tokyo'
const LA = 'America/Los_Angeles'

describe('localPartsIn', () => {
  it('Tokyo là UTC+9 quanh năm', () => {
    expect(localPartsIn('2026-08-05T00:00:00.000Z', TOKYO)).toEqual({
      date: '2026-08-05',
      hour: 9,
    })
  })

  it('qua nửa đêm giờ Nhật thì NGÀY đã sang hôm sau dù UTC còn hôm trước', () => {
    expect(localPartsIn('2026-08-04T22:00:00.000Z', TOKYO)).toEqual({
      date: '2026-08-05',
      hour: 7,
    })
  })

  it('nửa đêm ra giờ 0, không phải 24', () => {
    expect(localPartsIn('2026-08-04T15:00:00.000Z', TOKYO)).toEqual({
      date: '2026-08-05',
      hour: 0,
    })
  })

  it('múi giờ rác thì lùi về UTC chứ không ném lỗi', () => {
    // Cron chạy vòng qua mọi user; một dòng dữ liệu hỏng không được làm chết cả lượt.
    expect(localPartsIn('2026-08-05T01:00:00.000Z', 'Khong/CoThat')).toEqual({
      date: '2026-08-05',
      hour: 1,
    })
  })
})

describe('dueForPush — giờ Nhật', () => {
  it('đúng giờ đã đặt và chưa gửi lần nào thì gửi', () => {
    // 00:00Z = 09:00 JST, đã qua mốc 8 giờ
    expect(dueForPush('2026-08-05T00:00:00.000Z', 8, TOKYO, null)).toBe(true)
  })

  it('chưa tới giờ thì chưa gửi', () => {
    // 22:00Z = 07:00 JST hôm sau
    expect(dueForPush('2026-08-04T22:00:00.000Z', 8, TOKYO, null)).toBe(false)
  })

  it('đúng khớp giờ đã đặt thì gửi (mốc là >= chứ không phải >)', () => {
    // 23:00Z = 08:00 JST
    expect(dueForPush('2026-08-04T23:00:00.000Z', 8, TOKYO, null)).toBe(true)
  })

  it('hôm nay gửi rồi thì không gửi lần hai', () => {
    expect(dueForPush('2026-08-05T00:00:00.000Z', 8, TOKYO, '2026-08-04T23:00:00.000Z')).toBe(false)
  })

  it('lần gửi gần nhất là NGÀY HÔM QUA (giờ địa phương) thì gửi tiếp', () => {
    // now = 09:00 JST 05/08; lastSent = 08:00 JST 04/08
    expect(dueForPush('2026-08-05T00:00:00.000Z', 8, TOKYO, '2026-08-03T23:00:00.000Z')).toBe(true)
  })

  it('cron trượt buổi sáng thì buổi tối vẫn gửi bù, không bỏ hẳn ngày', () => {
    // 11:00Z = 20:00 JST, mốc 8 giờ đã qua từ lâu mà chưa gửi
    expect(dueForPush('2026-08-05T11:00:00.000Z', 8, TOKYO, null)).toBe(true)
  })

  it('đặt 0 giờ thì gửi ngay từ đầu ngày địa phương', () => {
    expect(dueForPush('2026-08-04T15:00:00.000Z', 0, TOKYO, null)).toBe(true)
  })

  it('mốc gửi ở TƯƠNG LAI (đồng hồ lệch) thì coi như đã gửi, không đẩy thêm', () => {
    expect(dueForPush('2026-08-05T00:00:00.000Z', 8, TOKYO, '2026-08-09T00:00:00.000Z')).toBe(false)
  })
})

describe('dueForPush — DST ở Mỹ', () => {
  it('CÙNG một giờ UTC cho hai kết quả khác nhau giữa mùa đông và mùa hè', () => {
    // Đây là lý do lưu tên múi giờ chứ không lưu offset: 15:00Z là 07:00 PST giữa
    // mùa đông (chưa tới 8 giờ) nhưng là 08:00 PDT giữa mùa hè (tới giờ rồi).
    expect(dueForPush('2026-01-15T15:00:00.000Z', 8, LA, null)).toBe(false)
    expect(dueForPush('2026-07-15T15:00:00.000Z', 8, LA, null)).toBe(true)
  })

  it('ngày nhảy giờ tiến: giờ đã đặt KHÔNG TỒN TẠI mà vẫn gửi được', () => {
    // 14/03/2027 Mỹ nhảy 02:00 PST → 03:00 PDT, nên 2 giờ sáng hôm đó không có thật.
    // So sánh >= là thứ cứu tình huống này: 03:00 >= 02:00 nên vẫn gửi trong ngày.
    // Nếu viết === thì mỗi năm một lần người đặt 2 giờ sáng lặng lẽ mất một ngày.
    expect(localPartsIn('2027-03-14T09:00:00.000Z', LA)).toEqual({ date: '2027-03-14', hour: 1 })
    expect(localPartsIn('2027-03-14T10:00:00.000Z', LA)).toEqual({ date: '2027-03-14', hour: 3 })
    expect(dueForPush('2027-03-14T09:00:00.000Z', 2, LA, null)).toBe(false)
    expect(dueForPush('2027-03-14T10:00:00.000Z', 2, LA, null)).toBe(true)
  })

  it('ngày nhảy giờ lùi: giờ đã đặt XẢY RA HAI LẦN mà chỉ gửi một lần', () => {
    // 01/11/2026 Mỹ nhảy 02:00 PDT → 01:00 PST, nên 1 giờ sáng có hai lần.
    expect(localPartsIn('2026-11-01T08:00:00.000Z', LA)).toEqual({ date: '2026-11-01', hour: 1 })
    expect(localPartsIn('2026-11-01T09:00:00.000Z', LA)).toEqual({ date: '2026-11-01', hour: 1 })
    // Lần 1 giờ đầu tiên: gửi.
    expect(dueForPush('2026-11-01T08:00:00.000Z', 1, LA, null)).toBe(true)
    // Lần 1 giờ thứ hai, đã gửi ở lần đầu: im. Chặn theo NGÀY địa phương nên đúng.
    expect(dueForPush('2026-11-01T09:00:00.000Z', 1, LA, '2026-11-01T08:00:00.000Z')).toBe(false)
  })

  it('chuyển từ Nhật sang Mỹ không phải sửa gì: vẫn là "8 giờ sáng nơi tôi ở"', () => {
    const now = '2026-08-05T15:00:00.000Z'
    // 15:00Z = 00:00 JST hôm sau (chưa tới 8 giờ) nhưng = 08:00 PDT (tới giờ)
    expect(dueForPush(now, 8, TOKYO, null)).toBe(false)
    expect(dueForPush(now, 8, LA, null)).toBe(true)
  })
})
