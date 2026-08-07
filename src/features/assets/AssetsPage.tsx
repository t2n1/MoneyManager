// Vỏ tab Tài sản — chia theo ba câu hỏi khác nhau mà trang này phải trả lời, thay vì
// cuộn cả ba trong một mạch 780 dòng như trước:
//   Hiện tại  — "giờ tôi có bao nhiêu"      (số dư, ròng, thẻ đến hạn, cơ cấu)
//   Diễn biến — "tôi đang tiến bộ không"    (lịch sử ròng, hiệu quả đầu tư, mục tiêu)
//   Tương lai — "sau này thế nào"           (Lifetime)
// Xem docs/information-architecture.md §2.3.
import { lazy, Suspense, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Settings2 } from 'lucide-react'
import { DataFreshness } from '../../components/DataFreshness'
import { PrivacyToggle } from '../../components/PrivacyToggle'
import { SegmentedControl, type SegmentedItem } from '../../components/ui'
import { useAssetsFreshness } from '../../hooks/useDataFreshness'
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

type AssetsView = 'now' | 'trend' | 'future'

const VIEW_TABS: readonly SegmentedItem<AssetsView>[] = [
  { value: 'now', label: 'Hiện tại' },
  { value: 'trend', label: 'Diễn biến' },
  { value: 'future', label: 'Tương lai' },
]

const isView = (v: string | null): v is AssetsView => VIEW_TABS.some((t) => t.value === v)

const Loading = () => <p className="py-10 text-center text-sm text-fg-muted">Đang tải…</p>

export function AssetsPage() {
  const freshness = useAssetsFreshness()
  // "Xem thử bằng tiền khác" — sống ở vỏ trang để hai tab Hiện tại/Diễn biến dùng
  // chung một lựa chọn (đổi ở tab này, qua tab kia vẫn giữ). null = theo tiền gốc;
  // không lưu vì chỉ là ước chừng. Tab Tương lai KHÔNG theo nút này — Lifetime có
  // "tiền hiển thị" riêng theo kịch bản với tỷ giá giả định tự khai.
  const [viewCur, setViewCur] = useState<CurrencyCode | null>(null)
  // Giữ tab trong URL (không phải useState) để link chia sẻ và đường chuyển tiếp
  // `/lifetime` → `/assets?view=future` mở đúng tab.
  const [searchParams, setSearchParams] = useSearchParams()
  const raw = searchParams.get('view')
  const view: AssetsView = isView(raw) ? raw : 'now'
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
        {/* "Quản lý nhóm" chỉ cấu hình cách cắt lát của tab Hiện tại — ở hai tab kia nó
            là nút không liên quan tới thứ đang xem. */}
        {view === 'now' && (
          <Link
            to="/assets/groups"
            className="inline-flex items-center gap-1 rounded-lg bg-surface px-3 py-1.5 text-xs font-medium text-fg-secondary shadow-sm active:scale-95"
          >
            <Settings2 className="h-4 w-4" /> Quản lý nhóm
          </Link>
        )}
      </div>

      {/* Tuổi dữ liệu đứng NGAY DƯỚI tiêu đề, trên nút gạt tab: cả ba tab đều đọc cùng
          tỷ giá và cùng bảng giá cổ phiếu, nên đây là thông tin của cả trang. */}
      <DataFreshness summary={freshness} />

      <SegmentedControl
        items={VIEW_TABS}
        value={view}
        onChange={setView}
        label="Nội dung trang Tài sản"
      />

      {view === 'now' && <AssetsNowView viewCur={viewCur} onViewCurChange={setViewCur} />}
      {view === 'trend' && (
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
