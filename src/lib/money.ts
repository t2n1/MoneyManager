// Tiền VND luôn là số nguyên đồng (khớp bigint trong DB). Không dùng float.

/** 1234000 → "1.234.000 ₫" */
export function formatVND(amount: number): string {
  const sign = amount < 0 ? '-' : ''
  const digits = Math.trunc(Math.abs(amount)).toString()
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${sign}${grouped} ₫`
}

/** "1.234.000 ₫" → 1234000. Chuỗi không có chữ số → 0. */
export function parseVND(input: string): number {
  const digits = input.replace(/\D/g, '')
  return digits === '' ? 0 : Number(digits)
}
