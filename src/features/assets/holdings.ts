// Danh mục cổ phiếu dựng từ sổ lệnh — thuần, không phụ thuộc React, để unit-test được.
//
// Số dư sổ của tài khoản đầu tư (view account_balances) là VỐN GỐC RÒNG: tiền nạp − rút.
// Sổ lệnh (stock_trades) KHÔNG đụng số dư đó — nó chỉ nói tiền đã biến thành cổ phiếu
// nào. Nên giá trị thị trường = cổ phiếu theo giá hôm nay + tiền chưa kịp mua gì.
//
// Mọi số ở minor units VND. VND có decimals = 0 nên minor unit CHÍNH LÀ đồng, và giá là
// đồng/cổ — không nhân chia gì thêm.

export interface Trade {
  symbol: string
  kind: 'buy' | 'sell' | 'adjust'
  /** ISO date. Quyết định thứ tự cộng dồn — giá vốn bình quân phụ thuộc trình tự. */
  tradedOn: string
  /** số cổ; âm chỉ hợp lệ với kind='adjust' (gộp cổ phiếu) */
  quantity: number
  /** đồng/cổ; luôn 0 với kind='adjust' */
  price: number
  fee: number
  tax: number
}

export interface Holding {
  symbol: string
  /** số cổ đang giữ (luôn > 0 — mã bán sạch không xuất hiện) */
  quantity: number
  /** đồng, đã gồm phí mua */
  costBasis: number
  /** đồng/cổ */
  avgCost: number
}

export interface HoldingsResult {
  /** chỉ mã còn giữ, sắp theo giá vốn giảm dần */
  holdings: Holding[]
  /** lãi/lỗ đã hiện thực hoá từ các lệnh bán (đồng; có thể âm) */
  realizedPnl: number
  /** mã bị bán quá số đang giữ → sổ lệnh có lỗ hổng */
  oversold: string[]
}

export interface PortfolioValue {
  /** null = không đáng tin; xem `portfolioValue` */
  marketValue: number | null
  /** cổ phiếu theo giá hôm nay; mã thiếu giá tạm tính theo giá vốn */
  stockValue: number
  cash: number
  /** mã chưa có giá, đang tạm tính theo giá vốn */
  missingPrices: string[]
}

/**
 * Cộng dồn sổ lệnh ra số cổ và giá vốn từng mã.
 *
 * Bán trừ theo **giá vốn bình quân**, không FIFO — đúng cách công ty chứng khoán Việt
 * Nam tính, nên số trong app khớp sao kê của người dùng.
 */
export function holdingsFromTrades(trades: Trade[]): HoldingsResult {
  const acc = new Map<string, { quantity: number; costBasis: number }>()
  const oversold = new Set<string>()
  let realizedPnl = 0

  // Sort ổn định của JS giữ nguyên thứ tự nhập với các lệnh cùng ngày.
  const inOrder = trades.slice().sort((a, b) => a.tradedOn.localeCompare(b.tradedOn))

  for (const t of inOrder) {
    const h = acc.get(t.symbol) ?? { quantity: 0, costBasis: 0 }

    if (t.kind === 'buy') {
      h.quantity += t.quantity
      h.costBasis += t.quantity * t.price + t.fee
    } else if (t.kind === 'sell') {
      const avg = h.quantity > 0 ? h.costBasis / h.quantity : 0
      if (t.quantity > h.quantity) oversold.add(t.symbol)
      // Kẹp về số thực đang giữ: bán quá tay thì `oversold` đã báo, không cần thêm
      // một con số lãi khổng lồ vô nghĩa nữa.
      const sold = Math.min(t.quantity, h.quantity)
      realizedPnl += sold * t.price - t.fee - t.tax - sold * avg
      h.quantity -= sold
      h.costBasis -= sold * avg
      // Bán sạch thì xoá phần dư do chia lẻ — thiếu dòng này, mã đã bán hết vẫn còn
      // vài đồng giá vốn lơ lửng và lần mua sau sẽ tính bình quân sai.
      if (h.quantity === 0) h.costBasis = 0
    } else {
      // Cổ phiếu thưởng / cổ tức bằng cổ phiếu / chia tách: số cổ đổi, giá vốn KHÔNG
      // đổi → bình quân tự giảm. Đó đúng là bản chất của việc được thưởng.
      h.quantity += t.quantity
      if (h.quantity < 0) {
        oversold.add(t.symbol)
        h.quantity = 0
        h.costBasis = 0
      }
    }

    acc.set(t.symbol, h)
  }

  const holdings: Holding[] = [...acc.entries()]
    .filter(([, h]) => h.quantity > 0)
    .map(([symbol, h]) => ({
      symbol,
      quantity: h.quantity,
      costBasis: Math.round(h.costBasis),
      avgCost: Math.round(h.costBasis / h.quantity),
    }))
    .sort((a, b) => b.costBasis - a.costBasis || a.symbol.localeCompare(b.symbol))

  return {
    holdings,
    realizedPnl: Math.round(realizedPnl),
    oversold: [...oversold].sort(),
  }
}

