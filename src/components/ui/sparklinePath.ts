// Toạ độ cho đường xu hướng tí hon. Tách khỏi component để test được bằng chuỗi.
//
// Không dùng recharts: 12 điểm mà gọi cả thư viện thì vừa nặng vừa phải chống lại margin,
// trục và tooltip mặc định của nó — trong khi thứ cần vẽ chỉ là một đường gấp khúc.

/** Trả null khi chưa đủ hai điểm để nối thành đường. */
export function sparklinePath(values: number[], width: number, height: number): string | null {
  if (values.length < 2) return null

  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min
  const stepX = width / (values.length - 1)

  const points = values.map((v, i) => {
    const x = Math.round(i * stepX * 100) / 100
    // Mọi giá trị bằng nhau: đặt đường vào giữa thay vì chia cho 0.
    // Trục y của SVG hướng XUỐNG nên phải lật: giá trị lớn nhất → y = 0 (trên đỉnh).
    const y = span === 0 ? height / 2 : Math.round((1 - (v - min) / span) * height * 100) / 100
    return `${x},${y}`
  })

  return `M${points[0]} ${points
    .slice(1)
    .map((p) => `L${p}`)
    .join(' ')}`
}
