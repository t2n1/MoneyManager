// Thông báo — bật/tắt từng loại, và lịch đẩy ra ngoài app.
//
// ---- Vì sao vẽ lại (redesign 2026-08-30) -------------------------------------------
//
// Bản trước xếp 20 hàng công tắc thành MỘT cột chạy hết bề ngang. Đo ở 1440×900: chữ
// "Tài khoản sắp không đủ tiền" kết thúc ở x≈506, công tắc của chính nó bắt đầu ở
// x=1345 — **839px trống** giữa cái tên và cái nút của nó, lặp 20 lần. Mắt phải bắc cầu
// qua một khoảng trắng bằng nửa màn hình để biết dòng nào đang bật.
//
// Đây đúng là bệnh mà chú thích ở SettingsPage đã gọi tên từ trước ("kéo rộng ra thì nhãn
// và ô bật/tắt rời nhau hai đầu màn hình") nhưng chưa chữa ở trang này. Cách chữa cũng
// giống hệt: CHIA CỘT thay vì nới cột. Lưới tự chia, mỗi thẻ giữ bề rộng đọc được.
//
// Thêm một thứ bản trước không có: mỗi nhóm nói ra "đang bật mấy trên mấy", và có nút
// bật/tắt cả nhóm — 20 công tắc mà muốn tắt hết thì 20 cú bấm.
import { useEffect, useState } from 'react'
import { Guide } from '../../components/Guide'
import { useDensity } from '../../hooks/useDensity'
import { useProfile, useUpdateProfile } from '../../hooks/queries'
import { showToast } from '../../lib/dialog'
import { BLOCKER_MESSAGE } from './pushEligibility'
import { getPushState, subscribeThisDevice, unsubscribeThisDevice, type PushState } from './pushClient'
import { NOTIFICATION_META, NOTIFICATION_TYPES, type NotificationType } from './types'
import {
  ActionButton,
  Card,
  Num,
  PageHeader,
  PanelHeader,
  Select,
} from '../../components/ui'

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
      {/* Đường ray TẮT dùng token `border-strong`, không phải `bg-gray-300 dark:bg-gray-700`
          viết tay: thang xám đó là bảng cũ, và ba công tắc khác trong app (Nhóm tài sản,
          Tài khoản, bảng theo năm) đã đi bằng token — để lại đây là bốn cái công tắc cùng
          hình mà hai sắc xám. */}
      <span
        className={`block h-6 w-11 rounded-full transition ${on ? 'bg-accent' : 'bg-border-strong'}`}
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
  // Xem chú thích ở Group: câu mô tả có id được aria-describedby trỏ vào, nên ẩn chữ
  // và bỏ tham chiếu phải đi cùng nhau.
  const { visual } = useDensity()
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

  return (
    <Card as="section" elevation="panel" padding="none" className="overflow-hidden">
      <PanelHeader right={state?.subscribed ? 'đang bật' : 'đang tắt'}>Đẩy ra ngoài app</PanelHeader>

      <div className="flex items-start gap-3 px-3 py-2">
        <div className="min-w-0 flex-1">
          <p id="push-toggle-label" className="text-sm font-medium text-fg-primary">
            Nhận thông báo trên máy này
          </p>
          {!visual && (
            <p id="push-toggle-hint" className="mt-0.5 text-sm text-fg-muted">
              Chỉ đẩy nhóm “Việc cần làm”, mỗi ngày một lần, mỗi việc chỉ một lần. Bật/tắt
              riêng cho từng máy.
            </p>
          )}
        </div>
        <Switch
          on={state?.subscribed ?? false}
          disabled={!canToggle || busy}
          labelledBy="push-toggle-label"
          describedBy={visual ? undefined : 'push-toggle-hint'}
          onToggle={toggle}
        />
      </div>

      {blocker !== 'ok' && (
        // Bề mặt cảnh báo chứ chữ xám: đây là lý do công tắc ngay trên KHÔNG bấm được.
        // Một câu xám dưới một công tắc mờ thì đọc như chú thích, không đọc như lời chặn.
        <div className="border-t border-border-subtle px-3 py-3">
          <p className="rounded-md border border-state-warn-border bg-state-warn-bg p-2.5 text-sm text-state-warn-fg">
            {BLOCKER_MESSAGE[blocker]}
          </p>
        </div>
      )}

      {profile && (
        <div className="border-t border-border-subtle px-3 py-3">
          <label htmlFor="push-hour" className="block text-sm font-medium text-fg-muted">
            Giờ gửi mỗi ngày
          </label>
          <Select
            id="push-hour"
            value={profile.push_hour}
            onChange={(e) => saveSchedule({ push_hour: Number(e.target.value) })}
            wrapClassName="mt-1 w-full"
          >
            {HOUR_OPTIONS.map((h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, '0')}:00
              </option>
            ))}
          </Select>

          <label htmlFor="push-tz" className="mt-3 block text-sm font-medium text-fg-muted">
            Giờ ở đâu
          </label>
          <Select
            id="push-tz"
            value={profile.push_tz}
            onChange={(e) => saveSchedule({ push_tz: e.target.value })}
            wrapClassName="mt-1 w-full"
          >
            {timezoneOptions(profile.push_tz).map((tz) => (
              <option key={tz} value={tz}>
                {/* replaceAll, không replace: 'Asia/Ho_Chi_Minh' có hai dấu gạch dưới
                    nên replace một lần ra 'Asia/Ho Chi_Minh'. */}
                {tz.replaceAll('_', ' ')}
              </option>
            ))}
          </Select>
          <Guide className="mt-1 text-sm text-fg-muted">
            Giờ gửi tính theo nơi này, không phải theo máy — đổi nước thì sửa ở đây một lần,
            không phải sửa lại giờ.
          </Guide>
        </div>
      )}
    </Card>
  )
}