/**
 * Tiền còn nằm ở công ty chứng khoán, chưa mua gì.
 *
 * `accountBalance` là số dư sổ (nạp − rút, đã gồm cổ tức tiền nếu người dùng ghi là
 * thu nhập). Trừ tiền đã bỏ ra mua, cộng lại tiền thu về khi bán.
 *
 * Trả số âm khi người dùng ghi lệnh mua mà quên ghi lần nạp tiền. **Không kẹp về 0**:
 * con số âm là dấu hiệu duy nhất cho biết sổ lệnh có lỗ hổng, kẹp đi là che mất nó.
 */
export function brokerCash(accountBalance: number, trades: Trade[]): number {
  let spent = 0
  for (const t of trades) {
    if (t.kind === 'buy') spent += t.quantity * t.price + t.fee
    else if (t.kind === 'sell') spent -= t.quantity * t.price - t.fee - t.tax
  }
  return Math.round(accountBalance - spent)
}

/**
 * Giá trị thị trường của cả tài khoản = cổ phiếu theo giá hôm nay + tiền chưa đầu tư.
 *
 * `marketValue` trả `null` ở đúng hai trường hợp, và cả hai đều nghĩa là "đừng ghi
 * con số này vào sổ":
 * - `cash < 0` — sổ lệnh thiếu lần nạp tiền, kết quả chắc chắn sai.
 * - thiếu giá **mọi** mã đang giữ — lúc đó tất cả rơi về giá vốn nên kết quả chỉ bằng
 *   đúng số dư sổ, không nói thêm được gì so với việc chưa có snapshot nào.
 *
 * Thiếu giá **một phần** thì vẫn trả số: mã thiếu tạm tính theo giá vốn và có tên trong
 * `missingPrices`. Cùng cách app xử lý thiếu tỷ giá (`hasMissingRate`) — ra số gần đúng
 * kèm cảnh báo, thay vì âm thầm bỏ mã đó khỏi tổng.
 */
export interface SessionPrices {
  /** Ngày phiên mới nhất trong bảng giá; null = bảng giá rỗng. */
  session: string | null
  /** đồng/cổ, chỉ mã có giá > 0 */
  priceBySymbol: Map<string, number>
  /** Mã mà giá còn ở phiên CŨ hơn `session` — sàn của nó chưa hút được lần này. */
  staleSymbols: Set<string>
}

/**
 * Gom bảng giá thô (ba sàn, hút độc lập) thành một phiên duy nhất cho cả snapshot.
 *
 * `stock_prices` là MỘT bảng chung cho cả ba sàn, và ba sàn được hút độc lập (một sàn
 * lỗi thì hai sàn còn lại vẫn ghi) — nên sau một lần chạy, không phải mọi hàng chắc
 * chắn cùng `trading_date`. `session` lấy ngày lớn nhất coi như ngày của snapshot;
 * mã nào còn kẹt ở ngày cũ hơn thì được nêu tên trong `staleSymbols` để nơi gọi tự
 * quyết định bỏ qua — im lặng dùng giá hôm qua rồi đóng dấu "hôm nay" là nói dối.
 */
export function sessionPrices(
  rows: { symbol: string; price: number; trading_date: string }[],
): SessionPrices {
  const session = rows.map((r) => r.trading_date).sort().at(-1) ?? null

  const priceBySymbol = new Map<string, number>()
  const staleSymbols = new Set<string>()

  for (const r of rows) {
    if (r.price > 0) priceBySymbol.set(r.symbol, r.price)
    if (session !== null && r.trading_date < session) staleSymbols.add(r.symbol)
  }

  return { session, priceBySymbol, staleSymbols }
}

/**
 * Tổng đáng tin của một danh mục cổ phiếu, hoặc `null` khi không đáng tin.
 *
 * Một chỗ DUY NHẤT giữ quy tắc này. `portfolioValue` (một tài khoản) và `buildPortfolio`
 * (gộp nhiều tài khoản) đều gọi vào đây — trước đó `buildPortfolio` chép lại đúng biểu
 * thức và tự ghi trong chú thích rằng nó "cùng hai điều kiện với portfolioValue", tức đã
 * biết mình là bản sao. Bản sao biết mình là bản sao vẫn là bản sao.
 *
 * Quỹ Nhật KHÔNG dùng hàm này: tài khoản quỹ không giữ tiền nhàn rỗi nên `fundValue` chỉ
 * có nhánh `allMissing`, không có nhánh `cash < 0`.
 */
export function reliableTotal(
  stockValue: number,
  cash: number,
  allMissing: boolean,
): number | null {
  return cash < 0 || allMissing ? null : stockValue + cash
}

export function portfolioValue(
  holdings: Holding[],
  priceBySymbol: Map<string, number>,
  cash: number,
): PortfolioValue {
  let stockValue = 0
  const missingPrices: string[] = []

  for (const h of holdings) {
    const price = priceBySymbol.get(h.symbol)
    if (price == null || price <= 0) {
      missingPrices.push(h.symbol)
      stockValue += h.costBasis
    } else {
      stockValue += h.quantity * price
    }
  }

  const allMissing = holdings.length > 0 && missingPrices.length === holdings.length
  const marketValue = reliableTotal(stockValue, cash, allMissing)

  return { marketValue, stockValue, cash, missingPrices }
}
