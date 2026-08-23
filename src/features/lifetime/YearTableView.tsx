// Bảng theo năm (Task 10) — bản dự phòng khả năng tiếp cận của LifetimeChartCard: đồ thị
// Recharts một mình không đọc được bằng screen reader (dù đã có aria-label mô tả), nên
// bảng này liệt kê ĐÚNG những con số đã vẽ, dạng đọc được bằng bàn phím/screen reader.
// Task 7 đã đặt nút mở NGAY DƯỚI đồ thị (không giấu trong menu) — xem LifetimePage.tsx.
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { AlertCircle, ArrowDownCircle, ArrowUpCircle, Download, X } from 'lucide-react'
import { downloadTextFile } from '../../lib/download'
import type { CurrencyCode } from '../../lib/currencies'
import { formatMoney } from '../../lib/money'
import { normalizeText } from '../transactions/filter'
import type { YearEvent, YearRow } from './project'
import { buildYearCsv } from './yearCsv'

interface Props {
  rows: YearRow[]
  currency: CurrencyCode
  onClose: () => void
  /**
   * Tên kịch bản, chỉ để đặt tên file CSV cho dễ phân biệt khi có nhiều kịch bản (ví
   * dụ đang so sánh "An toàn" với "Mạo hiểm"). Brief Task 10 không liệt kê prop này
   * trong "Interfaces" (chỉ nói rows/currency/onClose) nhưng có nhắc biến `scenarioName`
   * ngay trong bước dựng nút xuất — coi đây là chỗ brief thiếu một dòng, không phải
   * mâu thuẫn thật: không có tên kịch bản thì không đặt tên file theo nó được. Optional
   * để component vẫn dùng được nếu chỗ gọi chưa truyền.
   */
  scenarioName?: string
  /**
   * Năm cần cuộn tới và làm nổi ngay khi bảng mở — dùng khi vào từ một ô kết luận
   * ("Tự do tài chính 2060" → xem chuyện gì xảy ra ở 2060).
   *
   * Năm đó có thể đang bị bộ lọc mặc định giấu đi, nên bảng tự bật "hiện đủ" khi cần
   * (xem `useState` của `showAll`) — mở bảng rồi để người dùng tự đi tìm một năm không
   * có trên màn là dẫn họ vào một danh sách trống rỗng.
   */
  focusYear?: number
  /**
   * Bấm vào một sự kiện trong bảng → mở form sửa đúng sự kiện đó. Không truyền thì tên
   * sự kiện là chữ trơn như cũ.
   *
   * Nhận ID chứ không nhận cả dòng: bảng chỉ có `YearEvent` (bản chiếu đã lược bỏ
   * `LifeEventRow`), chỗ gọi mới là nơi tra ngược lại được.
   */
  onEditEvent?: (eventId: string) => void
}

/**
 * Những năm giữ lại ở chế độ mặc định: năm ĐẦU, năm CUỐI, năm ÂM ĐẦU TIÊN (biên bi
 * quan xuống dưới 0) và mọi năm có SỰ KIỆN — đúng những năm "có gì để đọc". Trả về
 * tập chỉ số (index trong `rows`), không phải năm, để filter theo đúng vị trí gốc.
 */
function pickDefaultYearIdx(rows: YearRow[]): Set<number> {
  const keep = new Set<number>()
  if (rows.length === 0) return keep
  keep.add(0)
  keep.add(rows.length - 1)
  const firstNegIdx = rows.findIndex((r) => r.assetsPessimisticMinor < 0)
  if (firstNegIdx !== -1) keep.add(firstNegIdx)
  rows.forEach((r, i) => {
    if (r.events.length > 0) keep.add(i)
  })
  return keep
}

/** Tên file an toàn cho mọi hệ điều hành: bỏ dấu (dùng lại `normalizeText` của
 * features/transactions, không viết lại luật bỏ dấu ở đây) rồi chỉ giữ chữ
 * thường/số/gạch ngang — "Kịch bản của tôi" → "kich-ban-cua-toi". */
function slugifyFileName(name: string): string {
  const slug = normalizeText(name)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '')
  return slug || 'kich-ban'
}

