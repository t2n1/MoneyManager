// Câu KẾT LUẬN của thẻ "Chi từng ngày" — thuần, test được (B45). Cùng khuôn planVerdict.ts.
//
// Câu cũ là một mệnh đề hiển nhiên: "Cao nhất 01/08 — ¥124.696, gấp 41 lần ngày thường".
// Ngày trả tiền nhà thì TẤT NHIÊN gấp 41 lần ngày thường — câu đó chiếm dòng kết luận của
// cả thẻ mà không nói được điều gì người dùng chưa biết. Nó chỉ còn đúng khi đỉnh KHÔNG
// phải một khoản cố định, và đó là nhánh cuối cùng ở dưới.
//
// Vì sao trả về DỮ LIỆU chứ không trả về chuỗi như `planVerdict`: mọi số tiền trong câu
// này phải đi qua <Money> — nó lo chế độ che số (`sct-privacy-mode`) và tiền tố "≈" khi
// thiếu tỷ giá. Ghép sẵn thành chuỗi ở đây là dựng một đường thứ hai in tiền, đi vòng qua
// cả hai thứ đó.
import type { CategoryRow, TagBudgetPeriod } from '../../types/database.types'
import type { TagBudgetLine } from '../tags/budget'
import { dayLabel, type DailySpendSeries } from './dailySpike'
import type { DayTagCells, TagDayRow } from './dayTagCells'

export type DailyHeadline =
  | {
      /** Nhãn có trần sắp cạn — câu đáng nói nhất, vì nó có hậu quả. */
      kind: 'tagCap'
      tagName: string
      spent: number
      budget: number
      /** còn tiêu được; ÂM = đã vượt */
      remaining: number
      period: TagBudgetPeriod
      /** "09–11/08" — khoảng ngày nhãn này phát sinh trong tháng đang xem */
      span: string
    }
  | {
      /** Mấy đợt gom lại chiếm phần lớn tháng. */
      kind: 'tagRuns'
      /** phần trăm đã làm tròn, so với tổng chi của chuỗi đang vẽ */
      pct: number
      runs: { name: string; span: string; total: number }[]
    }
  | {
      /** Câu cũ — chỉ còn dùng khi đỉnh KHÔNG phải khoản cố định. */
      kind: 'peak'
      dateISO: string
      total: number
      /** gấp mấy lần ngày thường; < 2 thì nơi hiển thị bỏ mệnh đề đó đi */
      ratio: number
    }
  | { kind: 'typical'; typical: number; overDays: number }

/** "09/08" cho một ngày, "09–11/08" cho một khoảng trong cùng tháng, "30/08–02/09" khi vắt tháng. */
export function daySpanLabel(firstISO: string, lastISO: string): string {
  if (firstISO === lastISO) return dayLabel(firstISO)
  if (firstISO.slice(0, 7) === lastISO.slice(0, 7)) {
    return `${firstISO.slice(8)}–${dayLabel(lastISO)}`
  }
  return `${dayLabel(firstISO)}–${dayLabel(lastISO)}`
}

/**
 * Một hàng nhãn có phải một ĐỢT không — dùng để phân biệt "chuyến Osaka" với "cà phê
 * với người yêu".
 *
 * Không dùng `budget_period === 'total'` dù nghe đúng nghĩa "cả đợt": nhãn đợt thường
 * KHÔNG đặt trần (`#Tokyo` trong ca thật là vậy), nên luật đó bỏ sót đúng những đợt cần
 * gọi tên. Hình dạng trên trục ngày mới là thứ phân biệt được: đợt thì các ngày DÍNH
 * nhau, thói quen thì rải khắp tháng.
 */
function isRun(row: TagDayRow, days: number): boolean {
  const hit = row.cells.map((v, i) => (v !== 0 ? i : -1)).filter((i) => i >= 0)
  if (hit.length < 2) return false
  const span = hit[hit.length - 1] - hit[0] + 1
  // `span <= 7` chặn ca một nhãn dùng đúng hai lần cách nhau ba tuần (2/2 ngày trong span
  // 22 vẫn qua được luật mật độ); `>= 0.5` chặn ca ba ngày rải trong một tuần.
  return span <= 7 && span <= days / 2 && hit.length / span >= 0.5
}

