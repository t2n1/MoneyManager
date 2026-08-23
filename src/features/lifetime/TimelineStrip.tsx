// Dải "Mốc cuộc đời" — dòng thời gian người dùng tự khai (chặng đời + sự kiện), đứng
// NGAY DƯỚI đồ thị, ở tầng ngoài cùng của tab Tương lai.
//
// VÌ SAO CÓ: đồ thị vẽ mốc sự kiện có tên và Bảng theo năm có công tắc "Chỉ năm có sự
// kiện", nhưng trước bản này chữ "sự kiện" KHÔNG xuất hiện ở bất kỳ đâu trên màn ngoài,
// và đường duy nhất để thêm một mốc là: dòng chữ 10px "Sửa kịch bản" ở góc khối Giả
// định → cuộn xuống cột giữa của trình sửa → "Thêm sự kiện". Trên điện thoại còn thêm
// một tầng nữa (khối Giả định nằm trong sheet "Thử giả định"), tức ba lần bấm mà nhãn
// đầu tiên không hề nói tới sự kiện. Người dùng kết luận app không có tính năng đó.
//
// Nay mọi mốc đã khai đều là một chip BẤM ĐƯỢC mở thẳng form của đúng nó, và ba nút
// thêm đứng ngay dưới. Trình sửa vẫn còn nguyên (nó có thêm tỷ giá, tên kịch bản, khối
// "số này ở đâu ra") — dải này chỉ rút đường đi thường dùng nhất ra ngoài.
//
// Chip đi qua <ActionButton> chứ không viết tay class: `active:scale-95` + `transition`
// phải đi cùng nhau, và trần của idiom đó trong tests/designSystem.test.ts đã kịch.
//
// KHÔNG `tabular-nums` trên chip dù chip mở đầu bằng một năm: chữ số đều bề ngang chỉ
// đáng giá khi các số XẾP THÀNH CỘT (bảng, danh sách dọc), còn ở đây chip tự xuống dòng
// theo bề ngang nên không có cột nào để thẳng hàng — thêm vào là tốn một suất của trần
// `tabular-nums` mà không đổi lấy gì.
import { ArrowDownCircle, ArrowUpCircle, Flag, Plus, Sparkles } from 'lucide-react'
import { ActionButton, Card } from '../../components/ui'
import type { LifeEventRow, LifePhaseRow } from '../../types/database.types'
import { buildMarkers } from './timelineMarkers'

interface Props {
  /** Chặng/sự kiện của kịch bản ĐANG XEM (đã lọc theo `scenario_id` ở useLifetime). */
  phases: LifePhaseRow[]
  events: LifeEventRow[]
  onEditPhase: (phase: LifePhaseRow) => void
  onEditEvent: (event: LifeEventRow) => void
  onAddPhase: () => void
  onAddEvent: () => void
  /** Mở bảng mẫu (cưới, sinh con, nghỉ hưu…) — mẫu sinh cả chặng lẫn sự kiện. */
  onPickPreset: () => void
}

export function TimelineStrip({
  phases,
  events,
  onEditPhase,
  onEditEvent,
  onAddPhase,
  onAddEvent,
  onPickPreset,
}: Props) {
  const markers = buildMarkers(phases, events)

  return (
    <Card as="section" elevation="panel" padding="panel">
      <h2 className="text-2xs uppercase tracking-[.1em] text-fg-muted">Mốc cuộc đời</h2>

      {markers.length === 0 ? (
        <p className="mt-1 text-2xs text-fg-secondary">Chưa khai mốc nào.</p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          {markers.map((m) =>
            m.kind === 'phase' ? (
              <ActionButton
                key={`p-${m.phase.id}`}
                onClick={() => onEditPhase(m.phase)}
              >
                <Flag className="h-3.5 w-3.5 shrink-0 text-fg-muted" aria-hidden="true" />
                {m.year} · {m.phase.label}
              </ActionButton>
            ) : (
              <ActionButton
                key={`e-${m.event.id}`}
                onClick={() => onEditEvent(m.event)}
              >
                {/* Icon theo `kind`, cùng bộ icon mà Bảng theo năm dùng cho sự kiện —
                    thu/chi phân biệt được KHÔNG CẦN màu (ràng buộc a11y của dự án),
                    nên màu ở đây chỉ là lớp thứ hai. */}
                {m.event.kind === 'income' ? (
                  <ArrowUpCircle className="h-3.5 w-3.5 shrink-0 text-money-in" aria-hidden="true" />
                ) : (
                  <ArrowDownCircle
                    className="h-3.5 w-3.5 shrink-0 text-money-out"
                    aria-hidden="true"
                  />
                )}
                {m.year} · {m.event.label}
              </ActionButton>
            ),
          )}
        </div>
      )}

      {/* Ba nút thêm. "Chọn mẫu" đứng cùng hàng vì nó là đường vào NHANH của đúng hai
          nút bên trái (mẫu sinh cả chặng lẫn sự kiện) — tách nó ra chỗ khác thì người
          dùng phải tự biết mẫu có tồn tại. */}
      <div className="mt-2.5 flex flex-wrap gap-2">
        <ActionButton onClick={onAddEvent}>
          <Plus className="h-4 w-4" aria-hidden="true" /> Thêm sự kiện
        </ActionButton>
        <ActionButton onClick={onAddPhase}>
          <Plus className="h-4 w-4" aria-hidden="true" /> Thêm chặng
        </ActionButton>
        <ActionButton onClick={onPickPreset}>
          <Sparkles className="h-4 w-4" aria-hidden="true" /> Chọn mẫu
        </ActionButton>
      </div>
    </Card>
  )
}
