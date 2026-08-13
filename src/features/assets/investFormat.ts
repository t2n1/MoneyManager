// Định dạng hiển thị dùng chung cho hai tab của trang Đầu tư (cổ phiếu VN, quỹ Nhật).
//
// File thuần, không JSX: hai tab dùng chung các hàm/bảng này nguyên chữ, khác nhau ở
// phần lấy dữ liệu (VND vs JPY, useInvestData vs useFundInvestData) chứ không phải ở
// cách hiển thị phần trăm, ngày, hay nhãn loại lệnh.

export const pct = (v: number) =>
  `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(1).replace('.', ',')}%`
export const share = (v: number) => `${(v * 100).toFixed(1).replace('.', ',')}%`
/** ISO → yy/mm/dd theo quy ước tháng/ngày của app (lib/dates.ts). Sổ lệnh trải nhiều năm nên phải có năm. */
export const ngay = (iso: string) => `${iso.slice(2, 4)}/${iso.slice(5, 7)}/${iso.slice(8, 10)}`

// StockTradeRow['kind'] và FundTradeRow['kind'] cùng giải ra một union — đặt tên chung để
// hai tab không phải tự khai lại bảng nhãn/màu cho cùng ba loại lệnh.
export type TradeKind = 'buy' | 'sell' | 'adjust'

export const KIND_LABEL: Record<TradeKind, string> = {
  buy: 'Mua',
  sell: 'Bán',
  adjust: 'Điều chỉnh',
}
export const KIND_CLASS: Record<TradeKind, string> = {
  buy: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200',
  sell: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200',
  adjust: 'bg-surface-sunken text-fg-secondary',
}
