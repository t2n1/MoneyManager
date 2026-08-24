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
 * PHẠM VI MỞ RỘNG (bản vẽ "Sửa kịch bản" 2026-08-24). Trước đây bốn trường `name`,
 * `displayCurrency`, `startingAssetsMinor`, `bandSpreadBps` CỐ Ý nằm ngoài đây, vì lúc
 * ấy nháp chỉ phục vụ mấy thanh trượt của trang Tương lai — chỗ không có ô nào sửa
 * chúng — nên mang chúng theo chỉ mở đường cho một lệnh ghi ngoài ý muốn.
 *
 * Trình sửa kịch bản nay ghi vào CHÍNH bản nháp này, và nó sửa cả bốn. Để chúng ngoài
 * nháp lúc này thì tệ hơn hẳn: trình sửa sẽ phải ghi thẳng xuống DB cho bốn trường đó
 * trong khi mọi thứ khác còn treo ở nháp — tức nút "Bỏ thay đổi" hoàn tác được một
 * nửa, và bản chiếu trên đồ thị đọc tài sản khởi điểm CŨ trong khi ô đã hiện số mới.
 *
 * `isPrimary` thì VẪN đứng ngoài: nó không phải một giá trị người dùng vặn thử, nó là
 * quyết định về CẢ TẬP kịch bản (đặt cờ ở đây phải bỏ cờ ở các kịch bản khác), nên nó
 * đi đường riêng, ghi ngay, giống Nhân bản và Xóa trong menu "⋮".
 */
