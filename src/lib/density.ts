// Chế độ trình bày của toàn app: "Gọn" (visual) hay "Đầy đủ" (full).
//
//   visual — ít chữ, nhìn là hiểu. Ẩn mọi đoạn chữ chỉ để DẠY (cách tính, hướng dẫn,
//            gợi ý nhập liệu), nén câu kết luận thành chip màu ngắn, và để đồ hoạ
//            (thanh mức, chấm trạng thái, đồng hồ) nói ra tình trạng.
//   full   — như trước: có câu kết luận đầy đủ và khối "Cách tính & nên làm gì".
//
// MẶC ĐỊNH là 'visual': app này một người dùng, và người đó đã đọc hết hướng dẫn rồi.
// Ai cần đọc lại thì bật Đầy đủ trong Cài đặt → Cách trình bày.
//
// Lưu ở localStorage (không phải hồ sơ người dùng) vì đây là ý thích khi NHÌN, giống
// Cỡ chữ và Sáng/Tối: cùng một người có thể muốn máy tính hiện đầy đủ mà điện thoại
// hiện gọn.
//
// Vì sao là store tự viết (subscribe/notify) chứ không phải React context: chữ cần ẩn
// nằm rải khắp ~45 file, nhiều chỗ sâu trong cây và vài chỗ render ngoài <App/> (sheet
// trượt lên). Context thì phải bọc provider rồi truyền qua mọi ranh giới lazy; store
// ngoài React thì file nào cần chỉ việc gọi hook, và `getDensity()` còn đọc được từ
// code thuần (không phải component) nếu sau này cần.

export type DensityPref = 'visual' | 'full'

const STORAGE_KEY = 'density'

export const DEFAULT_DENSITY: DensityPref = 'visual'

/** Đọc giá trị đã lưu; rác hoặc chưa có thì về mặc định. Tách riêng để test được. */
export function parseDensity(raw: string | null | undefined): DensityPref {
  return raw === 'visual' || raw === 'full' ? raw : DEFAULT_DENSITY
}

function readStored(): DensityPref {
  try {
    return parseDensity(localStorage.getItem(STORAGE_KEY))
  } catch {
    // Safari chế độ riêng tư / môi trường không có localStorage
    return DEFAULT_DENSITY
  }
}

// null = chưa đọc lần nào. Đọc muộn (không phải lúc import) để module này nạp được
// trong test chạy ở môi trường node, nơi không có `localStorage`.
let current: DensityPref | null = null
const listeners = new Set<() => void>()

export function getDensity(): DensityPref {
  if (current === null) current = readStored()
  return current
}

export function setDensity(next: DensityPref) {
  current = next
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // Không lưu được thì vẫn đổi trong phiên này
  }
  // Chép ra mảng trước khi gọi. Lặp trực tiếp trên Set thì phần tử được THÊM giữa lượt
  // lặp cũng bị đi qua ngay trong lượt đó — mà chuyện đó xảy ra thật: một component
  // hiện ra vì chính lần đổi này rồi tự đăng ký nghe. Nếu nó lại đăng ký thêm thì vòng
  // lặp không dừng.
  for (const fn of [...listeners]) fn()
}

export function subscribeDensity(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** CHỈ dùng trong test: quên giá trị đã đọc để lần sau lấy lại từ localStorage. */
export function resetDensityCache() {
  current = null
}
