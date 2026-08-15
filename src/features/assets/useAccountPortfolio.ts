// Số tóm tắt danh mục cho TRANG CHI TIẾT một tài khoản.
//
// Điểm chính của cả đợt này: ở đây KHÔNG có phép tính nào. Nó gọi đúng hàm mà trang Đầu tư
// gọi, chỉ với mảng một phần tử — nên "trang tài khoản lệch trang Đầu tư" trở thành chuyện
// không biểu diễn được, thay vì chuyện phải nhớ đồng bộ. Trước đợt này hai màn vẽ cùng bộ
// số bằng hai đoạn JSX riêng, với bốn cái nhãn khác nhau.
import { useMemo } from 'react'
import {
  useAccountBalances,
  useFundPrices,
  useFundTrades,
  useStockPrices,
  useStockTrades,
} from '../../hooks/queries'
import type {
  AccountRow,
  FundPriceRow,
  FundTradeRow,
  StockPriceRow,
  StockTradeRow,
} from '../../types/database.types'
import { asFundTrade, fundHoldingsFromTrades, sessionNavs } from './fundHoldings'
import { buildFundPortfolio } from './fundPortfolio'
import { asTrade, sessionPrices } from './holdings'
import { buildPortfolio } from './portfolio'

export type PortfolioKind = 'stocks' | 'funds'

export interface AccountPortfolioSummary {
  kind: PortfolioKind
  /** null = không đáng tin (tiền chưa mua âm, hoặc thiếu giá mọi mã/quỹ). */
  marketValue: number | null
  /** Giá vốn của số đang giữ — mốc chia phần trăm. Quyết định 1 của spec. */
  cost: number
  unrealizedPnl: number
  unrealizedPercent: number | null
  /** Số mã / số quỹ đang giữ. */
  count: number
  session: string | null
  /**
   * Tiền chưa mua ở công ty chứng khoán (âm = sổ lệnh thiếu lần nạp tiền). `null` cho
   * quỹ Nhật — tài khoản quỹ không giữ tiền nhàn rỗi (Rakuten quét sạch về 楽天銀行),
   * nên khái niệm "tiền chưa mua" không tồn tại ở đó.
   *
   * Trường này tồn tại CHỈ để trang chi tiết chọn đúng câu khi `marketValue === null`:
   * `reliableTotal` (holdings.ts) trả `null` vì HAI lý do khác nhau — `cash < 0` hoặc
   * thiếu giá mọi mã — và hai lý do đó cần hai câu khác nhau (xem AccountDetailPage).
   * Không tính gì ở đây, chỉ chuyển tiếp `cash` mà `buildPortfolio` đã tính sẵn.
   */
  cash: number | null
}

/**
 * Engine nào cho tài khoản này, hay không engine nào.
 *
 * Thuần, tách riêng để test được không cần React. `null` nghĩa là trang chi tiết rơi về
 * đường cũ: định giá nhập tay + nút "Cập nhật giá trị" + khu "Lịch sử giá trị". Đó là
 * đường duy nhất còn lại cho tài khoản đầu tư mà app không có bảng giá nào cho nó.
 *
 * Lưu trữ cũng trả `null`: hai tab của trang Đầu tư đều lọc `!is_archived`, nên nếu ở đây
 * vẫn hiện tóm tắt thì link "Xem danh mục" sẽ dẫn tới một tab lặng lẽ bỏ qua bộ lọc và
 * hiện danh mục của tài khoản KHÁC.
 */
export function portfolioKindOf(
  account: Pick<AccountRow, 'type' | 'currency' | 'is_archived'> | undefined,
  soLenh: number,
): PortfolioKind | null {
  if (!account || account.type !== 'investment' || account.is_archived) return null
  if (soLenh === 0) return null
  if (account.currency === 'VND') return 'stocks'
  if (account.currency === 'JPY') return 'funds'
  return null
}

