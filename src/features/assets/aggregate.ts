// Tổng hợp tài sản theo nhóm — thuần, không phụ thuộc React, để unit-test được.
// Mọi số dư quy đổi về base currency qua convertToBase; thiếu tỷ giá → hasMissingRate.

// Nhập từ module lá lib/currencies (KHÔNG phải lib/money): cardFunding() ở file này
// được bộ luật thông báo gọi, mà money.ts kéo theo lib/privacy.ts (React + localStorage).
import { CURRENCIES, type CurrencyCode } from '../../lib/currencies'
import { convertToBase, type Rates } from '../../lib/rates'
import type { AccountBalanceRow, AccountType } from '../../types/database.types'
import { depreciate } from './depreciation'

/** Nhãn hiển thị cho tài khoản chưa gán nhóm. */
export const UNGROUPED_LABEL = 'Chưa phân nhóm'

/** Nhãn tiếng Việt cho từng loại tài khoản (chế độ xem "Theo loại"). */
export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  cash: 'Tiền mặt',
  bank: 'Ngân hàng',
  card: 'Thẻ tín dụng',
  ic: 'IC giao thông',
  ewallet: 'Ví điện tử',
  investment: 'Đầu tư',
  fixed: 'Tài sản cố định',
}

/** Cài đặt riêng của một nhóm (từ bảng asset_group_settings). */
export interface AssetGroupSetting {
  name: string
  sortOrder: number
  includeInTotals: boolean
  hidden: boolean
}

export interface AssetAccount {
  id: string
  name: string
  type: AccountBalanceRow['type']
  currency: CurrencyCode
  /** minor units gốc — số dư sổ (với đầu tư = vốn gốc ròng: nạp − rút) */
  balance: number
  /** Đầu tư/tài sản cố định: giá trị hiện hành (snapshot nhập tay, hoặc giá sau khấu hao); null = dùng số dư sổ */
  marketValue: number | null
  /** Tài sản cố định: khấu hao lũy kế quy đổi base (≥ 0); null = không khấu hao */
  depreciatedBase: number | null
  /** minor units gốc dùng để hiển thị & cộng tổng = marketValue ?? balance */
  value: number
  /** minor units quy đổi base của `value`; null = thiếu tỷ giá */
  baseValue: number | null
  /**
   * Đầu tư: TỔNG lời/lỗ quy đổi base = base(marketValue) − base(balance).
   *
   * Tên cũ là `unrealizedPnlBase` và sai: tiền bán đã về tài khoản nên nằm trong
   * `marketValue`, tức hiệu này bằng `unrealizedPnl + realizedPnl`. Chứng minh bằng
   * `brokerCash`/`portfolioValue` của holdings.ts — xem quyết định 7 của spec
   * docs/superpowers/specs/2026-08-13-gop-trang-dau-tu-design.md.
   *
   * KHÔNG đổi tên `unrealizedPnl` ở portfolio.ts hay investment.ts: hai chỗ đó tính
   * `stockValue − stockCost`, đúng nghĩa chưa thực hiện.
   */
  totalPnlBase: number | null
  /** false = không cộng vào tổng (cấp tài khoản) */
  includeInTotals: boolean
  /** true = ẩn khỏi trang Tài sản (cấp tài khoản) */
  hidden: boolean
  /** Thứ tự tùy chỉnh (accounts.sort_order) — dùng để sắp tài khoản trong nhóm. */
  sortOrder: number
}

