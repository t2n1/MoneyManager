import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'
import { AccountTypeIcon } from './icons'
import { useAccountBalances } from '../hooks/queries'
import { CURRENCIES, formatMoney, type CurrencyCode } from '../lib/money'
import { groupOptionsByType } from '../features/accounts/groupByType'
import { normalizeText } from '../features/transactions/filter'
import type { AccountType } from '../types/database.types'

type AccountOption = {
  id: string
  name: string
  type: AccountType
  currency: CurrencyCode
}

interface AccountPickerProps {
  /** Danh sách tài khoản chọn được (đã gồm cả TK lưu trữ của GD đang sửa). */
  accounts: AccountOption[]
  value: string | null
  onChange: (id: string) => void
  /** Ẩn TK này khỏi danh sách (dùng cho ô đích khi chuyển khoản). */
  excludeId?: string | null
  /** Thêm class cho nút mở (vd `w-full` trong sheet). */
  className?: string
  /**
   * Ô này là ô gì ("Từ tài khoản", "Đến tài khoản"). Ghép vào tên đọc được của nút
   * dưới dạng chữ chỉ-đọc-màn-hình, KHÔNG phải `aria-label`.
   *
   * Vì sao không `aria-label`: nó ĐÈ hết nội dung nút, tức mất luôn tên tài khoản
   * đang chọn. Vì sao không để nhãn ngoài dùng `<label htmlFor>`: tên đọc được của
   * thẻ `<button>` tính TỪ NỘI DUNG (HTML-AAM), `<label for>` không phải nguồn tên
   * của nó — nên nhãn ngoài chỉ là chữ trang trí.
   *
   * Cần thật: ở chế độ chuyển khoản có HAI picker cạnh nhau, trước đây cả hai đọc ra
   * y như nhau ("Ví MoMo · ¥, button") nên không biết đâu là nguồn đâu là đích.
   */
  ariaLabel?: string
}

/** Từ số tài khoản này trở lên mới hiện ô tìm — dưới ngưỡng thì mắt nhanh hơn tay gõ. */
const SEARCH_FROM = 8

/** Cao mỗi hàng (px). Dùng cả trong phép đo vị trí panel nên phải là một con số. */
const ROW_H = 48

/**
 * Bộ chọn tài khoản thay cho `<select>` native: hiện icon theo loại + số dư
 * (từ view account_balances) nên biết ngay TK nào còn tiền. Panel bung ra ở
 * `position: fixed` neo theo nút để không bị cắt bởi container `overflow-hidden`.
 *
 * Vẽ lại 2026-08-12 vì "khó chọn" (đo trên máy 10 tài khoản, khung 375px):
 *  - Hàng cao 36px, dưới vùng chạm 44px. Giờ 48px.
 *  - Panel bám bề rộng nút nên chỉ 220px: tên tài khoản dài + số dư chen nhau. Giờ
 *    rộng ít nhất 300px và tự nới gần hết bề ngang màn hình, kẹp trong lề 12px.
 *  - 10 tài khoản trong ô cao 320px = cuộn trong một khe hẹp. Giờ tối đa 70% chiều
 *    cao màn hình.
 *  - Một danh sách phẳng trộn ví/ngân hàng/thẻ/đầu tư. Giờ chia khối theo loại,
 *    tiêu đề khối dính trên khi cuộn.
 *  - Nhiều tài khoản thì thêm ô tìm (bỏ dấu, dùng lại normalizeText của Tìm kiếm).
 *  - Tài khoản đang chọn có dấu ✓, không chỉ đổi màu.
 */
