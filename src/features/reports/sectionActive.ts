// Phần "chọn khối nào đang xem" của mục lục — tách khỏi React để test được.
//
// Vì sao phải tách: mọi cách phát hiện vị trí cuộn (IntersectionObserver, sự kiện
// scroll) đều gắn với vòng dựng khung hình của trình duyệt, nên ở môi trường không
// compose frame thì KHÔNG có callback nào nổ — đã đo tận nơi: quan sát một phần tử rồi
// cuộn nó vào khung, IO không chạy lấy một lần (kể cả callback khởi tạo mà spec bắt
// buộc), và `scroll` cũng im dù `scrollTop` đổi thật. Tức là phần dây nối không kiểm
// bằng máy được. Phần QUYẾT ĐỊNH thì kiểm được, và nó mới là chỗ dễ sai.

export interface SectionTop {
  id: string
  /** Mép trên của khối so với khung nhìn (như getBoundingClientRect().top). */
  top: number
}

/**
 * Khối đang xem = khối CUỐI CÙNG đã cuộn qua vạch `cutoff` (đáy của mục lục dính).
 *
 * Không chọn "khối đầu tiên còn nhìn thấy": khi khối 3 chiếm gần hết màn hình thì khối 4
 * vừa nhô lên ở đáy cũng "nhìn thấy được", và mục lục sẽ nhảy sang 4 trong khi mắt vẫn
 * đang đọc 3.
 *
 * Chưa cuộn tới khối nào (mọi khối còn nằm dưới vạch) → khối đầu, vì đó là cái người
 * dùng đang nhìn.
 */
export function pickActive(tops: readonly SectionTop[], cutoff: number): string | null {
  if (tops.length === 0) return null
  let current = tops[0]
  for (const t of tops) {
    if (t.top <= cutoff) current = t
  }
  return current.id
}
