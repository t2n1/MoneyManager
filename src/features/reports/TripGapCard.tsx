// Thẻ xác nhận chuyến đi ở tab Dài hạn (spec 2026-09-05-chuyen-di §5.1) — nơi duy nhất
// có sẵn CẢ NĂM giao dịch trong tay, nên dò được cả chuyến cũ (chuyến Tết 2/2026 nằm
// ngoài cửa sổ 90 ngày của luật thông báo). Không tốn truy vấn mới: nhận txs từ chính
// LongView.
//
// Mỗi lúc MỘT câu hỏi, dải MỚI NHẤT trước: trả lời xong, invalidate trips → dải kế tự
// hiện. Hai dải cùng lúc là bắt người dùng đọc một danh sách thay vì trả lời một câu.
import { Guide } from '../../components/Guide'
import { ActionButton, Card, Num } from '../../components/ui'
import { useCreateTrip, useTrips } from '../../hooks/queries'
import type { TransactionRow } from '../../types/database.types'
import { doKhoangVang, nhanNgayVang } from './ngayDiVang'

export function TripGapCard({
  txs,
  windowStartISO,
  todayISO,
}: {
  txs: readonly TransactionRow[]
  windowStartISO: string
  todayISO: string
}) {
  const { data: trips } = useTrips()
  const createTrip = useCreateTrip()
  // trips chưa về thì im — hiện câu hỏi rồi rút lại khi biết "đã hỏi rồi" còn tệ hơn chậm.
  if (!trips) return null
  const gaps = doKhoangVang(
    txs.map((t) => t.occurred_on),
    windowStartISO,
    todayISO,
    trips,
  )
  if (gaps.length === 0) return null
  // Dải MỚI NHẤT trước: thông báo ở Bản tin (cửa sổ 90 ngày) nói về dải gần đây — bấm
  // vào mà thẻ hỏi một dải của hai năm trước là hỏi một đằng trả lời một nẻo. Dải mới
  // cũng là dải còn nhớ được; dải cũ lần lượt hiện sau khi trả lời xong.
  const g = gaps[gaps.length - 1]

  // Cả hai nút đều GHI một hàng trips — khác nhau đúng một cờ. dismissed = true là trí
  // nhớ "đã hỏi, không phải chuyến đi", để dải này không bao giờ bị hỏi lại.
  const traLoi = (dismissed: boolean) =>
    createTrip.mutate({ start_on: g.startISO, end_on: g.endISO, dismissed })

  return (
    <Card as="section" elevation="panel" padding="panel">
      <p className="text-sm text-fg-primary">
        <Num tone="neutral">{g.soNgay}</Num> ngày không có giao dịch nào (
        {nhanNgayVang(g.startISO)} → {nhanNgayVang(g.endISO)}) — anh đi vắng?
      </p>
      {/* Chữ DẠY — bọc Guide (biến mất ở chế độ Gọn là đúng): câu hỏi + hai nút ở trên
          và dưới tự đứng được, đoạn này chỉ giải thích cơ chế. designSystem.test.ts canh
          trần số đoạn fg-muted và chỉ cho qua đường này. */}
      <Guide className="mt-1 text-sm text-fg-muted">
        Đánh dấu là chuyến đi thì "TB 3 tháng", "so với tháng trước" và dự báo sẽ bỏ những
        ngày này ra — tháng đó thôi trông rẻ giả.
      </Guide>
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => traLoi(true)}
          disabled={createTrip.isPending}
          className="min-h-11 rounded-md px-3 py-2 text-sm text-fg-muted hover:bg-surface-sunken"
        >
          Không phải, đừng hỏi lại
        </button>
        <ActionButton
          variant="primary"
          onClick={() => traLoi(false)}
          disabled={createTrip.isPending}
        >
          {createTrip.isPending ? 'Đang lưu…' : 'Đánh dấu là chuyến đi'}
        </ActionButton>
      </div>
    </Card>
  )
}
