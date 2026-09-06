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

/** Một phiên mà đường giả BUỘC phải đi qua đúng con số đã biết. */
export interface DemoAnchor {
  /** Vị trí trong mảng phiên. */
  index: number
  value: number
}

/**
 * Bước ngẫu nhiên tất định, KÉO qua những điểm neo.
 *
 * Phiên cuối luôn bằng đúng `endValue` — đó là con số người dùng đang thấy trên màn (giá
 * hiện tại, hoặc điểm VN-Index). Để nó lệch thì hai chỗ trên cùng một trang nói hai số
 * khác nhau, đúng lỗi mà cả trang Đầu tư sinh ra để tránh.
 *
 * `anchors` là những phiên có LỆNH MUA trong sổ demo. Không neo vào đó thì ngày mua, tiền
 * đổi thành cổ phiếu ở giá trong sổ lệnh còn danh mục được định giá theo đường giả — hai
 * con số không liên quan gì nhau, và biểu đồ hiện một vách dựng đứng ngay hôm mua. Ở dữ
 * liệu THẬT chuyện đó không xảy ra (giá phiên hôm mua chính là giá mua), nên một bản demo
 * có vách là bản demo nói sai về tính năng.
 *
 * Cách kéo: hiệu chỉnh HÌNH HỌC theo từng đoạn giữa hai neo, nên đường vẫn giữ nguyên độ
 * gồ ghề của bước ngẫu nhiên mà hai đầu đoạn khớp đúng.
 */
export function demoWalk(
  seed: string,
  n: number,
  endValue: number,
  vol: number,
  anchors: DemoAnchor[] = [],
): number[] {
  if (n <= 0) return []
  const rng = bocNgauNhien(hatGiong(seed))
  const w: number[] = [1]
  for (let i = 1; i < n; i++) {
    w.push(w[i - 1] * (1 + (rng() - 0.5) * vol + 0.0004))
  }

  const moc = [
    ...anchors.filter((a) => a.index >= 0 && a.index < n - 1).sort((a, b) => a.index - b.index),
    { index: n - 1, value: endValue },
  ]

  const out = new Array<number>(n)
  // Trước neo đầu tiên: cùng một hệ số với chính neo đó. Nội suy về "không hệ số" ở phiên
  // 0 sẽ bịa ra một cú lao vô nghĩa ở mép trái.
  const dau = moc[0]
  const heSoDau = dau.value / w[dau.index]
  for (let i = 0; i < dau.index; i++) out[i] = Math.max(1, Math.round(w[i] * heSoDau))

  let truoc = dau
  out[dau.index] = Math.max(1, Math.round(w[dau.index] * heSoDau))
  for (const sau of moc.slice(1)) {
    const a = truoc.value / w[truoc.index]
    const b = sau.value / w[sau.index]
    const span = sau.index - truoc.index
    for (let i = truoc.index + 1; i <= sau.index; i++) {
      const t = (i - truoc.index) / span
      out[i] = Math.max(1, Math.round(w[i] * a ** (1 - t) * b ** t))
    }
    truoc = sau
  }

  return out
}
