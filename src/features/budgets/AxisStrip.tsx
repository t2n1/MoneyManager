// Dải gọn "50/30/20" ở đầu tab Sổ.
//
// Khối đầy đủ nằm ở tab Ngân sách, nhưng cơ cấu chi là thứ chỉ có tác dụng khi
// nhìn thấy TRƯỚC lúc tiêu, mà tab người ta mở hằng ngày là Sổ. Dải này cố ý chỉ
// có ba con số: nó là cái liếc mắt, không phải chỗ đọc kỹ — bấm vào là sang khối
// đầy đủ đúng tháng đang xem.
import { Link } from 'react-router-dom'
import { Card } from '../../components/ui'
import { monthKeyString, type MonthKey } from '../../lib/dates'
import { formatMoney, type CurrencyCode } from '../../lib/money'
import { shareLabel, sharePct, type AxisKey, type AxisProgress } from './axisTargets'

const LABEL: Record<AxisKey, string> = {
  essential: 'Thiết yếu',
  flexible: 'Linh hoạt',
  savings: 'Tiết kiệm',
}

interface Props {
  data: AxisProgress
  monthKey: MonthKey
  base: CurrencyCode
}

export function AxisStrip({ data, monthKey, base }: Props) {
  const parts = data.lines.map((l) => `${LABEL[l.key]} ${shareLabel(l.share)}`).join(', ')
  // Chi chưa gắn "mức cần thiết" KHÔNG nằm trong hai dòng đầu, nên ba con số có thể
  // cộng lại không tới 100% mà không có gì giải thích. Khối đầy đủ ở tab Ngân sách có
  // hẳn một dòng cảnh báo; ở đây chỉ đủ chỗ cho một mẩu chữ, nhưng có còn hơn không.
  const missing = data.unclassified > 0 ? formatMoney(Math.round(data.unclassified), base) : null

  return (
    <Link
      to={`/budget?ym=${monthKeyString(monthKey)}`}
      className="mb-3 block"
      aria-label={`Cơ cấu chi: ${parts}.${missing ? ` Còn ${missing} chi chưa phân loại nên hai dòng đầu đang thiếu.` : ''} Mở tab Ngân sách.`}
    >
      <Card padding="sm" className="hover:bg-surface-sunken">
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <span className="min-w-0 truncate text-2xs font-medium text-fg-muted">
            Cơ cấu chi{data.estimated && ' (tạm tính)'}
            {missing && <span className="text-fg-warn"> · thiếu {missing} chưa phân loại</span>}
          </span>
          <span className="shrink-0 text-2xs text-fg-accent">Chi tiết</span>
        </div>

        {/* aria-hidden: nội dung đã nằm gọn trong aria-label của thẻ liên kết, đọc lại
            từng ô rời rạc ("Thiết yếu, 28, %, /, 50") chỉ làm rối trình đọc màn hình. */}
        <div className="grid grid-cols-3 gap-2" aria-hidden>
          {data.lines.map((l) => {
            const barPct = Math.min(Math.max(l.share, 0) * 100, 100)
            const markPct = Math.min(l.targetShare * 100, 100)
            return (
              <div key={l.key}>
                {/* flex-wrap + nhãn không co: ở 320px ô chỉ rộng ~85px, số chiếm ~48px
                    nên nhãn bị cắt thành "Thiết y…". Cho số xuống hàng thay vì cắt tên
                    trục — ở 375px trở lên vẫn đủ chỗ cho một hàng. */}
                <div className="flex flex-wrap items-baseline justify-between gap-x-1">
                  <span className="shrink-0 whitespace-nowrap text-2xs text-fg-muted">
                    {LABEL[l.key]}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums">
                    <span className={`font-semibold ${l.ok ? 'text-money-in' : 'text-fg-warn'}`}>
                      {shareLabel(l.share)}
                    </span>
                    {/* Đã âm thì bỏ "/mốc": ô này chỉ rộng ~105px, "Âm 18%/20" đẩy
                        nhãn "Tiết kiệm" vào cảnh bị cắt — mà so một số âm với sàn
                        20% cũng chẳng để làm gì. Khối đầy đủ ở tab Ngân sách rộng
                        hơn nên vẫn giữ đủ "tối thiểu 20%". */}
                    {sharePct(l.share) >= 0 && (
                      <span className="text-fg-muted">/{Math.round(l.targetShare * 100)}</span>
                    )}
                  </span>
                </div>
                <div className="relative mt-1 h-1.5 overflow-hidden rounded-full bg-surface-sunken">
                  <div
                    className={`h-full rounded-full ${l.ok ? 'bg-green-500' : 'bg-amber-500'}`}
                    style={{ width: `${barPct}%` }}
                  />
                  {/* Vạch mốc vẽ sau để luôn nằm trên thanh — giống khối đầy đủ */}
                  <div
                    className="absolute top-0 h-1.5 w-0.5 bg-gray-500 dark:bg-gray-300"
                    style={{ left: `${markPct}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </Card>
    </Link>
  )
}
