// ĐỔI CHỖ hai chặng đời — THỨ TỰ, không phải năm. Thuần, không React.
//
// VÌ SAO CÓ FILE NÀY, VÀ VÌ SAO NÓ KHÔNG NẰM TRONG `phaseYear.ts`. Cả `phaseYear.ts` lẫn
// `dragPhase.ts` trả lời một câu duy nhất: "chặng NÀY được phép bắt đầu ở năm nào" — và cả
// hai đều CHẶN CỨNG tại hàng xóm đúng để hai chặng không bao giờ đổi thứ tự (review
// 2026-09-09: "dragging a phase edge past its neighbour REORDERS the phases instead of
// stopping at the boundary"). Quyết định đó KHÔNG bị bản này lật lại: kéo một MÉP, gõ vào ô
// năm, hay bấm ←/→ vẫn dừng sát hàng xóm y như trước.
//
// Đổi thứ tự là một VIỆC KHÁC, có cử chỉ riêng (kéo GIỮA khối chặng — xem `PhaseLane.tsx`)
// và một phép tính khác hẳn: nó ghi lại năm bắt đầu của NHIỀU chặng cùng lúc, không của
// một chặng. Cho nó đi qua `blockPhaseStartYearAtNeighbours` từng chặng một là sai từ trong
// ý: hàm đó đọc mảng chặng HIỆN TẠI, nên chặng thứ hai sẽ bị chặn bởi chỗ mà chặng thứ nhất
// vừa dời tới. Nên đường này tính TRỌN một bố cục mới rồi ghi một lần.
//
// BA BẤT BIẾN, và cả ba đều là hệ quả của việc "chặng phủ kín trục, không hở không chồng":
//
//   1. TỔNG SỐ NĂM KHÔNG ĐỔI. Mỗi chặng giữ đúng số năm của mình (quyết định của người
//      dùng, 2026-09-10: "Mỹ 25 năm kéo lên trước thì vẫn là 25 năm"), nên bố cục mới chỉ
//      là cùng bấy nhiêu số năm xếp theo thứ tự khác. Chặng cuối trong thứ tự MỚI vì thế
//      kết thúc đúng ở `lastYear`, không cần ai kẹp lại.
//
//   2. NĂM BẮT ĐẦU CỦA CHẶNG SỚM NHẤT LÀ CÁI NEO. Bố cục mới cộng dồn TỪ nó, nên nó không
//      đổi — đó chính là Bất biến 1 của `phaseYear.ts` ("chặng đầu bắt đầu ở NĂM HIỆN
//      TẠI") được giữ mà không phải nhắc lại `currentYear` ở đây. Đổi chỗ chặng đầu ra sau
//      thì chặng leo lên đứng đầu nhận lấy chính cái neo đó.
//
//   3. MỌI CHẶNG RỘNG ÍT NHẤT 1 NĂM, nên không bao giờ có hai `start_year` trùng nhau —
//      `unique (scenario_id, start_year)` (migration 0031) không có đường nổ. `phaseSpans`
//      sàn cứng mỗi số năm ở 1; số năm 0 hay âm chỉ ra được từ dữ liệu méo (chặng bắt đầu
//      SAU `lastYear`), và với dữ liệu méo thì một bố cục hợp lệ vẫn tốt hơn một lệnh ghi
//      nổ ở Postgres, xa chỗ bấm.
//
// ẢNH CHỤP, KHÔNG PHẢI MẢNG SỐNG. Chỗ gọi (`PhaseLane`) chụp `phaseSpans` một lần lúc NHẤN
// rồi dùng lại nguyên ảnh đó cho cả lượt kéo. Đây là điều kiện sống của cử chỉ, không phải
// tối ưu: mỗi khung hình đều GHI vào bản nháp, nên nếu khung sau đọc lại bố cục vừa bị
// chính nó dời thì "chỗ con trỏ đang ở" trôi theo mỗi lần ghi và hai chặng nhảy qua nhau
// liên tục khi con trỏ đứng yên gần một ranh giới. Chụp một lần thì phép tính là một hàm
// thuần của độ lệch con trỏ: kéo về lại chỗ cũ trả lại ĐÚNG bố cục ban đầu, và đó là cách
// duy nhất người dùng huỷ được một cú đổi chỗ — màn này không có Hoàn tác cho việc sửa,
// chỉ cho việc xoá (`undoStack.ts`).
import type { ScenarioDraft } from './draft'
import type { PhaseYearSlot } from './phaseYear'

/** Một chặng ở dạng "chiếm bao nhiêu năm, từ năm nào" — đủ cho mọi phép tính ở đây. */
export interface PhaseSpan {
  id: string
  startYear: number
  /** Số năm chặng chiếm, tính CẢ năm bắt đầu. Luôn ≥ 1 (Bất biến 3). */
  years: number
}

/** Năm bắt đầu mới của một chặng trong bố cục sau khi đổi chỗ. */
export interface PhaseStart {
  id: string
  startYear: number
}

