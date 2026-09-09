// Các phép suy THUẦN cho phần tóm tắt của tab Tương lai — câu kết luận đầu màn, dòng
// tóm tắt trên mỗi thẻ kịch bản, khoảng năm + tiền để dành của chặng đang chạy, và (thêm
// sau, review task 15b) hàng "Lạm phát chi tiêu" của PlanSummaryCard.tsx.
//
// VÌ SAO ĐỨNG RIÊNG MỘT FILE (quy ước "toán thuần nằm ngoài React" của CLAUDE.md):
// đều là suy luận có nhánh biên (không có chặng nào, chặng cuối, thu bằng 0,
// chưa đạt FIRE, nominalTerms tắt…) mà nhìn một component render xong thì không kiểm
// được nhánh nào đã chạy. Ở đây mỗi nhánh có một phép thử.
//
// KHÔNG tự tính lại năm âm / năm FIRE ở đây — cả hai đọc từ `insights.ts`, nơi chúng
// đã có test riêng. Lặp lại phép tính là hai chỗ cùng một khái niệm, và chúng sẽ trôi
// lệch nhau.
import { fireYear, firstNegativeYear } from './insights'
import type { LifetimeInput, LifetimePhase, YearRow } from './project'

/**
 * Kết luận của một bản chiếu, dạng DỮ LIỆU — không phải câu chữ.
 *
 * Cố ý không trả về chuỗi đã ghép: câu trên màn có `<b>` và có đoạn tô màu theo nhánh
 * tốt/xấu, mà ghép JSX trong file thuần thì file này hết thuần và mất luôn khả năng
 * test bằng so sánh giá trị. Component lo phần chữ, file này lo phần suy.
 */
export interface LifetimeVerdict {
  /** Năm đầu tiên tài sản xuống dưới 0 ở nhánh BI QUAN. null = không bao giờ âm. */
  negativeYear: number | null
  negativeAge: number | null
  /** Năm đạt tự do tài chính. null = không đạt trong bản chiếu. */
  fireYear: number | null
  fireAge: number | null
  /** Xấu = có năm âm; ổn = không năm nào âm và có đạt FIRE; còn lại là cần chú ý. */
  tone: 'good' | 'warn' | 'bad'
}

/**
 * Đọc nhánh BI QUAN ('low'), không đọc nhánh trung tâm — cùng lựa chọn với `InsightCards`
 * và với vùng đỏ trên đồ thị. Lý do đầy đủ nằm ở JSDoc `firstNegativeYear`: một bản
 * chiếu "trung tâm không bao giờ âm" mà mép dưới cạn tiền năm 2060 thì câu kết luận
 * nói "đủ tới hết đời" là nói quá tay đúng ở chỗ nguy hiểm nhất.
 *
 * `birthYear` truyền vào chứ không suy từ `rows[0]`: rows có thể rỗng, và lúc đó vẫn
 * phải trả về một verdict đọc được thay vì ném.
 */
export function lifetimeVerdict(rows: YearRow[], birthYear: number): LifetimeVerdict {
  const negativeYear = firstNegativeYear(rows, 'low')
  const fire = fireYear(rows)
  return {
    negativeYear,
    negativeAge: negativeYear === null ? null : negativeYear - birthYear,
    fireYear: fire,
    fireAge: fire === null ? null : fire - birthYear,
    // Có năm âm là tin xấu bất kể FIRE — cạn tiền ở nhánh bi quan không được "bù" bằng
    // việc đâu đó trên đường có một năm đủ 4%.
    tone: negativeYear !== null ? 'bad' : fire !== null ? 'good' : 'warn',
  }
}

/** Khoảng năm của một chặng: `[startYear, endYear]`. `end` null = chạy tới hết đời. */
export interface PhaseRange {
  start: number
  end: number | null
}

/**
 * Chặng kết thúc năm nào — `LifetimePhase` KHÔNG mang năm kết thúc (chỉ có `startYear`),
 * nên nó phải suy ra: chặng kế tiếp bắt đầu năm nào thì chặng này dừng ở năm trước đó.
 *
 * Chặng CUỐI kéo tới hết bản chiếu (`birthYear + endAge`), nhưng trả về `null` chứ không
 * trả thẳng con số đó: "2049 → 2079" đọc như một mốc có thật trong kế hoạch, trong khi
 * nó chỉ là chỗ bản chiếu dừng lại. Chỗ gọi tự chọn chữ cho ca này ("2049 trở đi").
 *
 * Chặng không nằm trong `input.phases` (không xảy ra trên thực tế — `phase` luôn lấy ra
 * từ chính `input` — nhưng có thể xảy ra nếu ai đó ghép nhầm hai input) thì coi như
 * chặng đứng một mình: trả về khoảng mở, không đi đoán.
 */
