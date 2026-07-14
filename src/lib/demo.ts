// Chế độ demo: chạy không cần Supabase, dữ liệu lưu localStorage.
// Bật khi thiếu env Supabase, hoặc ép bằng VITE_DEMO_MODE=true.
export const isDemoMode =
  import.meta.env.VITE_DEMO_MODE === 'true' || !import.meta.env.VITE_SUPABASE_URL
