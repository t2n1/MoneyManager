import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Bell, ChevronDown, Settings2, X } from 'lucide-react'
import { NOTIFICATION_META, type AppNotification } from './types'

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
  // Bề mặt trạng thái theo TOKEN, không theo bảng màu thô: cả bản 1a đặt cược vào việc
  // quyết định contrast nằm ở MỘT chỗ (src/index.css). Ba dòng bg-red-50/bg-amber-50 cũ
  // ở đây không đi theo token nên lần nâng nền chip ở chế độ tối không chạm tới chúng —
  // đúng loại lỗi đã bắt được ở 32 chỗ text-green-700 dark:text-green-400.
  const tone =
    n.severity === 'high'
      ? 'bg-state-bad-bg border-state-bad-border'
      : n.severity === 'medium'
        ? 'bg-state-warn-bg border-state-warn-border'
        : 'bg-surface border-border-subtle'
  const cta = NOTIFICATION_META[n.type].cta

  return (
    <div className={`flex gap-2 rounded-lg border px-3 py-2 ${tone} ${read ? 'opacity-50' : ''}`}>
      {n.severity === 'high' ? (
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-money-out" />
      ) : (
        <Bell className="mt-0.5 h-4 w-4 shrink-0 text-fg-muted" />
      )}
      <Link to={n.to} onClick={onClose} className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-fg-primary">{n.title}</p>
        {n.detail && <p className="mt-0.5 text-xs text-fg-secondary">{n.detail}</p>}
        {/* Nút ngữ cảnh của 22a. Là <span> BÊN TRONG cùng một <Link>, không phải một
            <button> riêng: đích của nút trùng đúng đích của cả dòng, nên một phần tử bấm
            được lồng trong phần tử bấm được vừa là HTML sai vừa cho bàn phím hai chặng
            Tab tới cùng một chỗ. Nó vẫn trông như nút để mắt biết dòng này có bước kế
            tiếp — thứ mà 22a muốn — nhưng chỉ có MỘT vùng bấm.
            Không có `cta` thì không vẽ gì: xem chú thích ở NotificationTypeMeta.cta. */}
        {cta && (
          <span className="mt-1.5 inline-flex items-center rounded-md border border-border-strong px-2 py-1 text-2xs font-semibold text-fg-secondary">
            {cta}
          </span>
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
          className="-my-2 -mr-2 flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded text-fg-muted hover:text-fg-primary"
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
      className="flex min-h-11 w-full items-center justify-center gap-1 rounded-lg text-xs font-medium text-fg-muted hover:bg-surface-sunken hover:text-fg-secondary"
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
        <h2 className="text-base font-bold text-fg-primary">Thông báo</h2>
        {actionsAll.length > 0 && (
          <span className="text-xs text-fg-muted">
            {actionsAll.length} việc cần làm
          </span>
        )}
        {/* Chữ chứ không chỉ một bánh răng (22a ghi "Bật / tắt từng loại ›"): đây là
            đường thoát cho người bị một loại tin làm phiền, mà một icon 16px thì phải
            đoán mới biết nó dẫn tới đâu. Icon giữ lại để mắt quen vị trí. */}
        <Link
          to="/settings/notifications"
          onClick={onClose}
          className="-my-2 ml-auto inline-flex min-h-11 shrink-0 items-center gap-1 rounded px-1 text-2xs font-medium text-fg-accent"
        >
          <Settings2 className="h-3.5 w-3.5" aria-hidden />
          Bật / tắt từng loại ›
        </Link>
      </div>

      <div className="flex-1 space-y-1.5 overflow-y-auto px-1 pb-1">
        {empty && (
          <p className="rounded-lg border border-state-good-border bg-state-good-bg py-3 text-center text-sm font-semibold text-state-good-fg">
            Không có gì cần để ý 👍
          </p>
        )}

        {shownActions.length > 0 && (
          <p className="pt-1 text-3xs font-bold uppercase tracking-wide text-fg-muted">
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
          <p className="pt-2 text-3xs font-bold uppercase tracking-wide text-fg-muted">
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
