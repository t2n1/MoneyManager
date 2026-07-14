import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './AuthProvider'

export function RequireAuth() {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-gray-50 text-gray-400">
        Đang tải…
      </div>
    )
  }

  if (!session) return <Navigate to="/login" replace />

  return <Outlet />
}
