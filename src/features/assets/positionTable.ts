// Bảng "Cơ cấu danh mục" — thuần, test được.
//
// `buildPortfolio` đã trả `PortfolioPosition` với số cổ, giá vốn và lãi/lỗ theo giá. File
// này thêm hai thứ mà bảng cần và danh mục không biết: **cổ tức đã nhận theo từng mã** và
// **biến động trong phiên**, rồi cộng ra dòng TỔNG.
//
// Vì sao mọi tỷ lệ tính trên SỐ TIỀN MUA chứ không trên giá trị hôm nay: "lãi 15%" phải
// trả lời câu "bỏ ra 100 thì được thêm 15", không phải "phần lời chiếm 13% của cái đang
// có". Chia cho giá trị hôm nay làm cùng một khoản lời hiện ra hai con số khác nhau tuỳ
// hôm đó thị trường lên hay xuống.
import type { PortfolioPosition } from './portfolio'

export interface PositionRow {
  symbol: string
  /** % thay đổi trong phiên; null = thiếu giá hoặc thiếu giá tham chiếu */
  dayChange: number | null
  /** tỷ trọng trên tổng giá trị cổ phiếu, 0..1 */
  weight: number
  quantity: number
  /** đồng/cổ theo phiên mới nhất; null = chưa có giá */
  price: number | null
  /** đồng/cổ */
  avgCost: number
  /** đồng — giá trị theo giá hôm nay */
  value: number
  /** đồng — số tiền đã bỏ ra mua, đã gồm phí */
  cost: number
  /** đồng — value − cost */
  pricePnl: number
  pricePnlPercent: number | null
  /** đồng — cổ tức đã nhận, trừ đi khoản chi đã gắn cùng mã */
  dividend: number
  dividendPercent: number | null
  /** đồng — pricePnl + dividend */
  totalPnl: number
  totalPnlPercent: number | null
  /** Tài khoản đang giữ mã này — chỉ đáng nói khi mã nằm ở NHIỀU nơi. */
  accountNames: string[]
}

export interface PositionTotals {
  value: number
  cost: number
  pricePnl: number
  pricePnlPercent: number | null
  dividend: number
  dividendPercent: number | null
  totalPnl: number
  totalPnlPercent: number | null
}

export interface PositionTableResult {
  /** Chỉ mã còn giữ, sắp theo giá trị giảm dần. */
  rows: PositionRow[]
  totals: PositionTotals
  /**
   * đồng — cổ tức của những mã KHÔNG còn giữ.
   *
   * Không nhét vào `totals` vì tổng phải bằng đúng tổng các dòng, không thì bảng tự mâu
   * thuẫn với chính nó. Nhưng cũng không im lặng bỏ đi: đó là tiền thật đã về tài khoản,
   * và UI nói nó ra thành một dòng riêng.
   */
  soldDividend: number
}

const tyLe = (phan: number, mau: number): number | null => (mau > 0 ? (phan / mau) * 100 : null)

/**
 * Khoản thu/chi đã gắn mã → tổng theo mã.
 *
 * Chỉ `income` và `expense`. `transfer` bị bỏ kể cả khi có gắn mã: chuyển tiền là tiền đổi
 * chỗ, không phải thứ mã đó sinh ra — gắn nhầm thì thà không đếm còn hơn đếm sai.
 *
 * Tham số khai theo HÌNH DẠNG chứ không `import type { TransactionRow }` — cùng lý do đã
 * ghi ở `asTrade` và `toLedger`.
 */
export function dividendsBySymbol(
  transactions: {
    type: string
    amount: number
    account_id: string
    stock_symbol?: string | null
  }[],
  accountIds: Set<string>,
): Map<string, number> {
  const out = new Map<string, number>()
  for (const t of transactions) {
    if (!accountIds.has(t.account_id)) continue
    const symbol = (t.stock_symbol ?? '').trim().toUpperCase()
    if (!symbol) continue
    const d = t.type === 'income' ? t.amount : t.type === 'expense' ? -t.amount : 0
    if (d === 0) continue
    out.set(symbol, (out.get(symbol) ?? 0) + d)
  }
  return out
}

