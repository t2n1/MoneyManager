// Bản nháp của một kịch bản Tương lai — THUẦN, không React, không đồng hồ, không repo.
//
// VÌ SAO CÓ FILE NÀY. Trước đây thứ "vặn thử" duy nhất là `assumptions.ts`: một lớp đè
// ba con số (thu, chi, lợi suất). Bản vẽ mới mở rộng phạm vi vặn ra CẢ kịch bản — kéo
// mốc trên đồ thị sang năm khác, sửa số tiền của mốc, xoá mốc, thêm mốc từ thư viện
// mẫu, dời tuổi nghỉ hưu, đổi tuổi chiếu tới. Ba con số không mang nổi những thứ đó.
//
// Cùng lúc, luật "chỉ ghi khi bấm Lưu" phải giữ nguyên và còn quan trọng hơn: vặn thử
// giờ có thể XOÁ một mốc, và một cú vặn thử mà lỡ tay ghi thẳng vào dữ liệu là mất số
// người dùng đã nhập.
//
// Cách làm: giữ TRỌN một bản sao kịch bản trong bộ nhớ, chiếu từ bản sao đó, và chỉ khi
// bấm Lưu mới quy bản sao thành một danh sách lệnh ghi. Việc quy đó (`planDraftSave`) là
// hàm thuần có test — không phải một chuỗi `await repo.…` rải trong tay xử lý sự kiện,
// nơi mà ca "sự kiện bị xoá" hay "sự kiện vừa thêm chưa có id" không có gì canh.
//
// KHÔNG thay `assumptions.ts`: file đó vẫn là đường vặn nhanh ba con số và có phép thử
// hiệu năng riêng (cổng R6). File này là tầng trên nó.
import type {
  LifeEventPatch,
  LifePhasePatch,
  LifeScenarioPatch,
  NewLifeEvent,
  NewLifePhase,
} from '../../data/repo'
import type { CurrencyCode } from '../../lib/currencies'
import type { LifeEventRow, LifePhaseRow, LifeScenarioRow } from '../../types/database.types'
import type { PresetResult } from './presets'
import type { LifetimeEvent, LifetimeInput, LifetimePhase } from './project'

/**
 * Tiền tố id của mốc VỪA THÊM trong nháp, chưa có dòng nào dưới DB.
 *
 * Dùng tiền tố thay vì một cờ `isNew` riêng vì id của mốc còn phải chạy khắp nơi làm
 * khoá React, khoá kéo-thả và khoá "đang sửa mốc nào" — mang theo một cờ song song là
 * mở ra ca hai thứ lệch nhau. Tiền tố thì bất kỳ chỗ nào cầm id cũng tự trả lời được.
 *
 * `crypto.randomUUID()` của DB không bao giờ sinh ra chuỗi bắt đầu bằng "nhap:", nên
 * không có va chạm.
 */
export const NEW_ID_PREFIX = 'nhap:'

export function isNewId(id: string): boolean {
  return id.startsWith(NEW_ID_PREFIX)
}

/** Chặng trong nháp = chặng của engine + id dòng DB (để biết ghi vào đâu). */
export interface DraftPhase extends LifetimePhase {
  id: string
}

/** Mốc trong nháp. `id` bắt đầu bằng `NEW_ID_PREFIX` nghĩa là chưa có dòng DB. */
export interface DraftEvent extends LifetimeEvent {
  /** Ghi chú của dòng DB — nháp không sửa nó nhưng phải mang theo để không ghi đè mất. */
  note: string
}

/**
 * Trọn một kịch bản, dạng vặn được.
 *
 * Cố ý KHÔNG mang `name`, `displayCurrency`, `startingAssetsMinor`, `isPrimary`: màn
 * Tương lai không vặn được bốn thứ đó (chúng thuộc trình sửa kịch bản), nên để chúng
 * ở đây là mở đường cho một lệnh ghi ngoài ý muốn — `planDraftSave` sẽ so chúng với
 * bản đã lưu và một lỗi sao chép sẽ đổi tên kịch bản của người dùng.
 */
export interface ScenarioDraft {
  scenarioId: string
  endAge: number
  realReturnBps: number
  phases: DraftPhase[]
  events: DraftEvent[]
}

