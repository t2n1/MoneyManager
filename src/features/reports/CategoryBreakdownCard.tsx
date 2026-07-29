import { useEffect, useState } from 'react'
import { formatMoney, type CurrencyCode } from '../../lib/money'
import type { MonthKey } from '../../lib/dates'
import type { CategoryRow } from '../../types/database.types'
import { groupByParent, type Breakdown, type CategoryMonthlyPoint } from './aggregate'
import { CategoryLineChart } from './CategoryLineChart'
import { BreakdownRow } from './BreakdownRow'

// Bảng màu cho thanh danh mục (lặp lại nếu > 12). Màu chỉ để phân biệt nhanh —
// nghĩa được truyền tải bằng NHÃN (tên + số tiền + %) nên không phụ thuộc màu.
const PALETTE = [
  '#16a34a', '#0ea5e9', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899',
  '#14b8a6', '#f97316', '#6366f1', '#84cc16', '#06b6d4', '#a855f7',
]

// Số danh mục cha hiển thị tối đa trước khi gộp phần còn lại thành "Khác".
const MAX_ROWS = 8

interface Props {
  breakdown: Breakdown
  categories: CategoryRow[]
  base: CurrencyCode
  kind: 'expense' | 'income'
  onKindChange: (kind: 'expense' | 'income') => void
  periodNoun: string
  /** Chuỗi tiền theo tháng cho tập danh mục (dùng vẽ đường xu hướng). */
  lineSeries: (ids: string[]) => CategoryMonthlyPoint[]
  /** Nhãn trục X của đường (theo khung tháng/năm đang xem). */
  lineLabelOf: (k: MonthKey) => string
}

interface ChildRow {
  id: string
  name: string
  icon: string
  value: number
  pct: number // so với tổng của cha
}

interface ParentRow {
  key: string // parentId hoặc '__other__'
  name: string
  icon: string
  value: number
  pct: number // so với tổng toàn khối
  color: string
  clickable: boolean
  parentId: string
  childIds: string[]
  children: ChildRow[]
  direct: number
  directPct: number // so với tổng của cha
}

// Khoá riêng cho dòng "(trực tiếp)" để không trùng id danh mục thật.
const directKey = (parentId: string) => `${parentId}::direct`

