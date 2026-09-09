// Hàng "Vặn nhanh" (hàng 9 của bản vẽ) — phần THUẦN: biên/bước ba thanh trượt, chữ phần
// trăm, và phép nhân chi tiêu theo phần trăm.
//
// Vì sao tách khỏi `QuickTuneRow.tsx`: hai trong ba việc ở đây là toán tiền (nới biên cho
// khỏi hạ ngầm giá trị đã lưu; nhân chi của mọi chặng mà KHÔNG được cộng dồn qua từng
// nhịp kéo), và cả hai đã từng là chỗ sai thật ở màn cũ. Component thì render số, không
// tính số — quy ước toàn repo.
//
// KHÔNG import gì từ `draft.ts` ngoài KIỂU: hàng này không được quyết định lược đồ nháp,
// nó chỉ nhận một bản nháp rồi trả về một bản nháp khác.
import type { ScenarioDraft } from './draft'

/**
 * Biên và bước ba thanh trượt, theo `dsg-handoff/README.md` mục "Vặn nhanh — 3 thanh
 * trượt". Bước 10 bps (0,1%) chứ không 25 bps như panel Giả định cũ: bản vẽ ghi 10, và
 * một thanh dài 1000 bps với bước 25 chỉ có 41 điểm dừng — thô hơn mức người dùng vặn.
 */
export const RETURN_MIN_BPS = 0
export const RETURN_MAX_BPS = 1000
export const RETURN_STEP_BPS = 10

/**
 * Thanh thứ ba của bản vẽ ghi "Lạm phát chi tiêu (`inflBps`) 0–400" — con số của MÔ HÌNH
 * BẢN VẼ, nơi chi tiêu tự phồng theo `(1 + inflBps/10000)^(y − X0)`. Engine của app thì
 * chiếu theo GIÁ HÔM NAY và `realReturnBps` là lợi suất THỰC (đã trừ lạm phát), nên
 * `inflationBps` ở đây chỉ có tác dụng khi kịch bản bật "giá danh nghĩa" — mặc định là
 * tắt, và nó KHÔNG thuộc bản nháp nên nút "Lưu vào kế hoạch" không ghi được nó.
 *
 * Nên thanh thứ ba nhận đúng khoảng 0–400 và màu cảnh báo của bản vẽ, nhưng cắm vào
 * `bandSpreadBps` — cái đòn thực sự đổi NHÁNH BI QUAN trong mô hình thực này, có mặt
 * trong nháp nên lưu được, và đổi ngay đồ thị lẫn ô "Bi quan" của dải thống kê. Xem
 * task-15b-report.md; đây là chỗ lệch bản vẽ có chủ ý, không phải chỗ sót.
 */
export const SPREAD_MIN_BPS = 0
export const SPREAD_MAX_BPS = 400
export const SPREAD_STEP_BPS = 10

/** Chi mỗi năm ±, đơn vị PHẦN TRĂM (không phải bps) — bản vẽ ghi −40…+40 bước 1. */
export const EXPENSE_ADJ_MIN_PCT = -40
export const EXPENSE_ADJ_MAX_PCT = 40
export const EXPENSE_ADJ_STEP_PCT = 1

/**
 * Nới biên thanh trượt vừa đủ chứa `value`.
 *
 * Cái bẫy nó tồn tại để chặn (đã ghi ở panel Giả định cũ, `ScenarioWorkbench`): kịch bản
 * đã lưu 12%/năm mà thanh tối đa 10% thì núm dán ở mép phải, và cú kéo ĐẦU TIÊN — kể cả
 * kéo sang phải — âm thầm hạ con số của người dùng xuống 10%. Ràng buộc DB rộng hơn biên
 * bản vẽ ở cả hai đầu (`real_return_bps between -500 and 2000`,
 * `band_spread_bps between 0 and 1000`), nên ca này xảy ra được thật.
 */
export function sliderBound(
  min: number,
  max: number,
  value: number,
  step: number,
): { min: number; max: number } {
  return {
    min: Math.min(min, Math.floor(value / step) * step),
    max: Math.max(max, Math.ceil(value / step) * step),
  }
}

/**
 * bps → chữ phần trăm kiểu Việt, MỘT chữ số thập phân: 250 → "2,5%".
 *
 * Một chữ số vì bước là 10 bps = 0,1% — đúng độ mịn của thanh trượt, không hơn không kém.
 * Dấu thập phân là PHẨY: `${250 / 100}` của JS ra "2.5" ngay trong một app mà mọi số tiền
 * khác đều dùng phẩy (cùng lý do đã ghi ở `signedPct`, Num.tsx).
 */
export function bpsText(bps: number): string {
  return `${(bps / 100).toFixed(1).replace('.', ',')}%`
}

/**
 * Nhân chi mỗi năm của MỌI chặng lên `pct`%, tính từ bản ĐÃ LƯU.
 *
 * Tính từ `saved` chứ không từ `working` là điều làm hàm này idempotent: một nhịp kéo
 * sinh ra hàng chục lần gọi, và nhân dồn vào giá trị hiện tại thì kéo từ 0 lên +10 rồi về
 * 0 KHÔNG trả lại con số cũ — nó để lại một dãy sai số làm dừng (và một lệnh ghi DB cho
 * một thay đổi người dùng đã hoàn tác). Kéo về 0 ở đây trả về đúng từng đồng đã lưu.
 *
 * BỎ QUA chặng khai chi bằng % chặng trước (`expensePctOfPrev !== null`, migration 0067):
 * `resolvePhasePercents` sẽ ghi đè `annualExpenseMinor` của chúng lúc chiếu, nên nhân vào
 * đó không đổi bản chiếu MÀ vẫn sinh một dòng `DraftChange` và một lệnh `updateLifePhase`
 * — một lệnh ghi cho một thay đổi không có hiệu lực. Chúng vẫn đi theo, chỉ là đi theo
 * qua dây chuyền phần trăm từ chặng tuyệt đối phía trước.
 *
 * Chặng CHỈ CÓ trong nháp (vừa thêm, chưa lưu) cũng bỏ qua: không có gốc đã lưu để nhân
 * từ đó, và lấy chính giá trị hiện tại làm gốc là mở lại đúng cái bẫy cộng dồn ở trên.
 */
export function scaleExpenses(
  saved: ScenarioDraft,
  working: ScenarioDraft,
  pct: number,
): ScenarioDraft {
  const k = 1 + pct / 100
  let doi = false
  const phases = working.phases.map((p) => {
    if (p.expensePctOfPrev != null) return p
    const s = saved.phases.find((x) => x.id === p.id)
    if (s === undefined) return p
    const next = Math.round(s.annualExpenseMinor * k)
    if (next === p.annualExpenseMinor) return p
    doi = true
    return { ...p, annualExpenseMinor: next }
  })
  // Không có chặng nào đổi thì trả NGUYÊN đối tượng cũ: một `{...working}` mới mỗi nhịp
  // kéo làm mọi `useMemo` phụ thuộc nháp tính lại, tức chiếu lại cả đời cho một cú kéo
  // không đổi gì.
  return doi ? { ...working, phases } : working
}
