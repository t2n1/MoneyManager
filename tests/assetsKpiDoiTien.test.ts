// Canh việc nút ¥/₫/$ ăn tới BỐN Ô LỚN của dải KPI trang Tài sản.
//
// Lỗi đã xảy ra thật: hai con số to nhất trang — "Tài sản ròng" và "Tổng tài sản" — in
// thẳng `currency={base}` với số minor tính theo tiền gốc, trong khi các ô còn lại
// ("Phải trả", "Cho vay còn lại", "Vốn đầu tư") đã đi qua `mv.view()`. Bấm sang ¥ thì
// chân trang đổi mà hai con số đầu đứng yên — tệ hơn cả không đổi gì, vì màn hình lúc đó
// trộn hai đồng tiền mà không nói ra.
//
// Canh bằng CHUỖI NGUỒN vì repo không có @testing-library (cùng lối assetsLayout.test.ts,
// overlayLayers.test.ts). Mốc được chọn là `currency={base}`: mọi con số của dải này đều
// phải lấy đồng tiền từ `mv` (qua `{...mv.view(...)}` hoặc `currency={mv.cur}`), nên một
// mã tiền cứng trong file này luôn là ô quên quy đổi.
//
// KHÔNG áp luật này cho InvestStocksTab.tsx: trang /invest không có nút đổi tiền, và
// `currency={base}` ở đó chính là tính năng (quy đổi danh mục ₫ về tiền gốc).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = join(fileURLToPath(new URL('..', import.meta.url)), 'src', 'features', 'assets')
const kpi = readFileSync(join(SRC, 'AssetsKpi.tsx'), 'utf8')

describe('dải KPI trang Tài sản đổi theo nút ¥/₫/$', () => {
  it('không ô nào in mã tiền gốc cứng — mọi số đi qua mv', () => {
    // Đỏ ở đây nghĩa là có ô quên `mv.view()`. Đừng nới mẫu tìm — hãy bọc con số lại.
    expect([...kpi.matchAll(/currency=\{base\}/g)].map((m) => m[0])).toEqual([])
  })

  it('bốn nhãn ô đều nằm trong file, để phép thử trên không canh một file rỗng', () => {
    for (const label of ['Tài sản ròng', 'Tổng tài sản', 'Phải trả', 'Vốn đầu tư đã bỏ vào']) {
      expect(kpi, label).toContain(label)
    }
  })
})
