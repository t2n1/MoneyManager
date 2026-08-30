import { useState } from 'react'
import { useIsFetching, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeftRight, ChevronRight, UserRound } from 'lucide-react'
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
import { SETTINGS_NAV } from './SettingsLayout'
import { ThemeToggle } from './ThemeToggle'
import { PageHeader, SectionTitle } from '../../components/ui'

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

  // Đây là mặt "Chung" — một trong bảy mục của Cài đặt. Từ `lg`, danh sách bảy mục nằm
  // ở cột trái CỐ ĐỊNH (SettingsLayout) chứ không còn trong trang này, nên trang chỉ còn
  // hai nhóm nội dung:
  //   trái  — vặn cái gì (giao diện, mật độ, cỡ chữ, hồ sơ);
  //   phải  — tình trạng dữ liệu (tỷ giá).
  //
  // Dưới `lg` không có cột trái, nên danh sách mục vẫn phải ở TRONG trang — đó là khối
  // `lg:hidden` ngay dưới đây, vẽ từ cùng một mảng SETTINGS_NAV.
  //
  // Vì sao chia cột chứ không nới một cột cho rộng: kéo rộng ra thì nhãn và ô bật/tắt rời
  // nhau hai đầu màn hình. Mỗi cột giữ bề rộng đọc được, còn các nhóm thì thôi xếp chồng
  // thành một mạch cuộn dài mấy màn.
  return (
    <div className="flex w-full flex-col gap-3 p-3 lg:p-6">
      <PageHeader title="Cài đặt" flush />

      {isDemoMode && (
        <div className="rounded-lg border border-state-warn-border bg-state-warn-bg p-3 text-sm text-state-warn-fg">
          <p className="font-semibold">Chế độ demo</p>
          <p className="mt-1">
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
            className="mt-2 min-h-11 rounded-md border border-state-warn-border px-3 py-1.5 text-sm font-medium text-state-warn-fg transition hover:bg-state-warn-bg"
          >
            Xóa dữ liệu demo
          </button>
        </div>
      )}

      {/* DANH SÁCH MỤC — chỉ dưới `lg`. Từ `lg` nó là cột trái cố định của
          SettingsLayout, và để cả hai cùng hiện là hai bản sao của một menu cách nhau
          60px trên cùng một màn.
          Nhóm tài sản, Nợ/cho vay và Giao dịch định kỳ TỪNG nằm trong khối này. Đã dời
          sang đúng ngữ cảnh (Tài sản / Sổ) vì chúng là dữ liệu tài chính thật, không phải
          cấu hình — xem docs/information-architecture.md §1.1. */}
      <section className="overflow-hidden rounded-lg border border-border-panel bg-surface lg:hidden">
        <SectionTitle className="px-3 pt-3">Quản lý</SectionTitle>
        <div className="mt-1 divide-y divide-border-subtle">
          {SETTINGS_NAV.filter((item) => !item.index).map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="flex min-h-12 items-center gap-3 px-3 py-3 text-sm text-fg-primary transition hover:bg-surface-sunken"
            >
              <item.Icon className="h-5 w-5 shrink-0 text-fg-muted" />
              <span className="min-w-0 flex-1">
                <span className="block">{item.label}</span>
                {item.hint && <span className="block text-sm text-fg-muted">{item.hint}</span>}
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 text-fg-muted" />
            </Link>
          ))}
        </div>
      </section>

      {/* Lưới hai cột. `xl` chứ không `lg`: từ `lg` cột trái của khung đã lấy 15rem, chia
          tiếp ở 1024px là cột giữa hẹp hơn cả bản một cột cũ. items-start để cột ngắn
          không bị kéo cao bằng cột dài.
          Bề rộng theo REM chứ px (§13): ở cỡ chữ "Rất lớn" cột px cứng giữ nguyên trong
          khi chữ trong nó to ra. 21.25rem là đúng 340px ở cỡ chữ thường. */}
      <div className="flex flex-col gap-3 xl:grid xl:grid-cols-[1fr_21.25rem] xl:items-start">
        {/* TRÁI — vặn cái gì */}
        <div className="flex flex-col gap-3">
          <ThemeToggle />

          <DensityToggle />

          <FontSizeToggle />

          <section className="overflow-hidden rounded-lg border border-border-panel bg-surface">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="flex min-h-12 w-full items-center gap-3 px-3 py-3 text-left transition hover:bg-surface-sunken"
            >
              <UserRound className="h-5 w-5 text-fg-muted" />
              <span className="flex-1">
                <span className="block text-sm text-fg-primary">{profile?.display_name ?? '—'}</span>
                <span className="block text-sm text-fg-muted">
                  Tháng bắt đầu ngày {profile?.month_start_day ?? 1} · Tiền gốc {profile?.base_currency ?? '—'}
                </span>
              </span>
              <ChevronRight className="h-5 w-5 text-fg-muted" />
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
                  className="min-h-11 rounded-md border border-state-bad-border px-3 py-1.5 text-sm text-state-bad-fg transition hover:bg-state-bad-bg"
                >
                  Đăng xuất
                </button>
              </div>
            )}
          </section>

        </div>

        {/* PHẢI — tình trạng dữ liệu */}
        <div className="flex flex-col gap-3">
          {rateLines.length > 0 && (
            <Card as="section" className="overflow-hidden">
              <div className="flex items-start gap-3">
                <ArrowLeftRight className="mt-0.5 h-5 w-5 shrink-0 text-fg-muted" />
                <div className="flex-1">
                  {/* h2 để có tên landmark cho <Card as="section">, đồng bộ với khối "Quản
                      lý" — nhưng KHÔNG copy class px-3 pt-3 của khối đó: Card đã có p-3
                      sẵn, copy vào sẽ đúp lề. */}
                  <SectionTitle>Tỷ giá quy đổi</SectionTitle>
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
                    <div className="mt-2 rounded-md border border-state-warn-border bg-state-warn-bg p-2">
                      <p className="text-sm text-state-warn-fg">
                        Cập nhật {rateAge.age} — mạng hoặc nguồn tỷ giá đang lỗi, số quy đổi có
                        thể sai.
                      </p>
                      <button
                        type="button"
                        disabled={ratesFetching > 0}
                        onClick={() => qc.invalidateQueries({ queryKey: ['rates'] })}
                        className="mt-2 min-h-11 rounded-md border border-state-warn-border px-3 py-1.5 text-sm font-medium text-state-warn-fg transition hover:bg-state-warn-bg disabled:opacity-50"
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

        </div>
      </div>

      {editing && profile && <ProfileEditSheet profile={profile} onClose={() => setEditing(false)} />}
    </div>
  )
}
