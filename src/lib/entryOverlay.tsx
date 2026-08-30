// Màn Nhập giao dịch mở theo HAI kiểu, và chỗ này là nơi duy nhất phân biệt chúng.
//
//   Trang đầy đủ  — `/entry` như mọi đường khác. Đây là kiểu MẶC ĐỊNH: mọi link trỏ
//                   vào màn nhập (Nợ, Sắp chi, Định kỳ, Lịch, thông báo đẩy, mở thẳng
//                   URL) đều ra kiểu này, ở mọi cỡ màn.
//   Lớp phủ       — chỉ khi nút "+ Giao dịch" trên thanh trên bấm vào. Thanh đó
//                   `hidden … lg:flex` nên chỉ có từ 1024px trở lên; nút "+" của thanh
//                   tab dưới (`lg:hidden`) KHÔNG đi đường này. Nhờ hai nút loại trừ
//                   nhau theo cỡ màn, "máy tính thì popup, điện thoại thì giữ nguyên"
//                   không cần đo bề rộng ở đâu cả.
//
// Vì sao vẫn đi qua đường `/entry` thay vì bật/tắt bằng một biến state: để nút Back
// (trình duyệt và cả nút Back của máy) đóng được lớp phủ. Bật/tắt bằng biến thì Back
// nhảy khỏi trang đang xem — mất chỗ, mà lớp phủ vẫn còn.
import { createContext, useCallback, useContext, type ReactNode } from 'react'
import { useLocation, useNavigate, type Location } from 'react-router-dom'

/** Màn đang xem lúc bấm "+", nhét vào history state của mục `/entry`. */
export interface EntryOverlayState {
  background?: Location
}

// Cái bẫy khiến context này phải tồn tại: `<Routes location={…}>` KHÔNG chỉ đổi route
// nào khớp — nó thay luôn location context cho CẢ CÂY CON. App vẽ màn nền bằng đúng
// cách đó, nên `useLocation()` trong AppLayout (và mọi thứ dưới nó) trả về màn NỀN,
// state rỗng, không còn dấu vết nào của `/entry`. Đo được: bấm "+" thì URL sang
// `/entry` và màn nền vẽ đúng, nhưng cái hộp không bao giờ hiện vì AppLayout tưởng
// mình đang ở `/so`.
//
// Nên App — đứng NGOÀI phần bị ghi đè — chốt location thật vào đây một lần.
const TrueLocationContext = createContext<Location | null>(null)

export function TrueLocationProvider({ children }: { children: ReactNode }) {
  const location = useLocation()
  return <TrueLocationContext.Provider value={location}>{children}</TrueLocationContext.Provider>
}

/** Location theo THANH ĐỊA CHỈ, không phải location đã bị `<Routes location>` thay. */
export function useTrueLocation(): Location {
  const provided = useContext(TrueLocationContext)
  // Fallback cho cây chưa có provider (App gọi trước khi tự dựng nó ra).
  const fallback = useLocation()
  return provided ?? fallback
}

/**
 * Màn nền phải vẽ bên dưới lớp phủ, hoặc `undefined` khi đây là trang đầy đủ.
 *
 * Sống qua F5: react-router phục hồi `history.state`, nên tải lại trang lúc đang mở
 * lớp phủ vẫn ra đúng màn nền + lớp phủ.
 */
export function useEntryBackground(): Location | undefined {
  const location = useTrueLocation()
  const background = (location.state as EntryOverlayState | null)?.background
  // Chặn ca tự trỏ vào mình: đang ở TRANG ĐẦY ĐỦ `/entry` mà bấm "+" trên thanh trên
  // thì màn nền cũng là `/entry` — vẽ ra sẽ là màn nhập chồng lên màn nhập.
  if (!background || background.pathname === location.pathname) return undefined
  return background
}

/** Bấm "+" trên thanh trên: mở màn nhập ĐÈ LÊN màn đang xem. */
export function useOpenEntryOverlay(): () => void {
  const navigate = useNavigate()
  // `useTrueLocation` chứ không `useLocation`: thanh trên nằm trong cây đã bị ghi đè.
  const location = useTrueLocation()
  // Bấm "+" khi hộp ĐANG mở (bàn phím tới được nút, dù chuột bị lớp phủ chặn) thì giữ
  // nguyên màn nền cũ. Lấy `/entry` làm nền là nền tự trỏ vào chính nó — cổng chống
  // tự-trỏ ở useEntryBackground sẽ đóng hộp và bung ra trang đầy đủ.
  const background = useEntryBackground()
  const from = background ?? location
  return useCallback(() => {
    const state: EntryOverlayState = { background: from }
    navigate('/entry', { state })
  }, [navigate, from])
}
