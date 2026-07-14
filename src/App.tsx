import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/AppLayout'
import { LoginPage } from './features/auth/LoginPage'
import { RequireAuth } from './features/auth/RequireAuth'
import { SettingsPage } from './features/settings/SettingsPage'
import { EntryPage } from './features/transactions/EntryPage'
import { LedgerPage } from './features/transactions/LedgerPage'

// Recharts nặng → tách chunk riêng, không nằm trong bundle khởi động (giữ mở app nhanh)
const ReportsPage = lazy(() =>
  import('./features/reports/ReportsPage').then((m) => ({ default: m.ReportsPage })),
)

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<EntryPage />} />
          <Route path="/transactions" element={<LedgerPage />} />
          <Route
            path="/reports"
            element={
              <Suspense
                fallback={<p className="p-6 text-center text-gray-400">Đang tải báo cáo…</p>}
              >
                <ReportsPage />
              </Suspense>
            }
          />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Route>
    </Routes>
  )
}

export default App