export interface AssetGroup {
  name: string
  /** minor units base (chỉ cộng tài khoản không ẩn & tính-vào-tổng; bỏ qua thiếu tỷ giá) */
  total: number
  /** tỷ trọng trên tổng tài sản đã tính (0..1); nhóm không tính vào tổng = 0 */
  share: number
  accounts: AssetAccount[]
  /** nhóm có tài khoản thiếu tỷ giá → total chỉ là một phần */
  hasMissingRate: boolean
  /**
   * minor units base — MỌI tài khoản không ẩn, kể cả tài khoản không tính vào tổng.
   *
   * `total` bỏ qua tài khoản `include_in_totals = false`, nên một nhóm mà cả nhóm đứng
   * ngoài tổng có `total = 0` trong khi trong nó vẫn có tiền thật. In `total` ở đầu
   * nhóm đó là in "¥0" ngay cạnh những dòng đang nói mấy trăm triệu — hai câu trái
   * nhau trên cùng một khối. `rawTotal` là con số để in thay.
   */
  rawTotal: number
  /** `rawTotal` bằng TIỀN GỐC, chỉ khi mọi tài khoản không ẩn dùng chung một đồng tiền. */
  nativeTotal: number | null
  /** Đồng tiền của `nativeTotal`; null = nhóm có nhiều loại tiền, phải quy đổi mới cộng được. */
  nativeCurrency: CurrencyCode | null
  /**
   * Tổng theo TỪNG loại tiền của mọi tài khoản còn hiện, sắp giảm dần theo giá trị tuyệt đối.
   *
   * Vì sao cần dù đã có `nativeTotal`: `nativeTotal` chỉ có khi nhóm dùng ĐÚNG MỘT loại
   * tiền, còn nhóm hai loại tiền thì trước đây rơi về `rawTotal` (đã quy đổi) — và
   * `rawTotal` coi tài khoản thiếu tỷ giá là 0. Kết quả đo được: một nhóm VND đứng ngoài
   * tổng in "¥0" ngay cạnh delta "+199.554.545 ₫". Một dòng vừa nói 0 vừa nói +199 triệu
   * là hai câu trái nhau.
   */
  nativeTotals: { currency: CurrencyCode; amount: number }[]
  /** `rawTotal` đang THIẾU vì ít nhất một tài khoản chưa quy đổi được. */
  rawHasMissingRate: boolean
  /** false = không cộng vào Tổng tài sản (vẫn hiển thị riêng) */
  includeInTotals: boolean
  /** true = ẩn hẳn khỏi trang Tài sản */
  hidden: boolean
}

/**
 * Thẻ tín dụng (accounts.type='card'). Là công nợ, KHÔNG thuộc nhóm tài sản:
 * số dư thường âm = đang nợ. Không cộng vào Tổng tài sản (gộp); được trừ trong
 * Tài sản ròng cùng nhóm với nợ/cho vay.
 */
export interface CardLiability {
  id: string
  name: string
  currency: CurrencyCode
  /** minor units gốc; âm = đang nợ, 0 = không nợ */
  balance: number
  /** minor units quy đổi base; null = thiếu tỷ giá */
  baseValue: number | null
  /** hạn mức minor units theo currency gốc; null = không đặt */
  creditLimit: number | null
  /** ngày đến hạn trả hằng tháng (1..31); null = chưa đặt */
  paymentDueDay: number | null
  /** ngày chốt sao kê hằng tháng; null = chưa đặt → không chia được kỳ */
  statementDay: number | null
  /** tài khoản nguồn tự trả thẻ; null = không tự trả */
  paymentAccountId: string | null
  /** false = không trừ vào Tài sản ròng (vẫn hiển thị riêng) */
  includeInTotals: boolean
  /** true = ẩn khỏi trang Tài sản */
  hidden: boolean
}