/**
 * Bố cục hiện tại: mỗi chặng và SỐ NĂM nó đang chiếm, sắp theo năm tăng dần.
 *
 * Số năm suy ra từ chặng KẾ TIẾP, đúng như `laneBlocks` vẽ nó — chặng đời không có trường
 * "năm kết thúc" (xem lời ghi 2 ở đầu `PhaseLane.tsx`). Chặng CUỐI chạy tới hết bản chiếu,
 * nên số năm của nó đọc từ `lastYear` (năm cuối của bảng năm, `TuongLaiPage`) — chứ không
 * từ `x1` của khung nhìn: `x1` co lại khi người dùng phóng to, mà số năm của một chặng thì
 * không được phụ thuộc mức phóng.
 */
export function phaseSpans(phases: readonly PhaseYearSlot[], lastYear: number): PhaseSpan[] {
  const sorted = [...phases].sort((a, b) => a.startYear - b.startYear)
  return sorted.map((p, i) => {
    const next = sorted[i + 1]
    const years = next ? next.startYear - p.startYear : lastYear + 1 - p.startYear
    return { id: p.id, startYear: p.startYear, years: Math.max(1, Math.round(years)) }
  })
}

/**
 * Chặng `id` sẽ CHÈN VÀO vị trí thứ mấy, khi con trỏ đã dời `yearDelta` năm so với chỗ nhấn.
 *
 * LUẬT: MÉP DẪN ĐẦU vượt qua TÂM chặng bên cạnh thì tráo chỗ với chặng đó, rồi xét tiếp
 * chặng kế nữa. Dẫn đầu = mép trái khi kéo sang trái, mép phải khi kéo sang phải; tâm và
 * hai mép đều tính trên ẢNH CHỤP. Đây là luật của mọi danh sách kéo–thả, và cái giá phải
 * trả để đi qua một hàng xóm luôn là NỬA BỀ RỘNG CỦA HÀNG XÓM ĐÓ — bằng nhau ở hai chiều.
 *
 * HAI LUẬT ĐÃ THỬ RỒI BỎ, ghi lại để đừng thử lại:
 *
 *   · Theo Ô NĂM DƯỚI CON TRỎ (tuyệt đối, không tính chỗ nhấn): cầm ở mép trái khối thì
 *     nhích 1 năm là đã đổi chỗ, còn cầm ở mép phải một khối rộng 25 năm thì phải kéo hết
 *     25 năm mới tới được hàng xóm — cùng một cử chỉ mà quãng đường đòi hỏi phụ thuộc chỗ
 *     đặt con trỏ, thứ người dùng không nghĩ tới lúc cầm.
 *   · Theo MÉP TRÁI cho CẢ HAI CHIỀU ("mép trái rơi vào ô năm của chặng nào thì về chỗ
 *     đó"). Bản này đã ship và ĐÃ KÉO THỬ trên trình duyệt 2026-09-10; đo được chỗ nó lệch:
 *     kéo "Mỹ" (20 năm) SANG TRÁI qua "Cưới" (5 năm) chỉ cần 5 năm, nhưng kéo nó SANG PHẢI
 *     qua đúng chặng đó cần 20 năm — mép trái phải đi hết bề rộng của CHÍNH MÌNH trước khi
 *     chạm được ô năm của hàng xóm. Cùng một cú tráo, hai chiều lệch nhau bốn lần, và chiều
 *     đắt hơn lại là chiều mà khối rộng nhất (chặng cuối) hay bị kéo.
 *
 * Trả `-1` khi `id` không có trong `spans` (chặng vừa bị xoá giữa lượt kéo) — chỗ gọi
 * không được ghi gì. Không bao giờ đi quá hai đầu: kéo quá tay dừng ở chặng đầu / chặng
 * cuối, đó là ý "cho nó lên đầu / xuống cuối", không phải "không làm gì".
 */
export function phaseDropIndex(
  spans: readonly PhaseSpan[],
  id: string,
  yearDelta: number,
): number {
  const from = spans.findIndex((s) => s.id === id)
  if (from === -1) return -1
  if (!Number.isFinite(yearDelta)) return from
  const doi = Math.round(yearDelta)
  const mepTrai = spans[from].startYear + doi
  const mepPhai = mepTrai + spans[from].years - 1
  const tam = (s: PhaseSpan) => s.startYear + s.years / 2

  // CHIỀU KÉO chọn mép dẫn đầu, và đó là chỗ dễ viết sai nhất ở đây — bản đầu không rẽ theo
  // chiều mà chạy cả hai vòng, nên một khối RỘNG không bao giờ đi được sang trái: vòng thứ
  // nhất kéo nó lùi một bậc, rồi vòng thứ hai thấy mép PHẢI của nó (vẫn còn dài) vượt tâm
  // hàng xóm cũ và đẩy nó về đúng chỗ ban đầu. `doi === 0` thì không vòng nào chạy.
  let to = from
  if (doi < 0) while (to > 0 && mepTrai < tam(spans[to - 1])) to--
  else if (doi > 0) while (to < spans.length - 1 && mepPhai > tam(spans[to + 1])) to++
  return to
}

