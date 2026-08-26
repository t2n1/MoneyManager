// Dải gọn "50/30/20".
//
// Hai chỗ dùng, hai vai:
//   · Mặt THEO DÕI, ngay dưới câu kết luận (§4.3 của bản 1a). Ở đó nó KHÔNG bấm được:
//     khối đầy đủ đã nằm cùng màn, một liên kết trỏ về chính trang đang mở là cái bẫy
//     cho người dùng bàn phím và trình đọc màn hình. Chỉ ba con số — cái liếc mắt.
//   · Mặt LẬP KẾ HOẠCH, trong dải ghim đầu màn ở điện thoại (`PlanStickyBar`). Ở đó nó
//     bật `showAmount` vì là thứ DUY NHẤT còn thấy được trong lúc kéo thanh trượt.
//
// `linkToDetail` mặc định true cho một vai thứ ba đã bị bỏ: dải từng nằm ở đầu tab Sổ và
// dẫn sang khối đầy đủ. Giữ nhánh đó vì nó là mặc định của API, nhưng hôm nay KHÔNG chỗ
// nào truyền true — đừng đọc comment này như "có ba chỗ dùng".
import { Link } from 'react-router-dom'
import { Card, Money } from '../../components/ui'
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
  /**
   * true = mỗi trục in thêm SỐ TIỀN dưới phần trăm. Mặc định false.
   *
   * Chỉ `PlanStickyBar` bật cái này, và vì một lý do hẹp: ở đó dải là thứ duy nhất còn
   * thấy được trong lúc người dùng kéo thanh trượt ở dưới, nên nó phải trả lời cả "bao
   * nhiêu phần trăm" lẫn "bao nhiêu tiền". Chỗ dùng còn lại (mặt theo dõi, dưới câu kết
   * luận) cố ý CHỈ có phần trăm — ở đó khối đầy đủ với đủ số tiền nằm ngay cùng màn, nên
   * dải chỉ cần là cái liếc mắt.
   */
  showAmount?: boolean
}

export function AxisStrip({
  data,
  monthKey,
  base,
  linkToDetail = true,
  showAmount = false,
}: Props) {
  // Số tiền vào LUÔN câu này khi bật `showAmount`: cả lưới ba cột là `aria-hidden`, chữ
  // thật của khối nằm ở đây. Thêm vào lưới mà quên chỗ này là trình đọc màn hình mất hẳn
  // con số vừa thêm.
  const parts = data.lines
    .map(
      (l) =>
        `${AXIS_LABEL[l.key]} ${shareLabel(l.share)}` +
        (showAmount ? ` (${formatMoney(Math.round(l.actual), base)})` : ''),
    )
    .join(', ')
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
                  <span className="shrink-0 text-sm tabular-nums">
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
                {showAmount && (
                  <Money
                    amount={Math.round(l.actual)}
                    currency={base}
                    className={`mt-0.5 block text-2xs ${l.ok ? '!text-fg-muted' : '!text-fg-warn'}`}
                  />
                )}
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
