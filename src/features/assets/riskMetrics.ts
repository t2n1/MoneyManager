// Rủi ro danh mục: biến động, beta, Sharpe — thuần, test được.
//
// Ba con số này chỉ có nghĩa khi CÙNG một mốc thời gian và CÙNG một lịch phiên. Nên mọi
// phép ghép cặp lợi suất đi qua `pairedReturns`: ghép sai cặp ngày vẫn ra một con số trông
// rất thật, và không màn nào nói được là nó sai.
//
// Beta danh mục là TRUNG BÌNH GIA QUYỀN beta từng mã, không phải hồi quy lợi suất NAV lên
// chỉ số. Hai cách trả lời hai câu khác nhau:
//   · gia quyền  — "danh mục ĐANG GIỮ sẽ nhạy thế nào nếu thị trường động 10%" (câu của
//     một trang danh mục: nó nói về tương lai, không phụ thuộc mình đã mua bán lúc nào);
//   · hồi quy NAV — "danh mục ĐÃ nhạy thế nào", trộn cả nhịp mua bán và cả tiền mặt nằm
//     không. Đó là câu của một báo cáo hiệu quả, và khu Hiệu quả đã trả lời rồi.

/** Số phiên một năm của sàn Việt Nam — mốc quy ước để năm hoá độ lệch ngày. */
export const TRADING_DAYS_PER_YEAR = 252

/**
 * Lãi suất "không rủi ro" dùng cho Sharpe, %/năm.
 *
 * MỘT hằng số có tên, không phải một con số rải giữa công thức: nó là một LỰA CHỌN, không
 * phải sự thật. 4,5% quanh mức tiết kiệm 12 tháng của ngân hàng Việt Nam — ai thấy nên
 * dùng lợi suất trái phiếu chính phủ thì đổi ở đúng đây, và mọi chỗ đổi theo.
 */
export const RISK_FREE_ANNUAL_PCT = 4.5

export type RiskClass = 'low' | 'mid' | 'high'

/** Độ lệch chuẩn MẪU (n−1); null khi dưới hai điểm. */
export function stdev(xs: number[]): number | null {
  if (xs.length < 2) return null
  const tb = xs.reduce((s, x) => s + x, 0) / xs.length
  const ss = xs.reduce((s, x) => s + (x - tb) ** 2, 0)
  return Math.sqrt(ss / (xs.length - 1))
}

/** Biến động năm hoá, đơn vị %; null khi chuỗi quá ngắn. */
export function annualVolPct(returns: number[]): number | null {
  const sd = stdev(returns)
  return sd === null ? null : sd * Math.sqrt(TRADING_DAYS_PER_YEAR) * 100
}

/**
 * beta = hiệp phương sai(mã, thị trường) / phương sai(thị trường).
 *
 * null ở ba chỗ, và cả ba đều nghĩa là "chưa tính được", không phải "bằng 0":
 * hai chuỗi lệch độ dài (ghép sai cặp), dưới ba cặp, hoặc thị trường không dao động.
 */
export function betaOf(asset: number[], market: number[]): number | null {
  if (asset.length !== market.length || asset.length < 3) return null
  const n = asset.length
  const tbA = asset.reduce((s, x) => s + x, 0) / n
  const tbM = market.reduce((s, x) => s + x, 0) / n
  let cov = 0
  let varM = 0
  for (let i = 0; i < n; i++) {
    cov += (asset[i] - tbA) * (market[i] - tbM)
    varM += (market[i] - tbM) ** 2
  }
  if (varM === 0) return null
  return cov / varM
}

/** Ngưỡng lấy đúng của Simplize (in ngay trên trang họ) để hai bên so được với nhau. */
export function riskClassOf(volPct: number): RiskClass {
  if (volPct >= 20) return 'high'
  if (volPct > 10) return 'mid'
  return 'low'
}

export function sharpeOf(
  annualReturnPct: number | null,
  volPct: number | null,
  rfPct: number = RISK_FREE_ANNUAL_PCT,
): number | null {
  if (annualReturnPct === null || volPct === null || volPct <= 0) return null
  return (annualReturnPct - rfPct) / volPct
}

/**
 * Lợi suất của hai chuỗi giá, ghép theo ĐÚNG cặp phiên liền nhau mà CẢ HAI đều có bar.
 *
 * Phiên nào một bên thiếu bar (mã tạm ngừng giao dịch) thì nhảy qua, và cặp kế tiếp nối
 * từ phiên có thật gần nhất — thị trường cũng phải đo trên đúng khoảng đó. Nếu lấy lợi
 * suất mã trên khoảng 05→07 mà ghép với lợi suất chỉ số trên khoảng 06→07 thì beta ra một
 * con số không đo cái gì cả.
 */
