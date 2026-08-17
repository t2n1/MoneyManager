// Mắt xích yếu nhất → MỘT VIỆC CỤ THỂ CÓ SỐ TIỀN (bản vẽ 15b, mục 2).
//
// Trước file này, thẻ điểm chỉ nói được "Quỹ dự phòng — 34/100". Đúng, nhưng không dùng
// được: người đọc biết chỗ nào yếu mà không biết phải làm gì, bao nhiêu, và bao lâu.
// 15b đòi đúng ba mẩu đó: "Cần thêm ¥38,600 để chạm mốc 3 tháng. Với nhịp để dành
// ¥35,300/tháng thì hơn 1 tháng nữa là tới."
//
// Nguyên tắc chi phối cả file: CHỈ ra số tiền khi con số ấy suy được từ ĐÚNG công thức
// đã sinh ra chỉ số. Ba chỉ số là tỷ số tiền/tiền nên đảo ngược được (quỹ dự phòng,
// nợ ngắn hạn, nợ trên thu nhập). Ba chỉ số còn lại thì KHÔNG:
//
//   · "Nếu mất việc" ra từ 2.000 kịch bản bốc ngẫu nhiên (monteCarloRunway). Muốn ra
//     một số tiền phải dùng phép chia đơn giản — tức một MÔ HÌNH KHÁC với mô hình đã
//     in ra con số trên thẻ. Hai mô hình cho hai đáp số, và người dùng sẽ thấy "cần
//     thêm ¥X" rồi nạp đúng ¥X mà kim vẫn không tới vạch.
//   · "Phụ thuộc một nguồn thu" không chữa bằng tiền — chữa bằng một nguồn thu thứ hai.
//   · "Thuế & an sinh" do luật quyết, không có mốc nào để nạp tiền vào cho đạt.
//
// Ba chỗ đó trả `amount: null` và nói việc cần làm bằng lời. Bịa một con số cho đủ bộ
// là loại lỗi tệ nhất ở màn này: nó trông chính xác nhất trong khi sai nhất.
import { HEALTH_ZONES } from './health'
import type { CurrencyCode } from '../../lib/money'

export interface WeakestActionSnap {
  liquidAssets: number
  monthlyFixedExpense: number
  debtDueWithin12m: number
  totalDebt: number
  annualIncome: number
  monthlyIncome: number
  monthlyExpense: number
}

export interface WeakestActionInput {
  /** `ScoreItem.key` của chỉ số yếu nhất. */
  key: string
  /** Điểm 0–100 của nó. */
  score: number
  /** Trọng số (%) — để nói "và là chỉ số nặng ký nhất (25%)". */
  weight: number
  /** Có phải chỉ số nặng ký nhất trong cả sáu không. */
  heaviest: boolean
  snap: WeakestActionSnap
  base: CurrencyCode
  /** Tiêm vào, không import: giữ file thuần và tôn trọng chế độ riêng tư. */
  formatMoney: (minor: number, currency: CurrencyCode) => string
}

export interface WeakestAction {
  /** Việc cần làm, đã dựng thành câu. */
  text: string
  /** Số tiền cần thêm (hoặc cần trả bớt); null = mốc này không đo bằng tiền. */
  amount: number | null
  /**
   * Chính `amount` đã định dạng — để nơi hiển thị dùng lại được trong chip của chế độ Gọn
   * mà không phải tự gọi formatMoney lần nữa (và không phải biết `base` là gì).
   * Một chỗ định dạng duy nhất nghĩa là chip và câu dài không thể in hai con số khác nhau.
   */
  amountText: string | null
  /** Bao nhiêu tháng nữa với nhịp để dành hiện tại; null = chưa để dành được đồng nào. */
  etaMonths: number | null
  /** Nhịp để dành mỗi tháng đang dùng để suy ra `etaMonths`. */
  pace: number
}

/** Điểm từ mức này trở lên thì chỉ số không còn là "việc cần làm". */
export const ACTION_SCORE_MAX = 70

/**
 * Mốc gần nhất cần với tới, cho chỉ số CÀNG CAO CÀNG TỐT.
 * `null` = đã qua hết mốc, không còn gì để với.
 */
function nextUpTarget(value: number, thresholds: readonly number[]): number | null {
  for (const t of thresholds) if (value < t) return t
  return null
}

