import { describe, expect, it } from 'vitest'
import type { CategoryRow } from '../../types/database.types'
import type { TagBudgetLine } from '../tags/budget'
import { dailyHeadline, daySpanLabel } from './dailyHeadline'
import type { DailySpendSeries, DaySpend } from './dailySpike'
import type { DayTagCells, TagDayRow } from './dayTagCells'

/** Tháng 10 ngày cho gọn — mọi ca dưới đây chỉ cần đủ chỗ cho một đợt 3 ngày. */
const N = 10

const day = (i: number, total: number, catId: string | null = null): DaySpend => ({
  date: `2026-08-${String(i + 1).padStart(2, '0')}`,
  total,
  top: total > 0 ? [{ categoryId: catId, note: null, amount: total }] : [],
})

function seriesOf(totals: number[], peakCat: string | null = null): DailySpendSeries {
  const days = totals.map((t, i) => day(i, t, t === Math.max(...totals) ? peakCat : null))
  const spend = [...totals.filter((t) => t > 0)].sort((a, b) => a - b)
  const mid = Math.floor(spend.length / 2)
  const typical =
    spend.length === 0
      ? 0
      : spend.length % 2 === 1
        ? spend[mid]
        : Math.round((spend[mid - 1] + spend[mid]) / 2)
  let peakIndex = -1
  for (let i = 0; i < days.length; i++)
    if (days[i].total > 0 && (peakIndex === -1 || days[i].total > days[peakIndex].total)) peakIndex = i
  return { days, typical, peakIndex, hasMissingRate: false, txCount: spend.length }
}

/** Hàng nhãn có ô ở đúng những chỉ số `at`, mỗi ô `each` đồng. */
function rowOf(tagId: string, at: number[], each: number): TagDayRow {
  const cells = new Array<number>(N).fill(0)
  for (const i of at) cells[i] = each
  return {
    tagId,
    name: `#${tagId}`,
    color: 'green',
    cells,
    total: at.length * each,
    firstISO: day(at[0], 0).date,
    lastISO: day(at[at.length - 1], 0).date,
  }
}

function cellsOf(rows: TagDayRow[]): DayTagCells {
  const rowsTotal = rows.reduce((s, r) => s + r.total, 0)
  return {
    groups: rows.length > 0 ? [{ groupId: 'g', title: 'Ở đâu?', rows }] : [],
    hidden: 0,
    taggedTotal: rowsTotal,
    taggedCount: rows.length,
    rowsTotal,
    hasMissingRate: false,
  }
}

const line = (over: Partial<TagBudgetLine> & { tagId: string }): TagBudgetLine => ({
  name: `#${over.tagId}`,
  color: 'green',
  period: 'total',
  spent: 0,
  budget: 0,
  ratio: 0,
  remaining: 0,
  status: 'ok',
  categoryCount: 1,
  ...over,
})

const cat = (id: string, cost: CategoryRow['cost_type']): CategoryRow =>
  ({ id, cost_type: cost }) as CategoryRow

const categoryOf = (id: string | null) =>
  id === 'nha' ? cat('nha', 'fixed') : id === 'an' ? cat('an', 'variable') : undefined

describe('daySpanLabel', () => {
  it('một ngày, một khoảng trong tháng, và khoảng vắt tháng', () => {
    expect(daySpanLabel('2026-08-09', '2026-08-09')).toBe('09/08')
    expect(daySpanLabel('2026-08-09', '2026-08-11')).toBe('09–11/08')
    expect(daySpanLabel('2026-08-30', '2026-09-02')).toBe('30/08–02/09')
  })
})

