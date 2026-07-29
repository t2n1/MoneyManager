import { Navigate, Outlet } from 'react-router-dom'
import { isDemoMode } from '../../lib/demo'
import { useAuth } from './AuthProvider'

export function RequireAuth() {
  const { session, loading } = useAuth()

  if (isDemoMode) return <Outlet />

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-surface-page text-fg-muted">
        Đang tải…
      </div>
    )
  }

  if (!session) return <Navigate to="/login" replace />

  return <Outlet />
}
