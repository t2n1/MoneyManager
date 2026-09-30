// Một lời nhắc của quỹ chung (phần âm / nên tăng mức góp / góp dư) — dùng ở màn Quỹ
// chung và module Quỹ chung trên Bản tin, cùng câu chữ ở cả hai.
import { Money } from '../../components/ui'
import { VerdictNote } from '../../components/VerdictNote'
import { tr } from '../../i18n'
import { trn } from '../../i18n/react'
import type { CurrencyCode } from '../../lib/money'
import type { FundAlert } from './sharedFund'

export function FundAlertLine({ alert, name, currency }: { alert: FundAlert; name: string; currency: CurrencyCode }) {
  const amount = <Money amount={Math.abs(alert.balance)} currency={currency} />
  if (alert.kind === 'negative')
    return (
      <VerdictNote tone="bad" label={name} short={trn('{name} thiếu {amount}', { name, amount })}>
        {trn('đang thiếu {amount} — quỹ đang lấy tiền phần khác bù. Góp thêm cho phần này.', { amount })}
      </VerdictNote>
    )
  if (alert.kind === 'short-streak')
    return (
      <VerdictNote tone="warn" label={name} short={tr('{name}: nên tăng mức góp', { name })}>
        {tr('3 tháng liền chi nhiều hơn góp. Nên tăng mức góp hằng tháng.')}
      </VerdictNote>
    )
  return (
    <VerdictNote tone="info" label={name} short={trn('{name} dư {amount}', { name, amount })}>
      {trn('3 tháng liền góp dư, đã tích {amount}. Có thể giảm mức góp hoặc chuyển phần dư sang tiết kiệm chung.', {
        amount,
      })}
    </VerdictNote>
  )
}