export interface AssetBreakdown {
  /** Đã bao gồm cả nhóm bị ẩn (hidden=true) — nơi hiển thị tự lọc. */
  groups: AssetGroup[]
  /** tổng tài sản quy đổi base — chỉ cộng nhóm includeInTotals && !hidden */
  total: number
  /** có tài khoản (thuộc nhóm được tính) khác base currency → tổng xấp xỉ */
  hasForeign: boolean
  /** thiếu tỷ giá cho ít nhất một tài khoản được tính → tổng có thể thiếu */
  hasMissingRate: boolean
  /** Thẻ tín dụng (chưa lưu trữ). Nơi hiển thị tự lọc ẩn. */
  cards: CardLiability[]
  /** tổng số dư thẻ quy đổi base (≤ 0 nếu đang nợ); chỉ cộng card !hidden && includeInTotals & có tỷ giá */
  cardDebt: number
  /** có thẻ (được tính) thiếu tỷ giá → cardDebt có thể thiếu */
  cardHasMissingRate: boolean
  /** tổng khấu hao lũy kế của tài sản cố định (base, ≥ 0) */
  depreciationTotal: number
  /** tổng lãi/lỗ đầu tư quy đổi base, GỒM CẢ phần đã bán (không chỉ chưa thực hiện — xem totalPnlBase); chỉ cộng tài khoản đầu tư được tính, có snapshot & đủ tỷ giá */
  totalPnl: number
  /** có tài khoản đầu tư (được tính) có snapshot nhưng thiếu tỷ giá → totalPnl có thể thiếu */
  pnlHasMissingRate: boolean
}

/**
 * Gom số dư tài khoản theo nhóm tài sản (asset_group), đã quy đổi về base.
 * Tài khoản đã lưu trữ (is_archived) bị bỏ qua.
 *
 * Cài đặt nhóm (settings) quyết định:
 * - thứ tự (sortOrder; nhóm chưa có cài đặt xếp sau, tiebreak theo total giảm dần)
 * - includeInTotals: nhóm không cộng vào `total`
 * - hidden: nhóm bị ẩn (vẫn trả về, không cộng vào tổng)
 * Nhóm "Chưa phân nhóm" (nếu có) luôn xếp cuối.
 */
