import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { addMonths, formatDateLabel, formatMonthLabel, toISODate, type MonthKey } from '../lib/dates'

/**
 * Ô chọn ngày dùng chung — thay cho `<input type="date">` native.
 *
 * Vì sao phải tự dựng: dạng chữ của ô ngày native do NGÔN NGỮ CỦA TRÌNH DUYỆT quyết
 * định, không phải app. Không có thuộc tính HTML nào đổi được (Chrome bỏ qua cả `lang`),
 * nên một máy để tiếng Anh sẽ hiện "April 21, 2026" ngay giữa app tiếng Việt — và mỗi
 * thiết bị lại một kiểu. Ô này luôn hiện `2026/04/21`, ở mọi máy.
 *
 * Dựng theo đúng khuôn AccountPicker: nút mở + bảng `position: fixed` neo theo nút, để
 * không bị container `overflow-hidden` của sheet cắt mất.
 *
 * Giá trị vào/ra vẫn là ISO 'YYYY-MM-DD' y như ô native, nên nơi gọi không đổi gì.
 */

/** Bề rộng bảng lịch. Là hằng số vì code phải tự tính px để kẹp bảng trong màn hình. */
const PANEL_REM = 20

/** Tuần bắt đầu từ THỨ HAI (lịch Việt), khác mặc định Chủ nhật của lịch Mỹ/Nhật. */
const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']

const navBtn =
  'flex h-9 w-9 items-center justify-center rounded-lg text-fg-secondary hover:bg-surface-sunken'

