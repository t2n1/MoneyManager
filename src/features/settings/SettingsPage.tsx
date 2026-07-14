import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { resetDemoData } from '../../data/demoRepo'
import { useAccountBalances, useProfile } from '../../hooks/queries'
import { isDemoMode } from '../../lib/demo'
import { getSupabase } from '../../lib/supabase'
import { formatVND } from '../../lib/money'

export function SettingsPage() {
  const { data: profile } = useProfile()
  const { data: balances = [] } = useAccountBalances()
  const qc = useQueryClient()
  const navigate = useNavigate()

  const total = balances.reduce((s, b) => s + b.balance, 0)

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
              </span>
              <span
                className={`text-sm font-semibold ${b.balance < 0 ? 'text-red-600' : 'text-gray-800'}`}
              >
                {formatVND(b.balance)}
              </span>
            </div>
          ))}
          <div className="flex items-center justify-between py-2">
            <span className="text-sm font-semibold text-gray-800">Tổng</span>
            <span className={`text-sm font-bold ${total < 0 ? 'text-red-600' : 'text-gray-900'}`}>
              {formatVND(total)}
            </span>
          </div>
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
        {profile && ` · Tháng bắt đầu ngày ${profile.month_start_day}`}
      </p>
    </div>
  )
}
