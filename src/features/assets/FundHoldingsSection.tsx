// Khu "Danh mục quỹ" trên trang chi tiết tài khoản đầu tư JPY: từng quỹ đang giữ, 取得単価,
// 基準価額 mới nhất, và lãi/lỗ.
//
// File riêng (không nhét vào AccountDetailPage) vì trang đó đã hơn 500 dòng. Mọi phép tính
// nằm ở fundHoldings.ts — ở đây chỉ đọc dữ liệu và bày ra.
//
// KHÁC HoldingsSection (cổ phiếu Việt Nam) ở hai chỗ đáng nói:
//  · Không có dòng "Tiền chưa đầu tư": Rakuten tự quét sạch tiền dư về 楽天銀行, tài khoản
//    không giữ tiền nhàn rỗi. Xem fundHoldings.ts, lý do 3.
//  · Lãi/lỗ ở đây tính từ giá vốn của SỔ LỆNH, nên khớp app Rakuten bất kể sổ thu chi có
//    ghi đủ các lần nạp tiền hay không. Ô "Hiệu quả đầu tư" ở cấp tài khoản thì vẫn dùng
//    số dư sổ và sẽ KHÔNG khớp — đó là giới hạn đã biết, xem spec.
import { useMemo } from 'react'
import { Guide } from '../../components/Guide'
import { EstimateMark } from '../../components/EstimateMark'
import { ActionButton, Card, Money, SectionTitle } from '../../components/ui'
import { useFundPrices, useFunds, useFundTrades } from '../../hooks/queries'
import type { AccountRow, FundTradeRow } from '../../types/database.types'
import {
  fundHoldingsFromTrades,
  fundLineValue,
  fundValue,
  sessionNavs,
  type FundTrade,
} from './fundHoldings'

interface Props {
  account: AccountRow
  onAddTrade: () => void
  onEditTrade: (trade: FundTradeRow) => void
}

const pct = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(1).replace('.', ',')}%`

/** Ngày ISO → dd/mm để đọc nhanh. */
const ngayNgan = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}`

