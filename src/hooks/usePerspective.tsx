// Góc nhìn đang xem: Cả nhà / Mình / người kia — MỘT state cho cả app, như kỳ đang xem
// (useMonthKey). Luật biến đổi giao dịch nằm ở features/sharedFund/perspective.ts.
//
// Nhớ theo MÁY (localStorage), không lưu vào hồ sơ: đây là "đang nhìn từ phía ai" của
// một lần mở app, như tab đang chọn — điện thoại xem góc của mình trong khi laptop xem
// cả nhà là chuyện bình thường, đồng bộ nó qua thiết bị là giật màn của máy kia.
//
// Chưa bật "Hai người" thì góc nhìn LUÔN là 'all', bất kể đã lưu gì: tắt công tắc đi
// mà số trên màn vẫn chỉ là một nửa sổ là lỗi âm thầm tệ nhất có thể có ở đây.
import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { parsePerspective, type Perspective } from '../features/sharedFund/perspective'
import { useProfile } from './useProfile'

const KEY = 'sct-perspective'

interface PerspectiveValue {
  /** Góc đang có hiệu lực (đã tính công tắc Hai người). */
  view: Perspective
  /** true = đã bật Hai người → công tắc được bày ra. */
  enabled: boolean
  setView: (next: Perspective) => void
}

const Ctx = createContext<PerspectiveValue | null>(null)

function readStored(): Perspective {
  try {
    return parsePerspective(localStorage.getItem(KEY))
  } catch {
    return 'all'
  }
}

export function PerspectiveProvider({ children }: { children: ReactNode }) {
  const { data: profile } = useProfile()
  const enabled = profile?.couple_mode ?? false
  const [stored, setStored] = useState<Perspective>(readStored)
  const setView = useCallback((next: Perspective) => {
    setStored(next)
    try {
      localStorage.setItem(KEY, next)
    } catch {
      // không lưu được thì chỉ sống tới lần tải lại — vẫn dùng được
    }
  }, [])
  const value = useMemo<PerspectiveValue>(
    () => ({ view: enabled ? stored : 'all', enabled, setView }),
    [enabled, stored, setView],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

const NGOAI: PerspectiveValue = { view: 'all', enabled: false, setView: () => {} }

/**
 * Góc nhìn đang xem. Ngoài provider (test, màn đăng nhập) thì là Cả nhà — KHÔNG ném lỗi
 * như useMonthKey: Cả nhà chính là hành vi trước khi có tính năng này, nên mặc định đó
 * luôn đúng, còn ném lỗi là làm vỡ mọi test dựng hook dữ liệu mà không có khung app.
 */
export function usePerspective(): PerspectiveValue {
  return useContext(Ctx) ?? NGOAI
}
