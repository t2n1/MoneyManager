// Phần tiền đã rời ví mà chưa ai ghi sổ — đọc ra từ các khoản bù của "Điều chỉnh số dư".
// Thuần, không phụ thuộc React, để unit-test được.
//
// VÌ SAO CÓ FILE NÀY: khoản bù do ReconcileSheet sinh ra mang `exclude_from_stats: true` và
// danh mục `kind = 'transfer'`, nên MỌI hàm thống kê đều bỏ qua nó. Số dư vì thế đúng, còn
// tổng Chi thiếu đúng bằng phần quên ghi — tổng Chi là SÀN chứ không phải tổng. Tháng nào
// quên nhiều thì tháng đó trông rẻ, và Ngân sách còn báo "chưa vượt" trong khi ví đã cạn.
// Xem spec docs/superpowers/specs/2026-09-05-chi-chua-ghi-so-design.md.
//
// VÌ SAO KHÔNG SỬA THẲNG aggregate.ts: `sumIncomeExpense` có 11 file gọi và
// `categoryBreakdown` có 15, trải cả sang `src/mcp/`. Sửa ở đó là đổi lặng lẽ cả những màn
// ta không định đổi — gồm cả câu trả lời của MCP server. Ở đây là một đầu vào RIÊNG, chỉ ba
// chỗ đọc, nên mỗi màn đổi số là do ta cố ý cho nó đổi.

import type { CurrencyCode } from '../../lib/money'
import { convertToBase, type Rates } from '../../lib/rates'
import type { AccountType, CategoryRow, TransactionRow } from '../../types/database.types'
import { ADJUST_CATEGORY_NAME } from '../categories/flowCategories'

/**
 * Kiểu tài khoản được tính — DANH SÁCH CHO PHÉP, không phải danh sách loại trừ.
 *
 * Loại thẻ tín dụng: bù trên thẻ là lệch sao kê, không phải tiền mặt quên ghi (khoản quẹt
 * thẻ vốn đã vào sổ qua import). Loại đầu tư / tài sản cố định: biến động giá trị ở đó
 * không phải tiêu tiền.
 *
 * Dùng `account.type` chứ KHÔNG dùng ghi chú `CARD_RECONCILE_NOTE`: kiểu tài khoản là dữ
 * liệu có cấu trúc, còn chuỗi ghi chú thì người dùng sửa được.
 */
const KIEU_TINH: ReadonlySet<AccountType> = new Set<AccountType>(['cash', 'bank', 'ic', 'ewallet'])

export interface ChiChuaGhi {
  /** Ròng, quy về base. Dương = tiêu mà chưa ghi. Âm = đã ghi thừa. */
  net: number
  /** 'chua_ghi' khi net > 0 · 'ghi_thua' khi net < 0 · null khi net === 0 */
  huong: 'chua_ghi' | 'ghi_thua' | null
  /** Số lần đối chiếu đã gộp vào con số này. 0 = kỳ này không đối chiếu lần nào. */
  soLanDoiChieu: number
  /** true = có khoản bù bị bỏ vì thiếu tỷ giá. UI phải hiện `≈`. */
  hasMissingRate: boolean
  /** Ngày đối chiếu gần nhất trong kỳ, ISO. null = không có lần nào. */
  lanCuoiISO: string | null
}

/**
 * Đọc phần chưa ghi từ chính mảng giao dịch của kỳ.
 *
 * Không cần truy vấn mới: `repo.listTransactions(range)` vốn trả về đủ mọi dòng, việc lọc
 * `exclude_from_stats` nằm bên trong từng hàm ở aggregate.ts. Nên các khoản bù đã nằm sẵn
 * trong mảng mà màn Báo cáo đang cầm.
 */
export function tinhChiChuaGhi(
  txs: readonly TransactionRow[],
  categories: readonly Pick<CategoryRow, 'id' | 'name'>[],
  accounts: readonly { id: string; type: AccountType; currency: CurrencyCode }[],
  base: CurrencyCode,
  rates: Rates,
): ChiChuaGhi {
  const laDanhMucBu = new Set(
    categories.filter((c) => c.name === ADJUST_CATEGORY_NAME).map((c) => c.id),
  )
  const tk = new Map(accounts.map((a) => [a.id, a]))

  let net = 0
  let soLanDoiChieu = 0
  let hasMissingRate = false
  let lanCuoiISO: string | null = null

  for (const t of txs) {
    if (!t.exclude_from_stats) continue
    if (!t.category_id || !laDanhMucBu.has(t.category_id)) continue
    const a = tk.get(t.account_id)
    if (!a || !KIEU_TINH.has(a.type)) continue

    const quy = convertToBase(t.amount, a.currency, base, rates)
    if (quy === null) {
      // Thiếu tỷ giá thì LOẠI, không quy 1:1 — thà thiếu còn hơn bịa. Cũng không đếm vào
      // soLanDoiChieu: lần đối chiếu này không đóng góp được con số nào, nên coi như chưa
      // có nó thì `tongChiCoPhanChuaGhi` mới giữ nguyên tổng cũ thay vì cộng thêm 0.
      hasMissingRate = true
      continue
    }

    net += t.type === 'income' ? -quy : quy
    soLanDoiChieu += 1
    if (lanCuoiISO === null || t.occurred_on > lanCuoiISO) lanCuoiISO = t.occurred_on
  }

  return {
    net,
    huong: net > 0 ? 'chua_ghi' : net < 0 ? 'ghi_thua' : null,
    soLanDoiChieu,
    hasMissingRate,
    lanCuoiISO,
  }
}

/**
 * Tổng Chi đã gồm phần chưa ghi.
 *
 * `soLanDoiChieu === 0` thì GIỮ NGUYÊN tổng cũ — kỳ không đối chiếu lần nào là "không
 * biết", không phải "bằng không". Cộng `net` (đang là 0) vào cũng ra đúng số, nhưng viết
 * rõ nhánh này để người đọc sau thấy luật, và để phép thử canh được nó.
 */
export function tongChiCoPhanChuaGhi(chiDaGhi: number, c: ChiChuaGhi): number {
  if (c.soLanDoiChieu === 0) return chiDaGhi
  return chiDaGhi + c.net
}

/** Dòng để bày ra bảng / màn Ngân sách. null = không có gì để nói, đừng hiện dòng nào. */
export function dongChiChuaGhi(c: ChiChuaGhi): { nhan: string; soTien: number } | null {
  if (c.soLanDoiChieu === 0 || c.huong === null) return null
  return { nhan: c.huong === 'chua_ghi' ? 'Chưa ghi rõ' : 'Ghi thừa', soTien: c.net }
}