export function FundHoldingsSection({ account, onAddTrade, onEditTrade }: Props) {
  const { data: allTrades = [] } = useFundTrades()
  const { data: navRows = [] } = useFundPrices()
  const { data: funds = [] } = useFunds()

  const trades = useMemo(
    () => allTrades.filter((t) => t.account_id === account.id),
    [allTrades, account.id],
  )

  const tenQuy = useMemo(() => new Map(funds.map((f) => [f.assoc_fund_cd, f.name])), [funds])

  const asTrades: FundTrade[] = useMemo(
    () =>
      trades.map((t) => ({
        assocFundCd: t.assoc_fund_cd,
        kind: t.kind,
        tradedOn: t.traded_on,
        units: t.units,
        nav: t.nav,
        amount: t.amount,
      })),
    [trades],
  )

  const { holdings, realizedPnl, oversold } = useMemo(
    () => fundHoldingsFromTrades(asTrades),
    [asTrades],
  )
  // Chỉ tính phiên trên quỹ ĐANG GIỮ: `fund_prices` chứa cả danh bạ 8 quỹ, và một quỹ
  // không ai giữ đi trước một phiên sẽ làm cả hai quỹ đang giữ trông như "giá cũ" —
  // xem sessionNavs().
  const { session, navByFund, staleFunds } = useMemo(
    () => sessionNavs(navRows, holdings.map((h) => h.assocFundCd)),
    [navRows, holdings],
  )
  const value = useMemo(() => fundValue(holdings, navByFund), [holdings, navByFund])

  // Quỹ đang giữ, có giá hợp lệ nhưng giá đó cũ hơn phiên chung. Loại khỏi đây những quỹ đã
  // rơi vào missingNavs: một quỹ chỉ nên bị nêu MỘT lần, và "chưa có giá" đã nói đủ.
  const stale = useMemo(
    () =>
      holdings
        .filter((h) => staleFunds.has(h.assocFundCd) && !value.missingNavs.includes(h.assocFundCd))
        .map((h) => h.assocFundCd),
    [holdings, staleFunds, value.missingNavs],
  )

  const giaVon = useMemo(() => holdings.reduce((s, h) => s + h.costBasis, 0), [holdings])

  if (trades.length === 0) {
    return (
      <Card as="section" className="mb-3">
        <SectionTitle>Danh mục quỹ</SectionTitle>
        <Guide className="mt-2 text-xs text-fg-muted">
          Ghi lệnh mua/bán quỹ để app tự lấy 基準価額 mỗi ngày và tính lời/lỗ từng quỹ.
        </Guide>
        <ActionButton variant="primary" onClick={onAddTrade} className="mt-3">
          Ghi lệnh đầu tiên
        </ActionButton>
      </Card>
    )
  }

  // Điều kiện currency === 'JPY' đã được lọc ở AccountDetailPage trước khi render.
  const currency = account.currency

  return (
    <Card as="section" className="mb-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <SectionTitle>Danh mục quỹ</SectionTitle>
        <button
          type="button"
          onClick={onAddTrade}
          className="shrink-0 text-xs font-semibold text-green-700 dark:text-green-400"
        >
          + Ghi lệnh
        </button>
      </div>

      <ul className="divide-y divide-border-subtle">
        {holdings.map((h) => {
          const nav = navByFund.get(h.assocFundCd)
          const thieuGia = nav == null || nav <= 0
          const giaCu = !thieuGia && staleFunds.has(h.assocFundCd)
          const navVal = nav ?? 0
          // Gọi lại đúng hàm mà fundValue() dùng để tính tổng — không viết lại công
          // thức ở đây. Làm tròn TỪNG quỹ rồi mới cộng thì tổng dưới mới bằng đúng tổng
          // các dòng trên; cộng số chưa làm tròn ở đây rồi so với tổng đã làm tròn là
          // mời một câu hỏi "sao cộng tay lại lệch một yên".
          const giaTri = thieuGia ? h.costBasis : fundLineValue(h.units, navVal)
          const lai = giaTri - h.costBasis
          const laiPct = h.costBasis > 0 ? lai / h.costBasis : null
          return (
            <li key={h.assocFundCd} className="flex items-baseline justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-fg-primary">
                  {tenQuy.get(h.assocFundCd) || h.assocFundCd}
                </p>
                <p className="mt-0.5 flex flex-wrap items-baseline gap-x-1 text-2xs text-fg-secondary">
                  <span>{h.units.toLocaleString('vi-VN')} 口</span>
                  <span>· vốn</span>
                  <Money amount={h.avgNav} currency={currency} className="text-2xs" />
                  {thieuGia ? (
                    <span>· chưa có giá</span>
                  ) : (
                    <>
                      <span>· {giaCu ? 'giá cũ' : 'nay'}</span>
                      <Money amount={navVal} currency={currency} className="text-2xs" />
                    </>
                  )}
                  {/* 基準価額 là giá trên 10.000 口, không phải trên 1 口. Không nói ra thì
                      hai con số "vốn" và "nay" trông như đơn giá và người đọc sẽ tự nhân
                      với số 口 rồi thấy lệch 10.000 lần. */}
                  <span className="text-fg-muted">/1万口</span>
                </p>
              </div>
              <div className="shrink-0 text-right">
                <Money amount={giaTri} currency={currency} className="text-sm font-semibold" />
                {giaCu && (
                  <EstimateMark reason="Tính theo 基準価額 của phiên trước, chưa có phiên mới nhất." />
                )}
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
        <p className="flex items-baseline justify-between text-fg-secondary">
          <span>Giá vốn</span>
          <Money amount={giaVon} currency={currency} className="font-semibold" />
        </p>

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

        {value.marketValue !== null && (
          <p className="flex items-baseline justify-between pt-1 text-fg-primary">
            <span className="font-semibold">Tổng giá trị</span>
            <Money amount={value.marketValue} currency={currency} className="font-bold" />
          </p>
        )}

        <p className="pt-1 text-3xs text-fg-muted">
          {session ? `theo 基準価額 phiên ${ngayNgan(session)}` : 'chưa có bảng giá'}
        </p>
      </div>

      {value.missingNavs.length > 0 && (
        <p className="mt-2 text-2xs text-amber-700 dark:text-amber-300">
          Chưa có 基準価額 cho{' '}
          {value.missingNavs.map((m) => tenQuy.get(m) || m).join(', ')} — mấy quỹ này đang tạm
          tính theo giá vốn nên tổng có thể lệch.
        </p>
      )}

      {stale.length > 0 && (
        <p className="mt-2 text-2xs text-amber-700 dark:text-amber-300">
          {stale.map((m) => tenQuy.get(m) || m).join(', ')} chưa có giá phiên{' '}
          {session ? ngayNgan(session) : 'mới nhất'} — tổng trên đang tính theo phiên trước
          của mấy quỹ này.
        </p>
      )}

      {oversold.length > 0 && (
        <p className="mt-2 text-2xs text-amber-700 dark:text-amber-300">
          {oversold.map((m) => tenQuy.get(m) || m).join(', ')}: sổ lệnh ghi bán nhiều 口数 hơn
          số đang giữ. Thường là quỹ đã ĐỔI TÊN và nửa lịch sử đang ghép vào một mã khác —
          xem docs/quy-nhat.md.
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
                <span className="min-w-0 truncate text-xs text-fg-secondary">
                  {ngayNgan(t.traded_on)} ·{' '}
                  <b className="text-fg-primary">{tenQuy.get(t.assoc_fund_cd) || t.assoc_fund_cd}</b>{' '}
                  {t.kind === 'buy' ? 'mua' : t.kind === 'sell' ? 'bán' : 'điều chỉnh'}
                </span>
                {/* Không thêm tabular-nums ở đây: <Money> bên trong đã tự bật cho phần
                    tiền, và ngưỡng đếm `tabular-nums` toàn repo (tests/designSystem.test.ts)
                    đã sát trần — số 口 lệch hàng một chút không đáng đổi một chỗ viết tay
                    mới. */}
                <span className="shrink-0 text-2xs text-fg-muted">
                  {t.units.toLocaleString('vi-VN')} 口
                  {t.kind !== 'adjust' && (
                    <>
                      {' · '}
                      <Money amount={t.amount} currency={currency} className="text-2xs text-fg-muted" />
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
