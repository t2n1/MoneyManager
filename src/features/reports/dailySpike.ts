// Chi từng ngày trong tháng + ngày đỉnh + mấy khoản lớn nhất của mỗi ngày.
//
// Vì sao KHÔNG mở rộng `dailyExpenseTotals` trong aggregate.ts, dù nó cũng lặp qua đúng
// từng giao dịch này: `impact` cho ra 7 caller trực tiếp, trong đó `sixMonthDaily` chạy
// trên 180 ngày và `rhythm` (màn Sức khoẻ) trên cả năm. Bắt chúng gom top-3 mỗi ngày cho
// một thẻ duy nhất cần là phí, và `DailyExpensePoint` phình ra ở mọi chỗ dùng. Thà một
// file thuần riêng, blast radius bằng 0.
//
// Luật loại trừ ở đây phải TRÙNG KHÍT với aggregate.ts — hai chỗ đếm chi tháng 8 ra hai
// con số là lỗi tệ nhất mà một app tiền có thể mắc.

import { formatMoney, type CurrencyCode } from '../../lib/money'
import { convertToBase, type Rates } from '../../lib/rates'
import type { TransactionRow } from '../../types/database.types'
import { expenseSign, type CurrencyOf, type TransferIds } from './aggregate'

/** Một khoản chi trong ngày — id thô, KHÔNG phải tên: tra tên danh mục là việc của UI. */
export interface DayTopExpense {
  categoryId: string | null
  note: string | null
  /** base minor, dương */
  amount: number
}

export interface DaySpend {
  /** ISO yyyy-mm-dd */
  date: string
  /** base minor; có thể ÂM nếu ngày đó hoàn tiền nhiều hơn chi */
  total: number
  /** tối đa 3 khoản, giảm dần theo số tiền; không gồm khoản hoàn tiền */
  top: DayTopExpense[]
}

export interface DailySpendSeries {
  /** trọn khoảng ngày, 0 cho ngày trống */
  days: DaySpend[]
  /** Mức chi một ngày "thường" — TRUNG VỊ các ngày CÓ chi, base minor; 0 khi không có ngày nào. */
  typical: number
  /** Chỉ số ngày chi cao nhất trong `days`; -1 khi cả khoảng không chi. Bằng nhau → ngày sớm hơn. */
  peakIndex: number
  /** Có khoản chưa quy đổi được → mọi số ở đây là ước chừng */
  hasMissingRate: boolean
  /**
   * Số giao dịch đã vào `days` — mẫu số của dòng "còn N giao dịch chưa gắn nhãn" (B47.4).
   *
   * Đếm ở đây chứ không đếm lại ở nơi hiển thị: luật loại trừ (transfer, is_debt_flow,
   * exclude_from_stats, thiếu tỷ giá, danh mục bị công tắc bỏ) nằm trong vòng lặp dưới,
   * và chép nó ra chỗ thứ hai là chỗ để hai con số trôi khỏi nhau.
   */
  txCount: number
}

/** Số khoản hiện trong tooltip. Ba là đủ để biết "hôm đó có gì" mà không thành một danh sách. */
const TOP_N = 3

/**
 * Trung vị chứ không trung bình. Một tháng có 30 ngày lẻ tẻ và MỘT ngày trả tiền nhà thì
 * trung bình bị chính ngày tiền nhà kéo lên — mà đường này tồn tại để so với ngày đó.
 * Chỉ đếm ngày CÓ chi: ngày không tiêu gì không phải một mức chi, nó là không có số.
 */
function medianOf(values: number[]): number {
  if (values.length === 0) return 0
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 === 1 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2)
}

/**
 * Chi từng ngày (base minor) từ startISO tới lastISO, đều gồm, kèm mấy khoản lớn nhất
 * mỗi ngày để trả lời "ngày đó có biến động gì".
 *
 * Loại trừ giống aggregate.ts: chỉ `type='expense'`, bỏ `is_debt_flow` và
 * `exclude_from_stats`, bỏ danh mục `kind='transfer'` (chuyển tài sản không phải tiêu),
 * `is_refund` là chi ÂM. Thiếu tỷ giá thì LOẠI khoản đó và bật `hasMissingRate` — không
 * bao giờ quy 1:1.
 */
