// Khu "Danh mục" trên trang chi tiết tài khoản đầu tư: từng mã đang giữ, lời/lỗ, và
// tiền chưa kịp mua gì.
//
// File riêng (không nhét vào AccountDetailPage) vì trang đó đã hơn 500 dòng. Mọi phép
// tính nằm ở holdings.ts — ở đây chỉ đọc dữ liệu và bày ra.
import { useMemo } from 'react'
import { EstimateMark } from '../../components/EstimateMark'
import { Card, Money, SectionTitle } from '../../components/ui'
import { useStockPrices, useStockTrades } from '../../hooks/queries'
import type { AccountRow, StockTradeRow } from '../../types/database.types'
import { HOSE_SYMBOLS } from './hoseSymbols'
import { brokerCash, holdingsFromTrades, portfolioValue, sessionPrices, type Trade } from './holdings'

interface Props {
  account: AccountRow
  /** Số dư sổ của tài khoản (minor units) — vốn gốc ròng từ view account_balances. */
  balance: number
  onAddTrade: () => void
  onEditTrade: (trade: StockTradeRow) => void
}

const pct = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(1).replace('.', ',')}%`

/** Ngày ISO → dd/mm để đọc nhanh. */
const ngayNgan = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

export function HoldingsSection({ account, balance, onAddTrade, onEditTrade }: Props) {
  const { data: allTrades = [] } = useStockTrades()
  const { data: prices = [] } = useStockPrices()

  const trades = useMemo(
    () => allTrades.filter((t) => t.account_id === account.id),
    [allTrades, account.id],
  )

  // Yahoo trả giá theo từng lô (CHUNK_SIZE mã một lần gọi) và một lô lỗi không kéo sập
  // các lô khác — nên vẫn có thể lẫn giá cũ của lô chưa hút được. sessionPrices() gom
  // về một phiên chung để "nay" luôn đúng nghĩa "phiên mới nhất", không lặng lẽ trộn
  // giá hôm qua của mã chưa hút kịp.
  const { session, priceBySymbol, staleSymbols } = useMemo(() => sessionPrices(prices), [prices])
  // stock_prices.name giờ luôn rỗng (Yahoo không trả tên công ty) — tên đọc từ danh sách
  // tĩnh HOSE_SYMBOLS thay vì bảng giá.
  const nameBySymbol = useMemo(() => new Map(HOSE_SYMBOLS), [])

  const asTrades: Trade[] = useMemo(
    () =>
      trades.map((t) => ({
        symbol: t.symbol,
        kind: t.kind,
        tradedOn: t.traded_on,
        quantity: t.quantity,
        price: t.price,
        fee: t.fee,
        tax: t.tax,
      })),
    [trades],
  )

  const { holdings, realizedPnl, oversold } = useMemo(
    () => holdingsFromTrades(asTrades),
    [asTrades],
  )
  const cash = useMemo(() => brokerCash(balance, asTrades), [balance, asTrades])
  const value = useMemo(
    () => portfolioValue(holdings, priceBySymbol, cash),
    [holdings, priceBySymbol, cash],
  )

  // Mã đang giữ, có giá hợp lệ nhưng giá đó lại cũ hơn phiên chung — sàn của nó chưa
  // hút được lần này. Loại khỏi đây những mã đã rơi vào missingPrices (giá <= 0 hoặc
  // không có hàng): một mã chỉ nên bị nêu MỘT lần, và "chưa có giá" đã nói đủ rồi.
  const staleHeld = useMemo(
    () =>
      holdings
        .filter((h) => staleSymbols.has(h.symbol) && !value.missingPrices.includes(h.symbol))
        .map((h) => h.symbol),
    [holdings, staleSymbols, value.missingPrices],
  )

  if (trades.length === 0) {
    return (
      <Card as="section" className="mb-3">
        <SectionTitle>Danh mục</SectionTitle>
        <p className="mt-2 text-xs text-fg-muted">
          Ghi lệnh mua/bán để app tự lấy giá và tính lời/lỗ từng mã.
        </p>
        <button
          type="button"
          onClick={onAddTrade}
          className="mt-3 rounded-lg bg-green-700 px-3 py-2 text-sm font-semibold text-white active:scale-95"
        >
          Ghi lệnh đầu tiên
        </button>
      </Card>
    )
  }

  // account.currency đã là CurrencyCode — không cần ép kiểu; điều kiện === 'VND' đã
  // được lọc ở AccountDetailPage trước khi render section này.
  const currency = account.currency

  return (
    <Card as="section" className="mb-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <SectionTitle>Danh mục</SectionTitle>
        <button
          type="button"
          onClick={onAddTrade}
          className="text-xs font-semibold text-green-700 dark:text-green-400"
        >
          + Ghi lệnh
        </button>
      </div>

      <ul className="divide-y divide-border-subtle">
        {holdings.map((h) => {
          const price = priceBySymbol.get(h.symbol)
          const thieuGia = price == null || price <= 0
          // Có giá, nhưng giá đó ở phiên cũ hơn — không phải "thiếu", nhưng cũng không
          // phải "nay". thieuGia đứng trước: mã đã bị nêu ở "chưa có giá" thì khỏi gắn
          // thêm nhãn giá cũ, tránh nói hai lần về cùng một mã.
          const giaCu = !thieuGia && staleSymbols.has(h.symbol)
          // priceVal chỉ dùng ở nhánh !thieuGia, nhưng khai một biến number chắc chắn
          // (thay vì number | undefined) để khỏi phải ép kiểu khi truyền vào <Money>.
          const priceVal = price ?? 0
          const giaTri = thieuGia ? h.costBasis : h.quantity * priceVal
          const lai = giaTri - h.costBasis
          const laiPct = h.costBasis > 0 ? lai / h.costBasis : null
          return (
            <li key={h.symbol} className="flex items-baseline justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-fg-primary">{h.symbol}</p>
                <p className="truncate text-2xs text-fg-muted">
                  {nameBySymbol.get(h.symbol) ?? '—'}
                </p>
                <p className="mt-0.5 flex flex-wrap items-baseline gap-x-1 text-2xs text-fg-secondary">
                  <span>{h.quantity.toLocaleString('vi-VN')} cổ</span>
                  <span>· vốn</span>
                  <Money amount={h.avgCost} currency={currency} className="text-2xs" />
                  {thieuGia ? (
                    <span>· chưa có giá</span>
                  ) : (
                    <>
                      <span>· {giaCu ? 'giá cũ' : 'nay'}</span>
                      <Money amount={priceVal} currency={currency} className="text-2xs" />
                    </>
                  )}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <Money amount={giaTri} currency={currency} className="text-sm font-semibold" />
                {/* Giá trị tính từ giá phiên CŨ — dòng trái đã ghi "giá cũ", dấu này nói
                    thêm rằng con số bên phải cũng chỉ là ước tính theo giá đó. */}
                {giaCu && <EstimateMark reason="Tính theo giá của phiên trước, chưa có giá phiên mới nhất." />}
                <p className="text-2xs">
                  <Money
                    amount={Math.abs(lai)}
                    currency={currency}
                    tone={lai >= 0 ? 'in' : 'out'}
                    showSign
                    className="text-2xs"
                  />
                  {laiPct !== null && <span className="ml-1 text-fg-muted">{pct(laiPct)}</span>}
                </p>
              </div>
            </li>
          )
        })}
      </ul>

      <div className="mt-3 space-y-1 border-t border-border-subtle pt-2 text-xs">
        {cash >= 0 ? (
          <p className="flex items-baseline justify-between text-fg-secondary">
            <span>Tiền chưa đầu tư</span>
            <Money amount={cash} currency={currency} className="font-semibold" />
          </p>
        ) : (
          <p className="rounded-lg bg-amber-50 px-2.5 py-2 text-2xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">
            Bạn ghi lệnh mua nhiều hơn số tiền đã nạp vào tài khoản này — kiểm tra lại sổ
            lệnh, hoặc ghi thêm lần chuyển tiền còn thiếu.
          </p>
        )}

        {realizedPnl !== 0 && (
          <p className="flex items-baseline justify-between text-fg-secondary">
            <span>Lãi đã chốt</span>
            <Money
              amount={Math.abs(realizedPnl)}
              currency={currency}
              tone={realizedPnl >= 0 ? 'in' : 'out'}
              showSign
              className="font-semibold"
            />
          </p>
        )}
        {realizedPnl !== 0 && (
          <p className="text-3xs leading-tight text-fg-muted">
            Số này đã nằm trong tiền chưa đầu tư, không cộng thêm lần nữa.
          </p>
        )}

        {value.marketValue !== null && (
          <p className="flex items-baseline justify-between pt-1 text-fg-primary">
            <span className="font-semibold">Tổng giá trị</span>
            <Money amount={value.marketValue} currency={currency} className="font-bold" />
          </p>
        )}

        <p className="pt-1 text-3xs text-fg-muted">
          {session ? `theo giá phiên ${ngayNgan(session)}` : 'chưa có bảng giá'}
        </p>
      </div>

      {value.missingPrices.length > 0 && (
        <p className="mt-2 text-2xs text-amber-700 dark:text-amber-300">
          Chưa có giá cho {value.missingPrices.join(', ')} — mấy mã này đang tạm tính theo
          giá vốn nên tổng có thể lệch.
        </p>
      )}

      {staleHeld.length > 0 && (
        <p className="mt-2 text-2xs text-amber-700 dark:text-amber-300">
          {staleHeld.join(', ')} chưa có giá phiên {session ? ngayNgan(session) : 'mới nhất'} —
          tổng trên đang tính theo giá phiên trước của mấy mã này, nên có thể khác số tài
          khoản đã ghi.
        </p>
      )}

      {oversold.length > 0 && (
        <p className="mt-2 text-2xs text-amber-700 dark:text-amber-300">
          {oversold.join(', ')}: sổ lệnh ghi bán nhiều hơn số cổ đang giữ. Có thể thiếu một
          lệnh mua hoặc một lần được thưởng cổ phiếu.
        </p>
      )}

      <details className="mt-3">
        <summary className="cursor-pointer text-xs font-medium text-fg-secondary">
          Sổ lệnh ({trades.length})
        </summary>
        <ul className="mt-2 divide-y divide-border-subtle">
          {trades.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => onEditTrade(t)}
                className="flex w-full items-baseline justify-between gap-3 py-2 text-left"
              >
                <span className="text-xs text-fg-secondary">
                  {ngayNgan(t.traded_on)} ·{' '}
                  <b className="text-fg-primary">{t.symbol}</b>{' '}
                  {t.kind === 'buy' ? 'mua' : t.kind === 'sell' ? 'bán' : 'điều chỉnh'}
                </span>
                <span className="shrink-0 text-2xs tabular-nums text-fg-muted">
                  {t.quantity.toLocaleString('vi-VN')} cổ
                  {t.kind !== 'adjust' && (
                    <>
                      {' @ '}
                      <Money amount={t.price} currency={currency} className="text-2xs text-fg-muted" />
                    </>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </details>
    </Card>
  )
}
