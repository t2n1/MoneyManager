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

  // Bất biến 2. Sàn là năm sau hôm nay VÀ sau chặng ĐẦU thật (`sorted[0]`) — không chỉ
  // `currentYear + 1`. Hai giá trị này thường trùng nhau (chặng đầu luôn ở `currentYear`,
  // xem Bất biến 1), nhưng dữ liệu có thể lệch (chặng đầu ở tương lai — sheet cũ không
  // ép luật này, xem phát hiện review 2026-09-09 #3). Không cộng thêm điều kiện này thì
  // sửa một chặng SAU có thể chọn một năm THẤP HƠN `sorted[0].startYear`, tức chặng đó
  // sắp XẾP LÊN TRƯỚC chặng đầu ngay giữa lúc gõ — thứ hạng đổi, panel tưởng đang sửa
  // chặng đầu (`laChangDau` lật), và `<YearBox>` của nó unmount ngay dưới con trỏ.
  const san = Math.max(MIN_PHASE_YEAR, Math.max(currentYear, sorted[0].startYear) + 1)
  const dangDung = new Set(sorted.filter((p) => p.id !== id).map((p) => p.startYear))
  return namTrong(khoang(wanted, san), san, dangDung, dangCo)
}

/**
 * Năm bắt đầu TRỐNG gần `wanted` nhất cho một chặng CHƯA TỒN TẠI — "Nhân đôi" và "+ Chặng
 * đời mới từ đây" sinh một chặng mới, không sửa một chặng đang có.
 *
 * VÌ SAO TÁCH RIÊNG (gốc rễ của phát hiện review 2026-09-09 #1 và #2, không phải một bản
 * vá). Hai chỗ gọi cũ nhét chặng mới vào MẢNG `phases` với một id giả rồi gọi
 * `clampPhaseStartYear` — hàm đó trả lời "chặng ĐANG CÓ được đổi sang năm nào", không phải
 * "một chặng MỚI được sinh ở năm nào". Khi chặng giả đó SẮP XẾP thành chặng đầu (năm gõ
 * nhỏ hơn mọi chặng đang có — ví dụ mốc bị gõ tay xuống 2020), `clampPhaseStartYear` rơi
 * vào Bất biến 1 và trả nguyên `currentYear`, KHÔNG hề kiểm trùng — mà `currentYear` chính
 * là năm chặng đầu THẬT đang giữ. Kết quả: hai chặng cùng `start_year`, Lưu nổ
 * `unique (scenario_id, start_year)` (migration 0031) ở Postgres, xa chỗ bấm. Ba chip mẫu
 * ("Cưới"/"Nghỉ hưu"/"Chuyển nước") cũng sinh chặng ở đúng MỘT năm cố định
 * (`currentYear + 2`) mỗi lần bấm — bấm hai lần ra cùng lỗi, không qua nhánh chặng-đầu
 * nhưng cùng gốc "không kiểm trùng cho chặng mới".
 *
 * Sàn giống Bất biến 2 của `clampPhaseStartYear`: `currentYear + 1` — một chặng mới không
 * được giành năm hiện tại của chặng đang chạy. Dò trong `[sàn, MAX_PHASE_YEAR]`, ưu tiên
 * gần `wanted`, hoà thì chọn phía TĂNG — cùng luật `namTrong`.
 *
 * `lastYear` không tham gia dò (mọi năm trong `[sàn, MAX_PHASE_YEAR]` đều hợp lệ như
 * nhau — một chặng mới có quyền chạy tới hết đời cũng như bất kỳ chặng nào khác), chỉ
 * dùng cho phao cuối khi ĐẶC KÍN toàn bộ khoảng đó — lý thuyết thuần tuý, cần hơn 300
 * chặng liền năm mới xảy ra, không thực tế trên dữ liệu thật. Không có "năm đang có" nào
 * để lùi về (khác `namTrong` — chặng này CHƯA TỒN TẠI), nên phao là năm ngay sau
 * `lastYear`: Lưu sẽ nổ ở Postgres nếu ca đó thật sự xảy ra, nhưng đó là tín hiệu thật hơn
 * một giá trị bịa ra.
 */
