// Thẻ Tóm tắt kế hoạch — ruột của PlanDock khi KHÔNG chọn gì (spec §10, dsg-handoff
// README mục "Thẻ Tóm tắt kế hoạch"). Bảy hàng nhãn–giá trị, y hệt bản vẽ
// (`Tuong lai - 1c dong thoi gian.dc.html`, dòng ~1936-1944: `dockRows`).
//
// CHỈ RENDER — không tính gì. Mọi giá trị đã được `TuongLaiPage.tsx` tính sẵn bằng các
// hàm thuần đã có (`fireYear`/`assetsAtAge` của insights.ts, `biggestExpenseItem` của
// bigExpenses.ts) rồi truyền vào bằng prop. Lặp lại phép tính ở đây là hai công thức
// cho cùng một câu hỏi — đúng thứ CLAUDE.md cấm ("Toán thuần nằm ngoài React").
import type { ReactNode } from 'react'
import { Card, Money, Num, SectionTitle } from '../../components/ui'
import { Guide } from '../../components/Guide'
import type { CurrencyCode } from '../../lib/currencies'

export interface BiggestExpenseSummary {
  label: string
  /** minor theo `currency` — đã quy đổi, không thiếu tỷ giá (biggestExpenseItem loại
   *  sẵn các dòng thiếu tỷ giá trước khi chọn ra dòng lớn nhất). */
  amountMinor: number
}

export interface PlanSummaryCardProps {
  currency: CurrencyCode
  /** `input.phases.length` — KHÔNG đếm lại từ đâu khác. */
  phaseCount: number
  /** `input.events.length`. */
  eventCount: number
  /** `lifetimeVerdict(rows, birthYear).fireYear` / `.fireAge` — null = chưa đạt. */
  fireYear: number | null
  fireAge: number | null
  /** `input.endAge` — dùng để ghép nhãn "Lúc N tuổi" đúng tuổi chiếu tới. */
  endAge: number
  /** `assetsAtAge(rows, endAge)?.center ?? null` — null khi chưa chiếu được năm đó. */
  assetsAtEndMinor: number | null
  /** Có tiền tệ nào trong kế hoạch (chặng hoặc mốc) chưa tra được tỷ giá hôm nay —
   *  bật `≈` trên "Lúc N tuổi" vì đó là tổng CẢ KẾ HOẠCH, thứ dễ bị kéo lệch nhất khi
   *  thiếu một dòng quy đổi. Không bao giờ quy 1:1 (quy ước `hasMissingRate` toàn repo). */
  hasMissingRate: boolean
  /** `biggestExpenseItem(buildBigExpenseMap(...))` — null khi bản đồ rỗng hoặc mọi
   *  dòng đều thiếu tỷ giá. */
  biggestExpense: BiggestExpenseSummary | null
  /** `input.realReturnBps` (nguyên trạng, chưa quy đổi %). */
  realReturnBps: number
  /** `input.inflationBps`. */
  inflationBps: number
}

/** bps → "x,y%/năm" kiểu Việt (phẩy), cùng công thức đã dùng ở
 *  `assets/InvestmentPerformanceSection.tsx` và `assets/RetirementPage.tsx` — không phải
 *  công thức mới. */
function pctPerYear(bps: number): string {
  return `${(bps / 100).toFixed(1).replace('.', ',')}%/năm`
}

export function PlanSummaryCard({
  currency,
  phaseCount,
  eventCount,
  fireYear,
  fireAge,
  endAge,
  assetsAtEndMinor,
  hasMissingRate,
  biggestExpense,
  realReturnBps,
  inflationBps,
}: PlanSummaryCardProps) {
  return (
    <Card as="section" padding="panel" elevation="panel">
      <SectionTitle role="micro">Tóm tắt kế hoạch</SectionTitle>

      {/* `divide-border-subtle` — cùng token "kẻ hàng" mà BigExpenseMapSection.tsx đã
          dùng cho danh sách ngay bên dưới màn này (§8: #171d18 chưa có tên riêng, dùng
          lại token gần nhất thay vì thêm một token mới cho cùng một việc). */}
      <div className="mt-1.5 divide-y divide-border-subtle">
        <SummaryRow label="Chặng đời">
          <Num>{phaseCount} chặng</Num>
        </SummaryRow>

        <SummaryRow label="Mốc">
          <Num>{eventCount} mốc</Num>
        </SummaryRow>

        <SummaryRow label="Tự do tài chính">
          {fireYear === null ? (
            // "chưa đạt" là CHỮ, không phải số — không được qua <Num> (xem đầu file
            // Num.tsx: "Con số KHÔNG phải tiền"). Tô cảnh báo cho khớp bản vẽ (#ffc84d).
            <span className="text-fg-warn">chưa đạt</span>
          ) : (
            <Num tone="in">
              {fireYear} · {fireAge}t
            </Num>
          )}
        </SummaryRow>

        <SummaryRow label={`Lúc ${endAge} tuổi`}>
          {assetsAtEndMinor === null ? (
            <Num tone="muted">—</Num>
          ) : (
            <Money
              amount={assetsAtEndMinor}
              currency={currency}
              tone={assetsAtEndMinor < 0 ? 'out' : 'neutral'}
              approx={hasMissingRate}
            />
          )}
        </SummaryRow>

        {/* "Cần dành nhiều nhất" — không phải "Khoản lớn nhất" (tức "largest lifetime expense").
            `bigExpenses.ts` chọn khoản nặng nhất bằng `remainingMinor` (số tiền còn phải
            chuẩn bị), không phải tổng chi tiêu suốt đời. Bản đồ khoản lớn trả lời câu
            "cần để dành mỗi tháng bao nhiêu" (savings runway), không phải "cái gì tốn
            nhiều tiền nhất". Nhãn này sẽ misdescribe con số nếu ghi "Khoản lớn nhất". */}
        <SummaryRow label="Cần dành nhiều nhất">
          {biggestExpense === null ? (
            <Num tone="muted">—</Num>
          ) : (
            <>
              <span className="min-w-0 truncate">{biggestExpense.label}</span>
              <Money
                amount={biggestExpense.amountMinor}
                currency={currency}
                tone="out"
                className="shrink-0"
              />
            </>
          )}
        </SummaryRow>

        <SummaryRow label="Lợi suất thực">
          <Num>{pctPerYear(realReturnBps)}</Num>
        </SummaryRow>

        <SummaryRow label="Lạm phát chi tiêu">
          <Num>{pctPerYear(inflationBps)}</Num>
        </SummaryRow>
      </div>

      <Guide className="mt-2 block text-2xs leading-relaxed text-fg-muted">
        Bấm một chặng hoặc mốc để sửa · Esc đóng · ⌘Z hoàn tác
      </Guide>
    </Card>
  )
}

/** Một hàng nhãn–giá trị của thẻ. Nhãn co dãn + cắt (`truncate`), giá trị đứng nguyên
 *  bên phải — đúng khuôn `dockRows` của bản vẽ. Màu mặc định của giá trị là
 *  `text-fg-secondary` (khớp tông `#cdd5cc` của hầu hết bảy hàng); `<Num>`/`<Money>` bên
 *  trong tự mang tông riêng (in/out/warn/muted) khi hàng cần khác đi — span của chúng có
 *  class màu riêng nên không bị màu mặc định của hàng đè lên. */
function SummaryRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2.5 py-1.5">
      <span className="min-w-0 flex-1 truncate text-xs text-fg-muted">{label}</span>
      <span className="flex min-w-0 shrink-0 items-baseline gap-1 whitespace-nowrap text-xs font-medium text-fg-secondary">
        {children}
      </span>
    </div>
  )
}
