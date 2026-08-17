// Chọn tài khoản trước khi ghi lệnh — chỉ hiện khi có từ hai tài khoản. Dùng chung cho
// cả hai tab của trang Đầu tư: cổ phiếu VN và quỹ Nhật hỏi đúng một câu như nhau, chỉ
// khác danh sách tài khoản truyền vào.
import type { AccountRow } from '../../types/database.types'

interface Props {
  accounts: AccountRow[]
  onPick: (accountId: string) => void
  onClose: () => void
}

export function InvestTradeAccountPicker({ accounts, onPick, onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 lg:items-center animate-overlay-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:rounded-2xl animate-sheet-in lg:animate-sheet-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-3 text-base font-bold text-fg-primary">Ghi lệnh vào tài khoản nào?</h2>
        <ul className="flex flex-col gap-2">
          {accounts.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => onPick(a.id)}
                className="min-h-11 w-full rounded-lg border border-border-strong px-3 text-left text-sm font-medium text-fg-primary hover:bg-surface-sunken"
              >
                {a.name}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
