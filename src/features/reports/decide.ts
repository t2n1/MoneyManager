// Phép tính cho tab thứ tư "Quyết định" (bản 28a) — thuần, không phụ thuộc React.
//
// VÌ SAO LÀ MỘT TAB RIÊNG
// Ba tab hiện có chia theo KHOẢNG THỜI GIAN (tháng · nhiều năm · chỉ số) và cả ba đều trả
// lời "đã xảy ra gì". Không tab nào trả lời "làm gì thì đổi được gì". Khối đó cắt ngang cả
// ba nên không thuộc tab nào: nhồi vào Tháng này thì nó bị chôn dưới 12 dòng danh mục,
// nhồi vào Sức khỏe thì phần mục tiêu và nợ không có chỗ.
//
// MỘT THƯỚC DUY NHẤT cho bảng đòn bẩy: "bao lâu thì đủ 1× trả nợ". Mỗi dòng một đơn vị
// khác nhau (tháng, phần trăm, tiền) là bảng không so được, mà so được mới là lý do nó tồn
// tại.

import { addMonthsISO, type MonthKey } from '../../lib/dates'
import type { CurrencyCode } from '../../lib/money'
import { convertToBase, type Rates } from '../../lib/rates'
import type { DebtPaymentRow, DebtRow, SavingsGoalRow } from '../../types/database.types'
import { buildSchedule } from '../debts/amortization'
import { remainingOf } from '../debts/aggregate'

// ---------------------------------------------------------------------------------
// Khối 01 · Phần giữ lại đi đâu
// ---------------------------------------------------------------------------------

export interface KeptTier {
  key: 'invest' | 'remit' | 'cash' | 'other'
  label: string
  /**
   * Nhịp mỗi tháng, ĐỂ NGUYÊN SỐ. Không định dạng ở đây: file này thuần, còn `formatMoney`
   * đọc trạng thái chế độ riêng tư toàn cục — nhét nó vào là kéo trạng thái trình duyệt vào
   * một hàm được unit-test. (Bản đầu trả chuỗi và in ra "273300/tháng" không có ký hiệu tiền.)
   */
  perMonth: number | null
  /** Ghi chú CHỮ sau nhãn (không phải số). '' = không có. */
  note: string
  amount: number
  /** Phần trăm trên tổng giữ lại; null khi tổng ≤ 0. */
  pct: number | null
  /** Rút ra được ngay hay không — đây là trục thật của khối này. */
  liquid: 'now' | 'sell' | 'gone'
}

export interface KeptFlow {
  /** Tổng giữ lại (thu − chi − chuyển tài sản) trong cửa sổ. */
  kept: number
  /** Tiền mặt dày thêm bao nhiêu trong cùng cửa sổ. */
  cashGrowth: number
  /** Phần KHÔNG rút ra ngay được, tính theo phần trăm phần giữ lại; null khi kept ≤ 0. */
  illiquidPct: number | null
  tiers: KeptTier[]
  months: number
}

/**
 * Phần giữ lại đi đâu, chia theo trục "rút ra được ngay hay không".
 *
 * Vì sao khối này là khối đầu tiên của tab: nó giải thích vì sao tab Tháng này nói "tháng
 * tốt nhất" trong khi tab Sức khỏe nói "rủi ro thanh khoản", và CẢ HAI đều đúng. Hai tab
 * đo hai thứ khác nhau — một cái đo tiền không tiêu, một cái đo tiền rút được ngay — và
 * chênh lệch giữa chúng chính là phần đã sang chỗ khác.
 */
