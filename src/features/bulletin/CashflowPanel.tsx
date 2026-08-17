// Dòng tiền 8 tháng (§4.1). Bấm một cột = đổi tháng đang xem — một trong ba đường đổi
// tháng mà §5.0 bắt phải ghi vào cùng một state (xem src/hooks/useMonthKey.tsx).
//
// Vẽ bằng div chứ KHÔNG dùng recharts, dù cả app đang dùng recharts. Ba lý do, theo thứ
// tự quan trọng:
//   1. Mỗi cột phải là một VÙNG BẤM có tên đọc được. Với recharts thì tên đó nằm ngoài
//      tầm với: nó vẽ <path>/<rect> trong một <svg> không có ngữ nghĩa nút.
//   2. §12 chốt cách chuyển động: cột nội suy CHIỀU CAO trong `--motion-period` (tiện
//      ích `motion-period`, xem index.css). Animation riêng của recharts chạy theo luật
//      của nó, tắt đi rồi tự làm lại thì còn dài hơn tự vẽ.
//   3. Tám tháng × hai cột là 16 hình chữ nhật. Kéo cả một thư viện biểu đồ vào một
//      trang vốn đã nặng (Bản tin đọc gần hết bảng dữ liệu) để vẽ 16 hình là không đáng.
import { Card, Money } from '../../components/ui'
import { formatMoney, type CurrencyCode } from '../../lib/money'
import { formatMonthLabel, type MonthKey } from '../../lib/dates'
import type { MonthlyPoint } from '../reports/aggregate'

interface Props {
  points: MonthlyPoint[]
  active: MonthKey
  base: CurrencyCode
  onPick: (key: MonthKey) => void
  /** Chuỗi có khoản chưa quy đổi được → mọi cột đều là ước chừng. */
  approx: boolean
}

const same = (a: MonthKey, b: MonthKey) => a.year === b.year && a.month === b.month

export function CashflowPanel({ points, active, base, onPick, approx }: Props) {
  // Một thang chung cho CẢ hai màu và cả tám tháng: mỗi cột tự co theo số của nó thì
  // tháng chi 5.000 trông cao bằng tháng chi 500.000 — biểu đồ nói ngược sự thật.
  const max = Math.max(1, ...points.flatMap((p) => [p.income, p.expense]))
  const cur = points.find((p) => same(p.key, active))

  return (
    // `basis-full xl:basis-0` chứ chỉ `flex-1`: §6 chốt cặp panel này xếp NGANG từ xl và
    // DỌC ở dưới, nhưng `flex-1 min-w-0` một mình không bao giờ xuống dòng — phần tử co
    // được thì flex cho co chứ không cho `flex-wrap` chạy. Đo trên máy: ở 375px hai panel
    // đứng cạnh nhau, mỗi cái 166px, và ở cỡ chữ "Rất lớn" thì số ¥54.118 trong panel
    // Ngân sách bị cắt 8px còn dòng giao dịch tràn 39px (§13).
    <Card elevation="panel" padding="panel" as="section" className="min-w-0 flex-1 basis-full xl:basis-0">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[0.8125rem] font-semibold text-fg-primary">Dòng tiền 8 tháng</h2>
        <p className="font-mono text-2xs text-fg-muted">
          {formatMonthLabel(active)}
          {cur && (
            <>
              {' · '}
              <Money amount={cur.income} currency={base} tone="in" approx={approx} compact />
              {' / '}
              <Money amount={cur.expense} currency={base} tone="out" approx={approx} compact />
            </>
          )}
        </p>
      </div>

      <div className="mt-3 flex items-end gap-1">
        {points.map((p) => {
          const on = same(p.key, active)
          const label = formatMonthLabel(p.key)
          return (
            <button
              key={`${p.key.year}-${p.key.month}`}
              type="button"
              onClick={() => onPick(p.key)}
              aria-current={on ? 'true' : undefined}
              // Tên đọc được của cột: đây là TOÀN BỘ nội dung của hình vẽ, nói bằng chữ.
              aria-label={`${label} — thu ${formatMoney(p.income, base)}, chi ${formatMoney(p.expense, base)}`}
              title={label}
              className={`group flex min-w-0 flex-1 flex-col items-center gap-1 rounded-md border px-0.5 pb-1 pt-2 transition ${
                on
                  ? 'border-border-strong bg-surface-sunken'
                  : 'border-transparent hover:bg-surface-sunken'
              }`}
            >
              {/* h-20 = 80px vùng vẽ. Hai cột sát nhau, thu trái / chi phải. */}
              <span className="flex h-20 w-full items-end justify-center gap-[3px]" aria-hidden>
                <span
                  className="w-1/3 min-w-[3px] rounded-sm bg-money-in motion-period"
                  style={{ height: `${(p.income / max) * 100}%` }}
                />
                <span
                  className="w-1/3 min-w-[3px] rounded-sm bg-money-out motion-period"
                  style={{ height: `${(p.expense / max) * 100}%` }}
                />
              </span>
              <span
                className={`max-w-full truncate font-mono text-3xs ${on ? 'text-fg-primary' : 'text-fg-muted'}`}
                aria-hidden
              >
                {/* Chỉ số tháng: tám nhãn "2026/08" trong một panel 380–600px là chữ đè
                    lên nhau. Năm đã có ở dòng tiêu đề ngay trên. */}
                {p.key.month}
              </span>
            </button>
          )
        })}
      </div>
    </Card>
  )
}
