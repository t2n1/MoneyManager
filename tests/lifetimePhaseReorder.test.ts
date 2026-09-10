// Guardrail Ở MỨC NGUỒN cho việc ĐỔI CHỖ chặng đời (2026-09-10). Số học đã có phép thử
// thật ở `src/features/lifetime/phaseOrder.test.ts`; file này canh CHỖ NỐI DÂY — thứ một
// phép thử thuần không thấy, và đúng là chỗ màn này đã gãy một lần: hai hàm đều đúng, mắc
// nối tiếp thành sai (review cuối nhánh 2026-09-09, Finding 1 — xem
// `tests/lifetimeLaneReviewFixes.test.ts`). Repo không có @testing-library/react nên không
// mô phỏng được một cú kéo thật; đây là mức "ít nhất" còn lại, cùng lối
// `designSystem.test.ts` / `pushBundle.test.ts`.
//
// BA HỒI QUY ĐƯỢC CANH, cả ba đều là "gộp hai đường lại làm một":
//   1. Kéo GIỮA khối gọi lại `onMoveStart` (đường dời NĂM) — tức đổi chỗ lại đi qua phép
//      chặn tại hàng xóm, thứ khiến chặng thứ hai bị chặn bởi chỗ chặng thứ nhất vừa dời tới.
//   2. Đổi chỗ tính trên mảng SỐNG thay vì ảnh chụp lúc nhấn — con trỏ đứng yên gần một
//      ranh giới mà hai chặng nhảy qua nhau liên tục, vì mỗi khung hình đọc lại đúng bố cục
//      mà chính nó vừa ghi.
//   3. Writer ở trang chặn LẦN THỨ HAI — đúng dạng của Finding 1 nói trên.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const LIFETIME = fileURLToPath(new URL('../src/features/lifetime/', import.meta.url))
const phaseLane = readFileSync(LIFETIME + 'PhaseLane.tsx', 'utf8')
const tuongLaiPage = readFileSync(LIFETIME + 'TuongLaiPage.tsx', 'utf8')
const phaseOrder = readFileSync(LIFETIME + 'phaseOrder.ts', 'utf8')

describe('PhaseLane — kéo GIỮA khối là ĐỔI CHỖ, tách hẳn khỏi đường dời năm', () => {
  it('nhánh `body` xử lý xong thì THOÁT, trước cả hai nhánh mép', () => {
    const iBody = phaseLane.indexOf("if (k.mode === 'body')")
    const iRight = phaseLane.indexOf("if (k.mode === 'right')")
    expect(iBody).toBeGreaterThan(-1)
    expect(iRight).toBeGreaterThan(-1)
    expect(iBody).toBeLessThan(iRight)
  })

  it('không còn lời gọi dời NĂM theo độ lệch của lượt kéo giữa khối (đường cũ)', () => {
    // Đường cũ: `onMoveStart(k.id, blockPhaseStartYearAtNeighbours(phases, k.id, k.from + (year - grabYear)))`.
    expect(phaseLane).not.toContain('k.from + (year - grabYear)')
  })

  it('đổi chỗ tính trên ẢNH CHỤP `k.spans`, không trên mảng sống', () => {
    expect(phaseLane).toContain('phaseDropIndex(k.spans, k.id, year - grabYear)')
    expect(phaseLane).toContain('reorderPhaseStarts(k.spans, k.id, to)')
    // `phaseDropIndex` KHÔNG được gọi trên một mảng nào khác `k.spans` — mảng sống `spans`
    // chỉ dành cho đường BÀN PHÍM (một việc rời, không có chuỗi khung hình để trôi).
    expect(phaseLane.match(/phaseDropIndex\(/g)).toHaveLength(1)
  })

  it('ảnh chụp được nhét vào lúc NHẤN, ở cả ba chỗ kéo được', () => {
    expect(phaseLane.match(/drag\.start\(\{ id: b\.id, mode: '\w+', from: b\.startYear, spans \}, e\)/g))
      .toHaveLength(3)
  })

  it('có đường BÀN PHÍM cho việc đổi chỗ (Alt+←/→), đọc mảng sống và đi cùng writer', () => {
    // Một tương tác chỉ-dùng-chuột là một lỗi ở repo này (lời ghi ở LifetimeChartCard.tsx).
    expect(phaseLane).toContain('if (e.altKey)')
    expect(phaseLane).toContain('onSwap(buoc)')
    expect(phaseLane).toContain('onReorder(reorderPhaseStarts(spans, b.id, i + step))')
  })

  it('←/→ TRẦN vẫn là dời NĂM qua phép chặn hàng xóm — bản này không được đổi nghĩa nó', () => {
    expect(phaseLane).toContain(
      'blockPhaseStartYearAtNeighbours(phases, b.id, b.startYear + step)',
    )
  })
})

describe('TuongLaiPage — writer của việc đổi chỗ chỉ ĐỔ bố cục, không chặn lần thứ hai', () => {
  it('dải nhận đúng hai prop mới, và writer gọi `setPhaseStarts` trong mutator', () => {
    expect(tuongLaiPage).toContain('lastYear={lastYear}')
    expect(tuongLaiPage).toContain('onReorder={reorderPhases}')
    expect(tuongLaiPage).toMatch(/editDraft\(\(d\) => setPhaseStarts\(d, starts\)\)/)
  })

  it('đường đổi chỗ không đi qua một phép chặn năm nào — đúng bài học của Finding 1', () => {
    // Cả trang không được có `clampPhaseStartYear` (đã canh ở lifetimeLaneReviewFixes), và
    // writer mới cũng không được gọi `dragPhaseStart`/`blockPhaseStartYearAtNeighbours`.
    const i = tuongLaiPage.indexOf('const reorderPhases = useCallback(')
    expect(i).toBeGreaterThan(-1)
    const than = tuongLaiPage.slice(i, tuongLaiPage.indexOf('[editDraft],', i))
    expect(than).not.toMatch(/blockPhaseStartYearAtNeighbours|clampPhaseStartYear|dragPhaseStart/)
  })
})

describe('phaseOrder.ts — đường ghi đòi ĐỦ BỘ, và không mượn luật của đường dời năm', () => {
  it('không gọi phép chặn hàng xóm hay luật ô năm', () => {
    expect(phaseOrder).not.toMatch(/blockPhaseStartYearAtNeighbours\s*\(/)
    expect(phaseOrder).not.toMatch(/clampPhaseStartYear\s*\(/)
  })

  it('`setPhaseStarts` kiểm đủ ba điều kiện trước khi ghi (số lượng · id trùng · phủ hết)', () => {
    const i = phaseOrder.indexOf('export function setPhaseStarts')
    expect(i).toBeGreaterThan(-1)
    const than = phaseOrder.slice(i)
    expect(than).toContain('starts.length !== draft.phases.length')
    expect(than).toContain('nam.size !== starts.length')
    expect(than).toContain('draft.phases.every((p) => nam.has(p.id))')
  })
})
