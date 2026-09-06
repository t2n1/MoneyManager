// Panel "Thu nhập & nếp chi" — các insight hành vi từ giáo trình đã đối chiếu (09/2026):
// cửa sổ vàng sau tăng lương (C11/C21), lối sống lạm phát (C7), phí lặp chưa khai
// (C4/C22) và lạm phát cá nhân (C1/C10). Toán ở drift.ts / recurringFees.ts /
// personalInflation.ts (thuần, có test); panel tự IM LẶNG khi không có gì đáng nói,
// theo quy ước bulletin.
import { useMemo } from 'react'
import { Card, Money, Num, SectionTitle, pct1, signedPct } from '../../components/ui'
import {
  useAccounts,
  useCategories,
  useProfile,
  useRates,
  useTransferCategoryIds,
} from '../../hooks/queries'
import { formatMonthLabel, toISODate } from '../../lib/dates'
import type { CurrencyCode } from '../../lib/money'
import type { TransactionRow } from '../../types/database.types'
import { detectRaise, lifestyleDrift } from './drift'
import { detectRecurringFees } from './recurringFees'
import { INFL_SPEAK_PCT, personalInflation } from './personalInflation'

/** Chỉ bày chừng này chuỗi phí to nhất — panel cột phụ, không phải trang kiểm kê. */
const FEE_SHOW_MAX = 3

interface Props {
  /**
   * Giao dịch phủ ÍT NHẤT 25 tháng gần đây (12 tháng hoàn tất + cùng kỳ năm ngoái) —
   * BulletinPage đưa xuống từ truy vấn dùng chung của cả trang, panel không tự tải để
   * khỏi kéo một dải chồng lấn lần thứ hai. Rộng hơn cũng được: mọi phép tính bên trong
   * đều tự cắt cửa sổ theo tháng.
   */
  txs: TransactionRow[]
  className?: string
}

export function DriftPanel({ txs, className = '' }: Props) {
  const { data: profile } = useProfile()
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()
  const transferIds = useTransferCategoryIds()
  const { base, rates } = useRates()
  const todayISO = toISODate(new Date())
  const monthStartDay = profile?.month_start_day ?? 1

  const { raise, drift, fees, infl } = useMemo(() => {
    if (txs.length === 0 || rates === undefined)
      return { raise: null, drift: null, fees: null, infl: null }
    const curOf = new Map(accounts.map((a) => [a.id, a.currency as CurrencyCode]))
    const args = {
      txs,
      currencyOf: (id: string) => curOf.get(id) ?? base,
      base,
      rates,
      todayISO,
      monthStartDay,
    }
    return {
      raise: detectRaise(args),
      drift: lifestyleDrift(args),
      fees: detectRecurringFees({ ...args, transferIds }),
      infl: personalInflation({ ...args, transferIds }),
    }
  }, [txs, accounts, base, rates, todayISO, monthStartDay, transferIds])

  const catName = (id: string | null) =>
    (id !== null ? categories.find((c) => c.id === id)?.name : undefined) ?? 'Chưa rõ'

  const noiVeDrift = drift !== null && drift.verdict !== null
  // Lạm phát cá nhân dưới ngưỡng là nhiễu, không phải tin — panel không nói.
  const noiVeInfl = infl !== null && Math.abs(infl.pct) >= INFL_SPEAK_PCT
  if (raise === null && !noiVeDrift && fees === null && !noiVeInfl) return null

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

      {/* Lạm phát cá nhân: giỏ chi CỦA MÌNH đắt lên bao nhiêu, so đúng cùng tháng. */}
      {noiVeInfl && infl !== null && (
        <p className="mt-2 text-sm text-fg-primary">
          So <Num tone="muted">{infl.pairKeys.length} tháng</Num> cùng kỳ năm ngoái: giỏ chi
          của bạn {infl.pct >= 0 ? 'đắt lên' : 'rẻ đi'}{infl.approx ? ' ≈' : ''}{' '}
          {/* Hướng đã nằm trong chữ ("đắt lên"/"rẻ đi") → số là TRỊ TUYỆT ĐỐI, kẻo ra
              "rẻ đi −35%" — hai dấu trừ chồng nhau. pct1 trả SỐ, tự thêm % và dấu phẩy. */}
          <Num tone={infl.pct >= 0 ? 'out' : 'in'}>
            {String(pct1(Math.abs(infl.pct) / 100)).replace('.', ',')}%
          </Num>
          {infl.topCategory !== null && infl.topCategory.pct > 0 && (
            <>
              {' '}
              — nhanh nhất ở «{catName(infl.topCategory.categoryId)}»{' '}
              <Num tone="out">{signedPct(pct1(infl.topCategory.pct / 100))}</Num>
            </>
          )}
          .
        </p>
      )}

      {/* Phí lặp hằng tháng CHƯA thành lệnh định kỳ — phần chi vô hình nhất của sổ. */}
      {fees !== null && (
        <div className="mt-2 border-t border-border-subtle pt-2 first:mt-0 first:border-t-0 first:pt-0">
          <p className="text-sm text-fg-primary">
            <Num tone="muted">{fees.items.length}</Num> khoản lặp hằng tháng chưa thành lệnh
            định kỳ{fees.approx ? ' ≈' : ''} —{' '}
            <Money amount={fees.totalPerMonthMinor} currency={base} className="text-sm" />
            /tháng, tức{' '}
            <Money amount={fees.totalPerMonthMinor * 12} currency={base} className="text-sm" />
            /năm.
          </p>
          <ul className="mt-1">
            {fees.items.slice(0, FEE_SHOW_MAX).map((f) => (
              <li
                key={`${f.categoryId ?? ''}|${f.perMonthMinor}`}
                className="flex items-baseline justify-between gap-2 py-0.5"
              >
                <span className="min-w-0 truncate text-2xs text-fg-secondary">
                  {f.note ?? catName(f.categoryId)}
                  <span className="text-fg-muted"> · {f.hits} lần</span>
                </span>
                <Money amount={f.perMonthMinor} currency={base} className="shrink-0 text-2xs" />
              </li>
            ))}
          </ul>
          <p className="mt-1 text-sm font-medium text-fg-accent">
            Đáng rà một lượt: thứ còn dùng thì khai thành lệnh định kỳ, thứ không còn dùng
            — 10 năm của nó là{' '}
            <Money
              amount={fees.totalPerMonthMinor * 120}
              currency={base}
              className="text-sm"
            />
            , chưa kể lãi phần đó có thể sinh.
          </p>
        </div>
      )}
    </Card>
  )
}
