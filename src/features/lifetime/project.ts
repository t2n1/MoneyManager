// Engine Lifetime — THUẦN. MODULE LÁ: chỉ được import lib/currencies.
// Không React, không localStorage, không Date.now(). Lý do: lifetimeRules.ts gọi
// hàm này, và src/features/notifications/purity.test.ts canh điều kiện đó (mục J).
import { CURRENCIES, type CurrencyCode } from '../../lib/currencies'

/** Chặng đời: thu chi NỀN. Chặng sau bắt đầu thì chặng trước kết thúc. */
export interface LifetimePhase {
  startYear: number
  label: string
  country: string | null
  currency: CurrencyCode
  annualIncomeMinor: number
  annualExpenseMinor: number
  /** 1 đơn vị `currency` = bao nhiêu đơn vị display, theo MAJOR units. */
  fxToDisplay: number
}

/** Sự kiện: số MỖI NĂM trong khoảng [startYear, endYear]. endYear null = hết đời. */
export interface LifetimeEvent {
  id: string
  startYear: number
  endYear: number | null
  kind: 'income' | 'expense'
  amountMinor: number
  currency: CurrencyCode
  label: string
  /**
   * 1 đơn vị `currency` của SỰ KIỆN = bao nhiêu đơn vị display, theo MAJOR units.
   *
   * Sự kiện mang tỷ giá RIÊNG, không mượn của chặng: 年金 giữ ¥ trong khi chặng Mỹ
   * dùng $ và đơn vị hiển thị cũng là $ — lúc đó tỷ giá của chặng ($→$ = 1) vô dụng.
   * Xem migration 0032.
   */
  fxToDisplay: number
  inflate: boolean
}

export interface LifetimeInput {
  currentYear: number
  birthYear: number
  endAge: number
  displayCurrency: CurrencyCode
  startingAssetsMinor: number
  /** Lợi suất THỰC, basis points. Âm được. */
  realReturnBps: number
  /** Nửa độ rộng dải: chạy lại với realReturn ± giá trị này. 0 = không có dải. */
  bandSpreadBps: number
  inflationBps: number
  /**
   * false = giá hôm nay (mặc định): `inflationBps` KHÔNG được dùng ở đâu cả — thu,
   * chi và sự kiện đứng yên, tài sản tăng theo đúng `realReturnBps` đã nhập (lợi
   * suất THỰC vốn đã trừ lạm phát sẵn, nên không trừ thêm lần nữa ở đây).
   *
   * true = giá danh nghĩa: lạm phát phồng thu/chi/sự kiện, VÀ lợi suất của cả ba
   * nhánh đổi sang danh nghĩa (1+r)(1+i)−1 để cùng đơn vị với dòng tiền.
   */
  nominalTerms: boolean
  phases: LifetimePhase[]
  events: LifetimeEvent[]
  /**
   * Lớp phủ "chuyện xấu xảy ra thì sao" — KHÔNG thuộc kịch bản, không được lưu.
   *
   * Tuỳ chọn và mặc định `undefined`: mọi chỗ gọi cũ (buildInput.ts, useLifetime.ts,
   * bộ luật thông báo) không truyền gì và chạy y hệt trước. Đây là ràng buộc BẮT
   * BUỘC chứ không phải tiện tay — `projectLifetime` có 9 symbol phụ thuộc và được
   * gói vào `supabase/functions/push-notify/_rules.js`, nên đổi chữ ký là đổi cả
   * chuông báo trong app lẫn chuông báo phía server.
   */
  stress?: StressConfig | null
}

/**
 * Sáu cú sốc của khối "Stress test". Mỗi cú sốc mang cờ bật RIÊNG chứ không suy từ
 * giá trị (năm = 0 nghĩa là tắt): người dùng tắt công tắc rồi bật lại phải thấy đúng
 * năm mình vừa gõ, không phải một ô trống.
 */
export interface StressConfig {
  /** Thu = 0 đúng một năm. */
  jobloss: { on: boolean; year: number }
  /** Tài sản mất `dropPct`% NGAY ĐẦU năm `year`, trước khi sinh lời. */
  crash: { on: boolean; year: number; dropPct: number }
  /** Một khoản chi bất thường, ĐƠN VỊ HIỂN THỊ (đã quy đổi sẵn). */
  illness: { on: boolean; year: number; amountDisplayMinor: number }
  /** Lợi suất về 0 trong `years` năm liên tiếp kể từ `year`. */
  recession: { on: boolean; year: number; years: number }
  /** Thu giảm `cutPct`% VĨNH VIỄN từ `year` trở đi. */
  paycut: { on: boolean; year: number; cutPct: number }
  /** Chiếu thêm `years` năm quá tuổi cuối của kịch bản. */
  longevity: { on: boolean; years: number }
}

