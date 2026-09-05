// Panel "Thu nhập & nếp chi" — hai insight hành vi từ giáo trình đã đối chiếu (09/2026):
// cửa sổ vàng sau tăng lương (C11/C21) và lối sống lạm phát (C7). Toán ở drift.ts
// (thuần, có test); panel tự IM LẶNG khi không có gì đáng nói, theo quy ước bulletin.
import { useMemo } from 'react'
import { Card, Num, SectionTitle, pct1, signedPct } from '../../components/ui'
import { useAccounts, useProfile, useRangeTransactions, useRates } from '../../hooks/queries'
import { addMonths, formatMonthLabel, getMonthRange, monthKeyForDate, toISODate } from '../../lib/dates'
import type { CurrencyCode } from '../../lib/money'
import { detectRaise, lifestyleDrift } from './drift'

export function DriftPanel({ className = '' }: { className?: string }) {
  const { data: profile } = useProfile()
  const { data: accounts = [] } = useAccounts()
  const { base, rates } = useRates()
  const todayISO = toISODate(new Date())
  const monthStartDay = profile?.month_start_day ?? 1

  const range = useMemo(() => {
    const current = monthKeyForDate(todayISO, monthStartDay)
    return {
      start: getMonthRange(addMonths(current, -12), monthStartDay).start,
      end: getMonthRange(current, monthStartDay).end,
    }
  }, [todayISO, monthStartDay])
  const { data: txs = [] } = useRangeTransactions(range, !!profile)

  const { raise, drift } = useMemo(() => {
    if (txs.length === 0 || rates === undefined) return { raise: null, drift: null }
    const curOf = new Map(accounts.map((a) => [a.id, a.currency as CurrencyCode]))
    const args = {
      txs,
      currencyOf: (id: string) => curOf.get(id) ?? base,
      base,
      rates,
      todayISO,
      monthStartDay,
    }
    return { raise: detectRaise(args), drift: lifestyleDrift(args) }
  }, [txs, accounts, base, rates, todayISO, monthStartDay])

  const noiVeDrift = drift !== null && drift.verdict !== null
  if (raise === null && !noiVeDrift) return null

  return (
    <Card elevation="panel" padding="panel" as="section" className={`min-w-0 ${className}`.trim()}>
      <SectionTitle>Thu nhập &amp; nếp chi</SectionTitle>

      {raise !== null && (
        <>
          <p className="mt-2 text-sm text-fg-primary">
            Lương định kỳ vừa lên mức mới:{' '}
            <Num tone="in">{signedPct(pct1(raise.pct / 100))}</Num> từ{' '}
            <Num tone="muted">{formatMonthLabel(raise.fromKey)}</Num>.
          </p>
          {/* Cùng vai với actionLine của tab Tương lai: câu DUY NHẤT hành động được ngay. */}
          <p className="mt-1 text-sm font-medium text-fg-accent">
            Cửa sổ vàng: nâng mức để dành ngay bây giờ — vài tháng nữa mức sống sẽ dâng
            theo và cùng con số đó bắt đầu thấy đau.
          </p>
        </>
      )}

      {noiVeDrift && drift !== null && (
        <p className="mt-2 text-sm text-fg-primary">
          6 tháng qua so với 6 tháng trước: thu{' '}
          <Num tone={drift.incomePct !== null && drift.incomePct < 0 ? 'out' : 'in'}>
            {signedPct(pct1((drift.incomePct ?? 0) / 100))}
          </Num>{' '}
          · chi{' '}
          <Num tone={drift.expensePct !== null && drift.expensePct > 0 ? 'out' : 'in'}>
            {signedPct(pct1((drift.expensePct ?? 0) / 100))}
          </Num>
          {drift.savedPctRecent !== null && drift.savedPctPrior !== null && (
            <>
              {' '}
              — phần để dành{drift.approx ? ' ≈' : ''}{' '}
              <Num tone="muted">{Math.round(drift.savedPctPrior)}%</Num> →{' '}
              <Num tone={drift.savedPctRecent < drift.savedPctPrior ? 'out' : 'in'}>
                {Math.round(drift.savedPctRecent)}%
              </Num>
            </>
          )}
          .{' '}
          {drift.verdict === 'chi-dang-theo-thu'
            ? 'Chi đang dâng nhanh hơn thu — phần tăng thêm đang bị mức sống nuốt dần.'
            : 'Tỷ lệ để dành đang tụt so với nửa năm trước.'}
        </p>
      )}
    </Card>
  )
}
