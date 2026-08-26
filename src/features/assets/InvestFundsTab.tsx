// Tab Quỹ Nhật của trang Đầu tư — danh mục gộp MỌI tài khoản đầu tư JPY.
//
// Khác tab cổ phiếu ở bốn chỗ, mỗi chỗ có lý do đã trả giá ở nơi khác trong repo:
//  · Có khu "Tính theo số dư": bộ lọc của tab là `investment` + JPY, mà 退職金 (hưu trí
//    doanh nghiệp, do trang Nhập phiếu lương tạo) khớp đúng bộ lọc đó và sẽ KHÔNG bao giờ
//    có sổ lệnh quỹ. Bỏ nó ra thì tab hụt tiền so với trang Tài sản; để nó trong khu
//    "Đang giữ" thì ¥ số dư đứng cạnh ¥/1万口 (xem `FundBalanceAccount`).
//  · KHÔNG có dòng "Tiền chưa mua": Rakuten tự quét sạch tiền dư về 楽天銀行 (fundHoldings.ts).
//  · Đơn giá là ¥/10.000口, phải nói ra "/1万口" — không nói thì hai con số "vốn" và "nay"
//    trông như đơn giá và người đọc tự nhân với số 口 rồi thấy lệch 10.000 lần.
//  · `oversold` ở đây thường là chữ ký của việc quỹ ĐỔI TÊN mà thiếu một dòng bí danh,
//    không phải quên ghi lệnh mua (xem docs/quy-nhat.md).
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { Guide } from '../../components/Guide'
import { EstimateMark } from '../../components/EstimateMark'
import { ActionButton, Card, EmptyState, Money, SectionTitle } from '../../components/ui'
import { FundTradeFormSheet } from './FundTradeFormSheet'
import { InvestAccountChips } from './InvestAccountChips'
import { InvestTradeAccountPicker } from './InvestTradeAccountPicker'
import { TEN_TK_HUU } from '../phieu-luong/nhap'
import { useFundInvestData } from './useFundInvestData'
import { KIND_CLASS, KIND_LABEL, ngay, pct, share } from './investFormat'
import type { FundTradeRow } from '../../types/database.types'

const JPY = 'JPY' as const

interface Props {
  accountId: string | null
  onPickAccount: (id: string | null) => void
}