/** ID của khoản chi do cú sốc "bệnh nặng" sinh ra — xem `projectLifetime`. */
export const STRESS_ILLNESS_EVENT_ID = 'stress:illness'

export const NO_STRESS: StressConfig = {
  jobloss: { on: false, year: 0 },
  crash: { on: false, year: 0, dropPct: 20 },
  illness: { on: false, year: 0, amountDisplayMinor: 0 },
  recession: { on: false, year: 0, years: 5 },
  paycut: { on: false, year: 0, cutPct: 30 },
  longevity: { on: false, years: 10 },
}

/** Có cú sốc nào đang bật không. `null`/`undefined` = không. */
export function hasStress(s: StressConfig | null | undefined): boolean {
  if (!s) return false
  return (
    s.jobloss.on || s.crash.on || s.illness.on || s.recession.on || s.paycut.on || s.longevity.on
  )
}

export interface YearEvent {
  id: string
  label: string
  kind: 'income' | 'expense'
  /** Đã quy đổi về displayCurrency và đã áp lạm phát nếu inflate. */
  amountDisplayMinor: number
}

export interface YearRow {
  year: number
  age: number
  country: string | null
  phaseLabel: string
  /** Thu nền, đã quy đổi. Không gồm sự kiện. */
  incomeMinor: number
  /** Chi nền, đã quy đổi. Không gồm sự kiện. */
  expenseMinor: number
  events: YearEvent[]
  /** (thu nền + thu sự kiện) − (chi nền + chi sự kiện) */
  netFlowMinor: number
  /** Nhánh TRUNG TÂM: đúng `realReturnBps` đã nhập, không cộng trừ dải. */
  assetsEndMinor: number
  /**
   * Biên DƯỚI của dải: `Math.min` của CẢ BA nhánh. Bất biến
   * `assetsPessimisticMinor <= assetsEndMinor <= assetsOptimisticMinor` luôn đúng ở
   * mọi dòng.
   *
   * Phải trùm cả ba, KHÔNG được lấy min/max của riêng hai nhánh biên: khi tài sản
   * xuyên qua 0 thì kết quả không còn đơn điệu theo lợi suất (lúc dương lợi suất cao
   * là tốt, lúc âm nó phình nợ nhanh hơn), nên `r` nằm giữa `r±s` KHÔNG kéo theo
   * `A(r)` nằm giữa `A(r−s)` và `A(r+s)`. Có phản ví dụ ở đúng giá trị mặc định của
   * migration 0031 (`real_return_bps = 200`, `band_spread_bps = 150`): nhánh trung
   * tâm chạy ra NGOÀI dải, và `<Area>` của Recharts sẽ vẽ đường trung tâm nằm dưới
   * dải đúng ở đoạn cạn tiền.
   *
   * Cố ý KHÔNG đặt tên theo nhánh lợi suất (`Low`/`High`): ở vùng tài sản ÂM, nhánh
   * lợi suất CAO phình nợ nhanh hơn nên nó lại cho kết quả tệ hơn — tên theo nhánh
   * thì hai trường đảo chỗ đúng ở đoạn cạn tiền, tức đoạn người dùng cần đọc nhất,
   * và `<Area>` của Recharts vẽ dải lộn ngược.
   */
  assetsPessimisticMinor: number
  /** Biên TRÊN của dải: `Math.max` của CẢ BA nhánh. Xem `assetsPessimisticMinor`. */
  assetsOptimisticMinor: number
}

/**
 * Quy đổi minor units giữa hai loại tiền bằng tỷ giá MAJOR-sang-MAJOR.
 *
 * Cố ý ngược hướng với `Rates` trong lib/rates.ts (ở đó `rates[X]` là "1 base đổi
 * được bao nhiêu X" nên phải CHIA). Ở đây `fxMajor` là "1 đơn vị `from` đổi được
 * bao nhiêu đơn vị `to`" — đúng cách người dùng nghĩ khi gõ "¥150/$" — nên NHÂN.
 *
 * Bắt buộc đi qua major units: JPY có 0 chữ số thập phân còn USD có 2, nhân thẳng
 * minor × tỷ giá sẽ lệch 100 lần.
 */
export function convertLifetimeMinor(
  minor: number,
  from: CurrencyCode,
  to: CurrencyCode,
  fxMajor: number,
): number {
  if (from === to) return minor
  const fromMajor = minor / 10 ** CURRENCIES[from].decimals
  return Math.round(fromMajor * fxMajor * 10 ** CURRENCIES[to].decimals)
}