export interface ScenarioDraft {
  scenarioId: string
  name: string
  /** Tiền HIỂN THỊ của kịch bản. Đổi nó kéo theo `setDraftCurrency` (xem hàm đó). */
  displayCurrency: CurrencyCode
  /** Theo `displayCurrency`. Âm = nợ ròng. */
  startingAssetsMinor: number
  endAge: number
  realReturnBps: number
  bandSpreadBps: number
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
    name: scenario.name,
    displayCurrency: scenario.display_currency as CurrencyCode,
    startingAssetsMinor: scenario.starting_assets_minor,
    endAge: scenario.end_age,
    realReturnBps: scenario.real_return_bps,
    bandSpreadBps: scenario.band_spread_bps,
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
    displayCurrency: draft.displayCurrency,
    startingAssetsMinor: draft.startingAssetsMinor,
    endAge: draft.endAge,
    realReturnBps: draft.realReturnBps,
    bandSpreadBps: draft.bandSpreadBps,
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
  | { kind: 'name'; from: string; to: string }
  | { kind: 'currency'; from: CurrencyCode; to: CurrencyCode }
  | {
      kind: 'startingAssets'
      /** Đơn vị của `fromMinor` và của `toMinor` — KHÁC nhau được. Cột
       *  `starting_assets_minor` lưu theo `display_currency`, nên một bản nháp vừa đổi
       *  tiền hiển thị có hai đầu tính bằng hai đồng tiền; in cả hai bằng một đơn vị là
       *  câu "17k → 11k" trong khi thật ra không có gì giảm. */
      fromCurrency: CurrencyCode
      fromMinor: number
      toCurrency: CurrencyCode
      toMinor: number
    }
  | { kind: 'income'; label: string; currency: CurrencyCode; fromMinor: number; toMinor: number }
  | { kind: 'expense'; label: string; currency: CurrencyCode; fromMinor: number; toMinor: number }
  | { kind: 'return'; fromBps: number; toBps: number }
  | { kind: 'bandSpread'; fromBps: number; toBps: number }
  | { kind: 'endAge'; from: number; to: number }
  | { kind: 'phaseYear'; label: string; from: number; to: number }
  | { kind: 'phaseLabel'; from: string; to: string }
  | { kind: 'phaseCurrency'; label: string; from: CurrencyCode; to: CurrencyCode }
  | { kind: 'phaseFx'; label: string; from: number; to: number }
  | { kind: 'phaseCountry'; label: string; to: string | null }
  | { kind: 'phasesAdded'; count: number }
  | { kind: 'phasesRemoved'; count: number }
  | { kind: 'eventsAdded'; count: number }
  | { kind: 'eventsRemoved'; count: number }
  | { kind: 'eventsEdited'; count: number }

/**
 * Liệt kê những gì nháp đang đổi so với bản đã lưu.
 *
 * Thu/chi soi MỌI chặng, không riêng chặng đang hiệu lực. Bản trước chỉ soi chặng
 * `currentYear` vì lúc đó đường vặn duy nhất là hai thanh trượt của panel Giả định,
 * vốn chỉ chạm được chặng ấy. Trình sửa kịch bản nay có ô thu/chi cho TỪNG chặng —
 * giữ nguyên phạm vi cũ nghĩa là sửa thu của chặng hưu xong mà thanh nháp báo "chưa
 * có gì thay đổi", rồi `draftIsDirty` trả false và nút Lưu tắt ngóm trên một thay đổi
 * có thật.
 *
 * `currentYear` vì thế cũng rời khỏi chữ ký — không còn nhánh nào cần biết "hôm nay".
 */
export function draftChanges(saved: ScenarioDraft, draft: ScenarioDraft): DraftChange[] {
  const out: DraftChange[] = []

  if (saved.name !== draft.name) {
    out.push({ kind: 'name', from: saved.name, to: draft.name })
  }
  if (saved.displayCurrency !== draft.displayCurrency) {
    out.push({ kind: 'currency', from: saved.displayCurrency, to: draft.displayCurrency })
  }
  if (saved.startingAssetsMinor !== draft.startingAssetsMinor) {
    out.push({
      kind: 'startingAssets',
      fromCurrency: saved.displayCurrency,
      fromMinor: saved.startingAssetsMinor,
      toCurrency: draft.displayCurrency,
      toMinor: draft.startingAssetsMinor,
    })
  }

  for (const dp of draft.phases) {
    const sp = saved.phases.find((p) => p.id === dp.id)
    if (!sp) continue
    if (sp.annualIncomeMinor !== dp.annualIncomeMinor) {
      out.push({
        kind: 'income',
        label: dp.label,
        currency: dp.currency,
        fromMinor: sp.annualIncomeMinor,
        toMinor: dp.annualIncomeMinor,
      })
    }
    if (sp.annualExpenseMinor !== dp.annualExpenseMinor) {
      out.push({
        kind: 'expense',
        label: dp.label,
        currency: dp.currency,
        fromMinor: sp.annualExpenseMinor,
        toMinor: dp.annualExpenseMinor,
      })
    }
  }

  if (saved.realReturnBps !== draft.realReturnBps) {
    out.push({ kind: 'return', fromBps: saved.realReturnBps, toBps: draft.realReturnBps })
  }
  if (saved.bandSpreadBps !== draft.bandSpreadBps) {
    out.push({ kind: 'bandSpread', fromBps: saved.bandSpreadBps, toBps: draft.bandSpreadBps })
  }
  if (saved.endAge !== draft.endAge) {
    out.push({ kind: 'endAge', from: saved.endAge, to: draft.endAge })
  }

  for (const d of draft.phases) {
    const s = saved.phases.find((p) => p.id === d.id)
    if (!s) continue
    if (s.startYear !== d.startYear) {
      out.push({ kind: 'phaseYear', label: d.label, from: s.startYear, to: d.startYear })
    }
    if (s.label !== d.label) {
      out.push({ kind: 'phaseLabel', from: s.label, to: d.label })
    }
    // Ba trường của sheet "⋯". PHẢI có ở đây, không phải cho đẹp câu tóm tắt: `dirty`
    // suy ra từ CHÍNH danh sách này, nên thiếu chúng thì đổi tiền của một chặng xong
    // mà nút "Lưu thay đổi" vẫn tắt — thay đổi đã nằm trong nháp, đã đổi cả bản chiếu,
    // mà không có đường nào ghi xuống. Bắt được khi chạy app thật, 2026-08-24.
    if (s.currency !== d.currency) {
      out.push({ kind: 'phaseCurrency', label: d.label, from: s.currency, to: d.currency })
    }
    if (s.fxToDisplay !== d.fxToDisplay) {
      out.push({ kind: 'phaseFx', label: d.label, from: s.fxToDisplay, to: d.fxToDisplay })
    }
    if (s.country !== d.country) {
      out.push({ kind: 'phaseCountry', label: d.label, to: d.country })
    }
  }

  const phasesAdded = draft.phases.filter((p) => isNewId(p.id)).length
  if (phasesAdded > 0) out.push({ kind: 'phasesAdded', count: phasesAdded })
  const draftPhaseIds = new Set(draft.phases.map((p) => p.id))
  const phasesRemoved = saved.phases.filter((p) => !draftPhaseIds.has(p.id)).length
  if (phasesRemoved > 0) out.push({ kind: 'phasesRemoved', count: phasesRemoved })

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

/**
 * `note` NẰM TRONG phép so, dù màn Tương lai không sửa nó: sheet "⋯" của một mốc có ô
 * Ghi chú, và `dirty` suy ra từ `draftChanges` — bỏ `note` ra ngoài thì sửa riêng ghi
 * chú xong nút Lưu vẫn tắt. Cùng lớp lỗi với ba trường chi tiết của chặng ở trên.
 */
function sameEvent(a: DraftEvent, b: DraftEvent): boolean {
  return (
    a.startYear === b.startYear &&
    a.endYear === b.endYear &&
    a.kind === b.kind &&
    a.amountMinor === b.amountMinor &&
    a.currency === b.currency &&
    a.label === b.label &&
    a.note === b.note &&
    a.fxToDisplay === b.fxToDisplay &&
    a.inflate === b.inflate
  )
}

/** Nháp có khác bản đã lưu không. */
export function draftIsDirty(saved: ScenarioDraft, draft: ScenarioDraft): boolean {
  return draftChanges(saved, draft).length > 0
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
  phaseDeletes: string[]
  eventPatches: { id: string; patch: LifeEventPatch }[]
  eventInserts: NewLifeEvent[]
  eventDeletes: string[]
}

export function planDraftSave(saved: ScenarioDraft, draft: ScenarioDraft): DraftSavePlan {
  const scenarioPatch: LifeScenarioPatch = {}
  if (saved.name !== draft.name) scenarioPatch.name = draft.name
  if (saved.displayCurrency !== draft.displayCurrency) {
    scenarioPatch.display_currency = draft.displayCurrency
  }
  // `starting_assets_minor` lưu THEO `display_currency`. Chỗ đổi tiền hiển thị
  // (`setDraftCurrency` + phép quy đổi ở trình sửa) có trách nhiệm đưa con số này sang
  // đơn vị mới TRƯỚC khi tới đây — ghi một con số còn tính theo tiền cũ là biến
  // ¥11.000.000 thành $110.000 (sai ~150 lần) đúng ở điểm khởi đầu bản chiếu.
  if (saved.startingAssetsMinor !== draft.startingAssetsMinor) {
    scenarioPatch.starting_assets_minor = draft.startingAssetsMinor
  }
  if (saved.endAge !== draft.endAge) scenarioPatch.end_age = draft.endAge
  if (saved.realReturnBps !== draft.realReturnBps) {
    scenarioPatch.real_return_bps = draft.realReturnBps
  }
  if (saved.bandSpreadBps !== draft.bandSpreadBps) {
    scenarioPatch.band_spread_bps = draft.bandSpreadBps
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
    if (s.label !== d.label) patch.label = d.label
    if (s.country !== d.country) patch.country = d.country
    if (s.currency !== d.currency) patch.currency = d.currency
    if (s.fxToDisplay !== d.fxToDisplay) patch.fx_to_display = d.fxToDisplay
    if (s.annualIncomeMinor !== d.annualIncomeMinor) patch.annual_income_minor = d.annualIncomeMinor
    if (s.annualExpenseMinor !== d.annualExpenseMinor) {
      patch.annual_expense_minor = d.annualExpenseMinor
    }
    if (Object.keys(patch).length > 0) phasePatches.push({ id: d.id, patch })
  }

  // Chặng bị xoá trong nháp. Cùng luật với `eventDeletes` bên dưới: chỉ xoá dòng CÓ
  // THẬT dưới DB — một chặng vừa thêm rồi xoá ngay trong cùng phiên nháp chưa từng
  // được ghi, gửi lệnh xoá cho nó là gửi một id không tồn tại.
  const draftPhaseIds = new Set(draft.phases.map((p) => p.id))
  const phaseDeletes = saved.phases
    .filter((p) => !draftPhaseIds.has(p.id) && !isNewId(p.id))
    .map((p) => p.id)

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
    if (s.note !== d.note) patch.note = d.note
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
    phaseDeletes,
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
    plan.phaseDeletes.length === 0 &&
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

/**
 * Đổi TIỀN HIỂN THỊ của bản nháp — và đặt lại tỷ giá giả định của mọi dòng không còn
 * khớp nó.
 *
 * RESET chứ không chỉ cảnh báo (quyết định đã chốt từ bản trình sửa cũ): `fx_to_display`
 * là "1 đơn vị tiền của dòng này quy ra bao nhiêu đơn vị tiền HIỂN THỊ". Đổi tiền hiển
 * thị thì con số cũ — dù người dùng từng khai đúng — đang trả lời một câu hỏi khác hẳn.
 * Để nguyên là giữ lại một con số sai mà không có gì nói ra; đặt về 1 thì `fx === 1` bật
 * đúng dấu cảnh báo mà `PhaseFormSheet`/`EventFormSheet` đã có sẵn.
 *
 * KHÔNG đụng `startingAssetsMinor`: quy đổi nó cần tỷ giá HÔM NAY (mạng), mà file này
 * thuần. Chỗ gọi (trình sửa) quy đổi rồi mới đặt vào nháp — xem JSDoc `startingAssetsMinor`
 * ở `planDraftSave`.
 */
export function setDraftCurrency(draft: ScenarioDraft, next: CurrencyCode): ScenarioDraft {
  if (draft.displayCurrency === next) return draft
  return {
    ...draft,
    displayCurrency: next,
    phases: draft.phases.map((p) => (p.currency === next ? p : { ...p, fxToDisplay: 1 })),
    events: draft.events.map((e) => (e.currency === next ? e : { ...e, fxToDisplay: 1 })),
  }
}

/** Sửa một chặng trong nháp. Chặng không còn thì trả về chính `draft`. */
export function patchDraftPhase(
  draft: ScenarioDraft,
  id: string,
  patch: Partial<Omit<DraftPhase, 'id'>>,
): ScenarioDraft {
  if (!draft.phases.some((p) => p.id === id)) return draft
  return {
    ...draft,
    // Sắp lại NGAY sau khi sửa: `startYear` quyết định thứ tự chặng ở mọi chỗ đọc nháp
    // (`draftPhaseIndex`, dải tỉ lệ, engine chiếu). Để lệch thứ tự tới lúc render thì
    // mỗi chỗ đọc lại phải tự sắp, và chỗ nào quên là chỗ đó tính sai chặng đang chạy.
    phases: draft.phases
      .map((p) => (p.id === id ? { ...p, ...patch } : p))
      .sort((a, b) => a.startYear - b.startYear),
  }
}

/** Bỏ một chặng khỏi nháp. */
export function removeDraftPhase(draft: ScenarioDraft, id: string): ScenarioDraft {
  return { ...draft, phases: draft.phases.filter((p) => p.id !== id) }
}

/**
 * Thêm một chặng vào nháp.
 *
 * `seed` phải KHÁC NHAU giữa hai lần gọi liên tiếp — cùng lý do đã ghi ở `applyPreset`.
 */
export function addDraftPhase(
  draft: ScenarioDraft,
  phase: Omit<DraftPhase, 'id'>,
  seed: number,
): ScenarioDraft {
  return {
    ...draft,
    phases: [...draft.phases, { ...phase, id: `${NEW_ID_PREFIX}p${seed}` }].sort(
      (a, b) => a.startYear - b.startYear,
    ),
  }
}

/**
 * Thêm một mốc vào nháp và trả về CẢ id vừa sinh — chỗ gọi cần id để mở ngay editor của
 * mốc đó ("thêm xong thì con trỏ phải ở đúng thứ vừa thêm", §14).
 */
export function addDraftEvent(
  draft: ScenarioDraft,
  event: Omit<DraftEvent, 'id'>,
  seed: number,
): { draft: ScenarioDraft; id: string } {
  const id = `${NEW_ID_PREFIX}e${seed}`
  return {
    id,
    draft: {
      ...draft,
      events: [...draft.events, { ...event, id }].sort((a, b) => a.startYear - b.startYear),
    },
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
    // Sắp lại theo `startYear` — cùng lý do với `patchDraftPhase`: danh sách mốc trong
    // trình sửa hiện theo năm tăng dần, và ô "Từ năm" ngay trên dòng đổi được năm đó.
    events: draft.events
      .map((e) => (e.id === id ? { ...e, ...patch } : e))
      .sort((a, b) => a.startYear - b.startYear),
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
