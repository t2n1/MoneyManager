// Định dạng hiển thị dùng chung cho hai tab của trang Đầu tư (cổ phiếu VN, quỹ Nhật).
//
// File thuần, không JSX: hai tab dùng chung các hàm/bảng này nguyên chữ, khác nhau ở
// phần lấy dữ liệu (VND vs JPY, useInvestData vs useFundInvestData) chứ không phải ở
// cách hiển thị phần trăm, ngày, hay nhãn loại lệnh.

export const pct = (v: number) =>
  `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(1).replace('.', ',')}%`
export const share = (v: number) => `${(v * 100).toFixed(1).replace('.', ',')}%`
/**
 * Một HỆ SỐ (beta, Sharpe) — không phải tiền, không phải phần trăm.
 *
 * Hai chi tiết mà `toFixed()` trơn làm sai, và cả hai đã hiện ra trên màn thật:
 *   · dấu ÂM THẬT (−, U+2212) chứ không phải hyphen của JS. Cùng lý do ghi ở
 *     src/components/ui/Num.tsx: trong dãy mono hyphen ngắn hơn dấu cộng, nên nhãn
 *     "−0,5" ở mép thang và giá trị "-0,02" ngay trên nó trông lệch nhau.
 *   · dấu thập phân kiểu Việt (phẩy).
 *
 * `null` ra "—", không ra "0,00": beta chưa đo được không phải beta bằng 0.
 */
export const heSo = (v: number | null, soChuSo = 2): string => {
  if (v === null) return '—'
  const s = Math.abs(v).toFixed(soChuSo).replace('.', ',')
  // So sau khi LÀM TRÒN, không so `v < 0`: −0,001 làm tròn hai chữ số ra "0,00", mà
  // "−0,00" là một con số không tồn tại.
  return Number(Math.abs(v).toFixed(soChuSo)) === 0 || v > 0 ? s : `−${s}`
}

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

/**
 * Màu các lát của khu Cơ cấu — donut VÀ thanh tỷ trọng ở từng dòng dùng CHUNG bảng này,
 * nên mã nào cũng mang đúng một màu trên cả hai chỗ. Hai bảng riêng thì hai khu cạnh nhau
 * nói cùng một chuyện bằng hai màu, và người đọc phải tự bắc cầu.
 *
 * Giá trị nằm ở `--chart-slice-1..5` (src/index.css): dải cùng tông, mỗi chế độ một chiều,
 * đã đo ≥ 3:1 với nền thẻ. Xem lời giải thích ở đó trước khi đổi.
 */
export const SLICE_COLORS = [
  'var(--chart-slice-1)',
  'var(--chart-slice-2)',
  'var(--chart-slice-3)',
  'var(--chart-slice-4)',
  'var(--chart-slice-5)',
] as const

/** "Khác" và "Tiền mặt" — không phải một mã cụ thể nên không lấy màu của dải. */
export const SLICE_NEUTRAL = 'var(--fg-muted)'

/** Màu của lát thứ `i` (0-based); quá dải thì về màu trung tính. */
export const sliceColor = (i: number): string => SLICE_COLORS[i] ?? SLICE_NEUTRAL
