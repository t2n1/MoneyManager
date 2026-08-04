import { describe, expect, it } from 'vitest'
import { decideBlocker, vapidKeyToBytes, type PushEnv } from './pushEligibility'

function env(over: Partial<PushEnv> = {}): PushEnv {
  // Mặc định: máy Android/desktop đủ điều kiện, chưa hỏi quyền.
  return {
    hasVapidKey: true,
    hasServiceWorker: true,
    hasPushManager: true,
    hasNotification: true,
    looksLikeIos: false,
    standalone: false,
    permission: 'default',
    ...over,
  }
}

describe('decideBlocker', () => {
  it('máy đủ điều kiện thì đăng ký được', () => {
    expect(decideBlocker(env())).toBe('ok')
  })

  it('đã cho quyền rồi vẫn là ok', () => {
    expect(decideBlocker(env({ permission: 'granted' }))).toBe('ok')
  })

  it('app thiếu khoá VAPID thì nói CHƯA CẤU HÌNH, không đổ cho người dùng', () => {
    expect(decideBlocker(env({ hasVapidKey: false }))).toBe('chua-cau-hinh')
  })

  it('thiếu khoá thì báo trước cả chuyện iOS chưa cài app', () => {
    // Không có khoá thì cài app xong cũng vẫn không chạy — bắt người dùng cài trước
    // là chỉ đường vào chỗ vẫn tắc.
    expect(
      decideBlocker(env({ hasVapidKey: false, looksLikeIos: true, standalone: false })),
    ).toBe('chua-cau-hinh')
  })

  it('iPhone chưa Thêm vào màn hình chính thì nói ĐÚNG việc cần làm', () => {
    // Đây là ca dễ sai nhất: iOS chưa cài thì window.PushManager KHÔNG tồn tại, nên
    // nếu xét thiếu-API trước thì mọi iPhone đều nhận "trình duyệt không hỗ trợ".
    expect(
      decideBlocker(
        env({ looksLikeIos: true, standalone: false, hasPushManager: false }),
      ),
    ).toBe('can-cai-pwa')
  })

  it('iPhone đã cài app thì đăng ký được', () => {
    expect(decideBlocker(env({ looksLikeIos: true, standalone: true }))).toBe('ok')
  })

  it('iPhone đã cài nhưng vẫn thiếu API thì mới là không hỗ trợ (iOS cũ hơn 16.4)', () => {
    expect(
      decideBlocker(env({ looksLikeIos: true, standalone: true, hasPushManager: false })),
    ).toBe('khong-ho-tro')
  })

  it('thiếu service worker thì không hỗ trợ', () => {
    expect(decideBlocker(env({ hasServiceWorker: false }))).toBe('khong-ho-tro')
  })

  it('thiếu Notification thì không hỗ trợ', () => {
    expect(decideBlocker(env({ hasNotification: false }))).toBe('khong-ho-tro')
  })

  it('bị từ chối quyền thì báo bị chặn', () => {
    expect(decideBlocker(env({ permission: 'denied' }))).toBe('bi-chan')
  })

  it('trình duyệt không hỗ trợ được báo TRƯỚC chuyện bị chặn quyền', () => {
    // Trình duyệt không có push thì permission là chuyện vô nghĩa.
    expect(decideBlocker(env({ hasPushManager: false, permission: 'denied' }))).toBe(
      'khong-ho-tro',
    )
  })
})

describe('vapidKeyToBytes', () => {
  it('khoá VAPID thật (65 byte, base64url không đệm) đổi được', () => {
    // Khoá công khai VAPID luôn là điểm P-256 chưa nén: 65 byte, byte đầu là 0x04.
    const key =
      'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U'
    const bytes = vapidKeyToBytes(key)
    expect(bytes).toHaveLength(65)
    expect(bytes[0]).toBe(0x04)
  })

  it('đổi đúng ký tự riêng của base64url (- và _) chứ không ném lỗi', () => {
    // 'a-b_' ở base64 thường là 'a+b/'. atob trên chuỗi base64url gốc sẽ sai/nổ.
    const bytes = vapidKeyToBytes('a-b_')
    expect([...bytes]).toEqual([0x6b, 0xe6, 0xff])
  })

  it('chuỗi thiếu đệm "=" vẫn đổi được', () => {
    // 'AAA' cần thêm một '=' mới đủ 4 ký tự.
    expect([...vapidKeyToBytes('AAA')]).toEqual([0, 0])
  })
})