/**
 * Bố cục MỚI sau khi rút chặng `id` ra và chèn lại ở vị trí `to`: năm bắt đầu của TẤT CẢ
 * các chặng, cộng dồn theo số năm của chúng từ cái neo (Bất biến 2).
 *
 * `to` TRÙNG chỗ đang đứng KHÔNG phải mảng rỗng — nó trả về đúng bố cục GỐC. Đây là chỗ
 * đã đo được lỗi trên trình duyệt 2026-09-10: bản đầu trả rỗng cho ca này, chỗ ghi hiểu
 * rỗng là "đừng ghi", nên kéo một chặng đi rồi kéo VỀ đúng chỗ nhấn lại đứng ở bố cục của
 * khung hình TRƯỚC — bản nháp đã bị ghi rồi, không ai ghi lại bố cục gốc cho nó. Mà kéo về
 * chỗ cũ chính là đường thoát DUY NHẤT của một cú đổi chỗ lỡ tay: màn này không có Hoàn tác
 * cho việc sửa (`undoStack.ts` chỉ lo việc XOÁ). Ghi lại bố cục gốc thì vô hại — nó bằng
 * đúng năm đang có, và `setPhaseStarts` nhận ra "không năm nào đổi" rồi trả nguyên bản nháp.
 *
 * Mảng RỖNG chỉ còn nghĩa "không có gì để tính": `id` không có trong ảnh chụp, hoặc cả kế
 * hoạch chỉ có một chặng.
 *
 * `to` là vị trí trong mảng ĐÃ RÚT chặng đó ra (đúng ngữ nghĩa `splice`), và đó cũng chính
 * là con số `phaseDropIndex` trả về — hai hàm khớp nhau ở điểm này, đừng chỉnh một cái mà
 * không chỉnh cái kia. Ví dụ ba chặng A·B·C: rút C rồi chèn ở 1 ra A·C·B; rút A rồi chèn ở
 * 1 ra B·A·C.
 */
export function reorderPhaseStarts(
  spans: readonly PhaseSpan[],
  id: string,
  to: number,
): PhaseStart[] {
  const from = spans.findIndex((s) => s.id === id)
  if (from === -1 || spans.length < 2) return []
  const dich = Math.min(spans.length - 1, Math.max(0, Math.round(to)))

  const thuTu = [...spans]
  const [keo] = thuTu.splice(from, 1)
  thuTu.splice(dich, 0, keo)

  const out: PhaseStart[] = []
  let y = spans[0].startYear
  for (const s of thuTu) {
    out.push({ id: s.id, startYear: y })
    y += s.years
  }
  return out
}

/**
 * Ghi một bố cục mới vào bản nháp — đường GHI duy nhất của việc đổi chỗ chặng.
 *
 * ĐÒI ĐỦ BỘ: `starts` phải phủ đúng và đủ các chặng đang có trong nháp, không thiếu không
 * thừa; lệch một cái là trả nguyên bản nháp, không ghi gì. Đây là chỗ chặn cho ca "ảnh chụp
 * đã cũ": ảnh được chụp lúc nhấn (xem đầu file), nên nếu giữa lượt kéo mà danh sách chặng
 * đổi (thêm/xoá từ một đường khác), một bố cục tính trên ảnh cũ sẽ để hở hoặc đè năm — thà
 * bỏ khung hình đó. Ghi từng phần KHÔNG bao giờ đúng ở đây: bố cục là một khối, ghi nửa
 * cái là để hở trục.
 *
 * KHÔNG CÓ NĂM NÀO ĐỔI thì trả về CHÍNH `draft` (cùng tham chiếu), không phải một bản sao
 * bằng giá trị: một lượt kéo gọi hàm này mỗi khung hình, và `editDraft` của trang so sánh
 * bằng tham chiếu để biết có gì thay đổi — trả bản sao là dựng lại cả cây trong suốt lượt
 * kéo dù không có gì động.
 */
export function setPhaseStarts(draft: ScenarioDraft, starts: readonly PhaseStart[]): ScenarioDraft {
  if (starts.length !== draft.phases.length) return draft
  const nam = new Map(starts.map((s) => [s.id, s.startYear]))
  if (nam.size !== starts.length) return draft
  if (!draft.phases.every((p) => nam.has(p.id))) return draft
  if (draft.phases.every((p) => nam.get(p.id) === p.startYear)) return draft
  return {
    ...draft,
    // Sắp lại ngay, cùng lý do với `patchDraftPhase`: `startYear` quyết định thứ tự chặng ở
    // MỌI chỗ đọc nháp (`draftPhaseIndex`, dải tỉ lệ, engine chiếu) — và ở đây thứ tự đó
    // vừa là thứ người dùng vừa đổi, nên để nó lệch tới lúc render là để đúng cái vừa sửa
    // hiện sai.
    phases: draft.phases
      .map((p) => {
        const y = nam.get(p.id) ?? p.startYear
        return y === p.startYear ? p : { ...p, startYear: y }
      })
      .sort((a, b) => a.startYear - b.startYear),
  }
}
