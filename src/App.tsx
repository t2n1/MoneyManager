import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Route, Routes, useParams, useSearchParams } from 'react-router-dom'
import { AppLayout } from './components/AppLayout'
import { PageSkeleton } from './components/PageSkeleton'
import { LoginPage } from './features/auth/LoginPage'
import { RequireAuth } from './features/auth/RequireAuth'
import { SettingsPage } from './features/settings/SettingsPage'
import { EntryPage } from './features/transactions/EntryPage'
import { LedgerPage } from './features/transactions/LedgerPage'

// Recharts nặng → tách chunk riêng, không nằm trong bundle khởi động (giữ mở app nhanh)
const BulletinPage = lazy(() =>
  import('./features/bulletin/BulletinPage').then((m) => ({ default: m.BulletinPage })),
)
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
const PlannedPage = lazy(() =>
  import('./features/planned/PlannedPage').then((m) => ({ default: m.PlannedPage })),
)
const InvestPage = lazy(() =>
  import('./features/assets/InvestPage').then((m) => ({ default: m.InvestPage })),
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
const TagsPage = lazy(() =>
  import('./features/tags/TagsPage').then((m) => ({ default: m.TagsPage })),
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
const ImportPhieuLuongPage = lazy(() =>
  import('./features/phieu-luong/ImportPhieuLuongPage').then((m) => ({ default: m.ImportPhieuLuongPage })),
)
const DataPage = lazy(() =>
  import('./features/settings/DataPage').then((m) => ({ default: m.DataPage })),
)
const NotificationSettingsPage = lazy(() =>
  import('./features/notifications/NotificationSettingsPage').then((m) => ({
    default: m.NotificationSettingsPage,
  })),
)
const BudgetPage = lazy(() =>
  import('./features/budgets/BudgetPage').then((m) => ({ default: m.BudgetPage })),
)
const CategoryDetailPage = lazy(() =>
  import('./features/reports/CategoryDetailPage').then((m) => ({ default: m.CategoryDetailPage })),
)

/**
 * Bọc route lazy bằng khung xương hợp dáng trang sắp hiện, thay cho một dòng "Đang tải…"
 * dùng chung. `kind` mặc định 'cards' vì phần lớn trang lazy là lưới thẻ.
 */
const lazyRoute = (el: ReactNode, kind: 'list' | 'cards' | 'table' = 'cards') => (
  <Suspense fallback={<PageSkeleton kind={kind} />}>{el}</Suspense>
)

/** Ngân sách đã tách thành tab riêng `/budget`. Đường cũ `/reports?view=budget` cùng
 *  PATH với Báo cáo nên không chuyển tiếp được bằng một `<Route>` riêng — phải xét ở đây.
 *  Vẫn cần chuyển tiếp vì đường cũ còn nằm trong bookmark và lịch sử trình duyệt; giữ
 *  nguyên `ym` để mở đúng tháng người dùng đã lưu. Hook `useSearchParams` gọi vô điều
 *  kiện trước mọi nhánh nên thứ tự hook không đổi giữa các lần render. */
function ReportsRoute() {
  const [params] = useSearchParams()
  if (params.get('view') === 'budget') {
    const ym = params.get('ym')
    return <Navigate to={ym ? `/budget?ym=${ym}` : '/budget'} replace />
  }
  return lazyRoute(<ReportsPage />)
}
// Bốn tab của Báo cáo rút còn ba (PR 7). Đường cũ `?view=charts|trends|insights` KHÔNG
// chuyển tiếp ở đây mà `ReportsPage` tự dịch bằng `migrateReportView` — chuyển tiếp
// bằng <Navigate> sẽ thay URL trong lịch sử, làm nút Back của trình duyệt nhảy cóc.
// Dịch tại chỗ thì link cũ mở đúng tab, và lần bấm tab đầu tiên tự ghi khoá mới.

/** `/settings/debts/:debtId` → `/debts/:debtId`: cần đọc param nên không dùng
 *  `<Navigate>` tĩnh được. */
function LegacyDebtRedirect() {
  const { debtId } = useParams()
  return <Navigate to={`/debts/${debtId}`} replace />
}

/** `/assets/:accountId` → `/assets/account/:accountId`. Chèn segment `account/` để
 *  `/assets/groups` không còn nằm CÙNG CẤP với một segment động — trước đây nó chạy đúng
 *  chỉ vì React Router xếp segment tĩnh trên segment động, một phụ thuộc không ai đọc
 *  code thấy được. Route chuyển tiếp này vẫn nằm cùng cấp với `/assets/groups`, nhưng
 *  đây là đường CŨ sắp chết nên không phải chỗ cần đọc rõ ràng lâu dài. */
function LegacyAccountRedirect() {
  const { accountId } = useParams()
  return <Navigate to={`/assets/account/${accountId}`} replace />
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          {/* Trang chủ đổi chủ (PR 4 của redesign 1a): `/` là Bản tin, Sổ dời sang
              `/so`. `/transactions` — đường cũ đã tồn tại từ đợt IA — nay CHUYỂN TIẾP
              sang `/so` thay vì dựng lại LedgerPage: hai path cùng render một trang thì
              nút Sổ trên rail chỉ sáng ở một trong hai. */}
          <Route path="/" element={lazyRoute(<BulletinPage />)} />
          <Route path="/so" element={<LedgerPage />} />
          <Route path="/transactions" element={<Navigate to="/so" replace />} />
          <Route path="/entry" element={<EntryPage />} />
          <Route path="/assets" element={lazyRoute(<AssetsPage />)} />
          <Route path="/assets/groups" element={lazyRoute(<AssetGroupsPage />)} />
          <Route path="/invest" element={lazyRoute(<InvestPage />)} />
          <Route path="/planned" element={lazyRoute(<PlannedPage />, 'list')} />
          <Route path="/assets/account/:accountId" element={lazyRoute(<AccountDetailPage />)} />
          <Route path="/debts" element={lazyRoute(<DebtsPage />, 'table')} />
          <Route path="/debts/:debtId" element={lazyRoute(<DebtDetailPage />)} />
          <Route path="/recurring" element={lazyRoute(<RecurringPage />, 'table')} />
          <Route path="/search" element={lazyRoute(<SearchPage />, 'list')} />
          <Route path="/budget" element={lazyRoute(<BudgetPage />)} />
          <Route path="/reports" element={<ReportsRoute />} />
          <Route path="/reports/category/:categoryId" element={lazyRoute(<CategoryDetailPage />)} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/settings/accounts" element={lazyRoute(<AccountsPage />, 'table')} />
          <Route path="/settings/categories" element={lazyRoute(<CategoriesPage />, 'table')} />
          <Route
            path="/settings/categories/classify"
            element={lazyRoute(<ClassifyCategoriesPage />)}
          />
          <Route path="/settings/tags" element={lazyRoute(<TagsPage />, 'table')} />
          <Route path="/settings/import" element={lazyRoute(<ImportCsvPage />)} />
          <Route path="/settings/nhap-phieu-luong" element={lazyRoute(<ImportPhieuLuongPage />, 'list')} />
          <Route path="/settings/data" element={lazyRoute(<DataPage />)} />
          <Route path="/settings/notifications" element={lazyRoute(<NotificationSettingsPage />)} />

          {/* Chuyển tiếp đường CŨ (docs/information-architecture.md §3.4). Bookmark, lịch
              sử trình duyệt và ảnh chụp màn hình cũ đều còn trỏ vào đây — bỏ hẳn là người
              dùng gặp trang trắng. */}
          <Route path="/health" element={<Navigate to="/reports?view=health" replace />} />
          <Route path="/lifetime" element={<Navigate to="/assets?view=future" replace />} />
          <Route path="/settings/asset-groups" element={<Navigate to="/assets/groups" replace />} />
          <Route path="/settings/debts" element={<Navigate to="/debts" replace />} />
          <Route path="/settings/debts/:debtId" element={<LegacyDebtRedirect />} />
          <Route path="/settings/recurring" element={<Navigate to="/recurring" replace />} />
          <Route path="/assets/:accountId" element={<LegacyAccountRedirect />} />
        </Route>
      </Route>
    </Routes>
  )
}

export default App
