// Chú thích tháng có chuyến đi + đường lùi duy nhất (bỏ đánh dấu) — spec chuyen-di §5.3.
//
// KHÔNG bọc <Guide>: Guide biến mất ở chế độ Gọn (mặc định của app), mà câu này là
// cảnh-báo-dữ-liệu-không-so-được — đúng nhóm "ĐỪNG bọc" trong chú thích đầu Guide.tsx.
// Bài học từ ChiChuaGhiLine (mục 1): dòng cảnh báo bọc Guide là vô hình với gần như
// mọi người dùng.
import { Num } from '../../components/ui'
import { useDeleteTrip } from '../../hooks/queries'
import { addDaysISO } from '../../lib/dates'
import type { TripRow } from '../../types/database.types'

export function GhiChuChuyenDi({
  trips,
  range,
}: {
  trips: readonly TripRow[]
  /** Kỳ đang xem — `end` là mốc LOẠI TRỪ, cùng quy ước MonthRange. */
  range: { start: string; end: string }
}) {
  const deleteTrip = useDeleteTrip()
  // Chuyến GIAO với kỳ đang xem (end loại trừ nên vế trái so bằng <, không phải <=)
  const trongKy = trips.filter(
    (t) => !t.dismissed && t.start_on < range.end && t.end_on >= range.start,
  )
  if (trongKy.length === 0) return null

  // Đếm phần nằm TRONG kỳ — chuyến vắt tháng chỉ tính phần của tháng này.
  let soNgay = 0
  for (const t of trongKy) {
    for (let d = t.start_on; d <= t.end_on; d = addDaysISO(d, 1)) {
      if (d >= range.start && d < range.end) soNgay++
    }
  }

  return (
    <p className="mb-2 text-sm text-fg-warn">
      <Num tone="neutral" className="text-inherit">
        {soNgay}
      </Num>{' '}
      ngày đi vắng trong kỳ — tổng Chi không so được với tháng thường.{' '}
      {/* Đường lùi đứng ngay cạnh hệ quả của nó: đánh dấu nhầm thì gỡ tại chỗ nhìn
          thấy, không phải đi tìm một màn quản lý không tồn tại. */}
      <button
        type="button"
        className="underline underline-offset-2 hover:text-fg-primary"
        onClick={() => trongKy.forEach((t) => deleteTrip.mutate(t.id))}
        disabled={deleteTrip.isPending}
      >
        Bỏ đánh dấu
      </button>
    </p>
  )
}