/** Bản nháp khởi đầu = ảnh chụp đúng dữ liệu đã lưu. */
export function draftFromRows(
  scenario: LifeScenarioRow,
  phaseRows: LifePhaseRow[],
  eventRows: LifeEventRow[],
): ScenarioDraft {
  return {
    scenarioId: scenario.id,
    endAge: scenario.end_age,
    realReturnBps: scenario.real_return_bps,
    phases: phaseRows
      .filter((p) => p.scenario_id === scenario.id)
      .map((p) => ({
        id: p.id,
        startYear: p.start_year,
        label: p.label,
        country: p.country,
        currency: p.currency as CurrencyCode,
        annualIncomeMinor: p.annual_income_minor,
        annualExpenseMinor: p.annual_expense_minor,
        fxToDisplay: p.fx_to_display,
      }))
      .sort((a, b) => a.startYear - b.startYear),
    events: eventRows
      .filter((e) => e.scenario_id === scenario.id)
      .map((e) => ({
        id: e.id,
        startYear: e.start_year,
        endYear: e.end_year,
        kind: e.kind,
        amountMinor: e.amount_minor,
        currency: e.currency as CurrencyCode,
        label: e.label,
        note: e.note,
        fxToDisplay: e.fx_to_display,
        inflate: e.inflate,
      }))
      .sort((a, b) => a.startYear - b.startYear),
  }
}

/**
 * `LifetimeInput` để chiếu bản nháp: lấy phần khung từ `base` (năm hiện tại, năm sinh,
 * tiền hiển thị, tài sản khởi điểm, lạm phát…) và ĐÈ đúng những gì nháp vặn được.
 *
 * Lấy khung từ `base` chứ không dựng lại từ `LifeScenarioRow`: `buildInputFor` trong
 * `useLifetime.ts` là chỗ DUY NHẤT biết ráp input (nó đọc năm hiện tại, lạm phát của
 * hồ sơ…), và dựng bản thứ hai ở đây là đúng thứ JSDoc của nó cảnh báo.
 */
export function draftToInput(base: LifetimeInput, draft: ScenarioDraft): LifetimeInput {
  return {
    ...base,
    endAge: draft.endAge,
    realReturnBps: draft.realReturnBps,
    phases: draft.phases.map(
      (p): LifetimePhase => ({
        startYear: p.startYear,
        label: p.label,
        country: p.country,
        currency: p.currency,
        annualIncomeMinor: p.annualIncomeMinor,
        annualExpenseMinor: p.annualExpenseMinor,
        fxToDisplay: p.fxToDisplay,
      }),
    ),
    events: draft.events.map(
      (e): LifetimeEvent => ({
        id: e.id,
        startYear: e.startYear,
        endYear: e.endYear,
        kind: e.kind,
        amountMinor: e.amountMinor,
        currency: e.currency,
        label: e.label,
        fxToDisplay: e.fxToDisplay,
        inflate: e.inflate,
      }),
    ),
  }
}

/** Chỉ số chặng ĐANG HIỆU LỰC trong `draft.phases` (đã sắp tăng). -1 khi không có. */
export function draftPhaseIndex(draft: ScenarioDraft, currentYear: number): number {
  let best = -1
  for (let i = 0; i < draft.phases.length; i++) {
    if (draft.phases[i].startYear <= currentYear) best = i
  }
  // Mọi chặng còn ở tương lai thì lấy chặng sớm nhất — cùng luật với `currentPhaseIndex`
  // (assumptions.ts): bản chiếu vẫn phải dựa trên một chặng nào đó.
  if (best === -1 && draft.phases.length > 0) return 0
  return best
}

// --- Tóm tắt "đang đổi gì" -----------------------------------------------------------

/**
 * Một thay đổi so với bản đã lưu, dạng DỮ LIỆU.
 *
 * Không trả về chuỗi đã ghép: số tiền phải đi qua `formatMoney` (biết đơn vị và bậc
 * thập phân của từng loại tiền) mà file thuần này không được biết tới, và câu trên màn
 * còn tô màu theo chiều tăng/giảm. Cùng lý do đã ghi ở `LifetimeVerdict` (summary.ts).
 */
export type DraftChange =
  | { kind: 'income'; currency: CurrencyCode; fromMinor: number; toMinor: number }
  | { kind: 'expense'; currency: CurrencyCode; fromMinor: number; toMinor: number }
  | { kind: 'return'; fromBps: number; toBps: number }
  | { kind: 'endAge'; from: number; to: number }
  | { kind: 'phaseYear'; label: string; from: number; to: number }
  | { kind: 'phasesAdded'; count: number }
  | { kind: 'eventsAdded'; count: number }
  | { kind: 'eventsRemoved'; count: number }
  | { kind: 'eventsEdited'; count: number }

