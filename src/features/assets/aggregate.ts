// Tổng hợp tài sản theo nhóm — thuần, không phụ thuộc React, để unit-test được.
// Mọi số dư quy đổi về base currency qua convertToBase; thiếu tỷ giá → hasMissingRate.

import type { CurrencyCode } from '../../lib/money'
import { convertToBase, type Rates } from '../../lib/rates'
import type { AccountBalanceRow, AccountType } from '../../types/database.types'

/** Nhãn hiển thị cho tài khoản chưa gán nhóm. */
export const UNGROUPED_LABEL = 'Chưa phân nhóm'

/** Nhãn tiếng Việt cho từng loại tài khoản (chế độ xem "Theo loại"). */
export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  cash: 'Tiền mặt',
  bank: 'Ngân hàng',
  card: 'Thẻ tín dụng',
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
  /** minor units theo currency gốc của tài khoản */
  balance: number
  /** minor units quy đổi base; null = thiếu tỷ giá */
  baseValue: number | null
  /** false = không cộng vào tổng (cấp tài khoản) */
  includeInTotals: boolean
  /** true = ẩn khỏi trang Tài sản (cấp tài khoản) */
  hidden: boolean
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
): AssetBreakdown {
  const settingOf = new Map(settings.map((s) => [s.name, s]))
  const groups = new Map<string, AssetAccount[]>()
  const cards: CardLiability[] = []
  let total = 0
  let hasForeign = false
  let hasMissingRate = false
  let cardDebt = 0
  let cardHasMissingRate = false

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
    const baseValue = convertToBase(b.balance, b.currency, base, rates)
    const account: AssetAccount = {
      id: b.id,
      name: b.name,
      type: b.type,
      currency: b.currency,
      balance: b.balance,
      baseValue,
      includeInTotals: b.include_in_totals ?? true,
      hidden: b.is_hidden ?? false,
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
    accounts.sort((a, b) => (b.baseValue ?? 0) - (a.baseValue ?? 0))

    if (groupCounted) {
      total += groupTotal
      if (countedAccounts.some((a) => a.currency !== base)) hasForeign = true
      if (countedAccounts.some((a) => a.baseValue === null)) hasMissingRate = true
    }

    return {
      name,
      total: groupTotal,
      share: 0, // gán lại sau khi biết grand total
      accounts,
      hasMissingRate: countedAccounts.some((a) => a.baseValue === null),
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
  }
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
    accounts.sort((a, b) => (b.baseValue ?? 0) - (a.baseValue ?? 0))
    const groupTotal = accounts.reduce((s, a) => s + (a.baseValue ?? 0), 0)
    return {
      name: ACCOUNT_TYPE_LABELS[type],
      total: groupTotal,
      share: breakdown.total > 0 ? groupTotal / breakdown.total : 0,
      accounts,
      hasMissingRate: accounts.some((a) => a.baseValue === null),
      includeInTotals: true,
      hidden: false,
    }
  })

  result.sort((a, b) => b.total - a.total)
  return result
}
