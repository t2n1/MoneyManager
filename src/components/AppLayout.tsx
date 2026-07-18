import { useEffect } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { isDemoMode } from '../lib/demo'

const TABS = [
  { to: '/', label: 'Sổ GD', icon: '📒' },
  { to: '/assets', label: 'Tài sản', icon: '💰' },
  { to: '/reports', label: 'Báo cáo', icon: '📊' },
  { to: '/settings', label: 'Cài đặt', icon: '⚙️' },
]

function isTypingTarget(e: KeyboardEvent) {
  const el = e.target as HTMLElement | null
  return (
    !!el &&
    (el.tagName === 'INPUT' ||
      el.tagName === 'TEXTAREA' ||
      el.tagName === 'SELECT' ||
      el.isContentEditable)
  )
}

export function AppLayout() {
  const navigate = useNavigate()
  const location = useLocation()

  // Nút "+" nổi chỉ hiện ở trang Sổ Giao dịch
  const onLedger = location.pathname === '/' || location.pathname === '/transactions'

  // Phím tắt desktop: 1–4 chuyển tab, N mở màn nhập
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e) || e.ctrlKey || e.metaKey || e.altKey) return
      const index = Number(e.key) - 1
      if (index >= 0 && index < TABS.length) navigate(TABS[index].to)
      if (e.key === 'n' || e.key === 'N') navigate('/entry')
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [navigate])

  const linkClass = (isActive: boolean) =>
    `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
      isActive ? 'bg-green-100 text-green-800' : 'text-gray-600 hover:bg-gray-100'
    }`

  return (
    <div className="min-h-dvh bg-gray-50 lg:flex">
      {/* Sidebar desktop */}
      <aside className="hidden shrink-0 border-r border-gray-200 bg-white p-4 lg:flex lg:w-56 lg:flex-col">
        <div className="mb-6 flex items-center gap-2 px-2">
          <span className="text-2xl">📒</span>
          <span className="text-lg font-bold text-gray-800">Sổ Chi Tiêu</span>
        </div>
        <NavLink
          to="/entry"
          className="mb-3 flex items-center justify-center gap-2 rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-green-700 active:scale-95"
        >
          <span className="text-lg leading-none">＋</span>
          Nhập giao dịch
        </NavLink>
        <nav className="flex flex-col gap-1">
          {TABS.map((tab, i) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.to === '/'}
              className={({ isActive }) => linkClass(isActive)}
            >
              <span>{tab.icon}</span>
              <span className="flex-1">{tab.label}</span>
              <kbd className="rounded bg-gray-100 px-1.5 text-xs text-gray-400">{i + 1}</kbd>
            </NavLink>
          ))}
        </nav>
        {isDemoMode && (
          <div className="mt-auto rounded-lg bg-amber-50 p-3 text-xs text-amber-700">
            Chế độ demo — dữ liệu chỉ lưu trên trình duyệt này
          </div>
        )}
      </aside>

      {/* Nội dung */}
      <main className="mx-auto w-full max-w-2xl flex-1 pb-20 lg:pb-6">
        <Outlet />
      </main>

      {/* Nút "+" nổi (mobile) → mở trang nhập; chỉ hiện ở Sổ GD */}
      {onLedger && (
        <button
          type="button"
          onClick={() => navigate('/entry')}
          aria-label="Nhập giao dịch"
          className="fixed bottom-20 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-green-600 text-3xl leading-none text-white shadow-lg transition hover:bg-green-700 active:scale-95 lg:hidden"
        >
          ＋
        </button>
      )}

      {/* Bottom tab bar mobile */}
      <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.to === '/'}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-0.5 py-2 text-xs ${
                isActive ? 'font-semibold text-green-700' : 'text-gray-500'
              }`
            }
          >
            <span className="text-xl leading-none">{tab.icon}</span>
            {tab.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