/**
 * Liệt kê những gì nháp đang đổi so với bản đã lưu.
 *
 * Thu/chi chỉ soi chặng ĐANG HIỆU LỰC (`currentYear`) — đúng chặng mà hai thanh trượt
 * vặn. Chặng khác đổi thu/chi thì không có đường nào trên màn này làm được, nên soi cả
 * chúng chỉ là thêm nhánh chết.
 */
export function draftChanges(
  saved: ScenarioDraft,
  draft: ScenarioDraft,
  currentYear: number,
): DraftChange[] {
  const out: DraftChange[] = []

  const i = draftPhaseIndex(draft, currentYear)
  const sp = saved.phases.find((p) => p.id === draft.phases[i]?.id)
  const dp = draft.phases[i]
  if (sp && dp) {
    if (sp.annualIncomeMinor !== dp.annualIncomeMinor) {
      out.push({
        kind: 'income',
        currency: dp.currency,
        fromMinor: sp.annualIncomeMinor,
        toMinor: dp.annualIncomeMinor,
      })
    }
    if (sp.annualExpenseMinor !== dp.annualExpenseMinor) {
      out.push({
        kind: 'expense',
        currency: dp.currency,
        fromMinor: sp.annualExpenseMinor,
        toMinor: dp.annualExpenseMinor,
      })
    }
  }

  if (saved.realReturnBps !== draft.realReturnBps) {
    out.push({ kind: 'return', fromBps: saved.realReturnBps, toBps: draft.realReturnBps })
  }
  if (saved.endAge !== draft.endAge) {
    out.push({ kind: 'endAge', from: saved.endAge, to: draft.endAge })
  }

  for (const d of draft.phases) {
    const s = saved.phases.find((p) => p.id === d.id)
    if (s && s.startYear !== d.startYear) {
      out.push({ kind: 'phaseYear', label: d.label, from: s.startYear, to: d.startYear })
    }
  }

  const phasesAdded = draft.phases.filter((p) => isNewId(p.id)).length
  if (phasesAdded > 0) out.push({ kind: 'phasesAdded', count: phasesAdded })

  const savedIds = new Set(saved.events.map((e) => e.id))
  const draftIds = new Set(draft.events.map((e) => e.id))
  const added = draft.events.filter((e) => !savedIds.has(e.id)).length
  const removed = saved.events.filter((e) => !draftIds.has(e.id)).length
  const edited = draft.events.filter((d) => {
    const s = saved.events.find((e) => e.id === d.id)
    return s !== undefined && !sameEvent(s, d)
  }).length
  if (added > 0) out.push({ kind: 'eventsAdded', count: added })
  if (removed > 0) out.push({ kind: 'eventsRemoved', count: removed })
  if (edited > 0) out.push({ kind: 'eventsEdited', count: edited })

  return out
}

function sameEvent(a: DraftEvent, b: DraftEvent): boolean {
  return (
    a.startYear === b.startYear &&
    a.endYear === b.endYear &&
    a.kind === b.kind &&
    a.amountMinor === b.amountMinor &&
    a.currency === b.currency &&
    a.label === b.label &&
    a.fxToDisplay === b.fxToDisplay &&
    a.inflate === b.inflate
  )
}

/** Nháp có khác bản đã lưu không. */
export function draftIsDirty(
  saved: ScenarioDraft,
  draft: ScenarioDraft,
  currentYear: number,
): boolean {
  return draftChanges(saved, draft, currentYear).length > 0
}

// --- Quy nháp thành lệnh ghi ---------------------------------------------------------

/**
 * Danh sách lệnh ghi để đưa DB về đúng bản nháp. Rỗng hết = không có gì để ghi.
 *
 * Từng lệnh chỉ mang ĐÚNG những cột đổi (patch thưa), không ghi đè cả dòng: hai tab
 * khác nhau có thể đang sửa cùng một kịch bản, và ghi đè cả dòng thì tab này xoá mất
 * cột mà tab kia vừa đổi. Đây cũng là lý do `DraftEvent` phải mang theo `note` dù màn
 * này không sửa nó.
 */