/**
 * `undefined` = CHƯA BIẾT (sổ lệnh/bảng giá còn đang bay). `null` = biết chắc tài khoản
 * này không có sổ lệnh nào để tính.
 *
 * Phải tách hai trạng thái, không được nhập chung thành `null`: trên đường vào thẳng
 * `/assets/account/:id`, `useAccounts` có thể về TRƯỚC `useStockTrades`. Nhập chung thì
 * trong khoảng đó một tài khoản CÓ sổ lệnh hiện khối định giá nhập tay kèm nút "Cập nhật
 * giá trị" — bấm trúng lúc đó là ghi một hàng `source='manual'` cho tài khoản do cron
 * lo, và hàng tay luôn thắng hàng auto cùng ngày (view `account_balances`), nên Tổng tài
 * sản lệch hẳn khỏi số tính tại máy. Đúng loại lệch mà cả đợt này sinh ra để chặn.
 */
export type AccountPortfolioState = AccountPortfolioSummary | null | undefined

/**
 * Bốn bảng thô mà một tài khoản cần để tự định giá, cộng số dư sổ của nó.
 *
 * Sổ lệnh truyền vào là TOÀN BỘ, chưa lọc theo tài khoản: lọc là việc của hàm dưới đây.
 * Bắt nơi gọi tự lọc thì thêm một chỗ có thể quên — mà quên là giá vốn nuốt luôn lệnh
 * của tài khoản khác, ra một con số lời sai mà không màn nào báo động.
 */
export interface PortfolioSource {
  /** Số dư sổ của tài khoản (nạp − rút) — chỉ đường cổ phiếu dùng, để ra tiền chưa mua. */
  balance: number
  stockTrades: StockTradeRow[]
  stockPrices: StockPriceRow[]
  fundTrades: FundTradeRow[]
  fundPrices: FundPriceRow[]
}

/**
 * Tóm tắt danh mục của MỘT tài khoản — thuần, không React.
 *
 * Tách ra khỏi hook vì có hai nơi cần đúng con số này: trang chi tiết tài khoản (một tài
 * khoản mỗi lần) và DÒNG tài khoản trên trang Tài sản (mọi tài khoản một lượt). Hai nơi
 * gọi chung một hàm → "hai màn lệch nhau" thành chuyện không biểu diễn được, đúng lý do
 * cả file này ra đời.
 */
export function accountPortfolioSummary(
  account: AccountRow | undefined,
  src: PortfolioSource,
): AccountPortfolioSummary | null {
  const soLenhCoPhieu = account
    ? src.stockTrades.filter((t) => t.account_id === account.id)
    : []
  const soLenhQuy = account ? src.fundTrades.filter((t) => t.account_id === account.id) : []
  const kind = portfolioKindOf(
    account,
    account?.currency === 'JPY' ? soLenhQuy.length : soLenhCoPhieu.length,
  )
  if (!account || kind === null) return null

  if (kind === 'stocks') {
    const { session, priceBySymbol } = sessionPrices(src.stockPrices)
    const p = buildPortfolio(
      [
        {
          accountId: account.id,
          accountName: account.name,
          balance: src.balance,
          trades: soLenhCoPhieu.map(asTrade),
        },
      ],
      priceBySymbol,
    )
    return {
      kind: 'stocks',
      marketValue: p.marketValue,
      cost: p.stockCost,
      unrealizedPnl: p.unrealizedPnl,
      unrealizedPercent: p.unrealizedPercent,
      count: p.positions.length,
      session,
      // Chuyển tiếp thẳng, không tính lại: `p.cash` đã ra từ `buildPortfolio`.
      cash: p.cash,
    }
  }

  const trades = soLenhQuy.map(asFundTrade)
  // Tham số thứ hai của sessionNavs là quỹ ĐANG GIỮ, không phải quỹ TỪNG GIAO DỊCH — xem
  // giao kèo trên chính hàm đó. Lấy từ sổ lệnh thô thì một quỹ đã bán sạch (mã của nó nằm
  // lại trong sổ vĩnh viễn) vẫn kéo ngày phiên theo mình: quỹ tài sản trong nước công bố
  // 基準価額 sớm hơn quỹ nước ngoài một ngày, nên bán hết quỹ trong nước là mọi quỹ còn giữ
  // rơi vào `staleFunds` mỗi ngày, mãi mãi.
  const { holdings } = fundHoldingsFromTrades(trades)
  const { session, navByFund } = sessionNavs(
    src.fundPrices,
    holdings.map((h) => h.assocFundCd),
  )
  const p = buildFundPortfolio(
    [{ accountId: account.id, accountName: account.name, trades }],
    navByFund,
  )
  return {
    kind: 'funds',
    marketValue: p.marketValue,
    cost: p.fundCost,
    unrealizedPnl: p.unrealizedPnl,
    unrealizedPercent: p.unrealizedPercent,
    count: p.positions.length,
    session,
    // Quỹ Nhật không có khái niệm tiền chưa mua — xem chú thích trên interface.
    cash: null,
  }
}

