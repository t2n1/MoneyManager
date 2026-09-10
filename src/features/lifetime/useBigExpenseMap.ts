// Dữ liệu của pane "Bản đồ khoản lớn" — tách RA KHỎI component vì cái CHIP cũng cần nó.
//
// Hàng 11 của bản vẽ ghi nhãn chip là `Bản đồ khoản lớn · N khoản · ¥X/tháng`. Hai con
// số đó là kết quả của `buildBigExpenseMap`, mà phép ấy cần ba truy vấn (Khoản sắp chi,
// Mục tiêu tiết kiệm, số dư tài khoản). Chip nằm NGOÀI pane, nên nếu phép tính còn ở
// trong component thì chip không có số — và chip "Bản đồ khoản lớn" trơ, không nói có
// bao nhiêu khoản, là đúng thứ khiến người dùng phải bấm mở mới biết có gì trong đó.
//
// Nhấc lên hook thay vì gọi component hai lần: ba `use*` kia đi qua TanStack Query nên
// gọi lại không tốn mạng, nhưng `buildBigExpenseMap`/`buildLifetimeCostMap` thì tính
// lại thật. Một chỗ tính, hai chỗ đọc.
import { useMemo } from 'react'
import { useAccountBalances, usePlannedExpenses, useSavingsGoals } from '../../hooks/queries'
import type { CurrencyCode } from '../../lib/currencies'
import { buildBigExpenseMap, type BigExpenseMap, type GoalLikeInput } from './bigExpenses'
import type { FxOf } from './fxModel'
import { buildLifetimeCostMap, type LifetimeCostMap } from './lifetimeCost'
import type { LifetimeEvent, YearRow } from './project'

export interface BigExpenseMapData {
  /** Cách xếp "Cần dành" — cần để dành mỗi tháng, tính từ hôm nay. */
  map: BigExpenseMap
  /** Cách xếp "Cả đời" — tổng cả đời theo từng khoản. */
  life: LifetimeCostMap
}

export function useBigExpenseMap({
  events,
  displayCurrency,
  fxOf,
  todayISO,
  rows,
}: {
  events: LifetimeEvent[]
  displayCurrency: CurrencyCode
  fxOf: FxOf
  todayISO: string
  rows: readonly YearRow[]
}): BigExpenseMapData {
  const { data: planned = [] } = usePlannedExpenses()
  const { data: goals = [] } = useSavingsGoals()
  const { data: balances = [] } = useAccountBalances()

  const life = useMemo(() => buildLifetimeCostMap({ rows }), [rows])

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

  return { map, life }
}
