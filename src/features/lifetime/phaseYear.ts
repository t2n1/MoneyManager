// Năm bắt đầu HỢP LỆ của một chặng đời — THUẦN, không React.
//
// VÌ SAO CÓ FILE NÀY. `life_phases` có `unique (scenario_id, start_year)` (migration
// 0031) và `demoRepo` ném lỗi để khớp. Trước đây mỗi chỗ sửa năm tự canh theo lối riêng:
// `PhaseFormSheet` hiện một câu lỗi đỏ rồi TẮT nút Xong, còn nút "Thêm chặng" ở
// `ScenarioWorkbench` nhích năm lên tới khi trống. Bảng sửa chặng trong dock không dùng
// được cách thứ nhất: nó không có nút Xong nào để tắt — mọi ô ghi thẳng vào bản nháp
// (bản vẽ 1c). Nên năm phải được CHẶN LẠI thành một giá trị hợp lệ, không phải bị từ
// chối; đó là việc của hàm này.
//
// HAI BẤT BIẾN, cả hai đều là quy ước sẵn có của màn Tương lai, không phải luật mới:
//   1. Chặng ĐẦU bắt đầu ở NĂM HIỆN TẠI. Bản chiếu bắt đầu từ hôm nay, nên chặng sớm
//      nhất phải phủ hôm nay — để nó ở tương lai thì mọi năm từ nay tới đó không có
//      chặng nào, và `phaseForYear` phải rơi về chặng sớm nhất (project.ts), tức con số
//      trên đồ thị không còn khớp với thứ đang hiện trong ô.
//   2. Chặng SAU không được trùng năm với bất kỳ chặng nào, và không được lùi về quá
//      khứ — một chặng bắt đầu trước hôm nay sẽ giành chỗ của chặng đang chạy, tức đổi
//      cả bản chiếu từ hôm nay trở đi. Cùng lời ghi với nút "Thêm chặng"
//      (`ScenarioWorkbench.tsx`: "một chặng mới bắt đầu ở QUÁ KHỨ đổi ngay chặng đang
//      chạy").

/** Khớp `check (start_year between 1900 and 2200)` của `life_phases` (migration 0031). */
export const MIN_PHASE_YEAR = 1900
export const MAX_PHASE_YEAR = 2200

/** Đủ để mô tả một chặng cho phép chặn này. Nhận hình dạng nhỏ nhất thay vì `DraftPhase`
 *  để file thuần này không phải biết tới bản nháp — cùng lý do đã ghi ở `undoStack.ts`. */
export interface PhaseYearSlot {
  id: string
  startYear: number
}

/**
 * Năm bắt đầu mà chặng `id` ĐƯỢC PHÉP nhận, gần nhất với `wanted`.
 *
 * `wanted` gõ dở / không phải số nguyên thì rơi về năm đang có của chính chặng đó —
 * KHÔNG rơi về `currentYear`: gõ một ký tự lạ giữa lúc sửa không được kéo chặng về hôm
 * nay, đó là mất dữ liệu chứ không phải chặn.
 *
 * Chặng không có trong `phases` thì trả nguyên `wanted` đã chặn khoảng: không có gì để
 * so trùng, và ném lỗi ở đây chỉ làm một ô nhập chết cứng.
 */
export function clampPhaseStartYear(
  phases: PhaseYearSlot[],
  id: string,
  wanted: number,
  currentYear: number,
): number {
  const sorted = [...phases].sort((a, b) => a.startYear - b.startYear)
  const i = sorted.findIndex((p) => p.id === id)
  if (i === -1) return khoang(wanted, MIN_PHASE_YEAR)

  const dangCo = sorted[i].startYear
  if (!Number.isFinite(wanted)) return dangCo

  // Bất biến 1. Chặng đầu KHÔNG có bậc tự do nào — dock hiện năm này thành chữ tĩnh.
  if (i === 0) return khoang(currentYear, MIN_PHASE_YEAR)

  // Bất biến 2. Sàn là năm sau hôm nay, và phải là một năm chưa ai chiếm.
  const san = Math.max(MIN_PHASE_YEAR, currentYear + 1)
  const dangDung = new Set(sorted.filter((p) => p.id !== id).map((p) => p.startYear))
  return namTrong(khoang(wanted, san), san, dangDung, dangCo)
}

function khoang(y: number, san: number): number {
  return Math.min(MAX_PHASE_YEAR, Math.max(san, Math.round(y)))
}

/**
 * Năm TRỐNG gần `y` nhất trong `[san, MAX_PHASE_YEAR]`. Dò ra hai phía, ưu tiên phía
 * TĂNG khi hai bên cách đều: người dùng gõ một năm đã có chặng gần như luôn đang muốn
 * "sau chặng đó".
 *
 * Hết chỗ (đặc kín tới trần) thì giữ `roiVe` — năm chặng đang có. Không trả một năm
 * trùng: lệnh ghi sẽ nổ ở Postgres, xa chỗ gõ.
 */
function namTrong(y: number, san: number, dangDung: Set<number>, roiVe: number): number {
  if (!dangDung.has(y)) return y
  for (let d = 1; d <= MAX_PHASE_YEAR - MIN_PHASE_YEAR; d++) {
    const len = y + d
    if (len <= MAX_PHASE_YEAR && !dangDung.has(len)) return len
    const xuong = y - d
    if (xuong >= san && !dangDung.has(xuong)) return xuong
  }
  return roiVe
}
