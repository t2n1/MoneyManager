// Đọc trạng thái push của THIẾT BỊ NÀY và bật/tắt nó. Đây là phần chạm vào trình
// duyệt; mọi quyết định "vì sao chưa được" nằm ở pushEligibility.ts và có test.
//
// "Thiết bị này" là đơn vị đúng, không phải "tài khoản": quyền thông báo do trình
// duyệt cấp cho từng máy, nên bật trên điện thoại không làm laptop nhận theo. Bảng
// push_subscriptions vì vậy có nhiều dòng mỗi người.
import { repo } from '../../data'
import { decideBlocker, vapidKeyToBytes, type PushBlocker, type PushEnv } from './pushEligibility'

export interface PushState {
  blocker: PushBlocker
  /** Thiết bị này đang có đăng ký còn hiệu lực hay không. */
  subscribed: boolean
}

function vapidPublicKey(): string {
  return import.meta.env.VITE_VAPID_PUBLIC_KEY ?? ''
}

/** Máy này là iPhone/iPad. iPadOS 13+ tự nhận là 'Macintosh' nên phải soi cả cảm ứng. */
function looksLikeIos(): boolean {
  const ua = navigator.userAgent
  if (/iPad|iPhone|iPod/.test(ua)) return true
  return ua.includes('Macintosh') && navigator.maxTouchPoints > 1
}

/** Đang chạy như app đã cài (Thêm vào màn hình chính / Install app). */
function isStandalone(): boolean {
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true
  // Cờ riêng của Safari iOS, không có trong chuẩn nên phải ép kiểu.
  return (navigator as Navigator & { standalone?: boolean }).standalone === true
}

/** Gom sự thật về trình duyệt thành `PushEnv` cho hàm thuần quyết định. */
export function readPushEnv(): PushEnv {
  return {
    hasVapidKey: vapidPublicKey().length > 0,
    hasServiceWorker: 'serviceWorker' in navigator,
    hasPushManager: 'PushManager' in window,
    hasNotification: 'Notification' in window,
    looksLikeIos: looksLikeIos(),
    standalone: isStandalone(),
    // Đọc `Notification.permission` khi API không tồn tại là ném lỗi, nên phải chắn.
    permission: 'Notification' in window ? Notification.permission : 'default',
  }
}

async function currentSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator)) return null
  // KHÔNG dùng `navigator.serviceWorker.ready` ở đường ĐỌC: promise đó không bao giờ
  // resolve khi trang chưa đăng ký service worker nào (npm run dev không sinh SW) →
  // getPushState treo vĩnh viễn, PushSection kẹt ở state=null và công tắc bị disable
  // không lời giải thích. getRegistration() trả undefined ngay trong trường hợp đó.
  // Giá phải trả: lần ghé ĐẦU TIÊN của bản prod, nếu SW còn đang cài thì đọc ra
  // "chưa đăng ký" — chấp nhận được vì lần đầu thì đúng là chưa đăng ký thật.
  const registration = await navigator.serviceWorker.getRegistration()
  if (!registration) return null
  return registration.pushManager.getSubscription()
}

/**
 * `navigator.serviceWorker.ready` nhưng có trần chờ — cho đường GHI (bật thông báo).
 * Không có SW (bản dev) thì báo lỗi rõ ràng sau `ms` thay vì treo mãi.
 */
async function serviceWorkerReady(ms = 3000): Promise<ServiceWorkerRegistration> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                'Trang này không có service worker (bản dev không sinh SW) — hãy thử trên bản build.',
              ),
            ),
          ms,
        )
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

export async function getPushState(): Promise<PushState> {
  const blocker = decideBlocker(readPushEnv())
  if (blocker !== 'ok' && blocker !== 'bi-chan') return { blocker, subscribed: false }
  const sub = await currentSubscription().catch(() => null)
  return { blocker, subscribed: sub !== null }
}

/**
 * Bật nhận thông báo cho thiết bị này.
 *
 * PHẢI gọi trực tiếp từ cú chạm của người dùng. `Notification.requestPermission()` trên
 * iOS Safari chỉ được phép trong một cử chỉ người dùng — gọi lúc trang vừa tải, hoặc
 * sau một `await` dài trước đó, là bị từ chối im lặng và không có lỗi nào để đọc.
 */
export async function subscribeThisDevice(): Promise<void> {
  const blocker = decideBlocker(readPushEnv())
  if (blocker !== 'ok' && blocker !== 'bi-chan')
    throw new Error('Thiết bị này chưa đủ điều kiện nhận thông báo.')

  // Xin quyền TRƯỚC mọi await khác, để còn nằm trong cử chỉ người dùng.
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Bạn chưa cho phép hiện thông báo.')

  const registration = await serviceWorkerReady()

  // Có thể đã đăng ký từ trước (bật lại sau khi tắt, hoặc đăng ký còn sót). Dùng lại
  // đăng ký cũ thay vì subscribe lần nữa — trình duyệt sẽ từ chối nếu khoá khác.
  const existing = await registration.pushManager.getSubscription()
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      // Bắt buộc true trên Chrome: mọi push phải hiện thông báo cho người dùng thấy.
      userVisibleOnly: true,
      applicationServerKey: vapidKeyToBytes(vapidPublicKey()),
    }))

  const json = subscription.toJSON()
  const p256dh = json.keys?.p256dh
  const auth = json.keys?.auth
  if (!p256dh || !auth) {
    // Không có khoá thì server chỉ gửi được push rỗng. Dẹp luôn đăng ký nửa vời này
    // để lần sau bấm lại là tạo mới, chứ không mắc mãi ở trạng thái vô dụng.
    await subscription.unsubscribe().catch(() => {})
    throw new Error('Trình duyệt không cấp khoá mã hoá cho đăng ký này.')
  }

  await repo.savePushSubscription({
    endpoint: subscription.endpoint,
    p256dh,
    auth,
    userAgent: navigator.userAgent,
  })
}

/** Tắt nhận thông báo cho thiết bị này. Máy khác của cùng người vẫn nhận. */
export async function unsubscribeThisDevice(): Promise<void> {
  const subscription = await currentSubscription()
  if (!subscription) return

  // Xoá ở bảng TRƯỚC khi bỏ đăng ký ở trình duyệt: nếu làm ngược mà bước xoá lỗi thì
  // còn lại một dòng chết trong bảng, và server cứ gửi vào endpoint đã hỏng cho tới
  // khi nhận 410 — tức là mỗi ngày một lần gửi vô ích mà không ai thấy.
  await repo.deletePushSubscription(subscription.endpoint)
  await subscription.unsubscribe()
}