export function keptFlow(input: {
  kept: number
  cashGrowth: number
  investGrowth: number
  remitTotal: number
  months: number
}): KeptFlow {
  const { kept, cashGrowth, investGrowth, remitTotal, months } = input
  const pct = (v: number) => (kept > 0 ? Math.round((v / kept) * 100) : null)
  const perMonth = (v: number) => (months > 0 ? Math.round(v / months) : 0)

  const tiers: KeptTier[] = []
  if (investGrowth > 0) {
    tiers.push({
      key: 'invest',
      label: 'Vào đầu tư',
      perMonth: perMonth(investGrowth),
      note: '',
      amount: investGrowth,
      pct: pct(investGrowth),
      liquid: 'sell',
    })
  }
  if (remitTotal > 0) {
    tiers.push({
      key: 'remit',
      label: 'Gửi về VN',
      perMonth: perMonth(remitTotal),
      note: '',
      amount: remitTotal,
      pct: pct(remitTotal),
      liquid: 'gone',
    })
  }
  tiers.push({
    key: 'cash',
    label: 'Tiền mặt dày thêm',
    perMonth: perMonth(cashGrowth),
    note: '',
    amount: cashGrowth,
    pct: pct(cashGrowth),
    liquid: 'now',
  })

  // Phần còn lại không rơi vào ba tầng trên (trả nợ gốc, mua tài sản cố định…). In ra thay
  // vì bỏ đi: ba tầng không cộng đủ thì người đọc thấy tổng không khớp và không biết vì sao.
  const accounted = tiers.reduce((s, t) => s + t.amount, 0)
  const other = kept - accounted
  if (Math.abs(other) > 1 && kept > 0) {
    tiers.push({
      key: 'other',
      label: 'Chỗ khác',
      perMonth: null,
      note: 'trả nợ gốc, tài sản cố định…',
      amount: other,
      pct: pct(other),
      liquid: 'sell',
    })
  }

  return {
    kept,
    cashGrowth,
    // KẸP về [0, 100]: tiền mặt dày thêm có thể LỚN HƠN phần giữ lại (bán tài sản, rút
    // đầu tư, hoặc chỉ là làm tròn giữa hai nguồn đo khác nhau), và lúc đó công thức ra số
    // ÂM — "−1% phần giữ lại không rút ngay được" là một câu vô nghĩa. Kẹp về 0 nói đúng
    // điều đang xảy ra: không có phần nào bị kẹt.
    illiquidPct:
      kept > 0 ? Math.min(100, Math.max(0, Math.round(((kept - cashGrowth) / kept) * 100))) : null,
    tiers,
    months,
  }
}

// ---------------------------------------------------------------------------------
// Thước duy nhất: bao lâu thì đủ 1× trả nợ
// ---------------------------------------------------------------------------------

/**
 * Số tháng để lấp `gap` với nhịp `perMonth`. null = nhịp ≤ 0 (không bao giờ tới) hoặc
 * không còn khoảng nào phải lấp.
 *
 * KHÔNG kẹp về một con số lớn: "không bao giờ" và "600 tháng" đọc khác nhau, và in 600 là
 * hứa một cái đích không có.
 */
export function monthsToClose(gap: number, perMonth: number): number | null {
  if (gap <= 0) return 0
  if (perMonth <= 0) return null
  return Math.ceil((gap / perMonth) * 10) / 10
}

export interface LeverRow {
  key: string
  /** "Bán ¥260,000 đầu tư" — mệnh đề ĐIỀU KIỆN, không phải lời khuyên. */
  label: string
  /** Tiền mặt thêm mỗi tháng nhờ việc này; null = tác động một lần, không theo tháng. */
  cashPerMonth: number | null
  /** Số tháng còn lại sau khi làm; 0 = xong ngay; null = vẫn không tới đích. */
  monthsAfter: number | null
  /**
   * BẮT BUỘC. Mỗi dòng phải nói cái mất đi.
   *
   * Không có cột này thì bảng thành một danh sách lời khuyên, mà §G chốt "insight dừng ở
   * chỉ ra chỗ bất thường, không câu nào bảo phải làm gì" — bảng này là ngoại lệ duy nhất,
   * và giá của ngoại lệ đó là cột Đánh đổi.
   */
  tradeoff: string
}

/**
 * Bảng đòn bẩy, xếp theo TÁC ĐỘNG (rút ngắn nhiều nhất lên đầu).
 *
 * `goalOrder` cho phép mục tiêu THẬT của người dùng đổi thứ tự: nếu đích là mua nhà ở VN
 * thì "tạm dừng gửi về VN" phải tụt xuống cuối dù nó rút ngắn nhiều. Thứ tự tính từ dữ
 * liệu, không hardcode.
 */
