// Câu giải thích "hạn mức đang đặt thuộc loại nào" cho sheet đặt hạn mức — thuần, test được.
//
// Vì sao là file riêng chứ không nằm trong BudgetView: sheet đặt hạn mức mở được từ HAI
// tab (Ngân sách và Lập kế hoạch), và câu này là thứ duy nhất trên sheet nói ra rằng số
// mình đang gõ chỉ là MỐC bên trong trần cha, không cộng thêm vào trần đó. Trước đây nó
// là hàm cục bộ trong BudgetView nên tab Lập kế hoạch đặt mốc con trong im lặng — đúng
// đường dẫn tới ca "mốc con 2.400 trong trần nhóm 1.800" mà không ai được cảnh báo.
import type { CategoryRow } from '../../types/database.types'
import { tr } from '../../i18n'

/**
 * `hasBudget` cho biết một danh mục đã có dòng hạn mức trong tháng đang xét chưa.
 * Trả `undefined` khi không cần câu nào (lá độc lập, hoặc danh mục không tồn tại).
 */
export function budgetHint(
  categoryId: string,
  categories: CategoryRow[],
  hasBudget: (categoryId: string) => boolean,
): string | undefined {
  const c = categories.find((x) => x.id === categoryId)
  if (!c) return undefined

  if (c.parent_id) {
    const parent = categories.find((x) => x.id === c.parent_id)
    return hasBudget(c.parent_id)
      ? tr('Chỉ là mốc theo dõi bên trong trần của {parent} — không cộng thêm vào trần đó, cũng không cộng vào tổng ngân sách.', { parent: parent?.name ?? tr('nhóm cha') })
      : tr('{parent} chưa có trần chung, nên hạn mức này tính vào tổng ngân sách. Trần của nhóm = tổng hạn mức các mục con.', { parent: parent?.name ?? tr('Nhóm cha') })
  }

  const hasChildren = categories.some((k) => k.parent_id === categoryId && !k.is_archived)
  return hasChildren
    ? tr('Trần chung cho cả nhóm: tính mọi khoản chi của các mục con và chi ghi thẳng vào nhóm.')
    : undefined
}
