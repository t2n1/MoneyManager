// Chip chọn tài khoản cho hai tab của trang Đầu tư.
//
// CHỈ hiện khi tab có từ HAI tài khoản. Một tài khoản thì "Tất cả" và tên tài khoản đó là
// cùng một thứ — một hàng chip đúng với mọi lần mở là một hàng nhiễu.
import type { AccountRow } from '../../types/database.types'

interface Props {
  accounts: AccountRow[]
  /** null = đang xem tất cả */
  activeId: string | null
  onPick: (id: string | null) => void
}

export function InvestAccountChips({ accounts, activeId, onPick }: Props) {
  if (accounts.length < 2) return null

  const chip = (key: string, label: string, active: boolean, id: string | null) => (
    <button
      key={key}
      type="button"
      onClick={() => onPick(id)}
      aria-pressed={active}
      className={`min-h-8 shrink-0 rounded-full px-3 text-xs font-medium ${
        active
          ? 'bg-fg-primary text-surface'
          : 'border border-border-strong text-fg-secondary hover:bg-surface-sunken'
      }`}
    >
      {label}
    </button>
  )

  return (
    <div className="flex flex-wrap gap-1.5">
      {chip('all', 'Tất cả', activeId === null, null)}
      {accounts.map((a) => chip(a.id, a.name, activeId === a.id, a.id))}
    </div>
  )
}
