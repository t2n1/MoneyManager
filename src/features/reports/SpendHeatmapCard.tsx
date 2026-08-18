import { formatMoney, type CurrencyCode } from '../../lib/money'
import type { DailyExpensePoint } from './aggregate'
import { Card } from '../../components/ui'

interface Props {
  /** chi từng ngày cho trọn tháng tài chính */
  points: DailyExpensePoint[]
  base: CurrencyCode
}

const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']

// 0 = không chi; 1..4 tăng dần theo mức chi so với ngày chi cao nhất trong tháng.
//
// MỘT SẮC ĐỎ, bốn độ mờ (§B9 của gói 1a). Thang cũ đi amber → orange → red: ba sắc khác
// nhau nên nó đọc thành ba LOẠI ngày, không phải một thang ít→nhiều — mà nâu/cam còn nằm
// ngoài bảng màu của 1a. Một sắc thì thứ tự tự hiện ra: càng đậm càng nhiều.
//
// Sắc là `--money-out`, đúng token của số tiền chi — cùng một thứ được nói bằng cùng một
// màu ở mọi màn. Alpha 12/30/55/100 pha thẳng trên nền thẻ (Tailwind v4 dịch ra
// color-mix), nên thang tự lật theo chế độ sáng/tối cùng với token.
const LEVEL_BG = [
  'bg-surface-sunken',
  'bg-money-out/12',
  'bg-money-out/30',
  'bg-money-out/55',
  'bg-money-out',
]

// Mực chữ theo bậc — ĐO THẬT bằng canvas pixel readback trên CẢ HAI chế độ (2026-08-18),
// vì nền ở đây là màu pha nên không tra bảng được. Cột số là sáng / tối:
//   bậc 0 (không chi, nền lún)   `fg-secondary`  6,32 / 11,37
//   bậc 1 (12%)                  `fg-primary`   13,43 / 13,59
//   bậc 2 (30%)                  `fg-primary`    9,32 /  9,80
//   bậc 3 (55%)                  `fg-primary`    5,46 /  5,74
//   bậc 4 (đặc)                  `fg-inverse`    6,42 /  6,97
//
// Hai điều đo ra được, không đoán ra được:
//   1) `fg-secondary` TRƯỢT ở bậc 2 chế độ sáng — đúng 4,17, thiếu 0,33. Nó qua ở chế độ
//      tối (7,61) nên chỉ nhìn bản dark là tưởng cả thang đã đạt.
//   2) Bậc 4 phải là `fg-inverse` chứ không phải một màu cố định: nền đặc là red-700 ở
//      sáng (cần chữ trắng) nhưng red-400 ở tối (cần chữ gần đen) — cùng token, hai
//      hướng ngược nhau. `fg-inverse` là token đã lật sẵn đúng chiều đó (trắng ở sáng,
//      gray-950 ở tối), nên không phải viết tay cặp `text-… dark:text-…` mà
//      designSystem.test.ts cấm. Bậc 1–3 thì ngược lại: nền vẫn đứng cùng phe với nền
//      trang nên mực là `fg-primary`, mực thường của chế độ đang dùng.
const LEVEL_INK = [
  'text-fg-secondary',
  'text-fg-primary',
  'text-fg-primary',
  'text-fg-primary',
  'text-fg-inverse',
]

/** Thứ trong tuần (T2=0 … CN=6) của một ngày ISO, tính bằng UTC để khỏi lệch múi giờ. */
function weekdayIndex(iso: string): number {
  return (new Date(iso + 'T00:00:00Z').getUTCDay() + 6) % 7
}

/** Lịch chi tiêu: mỗi ô là một ngày, càng chi nhiều ô càng đậm. */
export function SpendHeatmapCard({ points, base }: Props) {
  if (points.length === 0) return null
  const max = points.reduce((m, p) => Math.max(m, p.expense), 0)
  const levelOf = (v: number): number => {
    if (v <= 0 || max <= 0) return 0
    const ratio = v / max
    if (ratio > 0.75) return 4
    if (ratio > 0.5) return 3
    if (ratio > 0.25) return 2
    return 1
  }

  const leading = weekdayIndex(points[0].date)
  const cells: (DailyExpensePoint | null)[] = [...Array(leading).fill(null), ...points]

  return (
    <Card as="section">
      <h2 className="mb-2 text-sm font-semibold text-fg-muted">
        Lịch chi tiêu trong tháng
      </h2>
      {/* Ô CỐ ĐỊNH 46×34px (§B9), không `aspect-square` co giãn theo cột. Ở cột rộng
          (trang Ngân sách 1440px) ô vuông tự phình lên ~106px: một tấm lịch chiếm gần
          nửa màn để nói một con số mỗi ngày. rem chứ px vì Cài đặt → Cỡ chữ chỉ co giãn
          cái tính theo rem (§C.4). `justify-start`: lịch bám mép trái như mọi bảng khác
          trong app, không trôi ra giữa panel. */}
      <div className="grid grid-cols-[repeat(7,2.875rem)] justify-start gap-1">
        {WEEKDAYS.map((w) => (
          <div key={w} className="pb-0.5 text-center text-3xs text-fg-muted">
            {w}
          </div>
        ))}
        {cells.map((p, i) => {
          if (p === null) return <div key={`b${i}`} />
          const level = levelOf(p.expense)
          return (
            <div
              key={p.date}
              title={`${Number(p.date.slice(5, 7))}/${Number(p.date.slice(8))}: ${formatMoney(p.expense, base)}`}
              // Màu chữ theo bậc — xem LEVEL_INK ở đầu file (có số đo).
              className={`flex h-[2.125rem] items-center justify-center rounded text-3xs ${LEVEL_BG[level]} ${LEVEL_INK[level]}`}
            >
              {Number(p.date.slice(8))}
            </div>
          )
        })}
      </div>
      <div className="mt-2 flex items-center justify-end gap-1 text-3xs text-fg-muted">
        <span>Ít</span>
        {LEVEL_BG.map((bg, i) => (
          <span key={i} className={`h-2.5 w-2.5 rounded-sm ${bg}`} />
        ))}
        <span>Nhiều</span>
      </div>
    </Card>
  )
}
