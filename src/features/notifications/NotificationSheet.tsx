import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Bell, ChevronDown, Settings2, X } from 'lucide-react'
import type { AppNotification } from './types'

interface Props {
  /** Việc cần làm phần thu gọn (đã cắt trần). */
  actions: AppNotification[]
  /** Tin để biết phần thu gọn (đã cắt trần). */
  infos: AppNotification[]
  /** Việc cần làm ĐẦY ĐỦ — phần thừa nằm ở đây, bấm mới xổ (mục C.4). */
  actionsAll: AppNotification[]
  /** Tin để biết ĐẦY ĐỦ. */
  infosAll: AppNotification[]
  readKeys: Set<string>
  /** Người dùng vừa xổ phần bị cắt trần → giờ mới tính là đã đọc mấy mã này. */
  onReveal: (keys: string[]) => void
  onDismiss: (key: string) => void
  onClose: () => void
}

function Row({
  n,
  read,
  onDismiss,
  onClose,
}: {
  n: AppNotification
  read: boolean
  onDismiss?: () => void
  onClose: () => void
}) {
  const tone =
    n.severity === 'high'
      ? 'bg-red-50 border-red-200 dark:bg-red-950/40 dark:border-red-900'
      : n.severity === 'medium'
        ? 'bg-amber-50 border-amber-200 dark:bg-amber-950/40 dark:border-amber-900'
        : 'bg-white border-gray-100 dark:bg-gray-800 dark:border-gray-700'

  return (
    <div className={`flex gap-2 rounded-lg border px-3 py-2 ${tone} ${read ? 'opacity-50' : ''}`}>
      {n.severity === 'high' ? (
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
      ) : (
        <Bell className="mt-0.5 h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" />
      )}
      <Link to={n.to} onClick={onClose} className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{n.title}</p>
        {n.detail && (
          <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">{n.detail}</p>
        )}
      </Link>
      {onDismiss && (
        // Bấm ✕ là MẤT HẲN, không quay lại (mục D.2) — nên vùng bấm phải đủ 44x44 như
        // mọi nút khác trong app, kẻo chạm lệch một chút là tắt oan một tin.
        // Hình ✕ vẫn nhỏ như cũ, chỉ vùng bấm to ra (cùng lối với trang cài đặt).
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Bỏ qua tin này"
          className="-my-2 -mr-2 flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}

/**
 * Dòng "còn N tin nữa" — là NÚT thật, bấm là xổ phần bị cắt trần ra (mục C.4 của
 * spec: "phần thừa gom vào dòng 'Còn N tin khác', bấm mới xổ").
 *
 * Mỗi nhóm một dòng riêng, không gộp số: việc-cần-làm bị ẩn mà báo dưới nhóm
 * "Tin để biết" thì người dùng tưởng chỉ là mẹo nhỏ, bỏ qua luôn.
 */
function MoreButton({
  count,
  open,
  label,
  onToggle,
}: {
  count: number
  open: boolean
  label: string
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="flex min-h-11 w-full items-center justify-center gap-1 rounded-lg text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
    >
      {open ? 'Thu gọn' : `Xem thêm ${count} ${label}`}
      <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
    </button>
  )
}

/** Phần tử của `all` chưa nằm trong `shown` — đúng những gì nút "xem thêm" xổ ra. */
function extraOf(all: AppNotification[], shown: AppNotification[]): AppNotification[] {
  const seen = new Set(shown.map((n) => n.key))
  return all.filter((n) => !seen.has(n.key))
}

/**
 * Nội dung tấm trượt. Việc-cần-làm KHÔNG có nút ✕ — nạp tiền/trả nợ/hết tháng thì
 * nó tự biến mất. Muốn khỏi thấy hẳn thì tắt cả loại trong cài đặt (mục D.2 spec).
 */
export function NotificationSheet({
  actions,
  infos,
  actionsAll,
  infosAll,
  readKeys,
  onReveal,
  onDismiss,
  onClose,
}: Props) {
  // Mặc định LUÔN thu gọn mỗi lần mở: tấm trượt bị tháo hẳn khi đóng chuông nên
  // useState chạy lại từ đầu, không cần dọn tay.
  const [actionsOpen, setActionsOpen] = useState(false)
  const [infosOpen, setInfosOpen] = useState(false)

  const extraActions = extraOf(actionsAll, actions)
  const extraInfos = extraOf(infosAll, infos)
  const shownActions = actionsOpen ? actionsAll : actions
  const shownInfos = infosOpen ? infosAll : infos
  const empty = actionsAll.length === 0 && infosAll.length === 0

  // Xổ ra = người dùng vừa nhìn thấy → giờ mới đánh dấu đã đọc. Quyết định có chủ ý
  // (mục E): việc-cần-làm "đã đọc" chỉ mờ đi chứ không mất, nên đánh dấu ở đây là an
  // toàn và làm số đỏ trên chuông tắt được. Nếu đánh dấu ngay lúc MỞ chuông thì một
  // tin-để-biết bị cắt trần sẽ mất vĩnh viễn mà chủ nó chưa từng thấy; nếu KHÔNG bao
  // giờ đánh dấu thì xem hết rồi chuông vẫn đỏ mãi. Xổ mới đánh dấu là chỗ đúng giữa.
  function toggle(open: boolean, setOpen: (v: boolean) => void, extra: AppNotification[]) {
    if (!open) onReveal(extra.map((n) => n.key))
    setOpen(!open)
  }

  return (
    <div className="flex max-h-[70vh] flex-col">
      <div className="mb-2 flex items-baseline gap-2 px-1">
        <h2 className="text-base font-bold text-gray-800 dark:text-gray-100">Thông báo</h2>
        {actionsAll.length > 0 && (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {actionsAll.length} việc cần làm
          </span>
        )}
        <Link
          to="/settings/notifications"
          onClick={onClose}
          aria-label="Cài đặt thông báo"
          className="ml-auto rounded p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
        >
          <Settings2 className="h-4 w-4" />
        </Link>
      </div>

      <div className="flex-1 space-y-1.5 overflow-y-auto px-1 pb-1">
        {empty && (
          <p className="rounded-lg bg-green-50 py-3 text-center text-sm font-semibold text-green-700 dark:bg-green-950/40 dark:text-green-400">
            Không có gì cần để ý 👍
          </p>
        )}

        {shownActions.length > 0 && (
          <p className="pt-1 text-[0.625rem] font-bold uppercase tracking-wide text-gray-400">
            Việc cần làm
          </p>
        )}
        {shownActions.map((n) => (
          <Row key={n.key} n={n} read={readKeys.has(n.key)} onClose={onClose} />
        ))}
        {extraActions.length > 0 && (
          <MoreButton
            count={extraActions.length}
            open={actionsOpen}
            label="việc cần làm"
            onToggle={() => toggle(actionsOpen, setActionsOpen, extraActions)}
          />
        )}

        {shownInfos.length > 0 && (
          <p className="pt-2 text-[0.625rem] font-bold uppercase tracking-wide text-gray-400">
            Tin để biết
          </p>
        )}
        {shownInfos.map((n) => (
          <Row
            key={n.key}
            n={n}
            read={false}
            onDismiss={() => onDismiss(n.key)}
            onClose={onClose}
          />
        ))}
        {extraInfos.length > 0 && (
          <MoreButton
            count={extraInfos.length}
            open={infosOpen}
            label="tin để biết"
            onToggle={() => toggle(infosOpen, setInfosOpen, extraInfos)}
          />
        )}
      </div>
    </div>
  )
}