export function assetBreakdown(
  balances: AccountBalanceRow[],
  base: CurrencyCode,
  rates: Rates,
  settings: AssetGroupSetting[] = [],
  /** Hôm nay (ISO) để tính khấu hao tài sản cố định; bỏ trống = không khấu hao. */
  todayISO?: string,
): AssetBreakdown {
  const settingOf = new Map(settings.map((s) => [s.name, s]))
  const groups = new Map<string, AssetAccount[]>()
  const cards: CardLiability[] = []
  let total = 0
  let hasForeign = false
  let hasMissingRate = false
  let cardDebt = 0
  let cardHasMissingRate = false
  let totalPnl = 0
  let pnlHasMissingRate = false
  let depreciationTotal = 0

  for (const b of balances) {
    if (b.is_archived) continue

    // Thẻ tín dụng: công nợ riêng, không lọt vào nhóm tài sản / Tổng tài sản.
    if (b.type === 'card') {
      const baseValue = convertToBase(b.balance, b.currency, base, rates)
      const hidden = b.is_hidden ?? false
      const includeInTotals = b.include_in_totals ?? true
      cards.push({
        id: b.id,
        name: b.name,
        currency: b.currency,
        balance: b.balance,
        baseValue,
        creditLimit: b.credit_limit ?? null,
        paymentDueDay: b.payment_due_day ?? null,
        statementDay: b.statement_day ?? null,
        paymentAccountId: b.payment_account_id ?? null,
        includeInTotals,
        hidden,
      })
      if (!hidden && includeInTotals) {
        if (baseValue === null) cardHasMissingRate = true
        else cardDebt += baseValue
      }
      continue
    }

    const key = b.asset_group?.trim() || UNGROUPED_LABEL
    const isInvestment = b.type === 'investment'
    const isFixed = b.type === 'fixed'
    // Định giá nhập tay (account_valuations) luôn thắng công thức — người dùng
    // biết chiếc xe của mình bán được bao nhiêu, app thì không.
    const snapshot = isInvestment || isFixed ? (b.market_value ?? null) : null
    // Tài sản cố định chưa có snapshot: rơi về khấu hao tuyến tính nếu đã cấu hình.
    const auto =
      isFixed && snapshot == null && todayISO
        ? depreciate({
            costBasis: b.cost_basis ?? b.balance,
            salvageValue: b.salvage_value ?? 0,
            months: b.depreciation_months ?? null,
            fromISO: b.depreciation_from ?? null,
            todayISO,
          })
        : null
    const marketValue = snapshot ?? auto?.currentValue ?? null
    const value = marketValue ?? b.balance
    const baseValue = convertToBase(value, b.currency, base, rates)
    // TỔNG lãi/lỗ (gồm đã bán) = base(giá thị trường) − base(vốn gốc). Chỉ cho ĐẦU TƯ:
    // tài sản cố định mất giá là chuyện đương nhiên, gộp chung sẽ làm méo con số lãi/lỗ.
    let totalPnlBase: number | null = null
    if (isInvestment && marketValue != null) {
      const baseCost = convertToBase(b.balance, b.currency, base, rates)
      totalPnlBase = baseValue != null && baseCost != null ? baseValue - baseCost : null
    }
    const depreciatedBase =
      auto != null ? convertToBase(auto.accumulated, b.currency, base, rates) : null
    const account: AssetAccount = {
      id: b.id,
      name: b.name,
      type: b.type,
      currency: b.currency,
      balance: b.balance,
      marketValue,
      depreciatedBase,
      value,
      baseValue,
      totalPnlBase,
      includeInTotals: b.include_in_totals ?? true,
      hidden: b.is_hidden ?? false,
      sortOrder: b.sort_order ?? 0,
    }
    const list = groups.get(key)
    if (list) list.push(account)
    else groups.set(key, [account])
  }

  const result: AssetGroup[] = [...groups.entries()].map(([name, accounts]) => {
    const setting = settingOf.get(name)
    const includeInTotals = setting?.includeInTotals ?? true
    const hidden = setting?.hidden ?? false
    const groupCounted = includeInTotals && !hidden
    // Tài khoản đóng góp vào total nhóm = không ẩn & tính-vào-tổng (cấp tài khoản)
    const countedAccounts = accounts.filter((a) => !a.hidden && a.includeInTotals)
    const groupTotal = countedAccounts.reduce((s, a) => s + (a.baseValue ?? 0), 0)
    // Tổng "thô": mọi tài khoản còn hiện, không lọc theo include_in_totals. Đây là con
    // số ĐẦU NHÓM cho nhóm đứng ngoài tổng — xem JSDoc rawTotal.
    const shownAccounts = accounts.filter((a) => !a.hidden)
    const rawTotal = shownAccounts.reduce((s, a) => s + (a.baseValue ?? 0), 0)
    // Một đồng tiền duy nhất → cộng thẳng số gốc, không qua tỷ giá (§G: "≈" chỉ dành cho
    // số đã quy đổi). Nhiều đồng tiền thì không có "số gốc" nào để in.
    const nativeCurrency =
      shownAccounts.length > 0 && shownAccounts.every((a) => a.currency === shownAccounts[0].currency)
        ? shownAccounts[0].currency
        : null
    const nativeTotal = nativeCurrency ? shownAccounts.reduce((s, a) => s + a.value, 0) : null
    // Tổng theo từng loại tiền — LUÔN dựng được, kể cả nhóm nhiều loại tiền hoặc thiếu tỷ giá.
    const byCurrency = new Map<CurrencyCode, number>()
    for (const a of shownAccounts) byCurrency.set(a.currency, (byCurrency.get(a.currency) ?? 0) + a.value)
    const nativeTotals = [...byCurrency.entries()]
      .map(([currency, amount]) => ({ currency, amount }))
      .sort((x, y) => Math.abs(y.amount) - Math.abs(x.amount))
    const rawHasMissingRate = shownAccounts.some((a) => a.baseValue === null)
    // Ưu tiên thứ tự tùy chỉnh (kéo–thả); hòa/chưa đặt → giá trị giảm dần.
    accounts.sort(
      (a, b) => a.sortOrder - b.sortOrder || (b.baseValue ?? 0) - (a.baseValue ?? 0),
    )

    if (groupCounted) {
      total += groupTotal
      if (countedAccounts.some((a) => a.currency !== base)) hasForeign = true
      if (countedAccounts.some((a) => a.baseValue === null)) hasMissingRate = true
      // Lãi/lỗ đầu tư: chỉ cộng tài khoản đầu tư đã có snapshot; thiếu tỷ giá → cảnh báo
      for (const a of countedAccounts) {
        if (a.depreciatedBase != null) depreciationTotal += a.depreciatedBase
        if (a.type !== 'investment' || a.marketValue == null) continue
        if (a.totalPnlBase == null) pnlHasMissingRate = true
        else totalPnl += a.totalPnlBase
      }
    }

    return {
      name,
      total: groupTotal,
      share: 0, // gán lại sau khi biết grand total
      accounts,
      hasMissingRate: countedAccounts.some((a) => a.baseValue === null),
      rawTotal,
      nativeTotal,
      nativeCurrency,
      nativeTotals,
      rawHasMissingRate,
      includeInTotals,
      hidden,
    }
  })

  // Tỷ trọng tính trên grand total, chỉ cho nhóm được cộng vào tổng
  for (const g of result) {
    const groupCounted = g.includeInTotals && !g.hidden
    g.share = groupCounted && total > 0 ? g.total / total : 0
  }

  const orderOf = (name: string) => settingOf.get(name)?.sortOrder ?? Number.MAX_SAFE_INTEGER
  result.sort((a, b) => {
    // "Chưa phân nhóm" luôn xuống cuối, dù giá trị/thứ tự thế nào
    if (a.name === UNGROUPED_LABEL) return 1
    if (b.name === UNGROUPED_LABEL) return -1
    const oa = orderOf(a.name)
    const ob = orderOf(b.name)
    if (oa !== ob) return oa - ob
    return b.total - a.total
  })

  cards.sort((a, b) => (a.baseValue ?? 0) - (b.baseValue ?? 0))

  return {
    groups: result,
    total,
    hasForeign,
    hasMissingRate,
    cards,
    cardDebt,
    cardHasMissingRate,
    depreciationTotal,
    totalPnl,
    pnlHasMissingRate,
  }
}

