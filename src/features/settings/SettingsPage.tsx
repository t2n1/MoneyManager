import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { resetDemoData } from '../../data/demoRepo'
import { useProfile } from '../../hooks/queries'
import { isDemoMode } from '../../lib/demo'
import { getSupabase } from '../../lib/supabase'
import { ProfileEditSheet } from './ProfileEditSheet'

export function SettingsPage() {
  const { data: profile } = useProfile()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)

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
          <Link
            to="/settings/asset-groups"
            className="flex items-center gap-3 px-3 py-3 text-sm text-gray-800 hover:bg-gray-50"
          >
            <span className="text-xl">💰</span>
            <span className="flex-1">Nhóm tài sản</span>
            <span className="text-gray-300">›</span>
          </Link>
          <Link
            to="/settings/debts"
            className="flex items-center gap-3 px-3 py-3 text-sm text-gray-800 hover:bg-gray-50"
          >
            <span className="text-xl">🤝</span>
            <span className="flex-1">Nợ / cho vay</span>
            <span className="text-gray-300">›</span>
          </Link>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl bg-white shadow-sm">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-gray-50"
        >
          <span className="text-xl">👤</span>
          <span className="flex-1">
            <span className="block text-sm text-gray-800">{profile?.display_name ?? '—'}</span>
            <span className="block text-xs text-gray-400">
              Tháng bắt đầu ngày {profile?.month_start_day ?? 1} · Tiền gốc {profile?.base_currency ?? '—'}
            </span>
          </span>
          <span className="text-gray-300">›</span>
        </button>
        {!isDemoMode && (
          <div className="border-t border-gray-100 px-3 py-3">
            <button
              type="button"
              onClick={() => getSupabase().auth.signOut()}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
            >
              Đăng xuất
            </button>
          </div>
        )}
      </section>

      <p className="text-center text-xs text-gray-400">
        Sổ Chi Tiêu · Giai đoạn 1 (MVP)
        {profile && ` · Tháng bắt đầu ngày ${profile.month_start_day} · Quy đổi ${profile.base_currency}`}
      </p>

      {editing && profile && <ProfileEditSheet profile={profile} onClose={() => setEditing(false)} />}
    </div>
  )
}