export function CategoryBreakdownCard({
  breakdown,
  categories,
  base,
  kind,
  onKindChange,
  periodNoun,
  lineSeries,
  lineLabelOf,
}: Props) {
  const total = breakdown.total
  const pctOf = (v: number) => (total > 0 ? (v / total) * 100 : 0)

  const groups = groupByParent(breakdown.slices, categories)
  const findCat = (id: string) => categories.find((c) => c.id === id)

  const all: ParentRow[] = groups.map((g, i) => {
    const cat = findCat(g.parentId)
    const childPctOf = (v: number) => (g.total > 0 ? (v / g.total) * 100 : 0)
    return {
      key: g.parentId,
      name: cat?.name ?? '?',
      icon: cat?.icon ?? '📦',
      value: g.total,
      pct: pctOf(g.total),
      color: PALETTE[i % PALETTE.length],
      clickable: true,
      parentId: g.parentId,
      childIds: g.children.map((c) => c.categoryId),
      children: g.children.map((c) => {
        const cc = findCat(c.categoryId)
        return {
          id: c.categoryId,
          name: cc?.name ?? '?',
          icon: cc?.icon ?? '📦',
          value: c.amount,
          pct: childPctOf(c.amount),
        }
      }),
      direct: g.direct,
      directPct: childPctOf(g.direct),
    }
  })

  // Gộp đuôi thành "Khác" (không bấm/xổ được) khi vượt ngưỡng.
  let parents = all
  if (all.length > MAX_ROWS + 1) {
    const head = all.slice(0, MAX_ROWS)
    const tail = all.slice(MAX_ROWS)
    const restValue = tail.reduce((sum, r) => sum + r.value, 0)
    parents = [
      ...head,
      {
        key: '__other__',
        name: `Khác (${tail.length} mục)`,
        icon: '',
        value: restValue,
        pct: pctOf(restValue),
        color: '#9ca3af',
        clickable: false,
        parentId: '',
        childIds: [],
        children: [],
        direct: 0,
        directPct: 0,
      },
    ]
  }

  const [openKey, setOpenKey] = useState<string | null>(null)
  const [selected, setSelected] = useState<{ key: string; ids: string[]; title: string } | null>(
    null,
  )
  // Đổi tab Chi/Thu → đóng accordion, tránh trỏ vào danh mục không còn trong danh sách.
  useEffect(() => {
    setOpenKey(null)
    setSelected(null)
  }, [kind])

  const lineColor = kind === 'expense' ? '#ef4444' : '#16a34a'
  const approx = breakdown.hasForeign ? '≈ ' : ''

  const openParent = (p: ParentRow) => {
    if (openKey === p.key) {
      setOpenKey(null)
      setSelected(null)
    } else {
      setOpenKey(p.key)
      setSelected({ key: p.key, ids: [p.parentId, ...p.childIds], title: p.name })
    }
  }

  return (
    <section className="rounded-xl bg-surface p-3 shadow-sm ">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-fg-muted">
            Cơ cấu theo danh mục
          </h2>
          {parents.length > 0 && (
            <p className="tabular-nums text-lg font-bold text-fg-primary">
              {approx}
              {formatMoney(total, base)}
            </p>
          )}
        </div>
        <div
          role="tablist"
          aria-label="Loại giao dịch"
          className="flex shrink-0 rounded-lg bg-surface-sunken p-0.5 text-xs font-medium "
        >
          <button
            type="button"
            role="tab"
            aria-selected={kind === 'expense'}
            onClick={() => onKindChange('expense')}
            className={`rounded-md px-3 py-2.5 transition ${kind === 'expense' ? 'bg-surface text-red-700 shadow-sm dark:text-red-400' : 'text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'}`}
          >
            Chi
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={kind === 'income'}
            onClick={() => onKindChange('income')}
            className={`rounded-md px-3 py-2.5 transition ${kind === 'income' ? 'bg-surface text-green-800 shadow-sm dark:text-green-400' : 'text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'}`}
          >
            Thu
          </button>
        </div>
      </div>

      {parents.length === 0 ? (
        <p className="py-10 text-center text-sm text-fg-muted">
          Chưa có {kind === 'expense' ? 'chi tiêu' : 'thu nhập'} trong {periodNoun}
        </p>
      ) : (
        <ul className="space-y-2.5">
          {parents.map((p) => {
            const isOpen = p.clickable && openKey === p.key
            return (
              <li key={p.key}>
                {p.clickable ? (
                  <button
                    type="button"
                    onClick={() => openParent(p)}
                    aria-expanded={isOpen}
                    className="block w-full text-left"
                  >
                    <BreakdownRow
                      icon={p.icon}
                      name={p.name}
                      pct={p.pct}
                      value={p.value}
                      barPct={p.pct}
                      color={p.color}
                      base={base}
                    />
                  </button>
                ) : (
                  <BreakdownRow
                    icon={p.icon}
                    name={p.name}
                    pct={p.pct}
                    value={p.value}
                    barPct={p.pct}
                    color={p.color}
                    base={base}
                  />
                )}

                {isOpen && (
                  <div className="mt-2 pl-3">
                    {selected && (
                      <CategoryLineChart
                        points={lineSeries(selected.ids)}
                        base={base}
                        color={lineColor}
                        labelOf={lineLabelOf}
                        title={`Xu hướng — ${selected.title}`}
                      />
                    )}
                    <ul className="mt-2 space-y-2">
                      {p.children.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            onClick={() => setSelected({ key: c.id, ids: [c.id], title: c.name })}
                            className="block w-full text-left"
                          >
                            <BreakdownRow
                              icon={c.icon}
                              name={c.name}
                              pct={c.pct}
                              value={c.value}
                              barPct={c.pct}
                              color={p.color}
                              base={base}
                              selected={selected?.key === c.id}
                            />
                          </button>
                        </li>
                      ))}
                      {p.direct > 0 && (
                        <li>
                          <button
                            type="button"
                            onClick={() =>
                              setSelected({
                                key: directKey(p.parentId),
                                ids: [p.parentId],
                                title: `${p.name} (trực tiếp)`,
                              })
                            }
                            className="block w-full text-left"
                          >
                            <BreakdownRow
                              icon=""
                              name="(trực tiếp)"
                              pct={p.directPct}
                              value={p.direct}
                              barPct={p.directPct}
                              color="#9ca3af"
                              base={base}
                              selected={selected?.key === directKey(p.parentId)}
                            />
                          </button>
                        </li>
                      )}
                    </ul>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
