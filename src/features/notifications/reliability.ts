// "Độ tin cậy dữ liệu" (§4.9) — MỘT chỉ số % thay cho hàng chục dòng "ước chừng" rải
// khắp app.
//
// Vì sao gộp: mỗi màn hiện đang tự nói phần thiếu của riêng nó ("chưa quy đổi được tỷ
// giá", "chưa có bảng giá", "cần 3 tháng, có 2"). Người dùng đọc từng dòng thì không
// bao giờ dựng được câu trả lời cho câu hỏi thật: "nói chung thì số của tôi đáng tin
// tới đâu, và làm gì thì nó đáng tin hơn".
//
// THUẦN: không React, không window, không Date.now(). Cùng ràng buộc với rules/* vì nó
// đọc chính những đầu vào đó.
import { addDaysISO, addMonths, formatMonthLabel, getMonthRange, type MonthKey } from '../../lib/dates'
import { lastReconciledMap, type ReconcilableAccount } from './reconciledAt'
import type { CategoryRow, TransactionRow } from '../../types/database.types'

/** Một thành phần của chỉ số. `weight` cộng lại đúng 1. */
export interface ReliabilityPart {
  key: 'categorized' | 'reconciled' | 'history' | 'assumptions'
  label: string
  /** 0..1 */
  score: number
  weight: number
  /** Câu nói ra CÁI GÌ đang thiếu; rỗng khi phần này đã đủ. */
  gap: string
}

export interface Reliability {
  /** 0..100, làm tròn. */
  pct: number
  parts: ReliabilityPart[]
}

export interface ReliabilityInput {
  todayISO: string
  /** Giao dịch trong cửa sổ gần đây (cùng nguồn với bộ luật). */
  recentTxs: TransactionRow[]
  categories: CategoryRow[]
  /**
   * Tài khoản đang được tính vào tổng (đã lọc ẩn/lưu trữ ở nơi gọi).
   *
   * Cả HÀNG chứ không chỉ id: phần "đã đối chiếu" cần đọc `last_reconciled_at` trên
   * từng tài khoản, không suy được từ id.
   */
  accounts: ReconcilableAccount[]
  /**
   * Số tháng có dữ liệu trong `HISTORY_TARGET_MONTHS` tháng gần nhất — đếm bằng
   * `historyCoverage`, KHÔNG từ một chuỗi tháng vẽ biểu đồ: chuỗi 8 tháng của Bản tin
   * từng làm câu "mới 8/12 tháng có dữ liệu" không bao giờ hết.
   */
  monthsWithData: number
  /** Những tháng thiếu trong cửa sổ đó (từ `historyCoverage`), để câu thiếu nêu tên tháng. */
  missingMonths?: readonly MonthKey[]
  /** Số giả định của Lifetime còn để trống (năm sinh, lợi suất…). */
  blankAssumptions: number
}

/** Số tháng cần có để mọi phép so mùa vụ / điểm gãy chạy được. */
export const HISTORY_TARGET_MONTHS = 12
/** Bao nhiêu ngày không đối chiếu thì coi là cũ — cùng con số với dataRules. */
const RECONCILE_DAYS = 30
/** Số giả định tối đa tính vào chỉ số. */
const ASSUMPTION_TARGET = 3

const clamp01 = (n: number) => Math.max(0, Math.min(1, n))

export interface HistoryCoverage {
  /** Số tháng (trong cửa sổ) có ít nhất một khoản thu/chi thật. */
  withData: number
  /** Tháng trong cửa sổ KHÔNG có khoản nào, cũ → mới. */
  missing: MonthKey[]
}

/**
 * Đếm `n` tháng GẦN NHẤT (tính cả tháng hiện tại) có dữ liệu hay không.
 *
 * "Có dữ liệu" = có ít nhất một khoản thu/chi thật: chuyển khoản (chỉ đổi chỗ tiền) và
 * bút toán loại khỏi thống kê (đối chiếu số dư) không tính — cùng rổ với chuỗi tháng của
 * reports/aggregate mà bản cũ đếm theo. Đếm theo SỐ KHOẢN chứ không theo tổng tiền: tháng
 * toàn khoản ngoại tệ chưa có tỷ giá vẫn là tháng đã ghi.
 *
 * "Một tháng" đi qua `getMonthRange` — tôn trọng ngày bắt đầu tháng của người dùng.
 * `txs` phải phủ đủ `n` tháng đó (Bản tin đưa dải 25 tháng nó đã tải sẵn).
 */
export function historyCoverage(
  txs: readonly Pick<TransactionRow, 'occurred_on' | 'type' | 'exclude_from_stats'>[],
  currentKey: MonthKey,
  monthStartDay: number,
  n = HISTORY_TARGET_MONTHS,
): HistoryCoverage {
  const months = Array.from({ length: n }, (_, i) => addMonths(currentKey, i - (n - 1)))
  const ranges = months.map((k) => getMonthRange(k, monthStartDay))
  const has = new Array<boolean>(n).fill(false)
  for (const t of txs) {
    if (t.type === 'transfer' || t.exclude_from_stats) continue
    const i = ranges.findIndex((r) => t.occurred_on >= r.start && t.occurred_on < r.end)
    if (i >= 0) has[i] = true
  }
  return {
    withData: has.filter(Boolean).length,
    missing: months.filter((_, i) => !has[i]),
  }
}