/** Một dòng sự kiện: icon lucide theo `kind` (không chỉ dựa vào màu) + số tô màu.
 *
 * Có `onEdit` thì cả dòng là một <button> mở form sửa sự kiện đó. Trước bản này bảng
 * lọc được "chỉ năm có sự kiện" nhưng thấy một dòng sai thì không sửa được từ đây —
 * phải đóng bảng, mở trình sửa, rồi tự tìm lại đúng sự kiện ấy trong danh sách.
 *
 * KHÔNG min-h-11: dòng này nằm trong một ô bảng có thể chứa nhiều sự kiện của cùng một
 * năm, 44px mỗi dòng làm ô cao gấp ba. Đây là miễn trừ vùng chạm cấp hai — hành động
 * chính của bảng là ĐỌC, và mọi sự kiện đều còn một đường vào 44px ở dải Mốc cuộc đời. */
function EventLine({
  e,
  currency,
  onEdit,
}: {
  e: YearEvent
  currency: CurrencyCode
  onEdit?: (eventId: string) => void
}) {
  const isIncome = e.kind === 'income'
  const Icon = isIncome ? ArrowUpCircle : ArrowDownCircle
  const tone = isIncome ? 'text-money-in' : 'text-money-out'
  const body = (
    <>
      <Icon className={`h-3.5 w-3.5 shrink-0 ${tone}`} />
      <span className="min-w-0 flex-1 truncate text-fg-secondary">{e.label}</span>
      <span className={`shrink-0 tabular-nums font-medium ${tone}`}>
        {isIncome ? '+' : '−'}
        {formatMoney(e.amountDisplayMinor, currency)}
      </span>
    </>
  )
  if (!onEdit) {
    return <div className="flex items-center gap-1.5">{body}</div>
  }
  return (
    <button
      type="button"
      onClick={() => onEdit(e.id)}
      aria-label={`Sửa sự kiện ${e.label}`}
      className="flex w-full items-center gap-1.5 rounded-md text-left transition hover:bg-surface-sunken"
    >
      {body}
    </button>
  )
}

/** Thẻ một năm cho mobile (< sm) — KHÔNG dùng `<table>`, bảng nhiều cột tràn ngang trên
 * điện thoại. Dòng đầu năm·tuổi·nơi ở·tài sản cuối năm, dòng phụ thu/chi, rồi từng
 * sự kiện một dòng. */