describe('dailyHeadline — thứ tự ưu tiên bốn nhánh (B45)', () => {
  it('1 · trần nhãn sắp cạn thắng mọi nhánh khác', () => {
    const series = seriesOf([4_000, 5_000, 20_000, 20_000, 18_400, 3_000, 0, 0, 0, 0])
    const cells = cellsOf([rowOf('osaka', [2, 3, 4], 19_466)])
    const r = dailyHeadline({
      series,
      cells,
      tagLines: [
        line({ tagId: 'osaka', spent: 58_400, budget: 60_000, ratio: 0.973, remaining: 1_600 }),
      ],
      categoryOf,
    })
    expect(r).toMatchObject({
      kind: 'tagCap',
      tagName: '#osaka',
      remaining: 1_600,
      period: 'total',
      span: '03–05/08',
    })
  })

  it('1 · nhãn có trần cao nhưng KHÔNG phát sinh tháng này thì không được nói', () => {
    // Một chuyến đã xong tháng trước vẫn còn `ratio` cao, nhưng nó không giải thích được
    // cột nào ở đây — câu kết luận phải nói về tháng đang xem.
    const series = seriesOf([4_000, 5_000, 20_000, 20_000, 18_400, 3_000, 0, 0, 0, 0])
    const r = dailyHeadline({
      series,
      cells: cellsOf([]),
      tagLines: [line({ tagId: 'cu', spent: 58_400, budget: 60_000, ratio: 0.97, remaining: 1_600 })],
      categoryOf,
    })
    expect(r?.kind).not.toBe('tagCap')
  })

  it('2 · mấy đợt gom lại, kèm phần trăm của cả tháng', () => {
    // Osaka 03–05 (¥57.000) + Tokyo 08–09 (¥18.000) trên tổng ¥80.000 → 94%.
    const series = seriesOf([1_000, 1_000, 19_000, 19_000, 19_000, 1_000, 1_000, 9_000, 9_000, 1_000])
    const r = dailyHeadline({
      series,
      cells: cellsOf([rowOf('osaka', [2, 3, 4], 19_000), rowOf('tokyo', [7, 8], 9_000)]),
      tagLines: [],
      categoryOf,
    })
    expect(r).toMatchObject({ kind: 'tagRuns', pct: 94 })
    expect(r?.kind === 'tagRuns' && r.runs.map((x) => x.span)).toEqual(['03–05/08', '08–09/08'])
  })

  it('2 · nhãn RẢI khắp tháng không phải một đợt', () => {
    // #Người yêu chạm ngày rải rác; gọi nó là "một đợt 01–10/08" là bịa ra một khoảng
    // liên tục không có thật — đúng lỗi mà ô vuông rời của B44.3 đi tránh.
    const series = seriesOf([9_000, 1_000, 9_000, 1_000, 9_000, 1_000, 9_000, 1_000, 9_000, 1_000])
    const r = dailyHeadline({
      series,
      cells: cellsOf([rowOf('yeu', [0, 2, 4, 6, 8], 9_000)]),
      tagLines: [],
      categoryOf,
    })
    expect(r?.kind).not.toBe('tagRuns')
  })

  it('3 · không có nhãn nào thì giữ câu cũ — nhưng chỉ khi đỉnh KHÔNG phải khoản cố định', () => {
    const series = seriesOf([1_000, 2_000, 30_000, 1_000, 1_000, 0, 0, 0, 0, 0], 'an')
    const r = dailyHeadline({ series, cells: cellsOf([]), tagLines: [], categoryOf })
    expect(r).toMatchObject({ kind: 'peak', dateISO: '2026-08-03', total: 30_000 })
  })

  it('4 · CHẶN — đỉnh là khoản cố định thì KHÔNG được ra câu cũ', () => {
    // "Cao nhất 01/08 — ¥124.696, gấp 41 lần ngày thường": ngày trả tiền nhà thì TẤT NHIÊN
    // gấp 41 lần. Câu đó chiếm dòng kết luận mà không nói được điều gì chưa biết.
    const series = seriesOf([124_696, 3_000, 4_000, 5_000, 3_000, 0, 0, 0, 0, 0], 'nha')
    const r = dailyHeadline({ series, cells: cellsOf([]), tagLines: [], categoryOf })
    expect(r?.kind).toBe('typical')
    expect(r).toMatchObject({ typical: 4_000 })
    // Không nhánh nào được chứa "gấp N lần" nữa.
    expect(r?.kind === 'typical' && r.overDays).toBe(1)
  })

  it('tháng chưa có khoản chi nào thì im — thẻ đã có trạng thái rỗng riêng', () => {
    const series = seriesOf([0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
    expect(dailyHeadline({ series, cells: cellsOf([]), tagLines: [], categoryOf })).toBeNull()
  })
})
