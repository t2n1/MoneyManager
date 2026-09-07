// Bật/tắt chiều "ai chi" — bước đầu của việc dùng chung hai người.
//
// Dáng theo đúng khuôn DensityToggle (hai nút có nhãn, không phải switch): switch chỉ có
// tên cho MỘT trạng thái, người đọc phải tự suy tắt nghĩa là gì. Hai nút thì cả hai lựa
// chọn đều tự nói tên mình.
//
// PHẢI NÓI RÕ CÔNG TẮC NÀY KHÔNG PHẢI QUYỀN TRUY CẬP. "Dùng chung" nghe như mở sổ cho
// người khác xem, mà nó chỉ thêm một chiều phân loại trên giao dịch của chính mình —
// chưa có login thứ hai, chưa ai đọc được gì. Hiểu nhầm theo chiều đó là chuyện nghiêm
// trọng, nên câu giải thích KHÔNG bọc <Guide>: nó phải hiện ở cả chế độ Gọn.

import { User, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Card, PanelHeader } from '../../components/ui'
import { useProfile, useUpdateProfile } from '../../hooks/queries'
import { showToast } from '../../lib/dialog'

const OPTIONS: { value: boolean; label: string; hint: string; Icon: LucideIcon }[] = [
  { value: false, label: 'Một mình', hint: 'Không hỏi ai chi khoản nào', Icon: User },
  { value: true, label: 'Hai người', hint: 'Ghi thêm: mình / người ấy / chung', Icon: Users },
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
    showToast(value ? 'Đã bật chiều “ai chi”' : 'Đã tắt chiều “ai chi”', 'success')
  }

  return (
    <Card as="section" elevation="panel" padding="none" className="overflow-hidden">
      <PanelHeader right="dùng chung mọi thiết bị">Ghi sổ cùng ai</PanelHeader>
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
      <p className="px-3 pb-3 text-2xs text-fg-muted">
        Đây chỉ là <b>một chiều phân loại</b> trên sổ của bạn — chưa có tài khoản đăng nhập
        thứ hai và chưa ai xem được sổ này. Tắt lại không mất dữ liệu đã gắn.
      </p>
    </Card>
  )
}
