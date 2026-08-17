// "Tới ngày lương" — cái tên thứ ba của §4.9, và là cái duy nhất còn thiếu. Hai cái kia
// đã có ở HealthView: "Nếu mất việc" và "đệm cho việc bất ngờ".
//
// MỘT DÒNG, không phải ô KPI thứ năm: §4.1 chốt bốn ô (Thu · Chi · Giữ lại · Tài sản
// ròng). Thêm ô thứ năm là phá hàng bốn ở mọi bề rộng, mà thứ này cũng không cùng loại
// với bốn ô kia — chúng là TỔNG của một kỳ, còn đây là một câu kết luận về HÔM NAY.
//
// Câu chữ bám §14:
//   • "kỳ này còn ¥X" chứ KHÔNG "bạn còn tiêu được ¥X" — xem định nghĩa `conLai` trong
//     bulletin.ts: đây là dòng tiền của kỳ, không phải tiền mặt tiêu được. Nói sai một
//     chữ ở đây là đúng cái R1 cảnh báo.
//   • kết luận trước, bằng chứng sau (mệnh đề sau dấu gạch dài).
//   • không phán xét: "giữ nhịp này thì hụt trước ngày lương", không "bạn tiêu quá tay".
import { Card, Money, StatusChip } from '../../components/ui'
import type { ToiNgayLuong } from './bulletin'
import type { CurrencyCode } from '../../lib/money'

interface Props {
  data: ToiNgayLuong
  base: CurrencyCode
}

export function PaydayStrip({ data, base }: Props) {
  const { soNgay, conLai, moiNgay, hutTruocLuong, chuaCoThu } = data

  // Kỳ chưa có khoản thu nào: mọi câu về "còn lại" đều vô nghĩa (số âm bằng đúng số đã
  // tiêu). Nói thẳng là đang chờ lương, và vẫn giữ con số ngày — đó là phần duy nhất
  // biết chắc.
  if (chuaCoThu) {
    return (
      <Card elevation="panel" padding="panel" as="section">
        <p className="text-[0.8125rem] text-fg-primary">
          <span className="font-semibold">
            {soNgay === 0 ? 'Hôm nay là ngày lương' : `Còn ${soNgay} ngày tới ngày lương`}
          </span>
          <span className="text-fg-secondary">
            {' '}
            — kỳ này chưa ghi khoản thu nào, nên chưa nói được còn lại bao nhiêu.
          </span>
        </p>
      </Card>
    )
  }

  return (
    <Card elevation="panel" padding="panel" as="section">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <p className="text-[0.8125rem] font-semibold text-fg-primary">
          {soNgay === 0 ? 'Hôm nay là ngày lương' : `Còn ${soNgay} ngày tới ngày lương`}
        </p>

        {/* Chip chỉ hiện khi có điều đáng nói. Một chip "ổn" trên mọi màn hình là một
            chip không ai đọc nữa. */}
        {hutTruocLuong && (
          <StatusChip tone="warn">Giữ nhịp này thì hụt trước ngày lương</StatusChip>
        )}

        {/* Màu đi qua `tone`, KHÔNG qua className: <Money> luôn nhả TONE_CLASS nên một
            class màu truyền từ ngoài là hai utility cùng hạng đấu nhau, và thứ tự trong
            CSS build ra mới quyết định ai thắng — chú thích trong Money.tsx ghi rõ. */}
        <p className="ml-auto text-[0.8125rem] text-fg-secondary">
          Kỳ này còn{' '}
          <Money
            amount={conLai}
            currency={base}
            tone={conLai < 0 ? 'out' : 'neutral'}
            className="font-medium"
          />
          {moiNgay !== null && (
            <>
              {' '}
              — chia đều còn{' '}
              <Money amount={moiNgay} currency={base} tone="neutral" className="font-medium" />
              /ngày
            </>
          )}
        </p>
      </div>
    </Card>
  )
}
