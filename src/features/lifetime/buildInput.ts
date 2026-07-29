// Ráp `LifetimeInput` từ các DÒNG DB thô — THUẦN, không React, không đồng hồ.
//
// VÌ SAO ĐỨNG RIÊNG MỘT FILE: bản trước nằm trong một `useMemo` ở
// `useNotifications.ts` — 16 phép ánh xạ trường, ba lần `as CurrencyCode`, và luật
// chọn kịch bản chính — mà KHÔNG có một phép thử nào, vì cơ sở dữ liệu demo không có
// kịch bản Lifetime nào nên cả nhánh code đó chưa từng chạy lúc xem trước. Tách ra
// thì luật chọn kịch bản và từng phép ánh xạ đều canh được.
//
// VÌ SAO ĐẶT Ở `features/lifetime/` CHỨ KHÔNG PHẢI `features/notifications/`: đây là
// kiến thức về LƯỢC ĐỒ Lifetime (ba bảng life_scenarios / life_phases / life_events
// đổ vào `LifetimeInput`), và thư mục này đã giữ bản song sinh của nó —
// `useLifetime.ts` có `buildInputFor` làm đúng phép ánh xạ ấy cho tầng UI. Một
// migration thêm cột vào `life_phases` phải buộc người ta sửa trong MỘT thư mục, chứ
// không phải hai. Chiều import cũng không phát sinh gì mới: `features/notifications`
// vốn đã phụ thuộc `features/lifetime` (rules/lifetimeRules.ts gọi project.ts và
// insights.ts) — còn đặt ngược lại thì thư mục thông báo tự nhiên phải biết cột của
// ba bảng Lifetime.
import type { CurrencyCode } from '../../lib/currencies'
import type { LifeEventRow, LifePhaseRow, LifeScenarioRow } from '../../types/database.types'
import type { LifetimeEvent, LifetimeInput, LifetimePhase } from './project'

/** Khớp default của cột `profiles.annual_inflation_bps`. */
export const DEFAULT_INFLATION_BPS = 200

export interface BuildLifetimeInputArgs {
  /** `undefined` = query chưa về. `[]` = đã về và người dùng chưa có kịch bản nào. */
  scenarios: LifeScenarioRow[] | undefined
  phases: LifePhaseRow[] | undefined
  events: LifeEventRow[] | undefined
  /** `profile.birth_year`. Chưa khai thì không chiếu được — xem JSDoc dưới. */
  birthYear: number | null | undefined
  /** `profile.annual_inflation_bps`; thiếu thì về `DEFAULT_INFLATION_BPS`. */
  annualInflationBps: number | null | undefined
  /** Hôm nay 'YYYY-MM-DD'. Đồng hồ đọc MỘT LẦN ở tầng hook rồi truyền vào. */
  todayISO: string
}

/**
 * Kịch bản đang hiệu lực: `is_primary` thắng; nhiều bản cùng `is_primary`, hoặc không
 * bản nào, thì lấy `sort_order` NHỎ NHẤT.
 *
 * Tự sắp thay vì tin vào thứ tự `getLifeScenarios()` trả về: bản cũ viết
 * `scenarios.find((s) => s.is_primary) ?? scenarios[0]`, tức luật hoà nằm ẩn trong
 * câu `order by` của tầng dữ liệu và không có gì canh. `demoRepo` không có `order by`
 * nào cả, mà đây lại đúng là nhánh code chưa từng chạy khi xem trước.
 *
 * Hoà cả `sort_order` thì giữ thứ tự mảng đầu vào (`sort` của JS ổn định).
 *
 * EXPORT vì `useLifetime.ts` phải dùng ĐÚNG hàm này chứ không phải bản riêng của nó
 * (`find(is_primary) ?? scenarios[0]`). Hai luật chỉ trùng nhau nhờ cả hai repo tình cờ
 * `order by sort_order` — mà chính vì tin vào điều đó là sai nên hàm này mới tồn tại.
 * Lệch nhau thì màn Lifetime hiện một kịch bản còn thông báo/thẻ ở /assets nói về kịch
 * bản khác, không có gì trên màn hình cho thấy hai bên đang nói về hai thứ.
 */
export function pickActive(scenarios: LifeScenarioRow[]): LifeScenarioRow | undefined {
  const primaries = scenarios.filter((s) => s.is_primary)
  const pool = primaries.length > 0 ? primaries : scenarios
  return [...pool].sort((a, b) => a.sort_order - b.sort_order)[0]
}

/**
 * `LifetimeInput` của kịch bản chính, hoặc `undefined`.
 *
 * `undefined` khi thiếu BẤT KỲ mảnh nào — chưa tải xong, chưa có kịch bản nào, chưa
 * khai năm sinh, hoặc kịch bản chính chưa có chặng nào. Bộ luật đã xử lý ca đó bằng
 * cách IM, nên ở đây KHÔNG được điền số mặc định để "có cái mà chiếu": đoán năm sinh
 * hay đoán chi nền là báo cho người dùng một con số không phải của họ.
 */
export function buildLifetimeInput(args: BuildLifetimeInputArgs): LifetimeInput | undefined {
  const { scenarios, phases: allPhases, events: allEvents, birthYear, todayISO } = args
  // `!birthYear` (không phải `== null`): năm sinh 0 cũng vô nghĩa, và dữ liệu
  // demo/local cũ hơn migration 0031 có thể thiếu hẳn khoá này.
  if (!birthYear) return undefined
  if (!scenarios || !allPhases || !allEvents) return undefined
  const active = pickActive(scenarios)
  if (!active) return undefined

  const phases: LifetimePhase[] = allPhases
    .filter((p) => p.scenario_id === active.id)
    .map((p) => ({
      startYear: p.start_year,
      label: p.label,
      country: p.country,
      currency: p.currency as CurrencyCode,
      annualIncomeMinor: p.annual_income_minor,
      annualExpenseMinor: p.annual_expense_minor,
      fxToDisplay: p.fx_to_display,
    }))
  // Kịch bản không có chặng nào thì `projectLifetime` trả mảng rỗng — không có gì để
  // so, mà `lifetime` khác undefined lại làm bộ luật tưởng là có dữ liệu.
  if (phases.length === 0) return undefined

  const events: LifetimeEvent[] = allEvents
    .filter((e) => e.scenario_id === active.id)
    .map((e) => ({
      id: e.id,
      startYear: e.start_year,
      endYear: e.end_year,
      kind: e.kind,
      amountMinor: e.amount_minor,
      currency: e.currency as CurrencyCode,
      label: e.label,
      fxToDisplay: e.fx_to_display,
      inflate: e.inflate,
    }))

  return {
    // Năm hiện tại suy từ `todayISO` chứ KHÔNG gọi `new Date()` ở đây: hook gọi hàm
    // này đã đọc đồng hồ một lần: hai lần đọc trong cùng một lượt render có thể rơi
    // hai bên nửa đêm và cho ra hai năm khác nhau.
    currentYear: Number(todayISO.slice(0, 4)),
    birthYear,
    endAge: active.end_age,
    displayCurrency: active.display_currency as CurrencyCode,
    startingAssetsMinor: active.starting_assets_minor,
    realReturnBps: active.real_return_bps,
    bandSpreadBps: active.band_spread_bps,
    inflationBps: args.annualInflationBps ?? DEFAULT_INFLATION_BPS,
    nominalTerms: active.nominal_terms,
    phases,
    events,
  }
}
