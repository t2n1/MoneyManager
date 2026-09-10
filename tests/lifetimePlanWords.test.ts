// Guardrail Ở MỨC NGUỒN cho việc PHÂN BIỆT chặng với mốc (2026-09-10).
//
// Người dùng hỏi "cái chặng và cái mốc có đang bị giống nhau không?" — và câu trả lời đo
// được là: trên đồ thị thì không (chặng tô TRẦM dưới trục, mốc tô TƯƠI phía trên), nhưng ở
// chỗ CHỌN và chỗ SỬA thì có. Bản này chữa bằng bốn việc, và cả bốn đều là loại việc mà
// một phép thử thuần không thấy — chúng nằm ở chỗ NỐI DÂY và ở CHỮ:
//
//   1. Một CỬA mẫu duy nhất, hai nhóm mang CÂU HỎI thay vì tên loại (`QuickAddBoard`).
//   2. Không còn hai mẫu TRÙNG TÊN "Nghỉ hưu" ở hai bộ (`phasePresets.ts`).
//   3. Nhãn ⊕ cho mẫu làm luôn việc của nhóm kia, SUY từ `build()` chứ không khai tay.
//   4. Cặp câu nghĩa khai MỘT chỗ (`planWords.ts`), đọc ở sáu chỗ.
//
// Việc 4 là việc dễ mục nhất: một câu chữ thì ai cũng gõ lại được, và lúc đó cùng một khái
// niệm sẽ được tả bằng hai câu khác nhau ở hai chỗ cách nhau vài pixel. Chuyện đó đã xảy ra
// thật ở chính màn này với phép tô màu mốc — ba bản chép, hai cặp độ mờ khác nhau ở hai lớp
// KỀ NHAU của cùng một đồ thị (Finding 6, review cuối nhánh 2026-09-09). Repo không có
// @testing-library/react nên không mở được cửa mẫu trong test; đây là mức "ít nhất" còn
// lại, cùng lối `designSystem.test.ts` / `lifetimePhaseReorder.test.ts`.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { EVENT_WORDS, PHASE_WORDS } from '../src/features/lifetime/planWords.ts'

const LIFETIME = fileURLToPath(new URL('../src/features/lifetime/', import.meta.url))

/**
 * Đọc một file, BỎ HẾT LỜI GHI. Cùng phép bóc mà `categoryKind.test.ts` dùng.
 *
 * Bắt buộc ở đây, không phải cho gọn: những file này GIẢI THÍCH bản thay đổi, nên lời ghi
 * của chúng có trích đúng các câu và đúng tên hai cái nút cũ — quét cả lời ghi là phép thử
 * đỏ vì một tài liệu tốt. Cái phải canh là CHỖ VẼ và CHỖ NỐI DÂY, tức code.
 */
const doc = (f: string) =>
  readFileSync(LIFETIME + f, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*(\/\/|\*).*$/gm, '')

const planWords = doc('planWords.ts')
const phaseRowTools = doc('PhaseRowTools.tsx')
const quickAddBoard = doc('QuickAddBoard.tsx')
const dockPhase = doc('PlanDockPhase.tsx')
const dockEvent = doc('PlanDockEvent.tsx')
const drawer = doc('PlanListDrawer.tsx')
const tuongLaiPage = doc('TuongLaiPage.tsx')
const presets = doc('presets.ts')

const DOC_KHAC: [string, string][] = [
  ['PhaseRowTools.tsx', phaseRowTools],
  ['QuickAddBoard.tsx', quickAddBoard],
  ['PlanDockPhase.tsx', dockPhase],
  ['PlanDockEvent.tsx', dockEvent],
  ['PlanListDrawer.tsx', drawer],
  ['TuongLaiPage.tsx', tuongLaiPage],
  ['presets.ts', presets],
]

describe('planWords.ts — một chỗ khai, không sáu bản chép', () => {
  it('bốn câu chỉ nằm trong planWords.ts, không gõ lại ở chỗ đọc', () => {
    const cau = [PHASE_WORDS.question, PHASE_WORDS.hint, EVENT_WORDS.question, EVENT_WORDS.hint]
    for (const c of cau) {
      expect(planWords, c).toContain(c)
      for (const [ten, text] of DOC_KHAC) expect(text.includes(c), `${ten}: "${c}"`).toBe(false)
    }
  })

  // Dưới 45 ký tự thì guardrail văn xuôi của `designSystem.test.ts` xếp nó vào NHÃN, nên nó
  // được phép đứng NGOÀI <Guide> — tức không biến mất ở mật độ Gọn (mặc định của app). Đó
  // là cả điểm của cặp câu này: nó phải còn đó đúng lúc người dùng đang sửa. Viết dài hơn
  // thì phải bọc <Guide>, và bọc <Guide> thì mất tác dụng.
  it('phụ đề ngắn hơn ngưỡng văn xuôi (45 ký tự)', () => {
    expect(PHASE_WORDS.hint.length).toBeLessThan(45)
    expect(EVENT_WORDS.hint.length).toBeLessThan(45)
  })

  it('sáu chỗ đọc đều đọc từ hằng, không từ chuỗi trần', () => {
    expect(phaseRowTools).toContain('PHASE_WORDS.question')
    expect(phaseRowTools).toContain('EVENT_WORDS.question')
    expect(quickAddBoard).toContain('question={PHASE_WORDS.question} hint={PHASE_WORDS.hint}')
    expect(quickAddBoard).toContain('question={EVENT_WORDS.question} hint={EVENT_WORDS.hint}')
    expect(dockPhase).toContain('hint={PHASE_WORDS.hint}')
    expect(dockEvent).toContain('hint={EVENT_WORDS.hint}')
    expect(drawer).toContain('PHASE_WORDS.hint')
    expect(drawer).toContain('EVENT_WORDS.hint')
    expect(tuongLaiPage).toContain('PHASE_WORDS.legend')
    expect(tuongLaiPage).toContain('EVENT_WORDS.legend')
  })
})

