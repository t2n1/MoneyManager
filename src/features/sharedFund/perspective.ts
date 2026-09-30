// Góc nhìn Cả nhà / Mình / người kia — phần THUẦN. Một hàm biến danh sách giao dịch của
// sổ thành danh sách "như thể chỉ có người này", để mọi phép tổng hợp sẵn có (báo cáo,
// ngân sách, bản tin) chạy nguyên trên đó mà không phải biết gì về góc nhìn.
//
// Luật (người dùng chốt 2026-09-30):
//   · Cả nhà  — nguyên sổ, không đổi gì.
//   · Một người — khoản thu/chi mang `owner` của người đó; khoản 'shared' (chung) và mọi
//     dòng tiền của TÀI KHOẢN QUỸ (quỹ chi, thu về quỹ, rút khỏi quỹ) là của cả nhà nên
//     không vào góc riêng.
//   · Khoản GÓP vào quỹ của người đó, có ghi phần → ở chế độ 'report' thành một khoản CHI
//     vào đúng danh mục của phần ("Tôi" góp tiền nhà ¥60k = tôi chi tiền nhà ¥60k). Đây
//     là số THẬT người đó bỏ ra cho phần đó, không phải số chia theo tỷ lệ.
//     Góp không ghi phần thì giữ là chuyển khoản — không biết nó thuộc danh mục nào thì
//     không bịa ra một danh mục.
//   · Chế độ 'ledger' (màn Sổ) KHÔNG biến chuyển khoản thành khoản chi: dòng trên Sổ là
//     dòng thật, bấm vào là sửa — sửa một dòng "chi" giả là đổi chuyển khoản thành chi.

import type { TransactionRow } from '../../types/database.types'

export type Perspective = 'all' | 'mine' | 'partner'
export type PerspectiveMode = 'report' | 'ledger'

export const PERSPECTIVES: readonly Perspective[] = ['all', 'mine', 'partner']

export function parsePerspective(v: unknown): Perspective {
  return v === 'mine' || v === 'partner' ? v : 'all'
}

type Row = Pick<
  TransactionRow,
  'type' | 'owner' | 'account_id' | 'to_account_id' | 'fund_part_id' | 'category_id' | 'to_amount' | 'is_refund'
>

/** Người của một dòng; vắng `owner` = 'mine' (dữ liệu trước 0064). */
function whoOf(t: Pick<Row, 'owner'>): 'mine' | 'partner' | 'shared' {
  return t.owner ?? 'mine'
}

/**
 * Dòng gốc của mỗi dòng "chi" dựng từ khoản góp. WeakMap chứ không thêm trường vào dòng:
 * TransactionRow là hình dạng của DB, và mọi chỗ chép dòng theo `keyof TransactionRow`
 * (restore.ts) sẽ phải khai một cột không tồn tại.
 */
const GOC = new WeakMap<object, object>()

/**
 * Dòng thật trong sổ. Nơi nào mở form SỬA từ một danh sách đã qua góc nhìn phải đi qua
 * đây: sửa thẳng dòng dựng là lưu một chuyển khoản thành khoản chi.
 */
export function realRow<T extends object>(t: T): T {
  return (GOC.get(t) as T | undefined) ?? t
}

export function applyPerspective<T extends Row>(
  txs: readonly T[],
  view: Perspective,
  fundId: string | null,
  mode: PerspectiveMode = 'report',
): T[] {
  if (view === 'all') return txs as T[]
  const out: T[] = []
  for (const t of txs) {
    if (fundId && t.account_id === fundId) continue
    const intoFund = !!fundId && t.type === 'transfer' && t.to_account_id === fundId
    if (intoFund) {
      // Góp: chỉ có hai người góp — 'shared' tính là của mình (khớp sharedFund.ts).
      const who = t.owner === 'partner' ? 'partner' : 'mine'
      if (who !== view) continue
      if (mode === 'report' && t.fund_part_id) {
        const dung: T = {
          ...t,
          type: 'expense',
          category_id: t.fund_part_id,
          to_account_id: null,
          to_amount: null,
          is_refund: false,
        }
        GOC.set(dung, t)
        out.push(dung)
      } else out.push(t)
      continue
    }
    if (whoOf(t) === view) out.push(t)
  }
  return out
}

/**
 * Tổng tiền GÓP vào quỹ của một người trong danh sách (đơn vị tiền của tài khoản nguồn,
 * nhóm theo tài khoản). Màn Sổ ở góc riêng dùng để nói "+ ¥… góp quỹ chung" dưới ô Chi:
 * ở đó khoản góp vẫn là chuyển khoản (chế độ 'ledger'), nên không nói ra thì Chi của Sổ
 * thấp hơn Chi của Báo cáo đúng bằng số đã góp.
 */
export function contributionsOf<T extends Row & Pick<TransactionRow, 'amount'>>(
  txs: readonly T[],
  fundId: string | null,
): T[] {
  if (!fundId) return []
  return txs.filter((t) => t.type === 'transfer' && t.to_account_id === fundId && t.account_id !== fundId)
}