/** Tài khoản nguồn (tối thiểu) để đối chiếu tiền trả thẻ. */
export interface CardSourceLike {
  id: string
  name: string
  currency: CurrencyCode
  /** số dư minor units theo currency nguồn */
  balance: number
}

/** Đối chiếu đủ/thiếu cho MỘT thẻ (đã dành phần cho các thẻ trước cùng nguồn). */
export interface CardFundingItem {
  sourceId: string
  sourceName: string
  currency: CurrencyCode
  /** số dư nguồn hiện có (minor units) */
  sourceBalance: number
  /** dư nợ thẻ này (minor units; 0 nếu không nợ) */
  owed: number
  /** true = có ≥2 thẻ cùng rút từ nguồn này */
  shared: boolean
  /** đủ trả sau khi đã trừ phần các thẻ đứng trước cùng nguồn */
  enough: boolean
  /** còn thiếu bao nhiêu cho riêng thẻ này (0 nếu đủ) */
  shortfall: number
}

/** Tổng hợp theo nguồn — cho dòng "cần nạp thêm" khi nhiều thẻ trả chung nguồn. */
export interface CardSourceGroup {
  sourceId: string
  sourceName: string
  currency: CurrencyCode
  sourceBalance: number
  /** tổng dư nợ mọi thẻ trả từ nguồn này */
  totalOwed: number
  /** số thẻ trả từ nguồn này */
  cardCount: number
  /** số thẻ đang thực nợ (owed>0) */
  owingCount: number
  enough: boolean
  /** thiếu bao nhiêu để trả hết mọi thẻ (0 nếu đủ) */
  shortfall: number
}

