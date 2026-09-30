// Màn Quỹ chung — mỗi phần (tiền nhà, ăn uống, điện nước ga…) ai góp bao nhiêu, quỹ đã chi
// bao nhiêu, phần đó còn dư hay thiếu. Toán ở sharedFund.ts; ở đây chỉ bày.
//
// "Còn lại" là LUỸ KẾ từ đầu (xem sharedFund.ts) và nhãn cột phải nói ra điều đó: đứng cạnh
// cột "góp tháng này" mà không nói thì người đọc cộng trừ hai cột và ra một số khác.
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Card, EmptyState, IconButton, Money, Num, PageHeader, SectionTitle, StatTile } from '../../components/ui'
import { VerdictNote } from '../../components/VerdictNote'
import { Guide } from '../../components/Guide'
import { useAccounts, useCategories, useProfile, useSearchTransactions } from '../../hooks/queries'
import { useMonthKey } from '../../hooks/useMonthKey'
import { addMonths, formatMonthLabel, getMonthRange, toISODate } from '../../lib/dates'
import { categoryLabel, tr } from '../../i18n'
import { trn } from '../../i18n/react'
import type { CurrencyCode } from '../../lib/money'
import { partnerLabel } from './labels'
import { STREAK_MONTHS, fundAlerts, mineSharePct, summarizeFund, total, type FundAlert } from './sharedFund'

/** Đầu sổ — mọi giao dịch của quỹ đều sau mốc này. */
const DAU_SO = '1900-01-01'

