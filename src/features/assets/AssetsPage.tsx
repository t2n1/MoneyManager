// Vỏ tab Tài sản — chia theo ba câu hỏi khác nhau mà trang này phải trả lời:
//   Hôm nay        — "giờ tôi có bao nhiêu"   (AssetsNowView, bản vẽ 2a)
//   Theo thời gian — "tôi đang tiến bộ không" (AssetsTrendView, bản vẽ 2b)
//   Tương lai      — "sau này thế nào"        (LifetimeView)
// Xem docs/information-architecture.md §2.3.
import { lazy, Suspense, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { LineChart, Settings2 } from 'lucide-react'
import { PrivacyToggle } from '../../components/PrivacyToggle'
import { iconButtonClass, SegmentedControl, type SegmentedItem } from '../../components/ui'
import { useAccounts, useRates } from '../../hooks/queries'
import { toISODate } from '../../lib/dates'
import type { CurrencyCode } from '../../lib/money'
import { AssetsNowView } from './AssetsNowView'
import { ASSETS_RANGES, rangeSpan, spanLabel, type AssetsRange } from './assetsRange'
import { CurrencyViewToggle } from './CurrencyViewToggle'

// Hai màn kia ít mở hơn màn mặc định, và Lifetime kéo theo 8 module tính toán riêng →
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
 * "Theo thời gian" không mất — nó thôi làm một TAB và thành một CÔNG TẮC cạnh tab Hiện
 * tại. Lý do: ba tab bắt người dùng chọn giữa "giờ tôi có bao nhiêu" và "tôi đang tiến
 * bộ không" trước khi biết mình cần cái nào, trong khi hai câu đó nói về CÙNG một danh
 * sách tài khoản.
 */
type AssetsView = 'now' | 'future'

const VIEW_TABS: readonly SegmentedItem<AssetsView>[] = [
  { value: 'now', label: 'Hiện tại' },
  { value: 'future', label: 'Tương lai' },
]

/**
 * Công tắc của tab Hiện tại (§4.4).
 *
 * Nhãn là "Theo thời gian", KHÔNG phải "6 tháng" và cũng không còn là "Diễn biến".
 *
 * "6 tháng" là nhãn đầu tiên và nó hứa một khoảng cắt không tồn tại — các khối bên trong
 * vẽ TRỌN lịch sử, nên người có 2 năm dữ liệu sẽ tưởng mình đang xem 6 tháng cuối. Sửa
 * lần đầu bằng cách đổi sang "Diễn biến", tức bỏ hẳn con số. Bản vẽ 2b sửa theo chiều
 * ngược lại và đúng hơn: cho cắt THẬT bằng dải 1 th / 3 th / 12 th / Từ đầu, rồi NÓI RA
 * khoảng đang cắt kèm số tháng thật sự có dữ liệu ("10-2024 → 08-2026 · 23 tháng"). Nhãn
 * công tắc vì thế phải nói về TRỤC THỜI GIAN, không phải về "diễn biến" chung chung.
 */
type AssetsMode = 'today' | 'trend'

const MODE_TABS: readonly SegmentedItem<AssetsMode>[] = [
  { value: 'today', label: 'Hôm nay' },
  { value: 'trend', label: 'Theo thời gian' },
]

const RANGE_TABS: readonly SegmentedItem<AssetsRange>[] = ASSETS_RANGES.map((r) => ({
  value: r.value,
  label: r.label,
}))

/**
 * Đường CŨ → tab mới. `?view=trend` (cùng mọi bookmark và lịch sử trình duyệt) phải mở
 * tab Hiện tại ở chế độ THEO THỜI GIAN — mở đúng tab mà sai chế độ là người dùng thấy
 * một màn thiếu hẳn những khối họ đang tìm, và không có gì báo.
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
  // thì tệ hơn là không có icon. useAccounts đã nằm trong cache nên đây không thêm lượt
  // gọi mạng nào.
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
  // "Xem thử bằng tiền khác" — sống ở vỏ trang để hai chế độ dùng chung một lựa chọn.
  // null = theo tiền gốc; không lưu vì chỉ là ước chừng. Tab Tương lai KHÔNG theo nút
  // này — Lifetime có "tiền hiển thị" riêng theo kịch bản với tỷ giá giả định tự khai.
  //
  // Nút đứng ở HEADER TRANG (bản vẽ 2a), không còn trong thẻ Tổng tài sản: thẻ đó đã
  // thành một ô của dải KPI, và một ô số 26px không có chỗ cho một bộ ba nút.
  const [viewCur, setViewCur] = useState<CurrencyCode | null>(null)
  // Vỏ trang chỉ cần `base` + `rates` để biết nút nào bấm được. Cố ý KHÔNG gọi
  // `useAssetsData()` ở đây: nó kéo theo cả `assetBreakdown` — một phép tính trên toàn bộ
  // số dư — và vỏ này render lại mỗi lần gạt công tắc.
  const { base, rates } = useRates()

  // Giữ tab trong URL (không phải useState) để link chia sẻ và đường chuyển tiếp
  // `/lifetime` → `/assets?view=future` mở đúng tab.
  const [searchParams, setSearchParams] = useSearchParams()
  const raw = searchParams.get('view')
  const migrated = migrateAssetsView(raw)
  const view = migrated.view
  // Chế độ sống ở state chứ không ở URL: nó là cách NHÌN, không phải chỗ đứng.
  const [mode, setMode] = useState<AssetsMode>(migrated.mode)
  // Khoảng thời gian mặc định là "Từ đầu": người mở màn này lần đầu chưa biết sổ mình dài
  // bao nhiêu, và một cửa sổ 12 tháng đóng sẵn sẽ CẮT MẤT phần lịch sử họ chưa biết là có.
  const [range, setRange] = useState<AssetsRange>('all')

  const todayISO = toISODate(new Date())
  const span = useMemo(() => rangeSpan(range, todayISO), [range, todayISO])

  const setView = (v: AssetsView) =>
    setSearchParams(
      (prev) => {
        prev.set('view', v)
        return prev
      },
      { replace: true },
    )

  return (
    <div className="flex flex-col gap-3 p-3 lg:p-6">
      {/* MỘT hàng đầu trang, ba nhóm: tên trang · hai dải chọn · các nút phụ.
          Trước đây tên trang và các dải nằm ở hai hàng khác nhau, tức 88px chiều cao cho
          một chữ "Tài sản" và bốn cái nút. `flex-wrap` lo phần dưới lg. */}
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-bold text-fg-primary">Tài sản</h1>

        {/* Tab và công tắc đứng CÙNG một hàng (§4.4): chúng là hai trục của cùng một câu
            hỏi — xem cái gì, và xem ở độ sâu nào. Xếp dọc thì trông như hai cấp điều
            hướng lồng nhau. */}
        <SegmentedControl
          items={VIEW_TABS}
          value={view}
          onChange={setView}
          label="Nội dung trang Tài sản"
          stretch={false}
          size="sm"
        />
        {/* Chỉ tab Hiện tại có trục này. Tương lai vốn đã là bản chiếu nhiều chục năm —
            một công tắc "hôm nay / theo thời gian" ở đó không có nghĩa gì. */}
        {view === 'now' && (
          <SegmentedControl
            items={MODE_TABS}
            value={mode}
            onChange={setMode}
            label="Cách xem"
            stretch={false}
            size="sm"
          />
        )}
        {/* Dải khoảng chỉ có nghĩa khi đang xem một trục thời gian. */}
        {view === 'now' && mode === 'trend' && (
          <>
            <SegmentedControl
              items={RANGE_TABS}
              value={range}
              onChange={setRange}
              label="Khoảng thời gian"
              stretch={false}
              size="sm"
            />
            {/* Câu này nói về CÁI CẮT, không phải về lượng dữ liệu: ảnh chụp ròng, bản
                định giá và sổ giao dịch có ba mốc bắt đầu khác nhau, nên một con số gộp
                "sổ dài N tháng" ở đây sẽ sai với ít nhất một khối. Mỗi khối tự khai mốc
                đầu của mình — xem assetsRange.ts. */}
            <span className="text-2xs text-fg-muted">{spanLabel(span)}</span>
          </>
        )}

        <div className="ml-auto flex items-center gap-2">
          {/* Nút ¥/₫/$ đổi mọi con số của CẢ HAI chế độ. Không phải đổi base thật: chỉ
              ước chừng theo tỷ giá cache, có ≈ đi kèm. */}
          {view === 'now' && (
            <CurrencyViewToggle
              base={base}
              rates={rates}
              value={viewCur ?? base}
              onChange={setViewCur}
            />
          )}
          {/* `lg:hidden`: từ lg khung app đã có đúng nút này ở top bar (AppTopBar dựng
              `hidden … lg:flex`), nên để nó ở đây nữa là hai con mắt cạnh nhau làm cùng
              một việc — đo thật trên 1280 thì chúng cách nhau 12px. Dưới lg top bar không
              có, và trang này là chỗ DUY NHẤT trong app còn nút che số, nên bỏ hẳn là mất
              tính năng trên điện thoại. */}
          {/* Truyền TRỌN chuỗi class: `PrivacyToggle` dùng `className ?? mặc-định`, nên
              đưa vào một lớp lẻ là THAY hết dáng chứ không cộng thêm. 36px giữ nguyên
              vùng chạm của bản trước (h-9 w-9), chỉ đổi bề mặt sang viền cho khớp hai
              control đứng cạnh. */}
          <PrivacyToggle className="flex h-9 w-9 items-center justify-center rounded-md border border-border-strong text-fg-muted transition active:scale-95 lg:hidden" />
          {/* Danh mục đầu tư là trang riêng, không phải tab con: nó gộp MỌI tài khoản đầu
              tư (cổ phiếu VN và quỹ Nhật) nên không thuộc về chế độ nào hơn chế độ nào. */}
          {hasPortfolio && (
            <Link to="/invest" className={iconButtonClass()} aria-label="Danh mục đầu tư">
              <LineChart className="h-5 w-5" />
            </Link>
          )}
          {/* "Quản lý nhóm" chỉ cấu hình cách cắt lát của bảng tài khoản — ở tab Tương lai
              nó là nút không liên quan tới thứ đang xem. */}
          {view === 'now' && (
            <Link
              to="/assets/groups"
              className="inline-flex items-center gap-1 rounded-md border border-border-strong px-3 py-1.5 text-xs font-medium text-fg-secondary transition active:scale-95"
            >
              <Settings2 className="h-4 w-4" /> Quản lý nhóm
            </Link>
          )}
        </div>
      </div>

      {view === 'now' && mode === 'today' && <AssetsNowView viewCur={viewCur} />}
      {view === 'now' && mode === 'trend' && (
        <Suspense fallback={<Loading />}>
          <AssetsTrendView viewCur={viewCur} range={range} span={span} />
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
