// Nguồn DUY NHẤT của mặt lập kế hoạch (tab Ngân sách, tháng chưa bắt đầu).
//
// Gom bốn thứ vốn nằm rải rác ba trang khác nhau: thu dự kiến, hạn mức đang đặt,
// cam kết đã biết (định kỳ + sắp chi), và gợi ý số từ lịch sử.
//
// Hai phần đã TÁCH RA thành hook riêng vì mặt theo dõi cũng cần đúng chúng:
// `useCommitments` (B36/B37) và `useSuggestions` (B39). Hook này chỉ còn ghép lại.

import { useMemo } from 'react'
import {
  useBudgets,
  useCategories,
  useMonthPlan,
  useProfile,
  useRates,
  useTransferCategoryIds,
} from '../../hooks/queries'
import { monthKeyString, type MonthKey } from '../../lib/dates'
import type { CategoryRow } from '../../types/database.types'
import { buildBudgetDisplay, type BudgetDisplay } from './budgetDisplay'
import { coverageGaps, type CommitmentReport, type CoverageGap } from './commitments'
import { planGroups, type PlanGroups } from './planGroups'
import { planProjection, type PlanProjection } from './planProjection'
import { plannedSlices, planSummary, type PlanSummary } from './planning'
import { buildBudgetReport } from './progress'
import type { Suggestion } from './suggest'
import { useCommitments } from './useCommitments'
import { useSuggestions } from './useSuggestions'
import { tagPlanLines, type TagPlanLine } from '../tags/budget'
import { useTagBudgets } from '../tags/useTagBudgets'
import { isFlowCategory } from '../categories/flowCategories'
import { isBudgetableCategory } from '../categories/kind'

export { SUGGEST_MONTHS } from './useSuggestions'

export interface PlanningData {
  summary: PlanSummary
  /** hệ quả nếu điền tiếp kế hoạch; null = chưa biết thu nhập */
  projection: PlanProjection | null
  /** số người dùng tự khai; null = chưa khai */
  declared: number | null
  /** trung bình các tháng đã đóng sổ; null = chưa đủ dữ liệu */
  baseline: number | null
  commitments: CommitmentReport
  /** danh mục có cam kết vượt hạn mức đang đặt */
  gaps: CoverageGap[]
  suggestions: Map<string, Suggestion>
  /** bốn khối hạn mức đã xếp theo trục (B30) */
  groups: PlanGroups
  /** hạn mức đang đặt theo danh mục — cho danh sách và cho phép đối chiếu */
  budgetedByCat: Map<string, number>
  /** id dòng hạn mức theo danh mục — sheet cần nó để xoá được */
  budgetIdByCat: Map<string, string>
  /** cờ dồn theo danh mục — sheet cần nó để LƯU không âm thầm tắt cờ đang bật */
  rolloverByCat: Map<string, boolean>
  /** danh mục CHƯA đặt hạn mức mà có gợi ý — nguồn của khối "Cần bạn quyết" (B31.3) */
  unset: { cat: CategoryRow; suggestion: Suggestion }[]
  /** trần theo nhãn quy về "tháng này còn tiêu được bao nhiêu" */
  tagPlan: TagPlanLine[]
  /** riêng cờ thiếu tỷ giá của phần nhãn — nó tính trên chi CẢ ĐỜI, khác nguồn với cam kết */
  tagHasMissingRate: boolean
  hasMissingRate: boolean
}

/** Dòng hạn mức đang mở thanh trượt. */
export interface PlanDraft {
  categoryId: string
  /** số đang hiện trên thanh (base minor) — chưa chắc đã ghi xuống máy chủ */
  amount: number
  /**
   * Hạn mức lúc MỞ thanh. Chỉ dùng để ghim vị trí (xem `pinned` trong planGroups), không
   * bao giờ dùng làm số hiện hay số cộng.
   *
   * Vì sao không lấy hạn mức đã lưu: kéo về ¥0 rồi nhả tay thì số đã lưu THÀNH 0, mà 0 nằm
   * dưới `TAIL_LIMIT` nên dòng rơi vào đuôi đang gấp và biến mất ngay sau khi người dùng
   * vừa chủ ý đặt nó. Lấy mốc lúc mở thì dòng đứng nguyên chỗ suốt lúc thanh còn mở, kể cả
   * sau khi đã ghi.
   */
  placeAt: number
}