/**
 * Chặng đang hiệu lực cho `year`: chặng muộn nhất có startYear <= year.
 *
 * Generic ở đúng một field (`startYear`) để tầng UI dùng lại được CÙNG một luật cho
 * `LifePhaseRow` (chỉ cần ánh xạ `start_year` → `startYear`) thay vì chép lại hàm —
 * Trình sửa kịch bản từng có bản chép thứ ba của luật này chỉ vì hàm chưa export.
 * `sorted` phải đã sắp tăng theo `startYear`.
 *
 * Trả `undefined` khi `sorted` rỗng — nói thẳng trong chữ ký thay vì hứa `T` rồi
 * trả `sorted[0]`. tsconfig.app.json không bật `strict`, nên lời hứa sai đó không
 * có ai bắt, mà hàm này giờ là hàm CÔNG KHAI: lifetimeRules.ts (bộ luật thông báo)
 * và trình sửa kịch bản đều gọi.
 */
export function phaseForYear<T extends { startYear: number }>(sorted: T[], year: number): T | undefined {
  // Năm nằm trước chặng đầu tiên thì dùng chặng đầu tiên — thà lấy giả định gần
  // nhất còn hơn để trống một quãng đầu đồ thị.
  let found = sorted[0]
  for (const p of sorted) {
    if (p.startYear <= year) found = p
    else break
  }
  return found
}

