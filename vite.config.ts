import { defineConfig } from 'vite'
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
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      workbox: {
        // App shell: precache toàn bộ asset build; điều hướng offline về index.html
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        navigateFallback: '/index.html',
        // API Supabase không cache — dữ liệu tiền bạc phải luôn tươi
        navigateFallbackDenylist: [/^\/auth\//],
      },
      manifest: {
        name: 'Sổ Chi Tiêu',
        short_name: 'Sổ Chi Tiêu',
        description: 'Quản lý chi tiêu cá nhân — nhập một giao dịch dưới 5 giây',
        lang: 'vi',
        dir: 'ltr',
        display: 'standalone',
        start_url: '/',
        theme_color: '#16a34a',
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
