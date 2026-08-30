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
import { useState } from 'react'
import { useBudgets, useCategories, useRates, useUpsertBudget } from '../../hooks/queries'
import {
  parentsToResync,
  splitCapToChildren,
  type LimitPatch,
  type SplitChild,
  type SplitPart,
} from './capSplit'
import type { SplitGroupSheetProps } from './SplitGroupSheet'
import { useSuggestions } from './useSuggestions'

export interface SyncedBudget {
  /**
   * Gọi SAU khi đã ghi xong hạn mức, để hai chiều của luật được giữ:
   *   · danh mục vừa ghi CÓ CON  → mở màn chia để người dùng xem và sửa từng dòng
   *   · danh mục vừa ghi CÓ CHA  → cộng lại trần cha, im lặng
   * Nhận cả lô nên `Nhận hết gợi ý` (7 mục) vẫn chỉ ghi trần cha một lần.
   */
  syncAfterWrite: (patch: LimitPatch[]) => Promise<void>
  /** Nút "Chia cho N mục con" ở câu nhắc lệch — mở đúng màn đó. */
  openSplit: (categoryId: string) => void
  /** Màn chia đang mở, hoặc null. Nơi gọi render `<SplitGroupSheet {...} />`. */
  splitSheetProps: SplitGroupSheetProps | null
}

export function useSyncedBudget(monthKey: string): SyncedBudget {
  const { data: categories = [] } = useCategories()
  const { data: budgets = [] } = useBudgets(monthKey)
  const { suggestions } = useSuggestions()
  const upsert = useUpsertBudget()
  const { base } = useRates()
  const [splitting, setSplitting] = useState<string | null>(null)

  const childrenOf = (id: string) =>
    categories.filter((c) => c.parent_id === id && !c.is_archived)
  const parentOf = (id: string) => categories.find((c) => c.id === id)?.parent_id ?? null
  const catOf = (id: string) => categories.find((c) => c.id === id) ?? null
  // `amount` là số ĐẶT TAY. Số trên màn đã cộng phần dồn tháng trước (`rollover`); chia
  // hay cộng ngược trên số đó là mỗi lần sửa lại nhân thêm một lần dồn nữa.
  const limits = new Map(budgets.map((b) => [b.category_id, b.amount]))

  /** Ghi một lô hạn mức, bỏ qua dòng hỏng để dòng sau không bị chặn theo. */
  async function writeAll(parts: SplitPart[]) {
    for (const p of parts) {
      try {
        await upsert.mutateAsync({ categoryId: p.categoryId, monthKey, amount: p.amount })
      } catch {
        // Toast lỗi toàn cục đã nói. Mục sau không liên quan gì tới mục vừa hỏng.
      }
    }
  }

  async function syncAfterWrite(patch: LimitPatch[]) {
    // Đặt số ở một danh mục CÓ CON thì mở màn chia — số cha vừa ghi là mốc để chia,
    // còn chia thế nào là việc của người dùng, không phải của app.
    const withKids = patch.find((p) => p.amount !== null && childrenOf(p.categoryId).length > 0)
    if (withKids) setSplitting(withKids.categoryId)

    const parents = parentsToResync(patch, {
      parentOf,
      childrenOf: (id) => childrenOf(id).map((c) => c.id),
      limits,
      hasCap: (id) => limits.has(id),
    })
    await writeAll(parents)
  }

  const parent = splitting ? catOf(splitting) : null
  const cap = splitting ? (limits.get(splitting) ?? 0) : 0
  const kids = splitting ? childrenOf(splitting) : []
  // Số mở sẵn = phép chia tự động (giữ lời khai cũ, chia phần dư). Người dùng sửa từ đó
  // chứ không gõ lại từ đầu — đây là khác biệt giữa "bày ra để sửa" và "bắt nhập tay".
  const preset = new Map(
    splitCapToChildren(
      cap,
      kids.map(
        (k): SplitChild => ({
          categoryId: k.id,
          limit: limits.get(k.id) ?? null,
          average: suggestions.get(k.id)?.average ?? 0,
        }),
      ),
    ).map((p) => [p.categoryId, p.amount]),
  )

  const splitSheetProps: SplitGroupSheetProps | null =
    parent && kids.length > 0
      ? {
          parentLabel: `${parent.icon} ${parent.name}`,
          cap,
          base,
          rows: kids.map((k) => ({
            categoryId: k.id,
            label: `${k.icon} ${k.name}`,
            amount: preset.get(k.id) ?? 0,
            average: suggestions.get(k.id)?.average ?? 0,
          })),
          onSave: async (parts) => {
            await writeAll(parts)
            // Trần cha = tổng con, ghi ngay trong cùng lượt: tổng người dùng gõ có thể
            // khác trần cũ, và luật nói bên con mới là số thật.
            const total = parts.reduce((s, p) => s + p.amount, 0)
            if (total !== cap) {
              await writeAll([{ categoryId: parent.id, amount: total }])
            }
          },
          onClose: () => setSplitting(null),
        }
      : null

  return { syncAfterWrite, openSplit: setSplitting, splitSheetProps }
}