export function dailySpendSeries(
  txs: TransactionRow[],
  startISO: string,
  lastISO: string,
  currencyOf: CurrencyOf,
  base: CurrencyCode,
  rates: Rates,
  transferIds: TransferIds,
  /**
   * Danh mục bị BỎ khỏi chuỗi — công tắc "bỏ khoản cố định" của thẻ (B46).
   *
   * Lọc ở đây chứ không lọc `days` sau khi tính: `typical` là TRUNG VỊ và `peakIndex` là
   * cực đại, hai đại lượng không cộng được, nên trừ đi sau là ra số sai. Bỏ tiền nhà mà
   * vẫn giữ trung vị của tập chưa lọc là so ngày thường của một tập với đường của tập kia.
   *
   * Rỗng (mặc định) → kết quả y hệt bản chưa có tham số này.
   */
  excludeCategoryIds: ReadonlySet<string> = new Set(),
): DailySpendSeries {
  const totals = new Map<string, number>()
  const tops = new Map<string, DayTopExpense[]>()
  let hasMissingRate = false
  let txCount = 0

  for (const t of txs) {
    if (t.type !== 'expense' || t.is_debt_flow || t.exclude_from_stats) continue
    if (t.category_id !== null && transferIds.has(t.category_id)) continue
    if (t.category_id !== null && excludeCategoryIds.has(t.category_id)) continue
    const v = convertToBase(t.amount, currencyOf(t.account_id), base, rates)
    if (v === null) {
      hasMissingRate = true
      continue
    }
    const day = t.occurred_on
    txCount += 1
    totals.set(day, (totals.get(day) ?? 0) + v * expenseSign(t))
    // Hoàn tiền KHÔNG vào danh sách "khoản lớn nhất": nó là tiền quay về, xếp cạnh mấy
    // khoản đã tiêu là đọc ngược hẳn dấu.
    if (t.is_refund) continue
    const list = tops.get(day)
    if (list) list.push({ categoryId: t.category_id, note: t.note, amount: v })
    else tops.set(day, [{ categoryId: t.category_id, note: t.note, amount: v }])
  }

  const days: DaySpend[] = []
  const cur = new Date(startISO + 'T00:00:00Z')
  const last = new Date(lastISO + 'T00:00:00Z')
  while (cur <= last) {
    const date = cur.toISOString().slice(0, 10)
    const top = (tops.get(date) ?? []).sort((a, b) => b.amount - a.amount).slice(0, TOP_N)
    days.push({ date, total: totals.get(date) ?? 0, top })
    cur.setUTCDate(cur.getUTCDate() + 1)
  }

  let peakIndex = -1
  for (let i = 0; i < days.length; i++) {
    // `>` chứ không `>=`: bằng nhau thì giữ ngày SỚM hơn, để nhãn đỉnh không nhảy chỗ
    // mỗi lần thêm một ngày trùng số.
    if (days[i].total > 0 && (peakIndex === -1 || days[i].total > days[peakIndex].total)) {
      peakIndex = i
    }
  }

  return {
    days,
    typical: medianOf(days.filter((d) => d.total > 0).map((d) => d.total)),
    peakIndex,
    hasMissingRate,
    txCount,
  }
}

/** Nhãn ngày ngắn "20/08" — dùng chung cho trục x, tooltip và nhãn đỉnh. */
export function dayLabel(iso: string): string {
  return `${iso.slice(8)}/${iso.slice(5, 7)}`
}

/** Nhãn đỉnh trên biểu đồ: "20/08 · ¥84.200". */
export function peakLabel(day: DaySpend, base: CurrencyCode): string {
  return `${dayLabel(day.date)} · ${formatMoney(day.total, base)}`
}

/**
 * Mức CẮT của trục tung: `clamp(cao thứ hai × 1,05 · typical × 4 · max)` (B42.1).
 *
 * Vì sao phải cắt: một khoản cố định là cả biểu đồ chết. Tiền nhà ¥112.760 ngày 1 đẩy
 * trục lên 14万, nên 30 ngày còn lại bị nén vào dải cao 2% và đường trung vị nằm trùng
 * số 0 — toàn bộ khoảng thông tin dùng được biến mất.
 *
 * Vì sao cắt chứ không BỎ ngày đó: tổng của thẻ phải khớp ô CHI THÁNG ngay trên nó. Hai
 * chỗ đếm ra hai con số là lỗi mà chú thích đầu file này gọi tên.
 *
 * Ba số trong công thức, mỗi số chặn một ca:
 *   · cao THỨ HAI × 1,05 — cái cần thoát là MỘT ngày dị thường, nên thang phải ôm vừa
 *     ngày cao nhì; 5% là khoảng thở để cột đó không chạm đúng mép.
 *   · typical × 4 là SÀN — tháng nào cũng đều thì cao-thứ-hai ≈ trung vị, và trục co lại
 *     thành một dải chật nơi mọi cột cao bằng nhau.
 *   · max là CẬN TRÊN — không cắt khi không cần cắt. `ceiling === max` chính là cách nơi
 *     hiển thị biết có phải vẽ vạch chéo hay không.
 *
 * Chỉ đếm ngày DƯƠNG: ngày hoàn tiền mọc xuống dưới đường 0, nó có dải riêng (B47.2).
 */
