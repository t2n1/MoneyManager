// Dấu nhỏ cạnh một con số ƯỚC TÍNH, để nó không bị đọc như số đã chốt.
//
// Chỉ dùng cho số do app tự suy ra: khấu hao, chiếu tương lai, dự phóng ngày đạt mục
// tiêu, giá cổ phiếu đã cũ. KHÔNG dùng cho số dư, số tiền giao dịch, tổng thu chi —
// những số đó là thật, gắn dấu vào chỉ làm người đọc mất tin vào cả màn hình.
//
// Khác `approx` của <Money> (tiền tố "≈ " khi tổng có ngoại tệ quy đổi theo tỷ giá):
// cái đó nói "con số đúng nhưng đổi tiền theo tỷ giá", cái này nói "con số do app đoán".
//
// Dùng <abbr title> chứ không tooltip tự vẽ: trên điện thoại `title` không hiện, nên
// `aria-label` mới là kênh chính cho trình đọc màn hình, và dấu này luôn chỉ BỔ NGHĨA —
// câu chữ quanh nó phải tự đủ nghĩa khi không đọc được lời giải thích.
interface Props {
  /** Một câu ngắn nói vì sao đây là số ước tính. */
  reason: string
}

export function EstimateMark({ reason }: Props) {
  return (
    <abbr
      title={reason}
      aria-label={`Số ước tính. ${reason}`}
      className="ml-0.5 cursor-help text-2xs font-medium text-fg-muted no-underline"
    >
      ≈
    </abbr>
  )
}
