// Tab Cổ phiếu VN của trang Đầu tư — danh mục gộp MỌI tài khoản chứng khoán VND.
//
// Tách khỏi vỏ `InvestPage` vì hai tab không dùng chung một phép tính nào: cổ phiếu tính
// bằng đồng và có "tiền chưa mua", quỹ tính bằng yên trên 10.000 口 và không có tiền dư.
// Nhồi cả hai vào một file là mời hai bộ điều kiện lồng nhau trong cùng một JSX.
import { useMemo, useState } from 'react'
import { Guide } from '../../components/Guide'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { EstimateMark } from '../../components/EstimateMark'
import { ActionButton, Card, Money, SectionTitle } from '../../components/ui'
import { HOSE_SYMBOLS } from './hoseSymbols'
import { InvestAccountChips } from './InvestAccountChips'
import { InvestTradeAccountPicker } from './InvestTradeAccountPicker'
import { TradeFormSheet } from './TradeFormSheet'
import { useInvestData } from './useInvestData'
import { KIND_CLASS, KIND_LABEL, ngay, pct, share } from './investFormat'
import type { StockTradeRow } from '../../types/database.types'

interface Props {
  accountId: string | null
  onPickAccount: (id: string | null) => void
}

const VND = 'VND' as const

export function InvestStocksTab({ accountId, onPickAccount }: Props) {
  const { accounts, filtered, trades, portfolio, session, staleHeld, accountName, isLoading } =
    useInvestData(accountId)
  const activeId = filtered.length === accounts.length ? null : (filtered[0]?.id ?? null)
  const [sheet, setSheet] = useState<{ accountId: string; trade: StockTradeRow | null } | null>(
    null,
  )
  /** null = xem hết; có mã = chỉ xem lệnh của mã đó. */
  const [symbolFilter, setSymbolFilter] = useState<string | null>(null)
  /** Đang hỏi ghi lệnh vào tài khoản nào (chỉ khi có nhiều hơn một). */
  const [picking, setPicking] = useState(false)

  /** Một tài khoản thì mở thẳng; nhiều thì phải hỏi — đoán bừa là ghi nhầm sổ. */
  function startTrade() {
    if (filtered.length === 1) setSheet({ accountId: filtered[0].id, trade: null })
    else setPicking(true)
  }

  const nameBySymbol = useMemo(() => new Map(HOSE_SYMBOLS), [])
  const shownTrades = useMemo(
    () => (symbolFilter ? trades.filter((t) => t.symbol === symbolFilter) : trades),
    [trades, symbolFilter],
  )
  const sheetAccount = sheet ? accounts.find((a) => a.id === sheet.accountId) : undefined

  const thanhCongCu = (
    <div className="flex items-center justify-between gap-2">
      <InvestAccountChips accounts={accounts} activeId={activeId} onPick={onPickAccount} />
      {accounts.length > 0 && (
        <ActionButton variant="primary" onClick={startTrade} className="ml-auto">
          <Plus className="h-4 w-4" /> Ghi lệnh
        </ActionButton>
      )}
    </div>
  )

  if (isLoading) {
    return <p className="py-10 text-center text-sm text-fg-muted">Đang tải…</p>
  }

  if (accounts.length === 0) {
    return (
      <Card as="section">
        <p className="text-sm text-fg-muted">
          Chưa có tài khoản chứng khoán Việt Nam nào. Tạo một tài khoản loại <b>Đầu tư</b>{' '}
          với loại tiền <b>VND</b> ở{' '}
          <Link to="/settings/accounts" className="font-medium text-fg-accent">
            Cài đặt → Tài khoản
          </Link>
          , rồi ghi lệnh mua bán để app tự lấy giá và tính lời/lỗ.
        </p>
      </Card>
    )
  }

  const p = portfolio

  return (
    <>
      {thanhCongCu}

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
                        {filtered.length > 1 && ` · ${accountName(t.account_id)}`}
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

      {picking && (
        <InvestTradeAccountPicker
          accounts={accounts}
          onPick={(id) => {
            setPicking(false)
            setSheet({ accountId: id, trade: null })
          }}
          onClose={() => setPicking(false)}
        />
      )}

      {sheet && sheetAccount && (
        <TradeFormSheet
          account={sheetAccount}
          trade={sheet.trade}
          onClose={() => setSheet(null)}
        />
      )}
    </>
  )
}