/**
 * Dữ liệu để lập kế hoạch cho `monthKey`.
 *
 * Cây hạn mức dựng bằng `buildBudgetDisplay()` trên một `BudgetReport` có `spent = 0`,
 * KHÔNG bằng cách tự lọc danh mục lá lần thứ hai (B30.6). Lý do: `buildBudgetDisplay` đã
 * duyệt cây cha/con đúng luật "đặt ở cha trước", nên trần đặt ở danh mục CHA ra một dòng
 * thật. Bản trước lọc `!categories.some(k => k.parent_id === c.id)` nên cảnh báo "Trần
 * nhóm Nhà ở đang ¥0" trỏ tới một cái tên không có dòng nào trong danh sách bên cạnh.
 *
 * `draft` là hạn mức đang kéo dở của MỘT danh mục. Truyền vào thì cả mặt lập kế hoạch tính
 * lại theo số đó ngay, chưa cần ghi xuống máy chủ.
 */
export function usePlanning(monthKey: MonthKey, draft?: PlanDraft | null): PlanningData {
  const { data: profile } = useProfile()
  const { data: categories = [] } = useCategories()
  const { base, rates } = useRates()
  const transferIds = useTransferCategoryIds()
  const monthKeyStr = monthKeyString(monthKey)
  const { data: savedBudgets = [] } = useBudgets(monthKeyStr)
  const { data: plan } = useMonthPlan(monthKeyStr)
  // Dựng cho ĐÚNG tháng đang lập: trần kỳ 'monthly' phải soi vào tháng đó (chưa tiêu
  // gì → còn nguyên trần), còn kỳ 'total' vốn tính cả đời nên không phụ thuộc kỳ nào.
  const tagBudgets = useTagBudgets(monthKey)
  const commitments = useCommitments(monthKey)
  const { suggestions, baseline } = useSuggestions()

  // Số đang KÉO vá vào `budgets` ngay tại cửa vào của hook, TRƯỚC mọi phép tính. Nhờ vậy
  // "đã chia", "chưa phân bổ", ba thanh trục và cả `projection` cùng nhúc nhích trong một
  // lần kéo — chúng là một phép tính, không phải năm phép được canh cho khớp (xem ghi chú
  // ở PlanningView, khối "Cơ cấu theo kế hoạch"). Vá ở cuối, chỗ nào cần thì tự cộng, là
  // cách chắc chắn có chỗ bị bỏ sót.
  //
  // Danh mục chưa có dòng hạn mức thì KHÔNG vá: dựng một dòng giả kéo theo một `id` giả,
  // mà `budgetIdByCat` chính là thứ tấm trượt dùng để xoá. Thanh trượt cũng chỉ mở ở dòng
  // của bốn khối hạn mức — dòng nào cũng đã có hạn mức thật.
  const budgets = useMemo(() => {
    if (!draft) return savedBudgets
    const i = savedBudgets.findIndex((b) => b.category_id === draft.categoryId)
    if (i < 0) return savedBudgets
    const next = savedBudgets.slice()
    next[i] = { ...next[i], amount: draft.amount }
    return next
  }, [savedBudgets, draft])

  return useMemo(() => {
    const parentOf = (id: string) => categories.find((c) => c.id === id)?.parent_id ?? null
    const summary = planSummary(
      plan?.expected_income ?? null,
      baseline,
      budgets,
      categories,
      {
        essentialBps: profile?.target_essential_bps ?? 5000,
        flexibleBps: profile?.target_flexible_bps ?? 3000,
        savingsBps: profile?.target_savings_bps ?? 2000,
      },
      parentOf,
    )

    const budgetedByCat = new Map(budgets.map((b) => [b.category_id, b.amount]))
    const gaps = coverageGaps(commitments.byCategory, budgetedByCat, parentOf)
    const { markers } = plannedSlices(budgets, parentOf)
    const markerIds = new Set(markers.map((m) => m.categoryId))

    // Báo cáo có `spent = 0` ở mọi dòng: không giao dịch nào, không phần dồn nào. Phần dồn
    // cố ý để rỗng — nó chỉ chốt được khi tháng trước đã đóng sổ, cùng lý do `plannedSlices`
    // dùng `amount` gốc chứ không phải `budgeted`.
    const zeroReport = buildBudgetReport(
      budgets,
      [],
      () => base,
      base,
      rates ?? {},
      parentOf,
      new Map(),
      transferIds,
    )
    const expenseCats = categories
      .filter((c) => c.type === 'expense' && !c.is_archived)
      .sort((a, b) => a.sort_order - b.sort_order)
    const display: BudgetDisplay = buildBudgetDisplay(expenseCats, zeroReport)

    const groups = planGroups({
      items: display.items,
      categories,
      suggestions,
      committedByCat: commitments.byCategory,
      gaps,
      axis: summary.axis,
      markerSlices: markers,
      // Ghim VỊ TRÍ dòng đang mở thanh, theo mốc lúc mở — xem `placeAt` và `pinned`.
      pinned: draft ? { categoryId: draft.categoryId, limit: draft.placeAt } : null,
    })

    // Danh mục ĐẶT ĐƯỢC hạn mức mà chưa đặt, và có lịch sử để gợi ý. Cùng bộ lọc với
    // `buildBudgetDisplay`: dòng chảy (Cho vay / Trả nợ / Điều chỉnh số dư) và danh mục
    // `kind = 'transfer'` không đặt được trần, nên mời đặt là mời làm một việc vô nghĩa.
    const budgetable = (c: CategoryRow) =>
      c.type === 'expense' &&
      !c.is_archived &&
      !isFlowCategory(c) &&
      isBudgetableCategory(c) &&
      !categories.some((k) => k.parent_id === c.id && !k.is_archived)
    const unset = categories
      .filter((c) => budgetable(c) && !budgetedByCat.has(c.id) && !markerIds.has(c.id))
      .map((c) => ({ cat: c, suggestion: suggestions.get(c.id) ?? null }))
      .filter((r): r is { cat: typeof r.cat; suggestion: Suggestion } =>
        r.suggestion !== null && r.suggestion.average > 0,
      )
      .sort((a, b) => b.suggestion.average - a.suggestion.average)

    const catById = new Map(categories.map((c) => [c.id, c]))
    const projection = planProjection({
      summary,
      suggestions,
      budgetedByCat,
      gaps,
      savingsBps: profile?.target_savings_bps ?? 2000,
      isMarker: (id) => markerIds.has(id),
      isBudgetable: (id) => {
        const c = catById.get(id)
        return c ? budgetable(c) : false
      },
    })

    return {
      summary,
      projection,
      declared: plan?.expected_income ?? null,
      baseline,
      commitments,
      gaps,
      suggestions,
      groups,
      budgetedByCat,
      budgetIdByCat: new Map(budgets.map((b) => [b.category_id, b.id])),
      rolloverByCat: new Map(budgets.map((b) => [b.category_id, !!b.rollover])),
      unset,
      tagPlan: tagPlanLines(tagBudgets.lines),
      tagHasMissingRate: tagBudgets.hasMissingRate,
      hasMissingRate: commitments.hasMissingRate,
    }
  }, [
    budgets,
    draft,
    plan,
    baseline,
    suggestions,
    commitments,
    tagBudgets,
    categories,
    base,
    rates,
    profile,
    transferIds,
  ])
}