export function sortLevers(rows: readonly LeverRow[], deprioritise: readonly string[] = []): LeverRow[] {
  const rank = (row: LeverRow) => {
    if (deprioritise.includes(row.key)) return Number.POSITIVE_INFINITY
    return row.monthsAfter === null ? Number.MAX_SAFE_INTEGER : row.monthsAfter
  }
  return [...rows].sort((a, b) => rank(a) - rank(b))
}

// ---------------------------------------------------------------------------------
// Khối 03 · Nợ là những khoản gì
// ---------------------------------------------------------------------------------

export interface DebtLine {
  id: string
  label: string
  currency: CurrencyCode
  /** Dư nợ còn lại, ĐƠN VỊ GỐC của khoản nợ. */
  remaining: number
  /** Quy đổi base; null = thiếu tỷ giá. */
  remainingBase: number | null
  /** Lãi năm, phần trăm; null = khoản không tính lãi. */
  ratePct: number | null
  /** Số kỳ còn lại; null = không phải trả góp. */
  termsLeft: number | null
  /** Tiền mỗi kỳ; null = không có lịch trả. */
  perPeriod: number | null
  /**
   * Tổng LÃI còn phải trả của khoản này (đơn vị gốc). 0 = lãi 0%.
   * null = không dựng được lịch (thiếu lãi suất hoặc số kỳ).
   */
  interestLeft: number | null
  dueOn: string | null
}

export interface DebtBreakdown {
  lines: DebtLine[]
  totalRemaining: number
  totalPerPeriod: number
  /** Tổng lãi còn phải trả — chỉ cộng những khoản dựng được lịch. */
  totalInterest: number
  hasMissingRate: boolean
  /** Có khoản nào thiếu lãi suất / số kỳ → tổng lãi đang thiếu. */
  hasIncomplete: boolean
}

/**
 * Nợ từng khoản, xếp theo TIỀN LÃI giảm dần — không theo dư nợ.
 *
 * Đây là điểm cả khối: thẻ trả góp có thể là 49% dư nợ nhưng 74% tiền lãi. Xếp theo dư nợ
 * thì bảng nói "khoản to nhất trước", mà khoản to nhất chưa chắc là khoản đáng trả trước.
 * Và trả trước một khoản lãi 0% thì không tiết kiệm đồng nào, lại làm tiền mặt mỏng đi
 * đúng lúc thanh khoản đang rủi ro.
 *
 * KHÔNG đoán lãi suất: `interest_bps` null thì `interestLeft` là null và cờ `hasIncomplete`
 * bật, chứ không mặc định 0% (một khoản lãi cao bị coi là 0% sẽ tụt xuống cuối bảng).
 */
