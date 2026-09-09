// Mốc MUA MỘT TÀI SẢN — nhà, xe, đất — THUẦN (migration 0068).
//
// VẤN ĐỀ. Trước file này, "Mua nhà" trong Sổ Gạo là một mốc CHI thuần tuý: tài sản ròng
// tụt bằng khoản trả trước rồi không bao giờ nhận lại căn nhà. Trên đồ thị, mua nhà luôn
// trông tệ hơn thực tế — mà đó đúng là quyết định lớn nhất người dùng mang tới đây để
// hỏi. Monarch giải chỗ này bằng sự kiện "Buy a home" sinh ra MỘT DÒNG TÀI SẢN và MỘT
// DÒNG NỢ tự trả dần (đọc được ngay trong bảng theo năm của họ, khảo sát 07/09/2026).
//
// CÁCH GHÉP VÀO MÔ HÌNH SẴN CÓ. Không thêm "loại mốc" mới — thêm mấy trường tuỳ chọn vào
// chính mốc CHI đang có, đúng cách bốn hình dạng (0066) và ô "thay cho" (0067) đã làm.
// Khi `assetValueMinor > 0` thì nghĩa của mốc đổi như sau, và chỉ như sau:
//
//   - `amountMinor` (qua bốn hình dạng) = CHI PHÍ GIỮ tài sản mỗi năm — thuế, bảo hiểm,
//     bảo trì. Đây đúng là ô "Yearly home ownership costs" của Monarch.
//   - Năm `startYear`: thêm một khoản chi bằng TIỀN TRẢ TRƯỚC (`assetValue − loan`).
//   - `loanYears` năm kể từ đó: thêm một khoản chi bằng tiền trả nợ mỗi năm.
//   - Tài sản: `assetValueMinor`, đổi `assetChangeBps` mỗi năm (nhà +1%, xe −15%).
//   - Nợ: dư nợ còn lại, teo dần theo lịch niên kim.
//
// VÌ SAO KHÔNG DÙNG `features/debts/amortization.ts`. Nó tính theo THÁNG và nhận ngày
// ISO, mà engine này chỉ biết NĂM và là module thuần bị `purity.test.ts` canh — kéo nó
// vào là kéo theo `lib/dates` vào đồ thị import của bộ luật edge function. Phần toán
// thật sự cần ở đây là hai công thức đóng, mười dòng, nên chép công thức rẻ hơn chép
// ràng buộc.
//
// CÔNG THỨC ĐÓNG, không lặp từng tháng: `projectLifetime` có cổng hiệu năng 16ms mỗi
// lượt chiếu (project.test.ts, "cổng hiệu năng (R6)"), mà một mốc vay 35 năm lặp theo
// tháng là 420 vòng × mỗi năm chiếu × ba nhánh lợi suất.

/** Phần "mua tài sản" của một mốc. `assetValueMinor === 0` = mốc thường, không mua gì. */
export interface HomeAsset {
  startYear: number
  /** Giá trị lúc mua, minor units theo tiền của CHÍNH mốc. 0 = tắt. */
  assetValueMinor: number
  /** Giá trị đổi bao nhiêu mỗi năm, basis points. Nhà +100 (1%); xe −1500 (−15%). */
  assetChangeBps: number
  /** Phần đi vay. 0 = trả thẳng bằng tiền mặt. Không được lớn hơn `assetValueMinor`. */
  loanMinor: number
  /** Lãi suất vay, basis points/năm. */
  loanRateBps: number
  /** Kỳ hạn vay, tính bằng năm. 0 = không vay. */
  loanYears: number
}

/** Trần kỳ hạn vay, khớp `check (loan_years between 0 and 60)` của migration 0068. */
export const MAX_LOAN_YEARS = 60

/** Có mua tài sản không. Dùng thay cho việc rải `assetValueMinor > 0` khắp nơi. */
export function hasAsset(h: HomeAsset): boolean {
  return h.assetValueMinor > 0
}

