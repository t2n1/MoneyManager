// Logic thuần cho ô số tiền: gõ phím + tính biểu thức.
// Tiền ở đơn vị nhỏ nhất (số nguyên); tính trái→phải, làm tròn kết quả cuối.

const OPERATORS = ['+', '−', '×', '÷'] as const

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
  return Math.round(acc)
}
