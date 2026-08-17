// Kỳ đang xem — MỘT state cho cả app, thay ba bản useState giống hệt nhau ở Sổ,
// Ngân sách và Báo cáo.
//
// Vì sao phải gom: bản redesign 1a đưa bộ đổi tháng lên top bar (§3), và §5.0 nói ba
// đường đổi tháng — nút ‹ › ở top bar, bấm cột trong biểu đồ dòng tiền, bấm dòng trong
// bảng tháng — "cùng ghi vào một state kỳ báo cáo". Nút ở khung app thì KHÔNG thể đọc
// state nằm trong trang: nó đứng ngoài trang, và người dùng còn đổi trang mà vẫn muốn
// giữ nguyên tháng đang xem.
//
// Vì sao là context chứ không phải query string: đổi trang là mất query string (mỗi
// route một location), nên `?ym=` giữ được deep-link nhưng KHÔNG giữ được "tháng đang
// xem" khi bấm từ Sổ sang Ngân sách — đúng thứ §5.0 đòi. Query string vẫn được đọc làm
// ĐƯỜNG VÀO (thông báo đẩy và mấy thẻ báo cáo đang sinh link `?ym=`), chỉ không còn là
// nơi cất giữ.
//
// `null` = "kỳ hiện tại", tính lười theo `month_start_day`. Giữ đúng quy ước của ba bản
// useState cũ: hồ sơ tải async nên chốt cứng một MonthKey lúc khởi tạo là chốt nhầm kỳ
// với ngày bắt đầu tháng ≠ 1.
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { addMonths, monthKeyForDate, toISODate, type MonthKey } from '../lib/dates'
import { useProfile } from './queries'

interface MonthKeyValue {
  /** null = đang bám "kỳ hiện tại" chứ chưa ghim tháng nào. */
  monthKey: MonthKey | null
  /** Kỳ đang xem, đã giải null theo month_start_day. Dùng cái này để truy vấn. */
  activeMonthKey: MonthKey
  /** Đặt thẳng một kỳ (bấm dòng trong bảng tháng, chọn từ dải tháng). */
  setMonthKey: (next: MonthKey | null) => void
  /** Lùi/tiến `delta` tháng kể từ kỳ đang xem (nút ‹ ›, phím ←/→, tab Tháng bước 12). */
  stepMonth: (delta: number) => void
}

const Ctx = createContext<MonthKeyValue | null>(null)

/** "YYYY-MM" → MonthKey; null nếu không hợp lệ. Cố ý KHÔNG dùng parseMonthKey của
 *  lib/dates: hàm đó tin chuỗi đã đúng, còn đây đọc thứ người ngoài đưa vào (URL). */
export function parseYm(s: string | null): MonthKey | null {
  if (!s) return null
  const [y, m] = s.split('-').map(Number)
  if (!y || !m || m < 1 || m > 12) return null
  return { year: y, month: m }
}

export function MonthKeyProvider({ children }: { children: ReactNode }) {
  const [searchParams] = useSearchParams()
  const [pinned, setPinned] = useState<MonthKey | null>(null)
  const { data: profile } = useProfile()
  const monthStartDay = profile?.month_start_day ?? 1

  // Đường vào từ URL. Chỉ nhận khi GIÁ TRỊ TRONG URL đổi, không phải mỗi lần render:
  // đọc vô điều kiện thì URL luôn thắng và người dùng bấm ‹ › xong bị kéo ngược lại;
  // đọc đúng một lần lúc mount thì mở một link `?ym=` thứ hai trong cùng phiên lại
  // không có tác dụng. So với lần đọc TRƯỚC là đúng cả hai ca.
  const ym = searchParams.get('ym')
  const lastYm = useRef<string | null>(null)
  if (ym !== lastYm.current) {
    lastYm.current = ym
    const fromUrl = parseYm(ym)
    // Cập nhật trong lúc render (không phải trong effect) là mẫu React khuyên dùng cho
    // "state bám theo prop": tránh một lượt sơn bằng tháng cũ rồi nhảy sang tháng mới.
    if (fromUrl) setPinned(fromUrl)
  }

  const activeMonthKey = pinned ?? monthKeyForDate(toISODate(new Date()), monthStartDay)

  const stepMonth = useCallback(
    (delta: number) =>
      setPinned((cur) => addMonths(cur ?? monthKeyForDate(toISODate(new Date()), monthStartDay), delta)),
    [monthStartDay],
  )

  const value = useMemo<MonthKeyValue>(
    () => ({ monthKey: pinned, activeMonthKey, setMonthKey: setPinned, stepMonth }),
    [pinned, activeMonthKey, stepMonth],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

/**
 * Kỳ đang xem. Gọi được ở bất cứ đâu trong AppLayout — cả trang lẫn khung app.
 *
 * Ném lỗi khi thiếu provider thay vì trả về mặc định: một trang tự tính lấy tháng hôm
 * nay rồi chạy tiếp là loại hỏng ÂM THẦM tệ nhất ở đây — màn hình vẫn đầy số, chỉ là
 * số của tháng khác với cái ghi trên top bar.
 */
export function useMonthKey(): MonthKeyValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('useMonthKey phải nằm trong <MonthKeyProvider> (AppLayout dựng nó)')
  return v
}
