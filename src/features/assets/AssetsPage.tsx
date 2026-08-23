// Vỏ tab Tài sản — chia theo ba câu hỏi khác nhau mà trang này phải trả lời, thay vì
// cuộn cả ba trong một mạch 780 dòng như trước:
//   Hiện tại  — "giờ tôi có bao nhiêu"      (số dư, thẻ đến hạn, ròng, cơ cấu)
//   Diễn biến — "tôi đang tiến bộ không"    (lịch sử ròng, hiệu quả đầu tư, mục tiêu)
//   Tương lai — "sau này thế nào"           (Lifetime)
// Xem docs/information-architecture.md §2.3.
import { lazy, Suspense, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { LineChart, Settings2 } from 'lucide-react'
import { PrivacyToggle } from '../../components/PrivacyToggle'
import { iconButtonClass, SegmentedControl, type SegmentedItem } from '../../components/ui'
import { useAccounts } from '../../hooks/queries'
import type { CurrencyCode } from '../../lib/money'
import { AssetsNowView } from './AssetsNowView'

// Hai tab kia ít mở hơn tab mặc định, và Lifetime kéo theo 8 module tính toán riêng →
// lazy để mở tab Tài sản không phải tải cả ba.
const AssetsTrendView = lazy(() =>
  import('./AssetsTrendView').then((m) => ({ default: m.AssetsTrendView })),
)
const LifetimeView = lazy(() =>
  import('../lifetime/LifetimeView').then((m) => ({ default: m.LifetimeView })),
)

/**
 * HAI tab (§4.4 của bản 1a, thiết kế chốt 20a), thay ba.
 *
 * "Diễn biến" không mất — nó thôi làm một TAB và thành một CÔNG TẮC cạnh tab Hiện
 * tại, giữ nguyên tên. Lý do: ba tab bắt người dùng chọn giữa "giờ tôi có bao nhiêu" và
 * "tôi đang tiến bộ không" trước khi biết mình cần cái nào, trong khi hai câu đó nói
 * về CÙNG một danh sách tài khoản — chỉ khác cột số. Công tắc giữ nguyên vị trí mọi
 * khối và chỉ thêm phần theo thời gian.
 */
type AssetsView = 'now' | 'future'

const VIEW_TABS: readonly SegmentedItem<AssetsView>[] = [
  { value: 'now', label: 'Hiện tại' },
  { value: 'future', label: 'Tương lai' },
]

/**
 * Công tắc của tab Hiện tại (§4.4).
 *
 * Nhãn là "Diễn biến", KHÔNG phải "6 tháng": công tắc này không cắt cửa sổ thời gian nào
 * cả. Bốn khối nó chèn thêm đều vẽ TRỌN lịch sử đang có (`NetWorthHistorySection` vẽ hết
 * mảng snapshot, XIRR tính từ giao dịch đầu tiên). Nhãn "6 tháng" hứa một khoảng cắt
 * không tồn tại — người có 2 năm dữ liệu sẽ tưởng mình đang xem 6 tháng cuối.
 */
type AssetsMode = 'today' | 'trend'

const MODE_TABS: readonly SegmentedItem<AssetsMode>[] = [
  { value: 'today', label: 'Hôm nay' },
  { value: 'trend', label: 'Diễn biến' },
]

/**
 * Đường CŨ → tab mới. `?view=trend` (tab Diễn biến, cùng mọi bookmark và lịch sử trình
 * duyệt) phải mở tab Hiện tại ở chế độ DIỄN BIẾN — mở đúng tab mà sai chế độ là người
 * dùng thấy một màn thiếu hẳn bốn khối họ đang tìm, và không có gì báo. Đây đúng loại
 * "hỏng im lặng" mà R3 cảnh báo khi gộp tab.
 */
export function migrateAssetsView(raw: string | null): { view: AssetsView; mode: AssetsMode } {
  if (raw === 'trend') return { view: 'now', mode: 'trend' }
  if (raw === 'future') return { view: 'future', mode: 'today' }
  return { view: 'now', mode: 'today' }
}

const Loading = () => <p className="py-10 text-center text-sm text-fg-muted">Đang tải…</p>

export function AssetsPage() {
  // Lối vào trang Đầu tư. Điều kiện phải TRÙNG KHÍT hợp của hai tab (useInvestData cho
  // VND, useFundInvestData cho JPY) — icon dẫn tới một trang nói "chưa có tài khoản nào"
  // thì tệ hơn là không có icon. useAccounts đã nằm trong cache của tab Hiện tại nên đây
  // không thêm lượt gọi mạng nào.
  const { data: accounts = [] } = useAccounts()
  const hasPortfolio = useMemo(
    () =>
      accounts.some(
        (a) =>
          a.type === 'investment' &&
          (a.currency === 'VND' || a.currency === 'JPY') &&
          !a.is_archived,
      ),
    [accounts],
  )
  // "Xem thử bằng tiền khác" — sống ở vỏ trang để hai tab Hiện tại/Diễn biến dùng
  // chung một lựa chọn (đổi ở tab này, qua tab kia vẫn giữ). null = theo tiền gốc;
  // không lưu vì chỉ là ước chừng. Tab Tương lai KHÔNG theo nút này — Lifetime có
  // "tiền hiển thị" riêng theo kịch bản với tỷ giá giả định tự khai.
  const [viewCur, setViewCur] = useState<CurrencyCode | null>(null)
  // Giữ tab trong URL (không phải useState) để link chia sẻ và đường chuyển tiếp
  // `/lifetime` → `/assets?view=future` mở đúng tab.
  const [searchParams, setSearchParams] = useSearchParams()
  const raw = searchParams.get('view')
  const migrated = migrateAssetsView(raw)
  const view = migrated.view
  // Chế độ sống ở state chứ không ở URL: nó là cách NHÌN, không phải chỗ đứng. Khởi
  // tạo từ đường cũ để `?view=trend` mở ra đúng thứ nó vẫn mở.
  const [mode, setMode] = useState<AssetsMode>(migrated.mode)
  const setView = (v: AssetsView) =>
    setSearchParams(
      (prev) => {
        prev.set('view', v)
        return prev
      },
      { replace: true },
    )

  return (
    <div className="flex flex-col gap-4 p-3 lg:p-6">
      <div className="flex items-center gap-2">
        <h1 className="flex-1 text-lg font-bold text-fg-primary">Tài sản</h1>
        <PrivacyToggle />
        {/* Danh mục đầu tư là trang riêng, không phải tab con: nó gộp MỌI tài khoản đầu
            tư (cổ phiếu VN và quỹ Nhật, mỗi loại một tab) nên không thuộc về "Hiện tại"
            hay "Diễn biến" hơn cái nào. Đặt icon ở header giống /planned và /recurring ở
            tab Sổ — trước đây chỉ vào được bằng link 11px nằm sâu hai lớp. */}
        {hasPortfolio && (
          <Link to="/invest" className={iconButtonClass()} aria-label="Danh mục đầu tư">
            <LineChart className="h-5 w-5" />
          </Link>
        )}
        {/* "Quản lý nhóm" chỉ cấu hình cách cắt lát của tab Hiện tại — ở hai tab kia nó
            là nút không liên quan tới thứ đang xem. */}
        {view === 'now' && (
          <Link
            to="/assets/groups"
            className="inline-flex items-center gap-1 rounded-lg bg-surface px-3 py-1.5 text-xs font-medium text-fg-secondary shadow-sm transition active:scale-95"
          >
            <Settings2 className="h-4 w-4" /> Quản lý nhóm
          </Link>
        )}
      </div>

      {/* Tab và công tắc đứng CÙNG một hàng (§4.4: "công tắc ngay cạnh tab"): chúng là
          hai trục của cùng một câu hỏi — xem cái gì, và xem ở độ sâu nào. Xếp dọc hai
          dải thì trông như hai cấp điều hướng lồng nhau. */}
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl
          items={VIEW_TABS}
          value={view}
          onChange={setView}
          label="Nội dung trang Tài sản"
          stretch={false}
        />
        {/* Chỉ tab Hiện tại có trục này. Tương lai vốn đã là bản chiếu nhiều chục năm —
            một công tắc "hôm nay / diễn biến" ở đó không có nghĩa gì. */}
        {view === 'now' && (
          <SegmentedControl
            items={MODE_TABS}
            value={mode}
            onChange={setMode}
            label="Cách xem"
            stretch={false}
          />
        )}
      </div>

      {view === 'now' && <AssetsNowView viewCur={viewCur} onViewCurChange={setViewCur} />}
      {/* Chế độ Diễn biến CHÈN THÊM bốn khối theo thời gian xuống dưới, không thay khối
          nào: §4.4 chốt "giữ nguyên vị trí mọi khối và chỉ đổi cột số", và hai khối dài
          hạn (Hiệu quả đầu tư · Mục tiêu) chỉ hiện ở chế độ này. Nhờ vậy gạt công tắc
          không làm trang nhảy — phần trên đứng yên, phần dưới mọc ra. */}
      {view === 'now' && mode === 'trend' && (
        <Suspense fallback={<Loading />}>
          <AssetsTrendView viewCur={viewCur} onViewCurChange={setViewCur} />
        </Suspense>
      )}
      {view === 'future' && (
        <Suspense fallback={<Loading />}>
          <LifetimeView />
        </Suspense>
      )}
    </div>
  )
}
