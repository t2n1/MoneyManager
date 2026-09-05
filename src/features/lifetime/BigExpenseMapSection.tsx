// Bản đồ khoản lớn — bảng dưới đồ thị Trọn đời (Chặng 19 của giáo trình đã đối chiếu).
//
// Mỗi mốc phía trước sinh một dòng "cần để dành mỗi tháng"; tổng của chúng đặt cạnh phần
// dư THẬT mỗi tháng. Toán nằm ở bigExpenses.ts (thuần, có test) — component này chỉ render.
//
// Ba nguồn mốc được gộp: sự kiện kịch bản (chỉ có năm), Khoản sắp chi (có ngày), Mục tiêu
// tiết kiệm (có hạn + phần đã dành). Không khử trùng lặp giữa chúng: nhìn thấy đủ rồi tự
// dọn dễ hơn là đoán xem app đã giấu dòng nào.
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Card, Money, Num, SectionTitle } from '../../components/ui'
import { ExplainBox } from '../../components/ExplainBox'
import { useAccountBalances, usePlannedExpenses, useSavingsGoals } from '../../hooks/queries'
import type { CurrencyCode } from '../../lib/currencies'
import { buildBigExpenseMap, type GoalLikeInput } from './bigExpenses'
import type { FxOf } from './fxModel'
import type { LifetimeEvent } from './project'

interface Props {
  /** Sự kiện của bản chiếu đang xem — fx đã chuẩn hoá theo tỷ giá hôm nay. */
  events: LifetimeEvent[]
  displayCurrency: CurrencyCode
  fxOf: FxOf
  todayISO: string
  /**
   * Phần dư mỗi tháng để so với tổng "cần để dành". `real` = số THẬT 12 tháng qua
   * (suggestBaseline); false = số kế hoạch của chặng đang chạy. null = chưa tính được.
   */
  surplus: { monthlyMinor: number; real: boolean } | null
}

const SOURCE_LABEL: Record<'event' | 'planned' | 'goal', string> = {
  event: 'kịch bản',
  planned: 'khoản sắp chi',
  goal: 'mục tiêu',
}

export function BigExpenseMapSection({ events, displayCurrency, fxOf, todayISO, surplus }: Props) {
  const { data: planned = [] } = usePlannedExpenses()
  const { data: goals = [] } = useSavingsGoals()
  const { data: balances = [] } = useAccountBalances()

  const map = useMemo(() => {
    const balanceById = new Map(balances.map((b) => [b.id, b]))
    const goalInputs: GoalLikeInput[] = goals.map((g) => {
      const acc = balanceById.get(g.account_id)
      return {
        id: g.id,
        name: g.name,
        targetMinor: g.target_amount,
        // Đầu tư đọc định giá, còn lại đọc số dư — đúng thứ tự của assets/aggregate.ts.
        progressMinor: acc ? (acc.market_value ?? acc.balance) : 0,
        currency: (acc?.currency ?? displayCurrency) as CurrencyCode,
        targetDate: g.target_date,
      }
    })
    return buildBigExpenseMap({
      todayISO,
      displayCurrency,
      events,
      planned: planned.filter((p) => p.status === 'planned'),
      goals: goalInputs,
      fxOf,
    })
  }, [balances, goals, planned, events, displayCurrency, fxOf, todayISO])

  // Không có mốc nào phía trước thì im lặng — thẻ trống không giúp ai.
  if (map.items.length === 0) return null

  const over = surplus !== null && map.totalMonthlyNeedMinor > surplus.monthlyMinor
  const heavy = map.heavyYears.length > 0 ? map.heavyYears[0] : null
  const heavyRow = heavy !== null ? map.yearPressure.find((y) => y.year === heavy) : null

  return (
    <Card as="section" elevation="panel" padding="panel" className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <SectionTitle>Bản đồ khoản lớn</SectionTitle>
        <span className="text-2xs text-fg-muted">
          cần để dành mỗi tháng, tính từ hôm nay
        </span>
      </div>

      <ul className="mt-2 divide-y divide-border-subtle">
        {map.items.map((i) => (
          <li key={`${i.source}:${i.id}`} className="flex items-baseline gap-2 py-2">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-fg-primary">{i.label}</span>
              <span className="block text-2xs text-fg-muted">
                {i.recurring ? (
                  <>mỗi năm · {SOURCE_LABEL[i.source]}</>
                ) : (
                  <>
                    {i.dueMonth ?? `năm ${i.dueYear}`} ·{' '}
                    <Num tone="muted">{i.monthsLeft} tháng</Num> · {SOURCE_LABEL[i.source]}
                  </>
                )}
              </span>
            </span>
            {i.monthlyNeedMinor === null ? (
              <span className="text-sm text-fg-muted">thiếu tỷ giá</span>
            ) : (
              <Money
                amount={i.monthlyNeedMinor}
                currency={displayCurrency}
                tone="out"
                className="text-sm"
              />
            )}
          </li>
        ))}
      </ul>

      <div className="mt-1 flex items-baseline justify-between gap-2 border-t border-border-panel pt-2">
        <span className="text-sm font-medium text-fg-secondary">Tổng cần để dành</span>
        <Money
          amount={map.totalMonthlyNeedMinor}
          currency={displayCurrency}
          tone="out"
          approx={map.hasMissingFx}
          className="text-sm font-semibold"
        />
      </div>
      {surplus !== null && (
        <div className="flex items-baseline justify-between gap-2 py-1">
          <span className="text-sm text-fg-secondary">
            Phần dư của bạn {surplus.real ? '(12 tháng qua)' : '(theo kế hoạch)'}
          </span>
          <Money
            amount={surplus.monthlyMinor}
            currency={displayCurrency}
            tone={over ? 'muted' : 'in'}
            className="text-sm"
          />
        </div>
      )}

      {over && surplus !== null && (
        <p className="mt-1 text-2xs leading-snug text-state-warn-fg">
          Các mốc đang đòi nhiều hơn phần dư — không mốc nào sai, chúng chỉ chưa từng được
          nhìn cùng lúc. Ba lối thoát đều rẻ khi còn thời gian: dời một mốc, thu nhỏ nó,
          hoặc bắt đầu tích sớm hơn.
        </p>
      )}

      {heavyRow && (
        <div className="flex items-baseline justify-between gap-2 py-1">
          <span className="text-sm text-fg-secondary">
            Năm nặng nhất · <Num tone="muted">{heavyRow.year}</Num> (
            <Num tone="muted">{heavyRow.onceCount} khoản</Num> dồn cùng năm)
          </span>
          <Money
            amount={heavyRow.totalMinor}
            currency={displayCurrency}
            tone="out"
            approx={map.hasMissingFx}
            className="text-sm"
          />
        </div>
      )}

      <ExplainBox label="Cách tính">
        <p>
          <b>Cần mỗi tháng</b> = số còn thiếu ÷ số tháng còn lại. Mốc của kịch bản chỉ có
          NĂM nên tính tới tháng 1 của năm đó — thà dư sớm còn hơn hụt.
        </p>
        <p>
          <b>Mục tiêu tiết kiệm</b> đã trừ phần dành được (số dư tài khoản gắn với nó); mục
          tiêu không đặt hạn không vào bản đồ. Sửa hạn và số tiền ở{' '}
          <Link to="/assets" className="font-medium text-fg-accent">
            tab Tài sản
          </Link>{' '}
          và{' '}
          <Link to="/planned" className="font-medium text-fg-accent">
            Khoản sắp chi
          </Link>
          .
        </p>
      </ExplainBox>
    </Card>
  )
}
