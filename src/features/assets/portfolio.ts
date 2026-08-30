// Danh mục cổ phiếu GỘP nhiều tài khoản — thuần, test được.
//
// `holdings.ts` trả lời cho MỘT tài khoản ("tài khoản này đang giữ gì"). File này trả
// lời câu của cả người ("tôi đang giữ bao nhiêu VNM, nằm ở đâu, chiếm bao nhiêu phần
// danh mục") — câu mà trang chi tiết từng tài khoản không bao giờ trả lời được.
//
// CỘNG DỒN TỪNG TÀI KHOẢN RỒI MỚI GỘP, không đổ chung sổ lệnh vào một rổ. Nghe thì
// giống nhau nhưng ra hai kết quả khác hẳn: mua 100 VNM giá 50 ở tài khoản A, 100 VNM
// giá 70 ở B, rồi bán ở A giá 60. Tính riêng thì A lãi thật (60 > vốn 50 của A); đổ
// chung thì vốn bình quân thành 60 và lệnh đó hoà vốn. Số đúng là số của công ty
// chứng khoán, tức tính riêng từng tài khoản — và nhờ vậy tổng ở đây luôn bằng tổng
// các trang chi tiết cộng lại.

import { brokerCash, holdingsFromTrades, reliableTotal, type Trade } from './holdings'

/** Một tài khoản đầu tư kèm sổ lệnh của riêng nó. */
export interface AccountTrades {
  accountId: string
  accountName: string
  /** Số dư sổ (nạp − rút) — vốn gốc ròng, để tính tiền chưa mua gì. */
  balance: number
  trades: Trade[]
}

export interface PortfolioPosition {
  symbol: string
  quantity: number
  /** đồng, đã gồm phí mua */
  costBasis: number
  /** đồng/cổ */
  avgCost: number
  /** đồng/cổ theo phiên mới nhất; null = chưa có giá */
  price: number | null
  /** giá trị theo giá hôm nay; THIẾU GIÁ thì tạm tính bằng giá vốn */
  value: number
  /** value − costBasis */
  pnl: number
  /** null khi giá vốn ≤ 0 (không chia được) */
  pnlPercent: number | null
  /** value / tổng giá trị cổ phiếu; 0 khi tổng bằng 0 */
  weight: number
  /** Tài khoản đang giữ mã này, theo tên — một mã có thể nằm ở nhiều nơi. */
  accountNames: string[]
}

export interface Portfolio {
  /** Chỉ mã còn giữ, sắp theo giá trị giảm dần. */
  positions: PortfolioPosition[]
  /** Tổng giá vốn cổ phiếu đang giữ. */
  stockCost: number
  /** Tổng giá trị cổ phiếu (mã thiếu giá tạm tính theo giá vốn). */
  stockValue: number
  /** stockValue − stockCost */
  unrealizedPnl: number
  /** null khi stockCost ≤ 0 */
  unrealizedPercent: number | null
  /** Lãi/lỗ ĐÃ hiện thực hoá, cộng từ từng tài khoản. */
  realizedPnl: number
  /** Tiền còn ở công ty chứng khoán, chưa mua gì. Âm = sổ lệnh thiếu lần nạp. */
  cash: number
  /**
   * Số dư của tài khoản ví đã khai (`accounts.cash_account_id`, migration 0054);
   * null = chưa khai ví.
   *
   * CỐ Ý đứng ngoài `marketValue`: `marketValue` là con số mà dòng tài khoản ở tab Tài
   * sản và `account_valuations` dùng, mà tài khoản ví đã tự đứng thành một dòng ở đó
   * rồi — cộng vào là đếm ngân hàng hai lần. Chỉ tab Cổ phiếu VN cộng nó vào, và đó là
   * một câu hỏi khác: "tiền cổ phiếu VN của tôi đang là bao nhiêu".
   */
  walletCash: number | null
  /**
   * stockValue + cash. null khi KHÔNG ĐÁNG TIN — cùng hai điều kiện với
   * `portfolioValue` của một tài khoản: tiền mặt âm (sổ lệnh có lỗ hổng), hoặc
   * thiếu giá mọi mã (lúc đó con số chỉ bằng vốn gốc, không nói thêm được gì).
   */
  marketValue: number | null
  /** Mã đang giữ mà chưa có giá — đang tạm tính theo giá vốn. */
  missingPrices: string[]
  /** Mã bị bán quá số đang giữ ở ít nhất một tài khoản → sổ lệnh có lỗ hổng. */
  oversold: string[]
}

export function buildPortfolio(
  accounts: AccountTrades[],
  priceBySymbol: Map<string, number>,
  walletCash: number | null = null,
): Portfolio {
  // symbol → tổng số cổ + tổng giá vốn, cộng từ kết quả RIÊNG của từng tài khoản
  const merged = new Map<string, { quantity: number; costBasis: number; accounts: string[] }>()
  const oversold = new Set<string>()
  let realizedPnl = 0
  let cash = 0

  for (const acc of accounts) {
    const r = holdingsFromTrades(acc.trades)
    realizedPnl += r.realizedPnl
    for (const s of r.oversold) oversold.add(s)
    cash += brokerCash(acc.balance, acc.trades)

    for (const h of r.holdings) {
      const cur = merged.get(h.symbol) ?? { quantity: 0, costBasis: 0, accounts: [] }
      cur.quantity += h.quantity
      cur.costBasis += h.costBasis
      cur.accounts.push(acc.accountName)
      merged.set(h.symbol, cur)
    }
  }

  // Hai vòng: tỷ trọng cần TỔNG, mà tổng chỉ biết sau khi đã định giá hết mọi mã.
  const priced = [...merged.entries()].map(([symbol, m]) => {
    const raw = priceBySymbol.get(symbol)
    const price = raw != null && raw > 0 ? raw : null
    const value = price === null ? m.costBasis : m.quantity * price
    return { symbol, ...m, price, value }
  })

  const stockValue = priced.reduce((s, p) => s + p.value, 0)
  const stockCost = priced.reduce((s, p) => s + p.costBasis, 0)

  const positions: PortfolioPosition[] = priced
    .map((p) => ({
      symbol: p.symbol,
      quantity: p.quantity,
      costBasis: p.costBasis,
      avgCost: Math.round(p.costBasis / p.quantity),
      price: p.price,
      value: p.value,
      pnl: p.value - p.costBasis,
      pnlPercent: p.costBasis > 0 ? (p.value - p.costBasis) / p.costBasis : null,
      weight: stockValue > 0 ? p.value / stockValue : 0,
      accountNames: p.accounts,
    }))
    .sort((a, b) => b.value - a.value || a.symbol.localeCompare(b.symbol))

  const missingPrices = positions.filter((p) => p.price === null).map((p) => p.symbol)
  const allMissing = positions.length > 0 && missingPrices.length === positions.length

  return {
    positions,
    stockCost,
    stockValue,
    unrealizedPnl: stockValue - stockCost,
    unrealizedPercent: stockCost > 0 ? (stockValue - stockCost) / stockCost : null,
    realizedPnl,
    cash,
    walletCash,
    marketValue: reliableTotal(stockValue, cash, allMissing),
    missingPrices,
    oversold: [...oversold].sort(),
  }
}