function Group({
  title,
  types,
  off,
  onToggle,
  onSetAll,
}: {
  title: string
  types: NotificationType[]
  off: Set<string>
  onToggle: (t: NotificationType, on: boolean) => void
  onSetAll: (types: NotificationType[], on: boolean) => void
}) {
  // Không dùng <Guide> ở đây mà đọc thẳng chế độ: câu mô tả có `id` được
  // `aria-describedby` của nút gạt trỏ vào, nên phải TẮT CẢ HAI cùng lúc. Để <Guide>
  // ẩn <p> mà vẫn giữ describedBy là tạo tham chiếu treo tới id không còn tồn tại.
  const { visual } = useDensity()
  const onCount = types.filter((t) => !off.has(t)).length
  const allOn = onCount === types.length

  return (
    <Card as="section" elevation="panel" padding="none" className="overflow-hidden">
      <PanelHeader
        right={
          <>
            <Num tone="muted">{onCount}</Num>/<Num tone="muted">{types.length}</Num> đang bật
          </>
        }
      >
        {title}
      </PanelHeader>

      <ul className="divide-y divide-border-subtle">
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
                {!visual && (
                  <p id={hintId} className="mt-0.5 text-sm text-fg-muted">
                    {meta.hint}
                  </p>
                )}
              </div>
              {/* Nút bấm to bằng cả ô 44x44 để dễ trúng tay, hình vẽ công tắc bên trong vẫn nhỏ như cũ */}
              {/* aria-labelledby trỏ vào tên loại thông báo (đối tượng), không phải "Tắt/Bật X"
                  (hành động) — nếu không, trình đọc màn hình đọc trạng thái 2 lần, một lần bị đảo. */}
              <Switch
                on={on}
                labelledBy={labelId}
                describedBy={visual ? undefined : hintId}
                onToggle={() => onToggle(t, !on)}
              />
            </li>
          )
        })}
      </ul>

      {/* Một nút cho cả nhóm, ở CHÂN chứ không ở đầu: nó là lối tắt, không phải thứ đọc
          trước. Nhãn nói ra việc sắp làm ("Tắt hết") chứ không nói trạng thái. */}
      <div className="border-t border-border-subtle px-3 py-2">
        <ActionButton onClick={() => onSetAll(types, !allOn)}>
          {allOn ? 'Tắt hết nhóm này' : 'Bật hết nhóm này'}
        </ActionButton>
      </div>
    </Card>
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

  /** Ghi một danh sách `notif_off` mới, giữ nguyên lối lạc quan của bản trước. */
  function save(nextArr: string[]) {
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

  function toggle(type: NotificationType, on: boolean) {
    const next = new Set(effectiveOff)
    if (on) next.delete(type)
    else next.add(type)
    save([...next])
  }

  /** Bật/tắt cả một nhóm trong MỘT lượt ghi, không phải N lượt. */
  function setAll(types: NotificationType[], on: boolean) {
    const next = new Set(effectiveOff)
    for (const t of types) {
      if (on) next.delete(t)
      else next.add(t)
    }
    save([...next])
  }

  const actions = NOTIFICATION_TYPES.filter((t) => NOTIFICATION_META[t].kind === 'action')
  const infos = NOTIFICATION_TYPES.filter((t) => NOTIFICATION_META[t].kind === 'info')

  return (
    <div className="flex flex-col gap-3 p-3 lg:p-6">
      {/* Hàng đầu giống mọi trang con khác của Cài đặt: nút lùi + tên trang. Thiếu nút
          này thì trên điện thoại lối ra duy nhất là thanh tab dưới — mà nó nhả về gốc
          Cài đặt, không phải chỗ vừa đến. */}
      <PageHeader title="Thông báo" back="/settings" flush />
      <Guide className="text-sm text-fg-muted">
        Tắt loại nào thì loại đó không hiện trong chuông nữa. Mặc định bật hết.
      </Guide>

      {/* Lưới tự chia — xem chú thích đầu file. `items-start` để thẻ ngắn (Đẩy ra ngoài
          app) không bị kéo cao bằng thẻ 12 dòng cạnh nó. */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(20rem,1fr))] items-start gap-3">
        <PushSection />
        <Group title="Việc cần làm" types={actions} off={off} onToggle={toggle} onSetAll={setAll} />
        <Group title="Tin để biết" types={infos} off={off} onToggle={toggle} onSetAll={setAll} />
      </div>
    </div>
  )
}