export interface DraftSavePlan {
  scenarioPatch: LifeScenarioPatch | null
  phasePatches: { id: string; patch: LifePhasePatch }[]
  phaseInserts: NewLifePhase[]
  eventPatches: { id: string; patch: LifeEventPatch }[]
  eventInserts: NewLifeEvent[]
  eventDeletes: string[]
}

export function planDraftSave(saved: ScenarioDraft, draft: ScenarioDraft): DraftSavePlan {
  const scenarioPatch: LifeScenarioPatch = {}
  if (saved.endAge !== draft.endAge) scenarioPatch.end_age = draft.endAge
  if (saved.realReturnBps !== draft.realReturnBps) {
    scenarioPatch.real_return_bps = draft.realReturnBps
  }

  const phasePatches: { id: string; patch: LifePhasePatch }[] = []
  const phaseInserts: NewLifePhase[] = []
  for (const d of draft.phases) {
    if (isNewId(d.id)) {
      phaseInserts.push({
        scenario_id: draft.scenarioId,
        start_year: d.startYear,
        label: d.label,
        country: d.country,
        currency: d.currency,
        annual_income_minor: d.annualIncomeMinor,
        annual_expense_minor: d.annualExpenseMinor,
        fx_to_display: d.fxToDisplay,
      })
      continue
    }
    const s = saved.phases.find((p) => p.id === d.id)
    // Chặng có id thật mà không có trong bản đã lưu = dòng vừa bị xoá ở tab khác. Bỏ
    // qua thay vì ghi: một PATCH vào id không còn tồn tại chỉ là một lỗi mạng khó hiểu.
    if (!s) continue
    const patch: LifePhasePatch = {}
    if (s.startYear !== d.startYear) patch.start_year = d.startYear
    if (s.annualIncomeMinor !== d.annualIncomeMinor) patch.annual_income_minor = d.annualIncomeMinor
    if (s.annualExpenseMinor !== d.annualExpenseMinor) {
      patch.annual_expense_minor = d.annualExpenseMinor
    }
    if (Object.keys(patch).length > 0) phasePatches.push({ id: d.id, patch })
  }

  const eventPatches: { id: string; patch: LifeEventPatch }[] = []
  const eventInserts: NewLifeEvent[] = []
  for (const d of draft.events) {
    if (isNewId(d.id)) {
      eventInserts.push({
        scenario_id: draft.scenarioId,
        start_year: d.startYear,
        end_year: d.endYear,
        kind: d.kind,
        amount_minor: d.amountMinor,
        currency: d.currency,
        label: d.label,
        note: d.note,
        fx_to_display: d.fxToDisplay,
        inflate: d.inflate,
      })
      continue
    }
    const s = saved.events.find((e) => e.id === d.id)
    if (!s || sameEvent(s, d)) continue
    const patch: LifeEventPatch = {}
    if (s.startYear !== d.startYear) patch.start_year = d.startYear
    if (s.endYear !== d.endYear) patch.end_year = d.endYear
    if (s.kind !== d.kind) patch.kind = d.kind
    if (s.amountMinor !== d.amountMinor) patch.amount_minor = d.amountMinor
    if (s.currency !== d.currency) patch.currency = d.currency
    if (s.label !== d.label) patch.label = d.label
    if (s.fxToDisplay !== d.fxToDisplay) patch.fx_to_display = d.fxToDisplay
    if (s.inflate !== d.inflate) patch.inflate = d.inflate
    eventPatches.push({ id: d.id, patch })
  }

  const draftIds = new Set(draft.events.map((e) => e.id))
  // Chỉ xoá dòng CÓ THẬT dưới DB: một mốc vừa thêm rồi xoá ngay trong cùng phiên nháp
  // chưa từng được ghi, gửi lệnh xoá cho nó là gửi một id không tồn tại.
  const eventDeletes = saved.events
    .filter((e) => !draftIds.has(e.id) && !isNewId(e.id))
    .map((e) => e.id)

  return {
    scenarioPatch: Object.keys(scenarioPatch).length > 0 ? scenarioPatch : null,
    phasePatches,
    phaseInserts,
    eventPatches,
    eventInserts,
    eventDeletes,
  }
}

export function savePlanIsEmpty(plan: DraftSavePlan): boolean {
  return (
    plan.scenarioPatch === null &&
    plan.phasePatches.length === 0 &&
    plan.phaseInserts.length === 0 &&
    plan.eventPatches.length === 0 &&
    plan.eventInserts.length === 0 &&
    plan.eventDeletes.length === 0
  )
}

