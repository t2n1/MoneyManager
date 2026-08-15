// `defineConfig` lấy từ 'vitest/config' chứ không từ 'vite': bản của vite không biết
// khoá `test` nên khai báo bên dưới sẽ đỏ kiểu. Đây là cách vitest tự hướng dẫn.
import { defaultExclude, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  // Mở app ra mạng Wi-Fi để điện thoại cùng mạng vào được (không cần gõ --host)
  server: {
    host: true,
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
  },
  // Không có khối này thì vitest quét CẢ repo, kể cả các worktree trong
  // .claude/worktrees (mỗi cái là một bản checkout đầy đủ của một nhánh khác). Ba
  // worktree cũ đang nằm ở đó kéo theo hơn 100 file test của nhánh khác vào cùng
  // một lần chạy, nên con số "npm test" không còn nói gì về bộ test THẬT trong src/
  // và còn nhảy mỗi lần ai đó tạo/xoá worktree.
  test: {
    // Nối vào exclude mặc định của vitest, KHÔNG thay thế: `exclude` là ghi đè
    // toàn phần, viết trần một mẫu ở đây là lẳng lặng bỏ mất node_modules/.git.
    exclude: [...defaultExclude, '**/.claude/worktrees/**'],
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      workbox: {
        // App shell: precache toàn bộ asset build; điều hướng offline về index.html
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        // Chunk pdf.js nang 1,8 MB — gan gap doi trong luong app. Tinh nang nhap
        // phieu luong CHI dung o may tinh, nen khong dua vao precache: neu khong,
        // moi lan cap nhat PWA tren dien thoai ton them 1,8 MB cho thu khong dung.
        // Trang do nap dong nen tai theo yeu cau, va offline khong can no.
        //
        // '**/pdfjs*.js' (mau ban dau) KHONG khop: entry point cua goi pdfjs-dist
        // duoc Vite dat ten chunk la `pdf-<hash>.js` (tu ten file that trong goi,
        // khong phai ten goi) — da do that bang build + grep dist/sw.js, khong
        // phai suy doan. Thieu mau nay la 427 KB chunk chinh van nam trong
        // precache, chi rieng hai file worker la duoc loai.
        globIgnores: ['**/pdf.worker*.js', '**/pdf.worker*.mjs', '**/pdfjs*.js', '**/pdf-*.js'],
        navigateFallback: '/index.html',
        // API Supabase không cache — dữ liệu tiền bạc phải luôn tươi
        navigateFallbackDenylist: [/^\/auth\//],
        // Phần nhận Web Push (public/push-sw.js). Nhét thêm một file vào service
        // worker do workbox sinh, thay vì đổi sang `injectManifest` — cách đó bắt tự
        // tay dựng lại đúng phần precache + navigateFallback ngay trên, và làm sai là
        // mất chế độ offline mà không có test nào bắt được.
        importScripts: ['/push-sw.js'],
      },
      manifest: {
        name: 'Sổ Gạo',
        short_name: 'Sổ Gạo',
        description: 'Quản lý chi tiêu cá nhân — nhập một giao dịch dưới 5 giây',
        lang: 'vi',
        dir: 'ltr',
        display: 'standalone',
        start_url: '/',
        theme_color: '#008236',
        background_color: '#f9fafb',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        // Giữ icon app → nhảy thẳng vào nhập chi/thu (mục O)
        shortcuts: [
          { name: 'Nhập chi', short_name: 'Chi', url: '/?type=expense' },
          { name: 'Nhập thu', short_name: 'Thu', url: '/?type=income' },
        ],
      },
    }),
  ],
})
