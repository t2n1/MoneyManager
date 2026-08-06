import { useEffect, useState } from 'react'
import { Card } from '../../components/ui/Card'
import { useProfile, useUpdateProfile } from '../../hooks/queries'
import { showToast } from '../../lib/dialog'
import { BLOCKER_MESSAGE } from './pushEligibility'
import { getPushState, subscribeThisDevice, unsubscribeThisDevice, type PushState } from './pushClient'
import { NOTIFICATION_META, NOTIFICATION_TYPES, type NotificationType } from './types'

/** Công tắc dùng lại cho cả danh sách loại và khối đẩy thông báo. */
function Switch({
  on,
  disabled = false,
  labelledBy,
  describedBy,
  onToggle,
}: {
  on: boolean
  disabled?: boolean
  labelledBy: string
  describedBy?: string
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={onToggle}
      className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full disabled:opacity-50"
    >
      <span
        className={`block h-6 w-11 rounded-full transition ${
          on ? 'bg-green-700' : 'bg-gray-300 dark:bg-gray-700'
        }`}
      >
        <span
          className={`block h-5 w-5 rounded-full bg-white shadow transition ${
            on ? 'translate-x-[1.375rem]' : 'translate-x-0.5'
          }`}
        />
      </span>
    </button>
  )
}

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => h)

/**
 * Múi giờ để chọn. Không liệt kê cả bảng IANA (hơn 400 dòng, không ai cuộn hết) —
 * chỉ những nơi chủ app thật sự có thể ở, cộng múi giờ của chính máy đang dùng và giá
 * trị đang lưu (để không bao giờ hiện một ô chọn không chứa giá trị hiện tại).
 */
function timezoneOptions(current: string): string[] {
  const device = Intl.DateTimeFormat().resolvedOptions().timeZone
  return [
    ...new Set([
      current,
      device,
      'Asia/Tokyo',
      'Asia/Ho_Chi_Minh',
      'America/Los_Angeles',
      'America/New_York',
    ]),
  ].filter(Boolean)
}

