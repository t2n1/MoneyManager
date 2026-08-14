// Viên thuốc "đang tải X%" nổi trên giữa màn.
//
// Chỉ hiện khi đợt tải đã kéo dài quá ngưỡng (xem lib/loadProgress.ts) — lần tải nhanh
// thì không ai thấy gì, vì một nút nháy lên rồi tắt ngay làm giao diện trông giật hơn là
// không có gì cả.
//
// Con số là số THẬT: bao nhiêu query trong đợt đã xong. Nó có thể tụt xuống khi app lòi
// thêm việc phải làm — đó là tin, không phải lỗi.
// Vòng tròn vẽ bằng stroke-dasharray: chu vi cố định, phần đã chạy là dashoffset. Có
// `transition` nên nhích giữa hai nấc thì trượt chứ không giật, dù bản thân con số nhảy
// theo nấc.
const R = 9
const CIRC = 2 * Math.PI * R

/**
 * Nhận `percent` qua tham số chứ không tự gọi useLoadProgress: AppLayout cần biết nút này
 * có đang hiện không để đẩy toast "đã tạo giao dịch định kỳ" xuống một bậc (hai cái dùng
 * chung một chỗ trên đỉnh màn). Hai nơi cùng gọi hook thì hai bộ hẹn giờ có thể lệch nhau,
 * và toast sẽ né một cái nút chưa hiện.
 */
export function LoadProgress({ percent }: { percent: number | null }) {
  if (percent === null) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(1rem+env(safe-area-inset-top))] z-50 flex justify-center print:hidden">
      {/* role="progressbar" chứ không aria-live: aria-live sẽ đọc lải nhải mỗi lần % nhích,
          còn progressbar để trình đọc màn hình tự quyết lúc nào nhắc lại. */}
      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Đang tải dữ liệu"
        className="flex items-center gap-2 rounded-full bg-gray-900/90 py-1.5 pl-2 pr-3.5 text-sm font-medium text-white shadow-lg"
      >
        <svg viewBox="0 0 24 24" className="h-6 w-6 -rotate-90" aria-hidden="true">
          <circle cx="12" cy="12" r={R} fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
          <circle
            cx="12"
            cy="12"
            r={R}
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={CIRC * (1 - percent / 100)}
            className="transition-[stroke-dashoffset] duration-300 ease-out"
          />
        </svg>
        {/* Ô rộng cố định, chữ dồn phải: 9% và 100% chiếm cùng một chỗ nên viên thuốc
            không rung mỗi lần số nhích. CỐ Ý không dùng `tabular-nums` — ngưỡng của nó ở
            tests/designSystem.test.ts đã kín (96), mà luật đó hướng người ta sang <Money>,
            còn đây là phần trăm: <Money> sẽ định dạng thành tiền và bị che khi bật chế độ
            riêng tư. */}
        <span className="w-9 text-right">{percent}%</span>
      </div>
    </div>
  )
}
