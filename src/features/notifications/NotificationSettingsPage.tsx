import { useState } from 'react'
import { useProfile, useUpdateProfile } from '../../hooks/queries'
import { showToast } from '../../lib/dialog'
import { NOTIFICATION_META, NOTIFICATION_TYPES, type NotificationType } from './types'

function Group({
  title,
  types,
  off,
  onToggle,
}: {
  title: string
  types: NotificationType[]
  off: Set<string>
  onToggle: (t: NotificationType, on: boolean) => void
}) {
  return (
    <section className="mb-5">
      <h2 className="mb-2 px-1 text-[0.6875rem] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {title}
      </h2>
      <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl bg-white dark:divide-gray-800 dark:bg-gray-900">
        {types.map((t) => {
          const meta = NOTIFICATION_META[t]
          const on = !off.has(t)
          const labelId = `notif-toggle-label-${t}`
          const hintId = `notif-toggle-hint-${t}`
          return (
            <li key={t} className="flex items-start gap-3 px-3 py-3">
              <div className="min-w-0 flex-1">
                <p
                  id={labelId}
                  className="text-sm font-medium text-gray-800 dark:text-gray-100"
                >
                  {meta.label}
                </p>
                <p id={hintId} className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  {meta.hint}
                </p>
              </div>
              {/* Nút bấm to bằng cả ô 44x44 để dễ trúng tay, hình vẽ công tắc bên trong vẫn nhỏ như cũ */}
              {/* aria-labelledby trỏ vào tên loại thông báo (đối tượng), không phải "Tắt/Bật X"
                  (hành động) — nếu không, trình đọc màn hình đọc trạng thái 2 lần, một lần bị đảo. */}
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-labelledby={labelId}
                aria-describedby={hintId}
                onClick={() => onToggle(t, !on)}
                className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full"
              >
                <span
                  className={`block h-6 w-11 rounded-full transition ${
                    on ? 'bg-green-600' : 'bg-gray-300 dark:bg-gray-700'
                  }`}
                >
                  <span
                    className={`block h-5 w-5 rounded-full bg-white shadow transition ${
                      on ? 'translate-x-[1.375rem]' : 'translate-x-0.5'
                    }`}
                  />
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export function NotificationSettingsPage() {
  const { data: profile } = useProfile()
  const updateProfile = useUpdateProfile()
  // Bản nháp chờ máy chủ xác nhận — bấm liên tiếp nhiều công tắc thì thay đổi
  // trước không bị đè mất, vì công tắc sau tính tiếp từ bản nháp này chứ không
  // phải từ dữ liệu cũ trên máy chủ.
  const [pendingOff, setPendingOff] = useState<string[] | null>(null)

  const effectiveOff = pendingOff ?? profile?.notif_off ?? []
  const off = new Set(effectiveOff)

  function toggle(type: NotificationType, on: boolean) {
    const next = new Set(effectiveOff)
    if (on) next.delete(type)
    else next.add(type)
    const nextArr = [...next]
    setPendingOff(nextArr)
    updateProfile.mutate(
      { notif_off: nextArr },
      {
        onError: (e) =>
          showToast(e instanceof Error ? e.message : 'Không lưu được cài đặt thông báo', 'error'),
        onSettled: () =>
          // Nếu đã có lần bấm mới hơn ghi đè bản nháp thì để lần đó tự dọn,
          // tránh xoá nhầm thay đổi chưa kịp lưu.
          setPendingOff((current) => (current === nextArr ? null : current)),
      },
    )
  }

  const actions = NOTIFICATION_TYPES.filter((t) => NOTIFICATION_META[t].kind === 'action')
  const infos = NOTIFICATION_TYPES.filter((t) => NOTIFICATION_META[t].kind === 'info')

  return (
    <div className="p-3 lg:p-6">
      <h1 className="mb-1 text-lg font-bold text-gray-800 dark:text-gray-100">Thông báo</h1>
      <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
        Tắt loại nào thì loại đó không hiện trong chuông nữa. Mặc định bật hết.
      </p>
      <Group title="Việc cần làm" types={actions} off={off} onToggle={toggle} />
      <Group title="Tin để biết" types={infos} off={off} onToggle={toggle} />
    </div>
  )
}