export function debtBreakdown(
  debts: readonly DebtRow[],
  payments: DebtPaymentRow[],
  base: CurrencyCode,
  rates: Rates,
  todayISO: string,
): DebtBreakdown {
  const lines: DebtLine[] = []
  let hasMissingRate = false
  let hasIncomplete = false

  for (const d of debts) {
    if (d.status !== 'open' || d.direction !== 'i_owe') continue
    const remaining = remainingOf(d, payments)
    if (remaining <= 0) continue

    const remainingBase = convertToBase(remaining, d.currency, base, rates)
    if (remainingBase === null) hasMissingRate = true

    const paid = payments.filter((p) => p.debt_id === d.id).length
    const termsLeft = d.term_months === null ? null : Math.max(0, d.term_months - paid)

    let interestLeft: number | null = null
    let perPeriod: number | null = null
    if (d.interest_bps !== null && termsLeft !== null && termsLeft > 0) {
      const sched = buildSchedule({
        principalMinor: remaining,
        bps: d.interest_bps,
        termMonths: termsLeft,
        startISO: d.due_on ?? todayISO,
      })
      interestLeft = sched.totalInterest
      perPeriod = sched.monthly
    } else if (termsLeft !== null && termsLeft > 0) {
      // Không có lãi suất: chia đều gốc là con số ĐÚNG cho tiền mỗi kỳ, nhưng tiền lãi thì
      // vẫn là "chưa biết", không phải 0.
      perPeriod = Math.round(remaining / termsLeft)
      hasIncomplete = true
    } else {
      hasIncomplete = true
    }

    lines.push({
      id: d.id,
      label: d.counterparty.trim() || 'Khoản nợ',
      currency: d.currency,
      remaining,
      remainingBase,
      ratePct: d.interest_bps === null ? null : d.interest_bps / 100,
      termsLeft,
      perPeriod,
      interestLeft,
      dueOn: d.due_on,
    })
  }

  // Lãi nhiều nhất lên đầu; khoản CHƯA BIẾT lãi xuống cuối (không coi chúng là 0).
  lines.sort((a, b) => {
    if (a.interestLeft === null && b.interestLeft === null) return b.remaining - a.remaining
    if (a.interestLeft === null) return 1
    if (b.interestLeft === null) return -1
    return b.interestLeft - a.interestLeft
  })

  return {
    lines,
    totalRemaining: lines.reduce((s, l) => s + (l.remainingBase ?? 0), 0),
    totalPerPeriod: lines.reduce((s, l) => s + (l.perPeriod ?? 0), 0),
    totalInterest: lines.reduce((s, l) => s + (l.interestLeft ?? 0), 0),
    hasMissingRate,
    hasIncomplete,
  }
}

// ---------------------------------------------------------------------------------
// Khối 04 · Tiến độ mục tiêu
// ---------------------------------------------------------------------------------

export interface GoalLine {
  id: string
  name: string
  target: number
  current: number
  /** 0..1, kẹp ở 1. */
  ratio: number
  /** Ngày đích người dùng đặt; null = không đặt. */
  targetDate: string | null
  /** Theo nhịp hiện tại thì tới khi nào (ISO đầu tháng); null = nhịp ≤ 0 hoặc đã xong. */
  etaISO: string | null
  /** Đã xong. */
  done: boolean
}

/**
 * Tiến độ từng mục tiêu THẬT của người dùng.
 *
 * Chưa đặt mục tiêu nào thì trả mảng RỖNG — và chỗ hiển thị phải hiện một nút mời đặt mục
 * tiêu, KHÔNG hiện chuẩn 50/30/20 hay "6 tháng đệm" thay thế. Cả trang này đang đo người
 * dùng bằng chuẩn sách vở vì không biết họ muốn gì; với người Việt ở Nhật gửi tiền về nhà,
 * mục tiêu thật có thể khác hẳn.
 *
 * `balanceOf` trả số dư hiện tại của tài khoản gắn với mục tiêu (đơn vị của tài khoản đó).
 */
export function goalProgress(
  goals: readonly SavingsGoalRow[],
  balanceOf: (accountId: string) => number | null,
  monthlyPace: number,
  todayISO: string,
): GoalLine[] {
  return goals
    .map((g) => {
      const current = Math.max(0, balanceOf(g.account_id) ?? 0)
      const ratio = g.target_amount > 0 ? Math.min(1, current / g.target_amount) : 0
      const gap = Math.max(0, g.target_amount - current)
      const months = monthsToClose(gap, monthlyPace)
      return {
        id: g.id,
        name: g.name.trim() || 'Mục tiêu',
        target: g.target_amount,
        current,
        ratio,
        targetDate: g.target_date,
        etaISO: gap <= 0 || months === null ? null : addMonthsISO(todayISO, Math.ceil(months)),
        done: gap <= 0,
      }
    })
    .sort((a, b) => b.ratio - a.ratio)
}

/** "06/2027" cho một ISO — dùng cho mốc "theo nhịp tới …". */
export const monthYearLabel = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(0, 4)}`

/** Nhãn tháng của một MonthKey, dạng ngắn. */
export const shortMonth = (k: MonthKey) => `${String(k.month).padStart(2, '0')}/${k.year}`
