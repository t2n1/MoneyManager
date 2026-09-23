// Cân lại trần giữa các danh mục TRONG một tháng — thuần, không React, test được.
//
// VÌ SAO CÓ FILE NÀY: ngân sách chốt đầu tháng là con số đứng yên, chi tiêu thì không.
// Đo trên sổ thật 6 tháng: đặt mỗi mục đúng trung bình của chính nó, tổng tháng vẫn lệch
// tới ±¥131.372. Nhưng phần lớn các tháng đó, chỗ vượt ở mục này có chỗ dư ở mục kia bù
// được — app chỉ không bao giờ nói ra. Người dùng thấy bốn dòng đỏ và kết luận "kế hoạch
// lại vỡ", trong khi tổng tháng vẫn an toàn.
//
// File này KHÔNG tự ghi gì: nó trả về một đề nghị để người dùng bấm đồng ý. Nếu app tự
// chuyển thì không bao giờ còn dòng nào đỏ, mà cũng không còn tín hiệu nào báo người dùng
// đang tiêu lệch — con số chốt đầu tháng phải giữ được tư cách một lời hứa.

import { forecastMonthEnd } from '../reports/insights'

export interface RebalanceLine {
  categoryId: string
  name: string
  /** Hạn mức GỐC trong DB (`BudgetRow.amount`, chưa cộng phần dồn). */
  amount: number
  /** Hạn mức HIỆU LỰC = amount + phần dồn tháng trước. Thiếu/dư đo trên số này. */
  budgeted: number
  spent: number
  /**
   * Phần trong `spent` đến từ danh mục chi CỐ ĐỊNH (tiền nhà, đăng ký) — trả một lần
   * mỗi tháng nên không được nội suy theo tốc độ ngày.
   *
   * Là một SỐ chứ không phải cờ, vì trần thường đặt ở NHÓM còn `cost_type` nằm ở con:
   * nhóm `Nhà ở` gồm tiền nhà (cố định) lẫn điện nước (biến đổi). Đọc cờ ở dòng hạn
   * mức là bỏ sót, và nhóm bị báo vượt gấp mấy lần sự thật.
   */
  fixedSpent: number
  /**
   * Chi từng ngày đã trôi, CHỈ phần biến đổi — độ chênh của khoản trả một-lần không
   * nói gì về mấy ngày còn lại. Thiếu thì vẫn chạy, chỉ là dự báo không có khoảng.
   */
  daily?: number[]
}

export interface RebalanceInput {
  /** Chỉ những dòng TÍNH VÀO TỔNG — bỏ mốc theo dõi, nếu không sẽ đếm hai lần. */
  lines: RebalanceLine[]
  daysElapsed: number
  daysInMonth: number
  /**
   * Cam kết CHƯA RA theo danh mục — đúng `CommitmentReport.byCategory`, cùng nguồn với
   * khối "Còn phải trả". Thiếu nó thì dự báo chỉ nhìn số đã chi: nhóm còn ¥20.000 tiền
   * nhà chưa tới ngày trả vẫn bị coi là "dư", và app đề nghị rút đúng tiền đã hứa.
   */
  committedByCat?: Map<string, number>
  /** Để cam kết ghi ở con leo lên dòng trần của nhóm cha (cùng luật `coverageGaps`). */
  parentOf?: (categoryId: string) => string | null
}

/**
 * Gộp cam kết về DÒNG TRẦN mang nó: đúng danh mục nếu nó có dòng, không thì nhóm cha.
 * Cam kết không rơi vào dòng nào (danh mục chưa đặt trần) thì không thuộc về ai ở đây.
 */
function committedPerLine(
  lineIds: Set<string>,
  byCat: Map<string, number> | undefined,
  parentOf: (categoryId: string) => string | null,
): Map<string, number> {
  const out = new Map<string, number>()
  if (!byCat) return out
  for (const [categoryId, amount] of byCat) {
    const parent = parentOf(categoryId)
    const root = lineIds.has(categoryId)
      ? categoryId
      : parent !== null && lineIds.has(parent)
        ? parent
        : null
    if (root !== null) out.set(root, (out.get(root) ?? 0) + amount)
  }
  return out
}

export interface RebalanceProposal {
  to: { categoryId: string; name: string; deficit: number }
  /** null = không mục nào còn dư để lấy. */
  from: { categoryId: string; name: string; surplus: number } | null
  /** Số chuyển. 0 khi `from` là null. */
  amount: number
}