/** Các ô của một tháng, đã chèn ô trống đầu tuần và bù cho đủ tuần cuối. */
function monthCells(key: MonthKey): (string | null)[] {
  const first = new Date(key.year, key.month - 1, 1)
  // getDay(): 0 = CN. Đổi sang chỉ số tuần-bắt-đầu-thứ-hai.
  const lead = (first.getDay() + 6) % 7
  const days = new Date(key.year, key.month, 0).getDate()
  const cells: (string | null)[] = Array<string | null>(lead).fill(null)
  for (let d = 1; d <= days; d++) cells.push(toISODate(new Date(key.year, key.month - 1, d)))
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

interface Props {
  /** Ngày ISO 'YYYY-MM-DD'; '' là chưa chọn. */
  value: string
  onChange: (iso: string) => void
  /** Chặn chọn trước/sau ngày ISO này (so sánh chuỗi, y như thuộc tính min/max native). */
  min?: string
  max?: string
  /** Cho phép bỏ trống → hiện nút "Xoá". Ô bắt buộc thì để false. */
  clearable?: boolean
  /** Chữ mờ khi chưa chọn. */
  placeholder?: string
  /** Class cho nút mở (nơi gọi tự lo bề rộng, lề dưới…). */
  className?: string
  /**
   * Tên ô, ghép vào tên đọc được của nút dưới dạng chữ chỉ-đọc-màn-hình.
   *
   * KHÔNG dùng `aria-label`: nó đè hết nội dung nút, tức mất luôn ngày đang chọn. Cũng
   * không dựa được vào `<label htmlFor>` bên ngoài — tên của `<button>` tính TỪ NỘI DUNG
   * (HTML-AAM), `for` không phải nguồn tên của nó. Xem cùng ghi chú ở AccountPicker.
   */
  ariaLabel: string
}

export function DateField({
  value,
  onChange,
  min,
  max,
  clearable = false,
  placeholder = 'Chọn ngày',
  className = '',
  ariaLabel,
}: Props) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{
    left: number
    anchor: number
    width: number
    drop: 'down' | 'up'
  } | null>(null)

  const todayISO = toISODate(new Date())
  // Tháng đang xem. Mở ô trống thì rơi về tháng này.
  const [view, setView] = useState<MonthKey>(() => {
    const base = value || todayISO
    const [y, m] = base.split('-').map(Number)
    return { year: y, month: m }
  })

  // Mở lại thì nhảy về tháng của ngày đang chọn — không giữ chỗ người dùng lỡ lướt tới.
  useEffect(() => {
    if (!open) return
    const [y, m] = (value || todayISO).split('-').map(Number)
    setView({ year: y, month: m })
  }, [open, value, todayISO])

  // Đo vị trí nút khi mở; bung lên nếu dưới không đủ chỗ, và kẹp trong bề ngang màn
  // hình (ô ngày hay nằm sát mép phải — vd ô "Ngày" ở hàng tài khoản trang Nhập).
  useLayoutEffect(() => {
    if (!open || !btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    // Bề rộng thật của bảng: rem co giãn theo Cỡ chữ (--app-font-scale) nên phải đọc
    // cỡ chữ gốc chứ không nhân cứng 16px. Ở cỡ "Rất lớn" (1,25) thì 20rem = 400px,
    // rộng hơn cả màn 375px — nên phải kẹp lại, không thì mất hẳn một cột ngày.
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
    const width = Math.min(PANEL_REM * rem, window.innerWidth - 16)
    const maxH = 22 * rem
    const below = window.innerHeight - r.bottom
    const drop = below < maxH + 8 && r.top > below ? 'up' : 'down'
    setPos({
      left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)),
      anchor: drop === 'down' ? r.bottom + 4 : window.innerHeight - r.top + 4,
      width,
      drop,
    })
  }, [open])

  // Đóng khi cuộn trang / đổi kích thước / bấm Esc — y khuôn AccountPicker.
  useEffect(() => {
    if (!open) return
    const close = (e?: Event) => {
      if (e?.target instanceof Node && panelRef.current?.contains(e.target)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Chặn ở pha capture để sheet mẹ đang nghe Esc không đóng theo — mất cả form.
        e.preventDefault()
        setOpen(false)
      }
    }
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    document.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  const allowed = (iso: string) => (!min || iso >= min) && (!max || iso <= max)

  function pick(iso: string) {
    onChange(iso)
    setOpen(false)
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`flex min-h-11 items-center rounded-lg border border-border-strong bg-surface px-2 py-1.5 text-sm text-fg-secondary ${className}`}
      >
        <span className="sr-only">{ariaLabel}: </span>
        {value ? (
          <span className="truncate">{formatDateLabel(value)}</span>
        ) : (
          <>
            {/* Chữ mờ hay TRÙNG tên ô ("Đến ngày" ở trang Tìm — ở đó nó là nhãn duy
                nhất nhìn thấy được), nên đọc thẳng ra sẽ thành "Đến ngày: Đến ngày".
                Mắt thấy chữ mờ, tai nghe "chưa chọn". */}
            <span aria-hidden className="truncate text-fg-muted">
              {placeholder}
            </span>
            <span className="sr-only">chưa chọn</span>
          </>
        )}
      </button>

      {open && pos && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div
            ref={panelRef}
            role="dialog"
            aria-label={ariaLabel}
            style={{
              position: 'fixed',
              left: pos.left,
              width: pos.width,
              ...(pos.drop === 'down' ? { top: pos.anchor } : { bottom: pos.anchor }),
            }}
            className="z-50 rounded-lg border border-border-strong bg-surface p-2 shadow-lg"
          >
            <div className="mb-1 flex items-center">
              <button
                type="button"
                onClick={() => setView((v) => addMonths(v, -12))}
                aria-label="Năm trước"
                className={navBtn}
              >
                <ChevronsLeft className="h-4 w-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => setView((v) => addMonths(v, -1))}
                aria-label="Tháng trước"
                className={navBtn}
              >
                <ChevronLeft className="h-4 w-4" aria-hidden />
              </button>
              <span
                aria-live="polite"
                className="flex-1 text-center text-sm font-semibold text-fg-primary"
              >
                {formatMonthLabel(view)}
              </span>
              <button
                type="button"
                onClick={() => setView((v) => addMonths(v, 1))}
                aria-label="Tháng sau"
                className={navBtn}
              >
                <ChevronRight className="h-4 w-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => setView((v) => addMonths(v, 12))}
                aria-label="Năm sau"
                className={navBtn}
              >
                <ChevronsRight className="h-4 w-4" aria-hidden />
              </button>
            </div>

            <div className="grid grid-cols-7">
              {WEEKDAYS.map((w) => (
                <span key={w} className="pb-1 text-center text-2xs text-fg-muted">
                  {w}
                </span>
              ))}
              {monthCells(view).map((iso, i) =>
                iso === null ? (
                  <span key={`x${i}`} />
                ) : (
                  <button
                    key={iso}
                    type="button"
                    disabled={!allowed(iso)}
                    aria-current={iso === todayISO ? 'date' : undefined}
                    aria-pressed={iso === value}
                    onClick={() => pick(iso)}
                    className={`h-11 rounded-lg text-sm ${
                      iso === value
                        ? 'bg-accent font-semibold text-fg-on-accent'
                        : !allowed(iso)
                          ? 'text-fg-muted opacity-40'
                          : iso === todayISO
                            ? 'font-semibold text-fg-accent hover:bg-surface-sunken'
                            : 'text-fg-primary hover:bg-surface-sunken'
                    }`}
                  >
                    {Number(iso.slice(8))}
                  </button>
                ),
              )}
            </div>

            <div className="mt-1 flex gap-1 border-t border-border-subtle pt-1">
              <button
                type="button"
                disabled={!allowed(todayISO)}
                onClick={() => pick(todayISO)}
                className="flex-1 rounded-lg py-2 text-sm font-medium text-fg-accent disabled:text-fg-muted disabled:opacity-40"
              >
                Hôm nay
              </button>
              {clearable && (
                <button
                  type="button"
                  onClick={() => pick('')}
                  className="flex-1 rounded-lg py-2 text-sm font-medium text-fg-secondary"
                >
                  Xoá ngày
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </>
  )
}
