// Nhặt dòng 厚生年金保険 ra khỏi phiếu lương đã nhập, theo tháng — THUẦN, không React.
//
// LƯU Ý QUAN TRỌNG: những dòng này mang `exclude_from_stats = true` (xem nhap.ts:363) nên
// mọi báo cáo và mọi tool truy vấn của app đều BỎ QUA chúng. Đọc bảng gốc thì thấy. Đây là
// lý do MCP `truy_van` trả rỗng khi thử đo mức giảm 社会保険料 lúc viết spec.
//
// Vì sao đo 標準報酬月額 chứ không đo TIỀN 健康保険料: bước sang 40 tuổi thì 介護保険第2号
// cộng thêm ~1,62% vào dòng 健康保険料 (R4 của spec), tức tiền tăng vì một lý do chẳng liên
// quan gì tới 掛金 — và nếu hai việc xảy ra gần nhau thì chúng che nhau. 標準報酬月額 suy từ
// 厚生年金保険料 không chịu ảnh hưởng đó: suất 9,15% cố định toàn quốc, không đổi theo tuổi.
import { standardMonthlyFromPension } from '../tax/shakaiHoken'

/** Danh mục mà `nhap.ts` gán cho CẢ 厚生年金保険 và 厚生年金基金. */
export const PENSION_CATEGORY = 'Hưu trí (年金)'

export interface PensionTx {
  /** Khoá tháng do tầng gọi tính bằng `monthKeyForDate(occurred_on, monthStartDay)`. */
  monthKey: string
  category: string
  amount: number
}

export interface MonthPension {
  monthKey: string
  /** Tổng mọi dòng 年金 của tháng đó. */
  pensionPremium: number
  /** true = tháng đó có nhiều hơn một dòng 年金 → nghi 厚生年金基金. */
  hasKikinLine: boolean
  /** null = không suy được (xem `standardMonthlyFromPension`). */
  standardMonthly: number | null
}

/**
 * Gom theo tháng rồi suy 標準報酬月額. Sắp cũ trước.
 *
 * Nhiều hơn MỘT dòng 年金 trong một tháng là dấu hiệu 厚生年金基金: `nhap.ts` map cả
 * `厚生年金保険` và `厚生年金基金` vào cùng một danh mục, nên hai dòng nghĩa là phiếu có cả
 * hai khoản. Lúc đó tổng KHÔNG bằng `標準報酬月額 × 9,15%` và phép suy phải im.
 */
export function pensionByMonth(txs: PensionTx[]): MonthPension[] {
  const theoThang = new Map<string, { total: number; count: number }>()
  for (const t of txs) {
    if (t.category !== PENSION_CATEGORY) continue
    const cur = theoThang.get(t.monthKey) ?? { total: 0, count: 0 }
    cur.total += t.amount
    cur.count += 1
    theoThang.set(t.monthKey, cur)
  }
  return [...theoThang.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([monthKey, v]) => {
      const hasKikinLine = v.count > 1
      return {
        monthKey,
        pensionPremium: v.total,
        hasKikinLine,
        standardMonthly: standardMonthlyFromPension(v.total, hasKikinLine),
      }
    })
}

export interface StandardDrop {
  /** 標準報酬月額 ở phiếu gần nhất TRƯỚC mốc bắt đầu đóng. */
  before: number
  /** 標準報酬月額 ở phiếu MỚI NHẤT. */
  after: number
  /** `before − after`, kẹp ở 0 — 掛金 không làm 標準報酬 tăng. */
  drop: number
  /** Tháng của phiếu mới nhất đã xem — màn hình nêu ra để người đọc biết số tới đâu. */
  latestMonth: string
  /** true = phiếu mới nhất không suy được bậc (nghi 厚生年金基金) → `drop` không đáng tin. */
  unknown: boolean
}

/**
 * So 標準報酬月額 trước và sau mốc bắt đầu đóng 掛金.
 *
 * `null` khi thiếu một trong hai phía — chưa có gì mà so thì đừng bày ra một con số.
 * Đây là ca thật vào lúc viết hàm này: 掛金 bắt đầu 4/2026 mà 標準報酬 chỉ đổi ở 定時決定
 * (tháng 9), nên bốn phiếu 5→8/2026 vẫn ở bậc cũ và `drop` đúng phải là **0**, kèm
 * `latestMonth` để màn hình nói "đã xem tới phiếu tháng 8, chưa tụt".
 *
 * `drop` kẹp ở 0: lương tăng làm bậc tăng, và một `drop` âm đọc lên thành "đóng 掛金 được
 * thêm lương hưu" — điều không xảy ra.
 */
export function standardDropSince(
  rows: MonthPension[],
  startedMonthKey: string,
): StandardDrop | null {
  const truoc = rows.filter((r) => r.monthKey < startedMonthKey && r.standardMonthly !== null)
  const sau = rows.filter((r) => r.monthKey >= startedMonthKey)
  if (truoc.length === 0 || sau.length === 0) return null

  const before = truoc[truoc.length - 1].standardMonthly!
  const moiNhat = sau[sau.length - 1]
  const after = moiNhat.standardMonthly
  if (after === null) {
    return { before, after: before, drop: 0, latestMonth: moiNhat.monthKey, unknown: true }
  }
  return {
    before,
    after,
    drop: Math.max(0, before - after),
    latestMonth: moiNhat.monthKey,
    unknown: false,
  }
}
