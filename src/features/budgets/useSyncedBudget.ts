// Giữ luật "CHA = TỔNG CÁC CON" của cột hạn mức — MỘT đường cho mọi chỗ ghi hạn mức.
//
// Trước đây trần nhóm và mốc con là hai con số sống độc lập: tháng 8/2026 có `Ăn uống`
// trần ¥50.000 mà không mục con nào mang một đồng nào của nó. Nhìn nhóm không ai biết
// ¥50.000 đó dành cho Cơm ngoài hay Đi chợ.
//
// Vì sao là MỘT hook chứ không phải mỗi chỗ tự lo: có năm chỗ ghi hạn mức (sheet đặt
// hạn mức, nút `Đặt`, thanh trượt, `Nhận hết gợi ý`, `Chia giữ sàn`). Luật chép ra năm
// bản thì bỏ sót một bản là luật thủng đúng ở chỗ đó, và không ai thấy cho tới khi số
// cộng ra sai.
import { useBudgets, useCategories, useRates, useUpsertBudget } from '../../hooks/queries'
import { confirmDialog } from '../../lib/dialog'
import { formatMoney } from '../../lib/money'
import {
  parentsToResync,
  splitCapToChildren,
  type LimitPatch,
  type SplitChild,
} from './capSplit'
import { useSuggestions } from './useSuggestions'

export interface SyncedBudget {
  /**
   * Gọi SAU khi đã ghi xong hạn mức, để hai chiều của luật được giữ:
   *   · danh mục vừa ghi CÓ CON  → hỏi rồi chia số đó xuống các con
   *   · danh mục vừa ghi CÓ CHA  → cộng lại trần cha, im lặng
   * Nhận cả lô nên `Nhận hết gợi ý` (7 mục) vẫn chỉ ghi trần cha một lần.
   */
  syncAfterWrite: (patch: LimitPatch[]) => Promise<void>
  /**
   * Chia trần nhóm ĐANG LƯU của `categoryId` xuống các con — cho nút một-chạm ở câu
   * nhắc lệch (`capMismatchNotice`). Dùng số ĐẶT TAY, không phải số trên màn: số trên
   * màn đã cộng phần dồn tháng trước, chia nó xuống con là dồn thêm một lần nữa.
   */
  splitToChildren: (categoryId: string) => Promise<void>
}

export function useSyncedBudget(monthKey: string): SyncedBudget {
  const { data: categories = [] } = useCategories()
  const { data: budgets = [] } = useBudgets(monthKey)
  const { suggestions } = useSuggestions()
  const upsert = useUpsertBudget()
  const { base } = useRates()

  const childrenOf = (id: string) =>
    categories.filter((c) => c.parent_id === id && !c.is_archived)
  const parentOf = (id: string) => categories.find((c) => c.id === id)?.parent_id ?? null
  const nameOf = (id: string) => categories.find((c) => c.id === id)?.name ?? ''
  // `amount` là số ĐẶT TAY. Số trên màn đã cộng phần dồn tháng trước (`rollover`); chia
  // hay cộng ngược trên số đó là mỗi lần sửa lại nhân thêm một lần dồn nữa.
  const limits = new Map(budgets.map((b) => [b.category_id, b.amount]))

  async function splitDown(categoryId: string, cap: number) {
    const kids = childrenOf(categoryId)
    if (kids.length === 0) return
    const parts = splitCapToChildren(
      cap,
      kids.map(
        (k): SplitChild => ({
          categoryId: k.id,
          limit: limits.get(k.id) ?? null,
          average: suggestions.get(k.id)?.average ?? 0,
        }),
      ),
    )
    // Đã khớp sẵn thì không hỏi: bấm Lưu mà không đổi số cũng sinh một lượt ghi.
    if (parts.every((p) => (limits.get(p.categoryId) ?? 0) === p.amount)) return

    const ok = await confirmDialog({
      title: `Chia ${formatMoney(cap, base)} cho ${kids.length} mục con?`,
      message: parts.map((p) => `${nameOf(p.categoryId)} ${formatMoney(p.amount, base)}`).join(' · '),
      confirmLabel: 'Chia',
      cancelLabel: 'Để nguyên',
    })
    if (!ok) return
    for (const p of parts) {
      try {
        await upsert.mutateAsync({ categoryId: p.categoryId, monthKey, amount: p.amount })
      } catch {
        // Toast lỗi toàn cục đã nói. Mục sau không liên quan gì tới mục vừa hỏng.
      }
    }
  }

  async function syncAfterWrite(patch: LimitPatch[]) {
    for (const p of patch) {
      if (p.amount !== null && childrenOf(p.categoryId).length > 0) {
        await splitDown(p.categoryId, p.amount)
      }
    }
    const parents = parentsToResync(patch, {
      parentOf,
      childrenOf: (id) => childrenOf(id).map((c) => c.id),
      limits,
      hasCap: (id) => limits.has(id),
    })
    for (const p of parents) {
      try {
        await upsert.mutateAsync({ categoryId: p.categoryId, monthKey, amount: p.amount })
      } catch {
        // Như trên: một trần cha hỏng không được chặn các trần cha còn lại.
      }
    }
  }

  return {
    syncAfterWrite,
    splitToChildren: (categoryId: string) => splitDown(categoryId, limits.get(categoryId) ?? 0),
  }
}
