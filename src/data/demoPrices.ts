// Lịch sử giá GIẢ cho chế độ demo — thuần, tất định, không lưu đâu cả.
//
// Vì sao sinh lúc chạy chứ không seed vào localStorage như mọi bảng demo khác: một năm
// phiên × vài mã đã là hơn nghìn dòng, và bộ nhớ đệm của app đã persist sang localStorage
// (xem ghi chú cache-persist). Nhét lịch sử giá vào đó là đổi vài trăm KB để lấy một biểu
// đồ xem thử.
//
// Tất định là điều kiện, không phải tuỳ chọn: `Math.random()` sẽ làm biểu đồ nhảy hình
// mỗi lần render, và không ai chụp lại được một lỗi hiển thị.

/** Băm tên mã thành hạt giống — cùng mã luôn ra cùng một đường. */
function hatGiong(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** mulberry32 — nhỏ, tất định, đủ tốt cho một đường giả. */
function bocNgauNhien(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Các phiên (thứ Hai → thứ Sáu) từ `from` tới `to`, tăng dần. Bỏ qua nghỉ lễ — là demo. */
export function demoSessions(from: string, to: string): string[] {
  const out: string[] = []
  const d = new Date(`${from}T00:00:00Z`)
  const het = Date.parse(`${to}T00:00:00Z`)
  while (d.getTime() <= het) {
    const thu = d.getUTCDay()
    if (thu !== 0 && thu !== 6) out.push(d.toISOString().slice(0, 10))
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return out
}

/**
 * Bước ngẫu nhiên tất định, CHUẨN HOÁ để phiên cuối bằng đúng `endValue`.
 *
 * Chuẩn hoá ở cuối chứ không ở đầu: phiên cuối là con số người dùng đang thấy trên màn
 * (giá hiện tại, hoặc điểm VN-Index). Để nó lệch thì hai chỗ trên cùng một trang nói hai
 * số khác nhau — đúng lỗi mà cả trang này sinh ra để tránh.
 */
export function demoWalk(seed: string, n: number, endValue: number, vol: number): number[] {
  if (n <= 0) return []
  const rng = bocNgauNhien(hatGiong(seed))
  const w: number[] = [1]
  for (let i = 1; i < n; i++) {
    w.push(w[i - 1] * (1 + (rng() - 0.5) * vol + 0.0004))
  }
  const cuoi = w[n - 1]
  return w.map((x) => Math.max(1, Math.round((endValue * x) / cuoi)))
}