/** Trước ngày này, nội suy từ vài ngày ra số rác — thà không nói gì. */
const MIN_DAY = 7
/** Hai ngưỡng cùng lúc: một cảnh báo lúc nào cũng kêu thì mất luôn tác dụng. */
const MIN_DEFICIT = 3_000
const MIN_DEFICIT_RATIO = 0.1
/** Làm tròn XUỐNG: tròn lên thì số chuyển có thể vượt phần dư của mục cho. */
const STEP = 500

const roundDown = (n: number) => Math.floor(n / STEP) * STEP

/** Thiếu phải tăng chừng này so với lúc bị từ chối thì mới đáng hỏi lại. */
const HOI_LAI_RATIO = 1.5

/**
 * Sau khi người dùng bấm "Để yên": im cho tới khi khoản thiếu tăng rõ rệt.
 *
 * Hỏi lại vì thiếu nhích thêm vài nghìn là biến một đề nghị hữu ích thành một cái chuông
 * rình từng đồng — và người dùng sẽ tắt hẳn nó. Chỉ khi chuyện đã KHÁC (thiếu tăng rưỡi)
 * thì đó mới là một câu hỏi mới, không phải câu cũ hỏi lại.
 *
 * `deficitLucTuChoi` là null khi chưa từ chối lần nào ở tháng này.
 */
export function nenHoiLai(deficitNow: number, deficitLucTuChoi: number | null): boolean {
  if (deficitLucTuChoi === null) return true
  return deficitNow >= deficitLucTuChoi * HOI_LAI_RATIO
}

/**
 * Một đề nghị chuyển trần, hoặc null khi chưa có gì đáng nói.
 *
 * Hai vế dùng HAI CẬN KHÁC NHAU của cùng một khoảng dự báo:
 *  · mục sắp vượt đo bằng `projected` — ước lượng giữa, không thổi phồng khoản thiếu;
 *  · mục cho đo bằng `budgeted − high` — chỉ coi là dư phần mà kể cả trường hợp xấu nó
 *    vẫn không cần.
 * Lấy cùng một cận cho cả hai thì sẽ có lúc rút của một mục rồi chính mục đó vượt.
 *
 * Cả hai vế còn có một SÀN: đã chi + cam kết chưa ra. Dự báo chỉ nội suy từ số đã chi,
 * nên khoản cố định chưa tới ngày trả không có mặt trong nó (xem `forecastMonthEnd`).
 * Lấy max chứ không cộng: cam kết ở danh mục biến đổi có thể đã nằm sẵn trong phần nội
 * suy, cộng thêm là đếm hai lần.
 */
export function planRebalance(input: RebalanceInput): RebalanceProposal | null {
  const { lines, daysElapsed, daysInMonth } = input
  if (daysElapsed < MIN_DAY) return null

  const committed = committedPerLine(
    new Set(lines.map((l) => l.categoryId)),
    input.committedByCat,
    input.parentOf ?? (() => null),
  )

  let worst: { line: RebalanceLine; deficit: number } | null = null
  const donors: { line: RebalanceLine; surplus: number }[] = []

  for (const l of lines) {
    const f = forecastMonthEnd(
      l.spent,
      daysElapsed,
      daysInMonth,
      l.daily,
      l.fixedSpent,
    )
    if (!f) continue

    const floor = l.spent + (committed.get(l.categoryId) ?? 0)
    const deficit = Math.max(f.projected, floor) - l.budgeted
    if (deficit >= MIN_DEFICIT && deficit >= l.budgeted * MIN_DEFICIT_RATIO) {
      if (!worst || deficit > worst.deficit) worst = { line: l, deficit }
    }
    // Không rút quá `amount` gốc: phần dồn làm `budgeted` trông dư nhiều, nhưng tiền
    // của tháng này chỉ có chừng đó.
    const surplus = Math.min(l.budgeted - Math.max(f.high, floor), l.amount)
    if (surplus > 0) donors.push({ line: l, surplus })
  }

  if (!worst) return null

  const best = donors
    .filter((d) => d.line.categoryId !== worst!.line.categoryId)
    .sort((a, b) => b.surplus - a.surplus)[0]

  const to = { categoryId: worst.line.categoryId, name: worst.line.name, deficit: worst.deficit }
  if (!best) return { to, from: null, amount: 0 }

  const amount = roundDown(Math.min(worst.deficit, best.surplus))
  if (amount <= 0) return { to, from: null, amount: 0 }

  return {
    to,
    from: { categoryId: best.line.categoryId, name: best.line.name, surplus: best.surplus },
    amount,
  }
}