export interface DailyHeadlineInput {
  series: DailySpendSeries
  cells: DayTagCells
  /** `buildTagBudgetReport().lines` của ĐÚNG tháng đang xem. */
  tagLines: readonly TagBudgetLine[]
  /** Tra danh mục của khoản lớn nhất ngày đỉnh — để biết đỉnh có phải khoản cố định không. */
  categoryOf: (id: string | null) => CategoryRow | undefined
}

/** Ngưỡng "sắp cạn" của trần nhãn. Cùng con số mà `statusOf` gọi là 'warn'. */
const NEARLY_SPENT = 0.8

/**
 * Câu kết luận của thẻ. `null` = tháng chưa có khoản chi nào (thẻ đã có trạng thái rỗng
 * riêng, in thêm một câu phán ở trên nó là hai câu tranh nhau nói cùng một điều).
 *
 * Thứ tự ưu tiên, lấy nhánh đầu tiên có dữ liệu — xếp theo mức "người đọc chưa biết":
 *   1. trần nhãn sắp cạn — có hậu quả, và là số duy nhất nói được "còn bao nhiêu"
 *   2. mấy đợt chiếm phần lớn tháng — nói được HÌNH DẠNG của tháng
 *   3. câu cũ, chỉ khi đỉnh không phải khoản cố định
 *   4. ngày thường + số ngày vượt gấp đôi — luôn nói được, không phụ thuộc nhãn
 */
export function dailyHeadline({
  series,
  cells,
  tagLines,
  categoryOf,
}: DailyHeadlineInput): DailyHeadline | null {
  const { days, typical, peakIndex } = series
  const rows = cells.groups.flatMap((g) => g.rows)
  const spendTotal = days.reduce((s, d) => s + d.total, 0)
  const peak = peakIndex >= 0 ? days[peakIndex] : null
  if (peak === null) return null

  // 1 · Trần nhãn sắp cạn. Chỉ xét nhãn CÓ mặt trong tháng đang vẽ: một chuyến đã kết
  // thúc tháng trước vẫn còn `ratio` cao, nhưng nó không giải thích được cột nào ở đây.
  const rowOf = new Map(rows.map((r) => [r.tagId, r]))
  for (const line of tagLines) {
    if (line.ratio < NEARLY_SPENT) continue
    const row = rowOf.get(line.tagId)
    if (!row || row.firstISO === null || row.lastISO === null) continue
    return {
      kind: 'tagCap',
      tagName: line.name,
      spent: line.spent,
      budget: line.budget,
      remaining: line.remaining,
      period: line.period,
      span: daySpanLabel(row.firstISO, row.lastISO),
    }
  }

  // 2 · Mấy đợt gom lại. Ngưỡng `typical × 3` để hai ngày cà phê liền nhau không được
  // gọi là một đợt; trần 3 đợt vì câu dài hơn thế thì không còn là một câu kết luận.
  const runs = rows
    .filter((r) => r.total >= typical * 3 && isRun(r, days.length))
    .slice(0, 3)
  if (runs.length > 0 && spendTotal > 0) {
    const sum = runs.reduce((s, r) => s + r.total, 0)
    return {
      kind: 'tagRuns',
      pct: Math.round((sum / spendTotal) * 100),
      runs: runs.map((r) => ({
        name: r.name,
        span: daySpanLabel(r.firstISO!, r.lastISO!),
        total: r.total,
      })),
    }
  }

  // 3 · Câu cũ. Đo bằng khoản LỚN NHẤT của ngày đỉnh: nếu chính nó là khoản cố định thì
  // "gấp N lần ngày thường" là hệ quả của lịch trả tiền nhà, không phải của tháng này.
  const biggest = peak.top[0]
  const fixed = biggest ? categoryOf(biggest.categoryId)?.cost_type === 'fixed' : false
  if (!fixed) {
    return {
      kind: 'peak',
      dateISO: peak.date,
      total: peak.total,
      ratio: typical > 0 ? peak.total / typical : 0,
    }
  }

  // 4 · Không so với ngày tiền nhà nữa — so với chính ngày thường.
  return {
    kind: 'typical',
    typical,
    overDays: days.filter((d) => typical > 0 && d.total >= typical * 2).length,
  }
}