describe('cửa mẫu — MỘT cửa, hai nhóm', () => {
  it('hàng 8 không còn hai nút mẫu, và mở đúng cửa chung', () => {
    expect(phaseRowTools).not.toContain('+ Chặng từ mẫu')
    expect(phaseRowTools).not.toContain('+ Mốc từ mẫu')
    expect(phaseRowTools).toContain('+ Thêm từ mẫu')
    expect(phaseRowTools).toContain('onOpenPresetBoard')
    // Khay chip mẫu mức sống từng mở ngay dưới hàng này — nay là nhóm đầu của cửa mẫu.
    expect(phaseRowTools).not.toContain('PHASE_PRESETS')
    expect(tuongLaiPage).toContain('onOpenPresetBoard={() => plotRef.current?.openPresetBoard()}')
    expect(tuongLaiPage).not.toContain('onOpenMilestoneBoard')
  })

  it('cửa mẫu chở CẢ hai bộ, và mẫu mốc chia theo `group`', () => {
    expect(quickAddBoard).toContain('PHASE_PRESETS.map(')
    expect(quickAddBoard).toContain("LIFE_PRESETS.filter((p) => p.group === 'living')")
    expect(quickAddBoard).toContain("LIFE_PRESETS.filter((p) => p.group === 'event')")
    // KHÔNG còn `LIFE_PRESETS.map(` trần: một danh sách không chia nhóm là quay lại đúng
    // bản cũ, và nó sẽ vẽ 'nghi-huu' hai lần (một lần trong nhóm mức sống, một lần ở đây).
    expect(quickAddBoard).not.toContain('LIFE_PRESETS.map(')
  })

  it('mẫu mức sống nhận NĂM của cửa mẫu, và vẫn qua phép dò năm trống', () => {
    expect(quickAddBoard).toContain('onAdd={onAddPhasePreset}')
    expect(quickAddBoard).toContain('year={span.startYear}')
    expect(tuongLaiPage).toContain('onAddPhasePreset={addPhaseFromPreset}')
    // `unique (scenario_id, start_year)` (migration 0031) nổ ở Postgres, xa chỗ bấm.
    const i = tuongLaiPage.indexOf('const addPhaseFromPreset = useCallback(')
    expect(i).toBeGreaterThan(-1)
    const than = tuongLaiPage.slice(i, tuongLaiPage.indexOf('[working, currentYear', i))
    expect(than).toContain('freePhaseStartYear(working.phases, year, currentYear, lastYear)')
  })
})

describe('nhãn ⊕ — suy từ build(), không khai tay', () => {
  it('chỗ vẽ đọc chính `result`, và `presets.ts` không chứa câu nhãn', () => {
    expect(quickAddBoard).toContain('result.phases.length > 0')
    expect(quickAddBoard).toContain('result.events.length === 1')
    // Khai tay ở `presets.ts` là bản chép thứ hai: nó sẽ nói sai đúng vào lần `build()` đổi
    // mà không ai nhớ tới nhãn.
    expect(presets).not.toContain('đổi luôn mức sống')
    expect(presets).not.toContain('kèm các khoản riêng')
  })
})

describe('chú giải đồ thị — hai LỚP TÔ, phân biệt bằng HÌNH', () => {
  it('có dấu `band` và dấu `pin`, và chúng không phân biệt bằng màu', () => {
    expect(tuongLaiPage).toContain('mark="band"')
    expect(tuongLaiPage).toContain('mark="pin"')
    // Cả hai lớp lấy màu từ cùng bảng bảy màu (`planColors.ts`), nên một dấu chú giải tô
    // bằng một màu cụ thể sẽ nói sai: nó phải nói HÌNH.
    expect(tuongLaiPage).toContain('<LegendItem color="var(--fg-muted)" mark="band">')
    expect(tuongLaiPage).toContain('<LegendItem color="var(--fg-muted)" mark="pin">')
  })
})