export function axisCeiling(days: readonly DaySpend[], typical: number): number {
  const pos = days
    .map((d) => d.total)
    .filter((v) => v > 0)
    .sort((a, b) => b - a)
  if (pos.length === 0) return 0
  // `?? 0` chứ không bỏ nhánh: tháng chỉ có ĐÚNG MỘT ngày chi thì không có "cao thứ hai",
  // và lúc đó sàn `typical × 4` (typical = chính ngày đó) đã lớn hơn max nên trả về max —
  // tức không cắt, đúng ý. Không có phép chia nào ở đây nên cũng không có chỗ chia cho 0.
  return Math.min(pos[0], Math.max(Math.round((pos[1] ?? 0) * 1.05), typical * 4))
}

/** 'all' = mọi cột có nhãn số · 'big' = chỉ cột ≥ `min` (và cột cuối có dữ liệu) · 'none' = không nhãn. */
export type DayLabelMode = 'all' | 'big' | 'none'

/**
 * Cột có được in nhãn số hay không — quyết theo BỀ RỘNG CỘT ĐO ĐƯỢC, không theo
 * breakpoint đoán trước (B43).
 *
 * Thẻ này chiếm hết chiều ngang Bản tin, mà chiều ngang đó thay đổi theo cửa sổ, theo
 * cột phụ của trang, và theo `--app-font-scale`. Một breakpoint cứng sẽ đúng ở đúng một
 * bề rộng: ở ~1.560px mỗi cột ~44px (thừa chỗ cho một số), ở 375px mỗi cột 8px (không
 * số nào lọt) — cùng một `lg:` không phân biệt được hai ca đó khi trang đổi bố cục.
 *
 * `min` là ngưỡng TIỀN, không phải ngưỡng bề rộng: ở dải giữa chỉ còn chỗ cho vài số nên
 * phải chọn số đáng đọc, và "gấp đôi ngày thường" là đúng câu thẻ này hỏi.
 */
export function labelThreshold(
  colWidthPx: number,
  typical: number,
): { mode: DayLabelMode; min: number } {
  // 34px: "3.1万" đo ở IBM Plex Mono 10px là 27px, cộng 2px đệm mỗi bên và 3px khe cột.
  if (colWidthPx >= 34) return { mode: 'all', min: 0 }
  // Dưới 20px thì ngay cả "980" (18px) cũng đè sang cột bên.
  if (colWidthPx >= 20) return { mode: 'big', min: typical * 2 }
  return { mode: 'none', min: Infinity }
}

/**
 * Ba ngày đáng hỏi — phần CHỮ của thẻ ở 375px (B48), và cũng là thứ trình đọc màn hình
 * nhận được ở mọi bề rộng.
 *
 * Ở 375px mỗi cột rộng 8px thật, nên không nhãn số nào lọt và tooltip thì chú thích của
 * `DailySpendPanel` đã tự cấm dựa vào. Lối ra là tách vai: cột lo HÌNH DẠNG, chữ lo CON
 * SỐ — và chữ chỉ cần nói về mấy ngày đáng hỏi chứ không phải cả 31 ngày.
 *
 * Ngày ÂM luôn được chọn trước dù không phải ngày to nhất (B48.2): một ngày hoàn tiền
 * nhiều hơn chi là chuyện lạ, mà cột 8px màu xanh mọc xuống thì dễ bị bỏ qua nhất.
 */
export function daysWorthAsking(
  days: readonly DaySpend[],
  cutoffISO: string,
  n = 3,
): DaySpend[] {
  const seen = days.filter((d) => d.date <= cutoffISO && d.total !== 0)
  const negatives = seen.filter((d) => d.total < 0).sort((a, b) => a.total - b.total)
  const positives = seen.filter((d) => d.total > 0).sort((a, b) => b.total - a.total)
  const picked = negatives.slice(0, 1)
  for (const d of [...positives, ...negatives.slice(1)]) {
    if (picked.length >= n) break
    picked.push(d)
  }
  // Xếp lại theo NGÀY để đọc: danh sách này đứng cạnh biểu đồ có trục ngày, xếp theo tiền
  // thì mắt phải nhảy tới nhảy lui giữa hai thứ tự khác nhau của cùng một tháng.
  return picked.sort((a, b) => (a.date < b.date ? -1 : 1))
}
