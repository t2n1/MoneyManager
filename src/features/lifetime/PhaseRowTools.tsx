// HÀNG 8, phần điều khiển — nhãn dải · + Chặng · + Thêm từ mẫu.
//
// Bản vẽ (dsg-handoff/README.md hàng 8, và markup của .dc.html) đặt BA nút ở đây. Trước
// đó console chỉ có dải khối chặng, không có nút nào — nghĩa là thêm một chặng chỉ làm
// được bằng cách NHÂN ĐÔI một chặng đang chọn, hoặc qua "+ Chặng đời mới từ đây" trong
// panel một mốc. Ai chưa chọn gì, hoặc kế hoạch chưa có mốc nào, thì không có đường nào
// thêm chặng cả — một lỗ chức năng, không phải chuyện thẩm mỹ.
//
// NAY CÒN HAI NÚT (2026-09-10, người dùng chọn sau khi xem mẫu). "+ Chặng từ mẫu" và
// "+ Mốc từ mẫu" đã nhập thành MỘT cửa "+ Thêm từ mẫu", và khay chip mẫu mức sống từng mở
// ngay dưới hàng này thì không còn — tám mẫu đó nay là nhóm đầu của `QuickAddBoard`.
//
// VÌ SAO: hai nút cạnh nhau buộc người dùng biết TRƯỚC mình cần "chặng" hay "mốc", mà đó
// đúng là chỗ họ lẫn ("cái chặng và cái mốc có đang bị giống nhau không?", 2026-09-10). Một
// cửa chia hai nhóm mang CÂU HỎI (`planWords.ts`) thì chọn được mà không cần biết từ nào.
// Lý do đầy đủ ở lời ghi 7 đầu `QuickAddBoard.tsx`; chỗ lệch bản vẽ ghi ở `phasePresets.ts`.
//
// "+ Thêm từ mẫu" mở CHÍNH bảng chọn nhanh mà cú bấm lên nền đồ thị mở, qua handle của
// vùng vẽ — không dựng bảng thứ hai. Bản vẽ có cả hai đường vào cho cùng bảng đó.
//
// KHÔNG CÓ MŨI TÊN `▾` trên nút: bảng mở ra ở GIỮA vùng vẽ (nó phải neo vào một năm trên
// trục, xem `openPresetBoard`), không rơi xuống dưới nút. Một mũi tên chỉ xuống một khay
// không tồn tại là một lời hứa sai.
import { ActionButton } from '../../components/ui'
import { Guide } from '../../components/Guide'
import { EVENT_WORDS, PHASE_WORDS } from './planWords'

export function PhaseRowTools({
  onAddPhase,
  onOpenPresetBoard,
}: {
  onAddPhase: () => void
  onOpenPresetBoard: () => void
}) {
  return (
    <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="text-2xs font-semibold uppercase tracking-label text-fg-muted">
        {PHASE_WORDS.name}
      </span>

      <ActionButton onClick={onAddPhase} title={`${PHASE_WORDS.question} — ${PHASE_WORDS.hint}`}>
        + Chặng
      </ActionButton>

      {/* Một tiêu đề gộp CẢ HAI câu hỏi: cái người dùng cần biết trước khi bấm là "cửa này
          có cả hai loại", không phải tên của từng nhóm bên trong. */}
      <ActionButton
        variant="outline"
        onClick={onOpenPresetBoard}
        title={`Mẫu có sẵn cho cả hai loại — "${PHASE_WORDS.question}" và "${EVENT_WORDS.question}"`}
      >
        + Thêm từ mẫu
      </ActionButton>

      {/* Câu này là thứ duy nhất trên màn nói ra luật xương sống của cả mô hình: chặng
          ĐẶT mức nền, mốc CỘNG THÊM và không bao giờ sửa nền (bản vẽ, bảng đầu tài liệu).
          Trong <Guide> nên nó ẩn ở mật độ Gọn — người đã biết thì không cần đọc lại. Bản
          NGẮN của cùng cặp câu này thì luôn hiện, ở chú giải đồ thị và ở tiêu đề hai nhóm
          trong cửa mẫu (`planWords.ts`). */}
      <Guide className="basis-full">
        Chặng đặt thu/chi NỀN của một quãng đời và nối tiếp nhau kín trục. Mốc chỉ cộng
        thêm dòng tiền, không bao giờ sửa nền — thu nhập hay mức sống đổi lâu dài thì tạo
        chặng mới.
      </Guide>
    </div>
  )
}
