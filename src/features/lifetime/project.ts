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
 * ScenarioEditorSheet từng có bản chép thứ ba của luật này chỉ vì hàm chưa export.
 * `sorted` phải đã sắp tăng theo `startYear`.
 */
export function phaseForYear<T extends { startYear: number }>(sorted: T[], year: number): T {
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

  const sortedPhases = [...phases].sort((a, b) => a.startYear - b.startYear)
  const lastYear = birthYear + endAge
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
    const phase = phaseForYear(sortedPhases, year)
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

    const eventIncome = yearEvents
      .filter((e) => e.kind === 'income')
      .reduce((s, e) => s + e.amountDisplayMinor, 0)
    const eventExpense = yearEvents
      .filter((e) => e.kind === 'expense')
      .reduce((s, e) => s + e.amountDisplayMinor, 0)

    const netFlowMinor = incomeMinor + eventIncome - expenseMinor - eventExpense

    for (let i = 0; i < assets.length; i++) {
      assets[i] = Math.round(assets[i] * (1 + rates[i])) + netFlowMinor
    }

    out.push({
      year,
      age: year - birthYear,
      country: phase.country,
      phaseLabel: phase.label,
      incomeMinor,
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
