import { useState } from 'react'
import { useIsFetching, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowLeftRight,
  Bell,
  ChevronRight,
  Database,
  Landmark,
  Scale,
  Tag as TagIcon,
  Tags,
  UserRound,
} from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { resetDemoData } from '../../data/demoRepo'
import { useRatesFreshness } from '../../hooks/useDataFreshness'
import { useProfile, useRates } from '../../hooks/queries'
import { isDemoMode } from '../../lib/demo'
import { confirmDialog } from '../../lib/dialog'
import type { CurrencyCode } from '../../lib/money'
import { formatRateLine } from '../../lib/rates'
import { getSupabase } from '../../lib/supabase'
import { DensityToggle } from './DensityToggle'
import { FontSizeToggle } from './FontSizeToggle'
import { ProfileEditSheet } from './ProfileEditSheet'
import { ThemeToggle } from './ThemeToggle'

export function SettingsPage() {
  const { data: profile } = useProfile()
  const qc = useQueryClient()
  const navigate = useNavigate()
  // ?edit=profile mở thẳng sheet Hồ sơ (link "Đổi mốc" từ tab Ngân sách)
  const [searchParams] = useSearchParams()
  const [editing, setEditing] = useState(() => searchParams.get('edit') === 'profile')

  const { base, rates } = useRates()
  // Chỉ để khoá nút "Thử lấy lại" trong lúc đang lấy. Việc ĐỌC LẠI mốc thời gian sau mỗi
  // lượt lấy đã nằm trong useRatesFreshness (nó tự theo dõi số lượt fetch).
  const ratesFetching = useIsFetching({ queryKey: ['rates'] })
  // formatRateLine tự trả null cho chính `base` và cho số rác, nên không lọc trước.
  const rateLines = rates
    ? (Object.entries(rates) as [CurrencyCode, number][])
        .map(([c, r]) => formatRateLine(base, c, r))
        .filter((line): line is string => line !== null)
    : []
  // Dùng CHUNG phép tính với dòng tuổi dữ liệu ở trang Tài sản và Báo cáo, thay vì tự đọc
  // cache rồi tự tính. Ba chỗ lệch đã có thật khi trang này tính riêng: nó bỏ qua bản ghi
  // cache thiếu `sourceUpdatedAt` (hai trang kia lùi về `fetchedAt` nên vẫn nói được tuổi),
  // nó đo theo ngày trọn nên tỷ giá 5 giờ tuổi thành "Cập nhật hôm nay" trong khi trang Tài
  // sản ghi "5 giờ trước", và ngưỡng "đã cũ" so `>=` trong khi bên kia so `>`.
  const rateAge = useRatesFreshness()?.details.find((d) => d.label === 'Tỷ giá') ?? null
  const rateStale = rateAge?.tone === 'warn'

  // Cài đặt giữ một cột hẹp kể cả trên PC (khung ngoài của AppLayout đã nới lên 6xl):
  // đây là danh sách nhóm tuỳ chọn, kéo rộng ra thì nhãn và ô bật/tắt rời nhau hai đầu
  // màn hình.
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-3 lg:p-6">
      <h1 className="text-lg font-bold text-fg-primary">Cài đặt</h1>

      {isDemoMode && (
        <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
          <p className="font-semibold">Chế độ demo</p>
          <p className="mt-1 text-amber-700 dark:text-amber-300">
            Dữ liệu chỉ lưu trên trình duyệt này. Khi kết nối Supabase (tạo .env.local), app sẽ tự
            chuyển sang dữ liệu thật đồng bộ giữa các thiết bị.
          </p>
          <button
            type="button"
            onClick={async () => {
              if (
                !(await confirmDialog({
                  title: 'Xóa toàn bộ dữ liệu demo?',
                  message: 'Sẽ seed lại từ đầu.',
                  danger: true,
                  confirmLabel: 'Xóa & seed lại',
                }))
              )
                return
              resetDemoData()
              qc.clear()
              navigate('/')
            }}
            className="mt-2 rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-200 dark:hover:bg-amber-900/40"
          >
            Xóa dữ liệu demo
          </button>
        </div>
      )}

      <section className="overflow-hidden rounded-xl bg-surface shadow-sm ">
        <h2 className="px-3 pt-3 text-sm font-semibold text-fg-muted">Quản lý</h2>
        <div className="mt-1 divide-y divide-border-subtle">
          <Link
            to="/settings/accounts"
            className="flex items-center gap-3 px-3 py-3 text-sm text-fg-primary hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            <Landmark className="h-5 w-5 text-fg-muted" />
            <span className="flex-1">Tài khoản</span>
            <ChevronRight className="h-5 w-5 text-gray-300 dark:text-gray-600" />
          </Link>
          <Link
            to="/settings/categories"
            className="flex items-center gap-3 px-3 py-3 text-sm text-fg-primary hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            <Tags className="h-5 w-5 text-fg-muted" />
            <span className="flex-1">Danh mục</span>
            <ChevronRight className="h-5 w-5 text-gray-300 dark:text-gray-600" />
          </Link>
          <Link
            to="/settings/categories/classify"
            className="flex items-center gap-3 px-3 py-3 text-sm text-fg-primary hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            <Scale className="h-5 w-5 text-fg-muted" />
            <span className="flex-1">Phân loại chi tiêu</span>
            <ChevronRight className="h-5 w-5 text-gray-300 dark:text-gray-600" />
          </Link>
          <Link
            to="/settings/tags"
            className="flex items-center gap-3 px-3 py-3 text-sm text-fg-primary hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            <TagIcon className="h-5 w-5 text-fg-muted" />
            <span className="flex-1">Nhãn</span>
            <ChevronRight className="h-5 w-5 text-gray-300 dark:text-gray-600" />
          </Link>
          <Link
            to="/settings/notifications"
            className="flex items-center gap-3 px-3 py-3 text-sm text-fg-primary hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            <Bell className="h-5 w-5 text-fg-muted" />
            <span className="flex-1">Thông báo</span>
            <ChevronRight className="h-5 w-5 text-gray-300 dark:text-gray-600" />
          </Link>
        </div>
      </section>

      {/* Nhóm tài sản, Nợ/cho vay và Giao dịch định kỳ TỪNG nằm trong khối trên. Đã dời
          sang đúng ngữ cảnh (Tài sản / Sổ) vì chúng là dữ liệu tài chính thật, không phải
          cấu hình — xem docs/information-architecture.md §1.1. */}

      <ThemeToggle />

      <DensityToggle />

      <FontSizeToggle />

      <section className="overflow-hidden rounded-xl bg-surface shadow-sm ">
        <Link
          to="/settings/data"
          className="flex items-center gap-3 px-3 py-3 text-sm text-fg-primary hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          <Database className="h-5 w-5 text-fg-muted" />
          <span className="flex-1">
            <span className="block">Dữ liệu &amp; sao lưu</span>
            <span className="block text-xs text-fg-muted">
              Xuất CSV / PDF · Sao lưu, khôi phục · Nhập CSV
            </span>
          </span>
          <ChevronRight className="h-5 w-5 text-gray-300 dark:text-gray-600" />
        </Link>
      </section>

      <section className="overflow-hidden rounded-xl bg-surface shadow-sm ">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          <UserRound className="h-5 w-5 text-fg-muted" />
          <span className="flex-1">
            <span className="block text-sm text-fg-primary">{profile?.display_name ?? '—'}</span>
            <span className="block text-xs text-fg-muted">
              Tháng bắt đầu ngày {profile?.month_start_day ?? 1} · Tiền gốc {profile?.base_currency ?? '—'}
            </span>
          </span>
          <ChevronRight className="h-5 w-5 text-gray-300 dark:text-gray-600" />
        </button>
        {!isDemoMode && (
          <div className="border-t border-border-subtle px-3 py-3">
            <button
              type="button"
              onClick={async () => {
                if (await confirmDialog({ title: 'Đăng xuất?', confirmLabel: 'Đăng xuất', danger: true })) {
                  await getSupabase().auth.signOut()
                }
              }}
              className="rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/30"
            >
              Đăng xuất
            </button>
          </div>
        )}
      </section>

      {rateLines.length > 0 && (
        <Card as="section" className="overflow-hidden">
          <div className="flex items-start gap-3">
            <ArrowLeftRight className="mt-0.5 h-5 w-5 shrink-0 text-fg-muted" />
            <div className="flex-1">
              {/* h2 để có tên landmark cho <Card as="section">, đồng bộ với khối "Quản
                  lý" — nhưng KHÔNG copy class px-3 pt-3 của khối đó: Card đã có p-3
                  sẵn, copy vào sẽ đúp lề. */}
              <h2 className="text-sm font-semibold text-fg-muted">Tỷ giá quy đổi</h2>
              {rateLines.map((line) => (
                // CỐ Ý không có tabular-nums: khối này chỉ 1-2 dòng ngắn, không phải
                // cột số cần thẳng hàng, mà ngưỡng `tabular-nums` ở
                // tests/designSystem.test.ts đã kín (97). Cũng không dùng <Money> —
                // nó che số khi bật chế độ riêng tư, trái ngược mục đích của khối này.
                <p key={line} className="mt-0.5 text-sm text-fg-muted">
                  {line}
                </p>
              ))}
              {/* Không có dòng "Cập nhật …" xám ở đây nữa: chân trang đã nói tuổi tỷ giá ở
                  MỌI trang, kể cả trang này. Khối cảnh báo dưới đây thì ở lại — nó không
                  chỉ báo tuổi mà còn là chỗ duy nhất làm được gì đó về việc tỷ giá cũ. */}
              {rateStale && rateAge !== null && (
                <div className="mt-2 rounded-lg bg-amber-50 p-2 dark:bg-amber-900/30">
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    Cập nhật {rateAge.age} — mạng hoặc nguồn tỷ giá đang lỗi, số quy đổi có
                    thể sai.
                  </p>
                  <button
                    type="button"
                    disabled={ratesFetching > 0}
                    onClick={() => qc.invalidateQueries({ queryKey: ['rates'] })}
                    className="mt-2 rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-700 dark:text-amber-200 dark:hover:bg-amber-900/40"
                  >
                    {/* Offline, bấm nút này refetch rồi lại rơi vào catch của fetchRates
                        (trả nguyên cache cũ) — màn hình không đổi gì cả nên nút coi như
                        hỏng. Khoá nút + đổi chữ lúc đang lấy để người dùng biết đã bấm
                        trúng, dù kết quả cuối có thể vẫn là cache cũ. */}
                    {ratesFetching > 0 ? 'Đang lấy…' : 'Thử lấy lại'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Dòng "Sổ Gạo · Giai đoạn 1 (MVP) · …" đã dời lên components/AppFooter.tsx: nó
          đúng ở mọi trang chứ không riêng trang này, và để lại đây thì trang Cài đặt có
          hai dòng chân nối đuôi nhau. */}

      {editing && profile && <ProfileEditSheet profile={profile} onClose={() => setEditing(false)} />}
    </div>
  )
}
