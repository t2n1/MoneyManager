// Đọc kết luận từ YearRow[]. THUẦN. Bốn câu hỏi của người dùng đều đọc từ cùng
// một mảng — không chỗ nào tính lại theo công thức riêng.
import {
  convertLifetimeMinor,
  projectLifetime,
  type LifetimeInput,
  type YearRow,
} from './project'

/** Quy tắc 4%: tài sản × SWR đủ trả chi phí năm thì coi như tự do tài chính. */
export const DEFAULT_SWR_BPS = 400

/** Khoảng dò của minimumReturnBps: 0% → 10%. */
const MIN_RETURN_LO_BPS = 0
const MIN_RETURN_HI_BPS = 1000

/**
 * Năm đầu tiên tài sản xuống dưới 0. null = không bao giờ âm.
 * `branch` 'low' đọc biên DƯỚI của dải (`assetsPessimisticMinor`) — con số đáng lo
 * hơn và là thứ thẻ kết luận hiện, vì mốc âm của nhánh trung tâm dịch cả chục năm
 * khi đổi lợi suất 1%.
 */
export function firstNegativeYear(rows: YearRow[], branch: 'center' | 'low'): number | null {
  for (const r of rows) {
    // 'low' = BIÊN DƯỚI của dải (assetsPessimisticMinor), không phải "nhánh lợi suất
    // thấp": ở vùng tài sản âm hai thứ đó là hai nhánh khác nhau. Xem YearRow.
    const v = branch === 'low' ? r.assetsPessimisticMinor : r.assetsEndMinor
    if (v < 0) return r.year
  }
  return null
}

/** Năm đầu tiên tài sản × SWR ≥ chi phí năm. null = không bao giờ đạt. */
export function fireYear(rows: YearRow[], swrBps = DEFAULT_SWR_BPS): number | null {
  const swr = swrBps / 10_000
  for (const r of rows) {
    if (r.expenseMinor <= 0) continue // không có chi phí thì mốc này vô nghĩa
    if (r.assetsEndMinor * swr >= r.expenseMinor) return r.year
  }
  return null
}

export function assetsAtAge(
  rows: YearRow[],
  age: number,
): { center: number; low: number; high: number } | null {
  const row = rows.find((r) => r.age === age)
  if (!row) return null
  // low/high ở đây là hai BIÊN của dải, không phải hai nhánh lợi suất — nên đọc thẳng
  // assetsPessimisticMinor/assetsOptimisticMinor để `low <= high` luôn đúng.
  return {
    center: row.assetsEndMinor,
    low: row.assetsPessimisticMinor,
    high: row.assetsOptimisticMinor,
  }
}

/**
 * Lợi suất thực nhỏ nhất (basis points) để KHÔNG năm nào âm, dò nhị phân trong
 * khoảng 0–10%. null = không tồn tại trong khoảng đó.
 *
 * Đây là thẻ kết luận thay cho "năm đầu tiên âm" của bản nháp đầu: mốc âm dịch 15
 * năm khi đổi lợi suất 1%, tức là chính xác giả. Con số này thì hành động được.
 *
 * Dò trên nhánh TRUNG TÂM với bandSpread = 0 — đang trả lời "cần lợi suất bao
 * nhiêu", nên dải dao động quanh nó không liên quan.
 */
export function minimumReturnBps(input: LifetimeInput): number | null {
  const safeAt = (bps: number) =>
    firstNegativeYear(
      projectLifetime({ ...input, realReturnBps: bps, bandSpreadBps: 0 }),
      'center',
    ) === null

  if (safeAt(MIN_RETURN_LO_BPS)) return MIN_RETURN_LO_BPS
  if (!safeAt(MIN_RETURN_HI_BPS)) return null

  let lo = MIN_RETURN_LO_BPS
  let hi = MIN_RETURN_HI_BPS
  // 10 vòng đủ đưa khoảng 1000bps xuống dưới 1bps.
  for (let i = 0; i < 10; i++) {
    const mid = Math.round((lo + hi) / 2)
    if (safeAt(mid)) hi = mid
    else lo = mid
  }
  return hi
}

/**
 * Mốc Coast: tài sản cần CÓ SẴN hôm nay để — không góp thêm đồng nào — lãi kép tự đưa
 * tới tự do tài chính ở TUỔI CUỐI của kịch bản. Đơn vị: minor của displayCurrency.
 *
 * Đóng dạng: chi năm cuối × (10000/swr) ÷ (1+r)^(số năm còn lại). Dùng chi của CHẶNG
 * CUỐI (mức sống lúc về già, không phải mức hôm nay) và lợi suất THỰC của kịch bản —
 * mọi con số đều ở giá hôm nay nên không nhân lạm phát, y hệt quy ước projectLifetime
 * khi nominalTerms=false.
 *
 * CỐ Ý bỏ qua sự kiện/mốc: Coast trả lời "nếu từ mai tôi chỉ tiêu bằng thu, khối tài
 * sản hiện có tự lớn tới đích không" — các mốc chi lớn phía trước thuộc về Bản đồ khoản
 * lớn, trộn chúng vào đây là hai câu hỏi giẫm chân nhau. null = không tính được (hết
 * năm để lớn, chi ≤ 0, hay lợi suất ≤ −100%).
 */
