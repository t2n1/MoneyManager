// Canh MỘT ngữ pháp cho cả dòng cha và dòng con trong khối hạn mức, và canh sheet đặt
// hạn mức nói đủ ở CẢ HAI tab.
//
// Vì sao cần canh — ca thật, tháng 8/2026: nhóm "Ngoại hình" trần ¥1.800, mục con
// "Cắt tóc" mốc ¥2.400, đã chi ¥1.800. Trên màn hiện ra ba số 1.800 mang hai nghĩa
// khác nhau (đã chi cả nhóm · trần nhóm · đã chi của Cắt tóc), trong khi mốc 2.400 —
// số duy nhất giải thích được câu cảnh báo — không xuất hiện ở đâu ngoài chính câu
// cảnh báo. Dòng cha in "đã chi / trần", dòng con in "đã chi · còn": hai ngữ pháp
// trong một khối, cùng chỗ đứng, khác nghĩa. Người dùng đọc số của dòng con là mốc
// mình đặt và kết luận app tự bịa số.
//
// Đọc CHUỖI NGUỒN chứ không render: repo không có @testing-library. Cùng lối
// budgetLayout.test.ts / overlayLayers.test.ts.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const BUDGETS = join(fileURLToPath(new URL('..', import.meta.url)), 'src', 'features', 'budgets')
const view = readFileSync(join(BUDGETS, 'BudgetView.tsx'), 'utf8')
const plan = readFileSync(join(BUDGETS, 'PlanningView.tsx'), 'utf8')

/** Thân hàm `childRow` — từ chỗ khai đến `return (` của chính component. */
function childRowSrc(): string {
  const start = view.indexOf('const childRow = (child: BudgetChildRow)')
  expect(start, 'không tìm thấy childRow trong BudgetView.tsx').toBeGreaterThan(-1)
  const end = view.indexOf('\n  return (', start)
  return view.slice(start, end)
}

/** Cụm JSX `<BudgetEditSheet … />` trong một file. */
function sheetSrc(src: string, file: string): string {
  const start = src.indexOf('<BudgetEditSheet')
  expect(start, `không tìm thấy <BudgetEditSheet trong ${file}`).toBeGreaterThan(-1)
  return src.slice(start, src.indexOf('/>', start))
}

describe('dòng mục con trong khối hạn mức', () => {
  it('in TRẦN của mục con, không để người ta tự cộng ra', () => {
    expect(childRowSrc()).toContain('formatMoney(m.budgeted, base)')
  })

  it('dùng cùng ngữ pháp "đã chi / trần" như dòng cha', () => {
    expect(childRowSrc()).toContain("{' / '}")
  })

  it('không quay lại lối "đã chi · còn" — đó là ngữ pháp gây ra ca 2.400', () => {
    expect(childRowSrc()).not.toContain('restOf(')
  })

  it('nói rõ phần dồn, như dòng cha', () => {
    // Trần của con có thể gồm phần dồn từ tháng trước; không in ra thì con số đó lại
    // là một số không giải thích được nữa.
    expect(childRowSrc()).toContain('m.carried')
  })
})

describe('sheet đặt hạn mức nói đủ ở cả hai tab', () => {
  for (const [file, src] of [['BudgetView.tsx', view], ['PlanningView.tsx', plan]] as const) {
    it(`${file}: truyền hint — không để ai đặt mốc con trong im lặng`, () => {
      expect(sheetSrc(src, file)).toContain('hint=')
    })

    it(`${file}: truyền currentRollover — lưu KHÔNG được âm thầm tắt cờ dồn`, () => {
      // Thiếu prop này thì checkbox khởi tạo về unticked, và bấm Lưu ghi rollover=false
      // lên một hạn mức đang bật dồn.
      expect(sheetSrc(src, file)).toContain('currentRollover=')
    })
  }

  it('cả hai tab dùng CHUNG một câu hint, không mỗi nơi một bản', () => {
    for (const src of [view, plan]) expect(src).toContain("from './budgetHint'")
    expect(view, 'hintFor cũ phải bị thay bằng budgetHint dùng chung').not.toContain(
      'function hintFor',
    )
  })
})
