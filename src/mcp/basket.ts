// Rổ giao dịch cho MỌI tool của MCP server — chỗ DUY NHẤT quyết định "những giao dịch nào
// được tính".
//
// Vì sao phải là một chỗ: khối 01 và khối 04 của báo cáo tháng từng dùng hai rổ khác nhau
// (commit 7dc3834), và cái sai đó không đọc ra được từ một file lẻ. Mọi tool đi qua đây thì
// hoặc cả bộ đúng, hoặc cả bộ sai cùng kiểu — và phép thử bất biến ở tools/parity.test.ts
// bắt được cái sai cùng kiểu đó.
//
// KHÔNG import lib/money.ts (kéo React) và KHÔNG import lib/supabase.ts (dùng
// import.meta.env). Guard: features/notifications/purity.test.ts.
import {
  addDaysISO,
  getMonthRange,
  monthKeyForDate,
  monthKeyString,
  type MonthKey,
} from '../lib/dates'
import { transferCategoryIds } from '../features/categories/kind'
import type { CurrencyCode } from '../lib/currencies'
import type { Rates } from '../lib/rates'
import type {
  AccountRow,
  BudgetRow,
  CategoryRow,
  FxHistoryRow,
  TagRow,
  TransactionRow,
  TransactionTagRow,
} from '../types/database.types'

/** Toàn bộ dữ liệu một tool cần. Do load.ts đọc từ Supabase; tool KHÔNG tự đọc gì. */
export interface DuLieu {
  txs: TransactionRow[]
  accounts: AccountRow[]
  categories: CategoryRow[]
  tags: TagRow[]
  txTags: TransactionTagRow[]
  budgets: BudgetRow[]
  /** Lịch sử tỷ giá, thứ tự bất kỳ. */
  fx: FxHistoryRow[]
  base: CurrencyCode
  monthStartDay: number
  /** Múi giờ IANA của user (`profiles.push_tz`) — cần để đọc GIỜ từ created_at (UTC). */
  tz: string
}

export interface Khoang {
  /** 'YYYY-MM' */
  tu_thang?: string
  /** 'YYYY-MM' */
  den_thang?: string
  /** 'YYYY-MM-DD' */
  tu_ngay?: string
  /** 'YYYY-MM-DD', mốc ĐÓNG (gồm cả ngày này). */
  den_ngay?: string
}

export interface PhamVi {
  tu_ngay: string
  /** Mốc MỞ — giao dịch đúng ngày này KHÔNG được tính. */
  den_ngay: string
  so_dong_vao_ro: number
  loc_da_ap: string[]
}

export interface Ro {
  txs: TransactionRow[]
  phamVi: PhamVi
  rates: Rates
  /** Danh mục `kind = 'transfer'` — chuyển tài sản, không phải tiêu thật. */
  transferIds: ReadonlySet<string>
}

/**
 * 'YYYY-MM' → MonthKey, có KIỂM DẠNG.
 *
 * Khác `parseMonthKey` của lib/dates.ts đúng một điểm: cái kia tin đầu vào (nó nhận chuỗi
 * do app tự sinh), còn ở đây đầu vào do Claude gõ ra, nên chuỗi sai dạng phải nổ kèm câu
 * nói rõ dạng đúng thay vì lặng lẽ thành `{ year: NaN, month: NaN }`.
 */
export function docThang(s: string): MonthKey {
  const m = /^(\d{4})-(\d{2})$/.exec(s)
  if (!m) throw new Error(`Tháng phải viết dạng YYYY-MM (ví dụ 2026-07), nhận được "${s}".`)
  const year = Number(m[1])
  const month = Number(m[2])
  if (month < 1 || month > 12) throw new Error(`Tháng phải từ 01 tới 12, nhận được "${s}".`)
  return { year, month }
}

export function khoangNgay(khoang: Khoang, monthStartDay: number): { tu: string; den: string } {
  if (khoang.tu_thang !== undefined) {
    const tuKey = docThang(khoang.tu_thang)
    const denKey = docThang(khoang.den_thang ?? khoang.tu_thang)
    return {
      tu: getMonthRange(tuKey, monthStartDay).start,
      // `end` của getMonthRange đã là mốc MỞ của chính tháng đó, nên tháng cuối lấy `end`.
      den: getMonthRange(denKey, monthStartDay).end,
    }
  }
  if (khoang.tu_ngay !== undefined) {
    const den = khoang.den_ngay ?? khoang.tu_ngay
    // Mốc đóng → mốc mở. `addDaysISO` của lib/dates.ts, không tự cộng ngày ở đây.
    return { tu: khoang.tu_ngay, den: addDaysISO(den, 1) }
  }
  throw new Error(
    'Phải cho một khoảng: tu_thang (+ den_thang), hoặc tu_ngay (+ den_ngay). ' +
      'Không có khoảng thì tool sẽ đọc cả sổ, và đó gần như luôn là câu hỏi sai.',
  )
}

export function ratesMoiNhat(fx: FxHistoryRow[], base: CurrencyCode): Rates {
  let moi: FxHistoryRow | null = null
  for (const r of fx) {
    if (r.base !== base) continue
    if (moi === null || r.on_date > moi.on_date) moi = r
  }
  return moi === null ? {} : moi.rates
}

export function dungRo(du: DuLieu, khoang: Khoang): Ro {
  const { tu, den } = khoangNgay(khoang, du.monthStartDay)
  const txs = du.txs.filter(
    (t) =>
      t.occurred_on >= tu &&
      t.occurred_on < den &&
      !t.is_debt_flow &&
      !t.exclude_from_stats,
  )
  return {
    txs,
    rates: ratesMoiNhat(du.fx, du.base),
    // Dùng lại features/categories/kind.ts: tập danh mục chuyển tài sản chỉ được suy ở MỘT
    // chỗ trong cả repo, không thì hai bên ra hai con số (chính lý do cột `kind` có mặt).
    transferIds: transferCategoryIds(du.categories),
    phamVi: {
      tu_ngay: tu,
      den_ngay: den,
      so_dong_vao_ro: txs.length,
      loc_da_ap: ['bỏ dòng tiền nợ/cho vay', 'bỏ khoản đã đánh dấu loại khỏi thống kê'],
    },
  }
}

/** Dùng ở tools/*: 'YYYY-MM' của một ngày, theo monthStartDay. Không đọc đồng hồ. */
export function thangCuaNgay(iso: string, monthStartDay: number): string {
  return monthKeyString(monthKeyForDate(iso, monthStartDay))
}
