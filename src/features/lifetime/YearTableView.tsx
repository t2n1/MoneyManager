// Bảng theo năm (Task 10) — bản dự phòng khả năng tiếp cận của LifetimeChartCard: đồ thị
// Recharts một mình không đọc được bằng screen reader (dù đã có aria-label mô tả), nên
// bảng này liệt kê ĐÚNG những con số đã vẽ, dạng đọc được bằng bàn phím/screen reader.
// Task 7 đã đặt nút mở NGAY DƯỚI đồ thị (không giấu trong menu) — xem LifetimePage.tsx.
import { useEffect, useId, useMemo, useState } from 'react'
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

/** Một dòng sự kiện: icon lucide theo `kind` (không chỉ dựa vào màu) + số tô màu. */
function EventLine({ e, currency }: { e: YearEvent; currency: CurrencyCode }) {
  const isIncome = e.kind === 'income'
  const Icon = isIncome ? ArrowUpCircle : ArrowDownCircle
  const tone = isIncome ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
  return (
    <div className="flex items-center gap-1.5">
      <Icon className={`h-3.5 w-3.5 shrink-0 ${tone}`} />
      <span className="min-w-0 flex-1 truncate text-gray-600 dark:text-gray-300">{e.label}</span>
      <span className={`shrink-0 tabular-nums font-medium ${tone}`}>
        {isIncome ? '+' : '−'}
        {formatMoney(e.amountDisplayMinor, currency)}
      </span>
    </div>
  )
}

/** Thẻ một năm cho mobile (< sm) — KHÔNG dùng `<table>`, bảng nhiều cột tràn ngang trên
 * điện thoại. Dòng đầu năm·tuổi·nơi ở·tài sản cuối năm, dòng phụ thu/chi, rồi từng
 * sự kiện một dòng. */
