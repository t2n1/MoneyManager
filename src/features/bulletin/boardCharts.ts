// Dữ liệu cho các module BIỂU ĐỒ của bảng Bản tin — thuần, không JSX.
//
// Không có phép tính tiền nào mới ở đây: chuỗi tháng đến từ `monthlySeries`, cơ cấu danh
// mục từ `categoryBreakdown` + `groupByParent`, chi từng ngày từ `dailySpendSeries`, nhóm
// tài sản từ `useAssetsData`. File này chỉ XẾP lại những con số đó thành hàng cho biểu đồ
// (thêm nhãn, gộp đuôi thành "Khác", cộng dồn) — để Báo cáo và Bản tin không thể nói hai
// số khác nhau cho cùng một tháng.
import type { MonthKey } from '../../lib/dates'
import type { CategoryRow, NetWorthSnapshotRow } from '../../types/database.types'
import { categoryLabel, tr } from '../../i18n'
import { groupByParent, type Breakdown, type MonthlyPoint } from '../reports/aggregate'
import { savingsRate } from '../reports/insights'
import { groupDisplayName, type AssetGroup } from '../assets/aggregate'
import { GROUP_PALETTE, groupColorMap } from '../assets/groupColors'
import type { DaySpend } from '../reports/dailySpike'

/** "8/26" — trục tháng hẹp, năm hai chữ số là đủ phân biệt trong một dải 8–12 tháng. */
export const shortMonth = (k: MonthKey) => `${k.month}/${String(k.year).slice(2)}`

// ---- Thu & chi theo tháng --------------------------------------------------------------

export interface CashflowRow {
  label: string
  income: number
  expense: number
  /** thu − chi, có dấu */
  net: number
  /** % giữ lại, đã làm tròn; null khi tháng chưa có thu — KHÔNG phải 0 (đường phải đứt ở đó). */
  rate: number | null
}

export function cashflowRows(points: readonly MonthlyPoint[]): CashflowRow[] {
  return points.map((p) => {
    const r = savingsRate(p.income, p.expense)
    return {
      label: shortMonth(p.key),
      income: p.income,
      expense: p.expense,
      net: p.income - p.expense,
      rate: r === null ? null : Math.round(r * 100),
    }
  })
}

// ---- Chi theo danh mục -----------------------------------------------------------------

export interface SliceRow {
  id: string
  name: string
  amount: number
  /** 0..1 trên tổng của chính biểu đồ */
  share: number
  color: string
}

/** Lát xám của "Khác" — cùng màu nhóm-không-lát của trang Tài sản. */
export const OTHER_COLOR = 'var(--color-gray-500)'

/**
 * Gộp theo danh mục CHA (cùng `groupByParent` với thẻ cơ cấu của Báo cáo), giữ `top` nhóm
 * lớn nhất, phần đuôi gộp thành "Khác". Đuôi chỉ có MỘT nhóm thì in thẳng nhóm đó — một
 * lát "Khác" chứa đúng một danh mục là giấu tên nó đi vô cớ.
 */
export function categoryRows(b: Breakdown, categories: readonly CategoryRow[], top = 6): SliceRow[] {
  const groups = groupByParent(b.slices, categories as CategoryRow[])
  const total = groups.reduce((s, g) => s + g.total, 0)
  if (total <= 0) return []
  const nameOf = (id: string) => {
    const c = categories.find((x) => x.id === id)
    return c ? `${c.icon ? `${c.icon} ` : ''}${categoryLabel(c.name)}` : tr('Chưa rõ')
  }
  const head = groups.length <= top + 1 ? groups : groups.slice(0, top)
  const rows: SliceRow[] = head.map((g, i) => ({
    id: g.parentId,
    name: nameOf(g.parentId),
    amount: g.total,
    share: g.total / total,
    color: GROUP_PALETTE[i % GROUP_PALETTE.length],
  }))
  if (head.length < groups.length) {
    const rest = groups.slice(head.length).reduce((s, g) => s + g.total, 0)
    rows.push({ id: '__other', name: tr('Khác'), amount: rest, share: rest / total, color: OTHER_COLOR })
  }
  return rows
}

// ---- Chi luỹ kế trong tháng ------------------------------------------------------------

export interface CumulativeRow {
  /** ngày trong tháng, để làm nhãn trục */
  label: string
  date: string
  /** chi của riêng ngày đó; null sau hôm nay */
  daily: number | null
  /** chi cộng dồn tới hết ngày đó; null sau hôm nay (đường dừng ở hôm nay, không kéo phẳng) */
  cum: number | null
  /** đường hạn mức chia đều theo ngày — "tới hôm nay lẽ ra nên tiêu chừng này" */
  pace: number | null
}

export function cumulativeRows(days: readonly DaySpend[], cutoffISO: string, monthBudget: number): CumulativeRow[] {
  let run = 0
  const n = days.length
  return days.map((d, i) => {
    const future = d.date > cutoffISO
    if (!future) run += d.total
    return {
      label: String(Number(d.date.slice(8, 10))),
      date: d.date,
      daily: future ? null : d.total,
      cum: future ? null : run,
      pace: monthBudget > 0 && n > 0 ? Math.round((monthBudget * (i + 1)) / n) : null,
    }
  })
}

// ---- Tài sản ròng qua các tháng --------------------------------------------------------

export interface NetWorthRow {
  label: string
  date: string
  value: number
}

/** `limit` lần chụp gần nhất, cũ → mới. */
export function netWorthRows(snapshots: readonly NetWorthSnapshotRow[], limit = 12): NetWorthRow[] {
  return [...snapshots]
    .sort((a, b) => (a.snapshot_on < b.snapshot_on ? -1 : a.snapshot_on > b.snapshot_on ? 1 : 0))
    .slice(-limit)
    .map((s) => {
      const [y, m] = s.snapshot_on.split('-').map(Number)
      return { label: shortMonth({ year: y, month: m }), date: s.snapshot_on, value: s.net_worth }
    })
}

// ---- Cơ cấu tài sản --------------------------------------------------------------------

/**
 * Chỉ nhóm có LÁT (tính vào tổng, total > 0) — cùng luật gán màu `groupColorMap` của trang
 * Tài sản, nên chấm màu ở đây khớp vạch cơ cấu bên đó.
 */
export function assetMixRows(groups: readonly AssetGroup[]): SliceRow[] {
  const colors = groupColorMap(groups as AssetGroup[])
  const live = groups.filter((g) => g.includeInTotals && g.total > 0)
  const total = live.reduce((s, g) => s + g.total, 0)
  if (total <= 0) return []
  return live.map((g) => ({
    id: g.name,
    name: groupDisplayName(g.name),
    amount: g.total,
    share: g.total / total,
    color: colors.get(g.name) ?? OTHER_COLOR,
  }))
}