export function coastAssetsMinor(input: LifetimeInput, swrBps = DEFAULT_SWR_BPS): number | null {
  const yearsLeft = input.birthYear + input.endAge - input.currentYear
  if (yearsLeft <= 0) return null
  const phases = [...input.phases].sort((a, b) => a.startYear - b.startYear)
  const last = phases[phases.length - 1]
  if (!last) return null
  const expense = convertLifetimeMinor(
    last.annualExpenseMinor,
    last.currency,
    input.displayCurrency,
    last.fxToDisplay,
  )
  if (expense <= 0) return null
  const r = input.realReturnBps / 10_000
  if (1 + r <= 0) return null
  const target = expense * (10_000 / swrBps)
  return Math.round(target / Math.pow(1 + r, yearsLeft))
}

/** Hiệu tài sản cuối đời giữa hai bản chiếu (a − b). null nếu một bên rỗng. */
export function compareAtEnd(a: YearRow[], b: YearRow[]): number | null {
  if (a.length === 0 || b.length === 0) return null
  return a[a.length - 1].assetsEndMinor - b[b.length - 1].assetsEndMinor
}

/**
 * Để dành thêm BAO NHIÊU mỗi năm thì đạt tự do tài chính không muộn hơn `targetYear`.
 * Đơn vị: minor units của `displayCurrency`. `null` = không tới được, dù cắt hết chi.
 *
 * Đây là con số DUY NHẤT trên màn Tương lai mà người dùng hành động được ngay: mọi
 * thứ khác nói "chuyện gì sẽ xảy ra", cái này nói "làm gì thì khác đi". Vì vậy nó trả
 * về một khoản TIỀN chứ không phải một tỷ lệ phần trăm — "để dành thêm 4% thu nhập"
 * còn phải nhân nhẩm mới ra việc phải làm.
 *
 * Cắt vào CHI của mọi chặng (không phải chỉ chặng đang chạy): mốc FIRE nằm ở hai ba
 * chục năm nữa, nên tiết kiệm chỉ trong chặng hiện tại rồi tiêu như cũ suốt phần đời
 * còn lại thì con số ra sẽ nhỏ hơn thực tế phải làm — tức là hứa hão.
 *
 * Biên trên của phép dò là 90% chi của chặng TIẾT KIỆM NHẤT — suy từ dữ liệu, không
 * gõ cứng (một con số hợp với ¥ thì sai 5000 lần với ₫). Hai chi tiết trong biên đó
 * đều là bắt buộc, không phải cho chắc:
 * - chặng NHỎ NHẤT, vì phép cắt áp ĐỀU lên mọi chặng: cắt quá chi của chặng nghèo
 *   nhất thì chặng đó bị kẹp về 0, và từ đó "để dành thêm 1 đồng nữa" không còn đổi
 *   gì — phép dò nhị phân mất tính đơn điệu mà nó dựa vào.
 * - 90% chứ không 100%, vì `fireYear` BỎ QUA năm có chi bằng 0 ("không có chi phí thì
 *   mốc này vô nghĩa"). Cắt sạch chi thì mọi năm đều bị bỏ qua và hàm trả về "không
 *   bao giờ đạt" đúng ở đầu mút đáng ra dễ đạt nhất — biên trên hoá ra vô dụng.
 */
export function extraSavingsForFire(input: LifetimeInput, targetYear: number): number | null {
  const phaseExpensesDisplay = input.phases.map((p) =>
    convertLifetimeMinor(
      p.annualExpenseMinor,
      p.currency,
      input.displayCurrency,
      p.fxToDisplay,
    ),
  )
  const duong = phaseExpensesDisplay.filter((v) => v > 0)
  if (duong.length !== phaseExpensesDisplay.length || duong.length === 0) return null
  const hi0 = Math.floor(Math.min(...duong) * 0.9)
  if (hi0 <= 0) return null

  /** `input` với mỗi chặng bị cắt `extraDisplay` khỏi chi, quy về tiền của chặng đó. */
  const cut = (extraDisplay: number): LifetimeInput => ({
    ...input,
    phases: input.phases.map((p) => {
      // fx 0 thì không có đường quy ngược — bỏ qua chặng đó thay vì chia cho 0 và ra
      // Infinity. Ca này chỉ xảy ra với dữ liệu hỏng; thà cắt hụt còn hơn ra NaN.
      const extraInPhase =
        p.fxToDisplay === 0
          ? 0
          : convertLifetimeMinor(extraDisplay, input.displayCurrency, p.currency, 1 / p.fxToDisplay)
      return { ...p, annualExpenseMinor: Math.max(0, p.annualExpenseMinor - extraInPhase) }
    }),
  })

  const reaches = (extraDisplay: number) => {
    const y = fireYear(projectLifetime(cut(extraDisplay)))
    return y !== null && y <= targetYear
  }

  if (!reaches(hi0)) return null
  if (reaches(0)) return 0

  let lo = 0
  let hi = hi0
  // 24 vòng đưa khoảng ¥12.000.000 xuống dưới 1 đồng — thừa cho một con số sẽ được
  // làm tròn khi hiện lên màn.
  for (let i = 0; i < 24; i++) {
    const mid = Math.round((lo + hi) / 2)
    if (reaches(mid)) hi = mid
    else lo = mid
  }
  return hi
}
