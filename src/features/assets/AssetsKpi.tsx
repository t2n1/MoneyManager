// Dải KPI của trang Tài sản, dùng chung cho CẢ HAI chế độ (bản vẽ 2a và 2b).
//
// Hai chế độ đổi đúng hai ô: ô đầu đổi phần chân (đường tí hon ở "Hôm nay" → hiệu cả
// khoảng ở "Theo thời gian") và ô cuối đổi hẳn nội dung (cho vay còn lại → vốn đầu tư đã
// bỏ vào). Hai ô giữa giống hệt. Nên đây là MỘT component với hai tham số, không phải hai
// bản chép tay — hai bản là hai chỗ phải sửa mỗi khi đổi cách in một con số, và dải này
// in bốn con số lớn nhất trang.
//
// Component tự gọi `useAssetsData` và `useCardsPanel`: react-query dùng chung cache nên
// gọi ở hai chỗ KHÔNG thêm lượt đọc nào, và làm vậy thì nơi dùng không phải chọc mười
// prop xuống chỉ để dựng bốn ô.
import type { ReactNode } from 'react'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Money, pct1, signedPct, StatusChip } from '../../components/ui'
import { dueDateLabel, dueRelativeLabel } from '../../lib/dates'
import type { CurrencyCode } from '../../lib/money'
import { investCapital } from './investCapital'
import { KpiCell, KpiStrip } from './KpiStrip'
import { makeMoneyView } from './moneyView'
import { useAssetsData } from './useAssetsData'
import { useCardsPanel } from './useCardsPanel'

/** Lớp cột theo số ô có THẬT — ô nào không có dữ liệu thì không dựng. */
const KPI_COLS: Record<number, string> = {
  1: '',
  2: 'lg:grid-cols-2',
  3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-[1.15fr_1fr_1.2fr_1fr]',
}

interface Props {
  /** Đồng tiền đang xem thử (null = tiền gốc) — nút ¥/₫/$ ở header trang. */
  viewCur: CurrencyCode | null
  /** Chân ô "Tài sản ròng": đường tí hon (Hôm nay) hoặc hiệu cả khoảng (Theo thời gian). */
  netWorthFoot?: ReactNode
  /** Ô cuối: khoản cho vay/nợ thẻ (Hôm nay) hay vốn đầu tư đã bỏ vào (Theo thời gian). */
  tail: 'loans' | 'invested'
}

