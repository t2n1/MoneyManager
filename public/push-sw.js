// Phần nhận push của service worker.
//
// Vì sao là một file JS rời trong public/ chứ không phải src/sw.ts: vite-plugin-pwa
// đang chạy chế độ `generateSW`, tự sinh toàn bộ phần precache app shell. Muốn viết
// thêm code vào service worker thì hoặc đổi sang `injectManifest` — tức là tự tay
// dựng lại phần precache/navigateFallback đang chạy tốt, và nhận rủi ro làm mất chế
// độ offline — hoặc nhờ workbox nhét thêm một file vào bằng `importScripts`. Cách thứ
// hai để nguyên cấu hình cũ không sửa một chữ, nên chọn cách đó.
//
// Đổi lại là file này không qua TypeScript và không bundle được, nên nó phải ở mức
// thuần glue: mọi quyết định "gửi cái gì, tiêu đề gì, bấm vào đi đâu" đã nằm ở
// src/features/notifications/pushPlan.ts và có test. Ở đây chỉ dán payload vào API
// của trình duyệt.

/* global self */

// Giữ khớp với PUSH_TAG trong pushPlan.ts. Chỉ dùng khi payload thiếu tag.
const TAG_MAC_DINH = 'sct-viec-can-lam'

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    // Payload không phải JSON (dịch vụ đẩy gửi rỗng, hoặc bản cũ gửi text thuần).
    // Không được im lặng bỏ qua: iOS coi một push không hiện thông báo là lạm dụng
    // và có thể thu hồi quyền. Thà hiện một dòng chung chung.
    payload = {}
  }

  const title = payload.title || 'Sổ Gạo'

  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || 'Có việc cần để ý trong sổ.',
      tag: payload.tag || TAG_MAC_DINH,
      // Cùng một tag: thông báo mới THAY cái cũ. renotify để nó vẫn báo lại chứ không
      // đổi im lặng — không thì người dùng không biết là có tin mới.
      renotify: true,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      lang: 'vi',
      data: { to: payload.to || '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const to = (event.notification.data && event.notification.data.to) || '/'

  event.waitUntil(
    (async () => {
      const url = new URL(to, self.registration.scope).href

      // Đang có tab app mở thì DÙNG LẠI tab đó. Mở tab mới mỗi lần bấm thông báo là
      // sau một tuần người dùng có bảy tab cùng một app.
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of windows) {
        if (new URL(client.url).origin !== new URL(url).origin) continue
        await client.focus()
        // navigate() không có trên mọi trình duyệt, và bị chặn nếu tab đang ở origin
        // khác. Focus được rồi thì thất bại ở bước này cũng không sao.
        if (typeof client.navigate === 'function') {
          try {
            await client.navigate(url)
          } catch {
            // giữ nguyên trang đang mở
          }
        }
        return
      }

      await self.clients.openWindow(url)
    })(),
  )
})