/** Phần vay thật sự — kẹp trong [0, giá trị tài sản]. Vay nhiều hơn giá là gõ sai. */
function loanOf(h: HomeAsset): number {
  if (h.loanYears <= 0) return 0
  return Math.min(Math.max(0, h.loanMinor), h.assetValueMinor)
}

/**
 * Tiền trả nợ MỖI NĂM (12 kỳ tháng theo công thức niên kim). 0 khi không vay.
 *
 * Tính theo THÁNG rồi nhân 12 chứ không dựng niên kim theo năm: khoản vay mua nhà thật
 * trả theo tháng, và niên kim theo năm cho ra số nhỏ hơn vài phần trăm — đủ để con số
 * trên màn không khớp giấy tờ ngân hàng người dùng đang cầm.
 */
export function yearlyLoanPayment(h: HomeAsset): number {
  const P = loanOf(h)
  if (P <= 0) return 0
  const n = h.loanYears * 12
  if (h.loanRateBps <= 0) return Math.round((P / n) * 12)
  const r = h.loanRateBps / 10_000 / 12
  const f = (1 + r) ** n
  return Math.round(((P * r * f) / (f - 1)) * 12)
}

/**
 * Dư nợ CUỐI năm `year`. 0 trước khi mua và sau khi trả xong.
 *
 * Công thức đóng của dư nợ sau `k` kỳ: `B = P(1+r)^k − M((1+r)^k − 1)/r`.
 */
export function loanBalanceInYear(h: HomeAsset, year: number): number {
  const P = loanOf(h)
  if (P <= 0 || year < h.startYear) return 0
  const namDaTra = year - h.startYear + 1
  if (namDaTra >= h.loanYears) return 0
  const k = namDaTra * 12
  const M = yearlyLoanPayment(h) / 12
  if (h.loanRateBps <= 0) return Math.max(0, Math.round(P - M * k))
  const r = h.loanRateBps / 10_000 / 12
  const f = (1 + r) ** k
  return Math.max(0, Math.round(P * f - (M * (f - 1)) / r))
}

/**
 * Giá trị tài sản ở năm `year`. 0 trước năm mua.
 *
 * KHÔNG kẹp sàn khác 0: một chiếc xe mất giá 15%/năm sau 30 năm còn gần như bằng 0, và
 * đó là câu trả lời đúng. Kẹp ở một giá trị "còn lại" nào đó là bịa ra một con số.
 */
export function assetValueInYear(h: HomeAsset, year: number): number {
  if (!hasAsset(h) || year < h.startYear) return 0
  if (h.assetChangeBps === 0) return h.assetValueMinor
  const g = h.assetChangeBps / 10_000
  return Math.max(0, Math.round(h.assetValueMinor * (1 + g) ** (year - h.startYear)))
}

/** Một khoản tiền mặt phải bỏ ra vì việc mua tài sản, trong đúng năm `year`. */
export interface HomeCashOut {
  /** Trả trước — chỉ ở năm mua. */
  downMinor: number
  /** Tiền trả nợ của năm này. 0 khi không vay hoặc đã trả xong. */
  loanMinor: number
}

/**
 * Tiền mặt ra vì mua/giữ tài sản trong năm `year` — CHƯA gồm chi phí giữ hằng năm
 * (`amountMinor` của mốc lo phần đó, qua bốn hình dạng của 0066).
 *
 * Tách làm hai dòng chứ không cộng thành một: tooltip của đồ thị liệt kê từng khoản, và
 * "trả trước ¥8.000.000" với "trả nợ ¥1.900.000/năm" là hai câu khác nhau — gộp lại
 * thành một con số ở năm mua thì người dùng không biết vì sao năm đó tụt sâu thế.
 */
export function homeCashOutInYear(h: HomeAsset, year: number): HomeCashOut {
  if (!hasAsset(h) || year < h.startYear) return { downMinor: 0, loanMinor: 0 }
  const P = loanOf(h)
  const down = year === h.startYear ? h.assetValueMinor - P : 0
  const dangTra = P > 0 && year - h.startYear < h.loanYears
  return { downMinor: down, loanMinor: dangTra ? yearlyLoanPayment(h) : 0 }
}