export function SharedFundPage() {
  const { activeMonthKey, stepMonth } = useMonthKey()
  const { data: profile } = useProfile()
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()
  const monthStartDay = profile?.month_start_day ?? 1
  const fundId = profile?.couple_mode ? (profile.shared_fund_account_id ?? null) : null
  const fund = accounts.find((a) => a.id === fundId)
  const currency: CurrencyCode = fund?.currency ?? profile?.base_currency ?? 'JPY'
  const partner = partnerLabel(profile)
  const range = useMemo(() => getMonthRange(activeMonthKey, monthStartDay), [activeMonthKey, monthStartDay])

  // Mọi giao dịch chạm quỹ từ đầu tới hết kỳ đang xem — cần cả quá khứ cho cột luỹ kế.
  const q = useSearchTransactions({ start: DAU_SO, end: range.end, accountIds: fundId ? [fundId] : [] }, !!fundId)
  const txs = useMemo(() => q.data ?? [], [q.data])

  const summary = useMemo(
    () => (fundId ? summarizeFund(txs, fundId, range, categories) : null),
    [txs, fundId, range, categories],
  )

  // Nhắc chỉnh mức góp: chỉ nhìn các tháng ĐÃ XONG (xem fundAlerts). Kỳ đang xem chưa hết
  // thì lùi một tháng làm mốc.
  const alerts = useMemo<FundAlert[]>(() => {
    if (!fundId) return []
    const today = toISODate(new Date())
    const lastDone = range.end <= today ? activeMonthKey : addMonths(activeMonthKey, -1)
    const months = Array.from({ length: STREAK_MONTHS }, (_, i) =>
      summarizeFund(txs, fundId, getMonthRange(addMonths(lastDone, i - (STREAK_MONTHS - 1)), monthStartDay), categories),
    )
    // Âm luỹ kế thì nói NGAY theo kỳ đang xem — dòng bảng bên dưới đã ghi "đang thiếu",
    // câu nhắc mà đợi tới hết tháng thì hai chỗ trên cùng màn nói hai điều khác nhau.
    const negatives = (summary?.parts ?? [])
      .filter((p) => p.partId !== null && p.balance < 0)
      .map((p): FundAlert => ({ partId: p.partId!, kind: 'negative', balance: p.balance }))
    const seen = new Set(negatives.map((a) => a.partId))
    return [...negatives, ...fundAlerts(months).filter((a) => a.kind !== 'negative' && !seen.has(a.partId))]
  }, [txs, fundId, activeMonthKey, range.end, monthStartDay, categories, summary])

  const catName = (id: string | null) => {
    if (id === null) return tr('Chưa gán phần')
    const c = categories.find((x) => x.id === id)
    return c ? categoryLabel(c.name) : tr('Danh mục đã xoá')
  }

  const header = (
    // Không `mobileOnly`: đây là trang con (vào từ Cài đặt) nên cần nút quay lại, mà chế độ
    // đó bỏ nút. Bộ ‹ › thì chỉ dưới lg — từ lg top bar đã có (route nằm trong MONTH_ROUTES).
    <PageHeader title={tr('Quỹ chung')} back="/settings" flush>
      <div className="ml-auto flex items-center gap-1 lg:hidden">
        <IconButton onClick={() => stepMonth(-1)} aria-label={tr('Tháng trước')}>
          <ChevronLeft className="h-5 w-5" />
        </IconButton>
        <p aria-live="polite" className="font-mono text-sm text-fg-muted eink:px-1 eink:font-semibold eink:text-fg-primary">
          {formatMonthLabel(activeMonthKey)}
        </p>
        <IconButton onClick={() => stepMonth(1)} aria-label={tr('Tháng sau')}>
          <ChevronRight className="h-5 w-5" />
        </IconButton>
      </div>
    </PageHeader>
  )

  if (!fundId || !fund) {
    return (
      <div className="flex flex-col gap-4 p-3 lg:p-6">
        {header}
        <EmptyState>
          {trn('Chưa đặt quỹ chung. Vào {link}, chọn “Hai người” rồi chọn tài khoản quỹ chung.', {
            link: (
              <Link to="/settings" className="font-medium text-accent underline">
                {tr('Cài đặt')}
              </Link>
            ),
          })}
        </EmptyState>
      </div>
    )
  }

  if (q.isError) {
    return (
      <div className="flex flex-col gap-4 p-3 lg:p-6">
        {header}
        <EmptyState>{tr('Không tải được dữ liệu. Thử lại sau.')}</EmptyState>
      </div>
    )
  }

  if (!summary || q.isPending) {
    return (
      <div className="flex flex-col gap-4 p-3 lg:p-6">
        {header}
        <EmptyState>{tr('Đang tải…')}</EmptyState>
      </div>
    )
  }

  const sharePct = mineSharePct(summary.contributed)
  const allContributed = total(summary.contributed)

  return (
    <div className="flex flex-col gap-4 p-3 lg:p-6">
      {header}

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-3 lg:gap-3">
        <StatTile label={tr('Góp tháng này')} note={sharePct === null ? tr('chưa ai góp') : undefined}>
          <Money amount={allContributed} currency={currency} />
        </StatTile>
        <StatTile label={tr('Quỹ đã chi')}>
          <Money amount={summary.spent} currency={currency} tone="out" />
        </StatTile>
        <StatTile
          label={tr('Còn trong quỹ')}
          note={tr('luỹ kế tới hết tháng')}
          className="col-span-2 lg:col-span-1"
        >
          <Money amount={summary.balance} currency={currency} tone={summary.balance === 0 ? 'neutral' : 'bySign'} />
        </StatTile>
      </div>

      {sharePct !== null && (
        <Card as="section" padding="md">
          <SectionTitle role="micro" as="h2">
            {tr('Ai góp bao nhiêu')}
          </SectionTitle>
          {/* Hai đoạn thanh + chữ ở cả hai đầu: màu không phải kênh duy nhất (luật dự án). */}
          <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-surface-sunken" aria-hidden>
            <div className="bg-accent" style={{ width: `${sharePct}%` }} />
          </div>
          <div className="mt-1.5 flex flex-wrap justify-between gap-x-3 text-sm text-fg-secondary">
            <span>
              {tr('Mình')} <Num>{sharePct}</Num>% · <Money amount={summary.contributed.mine} currency={currency} />
            </span>
            <span>
              {partner} <Num>{100 - sharePct}</Num>% · <Money amount={summary.contributed.partner} currency={currency} />
            </span>
          </div>
        </Card>
      )}

      {alerts.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {alerts.map((a) => (
            <AlertLine key={a.partId} alert={a} name={catName(a.partId)} currency={currency} />
          ))}
        </div>
      )}

      <Card as="section" padding="none" className="overflow-hidden">
        <div className="px-3 pt-3">
          <SectionTitle role="micro" as="h2">
            {tr('Từng phần')}
          </SectionTitle>
        </div>
        {summary.parts.length === 0 ? (
          <EmptyState compact>
            {tr('Chưa có khoản góp nào. Ghi một chuyển khoản vào tài khoản quỹ chung và chọn “Góp cho phần”.')}
          </EmptyState>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {summary.parts.map((p) => (
              <li key={p.partId ?? 'none'} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-3 py-2.5">
                <div className="min-w-40 flex-1">
                  <p className="text-sm font-medium text-fg-primary">{catName(p.partId)}</p>
                  <p className="mt-0.5 text-2xs text-fg-muted">
                    {trn('Góp {sum} (mình {mine} · {partner} {theirs}) · chi {spent}', {
                      sum: <Money amount={total(p.contributed)} currency={currency} />,
                      mine: <Money amount={p.contributed.mine} currency={currency} />,
                      partner,
                      theirs: <Money amount={p.contributed.partner} currency={currency} />,
                      spent: <Money amount={p.spent} currency={currency} />,
                    })}
                    {p.withdrawn > 0 &&
                      trn(' · rút {amount}', { amount: <Money amount={p.withdrawn} currency={currency} /> })}
                  </p>
                </div>
                <div className="ml-auto text-right">
                  <Money
                    amount={p.balance}
                    currency={currency}
                    tone={p.balance === 0 ? 'neutral' : 'bySign'}
                    className="text-sm font-medium"
                  />
                  <p className="text-2xs text-fg-muted">{p.balance < 0 ? tr('đang thiếu') : tr('còn lại')}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Guide className="text-2xs text-fg-muted">
        {tr(
          'Góp = chuyển khoản vào tài khoản quỹ chung, có chọn phần và người góp. Chi từ quỹ tự vào phần theo danh mục (danh mục con thuộc phần của danh mục cha). “Còn lại” cộng dồn từ tháng đầu tiên: tháng rẻ dư, tháng đắt lấy phần dư bù — góp cố định là vậy.',
        )}
      </Guide>
    </div>
  )
}

function AlertLine({ alert, name, currency }: { alert: FundAlert; name: string; currency: CurrencyCode }) {
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
