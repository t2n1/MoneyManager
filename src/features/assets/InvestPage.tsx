// Trang Đầu tư — danh mục cổ phiếu gộp MỌI tài khoản chứng khoán.
//
// Vì sao tách khỏi trang chi tiết tài khoản: khu "Danh mục" ở đó chỉ nói về một tài
// khoản. Có hai tài khoản là phải mở hai chỗ, và không màn nào trả lời được "tôi đang
// giữ tổng bao nhiêu VNM" hay "mã nào chiếm nhiều nhất trong danh mục". Đó là câu của
// người, không phải câu của tài khoản.
import { useMemo, useState } from 'react'
import { Guide } from '../../components/Guide'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { BackLink } from '../../components/BackLink'
import { EstimateMark } from '../../components/EstimateMark'
import { ActionButton, Card, Money, SectionTitle } from '../../components/ui'
import { HOSE_SYMBOLS } from './hoseSymbols'
import { TradeFormSheet } from './TradeFormSheet'
import { useInvestData } from './useInvestData'
import type { StockTradeRow } from '../../types/database.types'

const VND = 'VND' as const

const pct = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(1).replace('.', ',')}%`
const share = (v: number) => `${(v * 100).toFixed(1).replace('.', ',')}%`
/** ISO → dd/mm/yy — sổ lệnh trải nhiều năm nên phải có năm. */
const ngay = (iso: string) => `${iso.slice(2, 4)}/${iso.slice(5, 7)}/${iso.slice(8, 10)}`

const KIND_LABEL: Record<StockTradeRow['kind'], string> = {
  buy: 'Mua',
  sell: 'Bán',
  adjust: 'Điều chỉnh',
}
const KIND_CLASS: Record<StockTradeRow['kind'], string> = {
  buy: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200',
  sell: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200',
  adjust: 'bg-surface-sunken text-fg-secondary',
}

export function InvestPage() {
  const { accounts, trades, portfolio, session, staleHeld, accountName, isLoading } =
    useInvestData()
  const [sheet, setSheet] = useState<{ accountId: string; trade: StockTradeRow | null } | null>(
    null,
  )
  /** null = xem hết; có mã = chỉ xem lệnh của mã đó. */
  const [symbolFilter, setSymbolFilter] = useState<string | null>(null)
  /** Đang hỏi ghi lệnh vào tài khoản nào (chỉ khi có nhiều hơn một). */
  const [picking, setPicking] = useState(false)

  /** Một tài khoản thì mở thẳng; nhiều thì phải hỏi — đoán bừa là ghi nhầm sổ. */
  function startTrade() {
    if (accounts.length === 1) setSheet({ accountId: accounts[0].id, trade: null })
    else setPicking(true)
  }

  const nameBySymbol = useMemo(() => new Map(HOSE_SYMBOLS), [])
  const shownTrades = useMemo(
    () => (symbolFilter ? trades.filter((t) => t.symbol === symbolFilter) : trades),
    [trades, symbolFilter],
  )
  const sheetAccount = sheet ? accounts.find((a) => a.id === sheet.accountId) : undefined

  const header = (
    <div className="mb-3 flex items-center gap-2">
      <BackLink to="/assets" aria-label="Quay lại" />
      <h1 className="flex-1 text-lg font-bold text-fg-primary">Đầu tư</h1>
      {accounts.length > 0 && (
        <ActionButton variant="primary" onClick={startTrade}>
          <Plus className="h-4 w-4" /> Ghi lệnh
        </ActionButton>
      )}
    </div>
  )

  if (isLoading) {
    return (
      <div className="p-3 lg:p-6">
        {header}
        <p className="py-10 text-center text-sm text-fg-muted">Đang tải…</p>
      </div>
    )
  }

  if (accounts.length === 0) {
    return (
      <div className="p-3 lg:p-6">
        {header}
        <Card as="section">
          <p className="text-sm text-fg-muted">
            Chưa có tài khoản chứng khoán nào. Tạo một tài khoản loại <b>Đầu tư</b> với
            loại tiền <b>VND</b> ở{' '}
            <Link to="/settings/accounts" className="font-medium text-fg-accent">
              Cài đặt → Tài khoản
            </Link>
            , rồi ghi lệnh mua bán để app tự lấy giá và tính lời/lỗ.
          </p>
        </Card>
      </div>
    )
  }

  const p = portfolio

  return (
    <div className="flex flex-col gap-3 p-3 lg:p-6">
      {header}

      {/* Tổng danh mục */}
      <Card as="section">
        <div className="flex items-baseline justify-between gap-2">
          <SectionTitle>Giá trị danh mục</SectionTitle>
          {session && <span className="text-2xs text-fg-muted">giá phiên {ngay(session)}</span>}
        </div>
        {p.marketValue === null ? (
          <p className="mt-1 text-sm text-fg-muted">
            {p.cash < 0
              ? 'Chưa tính được — sổ lệnh đang mua nhiều hơn tiền đã nạp.'
              : 'Chưa tính được — chưa có giá cho mã nào đang giữ.'}
          </p>
        ) : (
          <p className="mt-1 flex items-baseline gap-1">
            <Money amount={p.marketValue} currency={VND} className="text-2xl font-bold" />
            {p.missingPrices.length > 0 && (
              <EstimateMark
                reason={`${p.missingPrices.join(', ')} chưa có giá, đang tạm tính theo giá vốn.`}
              />
            )}
          </p>
        )}

        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-border-subtle pt-3 text-xs">
          <div>
            <dt className="text-fg-muted">Vốn cổ phiếu</dt>
            <dd>
              <Money amount={p.stockCost} currency={VND} className="font-semibold" />
            </dd>
          </div>
          <div>
            <dt className="text-fg-muted">Tiền chưa mua</dt>
            <dd>
              <Money
                amount={p.cash}
                currency={VND}
                tone={p.cash < 0 ? 'out' : 'neutral'}
                className="font-semibold"
              />
            </dd>
          </div>
          <div>
            <dt className="text-fg-muted">Lời/lỗ chưa bán</dt>
            <dd className="flex items-baseline gap-1">
              <Money
                amount={Math.abs(p.unrealizedPnl)}
                currency={VND}
                tone={p.unrealizedPnl >= 0 ? 'in' : 'out'}
                showSign
                className="font-semibold"
              />
              {p.unrealizedPercent !== null && (
                <span className="text-fg-muted">{pct(p.unrealizedPercent)}</span>
              )}
            </dd>
          </div>
          <div>
            {/* Đã bán rồi thì tiền đã về tài khoản — con số này KHÔNG nằm trong giá trị
                danh mục ở trên, nên để riêng chứ không cộng vào lời/lỗ chưa bán. */}
            <dt className="text-fg-muted">Lời/lỗ đã bán</dt>
            <dd>
              <Money
                amount={Math.abs(p.realizedPnl)}
                currency={VND}
                tone={p.realizedPnl >= 0 ? 'in' : 'out'}
                showSign
                className="font-semibold"
              />
            </dd>
          </div>
        </dl>

        {p.oversold.length > 0 && (
          <p className="mt-3 rounded-lg bg-amber-50 px-2.5 py-2 text-2xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">
            {p.oversold.join(', ')}: sổ lệnh ghi bán nhiều hơn số đang giữ — thiếu một
            lệnh mua ở đâu đó.
          </p>
        )}
        {staleHeld.length > 0 && (
          <p className="mt-2 text-2xs text-fg-muted">
            {staleHeld.join(', ')} đang dùng giá của phiên trước.
          </p>
        )}
      </Card>

      {/* Từng mã */}
      <Card as="section">
        <SectionTitle>Đang giữ ({p.positions.length} mã)</SectionTitle>
        {p.positions.length === 0 ? (
          <p className="mt-2 text-xs text-fg-muted">
            Chưa giữ mã nào.
            <Guide as="span"> Ghi lệnh mua để app tự lấy giá và tính lời/lỗ.</Guide>
          </p>
        ) : (
          <ul className="mt-1 divide-y divide-border-subtle">
            {p.positions.map((pos) => (
              <li key={pos.symbol}>
                <button
                  type="button"
                  onClick={() =>
                    setSymbolFilter((cur) => (cur === pos.symbol ? null : pos.symbol))
                  }
                  aria-pressed={symbolFilter === pos.symbol}
                  className="w-full py-2 text-left"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-fg-primary">
                        {pos.symbol}
                        <span className="ml-1.5 text-2xs font-normal text-fg-muted">
                          {share(pos.weight)}
                        </span>
                      </p>
                      <p className="truncate text-2xs text-fg-muted">
                        {nameBySymbol.get(pos.symbol) ?? '—'}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <Money amount={pos.value} currency={VND} className="text-sm font-semibold" />
                      <p className="text-2xs">
                        <Money
                          amount={Math.abs(pos.pnl)}
                          currency={VND}
                          tone={pos.pnl >= 0 ? 'in' : 'out'}
                          showSign
                          className="text-2xs"
                        />
                        {pos.pnlPercent !== null && (
                          <span className="ml-1 text-fg-muted">{pct(pos.pnlPercent)}</span>
                        )}
                      </p>
                    </div>
                  </div>
                  {/* Thanh tỷ trọng: mắt so hai thanh nhanh hơn so hai con số phần trăm */}
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-sunken">
                    <div
                      className="h-full rounded-full bg-sky-500"
                      style={{ width: `${Math.min(pos.weight * 100, 100)}%` }}
                    />
                  </div>
                  <p className="mt-1 flex flex-wrap items-baseline gap-x-1 text-2xs text-fg-secondary">
                    <span>{pos.quantity.toLocaleString('vi-VN')} cổ</span>
                    <span>· vốn</span>
                    <Money amount={pos.avgCost} currency={VND} className="text-2xs" />
                    {pos.price === null ? (
                      <span>· chưa có giá</span>
                    ) : (
                      <>
                        <span>· nay</span>
                        <Money amount={pos.price} currency={VND} className="text-2xs" />
                      </>
                    )}
                    {/* Chỉ nói tên tài khoản khi mã nằm ở NHIỀU nơi — một tài khoản thì
                        câu đó đúng với mọi dòng, tức là không nói thêm được gì. */}
                    {pos.accountNames.length > 1 && (
                      <span>· {pos.accountNames.join(' + ')}</span>
                    )}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Sổ lệnh */}
      <Card as="section">
        <div className="flex items-baseline justify-between gap-2">
          <SectionTitle>
            Sổ lệnh{symbolFilter ? ` · ${symbolFilter}` : ''} ({shownTrades.length})
          </SectionTitle>
          {symbolFilter && (
            <button
              type="button"
              onClick={() => setSymbolFilter(null)}
              className="text-2xs font-medium text-fg-accent"
            >
              Xem hết
            </button>
          )}
        </div>

        {shownTrades.length === 0 ? (
          <p className="mt-2 text-xs text-fg-muted">Chưa có lệnh nào.</p>
        ) : (
          <ul className="mt-1 divide-y divide-border-subtle">
            {shownTrades.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => setSheet({ accountId: t.account_id, trade: t })}
                  className="flex w-full items-baseline justify-between gap-3 py-2 text-left"
                >
                  <div className="min-w-0">
                    <p className="flex items-baseline gap-1.5 text-sm">
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 text-3xs font-semibold ${KIND_CLASS[t.kind]}`}
                      >
                        {KIND_LABEL[t.kind]}
                      </span>
                      <span className="font-semibold text-fg-primary">{t.symbol}</span>
                      <span className="truncate text-2xs text-fg-muted">
                        {ngay(t.traded_on)}
                        {accounts.length > 1 && ` · ${accountName(t.account_id)}`}
                      </span>
                    </p>
                    {t.note && <p className="truncate text-2xs text-fg-muted">{t.note}</p>}
                  </div>
                  <div className="shrink-0 text-right text-2xs text-fg-secondary">
                    <p>
                      {t.quantity.toLocaleString('vi-VN')} cổ
                      {t.kind !== 'adjust' && (
                        <>
                          {' × '}
                          <Money amount={t.price} currency={VND} className="text-2xs" />
                        </>
                      )}
                    </p>
                    {(t.fee > 0 || t.tax > 0) && (
                      <p className="text-fg-muted">
                        phí+thuế <Money amount={t.fee + t.tax} currency={VND} className="text-2xs" />
                      </p>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Chọn tài khoản trước khi ghi lệnh — chỉ hiện khi có từ hai tài khoản. */}
      {picking && (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 lg:items-center"
          onClick={() => setPicking(false)}
        >
          <div
            className="w-full max-w-md rounded-t-2xl bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-3 text-base font-bold text-fg-primary">Ghi lệnh vào tài khoản nào?</h2>
            <ul className="flex flex-col gap-2">
              {accounts.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setPicking(false)
                      setSheet({ accountId: a.id, trade: null })
                    }}
                    className="min-h-11 w-full rounded-lg border border-border-strong px-3 text-left text-sm font-medium text-fg-primary hover:bg-surface-sunken"
                  >
                    {a.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {sheet && sheetAccount && (
        <TradeFormSheet
          account={sheetAccount}
          trade={sheet.trade}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  )
}