export interface CardFundingResult {
  /** keyed theo card.id — chỉ gồm thẻ có nguồn hợp lệ (tồn tại & cùng currency) */
  byCard: Map<string, CardFundingItem>
  /** theo nguồn, giữ thứ tự xuất hiện của thẻ đầu tiên trỏ tới nguồn */
  groups: CardSourceGroup[]
}

/**
 * Đối chiếu tiền trả thẻ khi NHIỀU thẻ có thể rút chung MỘT tài khoản nguồn.
 * Số dư nguồn được phân bổ TUẦN TỰ theo thứ tự `cards` truyền vào: thẻ trước "ăn"
 * trước, thẻ sau chỉ đủ nếu còn dư. Nhờ vậy tổng thiếu của các thẻ đúng bằng thiếu
 * gộp của nguồn — hết cảnh mỗi thẻ đều báo "đủ" trong khi cộng lại thì thiếu.
 * Chỉ tính thẻ có paymentAccountId trỏ tới nguồn tồn tại & cùng currency với thẻ.
 */
export function cardFunding(
  cards: CardLiability[],
  sourceById: Map<string, CardSourceLike>,
  /**
   * Số thực sự bị rút ở kỳ tới, keyed theo card.id (từ `cardStatementSplit`).
   * Thiếu key nào thì thẻ đó rơi về toàn bộ dư nợ. Cần override vì "đủ trả" phải
   * đo theo số RÚT VÀO NGÀY ĐẾN HẠN, không phải nợ gộp cả phần chưa chốt — nếu
   * không, thẻ mới quẹt to trong kỳ hiện tại sẽ báo "thiếu" oan.
   */
  owedById?: Map<string, number>,
): CardFundingResult {
  const owedOf = (c: CardLiability) =>
    owedById?.get(c.id) ?? (c.balance < 0 ? -c.balance : 0)

  // Gom thẻ theo nguồn hợp lệ, giữ nguyên thứ tự truyền vào.
  const bySource = new Map<string, CardLiability[]>()
  for (const c of cards) {
    if (!c.paymentAccountId) continue
    const src = sourceById.get(c.paymentAccountId)
    if (!src || src.currency !== c.currency) continue
    const list = bySource.get(src.id)
    if (list) list.push(c)
    else bySource.set(src.id, [c])
  }

  const byCard = new Map<string, CardFundingItem>()
  const groups: CardSourceGroup[] = []

  for (const [sourceId, list] of bySource) {
    const src = sourceById.get(sourceId) as CardSourceLike
    const shared = list.length >= 2
    const totalOwed = list.reduce((s, c) => s + owedOf(c), 0)

    let remaining = src.balance
    for (const c of list) {
      const owed = owedOf(c)
      const avail = Math.max(remaining, 0)
      byCard.set(c.id, {
        sourceId,
        sourceName: src.name,
        currency: src.currency,
        sourceBalance: src.balance,
        owed,
        shared,
        enough: avail >= owed,
        shortfall: Math.max(0, owed - avail),
      })
      remaining -= owed
    }

    groups.push({
      sourceId,
      sourceName: src.name,
      currency: src.currency,
      sourceBalance: src.balance,
      totalOwed,
      cardCount: list.length,
      owingCount: list.filter((c) => owedOf(c) > 0).length,
      enough: src.balance >= totalOwed,
      shortfall: Math.max(0, totalOwed - src.balance),
    })
  }

  return { byCard, groups }
}

/**
 * Gom lại các tài khoản đang tính vào Tổng tài sản theo LOẠI tài khoản
 * (chế độ xem "Theo loại"): trả lời câu hỏi "tiền đang nằm ở đâu".
 *
 * Chỉ lấy đúng tập tài khoản đóng góp vào `breakdown.total` (nhóm & tài khoản
 * không ẩn, tính-vào-tổng), nên tổng các lát == Tổng tài sản. Thẻ tín dụng
 * (type='card') là công nợ, đã tách sang `breakdown.cards` nên không xuất hiện ở đây.
 *
 * Tái dùng shape AssetGroup để trang Tài sản hiển thị y hệt chế độ "Theo mục đích".
 */