export function useAccountPortfolio(
  account: AccountRow | undefined,
): AccountPortfolioState {
  // Chỉ tài khoản đầu tư mới cần bốn bảng này. Trang chi tiết gọi hook cho MỌI tài
  // khoản, nên thiếu cổng này thì mở một cái ví tiền mặt cũng kéo về cả sổ lệnh lẫn
  // bảng giá — đường mà đợt gộp danh mục không được phép chạm tới.
  const laDauTu = account?.type === 'investment'
  const { data: balances = [], isLoading: dangTaiSoDu } = useAccountBalances()
  const { data: stockTrades = [], isLoading: dangTaiLenhCoPhieu } = useStockTrades(laDauTu)
  const { data: prices = [], isLoading: dangTaiGiaCoPhieu } = useStockPrices(laDauTu)
  const { data: fundTrades = [], isLoading: dangTaiLenhQuy } = useFundTrades(laDauTu)
  const { data: navRows = [], isLoading: dangTaiGiaQuy } = useFundPrices(laDauTu)

  // Gồm cả bảng giá VÀ số dư chứ không chỉ sổ lệnh: sổ lệnh về trước mà giá chưa về
  // thì `marketValue` là null và trang khẳng định "chưa có giá cho mã nào đang giữ" —
  // một câu SAI, chỉ sống nửa giây, nhưng vẫn là câu sai. Thiếu `dangTaiSoDu` thì còn
  // một cửa sai khác: `balance` (nhánh `stocks` dưới) mặc định về 0 trong lúc
  // `useAccountBalances` chưa về, `brokerCash` từ 0 trừ tiền đã mua ra một số ÂM, và
  // trang in đúng câu "sổ lệnh đang mua nhiều hơn tiền đã nạp" — SAI theo kiểu tệ hơn
  // câu thiếu giá, vì nó buộc tội sổ lệnh trong khi sổ lệnh không có lỗi gì. Năm truy
  // vấn bật/tắt cùng nhau nên chờ cả năm không thêm trạng thái nào mới.
  const dangTai =
    laDauTu &&
    (dangTaiLenhCoPhieu || dangTaiGiaCoPhieu || dangTaiLenhQuy || dangTaiGiaQuy || dangTaiSoDu)

  // Số dư sổ là tham số brokerCash cần để ra "tiền chưa mua" — hook tự đọc, không bắt
  // trang gọi truyền vào như component Danh mục cổ phiếu cũ (đã xoá).
  const summary = useMemo(
    () =>
      accountPortfolioSummary(account, {
        balance: account ? (balances.find((b) => b.id === account.id)?.balance ?? 0) : 0,
        stockTrades,
        stockPrices: prices,
        fundTrades,
        fundPrices: navRows,
      }),
    [account, balances, stockTrades, prices, fundTrades, navRows],
  )

  // Cổng CHỜ đặt sau useMemo, không đặt trước: hook không được đổi số lời gọi hook giữa
  // hai lần render.
  if (dangTai) return undefined
  return summary
}