function YearCard({ row, currency }: { row: YearRow; currency: CurrencyCode }) {
  const negative = row.assetsPessimisticMinor < 0
  return (
    <div
      className={`rounded-lg p-2.5 ${
        negative
          ? 'border-l-[3px] border-red-600 bg-red-50 dark:bg-red-900/20'
          : 'bg-white dark:bg-gray-900'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
          {row.year} · {row.age} tuổi · {row.country ?? row.phaseLabel}
        </p>
        <span className="flex shrink-0 items-center gap-1 tabular-nums text-sm font-semibold text-gray-800 dark:text-gray-100">
          {negative && <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-600 dark:text-red-400" />}
          {formatMoney(row.assetsEndMinor, currency)}
        </span>
      </div>
      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
        thu {formatMoney(row.incomeMinor, currency)} · chi {formatMoney(row.expenseMinor, currency)}
      </p>
      {row.events.length > 0 && (
        <div className="mt-1.5 space-y-1 border-t border-gray-200 dark:border-gray-800 pt-1.5 text-xs">
          {row.events.map((e) => (
            <EventLine key={e.id} e={e} currency={currency} />
          ))}
        </div>
      )}
    </div>
  )
}

/** Một dòng bảng thật (sm+). Border trái đỏ đặt trên `<td>` đầu tiên chứ không phải
 * `<tr>` — trình duyệt không vẽ border trên `<tr>` một cách đáng tin cậy dưới
 * `border-collapse`, còn nền đỏ nhạt thì `<tr>` tô được bình thường nên vẫn đặt ở đó. */
function YearTableRow({ row, currency }: { row: YearRow; currency: CurrencyCode }) {
  const negative = row.assetsPessimisticMinor < 0
  return (
    <tr className={negative ? 'bg-red-50 dark:bg-red-900/20' : ''}>
      <td
        className={`p-1.5 align-top tabular-nums ${negative ? 'border-l-[3px] border-red-600' : ''}`}
      >
        {row.year}
      </td>
      <td className="p-1.5 align-top tabular-nums">{row.age}</td>
      <td className="p-1.5 align-top">{row.country ?? row.phaseLabel}</td>
      <td className="p-1.5 align-top text-right tabular-nums">
        {formatMoney(row.incomeMinor, currency)}
      </td>
      <td className="p-1.5 align-top text-right tabular-nums">
        {formatMoney(row.expenseMinor, currency)}
      </td>
      <td className="min-w-40 p-1.5 align-top">
        {row.events.length === 0 ? (
          <span className="text-gray-400 dark:text-gray-600">—</span>
        ) : (
          <div className="space-y-0.5">
            {row.events.map((e) => (
              <EventLine key={e.id} e={e} currency={currency} />
            ))}
          </div>
        )}
      </td>
      <td className="p-1.5 align-top text-right font-medium tabular-nums">
        <span className="inline-flex items-center gap-1">
          {negative && <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-600 dark:text-red-400" />}
          {formatMoney(row.assetsEndMinor, currency)}
        </span>
      </td>
    </tr>
  )
}

const TABLE_HEADERS = ['Năm', 'Tuổi', 'Nơi ở', 'Thu', 'Chi', 'Sự kiện', 'Tài sản cuối năm']

/**
 * Bảng chi tiết theo năm — bản dự phòng a11y của đồ thị Lifetime. Mặc định chỉ hiện
 * năm có sự kiện (cộng năm đầu/cuối/âm đầu tiên) để đỡ dài dòng; có công tắc hiện đủ.
 * Chân bảng LUÔN nói rõ đang ẩn/hiện bao nhiêu năm — không được giảm mật độ trong im
 * lặng (ràng buộc "không cắt bớt âm thầm" của dự án).
 */
export function YearTableView({ rows, currency, onClose, scenarioName }: Props) {
  const [showAll, setShowAll] = useState(false)
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

  const defaultIdx = useMemo(() => pickDefaultYearIdx(rows), [rows])
  const visibleRows = showAll ? rows : rows.filter((_, i) => defaultIdx.has(i))
  const hiddenCount = rows.length - visibleRows.length

  function handleExport() {
    const filename = `lifetime-${slugifyFileName(scenarioName ?? '')}.csv`
    downloadTextFile(filename, buildYearCsv(rows, currency), 'text/csv')
  }

  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 lg:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Bảng theo năm"
        className="flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-gray-50 dark:bg-gray-950 lg:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-gray-300 dark:bg-gray-700 lg:hidden" />

        {/* Header: tiêu đề + đóng */}
        <div className="flex shrink-0 items-center gap-2 p-3 pb-2">
          <h2 className="flex-1 text-base font-bold text-gray-800 dark:text-gray-100">
            Bảng theo năm
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng bảng theo năm"
            className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-gray-500 dark:text-gray-400 active:scale-95"
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
            className="flex min-h-11 items-center gap-2 rounded-lg pr-2"
          >
            <span
              className={`block h-6 w-11 shrink-0 rounded-full transition ${
                !showAll ? 'bg-green-600' : 'bg-gray-300 dark:bg-gray-700'
              }`}
            >
              <span
                className={`block h-5 w-5 rounded-full bg-white shadow transition ${
                  !showAll ? 'translate-x-[1.375rem]' : 'translate-x-0.5'
                }`}
              />
            </span>
            <span id={switchLabelId} className="text-sm font-medium text-gray-700 dark:text-gray-200">
              Chỉ năm có sự kiện
            </span>
          </button>

          <button
            type="button"
            onClick={handleExport}
            className="ml-auto flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 text-sm font-medium text-gray-600 dark:text-gray-300 active:scale-95"
          >
            <Download className="h-4 w-4" />
            Xuất CSV
          </button>
        </div>

        {/* Nội dung: cuộn dọc. Mobile = thẻ, sm+ = bảng thật trong overflow-x-auto. */}
        <div className="flex-1 overflow-y-auto px-3 pb-2">
          {rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400 dark:text-gray-500">
              Chưa có dữ liệu để hiện.
            </p>
          ) : (
            <>
              <div className="space-y-2 sm:hidden">
                {visibleRows.map((r) => (
                  <YearCard key={r.year} row={r} currency={currency} />
                ))}
              </div>

              <div className="hidden overflow-x-auto sm:block">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 dark:text-gray-400">
                      {TABLE_HEADERS.map((h) => (
                        <th
                          key={h}
                          className={`p-1.5 font-medium ${
                            h === 'Thu' || h === 'Chi' || h === 'Tài sản cuối năm' ? 'text-right' : ''
                          }`}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((r) => (
                      <YearTableRow key={r.year} row={r} currency={currency} />
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {/* Chân bảng — BẮT BUỘC nói rõ trạng thái ẩn/hiện, không được im lặng. */}
        {rows.length > 0 && (
          <p className="shrink-0 border-t border-gray-200 dark:border-gray-800 p-2 text-center text-xs text-gray-500 dark:text-gray-400">
            {hiddenCount > 0
              ? `đang ẩn ${hiddenCount} năm không có sự kiện`
              : `đang hiện đủ ${rows.length} năm`}
          </p>
        )}
      </div>
    </div>
  )
}