export function projectLifetime(input: LifetimeInput): YearRow[] {
  const {
    currentYear,
    birthYear,
    endAge,
    displayCurrency,
    startingAssetsMinor,
    realReturnBps,
    bandSpreadBps,
    inflationBps,
    nominalTerms,
    phases,
    events,
  } = input

  if (phases.length === 0) return []

  // `null` khi không cú sốc nào bật — mọi phép thử cú sốc bên dưới rút về một phép so
  // sánh `stress !== null`, và bản chiếu bình thường không đi qua nhánh nào của khối này.
  const stress = hasStress(input.stress) ? (input.stress as StressConfig) : null

  const sortedPhases = [...phases].sort((a, b) => a.startYear - b.startYear)
  // "Sống thọ hơn dự tính" kéo dài chính bản chiếu, không phải sửa `endAge` của kịch
  // bản: endAge là dữ liệu đã lưu, còn cú sốc là một câu hỏi "nếu như" không được ghi.
  const lastYear = birthYear + endAge + (stress?.longevity.on ? stress.longevity.years : 0)
  if (lastYear < currentYear) return []

  const inflation = nominalTerms ? inflationBps / 10_000 : 0
  // Lợi suất phải CÙNG ĐƠN VỊ với dòng tiền. Giá danh nghĩa thì thu/chi/sự kiện đã
  // phồng theo lạm phát, nên lợi suất cũng phải là danh nghĩa: (1+r)(1+i)−1. Để
  // nguyên lợi suất thực ở chế độ này là trừ lạm phát HAI LẦN — dòng tiền tính bằng
  // tiền tương lai còn tài sản tính bằng tiền hôm nay, không tương ứng đơn vị nào.
  const rates = [realReturnBps, realReturnBps - bandSpreadBps, realReturnBps + bandSpreadBps].map(
    (bps) => {
      const real = bps / 10_000
      return nominalTerms ? (1 + real) * (1 + inflation) - 1 : real
    },
  )
  // Ba nhánh tài sản chạy song song trên CÙNG dòng tiền — chỉ khác lợi suất.
  const assets = [startingAssetsMinor, startingAssetsMinor, startingAssetsMinor]

  const out: YearRow[] = []

  for (let year = currentYear; year <= lastYear; year++) {
    // `?? sortedPhases[0]`: `phases.length === 0` đã return ở trên nên mảng này
    // không rỗng và `phaseForYear` luôn trả một chặng — nhánh `??` là nhánh chết,
    // chỉ để khớp `| undefined` trong chữ ký (xem JSDoc của hàm đó) mà không phải
    // dựng thêm một câu `if` giả vờ xử lý ca không xảy ra.
    const phase = phaseForYear(sortedPhases, year) ?? sortedPhases[0]
    const infl = (1 + inflation) ** (year - currentYear)

    const incomeMinor = Math.round(
      convertLifetimeMinor(
        phase.annualIncomeMinor,
        phase.currency,
        displayCurrency,
        phase.fxToDisplay,
      ) * infl,
    )
    const expenseMinor = Math.round(
      convertLifetimeMinor(
        phase.annualExpenseMinor,
        phase.currency,
        displayCurrency,
        phase.fxToDisplay,
      ) * infl,
    )

    // Mất việc và giảm thu đánh vào THU NỀN, sau quy đổi và sau lạm phát: chúng là
    // "chặng này thu ít đi", không phải một khoản chi thêm. Mất việc thắng giảm thu
    // trong đúng năm mất việc — nhân 0 với bất cứ tỷ lệ nào cũng vẫn là 0.
    let stressedIncomeMinor = incomeMinor
    if (stress) {
      if (stress.paycut.on && year >= stress.paycut.year) {
        stressedIncomeMinor = Math.round(stressedIncomeMinor * (1 - stress.paycut.cutPct / 100))
      }
      if (stress.jobloss.on && year === stress.jobloss.year) stressedIncomeMinor = 0
    }

    const yearEvents: YearEvent[] = []
    for (const e of events) {
      if (e.startYear > year) continue
      if (e.endYear !== null && e.endYear < year) continue
      // Mỗi khoản tiền tự mang tỷ giá của nó, nên ở đây KHÔNG còn ca đặc biệt nào:
      // cùng tiền hiển thị thì convertLifetimeMinor trả nguyên số và bỏ qua tỷ giá.
      const converted = convertLifetimeMinor(
        e.amountMinor,
        e.currency,
        displayCurrency,
        e.fxToDisplay,
      )
      yearEvents.push({
        id: e.id,
        label: e.label,
        kind: e.kind,
        amountDisplayMinor: Math.round(converted * (e.inflate ? infl : 1)),
      })
    }

    // "Bệnh nặng" đi vào danh sách SỰ KIỆN chứ không cộng lén vào `expenseMinor`:
    // `expenseMinor` được JSDoc hứa là "chi nền, không gồm sự kiện", và thứ đọc con số
    // đó (ngưỡng FIRE = 25× chi) sẽ nhảy vọt đúng một năm nếu nhét khoản này vào. Là
    // một dòng có tên trong tooltip thì người dùng thấy vì sao năm đó tụt.
    if (stress?.illness.on && year === stress.illness.year) {
      yearEvents.push({
        id: STRESS_ILLNESS_EVENT_ID,
        label: 'Bệnh nặng (stress test)',
        kind: 'expense',
        amountDisplayMinor: Math.round(stress.illness.amountDisplayMinor * infl),
      })
    }

    const eventIncome = yearEvents
      .filter((e) => e.kind === 'income')
      .reduce((s, e) => s + e.amountDisplayMinor, 0)
    const eventExpense = yearEvents
      .filter((e) => e.kind === 'expense')
      .reduce((s, e) => s + e.amountDisplayMinor, 0)

    const netFlowMinor = stressedIncomeMinor + eventIncome - expenseMinor - eventExpense

    // Suy thoái = lợi suất về 0 cho CẢ BA nhánh trong cửa sổ của nó. Không phải "trừ
    // đi mấy phần trăm": ba nhánh vốn khác nhau đúng ở lợi suất, nên trừ đều vẫn còn
    // một dải rộng — mà cú sốc muốn nói là "năm đó tiền không sinh lời", một trạng
    // thái duy nhất.
    const inRecession =
      stress?.recession.on === true &&
      year >= stress.recession.year &&
      year < stress.recession.year + stress.recession.years
    // Khủng hoảng cắt tài sản NGAY ĐẦU năm, trước khi sinh lời và trước khi cộng dòng
    // tiền — mất 20% của số dư đang có, không mất 20% của số dư sau khi đã để dành
    // thêm cả năm.
    const crashNow = stress?.crash.on === true && year === stress.crash.year

    for (let i = 0; i < assets.length; i++) {
      if (crashNow) {
        assets[i] = Math.round(assets[i] * (1 - (stress as StressConfig).crash.dropPct / 100))
      }
      assets[i] = Math.round(assets[i] * (1 + (inRecession ? 0 : rates[i]))) + netFlowMinor
    }

    out.push({
      year,
      age: year - birthYear,
      country: phase.country,
      phaseLabel: phase.label,
      // Thu ĐÃ trừ cú sốc: dòng "Thu" trong tooltip phải là con số đã dùng để tính ra
      // đường đang vẽ. In thu nền ở đây thì năm mất việc hiện "Thu ¥6.800.000" bên
      // cạnh một đường tụt thẳng đứng, và không có gì trên màn giải thích khoảng cách.
      // Không có cú sốc nào thì đây CHÍNH LÀ `incomeMinor`.
      incomeMinor: stressedIncomeMinor,
      expenseMinor,
      events: yearEvents,
      netFlowMinor,
      assetsEndMinor: assets[0],
      // Trùm CẢ BA nhánh, kể cả nhánh trung tâm assets[0]: khi tài sản xuyên qua 0 thì
      // trung tâm có thể chạy ra ngoài hai nhánh biên. Xem JSDoc assetsPessimisticMinor.
      assetsPessimisticMinor: Math.min(assets[0], assets[1], assets[2]),
      assetsOptimisticMinor: Math.max(assets[0], assets[1], assets[2]),
    })
  }

  return out
}
