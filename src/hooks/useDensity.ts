import { useSyncExternalStore } from 'react'
import {
  getDensity,
  setDensity,
  subscribeDensity,
  type DensityPref,
} from '../lib/density'

/**
 * Đọc/ghi chế độ trình bày (Gọn / Đầy đủ).
 *
 * `useSyncExternalStore` chứ không phải `useState`: mỗi component chỉ đọc, còn nguồn
 * sự thật nằm ngoài React (xem src/lib/density.ts). Nhờ vậy bấm đổi ở Cài đặt là MỌI
 * chỗ đang hiện chữ hướng dẫn cùng ẩn/hiện trong một lần render, không cần reload —
 * nếu mỗi component giữ state riêng thì chỉ cái vừa bấm đổi.
 *
 * `visual` là thứ hầu hết chỗ gọi cần, nên trả sẵn để khỏi lặp `pref === 'visual'`.
 */
export function useDensity(): {
  pref: DensityPref
  visual: boolean
  setDensity: (next: DensityPref) => void
} {
  const pref = useSyncExternalStore(subscribeDensity, getDensity)
  return { pref, visual: pref === 'visual', setDensity }
}