export function InvestFundsTab({ accountId, onPickAccount }: Props) {
  const {
    accounts,
    fundAccounts,
    balanceAccounts,
    filtered,
    shown,
    trades,
    portfolio: p,
    total,
    session,
    staleHeld,
    accountName,
    fundName,
    isLoading,
  } = useFundInvestData(accountId)
  const [sheet, setSheet] = useState<{ accountId: string; trade: FundTradeRow | null } | null>(
    null,
  )
  /** null = xem hết; có mã = chỉ xem lệnh của quỹ đó. */
  const [fundFilter, setFundFilter] = useState<string | null>(null)
  /** Đang hỏi ghi lệnh vào tài khoản nào (chỉ khi có nhiều hơn một). */
  const [picking, setPicking] = useState(false)

  // `fundAccounts`, không `accounts`: chip chỉ liệt kê tài khoản có sổ lệnh quỹ, nên
  // "đang xem tất cả" cũng phải đo theo đúng tập đó.
  const activeId = filtered.length === fundAccounts.length ? null : (filtered[0]?.id ?? null)

  /** `shown`, không `filtered` — xem chú thích cùng chỗ ở InvestStocksTab. */
  function startTrade() {
    if (shown.length === 1) setSheet({ accountId: shown[0].id, trade: null })
    else setPicking(true)
  }

  const shownTrades = useMemo(
    () => (fundFilter ? trades.filter((t) => t.assoc_fund_cd === fundFilter) : trades),
    [trades, fundFilter],
  )
  const sheetAccount = sheet ? accounts.find((a) => a.id === sheet.accountId) : undefined

  if (isLoading) {
    return <EmptyState>Đang tải…</EmptyState>
  }

  if (accounts.length === 0) {
    return (
      <Card as="section">
        <p className="text-sm text-fg-muted">
          Chưa có tài khoản quỹ đầu tư Nhật nào. Tạo một tài khoản loại <b>Đầu tư</b> với
          loại tiền <b>JPY</b> ở{' '}
          <Link to="/settings/accounts" className="font-medium text-fg-accent">
            Cài đặt → Tài khoản
          </Link>
          , rồi ghi lệnh mua bán để app tự lấy 基準価額 mỗi ngày và tính lời/lỗ.
        </p>
      </Card>
    )
  }

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <InvestAccountChips accounts={fundAccounts} activeId={activeId} onPick={onPickAccount} />
        <ActionButton variant="primary" onClick={startTrade} className="ml-auto">
          <Plus className="h-4 w-4" /> Ghi lệnh
        </ActionButton>
      </div>

      {/* Tổng danh mục */}
      <Card as="section">
        <div className="flex items-baseline justify-between gap-2">
          <SectionTitle>Giá trị danh mục</SectionTitle>
          {session && <span className="text-2xs text-fg-muted">基準価額 {ngay(session)}</span>}
        </div>
        {/* `total`, không `p.marketValue`: tổng gồm cả số dư tài khoản không có sổ lệnh
            (退職金 — xem FundBalanceAccount), kẻo tab này hụt đúng phần đó so với trang
            Tài sản, nơi cùng số tiền ấy đã được đếm là đầu tư. */}
        {total.value === null ? (
          <p className="mt-1 text-sm text-fg-muted">
            Chưa tính được — chưa có 基準価額 cho quỹ nào đang giữ.
          </p>
        ) : (
          <p className="mt-1 flex items-baseline gap-1">
            <Money amount={total.value} currency={JPY} className="text-kpi font-medium tracking-number" />
            {p.missingNavs.length > 0 && (
              <EstimateMark
                reason={`${p.missingNavs.map(fundName).join(', ')} chưa có giá, đang tạm tính theo giá vốn.`}
              />
            )}
          </p>
        )}

        {/* Nói ra phép cộng. Không nói thì "Giá vốn" và "Lời/lỗ" ngay dưới đây — cả hai
            CHỈ tính phần quỹ — trông như trừ được với con số tổng ở trên, và người đọc
            thấy đúng phần số dư biến thành một khoản lời không có thật. */}
        {total.balanceTotal > 0 && total.value !== null && (
          <p className="mt-1 flex flex-wrap items-baseline gap-x-1 text-2xs text-fg-secondary">
            <span>Gồm</span>
            <Money amount={p.fundValue} currency={JPY} className="text-2xs" />
            <span>quỹ theo 基準価額 ·</span>
            <Money amount={total.balanceTotal} currency={JPY} className="text-2xs" />
            <span>tính theo số dư</span>
          </p>
        )}

        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-border-subtle pt-3 text-sm">
          <div>
            <dt className="text-fg-muted">Giá vốn</dt>
            <dd>
              <Money amount={p.fundCost} currency={JPY} className="font-semibold" />
            </dd>
          </div>
          <div>
            <dt className="text-fg-muted">Lời/lỗ chưa bán</dt>
            <dd className="flex items-baseline gap-1">
              <Money
                amount={Math.abs(p.unrealizedPnl)}
                currency={JPY}
                tone={p.unrealizedPnl >= 0 ? 'in' : 'out'}
                showSign
                className="font-semibold"
              />
              {p.unrealizedPercent !== null && (
                <span className="text-fg-muted">{pct(p.unrealizedPercent)}</span>
              )}
            </dd>
          </div>
          {p.realizedPnl !== 0 && (
            <div>
              {/* Đã bán rồi thì tiền đã về 楽天銀行 — con số này KHÔNG nằm trong giá trị
                  danh mục ở trên, nên để riêng chứ không cộng vào lời/lỗ chưa bán. */}
              <dt className="text-fg-muted">Lời/lỗ đã bán</dt>
              <dd>
                <Money
                  amount={Math.abs(p.realizedPnl)}
                  currency={JPY}
                  tone={p.realizedPnl >= 0 ? 'in' : 'out'}
                  showSign
                  className="font-semibold"
                />
              </dd>
            </div>
          )}
        </dl>

        <Guide className="mt-2 text-2xs text-fg-muted">
          Không có dòng “tiền chưa mua”: Rakuten tự quét sạch tiền dư về 楽天銀行, tài khoản
          quỹ không giữ tiền nhàn rỗi.
        </Guide>

        {p.oversold.length > 0 && (
          <p className="mt-3 rounded-md border border-state-warn-border bg-state-warn-bg px-2.5 py-2 text-2xs text-state-warn-fg">
            {p.oversold.map(fundName).join(', ')}: sổ lệnh ghi bán nhiều 口数 hơn số đang
            giữ. Thường là quỹ đã ĐỔI TÊN và nửa lịch sử đang ghép vào một mã khác — xem
            docs/quy-nhat.md.
          </p>
        )}
        {staleHeld.length > 0 && (
          <p className="mt-2 text-2xs text-fg-muted">
            {staleHeld.map(fundName).join(', ')} đang dùng 基準価額 của phiên trước.
          </p>
        )}
      </Card>

      {/* Từng quỹ */}
      <Card as="section">
        <SectionTitle>Đang giữ ({p.positions.length} quỹ)</SectionTitle>
        {p.positions.length === 0 ? (
          <p className="mt-2 text-sm text-fg-muted">
            Chưa giữ quỹ nào.
            <Guide as="span"> Ghi lệnh mua để app tự lấy 基準価額 và tính lời/lỗ.</Guide>
          </p>
        ) : (
          <ul className="mt-1 divide-y divide-border-subtle">
            {p.positions.map((pos) => (
              <li key={pos.assocFundCd}>
                <button
                  type="button"
                  onClick={() =>
                    setFundFilter((cur) => (cur === pos.assocFundCd ? null : pos.assocFundCd))
                  }
                  aria-pressed={fundFilter === pos.assocFundCd}
                  className="w-full py-2 text-left"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-fg-primary">
                        {fundName(pos.assocFundCd)}
                        <span className="ml-1.5 text-2xs font-normal text-fg-muted">
                          {share(pos.weight)}
                        </span>
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <Money amount={pos.value} currency={JPY} className="text-sm font-semibold" />
                      <p className="text-2xs">
                        <Money
                          amount={Math.abs(pos.pnl)}
                          currency={JPY}
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
                    <span>{pos.units.toLocaleString('vi-VN')} 口</span>
                    <span>· vốn</span>
                    <Money amount={pos.avgNav} currency={JPY} className="text-2xs" />
                    {pos.nav === null ? (
                      <span>· chưa có giá</span>
                    ) : (
                      <>
                        <span>· nay</span>
                        <Money amount={pos.nav} currency={JPY} className="text-2xs" />
                      </>
                    )}
                    <span className="text-fg-muted">/1万口</span>
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

      {/* Tài khoản đầu tư JPY KHÔNG có sổ lệnh quỹ — xem `FundBalanceAccount`. Khu riêng
          chứ không trộn vào "Đang giữ": ở đó mọi con số là ¥/1万口, còn đây là số dư, và
          hai đơn vị đứng cùng một danh sách thì lệch nhau đúng 10.000 lần. */}
      {balanceAccounts.length > 0 && (
        <Card as="section">
          <SectionTitle>Tính theo số dư ({balanceAccounts.length})</SectionTitle>
          <ul className="mt-1 divide-y divide-border-subtle">
            {balanceAccounts.map((b) => (
              <li key={b.accountId} className="py-2">
                <div className="flex items-baseline justify-between gap-3">
                  {/* 退職金 có màn riêng nói được gì / mất gì / tới lúc nghỉ bao nhiêu —
                      trang chi tiết tài khoản chỉ nói số dư và giao dịch. Tài khoản khác
                      thì vẫn về trang chi tiết như cũ. */}
                  <Link
                    to={
                      b.accountName === TEN_TK_HUU
                        ? '/assets/retirement'
                        : `/assets/account/${b.accountId}`
                    }
                    className="min-w-0 truncate text-sm font-semibold text-fg-primary"
                  >
                    {b.accountName}
                  </Link>
                  <Money
                    amount={b.value}
                    currency={JPY}
                    className="shrink-0 text-sm font-semibold"
                  />
                </div>
                {/* Nhịp đóng đo từ sổ (trung vị 12 tháng), năm lấy từ chặng cuối trang
                    Tương lai — cả hai đều nói ra nguồn, vì cả hai đều có thể sai theo
                    cách người đọc kiểm được: nhập thiếu phiếu, hoặc đặt chặng khác. */}
                {b.projection && (
                  <p className="mt-0.5 flex flex-wrap items-baseline gap-x-1 text-2xs text-fg-secondary">
                    <span>Đóng</span>
                    <Money amount={b.contribution.minorPerMonth} currency={JPY} className="text-2xs" />
                    <span>/tháng · tới {b.projection.toYear} (chặng {b.projection.phaseLabel})</span>
                    <span className="text-fg-muted">ít nhất</span>
                    <Money amount={b.projection.minor} currency={JPY} className="text-2xs font-semibold" />
                  </p>
                )}
              </li>
            ))}
          </ul>
          <Guide className="mt-2 text-2xs text-fg-muted">
            Không có 基準価額 nên không có giá vốn hay lời/lỗ — số dư tài khoản chính là giá
            trị. Ghi một lệnh quỹ vào tài khoản nào thì tài khoản đó tự chuyển lên khu trên.
            Con số “ít nhất” chỉ cộng tiền đóng, KHÔNG cộng lãi: 予定利率 của 基金 nằm trên
            giấy 残高通知 gửi hằng năm, sổ không có nó nên app không đoán.
          </Guide>
        </Card>
      )}

      {/* Sổ lệnh */}
      <Card as="section">
        <div className="flex items-baseline justify-between gap-2">
          <SectionTitle>
            Sổ lệnh{fundFilter ? ` · ${fundName(fundFilter)}` : ''} ({shownTrades.length})
          </SectionTitle>
          {fundFilter && (
            <button
              type="button"
              onClick={() => setFundFilter(null)}
              className="text-2xs font-medium text-fg-accent"
            >
              Xem hết
            </button>
          )}
        </div>

        {shownTrades.length === 0 ? (
          <p className="mt-2 text-sm text-fg-muted">Chưa có lệnh nào.</p>
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
                        className={`shrink-0 rounded px-1.5 py-0.5 text-2xs font-semibold ${KIND_CLASS[t.kind]}`}
                      >
                        {KIND_LABEL[t.kind]}
                      </span>
                      <span className="truncate font-semibold text-fg-primary">
                        {fundName(t.assoc_fund_cd)}
                      </span>
                    </p>
                    <p className="truncate text-2xs text-fg-muted">
                      {ngay(t.traded_on)}
                      {/* `shown`, không `filtered` — xem chú thích cùng chỗ ở
                          InvestStocksTab. */}
                      {shown.length > 1 && ` · ${accountName(t.account_id)}`}
                    </p>
                  </div>
                  <div className="shrink-0 text-right text-2xs text-fg-secondary">
                    <p>
                      {t.units.toLocaleString('vi-VN')} 口
                      {t.kind !== 'adjust' && (
                        <>
                          {' · '}
                          <Money amount={t.amount} currency={JPY} className="text-2xs" />
                        </>
                      )}
                    </p>
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
        <FundTradeFormSheet
          account={sheetAccount}
          trade={sheet.trade}
          onClose={() => setSheet(null)}
        />
      )}
    </>
  )
}
