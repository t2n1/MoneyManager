// "Tài khoản này lần cuối được đối chiếu là khi nào?" — MỘT câu trả lời cho cả hai nơi
// hỏi nó: chuông nhắc (`rules/dataRules.ts`) và khối Độ tin cậy (`reliability.ts`).
//
// Vì sao tách ra file riêng: trước đây hai file trên tự suy lấy, mỗi bên một đoạn
// giống hệt nhau. Cùng một câu hỏi trả lời ở hai chỗ thì sớm muộn ra hai con số, mà
// hai con số cho cùng một câu hỏi trên cùng một màn còn tệ hơn cả hai đều sai: người
// dùng thôi tin cả hai. BulletinPage đã dính đúng lỗi này một lần (xem chú thích ở
// `doTinCay`), nên lần thêm nguồn dữ liệu thứ hai này gộp luôn về một chỗ.
//
// THUẦN: không React, không window, không Date.now(). Cùng ràng buộc với rules/* vì
// bộ luật chạy cả trên Deno trong edge function push-notify.
import { ADJUST_CATEGORY_NAME } from '../categories/flowCategories'
import type { CategoryRow, TransactionRow } from '../../types/database.types'

/** Chỉ cần hai trường này — nhận cả `AccountRow` lẫn `AccountBalanceRow`. */
export interface ReconcilableAccount {
  id: string
  /** `accounts.last_reconciled_at` (migration 0050); null = chưa lần nào qua cột này. */
  last_reconciled_at?: string | null
}

/**
 * Ngày (YYYY-MM-DD) đối chiếu gần nhất của từng tài khoản. Không có mục nào trong Map
 * = chưa đối chiếu bao giờ trong tầm nhìn của dữ liệu truyền vào.
 *
 * HAI NGUỒN, lấy cái MUỘN HƠN:
 *
 *   · `accounts.last_reconciled_at` — mốc thật, sheet Đối chiếu ghi mỗi lần bấm, KỂ CẢ
 *     khi số dư đã khớp và không sinh giao dịch bù nào. Đây là nguồn đúng.
 *
 *   · giao dịch bù trong danh mục `ADJUST_CATEGORY_NAME` — phép suy cũ, giữ lại cho dữ
 *     liệu ghi TRƯỚC migration 0050. Cột mới nullable và không backfill, nên bỏ nhánh
 *     này đi là mọi tài khoản của người dùng cũ bỗng dưng "chưa đối chiếu bao giờ".
 *
 * Lấy muộn hơn chứ không ưu tiên cột: một người đã đối chiếu qua cột hồi tháng trước,
 * rồi tuần này bù tay một khoản thẳng trong Sổ (không qua sheet), thì lần bù tay đó
 * cũng là một lần so sổ — bỏ qua nó là báo cũ trong khi dữ liệu vừa được sờ tới.
 *
 * Timestamp cắt còn 10 ký tự đầu: cột là timestamptz ('2026-08-21T09:12:00Z'), còn
 * `occurred_on` và mọi cutoff trong bộ luật đều là ngày trần. So chuỗi ngày với chuỗi
 * ngày, không trộn hai định dạng.
 */
export function lastReconciledMap(
  accounts: ReconcilableAccount[],
  recentTxs: TransactionRow[],
  categories: CategoryRow[],
): Map<string, string> {
  const adjustCatIds = new Set(
    categories.filter((c) => c.name === ADJUST_CATEGORY_NAME).map((c) => c.id),
  )

  const out = new Map<string, string>()
  for (const a of accounts) {
    if (a.last_reconciled_at) out.set(a.id, a.last_reconciled_at.slice(0, 10))
  }
  for (const t of recentTxs) {
    if (t.category_id == null || !adjustCatIds.has(t.category_id)) continue
    const cu = out.get(t.account_id)
    if (!cu || t.occurred_on > cu) out.set(t.account_id, t.occurred_on)
  }
  return out
}
