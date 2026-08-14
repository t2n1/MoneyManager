// Nối `lib/loadProgress.ts` vào react-query.
//
// Chia hai state chứ không gộp: `burst` đổi theo số query, `visible` đổi theo ĐỒNG HỒ.
// Ngưỡng 800ms không tự tới trong lúc không có gì đổi, nên phải có hẹn giờ riêng đánh
// thức — thiếu nó thì một đợt tải mà số query đứng yên sẽ không bao giờ hiện nút.
import { useIsFetching } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import {
  advanceBurst,
  burstPercent,
  IDLE_BURST,
  PROGRESS_DELAY_MS,
  shouldShowProgress,
  type BurstState,
} from '../lib/loadProgress'

/** Phần trăm của đợt tải đang chạy, hoặc null khi rảnh / chưa đủ lâu để đáng hiện. */
export function useLoadProgress(): number | null {
  const inFlight = useIsFetching()
  const [burst, setBurst] = useState<BurstState>(IDLE_BURST)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    setBurst((prev) => advanceBurst(prev, inFlight, Date.now()))
  }, [inFlight])

  useEffect(() => {
    if (burst.startedAt === null) {
      setVisible(false)
      return
    }
    if (shouldShowProgress(burst, Date.now())) {
      setVisible(true)
      return
    }
    const remain = burst.startedAt + PROGRESS_DELAY_MS - Date.now()
    const t = setTimeout(() => setVisible(true), remain)
    return () => clearTimeout(t)
    // Chỉ phụ thuộc `startedAt`: đó là thứ duy nhất quyết định lúc nào tới ngưỡng. Để cả
    // `burst` vào đây thì mỗi query xong lại đặt lại hẹn giờ, và ngưỡng bị lùi mãi.
  }, [burst.startedAt]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!visible || burst.startedAt === null) return null
  return burstPercent(burst)
}
