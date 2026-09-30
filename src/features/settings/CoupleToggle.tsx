// Bật/tắt chiều "của ai" (cả khoản chi lẫn khoản thu) — bước đầu của việc dùng chung hai người.
//
// Dáng theo đúng khuôn DensityToggle (hai nút có nhãn, không phải switch): switch chỉ có
// tên cho MỘT trạng thái, người đọc phải tự suy tắt nghĩa là gì. Hai nút thì cả hai lựa
// chọn đều tự nói tên mình.
//
// PHẢI NÓI RÕ CÔNG TẮC NÀY KHÔNG PHẢI QUYỀN TRUY CẬP. "Dùng chung" nghe như mở sổ cho
// người khác xem, mà nó chỉ thêm một chiều phân loại trên giao dịch của chính mình —
// chưa có login thứ hai, chưa ai đọc được gì. Hiểu nhầm theo chiều đó là chuyện nghiêm
// trọng, nên câu giải thích KHÔNG bọc <Guide>: nó phải hiện ở cả chế độ Gọn.

import { useId } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, User, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Card, PanelHeader, Select } from '../../components/ui'
import { useAccounts, useProfile, useUpdateProfile } from '../../hooks/queries'
import { showToast } from '../../lib/dialog'
import { accountLabel, tr } from '../../i18n'
import { trn } from '../../i18n/react'

const OPTIONS: { value: boolean; label: string; hint: string; Icon: LucideIcon }[] = [
  { value: false, label: tr('Một mình'), hint: tr('Không hỏi khoản này của ai'), Icon: User },
  { value: true, label: tr('Hai người'), hint: tr('Ghi thêm: mình / người ấy / chung'), Icon: Users },
]

export function CoupleToggle() {
  const { data: profile } = useProfile()
  const update = useUpdateProfile()
  const on = profile?.couple_mode ?? false

  async function chon(value: boolean) {
    if (value === on || update.isPending) return
    try {
      await update.mutateAsync({ couple_mode: value })
    } catch {
      return
    }
    showToast(value ? tr('Đã bật ghi “của ai”') : tr('Đã tắt ghi “của ai”'), 'success')
  }

  return (
    <Card as="section" elevation="panel" padding="none" className="overflow-hidden">
      <PanelHeader right={tr('dùng chung mọi thiết bị')}>{tr('Ghi sổ cùng ai')}</PanelHeader>
      <div className="flex gap-1 p-3">
        {OPTIONS.map((opt) => {
          const active = on === opt.value
          return (
            <button
              key={String(opt.value)}
              type="button"
              onClick={() => chon(opt.value)}
              disabled={update.isPending}
              aria-pressed={active}
              className={`flex flex-1 flex-col items-center gap-1 rounded-md border px-2 py-2.5 text-sm font-medium transition disabled:opacity-60 ${
                active
                  ? 'border-accent bg-state-good-bg text-state-good-fg'
                  : 'border-border-panel text-fg-secondary hover:bg-surface-sunken'
              }`}
            >
              <opt.Icon className="h-5 w-5" />
              {opt.label}
              <span className="text-center text-2xs font-normal text-fg-on-track">{opt.hint}</span>
            </button>
          )
        })}
      </div>
      {on && <SharedFundSettings />}
      {/* E-ink + Gọn: bỏ câu giải thích — hai nút phía trên đã nói lựa chọn. */}
      <p className="px-3 pb-3 text-2xs text-fg-muted eink-gon:hidden">
        {trn('Đây chỉ là {b} trên sổ của bạn — chưa có tài khoản đăng nhập thứ hai và chưa ai xem được sổ này. Tắt lại không mất dữ liệu đã gắn.', {
          b: <b>{tr('một chiều phân loại')}</b>,
        })}
      </p>
    </Card>
  )
}

/**
 * Tên người kia + tài khoản quỹ chung (migration 0073). Chỉ hiện khi đã chọn "Hai người":
 * một mình thì không có ai để đặt tên, không có quỹ nào để chung.
 */
function SharedFundSettings() {
  const uid = useId()
  const { data: profile } = useProfile()
  const { data: accounts = [] } = useAccounts()
  const update = useUpdateProfile()
  const saved = profile?.partner_name ?? ''
  const fundId = profile?.shared_fund_account_id ?? ''
  // Thẻ tín dụng không giữ tiền nên không làm quỹ được; tài khoản đang là quỹ thì vẫn hiện
  // dù đã lưu trữ, không thì ô chọn nhảy sang "Chưa đặt" mà dữ liệu vẫn trỏ vào nó.
  const choices = accounts.filter((a) => a.type !== 'card' && (!a.is_archived || a.id === fundId))

  async function save(patch: { partner_name?: string; shared_fund_account_id?: string | null }) {
    try {
      await update.mutateAsync(patch)
      showToast(tr('Đã lưu'), 'success')
    } catch (e) {
      showToast(e instanceof Error ? e.message : tr('Lưu thất bại, thử lại.'), 'error')
    }
  }

  return (
    <div className="flex flex-col gap-3 border-t border-border-subtle px-3 py-3">
      <div>
        <label htmlFor={`${uid}-name`} className="block text-sm font-medium text-fg-muted">
          {tr('Tên người kia')}
        </label>
        {/* Không điều khiển + `key={saved}`: hồ sơ tải xong (hoặc đổi ở máy khác) thì ô dựng
            lại với giá trị mới, mà không cần effect chép prop vào state. Lưu lúc rời ô. */}
        <input
          key={saved}
          id={`${uid}-name`}
          defaultValue={saved}
          maxLength={40}
          onBlur={(e) => e.target.value.trim() !== saved && save({ partner_name: e.target.value.trim() })}
          placeholder={tr('Người ấy')}
          className="mt-1 w-full rounded-md border border-border-strong bg-surface p-3 text-fg-primary"
        />
      </div>
      <div>
        <label htmlFor={`${uid}-fund`} className="block text-sm font-medium text-fg-muted">
          {tr('Tài khoản quỹ chung')}
        </label>
        <Select
          id={`${uid}-fund`}
          value={fundId}
          onChange={(e) => save({ shared_fund_account_id: e.target.value || null })}
          disabled={update.isPending}
          wrapClassName="mt-1 w-full"
        >
          <option value="">{tr('Chưa đặt')}</option>
          {choices.map((a) => (
            <option key={a.id} value={a.id}>
              {accountLabel(a.name)}
            </option>
          ))}
        </Select>
        <p className="mt-1 text-2xs text-fg-muted">
          {tr('Chuyển khoản vào tài khoản này sẽ hỏi thêm “góp cho phần nào” và “ai góp”.')}
        </p>
      </div>
      {fundId && (
        <Link
          to="/quy-chung"
          className="flex min-h-11 items-center justify-between rounded-md border border-border-panel px-3 text-sm font-medium text-fg-primary hover:bg-surface-sunken"
        >
          {tr('Mở Quỹ chung')}
          <ChevronRight className="h-4 w-4 text-fg-muted" aria-hidden />
        </Link>
      )}
    </div>
  )
}
