// Vì sao thiết bị này CHƯA nhận được push — THUẦN. Không đọc `navigator`, không
// `window`: mọi sự thật về trình duyệt được tiêm vào qua `PushEnv`.
//
// Tách ra khỏi pushClient.ts vì đây là phần dễ sai nhất và không thể thử tay hết:
// bốn lý do chặn có thứ tự ưu tiên, và hiện sai lý do là người dùng đi sửa sai chỗ
// (đi bật quyền trong Cài đặt iOS trong khi việc cần làm là Thêm vào màn hình chính).

export type PushBlocker =
  /** Đăng ký được. */
  | 'ok'
  /** App chưa được cấu hình khoá VAPID — lỗi của người triển khai, không phải người dùng. */
  | 'chua-cau-hinh'
  /** iOS: phải Thêm vào màn hình chính trước, Safari trong tab thường không có push. */
  | 'can-cai-pwa'
  /** Trình duyệt không có Web Push (Safari macOS cũ, trình duyệt trong app…). */
  | 'khong-ho-tro'
  /** Người dùng đã từ chối quyền — app không xin lại được, phải vào cài đặt trình duyệt. */
  | 'bi-chan'

/** Những gì cần biết về trình duyệt để quyết định. `pushClient.readPushEnv()` đọc thật. */
export interface PushEnv {
  hasVapidKey: boolean
  hasServiceWorker: boolean
  hasPushManager: boolean
  hasNotification: boolean
  /** Máy này là iPhone/iPad (kể cả iPadOS tự nhận là Macintosh). */
  looksLikeIos: boolean
  /** Đang chạy như app đã cài (Thêm vào màn hình chính / Install app). */
  standalone: boolean
  permission: NotificationPermission
}

/**
 * Lý do chặn, theo thứ tự ưu tiên. Thứ tự là phần có nghĩa nhất của hàm này:
 * mỗi bước đứng trước bước sau vì nó là việc người dùng phải làm TRƯỚC.
 */
export function decideBlocker(env: PushEnv): PushBlocker {
  // Trước hết: nếu app chưa có khoá thì không việc gì bắt người dùng làm gì cả.
  if (!env.hasVapidKey) return 'chua-cau-hinh'

  // iOS đứng TRƯỚC 'khong-ho-tro': trên iPhone chưa cài, `window.PushManager` không
  // tồn tại, nên nếu xét thiếu-API trước thì mọi iPhone đều nhận thông báo
  // "trình duyệt không hỗ trợ" — sai, và người dùng không có cách nào sửa.
  if (env.looksLikeIos && !env.standalone) return 'can-cai-pwa'

  if (!env.hasServiceWorker || !env.hasPushManager || !env.hasNotification)
    return 'khong-ho-tro'

  // 'denied' xét CUỐI: nó là trạng thái duy nhất người dùng phải rời app đi sửa, nên
  // chỉ nói tới khi mọi điều kiện khác đã đủ.
  if (env.permission === 'denied') return 'bi-chan'

  return 'ok'
}

/** Câu giải thích cho người dùng, kèm việc cần làm. Rỗng khi 'ok'. */
export const BLOCKER_MESSAGE: Record<PushBlocker, string> = {
  ok: '',
  'chua-cau-hinh': 'App chưa được cấu hình khoá đẩy thông báo, nên phần này tạm chưa dùng được.',
  'can-cai-pwa':
    'Trên iPhone/iPad phải Thêm vào màn hình chính rồi mở app từ đó, Safari trong tab thường không nhận được thông báo.',
  'khong-ho-tro': 'Trình duyệt này không nhận được thông báo đẩy. Thử Chrome, Edge hoặc Safari mới.',
  'bi-chan':
    'Bạn đã từ chối quyền thông báo cho app này. Mở cài đặt thông báo của trình duyệt để bật lại, app không xin lại được.',
}

/**
 * Đổi khoá VAPID công khai (base64url) sang byte để `pushManager.subscribe` nhận.
 *
 * `applicationServerKey` chỉ nhận BufferSource, mà VAPID luôn được phát ở dạng
 * base64url (dùng `-_` thay `+/` và không có `=` đệm) nên `atob` một mình sẽ ném lỗi.
 */
export function vapidKeyToBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = base64url.padEnd(base64url.length + ((4 - (base64url.length % 4)) % 4), '=')
  const base64 = padded.replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  // Cấp ArrayBuffer TƯỜNG MINH, không dùng `new Uint8Array(n)`: từ TS 5.7 Uint8Array
  // là generic theo loại buffer, và bản không tham số suy ra `ArrayBufferLike` — thứ
  // `applicationServerKey` từ chối vì nó có thể là SharedArrayBuffer.
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}