export function positionTable(input: {
  positions: PortfolioPosition[]
  /** mã → đồng, từ `dividendsBySymbol` */
  dividends: Map<string, number>
  /** mã → đồng/cổ, giá tham chiếu phiên trước (`stock_prices.prior_close`) */
  priorClose: Map<string, number>
}): PositionTableResult {
  const { positions, dividends, priorClose } = input

  const tongGiaTri = positions.reduce((s, p) => s + p.value, 0)

  const rows: PositionRow[] = positions
    .slice()
    .sort((a, b) => b.value - a.value)
    .map((p) => {
      const truoc = priorClose.get(p.symbol)
      const dividend = dividends.get(p.symbol) ?? 0
      const pricePnl = p.value - p.costBasis
      const totalPnl = pricePnl + dividend
      return {
        symbol: p.symbol,
        dayChange:
          p.price != null && truoc != null && truoc > 0 ? (p.price / truoc - 1) * 100 : null,
        // Tính lại tỷ trọng ở đây thay vì dùng `p.weight`: bảng này có thể đang xem một
        // tập con (lọc theo tài khoản), và tỷ trọng phải cộng lại đúng 100% trong đúng
        // tập đang hiện — không thì cột Tỷ trọng của bảng không khớp donut bên cạnh.
        weight: tongGiaTri > 0 ? p.value / tongGiaTri : 0,
        quantity: p.quantity,
        price: p.price,
        avgCost: p.avgCost,
        value: p.value,
        cost: p.costBasis,
        pricePnl,
        pricePnlPercent: tyLe(pricePnl, p.costBasis),
        dividend,
        dividendPercent: tyLe(dividend, p.costBasis),
        totalPnl,
        totalPnlPercent: tyLe(totalPnl, p.costBasis),
        accountNames: p.accountNames,
      }
    })

  const dangGiu = new Set(rows.map((r) => r.symbol))
  let soldDividend = 0
  for (const [symbol, tien] of dividends) {
    if (!dangGiu.has(symbol)) soldDividend += tien
  }

  const cost = rows.reduce((s, r) => s + r.cost, 0)
  const pricePnl = rows.reduce((s, r) => s + r.pricePnl, 0)
  const dividend = rows.reduce((s, r) => s + r.dividend, 0)
  const totalPnl = pricePnl + dividend

  return {
    rows,
    totals: {
      value: rows.reduce((s, r) => s + r.value, 0),
      cost,
      pricePnl,
      pricePnlPercent: tyLe(pricePnl, cost),
      dividend,
      dividendPercent: tyLe(dividend, cost),
      totalPnl,
      totalPnlPercent: tyLe(totalPnl, cost),
    },
    soldDividend,
  }
}

/** Một khoản thu/chi của danh mục, đã chuẩn hoá để đưa vào ô chọn mã. */
export interface TaggableCashflow {
  id: string
  occurredOn: string
  /** 'income' | 'expense' */
  type: string
  /** đồng, luôn dương — dấu nằm ở `type` */
  amount: number
  note: string
  /** Mã đã gắn; chuỗi RỖNG = chưa gắn (ô `<select>` cần một giá trị, không nhận null). */
  symbol: string
}

/**
 * Những khoản thu/chi có thể gắn mã, mới nhất trước.
 *
 * Giữ cả khoản ĐÃ gắn: đó là đường duy nhất để đổi mã hay bỏ gắn khi gắn nhầm. Chỉ hiện
 * khoản chưa gắn thì một lần bấm sai là vĩnh viễn, và người dùng phải đi tìm giao dịch đó
 * trong sổ để sửa.
 *
 * Bỏ `transfer` (nạp/rút không phải thứ mã sinh ra) và bỏ dòng tiền do chính lệnh cổ phiếu
 * kéo theo (`stock_trade_id`, migration 0054) — dòng đó là tiền đi mua cổ phiếu, gắn mã
 * cho nó sẽ đếm tiền mua như cổ tức.
 */
export function taggableCashflows(
  transactions: {
    id: string
    type: string
    amount: number
    account_id: string
    occurred_on: string
    note?: string
    stock_symbol?: string | null
    stock_trade_id?: string | null
  }[],
  accountIds: Set<string>,
): TaggableCashflow[] {
  return transactions
    .filter(
      (t) =>
        accountIds.has(t.account_id) &&
        (t.type === 'income' || t.type === 'expense') &&
        t.stock_trade_id == null,
    )
    .map((t) => ({
      id: t.id,
      occurredOn: t.occurred_on,
      type: t.type,
      amount: t.amount,
      note: t.note ?? '',
      symbol: (t.stock_symbol ?? '').trim().toUpperCase(),
    }))
    .sort((a, b) => b.occurredOn.localeCompare(a.occurredOn))
}
