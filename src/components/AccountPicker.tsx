import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { AccountTypeIcon } from './icons'
import { useAccountBalances } from '../hooks/queries'
import { CURRENCIES, formatMoney, type CurrencyCode } from '../lib/money'
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
}

/**
 * Bộ chọn tài khoản thay cho `<select>` native: hiện icon theo loại + số dư
 * (từ view account_balances) nên biết ngay TK nào còn tiền. Panel bung ra ở
 * `position: fixed` neo theo nút để không bị cắt bởi container `overflow-hidden`.
 */
export function AccountPicker({
  accounts,
  value,
  onChange,
  excludeId,
  className = '',
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

  const options = accounts.filter((a) => a.id !== excludeId)
  const selected = accounts.find((a) => a.id === value) ?? null
  const balanceOf = (id: string) => balances.find((b) => b.id === id)?.balance

  // Đo vị trí nút khi mở để đặt panel; bung lên nếu dưới không đủ chỗ.
  useLayoutEffect(() => {
    if (!open || !btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    const maxH = Math.min(320, options.length * 44 + 8)
    const below = window.innerHeight - r.bottom
    const drop = below < maxH + 8 && r.top > below ? 'up' : 'down'
    setPos({
      left: r.left,
      anchor: drop === 'down' ? r.bottom + 4 : window.innerHeight - r.top + 4,
      width: r.width,
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
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    document.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
      document.removeEventListener('keydown', onKey)
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
        className={`flex items-center gap-1.5 rounded-lg border border-border-strong bg-surface px-2 py-1.5 text-sm text-gray-700 dark:text-gray-300 ${className}`}
      >
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
          <div
            ref={panelRef}
            role="listbox"
            style={{
              position: 'fixed',
              left: pos.left,
              width: Math.max(pos.width, 220),
              ...(pos.drop === 'down' ? { top: pos.anchor } : { bottom: pos.anchor }),
            }}
            className="z-50 max-h-80 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-surface py-1 shadow-lg"
          >
            {options.map((a) => {
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
                  className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm ${
                    isSel
                      ? 'bg-green-50 dark:bg-green-900/20'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  <AccountTypeIcon
                    type={a.type}
                    className={`h-5 w-5 shrink-0 ${
                      isSel
                        ? 'text-money-in'
                        : 'text-fg-muted'
                    }`}
                  />
                  <span
                    className={`flex-1 truncate ${
                      isSel
                        ? 'font-medium text-green-700 dark:text-green-300'
                        : 'text-gray-700 dark:text-gray-200'
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
                </button>
              )
            })}
            {options.length === 0 && (
              <p className="px-3 py-4 text-center text-xs text-fg-muted">
                Không có tài khoản
              </p>
            )}
          </div>
        </>
      )}
    </>
  )
}
