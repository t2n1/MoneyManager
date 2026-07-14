import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { isDemoMode } from '../../lib/demo'
import { getSupabase } from '../../lib/supabase'
import { useAuth } from './AuthProvider'

export function LoginPage() {
  const { session, loading } = useAuth()
  const [error, setError] = useState<string | null>(null)

  if (isDemoMode) return <Navigate to="/" replace />
  if (!loading && session) return <Navigate to="/" replace />

  async function signInWithGoogle() {
    setError(null)
    const { error: err } = await getSupabase().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (err) setError(err.message)
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-gray-50 px-6">
      <div className="text-center">
        <div className="text-5xl">📒</div>
        <h1 className="mt-4 text-3xl font-bold text-gray-800">Sổ Chi Tiêu</h1>
        <p className="mt-2 text-gray-500">Quản lý chi tiêu cá nhân, đồng bộ mọi thiết bị</p>
      </div>

      <button
        type="button"
        onClick={signInWithGoogle}
        className="flex items-center gap-3 rounded-xl border border-gray-300 bg-white px-6 py-3 text-base font-medium text-gray-700 shadow-sm transition hover:bg-gray-100 active:scale-95"
      >
        <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
        </svg>
        Đăng nhập với Google
      </button>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
