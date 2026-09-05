// Top bar 52px — nửa còn lại của khung app desktop (§3 của bản 1a). Chỉ có từ `lg`:
// ở mobile mỗi màn tự mang tiêu đề của nó (bản vẽ 17a), một thanh 52px chứa tiêu đề +
// tháng + ô tìm + tuổi dữ liệu + nút chính thì không xếp nổi vào 390px.
//
// Thứ tự đọc từ trái sang: ĐANG Ở ĐÂU (tiêu đề) → ĐANG XEM KỲ NÀO (bộ đổi tháng) →
// TÌM → SỐ NÀY CŨ CHƯA (tuổi dữ liệu) → LÀM GÌ TIẾP (nút chính). Bốn câu hỏi đầu là
// trạng thái, câu cuối là hành động, nên nút chính đứng riêng ở mép phải.
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Plus, Search } from 'lucide-react'
import { formatMonthLabel } from '../lib/dates'
import { useMonthKey } from '../hooks/useMonthKey'
import { useDataFreshness } from '../hooks/useDataFreshness'
import { DataFreshness } from './DataFreshness'
import { PrivacyToggle } from './PrivacyToggle'
import { NotificationBell } from '../features/notifications/NotificationBell'
import { NotificationBoundary } from '../features/notifications/NotificationBoundary'
import { topBarTitle, usesMonth } from './navItems'
import { useOpenEntryOverlay } from '../lib/entryOverlay'

/** Nút ‹ › của bộ đổi tháng — hai đầu của MỘT viên pill liền khối (redesign 2), ngăn
 *  với nhãn tháng bằng kẻ dọc thay vì đứng rời. 32px, chỉ dùng bằng chuột. */
const STEP_BTN =
  'flex h-8 w-8 items-center justify-center text-fg-muted transition hover:bg-surface-sunken hover:text-fg-primary'