/**
 * Việc cần làm để kéo chỉ số yếu nhất lên. `null` = không có việc nào đáng nói:
 * chỉ số đã ở vùng tốt (≥ `ACTION_SCORE_MAX`), hoặc mốc kế tiếp đã vượt qua.
 *
 * Trả `null` chứ không trả một câu động viên: thẻ điểm đã có dòng nói tên và điểm của
 * chỉ số yếu nhất rồi. Thêm một câu "chỉ số này ổn" ngay dưới dòng gọi nó là "yếu nhất"
 * là hai câu nói ngược nhau.
 */
export function weakestAction({
  key,
  score,
  weight,
  heaviest,
  snap,
  base,
  formatMoney,
}: WeakestActionInput): WeakestAction | null {
  if (score >= ACTION_SCORE_MAX) return null

  const money = (v: number) => formatMoney(Math.round(v), base)
  // Nhịp để dành: thu trung bình trừ chi trung bình mỗi tháng. Dùng CHUNG cho cả nhánh
  // "nạp thêm tiền" và nhánh "trả bớt nợ" — cả hai đều rút từ đúng phần dư này, nên
  // hai nhánh không được dùng hai nhịp khác nhau.
  const pace = snap.monthlyIncome - snap.monthlyExpense
  // "nặng ký nhất" chỉ nói khi đúng là nặng nhất. Nói với mọi chỉ số thì nó thành câu
  // đệm vô nghĩa, và tệ hơn: người dùng ưu tiên sai việc.
  const nangKy = heaviest ? `, và là chỉ số nặng ký nhất (${weight}%)` : ''

  /** Dựng câu cho ba chỉ số đảo ngược được thành tiền. */
  function tienCanThem(amount: number, dich: string): WeakestAction {
    const etaMonths = pace > 0 ? Math.ceil(amount / pace) : null
    const nhip =
      etaMonths === null
        ? ` Hiện mỗi tháng chưa dư đồng nào (thu ${money(snap.monthlyIncome)} · chi ${money(snap.monthlyExpense)}) nên chưa có đường tới mốc — phải bớt chi trước.`
        : ` Với nhịp để dành ${money(pace)}/tháng thì ${etaMonths === 1 ? 'khoảng 1 tháng' : `khoảng ${etaMonths} tháng`} nữa là tới.`
    return {
      text: `Cần thêm ${money(amount)} để ${dich}${nangKy}.${nhip}`,
      amount,
      amountText: money(amount),
      etaMonths,
      pace,
    }
  }

  switch (key) {
    case 'fund': {
      const thang = snap.monthlyFixedExpense > 0 ? snap.liquidAssets / snap.monthlyFixedExpense : 0
      const target = nextUpTarget(thang, [3, 6])
      if (target === null) return null
      const amount = target * snap.monthlyFixedExpense - snap.liquidAssets
      if (amount <= 0) return null
      return tienCanThem(amount, `chạm mốc ${target} tháng chi cố định`)
    }

    case 'liq': {
      if (snap.debtDueWithin12m <= 0) return null
      const lan = snap.liquidAssets / snap.debtDueWithin12m
      const target = nextUpTarget(lan, [1, 2])
      if (target === null) return null
      const amount = target * snap.debtDueWithin12m - snap.liquidAssets
      if (amount <= 0) return null
      return tienCanThem(amount, `tiền lỏng gấp ${target}× nợ phải trả trong 12 tháng`)
    }

    case 'dti': {
      if (snap.totalDebt <= 0 || snap.annualIncome <= 0) return null
      const ty = snap.totalDebt / snap.annualIncome
      // Chỉ số CÀNG THẤP CÀNG TỐT nên mốc đi xuống, và câu nói là "trả bớt", không
      // phải "cần thêm" — dùng chung `tienCanThem` ở đây sẽ ra câu ngược nghĩa.
      const target = ty > 1.5 ? 1.5 : 0.5
      const amount = snap.totalDebt - target * snap.annualIncome
      if (amount <= 0) return null
      const etaMonths = pace > 0 ? Math.ceil(amount / pace) : null
      return {
        text:
          `Cần trả bớt ${money(amount)} nợ để tỷ lệ nợ/thu nhập về ${Math.round(target * 100)}%${nangKy}.` +
          (etaMonths === null
            ? ` Hiện mỗi tháng chưa dư đồng nào nên nợ chưa giảm được — phải bớt chi trước.`
            : ` Với phần dư ${money(pace)}/tháng thì khoảng ${etaMonths} tháng.`),
        amount,
        amountText: money(amount),
        etaMonths,
        pace,
      }
    }

    // Ba ca dưới đây CỐ Ý không có số tiền — xem đoạn mở đầu file.
    case 'runway': {
      const zones = HEALTH_ZONES.runway
      return {
        text:
          `Số tháng cầm cự ra từ 2.000 kịch bản bốc từ chính lịch sử thu chi của bạn, nên không có ` +
          `một con số "nạp thêm bấy nhiêu là đạt"${nangKy}. Hai đường thật sự dịch được nó: tăng tiền ` +
          `lỏng, hoặc hạ chi thường tháng — xem nhánh "cắt hết chi linh hoạt" ở thẻ Nếu mất việc để ` +
          `biết cắt thì được thêm bao lâu. Mốc gần nhất là ${zones[0].upTo} tháng.`,
        amount: null,
        amountText: null,
        etaMonths: null,
        pace,
      }
    }

    case 'conc': {
      return {
        text:
          `Chỉ số này không chữa bằng tiền mà bằng một nguồn thu thứ hai${nangKy}. Ai đi làm công ăn ` +
          `lương thì nó gần 100% là bình thường — bù lại bằng quỹ dự phòng dày hơn, và đó mới là chỗ ` +
          `đáng dồn sức trước.`,
        amount: null,
        amountText: null,
        etaMonths: null,
        pace,
      }
    }

    case 'burden': {
      return {
        text:
          `Mức thuế và an sinh do luật quyết, không có mốc nào để nạp tiền vào cho đạt${nangKy}. Chỗ ` +
          `dịch được là các khoản khấu trừ: 扶養控除, 生命保険料控除, ふるさと納税.`,
        amount: null,
        amountText: null,
        etaMonths: null,
        pace,
      }
    }

    default:
      return null
  }
}

