// Tab con "Diễn biến" của Tài sản — trả lời "tôi đang tiến bộ không". Ba khối này từng
// nằm rải trong mạch cuộn 780 dòng của trang Tài sản, chen giữa các khối trả lời câu hỏi
// khác ("giờ tôi có bao nhiêu"). Xem docs/information-architecture.md §2.3.
import { useMemo } from 'react'
import type { CurrencyCode } from '../../lib/money'
import { CurrencyViewToggle } from './CurrencyViewToggle'
import { InvestmentPerformanceSection } from './InvestmentPerformanceSection'
import { InvestmentValueHistorySection } from './InvestmentValueHistorySection'
import { makeMoneyView } from './moneyView'
import { NetWorthHistorySection } from './NetWorthHistorySection'
import { SavingsGoalsSection } from './SavingsGoalsSection'
import { useAssetsData } from './useAssetsData'

interface Props {
  /** "Xem thử bằng tiền khác" — state sống ở AssetsPage, dùng chung với tab Hiện tại. */
  viewCur: CurrencyCode | null
  onViewCurChange: (c: CurrencyCode | null) => void
}

export function AssetsTrendView({ viewCur, onViewCurChange }: Props) {
  const { base, rates, netWorth, netWorthReliable, investmentAccounts } = useAssetsData()

  const displayCur = viewCur ?? base
  // Bộ quy đổi dùng chung cho mọi con số trên tab (xem moneyView.ts). Lịch sử ròng quy
  // đổi bằng tỷ giá HÔM NAY cho mọi mốc — đủ cho mục đích ước chừng, có ≈ đi kèm.
  const mv = useMemo(
    () => makeMoneyView(base, displayCur, rates ?? {}),
    [base, displayCur, rates],
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="-mb-2 flex justify-end">
        <CurrencyViewToggle
          base={base}
          rates={rates}
          value={displayCur}
          onChange={onViewCurChange}
          variant="card"
        />
      </div>

      {/* Lịch sử tài sản ròng (mục AF) — đường đi của con số ròng đứng đầu tab này */}
      <NetWorthHistorySection
        currentNetWorth={netWorthReliable ? netWorth : null}
        view={mv}
      />

      {/* Đầu tư theo thời gian — đường đi của danh mục; đứng trước ô Hiệu quả đầu tư vì ô
          đó là bản CHỐT (một con số %/năm) của cùng câu chuyện mà biểu đồ này kể theo thời
          gian: cùng hai đại lượng "tiền bỏ vào" và "giá trị", cùng màu. */}
      <InvestmentValueHistorySection
        accounts={investmentAccounts}
        base={base}
        view={mv}
      />

      {/* Hiệu quả đầu tư: đóng góp vs tăng trưởng + XIRR sau thuế/lạm phát */}
      <InvestmentPerformanceSection accounts={investmentAccounts} base={base} view={mv} />

      {/* Mục tiêu tiết kiệm (mục AD) */}
      <SavingsGoalsSection view={mv} />
    </div>
  )
}