export function AppTopBar() {
  const location = useLocation()
  const navigate = useNavigate()
  const openEntry = useOpenEntryOverlay()
  const { activeMonthKey, stepMonth } = useMonthKey()
  const freshness = useDataFreshness()
  const [q, setQ] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  // ⌘K / Ctrl+K đưa con trỏ vào ô tìm. Không chặn khi đang gõ ở ô khác: tổ hợp có
  // phím lệnh nên không đụng vào việc nhập chữ, và người đang gõ trong một sheet vẫn
  // có quyền nhảy sang tìm kiếm.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key.toLowerCase() !== 'k' || !(e.metaKey || e.ctrlKey)) return
      e.preventDefault()
      searchRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const title = topBarTitle(location.pathname)

  return (
    <header className="hidden h-14 shrink-0 items-center gap-4 border-b border-border-panel bg-surface-chrome px-5 lg:flex print:hidden">
      {/* <p> chứ KHÔNG <h1>. Thử <h1> trước rồi bỏ: gần như MỌI trang đã tự có <h1> của
          nó (18 chỗ — "Tài sản", "Tài khoản", "Nợ / cho vay"…), nên top bar thành h1 nữa
          là hai h1 hiện cùng lúc trên hầu hết route — đúng cái ReportsPage đã ghi chú
          tránh. Top bar là KHUNG: nó nói "đang ở đâu", còn tiêu đề tài liệu vẫn thuộc về
          trang. Hai trang bỏ h1 nhìn thấy được (Sổ, Ngân sách — h1 của chúng vốn là nhãn
          tháng, nay nằm trên thanh này) đã thêm h1 sr-only để cây tiêu đề không thủng.

          min-w giữ mọi thứ phía sau đứng yên khi đổi trang: tiêu đề dài ngắn khác nhau
          mà không chốt bề rộng thì ô tìm kiếm nhảy ngang mỗi lần điều hướng. */}
      <p className="min-w-24 shrink-0 text-sm font-bold text-fg-primary">{title}</p>

      {usesMonth(location.pathname) && (
        <div className="flex shrink-0 items-center overflow-hidden rounded-full border border-border-strong bg-surface">
          <button
            type="button"
            onClick={() => stepMonth(-1)}
            aria-label="Tháng trước"
            className={`${STEP_BTN} border-r border-border-subtle`}
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={1.8} />
          </button>
          {/* Mã tháng đi bằng mono như mọi con số khác (§1.2) — nó là dữ liệu, và ở
              dạng mono thì bề ngang không đổi khi bấm qua các tháng. */}
          <span className="px-3.5 font-mono text-sm font-medium text-fg-primary">
            {formatMonthLabel(activeMonthKey)}
          </span>
          <button
            type="button"
            onClick={() => stepMonth(1)}
            aria-label="Tháng sau"
            className={`${STEP_BTN} border-l border-border-subtle`}
          >
            <ChevronRight className="h-4 w-4" strokeWidth={1.8} />
          </button>
        </div>
      )}

      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault()
          navigate(q.trim() ? `/search?q=${encodeURIComponent(q.trim())}` : '/search')
        }}
        className="flex h-8 min-w-0 max-w-[26.25rem] flex-1 items-center gap-2 rounded-full border border-border-panel bg-surface px-3.5"
      >
        <Search className="h-[0.9375rem] w-[0.9375rem] shrink-0 text-fg-muted" strokeWidth={1.6} />
        <input
          ref={searchRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Tìm giao dịch"
          aria-label="Tìm giao dịch"
          className="min-w-0 flex-1 bg-transparent text-sm text-fg-primary placeholder:text-fg-muted"
        />
        {/* Nhắc phím tắt, không phải nút. aria-hidden vì trình đọc màn hình đọc "⌘K"
            thành một chuỗi vô nghĩa, mà ô đã có nhãn rồi. */}
        <kbd
          aria-hidden
          className="shrink-0 rounded-md border border-border-strong px-1 py-px font-mono text-2xs text-fg-muted"
        >
          ⌘K
        </kbd>
      </form>

      {/* Tuổi dữ liệu: ẩn dưới xl vì ở 1024–1280 nó đẩy nút chính ra khỏi thanh. Không
          mất thông tin — AppFooter vẫn in dòng này ở cuối mỗi trang, và ở đó nó là bản
          đầy đủ cho cả mobile. */}
      <span className="ml-auto hidden shrink-0 font-mono text-2xs text-fg-muted xl:inline-flex">
        <DataFreshness summary={freshness} />
      </span>

      <div className="ml-auto flex shrink-0 items-center gap-1 xl:ml-0">
        <NotificationBoundary>
          <NotificationBell />
        </NotificationBoundary>
        <PrivacyToggle className="flex h-8 w-8 items-center justify-center rounded-full border border-border-panel bg-surface text-fg-secondary transition hover:bg-surface-sunken hover:text-fg-primary" />
        {/* Nút 32px — dáng RIÊNG của top bar, không phải <ActionButton>. Sàn vùng chạm
            44px của app là ngưỡng ngón tay; thanh này chỉ có từ lg trở lên nên thiết bị
            trỏ là chuột, ngưỡng WCAG 2.5.8 ở đó là 24px. */}
        {/* Nút này mở màn nhập dưới dạng LỚP PHỦ, không chuyển trang: thanh trên chỉ
            có từ 1024px (`hidden … lg:flex` ở gốc file) nên đây đúng là "máy tính", còn
            nút "+" của thanh tab dưới (`lg:hidden`) vẫn vào trang đầy đủ như cũ.
            Xem src/lib/entryOverlay.ts. */}
        <button
          type="button"
          onClick={openEntry}
          className="ml-1 flex h-8 items-center gap-1.5 rounded-full bg-accent px-4 text-sm font-bold text-fg-on-accent transition active:scale-95"
        >
          <Plus className="h-[0.9375rem] w-[0.9375rem]" strokeWidth={2.2} />
          Giao dịch
        </button>
      </div>
    </header>
  )
}
