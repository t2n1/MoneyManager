import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { resetDemoData } from '../../data/demoRepo'
import { useAccountBalances, useProfile, useRates } from '../../hooks/queries'
import { isDemoMode } from '../../lib/demo'
import { getSupabase } from '../../lib/supabase'
import { CURRENCIES, formatMoney } from '../../lib/money'
import { convertToBase } from '../../lib/rates'

export function SettingsPage() {
  const { data: profile } = useProfile()
  const { data: balances = [] } = useAccountBalances()
  const { base, rates } = useRates()
  const qc = useQueryClient()
  const navigate = useNavigate()

  // Tổng tài sản quy đổi về base; thiếu tỷ giá cho bất kỳ tài khoản nào → null
  const total = balances.reduce<number | null>((sum, b) => {
    if (sum === null) return null
    const v = convertToBase(b.balance, b.currency, base, rates ?? {})
    return v === null ? null : sum + v
  }, 0)
  const hasForeign = balances.some((b) => b.currency !== base)

  return (
    <div className="flex flex-col gap-4 p-3 lg:p-6">
      <h1 className="text-lg font-bold text-gray-800">Cài đặt</h1>

      {isDemoMode && (
        <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          <p className="font-semibold">Chế độ demo</p>
          <p className="mt-1 text-amber-700">
            Dữ liệu chỉ lưu trên trình duyệt này. Khi kết nối Supabase (tạo .env.local), app sẽ tự
            chuyển sang dữ liệu thật đồng bộ giữa các thiết bị.
          </p>
          <button
            type="button"
            onClick={() => {
              if (!window.confirm('Xóa toàn bộ dữ liệu demo và seed lại từ đầu?')) return
              resetDemoData()
              qc.clear()
              navigate('/')
            }}
            className="mt-2 rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100"
          >
            Xóa dữ liệu demo
          </button>
        </div>
      )}

      <section className="rounded-xl bg-white p-3 shadow-sm">
        <h2 className="mb-2 text-sm font-semibold text-gray-500">Số dư tài khoản</h2>
        <div className="divide-y divide-gray-100">
          {balances.map((b) => (
            <div key={b.id} className="flex items-center justify-between py-2">
              <span className="text-sm text-gray-800">
                {b.type === 'cash' ? '💵' : '🏦'} {b.name}
                <span className="ml-1 text-xs text-gray-400">{b.currency}</span>
              </span>
              <span
                className={`text-sm font-semibold ${b.balance < 0 ? 'text-red-600' : 'text-gray-800'}`}
              >
                {formatMoney(b.balance, b.currency)}
              </span>
            </div>
          ))}
          <div className="flex items-center justify-between py-2">
            <span className="text-sm font-semibold text-gray-800">
              Tổng ({CURRENCIES[base].label})
            </span>
            <span
              className={`text-sm font-bold ${total !== null && total < 0 ? 'text-red-600' : 'text-gray-900'}`}
            >
              {total !== null
                ? `${hasForeign ? '≈ ' : ''}${formatMoney(total, base)}`
                : 'Đang tải tỷ giá…'}
            </span>
          </div>
        </div>
        {hasForeign && rates && (
          <p className="mt-2 text-xs text-gray-400">
            Tỷ giá: ¥1 ≈ {rates.VND?.toFixed(2)} ₫ · $1 ≈ ¥
            {rates.USD ? (1 / rates.USD).toFixed(1) : '?'} (open.er-api.com, cache 12h)
          </p>
        )}
      </section>

      <section className="overflow-hidden rounded-xl bg-white shadow-sm">
        <h2 className="px-3 pt-3 text-sm font-semibold text-gray-500">Quản lý</h2>
        <div className="mt-1 divide-y divide-gray-100">
          <Link
            to="/settings/accounts"
            className="flex items-center gap-3 px-3 py-3 text-sm text-gray-800 hover:bg-gray-50"
          >
            <span className="text-xl">🏦</span>
            <span className="flex-1">Tài khoản</span>
            <span className="text-gray-300">›</span>
          </Link>
          <Link
            to="/settings/categories"
            className="flex items-center gap-3 px-3 py-3 text-sm text-gray-800 hover:bg-gray-50"
          >
            <span className="text-xl">🏷️</span>
            <span className="flex-1">Danh mục</span>
            <span className="text-gray-300">›</span>
          </Link>
        </div>
      </section>

      <section className="rounded-xl bg-white p-3 shadow-sm">
        <h2 className="mb-2 text-sm font-semibold text-gray-500">Tài khoản đăng nhập</h2>
        <p className="text-sm text-gray-800">{profile?.display_name ?? '—'}</p>
        {!isDemoMode && (
          <button
            type="button"
            onClick={() => getSupabase().auth.signOut()}
            className="mt-3 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
          >
            Đăng xuất
          </button>
        )}
      </section>

      <p className="text-center text-xs text-gray-400">
        Sổ Chi Tiêu · Giai đoạn 1 (MVP)
        {profile && ` · Tháng bắt đầu ngày ${profile.month_start_day} · Quy đổi ${base}`}
      </p>
    </div>
  )
}
