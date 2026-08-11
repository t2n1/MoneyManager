// Chế độ trình bày của toàn app: "Gọn" (visual) hay "Đầy đủ" (full).
//
//   visual — ít chữ, nhìn là hiểu. Ẩn mọi đoạn chữ chỉ để DẠY (cách tính, hướng dẫn,
//            gợi ý nhập liệu), nén câu kết luận thành chip màu ngắn, và để đồ hoạ
//            (thanh mức, chấm trạng thái, đồng hồ) nói ra tình trạng.
//   full   — như trước: có câu kết luận đầy đủ và khối "Cách tính & nên làm gì".
//
// ---- Nguồn sự thật: HỒ SƠ, không phải máy này -------------------------------------
//
// Lựa chọn nằm ở `profiles.density_pref` (migration 0040), tức đi theo NGƯỜI, đặt một
// lần dùng mọi thiết bị. Cố ý khác Sáng/Tối và Cỡ chữ — hai cái đó phụ thuộc THIẾT BỊ
// (màn hình ngoài trời, chữ to trên điện thoại) nên ở lại localStorage.
//
// File này giữ một BẢN SAO ở localStorage. Nó KHÔNG phải nguồn sự thật, chỉ để:
//
//   1. vẽ đúng ngay lần sơn đầu — hồ sơ tải bất đồng bộ, không có bản sao thì mọi màn
//      nháy qua chế độ mặc định rồi mới đổi;
//   2. đổi chế độ hiện ra TỨC THÌ khi bấm, không đợi vòng mạng;
//   3. mở app offline vẫn đúng chế độ.
//
// Đường đi: hồ sơ về → ghi vào bản sao (useDensitySync, gọi một lần ở AppLayout) →
// mọi component đọc bản sao. Bấm đổi thì ghi bản sao trước rồi mới gửi lên hồ sơ; gửi
// lỗi thì trả bản sao về giá trị cũ (useDensityControl), không để màn hình nói một
// đằng mà dữ liệu một nẻo.
//
// Vì sao là store tự viết (subscribe/notify) chứ không phải React context: chữ cần ẩn
// nằm rải khắp ~45 file, nhiều chỗ sâu trong cây. Context thì phải bọc provider rồi
// truyền qua mọi ranh giới lazy; store ngoài React thì file nào cần chỉ việc gọi hook.

export type DensityPref = 'visual' | 'full'

const STORAGE_KEY = 'density'

/** Phải KHỚP `default 'visual'` của cột ở migration 0040 — lệch nhau thì người dùng
 *  mới thấy app nhảy chế độ ngay khi hồ sơ về. */
export const DEFAULT_DENSITY: DensityPref = 'visual'

/**
 * Đọc một giá trị bất kỳ về một trong hai chế độ.
 *
 * Dùng cho CẢ bản sao ở máy và cột `density_pref` từ DB: cột là `text` nên kiểu của nó
 * rộng hơn ràng buộc thật, và một bản ghi cũ/lạ không được phép làm trắng màn hình.
 */
export function parseDensity(raw: string | null | undefined): DensityPref {
  return raw === 'visual' || raw === 'full' ? raw : DEFAULT_DENSITY
}

/**
 * Chế độ mà HỒ SƠ đang nói, hoặc `null` khi nó chưa nói gì.
 *
 * Khác `parseDensity` ở đúng một chỗ, và chỗ đó là một lỗi đã xảy ra thật: `undefined`
 * phải ra `null`, KHÔNG ra giá trị mặc định.
 *
 * Vì sao: `useProfile` đặt `staleTime: Infinity` và cache được lưu xuống localStorage
 * (24h), nên một máy có thể đang giữ bản hồ sơ tải TRƯỚC migration 0040 — bản đó không
 * có cột `density_pref`. Nếu coi "thiếu cột" là "visual" thì `useDensitySync` sẽ ghi đè
 * bản sao ở máy về Gọn, kể cả khi người dùng đã chọn Đầy đủ ở máy khác. Và vì hồ sơ
 * không tự refetch (staleTime Infinity), nó ép như vậy suốt cho tới khi cache hết hạn.
 *
 * Trả `null` thì bản sao ở máy được giữ nguyên, và giá trị thật thắng ngay khi có lượt
 * fetch hồ sơ mới (đăng nhập lại, invalidate sau khi bấm đổi, hoặc cache hết hạn).
 *
 * Chuỗi RÁC thì vẫn về mặc định: DB có `check in ('visual','full')` nên giá trị lạ là
 * bất thường, và lúc đó mặc định là ứng xử an toàn — khác hẳn với "cột chưa tồn tại".
 */
export function densityFromProfile(raw: unknown): DensityPref | null {
  if (typeof raw !== 'string') return null
  return parseDensity(raw)
}

function readMirror(): DensityPref {
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

/** Chế độ đang áp dụng, đọc từ bản sao ở máy. */
export function getMirroredDensity(): DensityPref {
  if (current === null) current = readMirror()
  return current
}

/**
 * Ghi bản sao ở máy rồi báo cho mọi component đang nghe.
 *
 * TRÙNG GIÁ TRỊ THÌ THOÁT NGAY, và đó không phải tối ưu cho vui: `useDensitySync` chạy
 * mỗi lần hồ sơ đổi tham chiếu, còn hook đọc thì có ở hàng chục component. Không chặn
 * ở đây thì một lần đồng bộ vô nghĩa cũng kéo cả cây render lại.
 */
export function setMirroredDensity(next: DensityPref) {
  if (getMirroredDensity() === next) return
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
