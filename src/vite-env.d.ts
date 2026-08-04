/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  /**
   * Khoá CÔNG KHAI VAPID (base64url) để đăng ký nhận push. Chỉ nửa công khai được
   * nhúng vào bundle; nửa riêng tư là secret của edge function, không bao giờ ở đây.
   * Thiếu biến này thì phần đẩy thông báo tự tắt, phần còn lại của app chạy bình thường.
   */
  readonly VITE_VAPID_PUBLIC_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