/**
 * Chỉ số chưa chấm được thì CẦN GÌ để mở (bản vẽ 15b, mục 4: "Chấm được 5/6 chỉ số.
 * 'Gánh nặng thuế' cần khai lương gộp trong Cài đặt").
 *
 * Trước đây thẻ điểm chỉ liệt tên: "Chưa tính được: Gánh nặng thuế & an sinh." Người
 * đọc biết mình thiếu mà không biết thiếu vì sao — mà mỗi chỉ số khoá vì một lý do
 * KHÁC nhau, có cái phải phân loại danh mục, có cái phải nhập phiếu lương, có cái chỉ
 * cần ghi thêm vài tháng giao dịch. Một câu chung chung ("ghi thêm dữ liệu") thì đúng
 * với mọi chỉ số và vô ích với từng chỉ số.
 *
 * Khoá theo `ScoreItem.key`. Thiếu khoá nào thì trả `null` và nơi hiển thị chỉ in tên —
 * thà không hướng dẫn còn hơn hướng dẫn sai đường.
 */
export const UNLOCK_HINT: Record<string, { need: string; to: string; cta: string }> = {
  fund: {
    need: 'cần phân loại danh mục chi thành Cố định / Biến đổi',
    to: '/settings/categories/classify',
    cta: 'Phân loại',
  },
  runway: {
    need: 'cần ít nhất 3 tháng giao dịch và số dư dương',
    to: '/so',
    cta: 'Mở Sổ',
  },
  conc: {
    need: 'cần ghi ít nhất một khoản Thu trong kỳ',
    to: '/entry',
    cta: 'Ghi thu',
  },
  dti: {
    need: 'cần có khoản Thu trong kỳ để so với dư nợ',
    to: '/entry',
    cta: 'Ghi thu',
  },
  liq: {
    need: 'cần có khoản nợ phải trả trong 12 tháng tới',
    to: '/debts',
    cta: 'Nợ / cho vay',
  },
  burden: {
    need: 'cần khai thuế và bảo hiểm theo phiếu lương',
    to: '/settings/categories',
    cta: 'Tạo bộ danh mục',
  },
}
