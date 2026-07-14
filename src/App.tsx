import { lazy, Suspense, type ReactNode } from 'react'
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
// Màn phụ (ít mở) → lazy để bundle khởi động gọn
const SearchPage = lazy(() =>
  import('./features/transactions/SearchPage').then((m) => ({ default: m.SearchPage })),
)
const AccountsPage = lazy(() =>
  import('./features/accounts/AccountsPage').then((m) => ({ default: m.AccountsPage })),
)
const CategoriesPage = lazy(() =>
  import('./features/categories/CategoriesPage').then((m) => ({ default: m.CategoriesPage })),
)

const Loading = () => <p className="p-6 text-center text-gray-400">Đang tải…</p>
const lazyRoute = (el: ReactNode) => <Suspense fallback={<Loading />}>{el}</Suspense>

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<EntryPage />} />
          <Route path="/transactions" element={<LedgerPage />} />
          <Route path="/search" element={lazyRoute(<SearchPage />)} />
          <Route path="/reports" element={lazyRoute(<ReportsPage />)} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/settings/accounts" element={lazyRoute(<AccountsPage />)} />
          <Route path="/settings/categories" element={lazyRoute(<CategoriesPage />)} />
        </Route>
      </Route>
    </Routes>
  )
}

export default App
