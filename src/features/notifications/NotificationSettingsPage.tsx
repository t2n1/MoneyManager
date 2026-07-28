import { useProfile, useUpdateProfile } from '../../hooks/queries'
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
      <h2 className="mb-2 px-1 text-[0.6875rem] font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500">
        {title}
      </h2>
      <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl bg-white dark:divide-gray-800 dark:bg-gray-900">
        {types.map((t) => {
          const meta = NOTIFICATION_META[t]
          const on = !off.has(t)
          return (
            <li key={t} className="min-h-11 flex items-start gap-3 px-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-800 dark:text-gray-100">
                  {meta.label}
                </p>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{meta.hint}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-label={`${on ? 'Tắt' : 'Bật'} ${meta.label}`}
                onClick={() => onToggle(t, !on)}
                className={`mt-0.5 h-6 w-11 shrink-0 rounded-full transition ${
                  on ? 'bg-green-600' : 'bg-gray-300 dark:bg-gray-700'
                }`}
              >
                <span
                  className={`block h-5 w-5 rounded-full bg-white shadow transition ${
                    on ? 'translate-x-[1.375rem]' : 'translate-x-0.5'
                  }`}
                />
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

  const off = new Set(profile?.notif_off ?? [])

  function toggle(type: NotificationType, on: boolean) {
    const next = new Set(off)
    if (on) next.delete(type)
    else next.add(type)
    updateProfile.mutate({ notif_off: [...next] })
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
