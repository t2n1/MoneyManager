import { useEffect, useState } from 'react'

/**
 * Kiểu tối thiểu của `MediaQueryList` (trả về của `window.matchMedia`) mà phần THUẦN bên
 * dưới cần — không kéo theo kiểu đầy đủ của `lib.dom`, để test được ở môi trường không có
 * `window` (repo không có jsdom/happy-dom/@testing-library, xem `useMediaQuery.test.ts`).
 */
export interface MediaQueryLike {
  matches: boolean
  addEventListener(type: 'change', listener: () => void): void
  removeEventListener(type: 'change', listener: () => void): void
}

/**
 * Phần THUẦN của `useMediaQuery`: gắn một listener "đổi trạng thái" vào `mq`, gọi `onChange`
 * ngay một lần với trạng thái hiện tại (không đợi sự kiện đầu tiên), rồi mỗi khi `mq` đổi.
 * Trả về hàm HUỶ ĐĂNG KÝ.
 *
 * Tách khỏi hook để test được mà không cần dựng React/DOM: hook bên dưới chỉ còn mỗi việc
 * treo state của React lên đúng hàm này (`useState`/`useEffect` gọi thẳng nó).
 */
export function subscribeMediaQuery(mq: MediaQueryLike, onChange: (matches: boolean) => void): () => void {
  const listener = () => onChange(mq.matches)
  listener()
  mq.addEventListener('change', listener)
  return () => mq.removeEventListener('change', listener)
}

/**
 * Đăng ký một media query, trả về true/false theo trạng thái HIỆN TẠI và tự cập nhật khi
 * nó đổi — đổi kích cỡ cửa sổ, xoay máy, hoặc (với truy vấn viết bằng `rem`) đổi Cài đặt →
 * Cỡ chữ, vì đó đổi `font-size` gốc mà `rem` trong truy vấn tính theo (xem
 * `src/lib/fontScale.ts`, `--app-font-scale` trên `<html>`).
 *
 * KHÔNG dùng hook này để quyết định RENDER cái gì. Lần vẽ đầu (trước khi effect bên dưới
 * kịp gắn listener) chỉ đọc đúng MỘT lần bằng `matchMedia(query).matches` — không sai ở
 * SSR/hydrate như đọc `innerWidth` trong lúc render, nhưng vẫn là một phép đo có thể trễ
 * một nhịp. Cho một quyết định LAYOUT, trễ một nhịp là một MÀN HÌNH SAI nhìn thấy được, nên
 * layout phải ở CSS thuần. Cho một quyết định TẢI DỮ LIỆU (`enabled` của TanStack Query),
 * trễ một nhịp chỉ trễ hoặc bỏ một lượt tải rồi tự sửa ở lượt render kế — an toàn. Xem lời
 * ghi ở chỗ dùng (`TuongLaiPage.tsx`, cổng console).
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() =>
    typeof window === 'undefined' ? false : window.matchMedia(query).matches,
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    return subscribeMediaQuery(window.matchMedia(query), setMatches)
  }, [query])

  return matches
}
