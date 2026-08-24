// Dải bốn ô số đầu trang Tài sản (bản vẽ 2a/2b) — MỘT khung, bốn ô, kẻ dọc ở giữa.
//
// Nó thay hai khối cũ: thẻ gradient xanh "Tổng tài sản" và thẻ "Tài sản ròng" đứng cách
// đó một ô lưới. Ba lý do, đều đọc được từ chính hai khối cũ:
//
//   · Thẻ xanh in TỔNG TÀI SẢN ở cỡ lớn nhất trang, nhưng con số người ta mở trang để
//     hỏi là RÒNG — tổng chưa trừ nợ thẻ, mà sổ này nợ thẻ ¥694.594. Cỡ chữ đang trao
//     ngôi đầu cho con số ít quan trọng hơn.
//   · Thẻ "Tài sản ròng" phải in lại dòng "Tổng tài sản" bên trong để làm chiết tính, tức
//     cùng một con số hiện hai lần ở hai độ cao khác nhau. Dải này in nó MỘT lần, ở ô kế
//     bên, nên hai số vẫn đọc được cùng lúc mà không nhân bản.
//   · Nền gradient buộc mọi chữ phụ phải là một sắc độ riêng (green-50 trơn, không alpha —
//     xem CurrencyViewToggle) và buộc nút ¥/₫/$ phải có biến thể `onGreen` chỉ dùng đúng
//     một chỗ. Bỏ nền đặc biệt là bỏ luôn cả hai nhánh đó.
//
// Ô nào cũng có thể vắng (chưa có thẻ tín dụng, chưa có khoản cho vay) nên nơi gọi tự
// chọn tập ô — dải không giả định đúng bốn.
import type { ReactNode } from 'react'
import { Card } from '../../components/ui'

/**
 * Bề mặt của một ô. `warn` là ô CÓ HẠN CHÓT (thẻ tới hạn) — nó là ô duy nhất trên trang
 * mang một ngày phải làm gì, nên nó được tô nền để tách khỏi ba ô chỉ để đọc.
 */
export type KpiTone = 'plain' | 'warn'

const TONE: Record<KpiTone, string> = {
  plain: '',
  warn: 'bg-state-warn-bg',
}

export function KpiCell({
  label,
  badge,
  tone = 'plain',
  children,
  foot,
}: {
  label: string
  /** Chip nhỏ cạnh nhãn — ngày đến hạn, cờ "ngoài tổng"… */
  badge?: ReactNode
  tone?: KpiTone
  /** Con số lớn. Truyền <Money> để đi qua chế độ riêng tư và dấu ≈. */
  children: ReactNode
  /** Một hoặc hai dòng chữ nhỏ dưới số — chỗ nói NGHĨA của con số. */
  foot?: ReactNode
}) {
  return (
    <div className={`min-w-0 px-4 py-3.5 lg:px-5 ${TONE[tone]}`.trim()}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <p className="text-2xs uppercase tracking-label text-fg-muted">{label}</p>
        {badge}
      </div>
      {/* Cùng bậc chữ với dải KPI của Bản tin (features/bulletin/KpiRow.tsx): 22px ở
          mobile vì bốn ô xếp dọc trong 375px, 26px từ lg. KHÔNG kèm tabular-nums —
          <Money> đã là font-mono, mọi glyph vốn cùng bề rộng. */}
      <div className="mt-2 font-mono text-kpi font-medium tracking-number">
        {children}
      </div>
      {foot && <div className="mt-2.5 text-2xs leading-snug text-fg-muted">{foot}</div>}
    </div>
  )
}

/**
 * Khung dải. Mobile xếp DỌC có kẻ ngang, từ lg thành bốn cột có kẻ dọc.
 *
 * `cols` nhận đúng chuỗi tỷ lệ của bản vẽ (fr, không px — cỡ chữ của người dùng co giãn
 * theo rem nên bề rộng cột phải giãn theo, xem tests/designSystem.test.ts).
 */
export function KpiStrip({ cols, children }: { cols: string; children: ReactNode }) {
  return (
    <Card
      elevation="panel"
      padding="none"
      className={`grid shrink-0 grid-cols-1 divide-y divide-border-panel overflow-hidden lg:divide-x lg:divide-y-0 ${cols}`}
    >
      {children}
    </Card>
  )
}
