import { lazy, Suspense, useEffect, useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { IconButton, SegmentedControl, type SegmentedItem } from '../../components/ui'
import { MonthStrip } from './MonthStrip'
import { MonthView } from './MonthView'
import {
  useAccounts,
  useProfile,
  useRangeTransactions,
  useRates,
  useTransferCategoryIds,
} from '../../hooks/queries'
import { useMonthKey } from '../../hooks/useMonthKey'
import { addMonths, formatMonthLabel, getMonthRange } from '../../lib/dates'
import type { CurrencyCode } from '../../lib/money'
import { monthlySeries } from './aggregate'

// Sức khỏe là 532 dòng tính toán mà 3 tab kia không cần — lazy để mở tab Biểu đồ (mặc
// định) không phải tải nó.
const HealthView = lazy(() =>
  import('../health/HealthView').then((m) => ({ default: m.HealthView })),
)

// Dài hạn tải 24 tháng dữ liệu và kéo theo recharts — lazy để mở tab Tháng này (mặc
// định) không phải tải nó.
const LongView = lazy(() => import('./LongView').then((m) => ({ default: m.LongView })))

// Quyết định đọc nợ + mục tiêu + 12 tháng giao dịch — lazy như hai tab kia.
const DecideView = lazy(() => import('./DecideView').then((m) => ({ default: m.DecideView })))

/**
 * BA tab (§4.5 của bản 1a), thay bốn tab × ba kỳ = 12 tổ hợp trước đây.
 *
 * Mười hai tổ hợp là con số thật, không phải cách nói: người dùng phải nhớ mình đang ở
 * ô nào của một lưới 4×3 mà lưới đó không hiện ra ở đâu cả, và 3/4 tab chỉ tồn tại ở
 * chế độ Tháng. Ba tab mới chia theo CÂU HỎI, mỗi tab tự chốt phạm vi của nó:
 *   · Tháng này — "tháng đang chạy thế nào": gộp Biểu đồ(Tháng) + Thấu hiểu.
 *   · Dài hạn   — "nhiều tháng/năm gộp lại nói gì": gộp Xu hướng + Biểu đồ(Năm) +
 *                 Nhiều năm, chọn phạm vi bằng một công tắc 12T · 3N · Tất cả.
 *   · Sức khỏe  — giữ nguyên.
 */
type ReportView = 'month' | 'long' | 'health' | 'decide'

/**
 * BỐN tab (bản 28a). Nhãn phải NGẮN: bốn mục là đúng trần của một hàng segmented ở 390px,
 * và "Tháng này" + "Sức khỏe" + "Quyết định" + "Dài hạn" chỉ vừa khi mỗi nhãn một từ.
 *
 * Tab thứ tư không phải một thẻ thêm vào ba tab cũ: ba tab kia chia theo KHOẢNG THỜI GIAN
 * và đều trả lời "đã xảy ra gì", nên khối "làm gì thì đổi được gì" cắt ngang cả ba.
 */
const VIEW_TABS: readonly SegmentedItem<ReportView>[] = [
  { value: 'month', label: 'Tháng' },
  { value: 'long', label: 'Dài hạn' },
  { value: 'health', label: 'Sức khỏe' },
  { value: 'decide', label: 'Quyết định' },
]

const isView = (v: string | null): v is ReportView => VIEW_TABS.some((t) => t.value === v)

// `LongScope` / `SCOPE_TABS` / `isScope` ĐÃ BỎ: 27a chốt công tắc phạm vi suy từ dữ liệu
// thật, nên danh sách mốc không dựng được ở tầng này (xem `longScopeOptions`). Khoá URL
// `?scope=` và `?period=` cũng đi cùng — chúng chỉ trỏ vào ba nhãn cứng không còn tồn tại.

/**
 * Đường CŨ → tab mới. Bookmark, lịch sử trình duyệt và link trong thông báo đẩy đều
 * còn mang `?view=charts|trends|insights` — bỏ qua là chúng hỏng IM LẶNG (mở ra tab
 * mặc định, không báo gì). R3 của bộ tài liệu ghi đúng rủi ro này.
 *
 * LỆCH CÓ CHỦ Ý so với bảng chuyển tiếp của REPORTS_REDESIGN §"Ràng buộc giữ nguyên" mục 6.
 * Tài liệu đó ghi `view=trend` → Tháng này. Ở đây nó → **Dài hạn**, vì:
 *
 *   · `?view=trends` trên trang Báo cáo trước nay LÀ tab xu hướng dài hạn (cửa sổ 24
 *     tháng, điểm gãy, mùa vụ). Tab Dài hạn của 27a là chỗ kế tục trực tiếp của nó — đưa
 *     một bookmark "xu hướng" về tab Tháng này là đưa người dùng tới một cửa sổ khác hẳn.
 *   · Mục 6 của CLAUDE_CODE_TASKS (bản gốc của cùng dòng này) ghi `view=trend` → *Hiện tại
 *     + công tắc 6 tháng*, mà "Hiện tại" là tab của màn **Tài sản**, không phải Báo cáo.
 *     Hai tài liệu nói hai đích khác nhau cho cùng một khoá, nên dòng ở REPORTS_REDESIGN
 *     đọc ra là bản chép lỡ của dòng kia.
 *   · Chính R3 chốt nguyên tắc: chuyển tiếp phải đưa tới CHỖ TƯƠNG ĐƯƠNG, không tới tab
 *     mặc định. Giữ →'long' là làm đúng nguyên tắc đó.
 *
 * Nếu quyết định lại theo đúng chữ của tài liệu thì đổi dòng dưới, KHÔNG xoá chú thích này.
 */
export function migrateReportView(view: string | null): ReportView | null {
  if (view === 'charts' || view === 'insights') return 'month'
  if (view === 'trends' || view === 'trend') return 'long'
  if (isView(view)) return view
  return null
}

// Mục lục của tab Tháng này giờ ở MonthView (khối 01–05 của bản 26a).


// `parseYm` chuyển sang src/hooks/useMonthKey.tsx — đường vào `?ym=` nay do provider
// đọc một lần cho cả app, thay vì mỗi trang một bản chép tay.

export function ReportsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  // `?scope=` và `?period=` KHÔNG còn đọc ở đây: công tắc phạm vi của tab Dài hạn nay
  // suy từ dữ liệu (24 tháng thì "3N" và "Tất cả" là hai nút giống nhau), nên số mốc
  // không biết trước ở tầng này. LongView tự giữ mốc đang chọn.
  // Tab giữ trong URL (không phải useState) — nếu không, đường chuyển tiếp
  // `/health` → `/reports?view=health` sẽ để `view=health` kẹt lại trong thanh địa chỉ:
  // bấm sang tab khác không xoá nó, và tải lại trang là quay về Sức khỏe dù đang xem
  // Biểu đồ. Cũng nhờ vậy mà link vào thẳng một tab luôn ăn, kể cả khi đã ở /reports.
  const view: ReportView = migrateReportView(searchParams.get('view')) ?? 'month'
  const setView = (v: ReportView) =>
    setSearchParams(
      (prev) => {
        prev.set('view', v)
        return prev
      },
      { replace: true },
    )

  // Chỉ tab Tháng này có kỳ để chuyển. Dài hạn và Sức khỏe tự chốt cửa sổ của chúng.

  const { data: profile } = useProfile()
  const monthStartDay = profile?.month_start_day ?? 1
  const { base, rates } = useRates()
  const transferIds = useTransferCategoryIds()
  const { data: accounts = [] } = useAccounts()

  const currencyOf = (id: string): CurrencyCode =>
    accounts.find((a) => a.id === id)?.currency ?? base

  // ----- Chế độ THÁNG -----
  // Kỳ đang xem là state DÙNG CHUNG cả app (src/hooks/useMonthKey), không còn của riêng
  // trang: bộ đổi tháng của bản 1a nằm trên top bar. Đường vào `?ym=` vẫn còn — provider
  // đọc nó, nên mọi link cũ (thông báo đẩy, `/reports?view=budget&ym=…`) vẫn mở đúng kỳ.
  const { activeMonthKey, setMonthKey, stepMonth } = useMonthKey()
  // Dải MonthStrip cần tổng chi sáu tháng để in số dưới mỗi nút. Đây là query DUY NHẤT
  // còn lại của chế độ Tháng ở trang này — mọi thứ khác đã xuống MonthView, và nó dùng
  // đúng cùng khoảng nên React Query trả từ cache, không gọi mạng lần hai.
  const sixMonths = useMemo(
    () => Array.from({ length: 6 }, (_, i) => addMonths(activeMonthKey, i - 5)),
    [activeMonthKey],
  )
  const sixMonthRange = useMemo(
    () => ({
      start: getMonthRange(sixMonths[0], monthStartDay).start,
      end: getMonthRange(activeMonthKey, monthStartDay).end,
    }),
    [sixMonths, activeMonthKey, monthStartDay],
  )
  const { data: rangeTxs = [], isFetched: rangeFetched } = useRangeTransactions(
    sixMonthRange,
    !!profile && view === 'month',
  )
  const stripSeries = useMemo(
    () => monthlySeries(rangeTxs, sixMonths, monthStartDay, currencyOf, base, rates ?? {}, transferIds),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rangeTxs, sixMonths, monthStartDay, accounts, base, rates, transferIds],
  )

  // Cảnh báo thiếu tỷ giá nay thuộc từng view (MonthView / LongView / HealthView) — mỗi
  // view sở hữu số của nó, và một cảnh báo ở trang cha thì không biết đang nói về tab nào.

  // In một lần cho mỗi lần mở trang. Cờ reset khi trang bị gỡ (rời khỏi /reports),
  // nên muốn in lại phải điều hướng vào lại — đủ cho luồng hiện tại (in từ trang Dữ liệu).
  const printedRef = useRef(false)
  const wantPrint = searchParams.get('print') === '1'
  const printDataReady = rangeFetched
  useEffect(() => {
    if (!wantPrint || printedRef.current || !printDataReady) return
    // Chờ biểu đồ (Recharts) vẽ xong rồi mới in. Đặt cờ TRONG timeout (không đặt
    // đồng bộ) để nếu StrictMode huỷ timeout lúc mount thì effect còn lên lịch lại được.
    const t = setTimeout(() => {
      printedRef.current = true
      window.print()
      // Gỡ cờ print khỏi URL để không in lại khi điều hướng nội bộ
      const next = new URLSearchParams(searchParams)
      next.delete('print')
      setSearchParams(next, { replace: true })
    }, 700)
    return () => clearTimeout(t)
  }, [wantPrint, printDataReady, view, searchParams, setSearchParams])

  return (
    <div className="flex flex-col gap-4 p-3 lg:p-6">
      {/* Tiêu đề trên màn hình — mọi trang khác đều mở đầu bằng tên trang 18px;
          Báo cáo là trang duy nhất từng mở thẳng bằng dải tab, phá nhịp và người
          dùng máy đọc màn hình không nghe được tên trang. Bản in có h1 riêng bên
          dưới (kèm kỳ đang xem) nên bản màn hình ẩn khi in. */}
      <h1 className="text-lg font-bold text-fg-primary print:hidden">Báo cáo</h1>
      {/* Tiêu đề chỉ hiện khi in (thay cho thanh điều hướng bị ẩn) */}
      <p className="hidden text-center text-xl font-bold text-gray-900 print:block">
        Báo cáo{' '}
        {view === 'month'
          ? formatMonthLabel(activeMonthKey)
          : view === 'long'
            ? 'dài hạn'
            : view === 'decide'
              ? 'quyết định'
              : 'sức khỏe'}
      </p>

      {/* Cảnh báo THIẾU tỷ giá ở lại đầu trang, không xuống chân trang cùng dòng tuổi dữ
          liệu: nó nói "số đang hiện bị thiếu", tức là đọc trước khi đọc số thì mới kịp.
          Tuổi dữ liệu là thông tin nền, đọc lúc nào cũng được. Đứng trên mọi dải điều
          khiển vì bốn khối bên dưới đều có điều kiện — nằm sau chúng thì mỗi lần gạt tab
          là cảnh báo lại nhảy sang một độ cao khác. */}
      {/* Tab nội dung đứng TRƯỚC mọi điều khiển kỳ, và luôn đủ 4 mục.
          Trước đây dải này nằm DƯỚI nút gạt Tháng|Năm và tự ẩn khi gạt sang Năm (vì 3/4
          tab chỉ tồn tại ở chế độ Tháng) — tức đổi kỳ là mất luôn thanh điều hướng, và
          layout nhảy. Nay thứ bậc đúng chiều: tab = "đang xem cái gì" (đứng yên), điều
          khiển kỳ = "lát nào" (đổi theo tab). Xem docs/information-architecture.md §2.4. */}
      {/* stretch="lg": từ desktop dải này CO theo chữ (326px) thay vì giãn hết hàng. Ở
          1920px bản giãn rộng ~1844px, mỗi nhãn nằm giữa một ô 460px — bấm được nhưng
          đọc ra bốn cái băng rời rạc, không ra một bộ chọn. Điện thoại vẫn giãn (xem
          stretchClasses), và ba dải tab cấp trang còn lại — Sổ, Phạm vi, Đầu tư — dùng
          cùng chế độ này. */}
      <SegmentedControl
        items={VIEW_TABS}
        value={view}
        onChange={setView}
        label="Nội dung báo cáo"
        stretch="lg"
        className="print:hidden"
      />

      {/* Mũi tên đổi tháng — CHỈ ở tab Tháng này, và chỉ dưới `lg` (top bar của bản 1a có
          bộ đổi tháng riêng ở desktop). Tab Dài hạn KHÔNG còn dải điều hướng năm: 27a bỏ
          nó vì nó là khoảng thời gian thứ ba trên một màn đã có hai. */}
      {view === 'month' && (
        <div className="flex items-center justify-between print:hidden lg:hidden">
          <IconButton onClick={() => stepMonth(-1)} aria-label="Kỳ trước">
            <ChevronLeft className="h-5 w-5" strokeWidth={1.6} />
          </IconButton>
          <p aria-live="polite" className="text-lg font-bold text-fg-primary">
            {formatMonthLabel(activeMonthKey)}
          </p>
          <IconButton onClick={() => stepMonth(1)} aria-label="Kỳ sau">
            <ChevronRight className="h-5 w-5" strokeWidth={1.6} />
          </IconButton>
        </div>
      )}

      {/* Dải tháng — chỉ ở tab Tháng này. Đứng dưới mũi chuyển kỳ: mũi tên để nhích từng
          tháng, dải để nhảy thẳng và để so tháng nào nặng nhẹ. */}
      {view === 'month' && (
        <MonthStrip
          // Chưa tải xong thì amount = null → dải hiện "—". Truyền thẳng p.expense sẽ ra
          // "0" ở MỌI tháng trong lúc chờ, mà "0" trong app tiền đọc y như số thật.
          items={stripSeries.points.map((p) => ({
            key: p.key,
            amount: rangeFetched ? p.expense : null,
          }))}
          active={activeMonthKey}
          onPick={setMonthKey}
          base={base}
          label="Chọn tháng xem báo cáo — số dưới mỗi tháng là tổng chi"
        />
      )}

      {/* Nội dung THÁNG — bản 26a, dựng lại hoàn toàn (xem MonthView.tsx).
          MonthView tự gọi hook dữ liệu của nó: mọi query đều đã có cache dùng chung
          (React Query khoá theo tháng), nên đưa nó xuống một component không thêm lượt
          gọi mạng nào, mà lại gỡ được ~15 biến chỉ dùng cho tab này khỏi trang. */}
      {view === 'month' && <MonthView monthKey={activeMonthKey} />}

      {/* Nội dung DÀI HẠN — bản 27a, dựng lại hoàn toàn (xem LongView.tsx).
          Công tắc phạm vi nằm TRONG LongView vì nó suy từ dữ liệu: 24 tháng dữ liệu thì
          "3N" và "Tất cả" là hai nút giống nhau, nên số mốc không biết trước được ở đây.
          Dải điều hướng "‹ Năm 2026 ›" cũng đi cùng: nó là khoảng thời gian thứ ba trên
          một màn đã có hai. */}
      {view === 'long' && (
        <Suspense fallback={<p className="py-10 text-center text-sm text-fg-muted">Đang tính…</p>}>
          <LongView />
        </Suspense>
      )}

      {view === 'decide' && (
        <Suspense fallback={<p className="py-10 text-center text-sm text-fg-muted">Đang tính…</p>}>
          <DecideView />
        </Suspense>
      )}

      {view === 'health' && (
        <Suspense fallback={<p className="py-10 text-center text-sm text-fg-muted">Đang tính…</p>}>
          <HealthView />
        </Suspense>
      )}

    </div>
  )
}
