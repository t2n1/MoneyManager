// Dải gọn "50/30/20".
//
// Hai chỗ dùng, hai vai:
//   · Đầu tab SỔ — cơ cấu chi chỉ có tác dụng khi nhìn thấy TRƯỚC lúc tiêu, mà tab
//     người ta mở hằng ngày là Sổ. Ở đó nó bấm được, dẫn sang khối đầy đủ.
//   · Ngay dưới câu kết luận ở tab NGÂN SÁCH (§4.3 của bản 1a). Ở đó nó KHÔNG bấm
//     được: khối đầy đủ đã nằm cùng màn, một liên kết trỏ về chính trang đang mở là
//     cái bẫy cho người dùng bàn phím và trình đọc màn hình.
// Dải cố ý chỉ có ba con số ở cả hai chỗ: nó là cái liếc mắt, không phải chỗ đọc kỹ.
import { Link } from 'react-router-dom'
import { Card } from '../../components/ui'
import { monthKeyString, type MonthKey } from '../../lib/dates'
import { formatMoney, type CurrencyCode } from '../../lib/money'
import { AXIS_LABEL, shareLabel, sharePct, type AxisProgress } from './axisTargets'
import { STATUS_FILL } from '../../components/ui/statusColors'

interface Props {
  data: AxisProgress
  monthKey: MonthKey
  base: CurrencyCode
  /** false = đang ở chính tab Ngân sách, dải không dẫn đi đâu nữa. Mặc định true. */
  linkToDetail?: boolean
}

export function AxisStrip({ data, monthKey, base, linkToDetail = true }: Props) {
  const parts = data.lines.map((l) => `${AXIS_LABEL[l.key]} ${shareLabel(l.share)}`).join(', ')
  // Chi chưa gắn "mức cần thiết" KHÔNG nằm trong hai dòng đầu, nên ba con số có thể
  // cộng lại không tới 100% mà không có gì giải thích. Khối đầy đủ ở tab Ngân sách có
  // hẳn một dòng cảnh báo; ở đây chỉ đủ chỗ cho một mẩu chữ, nhưng có còn hơn không.
  const missing = data.unclassified > 0 ? formatMoney(Math.round(data.unclassified), base) : null

  const noiDung = (
    <>
      <Card padding="sm" className={linkToDetail ? 'hover:bg-surface-sunken' : ''}>
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <span className="min-w-0 truncate text-2xs font-medium text-fg-muted">
            Cơ cấu chi{data.estimated && ' (tạm tính)'}
            {missing && <span className="text-fg-warn"> · thiếu {missing} chưa phân loại</span>}
          </span>
          {linkToDetail && <span className="shrink-0 text-2xs text-fg-accent">Chi tiết</span>}
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
                    {AXIS_LABEL[l.key]}
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
                {/* h-2 = 8px (§4.3). Vạch mốc phải cao BẰNG thanh, nếu không nó chỉ là
                    một chấm lửng giữa thanh và không đọc được là "mốc". */}
                <div className="relative mt-1 h-2 overflow-hidden rounded-full bg-surface-sunken">
                  <div
                    className={`h-full rounded-full ${l.ok ? STATUS_FILL.good : STATUS_FILL.warn}`}
                    style={{ width: `${barPct}%` }}
                  />
                  {/* Vạch mốc vẽ sau để luôn nằm trên thanh — giống khối đầy đủ */}
                  <div
                    className="absolute top-0 h-2 w-0.5 bg-gray-500 dark:bg-gray-300"
                    style={{ left: `${markPct}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </Card>
    </>
  )

  const nhan = `Cơ cấu chi: ${parts}.${missing ? ` Còn ${missing} chi chưa phân loại nên hai dòng đầu đang thiếu.` : ''}`

  if (!linkToDetail) {
    // <section> chứ không <div>: đây là một khối có nội dung riêng, và `aria-label` chỉ
    // được trình đọc màn hình dùng trên phần tử có vai trò — div trần thì nhãn rơi mất.
    return (
      <section aria-label={nhan} className="mb-3">
        {noiDung}
      </section>
    )
  }

  return (
    <Link
      to={`/budget?ym=${monthKeyString(monthKey)}`}
      className="mb-3 block"
      aria-label={`${nhan} Mở tab Ngân sách.`}
    >
      {noiDung}
    </Link>
  )
}