export function AssetsKpi({ viewCur, netWorthFoot, tail }: Props) {
  const {
    todayISO,
    isLoading,
    base,
    rates,
    balances,
    breakdown,
    debtsSummary,
    purposeGroups,
    investmentAccounts,
    netWorth,
  } = useAssetsData()

  const displayCur = viewCur ?? base
  const mv = useMemo(
    () => makeMoneyView(base, displayCur, rates ?? {}),
    [base, displayCur, rates],
  )

  const visibleCards = breakdown.cards.filter((c) => !c.hidden)
  const { summary, funding } = useCardsPanel({
    cards: visibleCards,
    balances,
    base,
    rates: rates ?? {},
    todayISO,
  })

  const capital = useMemo(
    () => investCapital(investmentAccounts, base, rates ?? {}),
    [investmentAccounts, base, rates],
  )

  const accountCount = purposeGroups.reduce((n, g) => n + g.accounts.length, 0)
  const hasValuation = breakdown.groups.some((g) => g.accounts.some((a) => a.marketValue != null))
  const pnl = breakdown.totalPnl
  const cardOwed = -breakdown.cardDebt // số dương = đang nợ thẻ (quy đổi base)
  const netApprox =
    breakdown.hasForeign || debtsSummary.hasMissingRate || breakdown.cardHasMissingRate

  // Ô "Phải trả" chỉ dựng khi có thẻ đang nợ: một ô "—" chiếm một phần tư dải để nói
  // "không có gì" là đổi chỗ đắt nhất trang lấy một tin rỗng.
  const showDue = summary.billedBase != null
  const dueFunding = funding.groups.find((g) => g.totalOwed > 0) ?? null
  const showTail =
    tail === 'invested' ? investmentAccounts.length > 0 : debtsSummary.owedToMe > 0 || cardOwed > 0
  const count = 2 + (showDue ? 1 : 0) + (showTail ? 1 : 0)

  return (
    <KpiStrip cols={KPI_COLS[count] ?? KPI_COLS[4]}>
      <KpiCell label="Tài sản ròng" foot={netWorthFoot}>
        {isLoading ? (
          <span className="text-fg-muted">…</span>
        ) : (
          <Money amount={netWorth} currency={base} approx={netApprox} />
        )}
      </KpiCell>

      <KpiCell
        label="Tổng tài sản"
        foot={
          !isLoading && (
            <>
              {accountCount} tài khoản · {purposeGroups.length} nhóm
              {hasValuation && (
                <>
                  {' '}· lãi đầu tư{' '}
                  <Money
                    amount={Math.abs(pnl)}
                    currency={base}
                    tone={pnl >= 0 ? 'in' : 'out'}
                    showSign
                    approx={breakdown.pnlHasMissingRate}
                  />
                </>
              )}
            </>
          )
        }
      >
        {isLoading ? (
          <span className="text-fg-muted">…</span>
        ) : (
          <Money
            amount={breakdown.total}
            currency={base}
            approx={breakdown.hasForeign}
            className="text-fg-secondary"
          />
        )}
      </KpiCell>

      {showDue && (
        <KpiCell
          label={
            summary.nextDueISO
              ? `Phải trả · ${dueRelativeLabel(todayISO, summary.nextDueISO)}`
              : 'Phải trả · thẻ tín dụng'
          }
          tone="warn"
          badge={
            summary.nextDueISO && (
              <StatusChip tone="warn">{dueDateLabel(summary.nextDueISO)}</StatusChip>
            )
          }
          foot={
            dueFunding && (
              <>
                Từ {dueFunding.sourceName}{' '}
                <Money {...mv.view(dueFunding.sourceBalance, dueFunding.currency)} tone="muted" /> ·{' '}
                {dueFunding.enough ? (
                  <span className="text-state-good-fg">
                    đủ trả, dư{' '}
                    <Money
                      {...mv.view(
                        dueFunding.sourceBalance - dueFunding.totalOwed,
                        dueFunding.currency,
                      )}
                      tone="good"
                    />
                  </span>
                ) : (
                  <span className="text-state-warn-fg">
                    cần nạp thêm{' '}
                    <Money {...mv.view(dueFunding.shortfall, dueFunding.currency)} tone="warn" />
                  </span>
                )}
              </>
            )
          }
        >
          <Money
            amount={mv.view(summary.billedBase ?? 0).amount}
            currency={mv.cur}
            tone="out"
            approx={summary.approx || mv.converted}
          />
        </KpiCell>
      )}

      {showTail && tail === 'loans' && (
        <KpiCell
          label={debtsSummary.owedToMe > 0 ? 'Cho vay còn lại' : 'Tổng nợ thẻ'}
          foot={
            <>
              {debtsSummary.owedToMe > 0 && cardOwed > 0 && (
                <>
                  Tổng nợ thẻ <Money {...mv.view(cardOwed)} tone="out" /> ·{' '}
                </>
              )}
              <Link to="/debts" className="font-medium text-fg-accent">
                Nợ / cho vay ›
              </Link>
            </>
          }
        >
          <Money
            {...mv.view(debtsSummary.owedToMe > 0 ? debtsSummary.owedToMe : cardOwed)}
            tone={debtsSummary.owedToMe > 0 ? 'neutral' : 'out'}
            approx={debtsSummary.hasMissingRate}
            className={debtsSummary.owedToMe > 0 ? 'text-fg-secondary' : ''}
          />
        </KpiCell>
      )}

      {showTail && tail === 'invested' && (
        <KpiCell
          label="Vốn đầu tư đã bỏ vào"
          foot={
            <>
              Giá trị nay <Money {...mv.view(capital.currentValue)} tone="muted" />
              {capital.growthPct != null && (
                <>
                  {' '}·{' '}
                  <span className={capital.growth >= 0 ? 'text-money-in' : 'text-money-out'}>
                    {signedPct(pct1(capital.growthPct))}
                  </span>
                </>
              )}
            </>
          }
        >
          <Money
            {...mv.view(capital.costBasis)}
            approx={capital.hasMissingRate || mv.converted}
            className="text-fg-secondary"
          />
        </KpiCell>
      )}
    </KpiStrip>
  )
}