export function phaseRange(input: LifetimeInput, phase: LifetimePhase): PhaseRange {
  const starts = [...new Set(input.phases.map((p) => p.startYear))].sort((a, b) => a - b)
  const i = starts.indexOf(phase.startYear)
  if (i === -1 || i === starts.length - 1) return { start: phase.startYear, end: null }
  return { start: phase.startYear, end: starts[i + 1] - 1 }
}

/** Tiền để dành mỗi năm của một chặng, kèm tỷ lệ trên thu. */
export interface PhaseSavings {
  /** thu − chi. ÂM khi chi vượt thu — đó là tin, không phải lỗi, nên không kẹp về 0. */
  amountMinor: number
  /**
   * Tỷ lệ để dành trên thu, phần trăm làm tròn 1 chữ số lẻ. `null` khi thu bằng 0 —
   * chia cho 0 ra Infinity, và "∞%" hay "0%" đều là nói dối: không có thu thì KHÔNG
   * CÓ tỷ lệ để dành, chỉ có một khoản âm.
   */
  ratePct: number | null
}

export function phaseSavings(phase: LifetimePhase): PhaseSavings {
  const amountMinor = phase.annualIncomeMinor - phase.annualExpenseMinor
  return {
    amountMinor,
    ratePct:
      phase.annualIncomeMinor === 0
        ? null
        : Math.round((amountMinor / phase.annualIncomeMinor) * 1000) / 10,
  }
}

/** bps → "x,y%/năm" kiểu Việt (phẩy), cùng công thức đã dùng ở
 *  `assets/InvestmentPerformanceSection.tsx` và `assets/RetirementPage.tsx` — không phải
 *  công thức mới. Xuất ra để `PlanSummaryCard.tsx` dùng cho cả hàng "Lợi suất thực" (luôn
 *  chạy) lẫn `inflationRow` bên dưới (chỉ chạy khi `nominalTerms` bật). */
export function pctPerYear(bps: number): string {
  return `${(bps / 100).toFixed(1).replace('.', ',')}%/năm`
}

/**
 * Hàng "Lạm phát chi tiêu" của `PlanSummaryCard.tsx` đọc gì — quyết định bởi `nominalTerms`,
 * KHÔNG phải một phép tính từ `inflationBps` một mình.
 *
 * `nominalTerms` false (mặc định, và console `TuongLaiPage.tsx` hiện chưa có control nào
 * bật nó lên) → `inflationBps` KHÔNG được `projectLifetime` dùng ở đâu cả: xem JSDoc
 * `nominalTerms` ở `project.ts:139` và dòng tính `const inflation = nominalTerms ? … : 0`
 * ở `project.ts:361`. Thu, chi và sự kiện đứng yên theo giá hôm nay. Hiện "%/năm" trong ca
 * này là bịa một số có vẻ đang ảnh hưởng tới các hàng khác trên thẻ trong khi nó không đụng
 * gì cả — cùng kiểu sai từng bị bắt ở hàng "Cần dành nhiều nhất" (xem comment phía trên
 * `SummaryRow` đó trong `PlanSummaryCard.tsx`). ĐỪNG khôi phục lại một con số %/năm cố định
 * ở đây khi sửa file này lần sau — trước tiên hãy hỏi `nominalTerms` có thật bật ở đâu chưa.
 *
 * `nominalTerms` true → lạm phát có chạy thật trong bản chiếu (phồng dòng tiền + đổi lợi
 * suất sang danh nghĩa), nên hiện %/năm bình thường.
 */
export interface InflationRow {
  /** true = `inflationBps` có hiệu lực, `text` là "%/năm" và card phải hiện qua `<Num>`.
   *  false = `text` là câu xác nhận giá hôm nay — chữ, không phải số, không đi qua `<Num>`
   *  (xem đầu `Num.tsx`: "Con số KHÔNG phải tiền" — ở đây còn không phải số). */
  active: boolean
  text: string
}

export function inflationRow(nominalTerms: boolean, inflationBps: number): InflationRow {
  if (!nominalTerms) return { active: false, text: 'Giữ giá hôm nay' }
  return { active: true, text: pctPerYear(inflationBps) }
}