export function pairedReturns(
  asset: Map<string, number>,
  market: Map<string, number>,
  sessions: string[],
): { asset: number[]; market: number[] } {
  const ra: number[] = []
  const rm: number[] = []
  let truoc: { a: number; m: number } | null = null

  for (const d of sessions) {
    const a = asset.get(d)
    const m = market.get(d)
    if (a == null || m == null || a <= 0 || m <= 0) continue
    if (truoc) {
      ra.push(a / truoc.a - 1)
      rm.push(m / truoc.m - 1)
    }
    truoc = { a, m }
  }
  return { asset: ra, market: rm }
}

export interface SymbolRisk {
  symbol: string
  /** tỷ trọng trong phần cổ phiếu, 0..1 */
  weight: number
  /** % năm hoá; null = chưa đủ lịch sử giá */
  volPct: number | null
  beta: number | null
  /** null khi chưa tính được biến động */
  cls: RiskClass | null
}

export interface PortfolioRisk {
  /** Sắp theo beta giảm dần; mã chưa tính được xuống cuối. */
  bySymbol: SymbolRisk[]
  /** Trung bình gia quyền beta các mã CÓ beta, đã chuẩn hoá theo tỷ trọng còn lại. */
  beta: number | null
  /** Biến động của chính danh mục, % năm hoá. */
  volPct: number | null
  sharpe: number | null
  /** Tỷ trọng theo ba mức, cộng lại = 1 trên phần ĐÃ phân loại được. */
  breakdown: Record<RiskClass, number>
  /** true = có mã chưa đủ dữ liệu, nên mọi con số trên chỉ tính trên phần còn lại. */
  partial: boolean
}

export function portfolioRisk(input: {
  positions: { symbol: string; weight: number }[]
  /** mã → { ngày → đồng/cổ } */
  prices: Map<string, Map<string, number>>
  /** ngày → điểm×100 */
  index: Map<string, number>
  /** Lịch phiên, tăng dần. */
  sessions: string[]
  /** % — lợi nhuận năm hoá của danh mục (lãi kép, từ `periodReturns`). */
  annualReturnPct: number | null
  /** Lợi suất NGÀY của danh mục (từ `twrSeries`) — để ra biến động của chính danh mục. */
  portfolioReturns: number[]
}): PortfolioRisk {
  const { positions, prices, index, sessions, annualReturnPct, portfolioReturns } = input

  const bySymbol: SymbolRisk[] = positions.map((p) => {
    const gia = prices.get(p.symbol)
    if (!gia) return { symbol: p.symbol, weight: p.weight, volPct: null, beta: null, cls: null }

    // Biến động đo trên lợi suất của RIÊNG mã (mọi phiên nó có bar), còn beta đo trên các
    // cặp ghép được với chỉ số — hai tập khác nhau, và cố ý: thiếu chỉ số thì vẫn phải
    // biết mã đó dao động bao nhiêu.
    const rieng = pairedReturns(gia, gia, sessions).asset
    const ghep = pairedReturns(gia, index, sessions)
    const volPct = annualVolPct(rieng)
    return {
      symbol: p.symbol,
      weight: p.weight,
      volPct,
      beta: betaOf(ghep.asset, ghep.market),
      cls: volPct === null ? null : riskClassOf(volPct),
    }
  })

  bySymbol.sort((a, b) => (b.beta ?? -Infinity) - (a.beta ?? -Infinity))

  const coBeta = bySymbol.filter((s) => s.beta !== null)
  const tongTrongBeta = coBeta.reduce((s, x) => s + x.weight, 0)
  const beta =
    tongTrongBeta > 0
      ? coBeta.reduce((s, x) => s + x.weight * (x.beta as number), 0) / tongTrongBeta
      : null

  const breakdown: Record<RiskClass, number> = { low: 0, mid: 0, high: 0 }
  const coLoai = bySymbol.filter((s) => s.cls !== null)
  const tongTrongLoai = coLoai.reduce((s, x) => s + x.weight, 0)
  if (tongTrongLoai > 0) {
    for (const s of coLoai) breakdown[s.cls as RiskClass] += s.weight / tongTrongLoai
  }

  const volPct = annualVolPct(portfolioReturns)

  return {
    bySymbol,
    beta,
    volPct,
    sharpe: sharpeOf(annualReturnPct, volPct),
    breakdown,
    partial: bySymbol.some((s) => s.beta === null || s.volPct === null),
  }
}
