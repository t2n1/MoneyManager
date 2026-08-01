// Thẻ "Một khoản chi điển hình": trung vị & phân vị thay vì trung bình.
// Kèm quy đổi ra GIỜ LÀM nếu người dùng đã khai lương theo giờ trong Cài đặt —
// đọc "bữa trưa này = 0,7 giờ làm" thấm hơn nhiều so với đọc con số tiền.
import { Link } from 'react-router-dom'
import { ExplainBox } from '../../components/ExplainBox'
import { Money } from '../../components/ui'
import { formatMoney, type CurrencyCode } from '../../lib/money'
import { hoursOfWork, type SpendPercentiles } from './behavior'

interface Props {
  data: SpendPercentiles | null
  base: CurrencyCode
  periodNoun: string
  /** lương mỗi giờ (base minor); null = chưa khai trong Cài đặt */
  hourlyWage: number | null
}

/** "2,5 giờ" / "45 phút" — dưới 1 giờ thì đọc theo phút cho dễ hình dung. */
function hoursLabel(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)} phút làm việc`
  return `${hours.toFixed(1).replace('.', ',')} giờ làm việc`
}

export function SpendSizeCard({ data, base, periodNoun, hourlyWage }: Props) {
  if (!data) return null
  const money = (v: number) => formatMoney(Math.round(v), base)
  const skewed = data.mean > data.median * 1.5

  const rows: { label: string; value: number; note: string }[] = [
    { label: 'Điển hình (trung vị)', value: data.median, note: 'một nửa số lần chi ít hơn mức này' },
    { label: 'Khá to (top 25%)', value: data.p75, note: 'cứ 4 lần chi thì có 1 lần vượt mức này' },
    { label: 'To (top 10%)', value: data.p90, note: 'cứ 10 lần chi thì có 1 lần vượt mức này' },
    { label: 'Lớn nhất', value: data.max, note: 'khoản đắt nhất trong kỳ' },
  ]

  return (
    <section className="rounded-xl bg-surface p-3 shadow-sm ">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
          Một lần chi to cỡ nào
        </h2>
        <span className="shrink-0 text-2xs text-fg-muted">
          {data.count} lần chi {periodNoun}
        </span>
      </div>

      <ul className="space-y-1.5">
        {rows.map((row) => {
          const hours = hoursOfWork(row.value, hourlyWage)
          return (
            <li key={row.label} className="rounded-lg bg-surface-page px-2.5 py-2 ">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs text-fg-secondary">{row.label}</span>
                <Money
                  amount={Math.round(row.value)}
                  currency={base}
                  className="shrink-0 text-sm font-semibold"
                />
              </div>
              <div className="mt-0.5 flex items-baseline justify-between gap-2">
                <span className="text-2xs text-fg-muted">{row.note}</span>
                {hours !== null && (
                  <span className="shrink-0 text-2xs font-medium text-sky-600 dark:text-sky-400">
                    ≈ {hoursLabel(hours)}
                  </span>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      {skewed && (
        <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1.5 text-2xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
          Trung bình ({money(data.mean)}) cao hơn hẳn mức điển hình ({money(data.median)}) — vài
          khoản lớn đang kéo con số trung bình lên. Nhìn trung vị sẽ sát đời thực hơn.
        </p>
      )}

      {hourlyWage === null && (
        <p className="mt-2 text-2xs text-fg-muted">
          Muốn thấy “món này = mấy giờ làm”?{' '}
          <Link to="/settings" className="font-medium text-green-700 dark:text-green-400">
            Khai lương theo giờ trong Cài đặt
          </Link>
          .
        </p>
      )}

      <ExplainBox label="Cách đọc">
        <p>
          Trung vị là mức nằm chính giữa khi xếp mọi khoản chi từ nhỏ đến lớn. Khác với trung bình,
          nó không bị một lần mua điện thoại kéo lệch, nên phản ánh đúng “một lần rút ví bình thường
          của bạn”.
        </p>
        <p>
          Hoàn tiền, chuyển khoản và dòng tiền nợ không tính vào đây — chỉ những lần thực sự tiêu.
        </p>
      </ExplainBox>
    </section>
  )
}
