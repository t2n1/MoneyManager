// Canh PHÁN QUYẾT ngân sách tháng — câu "với đà này có thủng trần không".
//
// Vì sao tách ra thành hàm thuần: câu này trước nằm lẫn trong `SpendPaceSection`, ngay
// dưới dòng "Đã chi … sau N/M ngày". Hai câu đứng cạnh nhau nhưng KHÁC PHẠM VI — dòng
// "đã chi" lấy `forecast` (toàn bộ chi), câu phán quyết lấy `budgetForecast` (chỉ mục đã
// đặt hạn mức). Trên demo hai số lệch nhau ¥47,054 mà không có gì nói vì sao.
//
// Giờ câu phán quyết chuyển lên thẻ "Tổng ngân sách", đứng cạnh đúng con số nó nói tới
// (tổng trần). Tách được thì mới canh được điều quan trọng nhất: nó KHÔNG BAO GIỜ
// nhìn vào `forecast`. Phép thử cuối trong file này là phép thử đó.
import { describe, expect, it } from 'vitest'
import type { Forecast } from './insights'
import type { MonthPace } from './monthPace'
import { pickBudgetVerdict } from './budgetVerdict'

function forecast(spentSoFar: number, low: number, projected: number, high: number): Forecast {
  return { projected, low, high, hasRange: low !== high, spentSoFar, daysElapsed: 14, daysInMonth: 31 }
}

/** MonthPace tối thiểu — chỉ các trường phán quyết đọc tới. */
function pace(p: Partial<MonthPace>): MonthPace {
  return {
    hasSpend: true,
    totalBudgeted: 100_000,
    budgetedCount: 4,
    forecast: forecast(90_000, 180_000, 190_000, 200_000),
    budgetForecast: forecast(40_000, 80_000, 85_000, 90_000),
    ...p,
  } as MonthPace
}

describe('pickBudgetVerdict', () => {
  it('nói "thủng" khi cả kịch bản chi ÍT nhất cũng vượt trần', () => {
    const v = pickBudgetVerdict(
      pace({ budgetForecast: forecast(60_000, 110_000, 125_000, 140_000) }),
    )
    expect(v).toEqual({ kind: 'over', totalBudgeted: 100_000, overBy: 25_000, budgetedCount: 4 })
  })

  it('nói "có thể vượt" khi chỉ cận TRÊN vượt trần', () => {
    const v = pickBudgetVerdict(
      pace({ budgetForecast: forecast(50_000, 90_000, 98_000, 110_000) }),
    )
    expect(v).toEqual({ kind: 'near', totalBudgeted: 100_000, budgetedCount: 4 })
  })

  it('nói "vẫn trong trần" khi cả cận trên cũng không vượt', () => {
    const v = pickBudgetVerdict(pace({}))
    expect(v).toEqual({ kind: 'under', totalBudgeted: 100_000, budgetedCount: 4 })
  })

  it('chưa đặt trần nào thì mời đặt, không phán quyết', () => {
    expect(pickBudgetVerdict(pace({ totalBudgeted: 0 }))).toEqual({ kind: 'unset' })
  })

  it('tháng chưa phát sinh chi thì im — không có gì để nói về đà', () => {
    expect(pickBudgetVerdict(pace({ hasSpend: false }))).toBeNull()
  })

  it('tháng đã qua (không có dự báo) thì im', () => {
    expect(pickBudgetVerdict(pace({ forecast: null, budgetForecast: null }))).toBeNull()
  })

  it('có trần nhưng chưa dựng được dự báo cùng phạm vi thì im, không rơi về số toàn bộ', () => {
    expect(pickBudgetVerdict(pace({ budgetForecast: null }))).toBeNull()
  })

  // Phép thử xương sống: `forecast` (toàn bộ chi) vượt trần rất xa, `budgetForecast`
  // (đúng phạm vi) thì không. Nếu ai đó đọc nhầm trường, phép thử này đỏ.
  it('KHÔNG nhìn vào forecast toàn bộ chi — chỉ nhìn budgetForecast', () => {
    const v = pickBudgetVerdict(
      pace({
        forecast: forecast(239_245, 320_271, 356_405, 392_539),
        budgetForecast: forecast(40_000, 70_000, 80_000, 90_000),
      }),
    )
    expect(v).toEqual({ kind: 'under', totalBudgeted: 100_000, budgetedCount: 4 })
  })
})