export function assetTypeGroups(breakdown: AssetBreakdown): AssetGroup[] {
  const byType = new Map<AccountType, AssetAccount[]>()
  for (const g of breakdown.groups) {
    if (!g.includeInTotals || g.hidden) continue
    for (const a of g.accounts) {
      if (a.hidden || !a.includeInTotals) continue
      const list = byType.get(a.type)
      if (list) list.push(a)
      else byType.set(a.type, [a])
    }
  }

  const result: AssetGroup[] = [...byType.entries()].map(([type, accounts]) => {
    // Ưu tiên thứ tự tùy chỉnh (kéo–thả); hòa/chưa đặt → giá trị giảm dần.
    accounts.sort(
      (a, b) => a.sortOrder - b.sortOrder || (b.baseValue ?? 0) - (a.baseValue ?? 0),
    )
    const groupTotal = accounts.reduce((s, a) => s + (a.baseValue ?? 0), 0)
    return {
      name: ACCOUNT_TYPE_LABELS[type],
      total: groupTotal,
      share: breakdown.total > 0 ? groupTotal / breakdown.total : 0,
      accounts,
      hasMissingRate: accounts.some((a) => a.baseValue === null),
      // Lát này CHỈ gồm tài khoản đã được tính, nên tổng thô trùng tổng — và không có
      // "số gốc" nào: một loại tài khoản gom được nhiều đồng tiền.
      rawTotal: groupTotal,
      nativeTotal: null,
      nativeCurrency: null,
      nativeTotals: [],
      rawHasMissingRate: false,
      includeInTotals: true,
      hidden: false,
    }
  })

  result.sort((a, b) => b.total - a.total)
  return result
}

/**
 * Gom tài sản theo ĐỒNG TIỀN (chế độ xem "Tiền tệ"): trả lời "bao nhiêu phần tài
 * sản của mình đang nằm ở JPY, bao nhiêu ở VND". Với người Việt ở Nhật thì đây là
 * chỉ số rủi ro tỷ giá: gần 100% JPY nghĩa là kế hoạch về VN phụ thuộc hoàn toàn
 * vào tỷ giá lúc chuyển tiền.
 *
 * Cùng tập tài khoản với assetTypeGroups nên tổng các lát == Tổng tài sản.
 */
export function assetCurrencyGroups(breakdown: AssetBreakdown): AssetGroup[] {
  const byCurrency = new Map<CurrencyCode, AssetAccount[]>()
  for (const g of breakdown.groups) {
    if (!g.includeInTotals || g.hidden) continue
    for (const a of g.accounts) {
      if (a.hidden || !a.includeInTotals) continue
      const list = byCurrency.get(a.currency)
      if (list) list.push(a)
      else byCurrency.set(a.currency, [a])
    }
  }

  const result: AssetGroup[] = [...byCurrency.entries()].map(([currency, accounts]) => {
    accounts.sort((a, b) => a.sortOrder - b.sortOrder || (b.baseValue ?? 0) - (a.baseValue ?? 0))
    const groupTotal = accounts.reduce((s, a) => s + (a.baseValue ?? 0), 0)
    return {
      name: CURRENCIES[currency].label,
      total: groupTotal,
      share: breakdown.total > 0 ? groupTotal / breakdown.total : 0,
      // Lát cắt theo đồng tiền: cả lát chung một đồng tiền nên số gốc luôn có.
      rawTotal: groupTotal,
      nativeTotal: accounts.reduce((sum, a) => sum + a.value, 0),
      nativeCurrency: currency,
      nativeTotals: [{ currency, amount: accounts.reduce((sum, a) => sum + a.value, 0) }],
      rawHasMissingRate: false,
      accounts,
      hasMissingRate: accounts.some((a) => a.baseValue === null),
      includeInTotals: true,
      hidden: false,
    }
  })

  result.sort((a, b) => b.total - a.total)
  return result
}
