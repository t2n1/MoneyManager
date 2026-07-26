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
const AssetsPage = lazy(() =>
  import('./features/assets/AssetsPage').then((m) => ({ default: m.AssetsPage })),
)
const AccountDetailPage = lazy(() =>
  import('./features/assets/AccountDetailPage').then((m) => ({ default: m.AccountDetailPage })),
)
const AssetGroupsPage = lazy(() =>
  import('./features/assets/AssetGroupsPage').then((m) => ({ default: m.AssetGroupsPage })),
)
const AccountsPage = lazy(() =>
  import('./features/accounts/AccountsPage').then((m) => ({ default: m.AccountsPage })),
)
const CategoriesPage = lazy(() =>
  import('./features/categories/CategoriesPage').then((m) => ({ default: m.CategoriesPage })),
)
const ClassifyCategoriesPage = lazy(() =>
  import('./features/categories/ClassifyCategoriesPage').then((m) => ({
    default: m.ClassifyCategoriesPage,
  })),
)
const DebtsPage = lazy(() =>
  import('./features/debts/DebtsPage').then((m) => ({ default: m.DebtsPage })),
)
const DebtDetailPage = lazy(() =>
  import('./features/debts/DebtDetailPage').then((m) => ({ default: m.DebtDetailPage })),
)
const RecurringPage = lazy(() =>
  import('./features/recurring/RecurringPage').then((m) => ({ default: m.RecurringPage })),
)
const ImportCsvPage = lazy(() =>
  import('./features/import/ImportCsvPage').then((m) => ({ default: m.ImportCsvPage })),
)
const DataPage = lazy(() =>
  import('./features/settings/DataPage').then((m) => ({ default: m.DataPage })),
)

const Loading = () => <p className="p-6 text-center text-gray-400 dark:text-gray-500">Đang tải…</p>
const lazyRoute = (el: ReactNode) => <Suspense fallback={<Loading />}>{el}</Suspense>

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<LedgerPage />} />
          <Route path="/transactions" element={<LedgerPage />} />
          <Route path="/entry" element={<EntryPage />} />
          <Route path="/assets" element={lazyRoute(<AssetsPage />)} />
          <Route path="/assets/:accountId" element={lazyRoute(<AccountDetailPage />)} />
          <Route path="/search" element={lazyRoute(<SearchPage />)} />
          <Route path="/reports" element={lazyRoute(<ReportsPage />)} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/settings/accounts" element={lazyRoute(<AccountsPage />)} />
          <Route path="/settings/categories" element={lazyRoute(<CategoriesPage />)} />
          <Route
            path="/settings/categories/classify"
            element={lazyRoute(<ClassifyCategoriesPage />)}
          />
          <Route path="/settings/asset-groups" element={lazyRoute(<AssetGroupsPage />)} />
          <Route path="/settings/debts" element={lazyRoute(<DebtsPage />)} />
          <Route path="/settings/debts/:debtId" element={lazyRoute(<DebtDetailPage />)} />
          <Route path="/settings/recurring" element={lazyRoute(<RecurringPage />)} />
          <Route path="/settings/import" element={lazyRoute(<ImportCsvPage />)} />
          <Route path="/settings/data" element={lazyRoute(<DataPage />)} />
        </Route>
      </Route>
    </Routes>
  )
}

export default App
