// "Vốn đã bỏ vào" và "giá trị nay" của danh mục — thuần, không React.
//
// Tách ra vì bản vẽ 2b đưa vốn gốc lên Ô KPI đầu trang, trong khi trước đó nó chỉ tồn
// tại bên trong `InvestmentPerformanceSection`. Hai chỗ tự cộng lấy là hai định nghĩa
// của "vốn": ô KPI và thanh tỷ trọng ngay dưới nó sẽ lệch nhau mà không ai thấy vì
// chúng in ở hai chỗ khác nhau trên màn.
//
// Định nghĩa (giữ nguyên của bản trước, không đổi): vốn gốc = SỐ DƯ SỔ (nạp − rút, gồm
// cả số dư mở tài khoản), cùng mốc mà `assetBreakdown` dùng để ra "lãi đầu tư (gồm đã
// bán)". Chọn nó thì hiệu `giá trị − vốn` bằng đúng con số lãi đang hiện ở dải KPI —
// biểu đồ và ô KPI tự đối chiếu được với nhau.
import type { CurrencyCode } from '../../lib/money'
import { convertToBase, type Rates } from '../../lib/rates'
import type { AssetAccount } from './aggregate'

export interface InvestCapital {
  /** base minor — tiền đã bỏ vào theo sổ. */
  costBasis: number
  /** base minor — giá trị thị trường hiện tại. */
  currentValue: number
  /** currentValue − costBasis. */
  growth: number
  /** growth / costBasis; null khi chưa bỏ vào đồng nào (phần trăm vô nghĩa). */
  growthPct: number | null
  /** Có tài khoản bị loại khỏi tổng vì thiếu tỷ giá. */
  hasMissingRate: boolean
}

export function investCapital(
  accounts: AssetAccount[],
  base: CurrencyCode,
  rates: Rates,
): InvestCapital {
  let costBasis = 0
  let currentValue = 0
  let hasMissingRate = false
  for (const a of accounts) {
    const c = convertToBase(a.balance, a.currency, base, rates)
    if (c === null) hasMissingRate = true
    else costBasis += c
    if (a.baseValue == null) hasMissingRate = true
    else currentValue += a.baseValue
  }
  const growth = currentValue - costBasis
  return {
    costBasis,
    currentValue,
    growth,
    growthPct: costBasis > 0 ? growth / costBasis : null,
    hasMissingRate,
  }
}