function YearCard({
  row,
  currency,
  onEditEvent,
  focusRef,
  focused,
}: {
  row: YearRow
  currency: CurrencyCode
  onEditEvent?: (eventId: string) => void
  /** Gắn vào ĐÚNG một thẻ (năm được nhảy tới) để cuộn nó vào tầm nhìn. */
  focusRef?: (el: HTMLDivElement | null) => void
  focused?: boolean
}) {
  const negative = row.assetsPessimisticMinor < 0
  return (
    <div
      ref={focusRef}
      className={`rounded-lg p-2.5 ${focused ? 'ring-2 ring-accent' : ''} ${
        negative
          ? 'border-l-[3px] border-red-600 bg-red-50 dark:bg-red-900/20'
          : 'bg-surface'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-fg-primary">
          {row.year} · {row.age} tuổi · {row.country ?? row.phaseLabel}
        </p>
        {/* KHÔNG có icon cảnh báo ở con số này: `negative` đọc dấu của
            `assetsPessimisticMinor`, còn đây là `assetsEndMinor` — dán icon vào đây là
            gắn cảnh báo lên một con số có thể đang dương to. Icon đi cùng con số bi quan
            ở dòng dưới, đúng con số nó nói về. */}
        <span className="shrink-0 tabular-nums text-sm font-semibold text-fg-primary">
          {formatMoney(row.assetsEndMinor, currency)}
        </span>
      </div>
      <p className="mt-0.5 text-xs text-fg-muted">
        thu {formatMoney(row.incomeMinor, currency)} · chi {formatMoney(row.expenseMinor, currency)}
      </p>
      {/* Biên dưới của dải — con số THẬT SỰ quyết định nền đỏ và viền đỏ của thẻ này.
          Trước đây nó không hiện ở đâu cả: với `band_spread_bps = 150` (mặc định
          migration 0031) có một dải năm dài mà thẻ đỏ trong khi con số duy nhất nhìn
          thấy được lại dương thoải mái, và không gì trên màn hình giải thích vì sao. */}
      <p
        className={`mt-0.5 flex items-center gap-1 text-xs tabular-nums ${
          negative ? 'text-money-out' : 'text-fg-muted'
        }`}
      >
        {negative && <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
        bi quan {formatMoney(row.assetsPessimisticMinor, currency)}
      </p>
      {row.events.length > 0 && (
        <div className="mt-1.5 space-y-1 border-t border-border-panel pt-1.5 text-xs">
          {row.events.map((e) => (
            <EventLine key={e.id} e={e} currency={currency} onEdit={onEditEvent} />
          ))}
        </div>
      )}
    </div>
  )
}

/** Ô TIỀN của bảng (sm+): canh phải + `tabular-nums` để các chữ số thẳng cột. Một hằng
 *  số cho cả bốn ô thay vì gõ lại từng ô — bốn ô tiền lệch nhau một class là bốn cột số
 *  không còn thẳng hàng, mà mắt rất khó bắt lỗi đó trên bảng 60 dòng. */
const MONEY_CELL = 'p-1.5 align-top text-right tabular-nums'

/** Một dòng bảng thật (sm+). Border trái đỏ đặt trên `<td>` đầu tiên chứ không phải
 * `<tr>` — trình duyệt không vẽ border trên `<tr>` một cách đáng tin cậy dưới
 * `border-collapse`, còn nền đỏ nhạt thì `<tr>` tô được bình thường nên vẫn đặt ở đó.
 *
 * Nền đỏ / viền đỏ / icon đều theo `assetsPessimisticMinor` (biên DƯỚI của dải), khớp
 * `pickDefaultYearIdx` ở trên, `firstNegativeYear(rows, 'low')` của insights.ts và vùng
 * đỏ của đồ thị. Con số đó có CỘT RIÊNG ("Bi quan") chứ không còn ẩn: `InsightCards`
 * (thẻ "Lúc N tuổi") nói rõ trung tâm dương mà biên dưới âm là "có thể âm ở nhánh xấu",
 * không phải "đang âm" — hai tin khác nhau thì phải thấy được cả hai con số, không thể
 * tô đỏ theo một con số rồi chỉ cho xem con số kia. */
function YearTableRow({
  row,
  currency,
  onEditEvent,
  focusRef,
  focused,
}: {
  row: YearRow
  currency: CurrencyCode
  onEditEvent?: (eventId: string) => void
  focusRef?: (el: HTMLTableRowElement | null) => void
  focused?: boolean
}) {
  const negative = row.assetsPessimisticMinor < 0
  // Vòng nhấn đặt trên <tr> chứ không trên <td> đầu: nó phải bao CẢ dòng, và
  // `ring` (box-shadow) vẽ được trên <tr> dưới `border-collapse` — khác `border`,
  // thứ mà trình duyệt bỏ qua ở đó (xem JSDoc viền đỏ bên dưới).
  return (
    <tr
      ref={focusRef}
      className={`${focused ? 'ring-2 ring-accent' : ''} ${
        negative ? 'bg-red-50 dark:bg-red-900/20' : ''
      }`}
    >
      <td
        className={`p-1.5 align-top tabular-nums ${negative ? 'border-l-[3px] border-red-600' : ''}`}
      >
        {row.year}
      </td>
      <td className="p-1.5 align-top tabular-nums">{row.age}</td>
      <td className="p-1.5 align-top">{row.country ?? row.phaseLabel}</td>
      <td className={MONEY_CELL}>{formatMoney(row.incomeMinor, currency)}</td>
      <td className={MONEY_CELL}>{formatMoney(row.expenseMinor, currency)}</td>
      <td className="min-w-40 p-1.5 align-top">
        {row.events.length === 0 ? (
          <span className="text-fg-muted">—</span>
        ) : (
          <div className="space-y-0.5">
            {row.events.map((e) => (
              <EventLine key={e.id} e={e} currency={currency} onEdit={onEditEvent} />
            ))}
          </div>
        )}
      </td>
      <td className={`${MONEY_CELL} font-medium`}>{formatMoney(row.assetsEndMinor, currency)}</td>
      {/* Icon cảnh báo đi CÙNG con số bi quan, không cùng "Tài sản cuối năm": `negative`
          đọc dấu của chính con số trong ô này. */}
      <td
        className={`${MONEY_CELL} ${
          negative ? 'font-medium text-money-out' : 'text-fg-muted'
        }`}
      >
        <span className="inline-flex items-center gap-1">
          {negative && <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
          {formatMoney(row.assetsPessimisticMinor, currency)}
        </span>
      </td>
    </tr>
  )
}

const TABLE_HEADERS = [
  'Năm',
  'Tuổi',
  'Nơi ở',
  'Thu',
  'Chi',
  'Sự kiện',
  'Tài sản cuối năm',
  // Cột này là điều kiện tô đỏ của cả dòng — xem JSDoc `YearTableRow`.
  'Bi quan',
]
/** Cột nào canh phải (số tiền). Trước đây là một biểu thức `h === … || h === …` viết
 *  thẳng trong JSX; thêm cột thứ tư vào đó là lúc nó nên thành một tập. */
const RIGHT_ALIGNED = new Set(['Thu', 'Chi', 'Tài sản cuối năm', 'Bi quan'])

/**
 * Bảng chi tiết theo năm — bản dự phòng a11y của đồ thị Lifetime. Mặc định chỉ hiện
 * năm có sự kiện (cộng năm đầu/cuối/âm đầu tiên) để đỡ dài dòng; có công tắc hiện đủ.
 * Chân bảng LUÔN nói rõ đang ẩn/hiện bao nhiêu năm — không được giảm mật độ trong im
 * lặng (ràng buộc "không cắt bớt âm thầm" của dự án).
 */
export function YearTableView({
  rows,
  currency,
  onClose,
  scenarioName,
  focusYear,
  onEditEvent,
}: Props) {
  // Bật sẵn "hiện đủ" khi năm cần nhảy tới đang bị bộ lọc mặc định giấu: mở bảng ở một
  // năm KHÔNG có trên màn là dẫn người dùng vào một danh sách trống. Tính MỘT LẦN lúc
  // gắn (hàm khởi tạo của useState) chứ không bằng effect — người dùng tắt công tắc đi
  // là quyết định của họ, effect sẽ bật lại ngay sau đó.
  const [showAll, setShowAll] = useState(() => {
    if (focusYear === undefined) return false
    const idx = rows.findIndex((r) => r.year === focusYear)
    // `idx === -1` (năm không có trong bản chiếu) cũng bật: thà hiện đủ để người dùng
    // tự thấy bảng dừng ở năm nào, còn hơn hiện một danh sách rút gọn không nói gì.
    return idx === -1 || !pickDefaultYearIdx(rows).has(idx)
  })
  const switchLabelId = useId()

  // Đóng bằng Esc — cùng quy ước với lib/dialog.tsx và NotificationBell.tsx (mọi
  // "sheet"/dialog trong app đều đóng được bằng phím này, không chỉ bằng chuột/chạm).
  // Component này CHÍNH LÀ bản dự phòng a11y của đồ thị, nên càng không được để người
  // dùng bàn phím bị kẹt lại trong nó.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Cuộn năm được nhảy tới vào giữa tầm nhìn, MỘT LẦN sau khi bảng đã dựng xong. Ref
  // callback chứ không `document.getElementById`: bảng có hai bản (thẻ ở mobile, <tr> từ
  // sm) nên cùng một năm có thể ứng với hai phần tử, và chỉ phần tử ĐANG ĐƯỢC DỰNG mới
  // gọi ref — id trùng thì `getElementById` bắt vào bản đang `display:none`.
  //
  // `block: 'center'` chứ không 'start': năm cần đọc thường phải đặt cạnh mấy năm trước
  // nó mới hiểu được (tài sản đang trôi theo hướng nào), dán nó lên mép trên thì mất hết
  // phần dẫn.
  const focusEl = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (focusYear === undefined) return
    // `prefers-reduced-motion` do CSS toàn cục lo (index.css) — `scroll-behavior` là
    // thuộc tính CSS thật, khác hoạt ảnh JS của Recharts.
    focusEl.current?.scrollIntoView({ block: 'center' })
  }, [focusYear])

  const defaultIdx = useMemo(() => pickDefaultYearIdx(rows), [rows])
  const visibleRows = showAll ? rows : rows.filter((_, i) => defaultIdx.has(i))
  const hiddenCount = rows.length - visibleRows.length
  // Có dòng nào đang bị tô đỏ trong PHẦN ĐANG HIỆN — quyết định có cần câu giải thích ở
  // chân bảng hay không. Đọc `visibleRows` chứ không `rows`: giải thích một màu không có
  // trên màn hình chỉ là thêm chữ.
  const hasPessimisticNegative = visibleRows.some((r) => r.assetsPessimisticMinor < 0)

  function handleExport() {
    const filename = `lifetime-${slugifyFileName(scenarioName ?? '')}.csv`
    downloadTextFile(filename, buildYearCsv(rows, currency), 'text/csv')
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 lg:items-center animate-overlay-in"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Bảng theo năm"
        className="flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-surface-page lg:rounded-2xl animate-sheet-in lg:animate-sheet-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-gray-300 dark:bg-gray-700 lg:hidden" />

        {/* Header: tiêu đề + đóng */}
        <div className="flex shrink-0 items-center gap-2 p-3 pb-2">
          <h2 className="flex-1 text-base font-bold text-fg-primary">
            Bảng theo năm
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng bảng theo năm"
            className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md text-fg-muted transition active:scale-95"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Công tắc lọc + nút xuất CSV */}
        <div className="flex shrink-0 items-center gap-2 px-3 pb-2">
          <button
            type="button"
            role="switch"
            aria-checked={!showAll}
            aria-labelledby={switchLabelId}
            onClick={() => setShowAll((v) => !v)}
            className="flex min-h-11 items-center gap-2 rounded-md pr-2"
          >
            <span
              className={`block h-6 w-11 shrink-0 rounded-full transition ${
                !showAll ? 'bg-accent' : 'bg-gray-300 dark:bg-gray-700'
              }`}
            >
              <span
                className={`block h-5 w-5 rounded-full bg-white shadow transition ${
                  !showAll ? 'translate-x-[1.375rem]' : 'translate-x-0.5'
                }`}
              />
            </span>
            <span id={switchLabelId} className="text-sm font-medium text-fg-primary">
              Chỉ năm có sự kiện
            </span>
          </button>

          <button
            type="button"
            onClick={handleExport}
            className="ml-auto flex min-h-11 items-center justify-center gap-1.5 rounded-md border border-border-strong bg-surface px-3 text-sm font-medium text-fg-secondary transition active:scale-95"
          >
            <Download className="h-4 w-4" />
            Xuất CSV
          </button>
        </div>

        {/* Nội dung: cuộn dọc. Mobile = thẻ, sm+ = bảng thật trong overflow-x-auto. */}
        <div className="flex-1 overflow-y-auto px-3 pb-2">
          {rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-fg-muted">
              Chưa có dữ liệu để hiện.
            </p>
          ) : (
            <>
              <div className="space-y-2 sm:hidden">
                {visibleRows.map((r) => (
                  <YearCard
                    key={r.year}
                    row={r}
                    currency={currency}
                    onEditEvent={onEditEvent}
                    focused={r.year === focusYear}
                    focusRef={r.year === focusYear ? (el) => (focusEl.current = el) : undefined}
                  />
                ))}
              </div>

              <div className="hidden overflow-x-auto sm:block">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="text-left text-xs text-fg-muted">
                      {TABLE_HEADERS.map((h) => (
                        <th
                          key={h}
                          className={`p-1.5 font-medium ${RIGHT_ALIGNED.has(h) ? 'text-right' : ''}`}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((r) => (
                      <YearTableRow
                        key={r.year}
                        row={r}
                        currency={currency}
                        onEditEvent={onEditEvent}
                        focused={r.year === focusYear}
                        focusRef={
                          r.year === focusYear ? (el) => (focusEl.current = el) : undefined
                        }
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {/* Chân bảng — BẮT BUỘC nói rõ trạng thái ẩn/hiện, không được im lặng. */}
        {rows.length > 0 && (
          <div className="shrink-0 border-t border-border-panel p-2 text-center text-xs text-fg-muted">
            <p>
              {hiddenCount > 0
                ? `đang ẩn ${hiddenCount} năm không có sự kiện`
                : `đang hiện đủ ${rows.length} năm`}
            </p>
            {/* Nói ra ĐIỀU KIỆN tô đỏ. Không có câu này thì người đọc mặc định gán màu
                đỏ cho con số to nhất trên dòng ("Tài sản cuối năm"), tức đọc thành "đang
                âm" trong khi tin thật là "có thể âm ở nhánh xấu" — hai tin khác nhau. */}
            {hasPessimisticNegative && (
              <p className="mt-0.5">
                Dòng tô đỏ = cột <b>Bi quan</b> (biên dưới của dải) xuống dưới 0, không phải tài
                sản cuối năm âm.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
