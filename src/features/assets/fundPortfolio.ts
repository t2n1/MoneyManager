// Danh mục quỹ Nhật GỘP nhiều tài khoản — thuần, test được.
//
// `fundHoldings.ts` trả lời cho MỘT tài khoản ("tài khoản này đang giữ gì"). File này trả
// lời câu của cả người ("tôi giữ tổng bao nhiêu 口 quỹ này, nằm ở đâu, chiếm bao nhiêu
// phần danh mục") — câu mà trang chi tiết từng tài khoản không bao giờ trả lời được.
//
// Song sinh với `portfolio.ts` (cổ phiếu Việt Nam) và giữ đúng hai bất biến của nó:
//
//  ① CỘNG DỒN TỪNG TÀI KHOẢN RỒI MỚI GỘP, không đổ chung sổ lệnh vào một rổ. Giá vốn bình
//    quân là số của TỪNG công ty chứng khoán; đổ chung ra một con số không khớp app nào.
//  ② LÀM TRÒN TỪNG DÒNG RỒI MỚI CỘNG (xem `fundLineValue`). Cộng 口数 hai tài khoản rồi
//    mới chia 10.000 một lần sẽ lệch tổng của hai trang chi tiết đúng 1 ¥ — và bất biến
//    "tổng ở tab = tổng các trang cộng lại" là thứ giữ cho hai màn không đá nhau.
//
// Khác `portfolio.ts` đúng một chỗ: KHÔNG có `cash`. Rakuten tự quét sạch tiền dư về
// 楽天銀行 nên tài khoản quỹ không giữ tiền nhàn rỗi (xem fundHoldings.ts, lý do 3).

import { avgNavOf, fundHoldingsFromTrades, fundLineValue, type FundTrade } from './fundHoldings'

/** Một tài khoản đầu tư quỹ kèm sổ lệnh của riêng nó. */
export interface FundAccountTrades {
  accountId: string
  accountName: string
  trades: FundTrade[]
}

export interface FundPortfolioPosition {
  assocFundCd: string
  /** 口数 đang giữ, cộng từ mọi tài khoản */
  units: number
  /** yên, đã gồm mọi khoản đã bỏ ra */
  costBasis: number
  /** ¥/10.000口 — 取得単価 của dòng đã gộp */
  avgNav: number
  /** ¥/10.000口 theo phiên mới nhất; null = chưa có giá */
  nav: number | null
  /** giá trị theo giá hôm nay; THIẾU GIÁ thì tạm tính bằng giá vốn */
  value: number
  /** value − costBasis */
  pnl: number
  /** null khi giá vốn ≤ 0 (không chia được) */
  pnlPercent: number | null
  /** value / tổng giá trị quỹ; 0 khi tổng bằng 0 */
  weight: number
  /** Tài khoản đang giữ quỹ này, theo tên — một quỹ có thể nằm ở nhiều nơi. */
  accountNames: string[]
}

export interface FundPortfolio {
  /** Chỉ quỹ còn giữ, sắp theo giá trị giảm dần. */
  positions: FundPortfolioPosition[]
  /** Tổng giá vốn quỹ đang giữ. */
  fundCost: number
  /** Tổng giá trị quỹ (quỹ thiếu giá tạm tính theo giá vốn). */
  fundValue: number
  /** fundValue − fundCost */
  unrealizedPnl: number
  /** null khi fundCost ≤ 0 */
  unrealizedPercent: number | null
  /** Lãi/lỗ ĐÃ hiện thực hoá, cộng từ từng tài khoản. */
  realizedPnl: number
  /**
   * Bằng `fundValue`, trừ khi thiếu giá MỌI quỹ đang giữ — lúc đó null, vì con số chỉ
   * bằng đúng giá vốn nên không nói thêm được gì. Cùng quy tắc `fundValue()` của một tài
   * khoản. Không có nhánh "tiền âm" như bên cổ phiếu: tài khoản quỹ không giữ tiền.
   */
  marketValue: number | null
  /** Quỹ đang giữ mà chưa có giá — đang tạm tính theo giá vốn. */
  missingNavs: string[]
  /** Quỹ bị bán quá số đang giữ ở ít nhất một tài khoản → sổ lệnh có lỗ hổng. */
  oversold: string[]
}

export function buildFundPortfolio(
  accounts: FundAccountTrades[],
  navByFund: Map<string, number>,
): FundPortfolio {
  const merged = new Map<
    string,
    { units: number; costBasis: number; value: number; accounts: string[] }
  >()
  const oversold = new Set<string>()
  let realizedPnl = 0

  const giaCuaQuy = (assocFundCd: string): number | null => {
    const nav = navByFund.get(assocFundCd)
    return nav != null && nav > 0 ? nav : null
  }

  for (const acc of accounts) {
    const r = fundHoldingsFromTrades(acc.trades)
    realizedPnl += r.realizedPnl
    for (const m of r.oversold) oversold.add(m)

    for (const h of r.holdings) {
      const nav = giaCuaQuy(h.assocFundCd)
      // Bất biến ② — làm tròn Ở ĐÂY, theo từng cặp (tài khoản, quỹ).
      const value = nav === null ? h.costBasis : fundLineValue(h.units, nav)
      const cur = merged.get(h.assocFundCd) ?? {
        units: 0,
        costBasis: 0,
        value: 0,
        accounts: [],
      }
      cur.units += h.units
      cur.costBasis += h.costBasis
      cur.value += value
      cur.accounts.push(acc.accountName)
      merged.set(h.assocFundCd, cur)
    }
  }

  const fundCost = [...merged.values()].reduce((s, m) => s + m.costBasis, 0)
  const fundValue = [...merged.values()].reduce((s, m) => s + m.value, 0)

  const positions: FundPortfolioPosition[] = [...merged.entries()]
    .map(([assocFundCd, m]) => ({
      assocFundCd,
      units: m.units,
      costBasis: m.costBasis,
      avgNav: avgNavOf(m.costBasis, m.units),
      nav: giaCuaQuy(assocFundCd),
      value: m.value,
      pnl: m.value - m.costBasis,
      pnlPercent: m.costBasis > 0 ? (m.value - m.costBasis) / m.costBasis : null,
      weight: fundValue > 0 ? m.value / fundValue : 0,
      accountNames: m.accounts,
    }))
    .sort((a, b) => b.value - a.value || a.assocFundCd.localeCompare(b.assocFundCd))

  const missingNavs = positions.filter((p) => p.nav === null).map((p) => p.assocFundCd)
  const allMissing = positions.length > 0 && missingNavs.length === positions.length

  return {
    positions,
    fundCost,
    fundValue,
    unrealizedPnl: fundValue - fundCost,
    unrealizedPercent: fundCost > 0 ? (fundValue - fundCost) / fundCost : null,
    realizedPnl,
    marketValue: allMissing ? null : fundValue,
    missingNavs,
    oversold: [...oversold].sort(),
  }
}
