// Đường GHI của một cú dời NĂM trên dải chặng đời — THUẦN, không React.
//
// PHẠM VI (thu lại 2026-09-10): kéo mép trái · kéo mép phải (ghi trên chặng kế) · ←/→. Kéo
// GIỮA khối chặng KHÔNG còn về đây — cử chỉ đó nay là ĐỔI CHỖ hai chặng, một việc khác hẳn
// (ghi năm của NHIỀU chặng một lần) và đi qua `phaseOrder.ts`. Đừng nối nó lại vào đây: hàm
// dưới chặn tại hàng xóm, nên gọi nó lần lượt cho từng chặng của một cú đổi chỗ thì chặng
// thứ hai bị chặn bởi chỗ mà chặng thứ nhất vừa dời tới.
//
// VÌ SAO CÓ FILE NÀY (phát hiện review CUỐI NHÁNH 2026-09-09, Finding 1, CRITICAL). Kéo
// từng đi qua HAI phép chặn: `PhaseLane` chặn tại hàng xóm
// (`blockPhaseStartYearAtNeighbours`, đúng), rồi `movePhaseStart` ở `TuongLaiPage` chặn LẠI
// bằng `clampPhaseStartYear` — hàm viết cho Ô NĂM GÕ TAY của dock. Hàm đó DÒ năm trống gần
// nhất và mang theo hai bất biến mà một cú kéo không hề xin, nên phép thứ hai giành lấy kết
// quả của phép thứ nhất. Hai hệ quả đo được (xem `dragPhase.test.ts`, dựng lại cả hai
// đường cạnh nhau):
//
//   1. Kéo mép trái SANG TRÁI đẩy chặng SANG PHẢI, và khi có một chặng nằm giữa thì đẩy
//      hẳn QUA nó — đúng cú đổi thứ tự mà `blockPhaseStartYearAtNeighbours` sinh ra để chặn.
//   2. Kéo GIỮA khối chặng ĐẦU rơi vào nhánh `i === 0` của `clampPhaseStartYear`, thứ trả
//      nguyên `currentYear` KHÔNG kiểm trùng — hai chặng cùng `start_year`, và Lưu nổ
//      `unique (scenario_id, start_year)` (migration 0031) ở rất xa cử chỉ gây ra.
//
// HỢP ĐỒNG CỦA HÀM NÀY, ba dòng, đừng thêm dòng thứ tư:
//   · MỘT phép chặn duy nhất — `blockPhaseStartYearAtNeighbours`. Không gọi
//     `clampPhaseStartYear` ở đây, ở `PhaseLane`, hay ở bất kỳ đâu trên đường kéo.
//   · Chặn theo `draft.phases` CỦA CHÍNH BẢN NHÁP nhận vào, không theo một mảng chụp từ
//     trước. Lượt kéo gộp theo nhịp khung hình nên hai lần gọi liên tiếp có thể cùng đọc
//     một prop cũ, và một phép chặn tính trên mảng cũ cho ra năm trùng với chặng vừa dời.
//     Vì hàm nhận cả bản nháp (không nhận `phases` rời), chỗ gọi KHÔNG có cách nào truyền
//     mảng cũ vào — đó là điểm của việc tách file này ra.
//   · Chặng ĐẦU đứng yên. `blockPhaseStartYearAtNeighbours` trả nguyên năm đang có ở
//     `i === 0` (nó không có mép trái — xem JSDoc ở đó), nên kéo giữa khối đầu là NO-OP và
//     không thể sinh năm trùng. Cố tình KHÔNG "sửa hộ" một chặng đầu ở tương lai:
//     `PlanDockPhase` ghi rõ đó là dữ liệu thật, console không được lặng lẽ ghi đè.
//
// Ô NĂM trong dock (`PlanDockPhase.tsx`) KHÔNG đi qua đây — nó gọi thẳng
// `clampPhaseStartYear` và GIỮ hành vi dò-năm-trống. Quyết định đã chốt: gõ một năm cụ thể
// là hành động rõ ràng, có chủ đích, và người dùng thấy ngay số mới trong ô; một cú kéo thì
// đi quá tay là chuyện thường. Đừng gộp hai đường làm một ở đây hay ở đó.
import { patchDraftPhase, type ScenarioDraft } from './draft'
import { blockPhaseStartYearAtNeighbours } from './phaseYear'

/**
 * Ghi năm bắt đầu do một cú KÉO MÉP (mép trái · mép phải trên chặng kế) hoặc ←/→ vào bản
 * nháp, đã chặn tại hàng xóm.
 *
 * `id` không có trong nháp thì trả nguyên bản nháp (`patchDraftPhase` tự lo) — không ném
 * lỗi: một cú kéo trên thứ vừa bị xoá không được làm sập màn hình.
 */
export function dragPhaseStart(draft: ScenarioDraft, id: string, wanted: number): ScenarioDraft {
  return patchDraftPhase(draft, id, {
    startYear: blockPhaseStartYearAtNeighbours(draft.phases, id, wanted),
  })
}
