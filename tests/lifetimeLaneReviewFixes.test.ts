// Guardrail Ở MỨC NGUỒN cho ba finding của review 2026-09-09 trên `PhaseLane.tsx` /
// `EventPins.tsx` / `useYearDrag.ts` — đọc file, không cần DOM (repo KHÔNG có
// @testing-library/react, xem comment đầu `tests/designSystem.test.ts`: "không có test
// render nào để dựa vào"). Đây là lựa chọn "ít nhất" mà finding cho phép khi không có RTL:
// một guardrail cấu trúc, cùng lối `designSystem.test.ts` / `pushBundle.test.ts` — không
// mô phỏng được một cú Tab+Enter thật, nhưng bắt được đúng DẠNG hồi quy đã xảy ra: xoá
// nhánh Enter/Space, viết nhánh đó SAU nhánh ←/→ (khi `return` của ←/→ đã chặn), hay bỏ sót
// một trong ba nút. Phép thử LOGIC thật (khớp phím nào là "kích hoạt") nằm ở
// `src/features/lifetime/keyboardActivation.test.ts` — không DOM, chạy được thật.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const LIFETIME = fileURLToPath(new URL('../src/features/lifetime/', import.meta.url))
const phaseLane = readFileSync(LIFETIME + 'PhaseLane.tsx', 'utf8')
const eventPins = readFileSync(LIFETIME + 'EventPins.tsx', 'utf8')
const useYearDrag = readFileSync(LIFETIME + 'useYearDrag.ts', 'utf8')
const tuongLaiPage = readFileSync(LIFETIME + 'TuongLaiPage.tsx', 'utf8')
const dragPhase = readFileSync(LIFETIME + 'dragPhase.ts', 'utf8')
const planDockPhase = readFileSync(LIFETIME + 'PlanDockPhase.tsx', 'utf8')

/**
 * Nội dung BÊN TRONG cặp ngoặc nhọn cân bằng ngay sau `${attr}={` — dùng để tách từng
 * `onKeyDown={(e) => { ... }}` (hay `onNudge={(step) => ...}`) ra khỏi JSX bao quanh mà
 * không cần một trình phân tích cú pháp thật. Đúng cho các handler ở đây vì chúng không có
 * chuỗi ký tự chứa `{`/`}` chưa cân (không có template literal nào trong thân các handler
 * đang kiểm).
 */
function attrBlocks(source: string, attr: string): string[] {
  return bracedBlocks(source, `${attr}={`)
}

/** Như `attrBlocks`, nhưng cho cú pháp thuộc tính OBJECT (`key: { ... }`) thay vì JSX
 *  (`key={...}`) — dùng cho object trả về của `useYearDrag`. */
function propBlocks(source: string, key: string): string[] {
  return bracedBlocks(source, `${key}: {`)
}

function bracedBlocks(source: string, marker: string): string[] {
  const out: string[] = []
  let idx = 0
  for (;;) {
    const at = source.indexOf(marker, idx)
    if (at === -1) break
    const braceStart = at + marker.length - 1
    let depth = 0
    let i = braceStart
    for (; i < source.length; i++) {
      if (source[i] === '{') depth++
      else if (source[i] === '}') {
        depth--
        if (depth === 0) break
      }
    }
    out.push(source.slice(braceStart + 1, i))
    idx = i + 1
  }
  return out
}

describe('Finding 1 (CRITICAL) — Enter/Space phải bật/tắt lựa chọn TRƯỚC nhánh ←/→', () => {
  it('PhaseLane.tsx: đúng MỘT onKeyDown (khối chặng — hai mép kéo là aria-hidden, không focus được nên không cần), gọi onToggle(phase.id) qua isActivationKey trước nhánh ←/→', () => {
    const blocks = attrBlocks(phaseLane, 'onKeyDown')
    expect(blocks).toHaveLength(1)
    const body = blocks[0]
    const iAct = body.indexOf('isActivationKey(e.key)')
    const iToggle = body.indexOf('onToggle(phase.id)')
    const iArrow = body.indexOf("e.key !== 'ArrowLeft'")
    expect(iAct).toBeGreaterThan(-1)
    expect(iToggle).toBeGreaterThan(-1)
    expect(iArrow).toBeGreaterThan(-1)
    // Thứ tự: bắt phím kích hoạt, GỌI onToggle, rồi mới tới nhánh ←/→ — không phải ngược
    // lại (nếu nhánh ←/→ đứng trước và `return` sớm, Enter/Space không bao giờ chạy tới).
    expect(iAct).toBeLessThan(iToggle)
    expect(iToggle).toBeLessThan(iArrow)
  })

  it('EventPins.tsx: đúng HAI onKeyDown (icon mốc + chốt kết thúc), cả hai gọi onToggle?.(e.id) qua isActivationKey trước nhánh ←/→', () => {
    const blocks = attrBlocks(eventPins, 'onKeyDown')
    expect(blocks).toHaveLength(2)
    for (const body of blocks) {
      const iAct = body.indexOf('isActivationKey(ev.key)')
      const iToggle = body.indexOf('onToggle?.(e.id)')
      const iArrow = body.indexOf("ev.key !== 'ArrowLeft'")
      expect(iAct).toBeGreaterThan(-1)
      expect(iToggle).toBeGreaterThan(-1)
      expect(iArrow).toBeGreaterThan(-1)
      expect(iAct).toBeLessThan(iToggle)
      expect(iToggle).toBeLessThan(iArrow)
    }
  })

  it('cả ba nơi đều import isActivationKey từ file dùng chung, không viết tay lại `key === \'Enter\'` (dễ quên Space hoặc quên một trong ba nút khi sửa riêng lẻ)', () => {
    expect(phaseLane).toMatch(/import\s*\{\s*isActivationKey\s*\}\s*from\s*'\.\/keyboardActivation'/)
    expect(eventPins).toMatch(/import\s*\{\s*isActivationKey\s*\}\s*from\s*'\.\/keyboardActivation'/)
  })
})