export function AccountPicker({
  accounts,
  value,
  onChange,
  excludeId,
  className = '',
  ariaLabel,
}: AccountPickerProps) {
  const { data: balances = [] } = useAccountBalances()
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{
    left: number
    anchor: number
    width: number
    drop: 'down' | 'up'
  } | null>(null)

  const [query, setQuery] = useState('')

  const options = accounts.filter((a) => a.id !== excludeId)
  const selected = accounts.find((a) => a.id === value) ?? null
  const balanceOf = (id: string) => balances.find((b) => b.id === id)?.balance
  const searchShown = options.length >= SEARCH_FROM

  const needle = normalizeText(query)
  const groups = useMemo(() => {
    const matched = needle
      ? options.filter((a) => normalizeText(a.name).includes(needle))
      : options
    return groupOptionsByType(matched)
  }, [options, needle])
  const matchedCount = groups.reduce((n, g) => n + g.items.length, 0)
  const emptyMessage =
    options.length === 0 ? 'Không có tài khoản' : `Không có tài khoản nào khớp “${query}”`

  // Mở lại là bắt đầu lại từ danh sách đầy đủ — không thì lần sau mở ra thấy một
  // danh sách đã bị lọc mà không rõ vì sao.
  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  // Đo vị trí nút khi mở để đặt panel; bung lên nếu dưới không đủ chỗ.
  //
  // Bề rộng: lấy max(bề rộng nút, 300px) rồi kẹp trong màn hình (lề 12px mỗi bên), và
  // đẩy `left` vào cho khỏi tràn phải — panel rộng hơn nút thì mép phải của nó vượt ra
  // ngoài nếu cứ giữ nguyên left của nút.
  useLayoutEffect(() => {
    if (!open || !btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    // Máy nhỏ thì dùng gần hết bề ngang (lề 12px): tên tài khoản dài + số dư 9 chữ số
    // (đồng VN) không nhét nổi vào 300px. Máy rộng thì chỉ cần đủ 320px.
    const room = window.innerWidth - 24
    const width = window.innerWidth < 480 ? room : Math.min(Math.max(r.width, 320), room)
    const maxH = Math.min(window.innerHeight * 0.7, options.length * ROW_H + 96)
    const below = window.innerHeight - r.bottom
    const drop = below < maxH + 8 && r.top > below ? 'up' : 'down'
    setPos({
      left: Math.max(12, Math.min(r.left, window.innerWidth - width - 12)),
      anchor: drop === 'down' ? r.bottom + 4 : window.innerHeight - r.top + 4,
      width,
      drop,
    })
  }, [open, options.length])

  // Đóng khi cuộn trang / đổi kích thước / bấm Esc. Bỏ qua cuộn phát sinh ngay
  // trong panel, nếu không danh sách dài sẽ tự đóng khi kéo tới mục cuối.
  useEffect(() => {
    if (!open) return
    const close = (e?: Event) => {
      if (e?.target instanceof Node && panelRef.current?.contains(e.target)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Chặn sự kiện (pha capture) để sheet mẹ đang nghe Esc (useEscClose)
        // không đóng theo — mất sạch form đang điền.
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

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex min-h-11 items-center gap-1.5 rounded-lg border border-border-strong bg-surface px-2 py-1.5 text-sm text-fg-secondary ${className}`}
      >
        {ariaLabel && <span className="sr-only">{ariaLabel}: </span>}
        {selected ? (
          <>
            <AccountTypeIcon
              type={selected.type}
              className="h-4 w-4 shrink-0 text-money-in"
            />
            <span className="truncate">
              {selected.name} · {CURRENCIES[selected.currency].symbol}
            </span>
          </>
        ) : (
          <span className="text-fg-muted">Chọn tài khoản…</span>
        )}
        <ChevronDown
          className={`ml-auto h-4 w-4 shrink-0 text-fg-muted transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>

      {open && pos && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          {/* panelRef bọc CẢ ô tìm: hàm đóng-khi-cuộn bỏ qua cuộn phát sinh trong ref
              này, mà ô tìm nằm ngoài thì gõ/cuộn ở đó sẽ đóng mất panel.
              Ô tìm đứng NGOÀI phần tử role="listbox" — <input> nằm trong listbox là
              ARIA sai; mỗi khối loại là một role="group" (hợp lệ trong listbox). */}
          <div
            ref={panelRef}
            style={{
              position: 'fixed',
              left: pos.left,
              width: pos.width,
              maxHeight: '70vh',
              ...(pos.drop === 'down' ? { top: pos.anchor } : { bottom: pos.anchor }),
            }}
            className="z-50 flex flex-col overflow-hidden rounded-xl border border-border-panel bg-surface shadow-lg"
          >
            {searchShown && (
              <div className="flex shrink-0 items-center gap-1.5 border-b border-border-subtle px-3">
                <Search className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden />
                {/* Không autoFocus: bàn phím bật lên là màn hình co lại, panel neo theo
                    nút bị đẩy/che ngay lúc vừa mở. Muốn tìm thì chạm vào ô. */}
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={`Tìm trong ${options.length} tài khoản…`}
                  aria-label="Tìm tài khoản"
                  className="min-h-11 min-w-0 flex-1 bg-transparent text-sm outline-none"
                />
              </div>
            )}

            <div role="listbox" className="min-h-0 flex-1 overflow-y-auto py-1">
              {groups.map((g) => (
                <div key={g.type} role="group" aria-label={g.label}>
                  {/* Tiêu đề khối dính trên khi cuộn: danh sách dài thì cuộn tới giữa
                      vẫn biết đang ở nhóm nào. */}
                  <div className="sticky top-0 z-10 bg-surface px-3 py-1 text-2xs font-semibold uppercase tracking-wide text-fg-muted">
                    {g.label}
                  </div>
                  {g.items.map((a) => {
                    const bal = balanceOf(a.id)
                    const isSel = a.id === value
                    return (
                      <button
                        key={a.id}
                        type="button"
                        role="option"
                        aria-selected={isSel}
                        onClick={() => {
                          onChange(a.id)
                          setOpen(false)
                        }}
                        className={`flex min-h-12 w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm ${
                          isSel
                            ? 'bg-state-good-bg'
                            : 'hover:bg-surface-sunken'
                        }`}
                      >
                        <AccountTypeIcon
                          type={a.type}
                          className={`h-5 w-5 shrink-0 ${isSel ? 'text-money-in' : 'text-fg-muted'}`}
                        />
                        <span
                          className={`flex-1 truncate ${
                            isSel
                              ? 'font-medium text-state-good-fg'
                              : 'text-fg-primary'
                          }`}
                        >
                          {a.name}
                        </span>
                        {bal !== undefined && (
                          <span
                            className={`shrink-0 text-xs tabular-nums ${
                              bal < 0 ? 'text-money-out' : 'text-fg-muted'
                            }`}
                          >
                            {formatMoney(bal, a.currency)}
                          </span>
                        )}
                        {/* Dấu ✓ chứ không chỉ đổi màu: nền xanh nhạt ở chế độ tối rất
                            khó thấy, mà đây là câu trả lời cho "đang chọn cái nào". */}
                        <Check
                          className={`h-4 w-4 shrink-0 text-fg-accent ${isSel ? '' : 'invisible'}`}
                          aria-hidden
                        />
                      </button>
                    )
                  })}
                </div>
              ))}
              {/* MỘT <p> cho cả hai ca rỗng, và câu nằm ở BIẾN chứ không viết chuỗi lồng
                  trong JSX: test canh chế độ Gọn đếm chữ thật trong <p> sau khi bỏ các
                  {biểu thức}, mà nó không bỏ được biểu thức có ngoặc lồng (`${'${…}'}`). */}
              {matchedCount === 0 && (
                <p className="px-3 py-4 text-center text-xs text-fg-muted">{emptyMessage}</p>
              )}
            </div>
          </div>
        </>
      )}
    </>
  )
}