function PushSection() {
  const { data: profile } = useProfile()
  const updateProfile = useUpdateProfile()
  const [state, setState] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    getPushState().then((s) => {
      if (alive) setState(s)
    })
    return () => {
      alive = false
    }
  }, [])

  async function toggle() {
    if (!state) return
    const turningOn = !state.subscribed
    setBusy(true)
    try {
      // Gọi THẲNG, không await gì trước: subscribeThisDevice xin quyền ngay dòng đầu,
      // và iOS chỉ cho xin quyền bên trong cử chỉ của người dùng.
      if (turningOn) await subscribeThisDevice()
      else await unsubscribeThisDevice()
      showToast(
        turningOn ? 'Đã bật thông báo cho máy này' : 'Đã tắt thông báo cho máy này',
        'success',
      )
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Không đổi được cài đặt thông báo', 'error')
    } finally {
      // Đọc lại trạng thái THẬT từ trình duyệt dù thành công hay lỗi: bấm xong mà công
      // tắc hiện sai là người dùng tưởng đã bật rồi ngồi chờ thông báo không bao giờ tới.
      setState(await getPushState())
      setBusy(false)
    }
  }

  function saveSchedule(patch: { push_hour?: number; push_tz?: string }) {
    updateProfile.mutate(patch, {
      onError: (e) => showToast(e instanceof Error ? e.message : 'Không lưu được giờ gửi', 'error'),
    })
  }

  const blocker = state?.blocker ?? 'ok'
  const canToggle = state !== null && blocker === 'ok'
  const inputClass =
    'mt-1 w-full rounded-xl border border-border-strong bg-surface p-3 text-fg-primary focus:border-green-500 focus:outline-none'

  return (
    <section className="mb-5">
      <h2 className="mb-2 px-1 text-2xs font-bold uppercase tracking-wide text-fg-muted">
        Đẩy ra ngoài app
      </h2>
      {/* padding="none" vì các hàng bên trong tự có px-3 py-2 và có đường kẻ chia —
          giống hệt <ul> của Group bên dưới. */}
      <Card padding="none" className="overflow-hidden">
        <div className="flex items-start gap-3 px-3 py-2">
          <div className="min-w-0 flex-1">
            <p id="push-toggle-label" className="text-sm font-medium text-fg-primary">
              Nhận thông báo trên máy này
            </p>
            <p id="push-toggle-hint" className="mt-0.5 text-xs text-fg-muted">
              Chỉ đẩy nhóm “Việc cần làm”, mỗi ngày một lần, mỗi việc chỉ một lần. Bật/tắt
              riêng cho từng máy.
            </p>
          </div>
          <Switch
            on={state?.subscribed ?? false}
            disabled={!canToggle || busy}
            labelledBy="push-toggle-label"
            describedBy="push-toggle-hint"
            onToggle={toggle}
          />
        </div>

        {blocker !== 'ok' && (
          <p className="border-t border-gray-100 px-3 py-3 text-xs text-fg-muted dark:border-gray-800">
            {BLOCKER_MESSAGE[blocker]}
          </p>
        )}

        {profile && (
          <div className="border-t border-gray-100 px-3 py-3 dark:border-gray-800">
            <label htmlFor="push-hour" className="block text-xs font-medium text-fg-muted">
              Giờ gửi mỗi ngày
            </label>
            <select
              id="push-hour"
              value={profile.push_hour}
              onChange={(e) => saveSchedule({ push_hour: Number(e.target.value) })}
              className={inputClass}
            >
              {HOUR_OPTIONS.map((h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, '0')}:00
                </option>
              ))}
            </select>

            <label htmlFor="push-tz" className="mt-3 block text-xs font-medium text-fg-muted">
              Giờ ở đâu
            </label>
            <select
              id="push-tz"
              value={profile.push_tz}
              onChange={(e) => saveSchedule({ push_tz: e.target.value })}
              className={inputClass}
            >
              {timezoneOptions(profile.push_tz).map((tz) => (
                <option key={tz} value={tz}>
                  {/* replaceAll, không replace: 'Asia/Ho_Chi_Minh' có hai dấu gạch dưới
                      nên replace một lần ra 'Asia/Ho Chi_Minh'. */}
                  {tz.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-fg-muted">
              Giờ gửi tính theo nơi này, không phải theo máy — đổi nước thì sửa ở đây một lần,
              không phải sửa lại giờ.
            </p>
          </div>
        )}
      </Card>
    </section>
  )
}

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
      <h2 className="mb-2 px-1 text-2xs font-bold uppercase tracking-wide text-fg-muted">
        {title}
      </h2>
      <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl bg-surface dark:divide-gray-800 ">
        {types.map((t) => {
          const meta = NOTIFICATION_META[t]
          const on = !off.has(t)
          const labelId = `notif-toggle-label-${t}`
          const hintId = `notif-toggle-hint-${t}`
          return (
            // py-2 thôi: khối chữ 2 dòng + nút gạt 44px đã tự cao ~54px rồi
            <li key={t} className="flex items-start gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p
                  id={labelId}
                  className="text-sm font-medium text-fg-primary"
                >
                  {meta.label}
                </p>
                <p id={hintId} className="mt-0.5 text-xs text-fg-muted">
                  {meta.hint}
                </p>
              </div>
              {/* Nút bấm to bằng cả ô 44x44 để dễ trúng tay, hình vẽ công tắc bên trong vẫn nhỏ như cũ */}
              {/* aria-labelledby trỏ vào tên loại thông báo (đối tượng), không phải "Tắt/Bật X"
                  (hành động) — nếu không, trình đọc màn hình đọc trạng thái 2 lần, một lần bị đảo. */}
              <Switch
                on={on}
                labelledBy={labelId}
                describedBy={hintId}
                onToggle={() => onToggle(t, !on)}
              />
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
      <h1 className="mb-1 text-lg font-bold text-fg-primary">Thông báo</h1>
      <p className="mb-4 text-sm text-fg-muted">
        Tắt loại nào thì loại đó không hiện trong chuông nữa. Mặc định bật hết.
      </p>
      <PushSection />
      <Group title="Việc cần làm" types={actions} off={off} onToggle={toggle} />
      <Group title="Tin để biết" types={infos} off={off} onToggle={toggle} />
    </div>
  )
}