describe('Finding 2 (Important) — ←/→ trên khối chặng phải CHẶN tại hàng xóm, không dò-năm-trống', () => {
  it('PhaseLane.tsx: onNudge gọi onMoveStart qua blockPhaseStartYearAtNeighbours, không cộng thẳng step rồi gọi onMoveStart', () => {
    const blocks = attrBlocks(phaseLane, 'onNudge')
    expect(blocks).toHaveLength(1)
    const body = blocks[0]
    expect(body).toContain('blockPhaseStartYearAtNeighbours(phases, b.id, b.startYear + step)')
    // Hồi quy cụ thể đã fix: đường CŨ gọi thẳng `onMoveStart(b.id, b.startYear + step)`
    // (không đi qua hàm chặn nào) — xác nhận `onMoveStart(` không đứng ngay trước
    // `b.id, b.startYear + step)` (tức lời gọi step cộng thẳng đã KHÔNG còn tồn tại trần
    // trụi, mà đã được bọc trong lời gọi blockPhaseStartYearAtNeighbours ở trên).
    expect(body).not.toMatch(/onMoveStart\(\s*b\.id\s*,\s*b\.startYear \+ step\s*\)/)
  })
})

describe('Review CUỐI NHÁNH, Finding 1 (CRITICAL) — đường KÉO chỉ đi qua MỘT phép chặn, và không phải phép của ô năm', () => {
  // Số học của cả hai hệ quả nằm ở `src/features/lifetime/dragPhase.test.ts` (phép thử
  // THẬT, chạy trên mã đã ship). Khối này canh cái mà một phép thử thuần không thấy: chỗ
  // NỐI DÂY. Hồi quy đã xảy ra chính là ở đó — hai hàm đúng, mắc nối tiếp thành sai.
  it('TuongLaiPage.tsx: không còn một lời gọi `clampPhaseStartYear(` nào — luật đó chỉ thuộc ô năm trong dock', () => {
    expect(tuongLaiPage).not.toMatch(/clampPhaseStartYear\s*\(/)
  })

  it('TuongLaiPage.tsx: dải chặng nhận đúng writer của đường kéo (`dragPhaseStartYear`), và writer đó gọi `dragPhaseStart` trong mutator', () => {
    expect(tuongLaiPage).toContain('onMoveStart={dragPhaseStartYear}')
    expect(tuongLaiPage).toMatch(/editDraft\(\(d\) => dragPhaseStart\(d, id, wanted\)\)/)
  })

  it('dragPhase.ts: chặn bằng ĐÚNG một hàm, trên `draft.phases` của bản nháp truyền vào (không phải một mảng chụp từ trước)', () => {
    expect(dragPhase).toContain('blockPhaseStartYearAtNeighbours(draft.phases, id, wanted)')
    // Không GỌI, và không import — luật của ô năm gõ tay không có đường vào đây. (Tên hàm
    // đó vẫn được phép xuất hiện trong lời ghi: đó là chỗ giải thích vì sao nó không ở đây.)
    expect(dragPhase).not.toMatch(/clampPhaseStartYear\s*\(/)
    expect(dragPhase).toMatch(
      /import \{ blockPhaseStartYearAtNeighbours \} from '\.\/phaseYear'/,
    )
  })

  it('PlanDockPhase.tsx: ô năm trong dock GIỮ NGUYÊN `clampPhaseStartYear` — quyết định đã chốt, bản sửa này không được gộp hai đường', () => {
    expect(planDockPhase).toContain('clampPhaseStartYear(sorted, phase.id, y, currentYear)')
  })

  it('PlanDockPhase.tsx: câu nhắc chặng-đầu-ở-tương-lai không còn hứa một tính năng "sắp có" (Finding 3)', () => {
    expect(planDockPhase).not.toMatch(/sắp có/)
  })
})

describe('Finding 3 (Minor) — mất pointer capture (kể cả do phần tử bị unmount giữa lúc kéo) phải kết thúc gesture sạch', () => {
  it('useYearDrag.ts: surface trả về nối onLostPointerCapture vào CÙNG handler end() với onPointerCancel — dùng chung, không viết một nhánh huỷ riêng', () => {
    const blocks = propBlocks(useYearDrag, 'surface')
    expect(blocks).toHaveLength(1)
    const body = blocks[0]
    expect(body).toContain('onPointerCancel: end')
    expect(body).toContain('onLostPointerCapture: end')
  })

  it('PhaseLane.tsx: kiểu DragSurface khai onLostPointerCapture (không lặng lẽ dựa vào trường thừa không được gõ kiểu)', () => {
    expect(phaseLane).toMatch(/onLostPointerCapture:\s*\(e: ReactPointerEvent<HTMLElement>\) => void/)
  })
})
