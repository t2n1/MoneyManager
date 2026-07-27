// Logic thuần cho ô số tiền: gõ phím + tính biểu thức.
// Tiền ở đơn vị nhỏ nhất (số nguyên); tính trái→phải, làm tròn kết quả cuối.

import { formatMoney, type CurrencyCode } from './money'

const OPERATORS = ['+', '−', '×', '÷'] as const

export const hasOperator = (expr: string) => /[+−×÷]/.test(expr)

/** Biểu thức → chuỗi hiển thị: mỗi số định dạng như tiền, nối bằng dấu có khoảng trắng. */
export function formatExpr(expr: string, currency: CurrencyCode): string {
  return expr
    .replace(/\d+/g, (n) => formatMoney(Number(n), currency))
    .replace(/([+−×÷])/g, ' $1 ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Tính biểu thức trên số nguyên, trái→phải, làm tròn kết quả cuối.
 * Trả null nếu chia cho 0. Biểu thức trống → 0. Bỏ dấu phép tính thừa ở đầu/cuối.
 */
export function evalExpression(expr: string): number | null {
  const ops = OPERATORS as readonly string[]
  let s = expr
  while (s.length > 0 && ops.includes(s[s.length - 1])) s = s.slice(0, -1)
  while (s.length > 0 && ops.includes(s[0])) s = s.slice(1)
  if (s === '') return 0

  const tokens = s.match(/\d+|[+−×÷]/g)
  if (!tokens) return 0

  let acc = Number(tokens[0])
  for (let i = 1; i < tokens.length; i += 2) {
    const op = tokens[i]
    const num = Number(tokens[i + 1])
    if (op === '+') acc += num
    else if (op === '−') acc -= num
    else if (op === '×') acc *= num
    else if (op === '÷') {
      if (num === 0) return null
      acc /= num
    }
  }
  const rounded = Math.round(acc)
  return Number.isSafeInteger(rounded) ? rounded : null
}

export const MAX_AMOUNT_DIGITS = 12
export const MAX_EXPR_LENGTH = 40

/**
 * Áp một phím bấm vào biểu thức, trả biểu thức mới.
 * Phím: '0'..'9', '00', '000', '+', '−', '×', '÷', '⌫'.
 */
export function appendKey(expr: string, key: string): string {
  if (key === '⌫') return expr.slice(0, -1)

  const ops = OPERATORS as readonly string[]
  if (ops.includes(key)) {
    if (expr === '') return expr // không cho bắt đầu bằng dấu
    if (ops.includes(expr[expr.length - 1])) return expr.slice(0, -1) + key // thay dấu cuối
    if (expr.length + key.length > MAX_EXPR_LENGTH) return expr
    return expr + key
  }

  if (!/^\d+$/.test(key)) return expr // phím lạ → bỏ qua
  const currentNum = expr.match(/\d+$/)?.[0] ?? ''
  if (currentNum.length + key.length > MAX_AMOUNT_DIGITS) return expr
  if (expr.length + key.length > MAX_EXPR_LENGTH) return expr
  return (expr + key).replace(/(^|[+−×÷])0+(?=\d)/g, '$1') // bỏ 0 vô nghĩa đầu mỗi số
}
