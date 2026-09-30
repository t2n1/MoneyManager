// Quỹ chung — phần chữ và lựa chọn dùng chung giữa form nhập, form định kỳ và màn Quỹ
// chung. Thuần (không React) để form nào cũng gọi được và test được.

import { categoryLabel, tr } from '../../i18n'
import type { CategoryRow, ProfileRow } from '../../types/database.types'

/** Tên người kia; chưa đặt thì "Người ấy" — đúng chữ ô "ai chi" đã dùng từ 0064. */
export function partnerLabel(profile: Pick<ProfileRow, 'partner_name'> | null | undefined): string {
  return profile?.partner_name?.trim() || tr('Người ấy')
}

/**
 * Chuyển khoản này chạm quỹ chung theo chiều nào.
 *   'in'  = góp vào quỹ (đích là quỹ)
 *   'out' = rút khỏi quỹ (nguồn là quỹ)
 *   null  = không chạm quỹ / chưa bật ghi hai người / chưa đặt quỹ
 */
export function fundLegOf(
  enabled: boolean,
  fundId: string | null | undefined,
  fromId: string | null,
  toId: string | null,
): 'in' | 'out' | null {
  if (!enabled || !fundId) return null
  if (toId === fundId && fromId !== fundId) return 'in'
  if (fromId === fundId && toId && toId !== fundId) return 'out'
  return null
}

export interface FundPartOption {
  id: string
  label: string
}

/**
 * Danh mục chọn được làm "phần": danh mục CHI thật (không phải chuyển tài sản), còn hoạt
 * động, cha trước rồi tới con ngay dưới nó ("Ăn uống", "Ăn uống › Đi chợ"). Cho chọn cả
 * con vì có người góp riêng tiền chợ, riêng tiền ăn ngoài. `keepId` = phần của khoản đang
 * sửa: lưu trữ danh mục rồi vẫn phải hiện được, không thì mở lại là mất phần.
 */
export function fundPartOptions(
  categories: readonly Pick<CategoryRow, 'id' | 'name' | 'type' | 'kind' | 'parent_id' | 'sort_order' | 'is_archived'>[],
  keepId: string | null = null,
): FundPartOption[] {
  const ok = (c: (typeof categories)[number]) =>
    c.type === 'expense' && c.kind !== 'transfer' && (!c.is_archived || c.id === keepId)
  const bySort = (a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order
  const parents = categories.filter((c) => c.parent_id === null && ok(c)).sort(bySort)
  const out: FundPartOption[] = []
  for (const p of parents) {
    out.push({ id: p.id, label: categoryLabel(p.name) })
    for (const c of categories.filter((x) => x.parent_id === p.id && ok(x)).sort(bySort))
      out.push({ id: c.id, label: `${categoryLabel(p.name)} › ${categoryLabel(c.name)}` })
  }
  return out
}