export function freePhaseStartYear(
  phases: PhaseYearSlot[],
  wanted: number,
  currentYear: number,
  lastYear: number,
): number {
  const san = Math.max(MIN_PHASE_YEAR, currentYear + 1)
  const dangDung = new Set(phases.map((p) => p.startYear))
  const y = khoang(wanted, san)
  if (!dangDung.has(y)) return y
  for (let d = 1; d <= MAX_PHASE_YEAR - MIN_PHASE_YEAR; d++) {
    const len = y + d
    if (len <= MAX_PHASE_YEAR && !dangDung.has(len)) return len
    const xuong = y - d
    if (xuong >= san && !dangDung.has(xuong)) return xuong
  }
  return khoang(lastYear + 1, san)
}

/**
 * Năm bắt đầu mà một cú KÉO (mép trái, mép phải — trên chặng KẾ, hoặc kéo giữa) được phép
 * đưa chặng `id` tới, CHẶN CỨNG tại chặng liền kề — không bao giờ trùng hay vượt qua năm bắt
 * đầu của chặng trước/sau, nên hai chặng không bao giờ ĐỔI THỨ TỰ vì một cú kéo.
 *
 * KHÁC `clampPhaseStartYear` (dò năm TRỐNG gần nhất — có thể nhảy qua một chặng khác và đổi
 * thứ tự, đúng ý khi GÕ một năm cụ thể vào ô năm của dock: đó là hành động rõ ràng, có chủ
 * đích, và người dùng thấy ngay số mới trong ô). Một cú KÉO là cử chỉ liên tục — đi quá tay
 * một chút là chuyện thường, không phải ý muốn "đổi thứ tự hai chặng", và việc đổi thứ tự đó
 * vô hình ngay lúc nó xảy ra (phát hiện review 2026-09-09: "dragging a phase edge past its
 * neighbour REORDERS the phases instead of stopping at the boundary"). Đúng bản vẽ
 * (README "Khối chặng đời": mép trái đổi `startYear` "chặn trong khoảng chặng trước/sau" —
 * CHẶN, không dò-rồi-nhảy).
 *
 * KHÔNG dùng ở Ô NĂM trong dock (`PlanDockPhase.tsx` gọi thẳng `clampPhaseStartYear`) — cố
 * tình để hai hành vi khác nhau, đừng gộp làm một ở đây hay ở đó.
 *
 * Khoảng cho phép là khoảng MỞ giữa hai chặng liền kề của `id` trong `phases` (sắp theo
 * năm): chạm được năm SÁT năm bắt đầu của chặng liền kề (`± 1`), không bao giờ TRÙNG hay
 * VƯỢT QUA nó — vừa giữ `unique (scenario_id, start_year)` (migration 0031), vừa giữ mỗi
 * chặng liên quan rộng ít nhất 1 năm (chặng đứng trước `id`, và chính `id`).
 *
 * Chặng ĐẦU (`i === 0`) không có mép trái (khoá ở `currentYear`, xem Bất biến 1 của
 * `clampPhaseStartYear`) — gọi hàm này cho nó trả nguyên năm đang có, không dời. Chặng CUỐI
 * không có mép phải, nhưng gọi hàm này cho chính nó (mép trái hoặc kéo giữa của nó) vẫn hợp
 * lệ: không có chặng sau nên biên trên là `MAX_PHASE_YEAR`, không phải "không cho di
 * chuyển". "Mép phải của chặng cuối" và "mép trái của chặng đầu" không tồn tại — điều đó
 * được `PhaseLane.tsx` chặn ở tầng UI (`!b.first` / `!b.last`), hàm thuần này không cần biết.
 */
export function blockPhaseStartYearAtNeighbours(
  phases: readonly PhaseYearSlot[],
  id: string,
  wanted: number,
): number {
  const sorted = [...phases].sort((a, b) => a.startYear - b.startYear)
  const i = sorted.findIndex((p) => p.id === id)
  if (i === -1) return khoang(wanted, MIN_PHASE_YEAR)
  if (i === 0) return sorted[i].startYear
  if (!Number.isFinite(wanted)) return sorted[i].startYear

  const low = sorted[i - 1].startYear + 1
  const high = i + 1 < sorted.length ? sorted[i + 1].startYear - 1 : MAX_PHASE_YEAR
  return Math.min(high, Math.max(low, Math.round(wanted)))
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
