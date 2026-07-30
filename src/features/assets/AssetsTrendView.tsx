// Tab con "Diễn biến" của Tài sản — trả lời "tôi đang tiến bộ không". Ba khối này từng
// nằm rải trong mạch cuộn 780 dòng của trang Tài sản, chen giữa các khối trả lời câu hỏi
// khác ("giờ tôi có bao nhiêu"). Xem docs/information-architecture.md §2.3.
import { InvestmentPerformanceSection } from './InvestmentPerformanceSection'
import { NetWorthHistorySection } from './NetWorthHistorySection'
import { SavingsGoalsSection } from './SavingsGoalsSection'
import { useAssetsData } from './useAssetsData'

export function AssetsTrendView() {
  const { base, netWorth, netWorthReliable, investmentAccounts } = useAssetsData()

  return (
    <div className="flex flex-col gap-4">
      {/* Lịch sử tài sản ròng (mục AF) — đường đi của con số ròng đứng đầu tab này */}
      <NetWorthHistorySection base={base} currentNetWorth={netWorthReliable ? netWorth : null} />

      {/* Hiệu quả đầu tư: đóng góp vs tăng trưởng + XIRR sau thuế/lạm phát */}
      <InvestmentPerformanceSection accounts={investmentAccounts} base={base} />

      {/* Mục tiêu tiết kiệm (mục AD) */}
      <SavingsGoalsSection />
    </div>
  )
}