/** "2025/10–2026/02, 2026/05" — tháng liền nhau gộp thành một khoảng, cho câu ngắn lại. */
export function monthSpansLabel(months: readonly MonthKey[]): string {
  const ord = (k: MonthKey) => k.year * 12 + k.month
  const spans: string[] = []
  let i = 0
  while (i < months.length) {
    let j = i
    while (j + 1 < months.length && ord(months[j + 1]) === ord(months[j]) + 1) j++
    spans.push(
      i === j
        ? formatMonthLabel(months[i])
        : `${formatMonthLabel(months[i])}–${formatMonthLabel(months[j])}`,
    )
    i = j + 1
  }
  return spans.join(', ')
}

/**
 * Bốn thành phần, trọng số theo mức ảnh hưởng tới CON SỐ NGƯỜI DÙNG ĐỌC HẰNG NGÀY:
 *
 *   · phân loại (0,4) — sai cái này là báo cáo VÀ ngân sách đều lệch, mỗi ngày.
 *   · đối chiếu (0,3) — sai số dư thì mọi tổng tài sản lệch, nhưng lệch chậm.
 *   · lịch sử   (0,2) — thiếu tháng thì mất mùa vụ/điểm gãy; không làm sai số nào
 *                       đang hiện, chỉ làm app câm ở vài khối.
 *   · giả định  (0,1) — chỉ ảnh hưởng bản chiếu Lifetime, một màn.
 *
 * Trọng số là một QUYẾT ĐỊNH, không phải phép đo — ghi ra đây để lần sau ai đổi thì
 * đổi có ý thức, thay vì chỉnh cho con số ra đẹp.
 */
export function reliability(input: ReliabilityInput): Reliability {
  // 1 — % giao dịch đã phân loại. Chuyển khoản không tính (không bao giờ có danh mục).
  const canGan = input.recentTxs.filter((t) => t.type !== 'transfer' && !t.exclude_from_stats)
  const daGan = canGan.filter((t) => t.category_id != null)
  // Chưa có giao dịch nào thì KHÔNG phạt: sổ trống không phải sổ sai.
  const tyLeGan = canGan.length === 0 ? 1 : daGan.length / canGan.length
  const thieuGan = canGan.length - daGan.length

  // 2 — tài khoản mới đối chiếu trong 30 ngày. Cùng MỘT phép trả lời với chuông nhắc
  // (`rules/dataRules.reconcileStaleRule`), xem `reconciledAt.ts`: hai khối này nằm cạnh
  // nhau trên cùng màn Bản tin nên lệch một tài khoản là người dùng thấy ngay.
  const cutoff = addDaysISO(input.todayISO, -RECONCILE_DAYS)
  const lanCuoi = lastReconciledMap(input.accounts, input.recentTxs, input.categories)
  const soMoi = input.accounts.filter((a) => (lanCuoi.get(a.id) ?? '') >= cutoff).length
  const tyLeDoiChieu = input.accounts.length === 0 ? 1 : soMoi / input.accounts.length

  // 3 — số tháng ghi chép đủ.
  const tyLeLichSu = clamp01(input.monthsWithData / HISTORY_TARGET_MONTHS)

  // 4 — giả định còn trống.
  const tyLeGiaDinh = clamp01(1 - input.blankAssumptions / ASSUMPTION_TARGET)

  const parts: ReliabilityPart[] = [
    {
      key: 'categorized',
      label: 'Đã phân loại',
      score: tyLeGan,
      weight: 0.4,
      gap: thieuGan > 0 ? `${thieuGan} giao dịch chưa gắn danh mục` : '',
    },
    {
      key: 'reconciled',
      label: 'Đã đối chiếu',
      score: tyLeDoiChieu,
      weight: 0.3,
      gap:
        input.accounts.length - soMoi > 0
          ? `${input.accounts.length - soMoi} tài khoản chưa đối chiếu trong ${RECONCILE_DAYS} ngày`
          : '',
    },
    {
      key: 'history',
      label: 'Lịch sử',
      score: tyLeLichSu,
      weight: 0.2,
      gap:
        input.monthsWithData < HISTORY_TARGET_MONTHS
          ? `mới ${input.monthsWithData}/${HISTORY_TARGET_MONTHS} tháng có dữ liệu` +
            (input.missingMonths && input.missingMonths.length > 0
              ? ` — thiếu ${monthSpansLabel(input.missingMonths)}`
              : '')
          : '',
    },
    {
      key: 'assumptions',
      label: 'Giả định',
      score: tyLeGiaDinh,
      weight: 0.1,
      gap: input.blankAssumptions > 0 ? `${input.blankAssumptions} giả định còn trống` : '',
    },
  ]

  const pct = Math.round(parts.reduce((a, p) => a + p.score * p.weight, 0) * 100)
  return { pct, parts }
}
