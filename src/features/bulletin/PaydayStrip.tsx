// "Tới ngày lương" — cái tên thứ ba của §4.9, và là cái duy nhất còn thiếu. Hai cái kia
// đã có ở HealthView: "Nếu mất việc" và "đệm cho việc bất ngờ".
//
// MỘT CÂU, không phải ô KPI thứ năm: §4.1 chốt bốn ô (Thu · Chi · Giữ lại · Tài sản
// ròng). Thêm ô thứ năm là phá hàng bốn ở mọi bề rộng, mà thứ này cũng không cùng loại
// với bốn ô kia — chúng là TỔNG của một kỳ, còn đây là một câu kết luận về HÔM NAY.
//
// CÂU LỚN, SỐ NẰM TRONG CÂU — không phải một con số khổng lồ đứng trơ. Khuôn này lấy từ
// chính khối đầu trang Báo cáo: một câu đọc được thành lời, các con số quyết định nằm
// ngay trong đó, và mệnh đề sau dấu gạch dài là bằng chứng để kiểm lại con số đầu câu.
// Một numeral cỡ 44px đứng một mình thì to thật, nhưng phải đọc nhãn quanh nó mới biết
// nó là gì — câu thì tự nói được.
//
// Cỡ chữ 1.125 → 1.25rem: đây là thứ LỚN NHẤT trên màn Bản tin, lớn hơn cả câu kết luận
// đứng trên nó (ConclusionLine, 0.8125rem). Chênh lệch đó là cố ý và đã cân nhắc: câu
// kết luận nói cả tháng đã đi tới đâu, còn câu này nói HÔM NAY tiêu được bao nhiêu —
// và cái sau mới là thứ người ta mở app ra để hỏi.
//
// Câu chữ bám §14:
//   • con số là "còn trong HẠN MỨC", không phải lương trừ chi. Xem khối định nghĩa
//     `conLai` trong bulletin.ts — đó là chỗ ghi vì sao bản đầu sai.
//   • kết luận trước, bằng chứng sau (mệnh đề sau dấu gạch dài).
//   • không phán xét: nêu nhịp hiện tại để người đọc TỰ thấy nó vượt mức chia đều, chứ
//     không viết "bạn tiêu quá tay".
//
// MÀU: đúng MỘT số mỗi câu được tô, và tô theo TÌNH TRẠNG chứ không theo chiều tiền.
//   đúng nhịp  → `good` (xanh)      · sắp hụt → `warn` (hổ phách) · vượt trần → `out` (đỏ)
// Số đó luôn là số QUYẾT ĐỊNH (mức mỗi ngày, hoặc phần đã vượt). Số bằng chứng — hạn mức
// còn lại, nhịp hiện tại — giữ `neutral` đậm: tô hết thì không còn gì nổi lên nữa.
//
// KHÔNG dùng `in` cho mức mỗi ngày dù nó cũng ra màu xanh: `in`/`out` nghĩa là THU/CHI,
// mà mức tiêu cho phép không phải khoản thu. `good`/`warn` là hai tone thêm vào Money.tsx
// đúng cho vai này. Và màu CHỈ đi qua `tone` — xem ghi chú ở hàm `so` bên dưới.
import { Link } from 'react-router-dom'
import { Card, Money } from '../../components/ui'
import type { ToiNgayLuong } from './bulletin'
import type { CurrencyCode } from '../../lib/money'

interface Props {
  data: ToiNgayLuong
  base: CurrencyCode
  /** Có ngoại tệ chưa quy đổi được → số là xấp xỉ. `BudgetReport.hasMissingRate`. */
  approx?: boolean
}

/** Cỡ và nhịp của câu — một chỗ, vì cả ba nhánh phải cùng cỡ mới ra một khối. */
const CAU = 'text-[1.125rem] font-semibold leading-snug text-fg-secondary lg:text-[1.25rem]'

