// Dải 8 tháng của thẻ "Chi tiêu" (§4.1, bản vẽ redesign 2026-09-05). Bấm một cột = đổi
// tháng đang xem — một trong ba đường đổi tháng mà §5.0 bắt phải ghi vào cùng một state
// (xem src/hooks/useMonthKey.tsx).
//
// Tiền thân là CashflowPanel — một thẻ riêng "Dòng tiền 8 tháng". Bản redesign nhập nó
// vào ĐẦU thẻ Chi tiêu vì hai hình là một cặp thu-phóng (trên mỗi cột một tháng, dưới
// mỗi cột một ngày của tháng đang chọn), nên đây chỉ còn là DẢI, không tự mang Card hay
// tiêu đề. Mỗi cột thêm % GIỮ LẠI của tháng đó — cùng mốc Để dành với ô "Giữ lại" của
// KpiRow, để tám con số này và ô kia không thể nói hai mốc khác nhau.
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
import { Num } from '../../components/ui'
import { formatMoney, type CurrencyCode } from '../../lib/money'
import { formatMonthLabel, type MonthKey } from '../../lib/dates'
import { useProfile } from '../../hooks/queries'
import { resolveMethod, savingsTargetShare } from '../budgets/budgetMethods'
import type { MonthlyPoint } from '../reports/aggregate'

interface Props {
  points: MonthlyPoint[]
  active: MonthKey
  base: CurrencyCode
  onPick: (key: MonthKey) => void
}

const same = (a: MonthKey, b: MonthKey) => a.year === b.year && a.month === b.month

export function CashflowStrip({ points, active, base, onPick }: Props) {
  // Một thang chung cho CẢ hai màu và cả tám tháng: mỗi cột tự co theo số của nó thì
  // tháng chi 5.000 trông cao bằng tháng chi 500.000 — biểu đồ nói ngược sự thật.
  const max = Math.max(1, ...points.flatMap((p) => [p.income, p.expense]))
  // Cùng mốc với ô "Giữ lại" của KpiRow — khoản Để dành của phương pháp trong hồ sơ,
  // không phải hằng 20% cứng.
  const { data: profile } = useProfile()
  const targetPct = Math.round(savingsTargetShare(resolveMethod(profile)) * 100)

  return (
    <div className="flex items-end gap-1.5">
      {points.map((p) => {
        const on = same(p.key, active)
        const label = formatMonthLabel(p.key)
        // % giữ lại của tháng — null khi chưa có thu (§14: chưa biết ≠ 0%).
        const kept = p.income > 0 ? Math.round(((p.income - p.expense) / p.income) * 100) : null
        return (
          <button
            key={`${p.key.year}-${p.key.month}`}
            type="button"
            onClick={() => onPick(p.key)}
            aria-current={on ? 'true' : undefined}
            // Tên đọc được của cột: đây là TOÀN BỘ nội dung của hình vẽ, nói bằng chữ.
            aria-label={`${label} — thu ${formatMoney(p.income, base)}, chi ${formatMoney(p.expense, base)}`}
            title={label}
            className={`flex min-w-0 flex-1 flex-col gap-1 rounded-md border px-1.5 pb-1 pt-1.5 transition ${
              on
                ? 'border-border-strong bg-surface-sunken'
                : 'border-transparent hover:bg-surface-sunken'
            }`}
          >
            {/* h-10 = 40px vùng vẽ — dải nằm trong thẻ lớn nên thấp hơn bản thẻ riêng.
                Hai cột sát nhau, thu trái / chi phải. */}
            <span className="flex h-10 w-full items-end gap-0.5" aria-hidden>
              <span
                className="min-w-[3px] flex-1 rounded-t-[2px] bg-money-in motion-period"
                style={{ height: `${(p.income / max) * 100}%` }}
              />
              <span
                className="min-w-[3px] flex-1 rounded-t-[2px] bg-money-out motion-period"
                style={{ height: `${(p.expense / max) * 100}%` }}
              />
            </span>
            <span
              className={`flex w-full items-baseline justify-between gap-1 font-mono text-2xs ${
                on ? 'text-fg-primary' : 'text-fg-muted'
              }`}
              aria-hidden
            >
              {/* Chỉ số tháng: tám nhãn "2026/08" trong một dải này là chữ đè lên nhau.
                  Năm đã có ở nhãn kỳ trên đầu thẻ. */}
              <span>{p.key.month}</span>
              {/* Ở dải hẹp (mobile) giấu % — tám cặp số trong 375px là chữ đè nhau,
                  và con số này đã có bản to ở ô "Giữ lại" cho tháng đang chọn. */}
              {kept !== null && (
                <Num
                  tone={kept >= targetPct ? 'in' : 'warn'}
                  className="hidden text-2xs md:inline"
                >
                  {kept}%
                </Num>
              )}
            </span>
          </button>
        )
      })}
    </div>
  )
}
