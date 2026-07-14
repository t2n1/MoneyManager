import { Route, Routes } from 'react-router-dom'
import { LoginPage } from './features/auth/LoginPage'
import { RequireAuth } from './features/auth/RequireAuth'
import { supabase } from './lib/supabase'

// Placeholder — Task 5 thay bằng layout tab bar/sidebar + các màn thật
function HomePlaceholder() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-gray-50">
      <h1 className="text-2xl font-bold text-gray-800">Sổ Chi Tiêu</h1>
      <p className="text-gray-500">Đã đăng nhập thành công 🎉</p>
      <button
        type="button"
        onClick={() => supabase.auth.signOut()}
        className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-600 hover:bg-gray-100"
      >
        Đăng xuất
      </button>
    </div>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route path="/" element={<HomePlaceholder />} />
      </Route>
    </Routes>
  )
}

export default App