export function PaydayStrip({ data, base, approx = false }: Props) {
  const { soNgay, conLai, moiNgay, nhipHienTai, hutTruocLuong, chuaDatHanMuc } = data

  // Số trong câu: mono + đậm, nổi lên khỏi nền câu fg-secondary. Màu CHỈ đi qua `tone`
  // (`neutral` đã là fg-primary) — truyền thêm một class màu qua `className` là hai
  // utility cùng hạng đấu nhau và thứ tự trong CSS build ra mới quyết định ai thắng.
  // Chú thích trong Money.tsx ghi rõ, và tôi đã dẫm đúng vào đó ở bản nháp của file này.
  const so = (amount: number, tone: 'neutral' | 'out' | 'good' | 'warn' = 'neutral') => (
    <Money amount={amount} currency={base} tone={tone} approx={approx} className="font-semibold" />
  )

  // `soNgay ≥ 1` ở MỌI lần render: BulletinPage neo vào kỳ CHỨA hôm nay (`monthKeyForDate`
  // rồi `getMonthRange`), mà `end` là mốc loại trừ — hôm nay không bao giờ rơi trúng nó.
  // Từng có nhánh "Hôm nay là ngày lương" ở đây; nó chưa chạy được lần nào nên đã xoá.
  // Hàm thuần vẫn dung được `soNgay === 0` cho ai gọi thẳng, và lúc đó `moiNgay` là null
  // nên không có số sai nào in ra.
  const ngay = <span className="font-semibold text-fg-primary">{soNgay} ngày</span>

  // Chưa đặt hạn mức: không có trần thì không có "còn lại". §14 "chưa biết ≠ 0" — nói
  // thẳng là chưa biết, và đưa đúng MỘT lối ra. Số ngày vẫn giữ: đó là phần duy nhất
  // biết chắc mà không cần hạn mức nào.
  if (chuaDatHanMuc) {
    return (
      <Card elevation="panel" padding="panel" as="section">
        <p className={CAU}>
          Còn {ngay} tới ngày lương — chưa đặt hạn mức nên chưa nói được mỗi ngày còn tiêu
          được bao nhiêu.{' '}
          <Link to="/budget" className="text-fg-accent hover:underline">
            Đặt hạn mức
          </Link>
        </p>
      </Card>
    )
  }

  // Vượt trần: không có "mỗi ngày" để nói (chia số âm ra là vô nghĩa), nên kết luận đổi
  // thành chính phần vượt. Trị tuyệt đối — chữ "đã vượt" đã mang dấu rồi, in thêm '-' là
  // nói hai lần và đọc thành "vượt âm sáu nghìn".
  if (conLai < 0) {
    return (
      <Card elevation="panel" padding="panel" as="section">
        <p className={CAU}>
          Đã vượt hạn mức {so(Math.abs(conLai), 'out')} — còn {ngay} nữa mới tới ngày lương.
        </p>
      </Card>
    )
  }

  return (
    <Card elevation="panel" padding="panel" as="section">
      <p className={CAU}>
        {moiNgay === null ? (
          <>Hạn mức còn {so(conLai)} tới ngày lương — còn {ngay}.</>
        ) : (
          <>
            {/* Màu của con số này LÀ lời cảnh báo: hổ phách khi giữ nhịp hiện tại sẽ
                hụt, xanh khi còn đúng nhịp. Chip cảnh báo cũ bỏ đi rồi, nên đây là chỗ
                duy nhất mang tín hiệu đó — cùng token `--fg-warn` mà VerdictNote dùng,
                nên hai thứ đọc ra một màu. */}
            Mỗi ngày còn {so(moiNgay, hutTruocLuong ? 'warn' : 'good')} cho tới ngày lương —{' '}
            {ngay} nữa, hạn mức còn{' '}
            {so(conLai)}
            {/* Nhịp hiện tại CHỈ hiện khi nó là tin xấu, và lúc đó nó chính là bằng chứng
                cho lời cảnh báo: đặt cạnh mức chia đều ở đầu câu, người đọc tự thấy
                10.000 > 4.190 mà không cần app phán câu nào. Nhịp "ổn" thì không có tin
                gì — thêm vào chỉ làm câu dài ra ở mọi màn hình. */}
            {hutTruocLuong && <>, mà nhịp hiện tại là {so(nhipHienTai)}/ngày</>}.
          </>
        )}
      </p>
    </Card>
  )
}
