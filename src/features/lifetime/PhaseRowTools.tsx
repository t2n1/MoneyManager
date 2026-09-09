// HÀNG 8, phần điều khiển — nhãn hướng dẫn · + Chặng · + Chặng từ mẫu · + Mốc từ mẫu.
//
// Bản vẽ (dsg-handoff/README.md hàng 8, và markup của .dc.html) đặt BA nút ở đây. Trước
// đó console chỉ có dải khối chặng, không có nút nào — nghĩa là thêm một chặng chỉ làm
// được bằng cách NHÂN ĐÔI một chặng đang chọn, hoặc qua "+ Chặng đời mới từ đây" trong
// panel một mốc. Ai chưa chọn gì, hoặc kế hoạch chưa có mốc nào, thì không có đường nào
// thêm chặng cả — một lỗ chức năng, không phải chuyện thẩm mỹ.
//
// "+ Mốc từ mẫu" mở CHÍNH bảng chọn nhanh mà cú bấm lên nền đồ thị mở, qua handle của
// vùng vẽ — không dựng bảng thứ hai. Bản vẽ có cả hai đường vào cho cùng bảng đó.
import { useState } from 'react'
import { ActionButton } from '../../components/ui'
import { Guide } from '../../components/Guide'
import { PHASE_PRESETS, type PhasePreset } from './phasePresets'

export function PhaseRowTools({
  onAddPhase,
  onAddPhasePreset,
  onOpenMilestoneBoard,
}: {
  onAddPhase: () => void
  onAddPhasePreset: (p: PhasePreset) => void
  onOpenMilestoneBoard: () => void
}) {
  const [mauMo, setMauMo] = useState(false)

  return (
    <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="text-2xs font-semibold uppercase tracking-label text-fg-muted">
        Chặng đời
      </span>

      <ActionButton onClick={onAddPhase}>+ Chặng</ActionButton>

      <ActionButton
        variant="outline"
        aria-expanded={mauMo}
        onClick={() => setMauMo((v) => !v)}
        title="Mức sống mẫu — điền sẵn thu/chi mỗi năm cho một quãng đời"
      >
        + Chặng từ mẫu
      </ActionButton>

      <ActionButton variant="outline" onClick={onOpenMilestoneBoard}>
        + Mốc từ mẫu
      </ActionButton>

      {/* Câu này là thứ duy nhất trên màn nói ra luật xương sống của cả mô hình: chặng
          ĐẶT mức nền, mốc CỘNG THÊM và không bao giờ sửa nền (bản vẽ, bảng đầu tài liệu).
          Trong <Guide> nên nó ẩn ở mật độ Gọn — người đã biết thì không cần đọc lại. */}
      <Guide className="basis-full">
        Chặng đặt thu/chi NỀN của một quãng đời và nối tiếp nhau kín trục. Mốc chỉ cộng
        thêm dòng tiền, không bao giờ sửa nền — thu nhập hay mức sống đổi lâu dài thì tạo
        chặng mới.
      </Guide>

      {mauMo && (
        <div className="basis-full rounded-lg border border-border-panel bg-surface-sunken p-2">
          <p className="mb-1.5 text-2xs text-fg-muted">
            Mức sống mẫu · thu / chi mỗi năm — <b>số mặc định, kiểm tra lại</b>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {PHASE_PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => {
                  onAddPhasePreset(p)
                  setMauMo(false)
                }}
                className="flex min-h-8 items-center gap-1.5 rounded-full border border-border-strong px-2.5 text-xs text-fg-secondary transition hover:border-accent"
              >
                <span>{p.label}</span>
                {/* Ghi chú của mẫu là chữ (`470/295万`) đã gói sẵn hai số theo ĐÚNG đồng
                    tiền của mẫu, nên nó KHÔNG đi qua <Money>: <Money> sẽ vẽ nó bằng tiền
                    hiển thị của kịch bản và nói sai đơn vị. Hai số thật đi vào bản nháp
                    qua `phasePresetToDraft`, ở đó đơn vị được giữ đúng. */}
                <span className="text-2xs text-fg-muted">{p.note}</span>
              </button>
            ))}
          </div>
          <Guide>
            Mẫu chỉ điền sẵn hai con số rồi thành một chặng thường — sửa hay xoá như mọi
            chặng khác. Đồng tiền đi theo mẫu (Mỹ là đô, Việt Nam là đồng), không theo tiền
            hiển thị của kịch bản: độ lớn của mỗi mẫu được viết cho đúng một đồng tiền.
          </Guide>
        </div>
      )}
    </div>
  )
}