/**
 * Thêm một mẫu (`LIFE_PRESETS`) vào bản nháp.
 *
 * Dùng CHÍNH `presets.ts` chứ không dựng một danh sách mẫu thứ hai cho màn này: các con
 * số trong đó (児童手当 sau cải cách 10/2024, chi phí nuôi con theo bậc, tiền cưới…) đều
 * có nguồn tra cứu ghi kèm và có phép thử. Một bảng mẫu thứ hai "cho gọn" sẽ trôi lệch
 * khỏi bảng thứ nhất, và người dùng thêm "Sinh con" từ hai chỗ khác nhau sẽ nhận hai
 * con số khác nhau mà không có gì nói ra.
 *
 * `seed` phải KHÁC NHAU giữa hai lần gọi liên tiếp — id sinh ra từ nó, và hai mốc trùng
 * id thì React dựng nhầm và `planDraftSave` ghi nhầm. Chỗ gọi giữ một bộ đếm tăng dần.
 */
export function applyPreset(
  draft: ScenarioDraft,
  result: PresetResult,
  seed: number,
): ScenarioDraft {
  return {
    ...draft,
    phases: [
      ...draft.phases,
      ...result.phases.map(
        (p, i): DraftPhase => ({
          id: `${NEW_ID_PREFIX}p${seed}-${i}`,
          startYear: p.start_year,
          label: p.label,
          country: p.country,
          currency: p.currency as CurrencyCode,
          annualIncomeMinor: p.annual_income_minor,
          annualExpenseMinor: p.annual_expense_minor,
          fxToDisplay: p.fx_to_display,
        }),
      ),
    ].sort((a, b) => a.startYear - b.startYear),
    events: [
      ...draft.events,
      ...result.events.map(
        (e, i): DraftEvent => ({
          id: `${NEW_ID_PREFIX}e${seed}-${i}`,
          startYear: e.start_year,
          endYear: e.end_year,
          kind: e.kind,
          amountMinor: e.amount_minor,
          currency: e.currency as CurrencyCode,
          label: e.label,
          note: e.note,
          fxToDisplay: e.fx_to_display,
          inflate: e.inflate,
        }),
      ),
    ].sort((a, b) => a.startYear - b.startYear),
  }
}

/** Bỏ một mốc khỏi nháp. */
export function removeDraftEvent(draft: ScenarioDraft, id: string): ScenarioDraft {
  return { ...draft, events: draft.events.filter((e) => e.id !== id) }
}

/** Sửa một mốc trong nháp. Mốc không còn thì trả về chính `draft`. */
export function patchDraftEvent(
  draft: ScenarioDraft,
  id: string,
  patch: Partial<Omit<DraftEvent, 'id'>>,
): ScenarioDraft {
  if (!draft.events.some((e) => e.id === id)) return draft
  return {
    ...draft,
    events: draft.events.map((e) => (e.id === id ? { ...e, ...patch } : e)),
  }
}

/**
 * Toàn bộ chặng + mốc của bản nháp, dạng lệnh THÊM dưới một kịch bản khác.
 *
 * Dùng cho "Lưu thành kịch bản mới": ở đó không có dòng nào để sửa cả, mọi thứ đều là
 * dòng mới — nên KHÔNG đi qua `planDraftSave` (nó so nháp với bản đã lưu để ra patch) mà
 * đổ thẳng cả bản nháp thành insert. Nhờ vậy cũng không phải ánh xạ id cũ sang id mới,
 * chỗ mà một phép chép kịch bản dễ sai nhất.
 */
export function draftRowsFor(
  draft: ScenarioDraft,
  scenarioId: string,
): { phases: NewLifePhase[]; events: NewLifeEvent[] } {
  return {
    phases: draft.phases.map((p) => ({
      scenario_id: scenarioId,
      start_year: p.startYear,
      label: p.label,
      country: p.country,
      currency: p.currency,
      annual_income_minor: p.annualIncomeMinor,
      annual_expense_minor: p.annualExpenseMinor,
      fx_to_display: p.fxToDisplay,
    })),
    events: draft.events.map((e) => ({
      scenario_id: scenarioId,
      start_year: e.startYear,
      end_year: e.endYear,
      kind: e.kind,
      amount_minor: e.amountMinor,
      currency: e.currency,
      label: e.label,
      note: e.note,
      fx_to_display: e.fxToDisplay,
      inflate: e.inflate,
    })),
  }
}
