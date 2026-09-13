// Kiểu chung cho MỌI bộ đọc sao kê (PayPay, Rakuten, …) và cho phép ghép.
//
// Bộ đọc GẮN NHÃN `kind`; phép ghép chỉ ĐỌC nhãn. Lý do: mỗi nhà thẻ viết một kiểu —
// PayPay ghi nạp ví là `チャージ` trơn, Rakuten là `楽天キャッシュ　チャージ`. Để luật
// nhận dạng theo tên nằm trong phép ghép là mỗi lần thêm nhà thẻ phải sửa phép ghép.
//
// Thuần, không phụ thuộc React.

import type { CardBillingRange } from './cardMonthCharge'

export type LineKind =
  /** Một lần quẹt thường. */
  | 'purchase'
  /** Dòng ảo dựng từ cột 調整額 của PayPay — hoàn tiền nhà thẻ cấn vào dòng khác. */
  | 'adjustment'
  /** Nạp ví (PayPay チャージ, 楽天キャッシュ チャージ). Sổ thường ghi món tiêu, không ghi lần nạp. */
  | 'topup'
  /** PayPay `（再計算）`: nhà thẻ gói lại đơn đã sửa, không có ngày. */
  | 'recalculated'
  /** Trả góp lần ≥ 2: sổ đã ghi cả món ở lần 1, dòng này không có gì để ghép. */
  | 'installment-later'
  /** 楽天証券 mua quỹ — không phải chi tiêu, người dùng theo dõi riêng. */
  | 'investment'

export interface StatementLine {
  /** ISO. Dòng không có ngày nhận closeISO của kỳ. */
  iso: string
  /**
   * Số tiền DÙNG ĐỂ GHÉP với sổ, minor units. Âm = hoàn tiền / điều chỉnh.
   * Với trả góp lần 1 đây là GIÁ ĐẦY ĐỦ (sổ ghi cả món một lần).
   */
  amount: number
  /** Phần VÀO HOÁ ĐƠN kỳ này. Bằng `amount` trừ khi trả góp (một nửa). `total = Σ billed`. */
  billed: number
  name: string
  kind: LineKind
  /** @deprecated tương thích Đợt 1 — bằng `kind === 'adjustment'`. Xoá ở Đợt 4. */
  isAdjustment: boolean
  /** Nguồn (đuôi thẻ) — mergeStatements gắn khi gộp nhiều nguồn; reader không cần điền. */
  source?: string
}

export interface ParsedStatement {
  range: CardBillingRange
  /** PayPay: 当月お支払日 trong file. Rakuten không có cột này ⇒ bằng `range.dueISO`. */
  dueDateFromFile: string
  /** Σ `billed`. Âm = kỳ được hoàn nhiều hơn tiêu. */
  total: number
  lines: StatementLine[]
  /** true ⇒ chặn lưu: kỳ suy ra không khớp ngày trả trong file (PayPay) hoặc tên file (Rakuten). */
  dueDateMismatch: boolean
  /**
   * Nguồn trong MỘT tài khoản: đuôi số thẻ lấy từ tên file ("3737"), không có thì tên file.
   * Hai bản cùng kỳ KHÁC nguồn thì gộp (hai thẻ Rakuten cùng một tài khoản sổ); CÙNG nguồn
   * thì bản nạp sau thắng (chọn nhầm một file hai lần).
   */
  source: string
  /** Nhãn hiện cho người dùng: "Master 3737". */
  sourceLabel: string
}

/**
 * Đuôi 4 số trong ngoặc của tên file nhà thẻ; không có ngoặc thì trả chuỗi rỗng — file
 * không đánh đuôi không tách được nguồn, nên coi các bản cùng kỳ là CÙNG một nguồn
 * (bản nạp sau thắng) thay vì cộng đôi hoá đơn.
 */
export function sourceFromFileName(fileName: string): string {
  const m = fileName.match(/\((\d{4})\)/)
  return m ? m[1] : ''
}

/** Bảng đuôi → tên chỉ là NHÃN hiển thị của người dùng này; không có trong DB. */
const KNOWN_LABELS: Record<string, string> = {
  '3737': 'Master 3737',
  '2565': 'Visa 2565',
  '4342': 'PayPay 4342',
}

export function sourceLabelFor(source: string): string {
  if (source === '') return ''
  if (KNOWN_LABELS[source]) return KNOWN_LABELS[source]
  if (/^\d{4}$/.test(source)) return `Thẻ ····${source}`
  return source
}
