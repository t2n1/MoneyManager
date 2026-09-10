// Tab Cổ phiếu VN của trang Đầu tư — danh mục gộp MỌI tài khoản chứng khoán VND.
//
// Tách khỏi vỏ `InvestPage` vì hai tab không dùng chung một phép tính nào: cổ phiếu tính
// bằng đồng và có "tiền chưa mua", quỹ tính bằng yên trên 10.000 口 và không có tiền dư.
// Nhồi cả hai vào một file là mời hai bộ điều kiện lồng nhau trong cùng một JSX.
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { EstimateMark } from '../../components/EstimateMark'
import { ActionButton, Card, EmptyState, Money, Num, SectionTitle } from '../../components/ui'
import {
  useBackfillStockTradeTransfers,
  useRangeTransactions,
  useRates,
  useStockPrices,
  useStockTradesWithoutTransfer,
} from '../../hooks/queries'
import { confirmDialog } from '../../lib/dialog'
import { convertToBase } from '../../lib/rates'
import { concentrationVerdict } from './concentration'
import { HOSE_SYMBOLS } from './hoseSymbols'
import { InvestAccountChips } from './InvestAccountChips'
import { InvestAllocationSection } from './InvestAllocationSection'
import { InvestPerformanceSection } from './InvestPerformanceSection'
import { InvestRiskSection } from './InvestRiskSection'
import { InvestWeightDonut } from './InvestWeightDonut'
import { useInvestChartData } from './useInvestChartData'
import { dividendsBySymbol, positionTable, taggableCashflows } from './positionTable'
import { investTxRange } from './investHistory'
import { toISODate } from '../../lib/dates'
import { handWrittenFunding } from './stockTradePosting'
import { InvestTradeAccountPicker } from './InvestTradeAccountPicker'
import { TradeFormSheet } from './TradeFormSheet'
import { useInvestData } from './useInvestData'
import { KIND_CLASS, KIND_LABEL, ngay, pct } from './investFormat'
import type { StockTradeRow } from '../../types/database.types'

interface Props {
  accountId: string | null
  onPickAccount: (id: string | null) => void
}

const VND = 'VND' as const

export function InvestStocksTab({ accountId, onPickAccount }: Props) {
  const {
    accounts,
    filtered,
    shown,
    trades,
    portfolio,
    session,
    staleHeld,
    accountName,
    isLoading,
  } = useInvestData(accountId)
  const activeId = filtered.length === accounts.length ? null : (filtered[0]?.id ?? null)
  const [sheet, setSheet] = useState<{ accountId: string; trade: StockTradeRow | null } | null>(
    null,
  )
  /** null = xem hết; có mã = chỉ xem lệnh của mã đó. */
  const [symbolFilter, setSymbolFilter] = useState<string | null>(null)
  /** Đang hỏi ghi lệnh vào tài khoản nào (chỉ khi có nhiều hơn một). */
  const [picking, setPicking] = useState(false)

  /**
   * Một tài khoản thì mở thẳng; nhiều thì phải hỏi — đoán bừa là ghi nhầm sổ.
   *
   * Hỏi `shown` chứ không `filtered`: `?account=` trỏ tài khoản đã xoá làm `filtered`
   * rỗng trong khi số liệu bên dưới đang gộp mọi tài khoản, và `filtered.length === 1`
   * lúc đó sai theo cả hai hướng.
   */
  function startTrade() {
    if (shown.length === 1) setSheet({ accountId: shown[0].id, trade: null })
    else setPicking(true)
  }

  const { base, rates } = useRates()
  const nameBySymbol = useMemo(() => new Map(HOSE_SYMBOLS), [])
  const { data: soLenhThieu = 0 } = useStockTradesWithoutTransfer()
  const ghiBu = useBackfillStockTradeTransfers()
  /**
   * Giá trị danh mục CỦA TAB NÀY gồm cả ví liên kết — câu hỏi ở đây là "tiền cổ phiếu VN
   * của tôi đang là bao nhiêu". `portfolio.marketValue` (KHÔNG có ví) mới là con số mà
   * dòng tài khoản ở tab Tài sản và `account_valuations` dùng; ví đã tự đứng thành một
   * dòng ở đó rồi. Hai màn trả lời hai câu khác nhau, cố ý không bằng nhau.
   *
   * `null` giữ nguyên nghĩa cũ: cộng ví vào một con số đã biết là sai chỉ làm nó trông
   * đáng tin hơn.
   */
  const giaTriVND =
    portfolio.marketValue === null
      ? null
      : portfolio.marketValue + (portfolio.walletCash ?? 0)
  // Quy về đồng tiền gốc. null = thiếu tỷ giá → nơi hiển thị im.
  const giaTriBase =
    giaTriVND === null ? null : convertToBase(giaTriVND, VND, base, rates ?? {})
  // Câu phán về mức tập trung (21a). Hàm thuần, ngưỡng và ca một-mã nằm ở
  // concentration.ts cùng test của nó.
  const tapTrung = useMemo(() => concentrationVerdict(portfolio.positions), [portfolio.positions])

  // Bảng Cơ cấu cần hai thứ mà `useInvestData` không trả: giá tham chiếu phiên trước (để
  // ra cột Biến động) và các khoản thu/chi ĐÃ GẮN MÃ (để ra cột Cổ tức). Gọi hook ở đây
  // chứ không nhồi vào `useInvestData`: cả hai đều là query ĐÃ có nơi khác dùng, nên khoá
  // cache trùng và không sinh thêm một lượt đọc nào.
  const { data: priceRows = [] } = useStockPrices()
  const todayISO = toISODate(new Date())
  const accountIds = useMemo(() => new Set(shown.map((a) => a.id)), [shown])
  const { data: txs = [] } = useRangeTransactions(investTxRange(todayISO), accountIds.size > 0)

  /**
   * Nạp/rút người dùng tự ghi — đọc lại đúng `txs` ở trên, không thêm lượt đọc nào.
   *
   * Hỏi `shown` chứ không `accounts`: câu này đi kèm nút "Ghi bù", mà nút đó ghi cho MỌI
   * tài khoản. Nhưng dải chỉ hiện trên tập đang xem, và nói về một tài khoản người dùng
   * đang không nhìn thì không giúp được gì — `soLenhThieu` cũng đã là con số toàn sổ.
   */
  const napGhiTay = useMemo(() => handWrittenFunding(shown, txs), [shown, txs])

  /**
   * Có bộ tự ghi thì hỏi lại một lần nữa. Không CHẶN: hai bộ cùng tồn tại vẫn có thể
   * đúng (bộ tự ghi cho giai đoạn cũ, lệnh mới thì chưa có dòng nào), và app không biết
   * được điều đó thay người dùng. Nhưng bấm nhầm ở đây là hai mươi phút dọn sổ, nên một
   * câu hỏi rẻ hơn nhiều.
   */
  async function ghiBuCoHoi() {
    if (
      napGhiTay.count > 0 &&
      !(await confirmDialog({
        title: 'Ghi bù dù sổ đã có nạp/rút tự ghi?',
        message: `Sổ đang có ${napGhiTay.count} dòng nạp/rút tự ghi giữa tài khoản chứng khoán và ví. Ghi bù sẽ thêm một dòng cho từng lệnh, và tiền nạp có thể bị đếm hai lần.`,
        danger: true,
        confirmLabel: 'Vẫn ghi bù',
      }))
    )
      return
    ghiBu.mutate()
  }

  const bangCoCau = useMemo(
    () =>
      positionTable({
        positions: portfolio.positions,
        dividends: dividendsBySymbol(txs, accountIds),
        priorClose: new Map(
          priceRows
            .filter((r) => r.prior_close != null && r.prior_close > 0)
            .map((r) => [r.symbol, r.prior_close as number]),
        ),
      }),
    [portfolio.positions, txs, accountIds, priceRows],
  )

  const dongTienGanMa = useMemo(() => taggableCashflows(txs, accountIds), [txs, accountIds])
  // Mọi mã ĐÃ TỪNG giao dịch, không chỉ mã đang giữ: cổ tức của mã đã bán hết vẫn phải
  // gắn được vào đâu đó.
  const moiMa = useMemo(
    () => [...new Set(trades.map((t) => t.symbol))].sort(),
    [trades],
  )

  // MỘT lượt dựng chuỗi NAV cho cả khu Hiệu quả và khu Rủi ro — xem useInvestChartData.ts.
  const chartData = useInvestChartData(shown, trades)

  const nganhTheoMa = useMemo(
    () => new Map(priceRows.filter((r) => r.industry).map((r) => [r.symbol, r.industry])),
    [priceRows],
  )
  const shownTrades = useMemo(
    () => (symbolFilter ? trades.filter((t) => t.symbol === symbolFilter) : trades),
    [trades, symbolFilter],
  )
  const sheetAccount = sheet ? accounts.find((a) => a.id === sheet.accountId) : undefined

  const thanhCongCu = (
    <div className="flex items-center justify-between gap-2">
      <InvestAccountChips accounts={accounts} activeId={activeId} onPick={onPickAccount} />
      {/* Không cần `accounts.length > 0`: nhánh trạng thái rỗng ở trên đã trả về trước
          khi tới đây. Tab quỹ cũng không có guard đó — để lệch nhau là mời người sau
          "khôi phục" nó sang tab kia. */}
      <ActionButton variant="primary" onClick={startTrade} className="ml-auto">
        <Plus className="h-4 w-4" /> Ghi lệnh
      </ActionButton>
    </div>
  )

  if (isLoading) {
    return <EmptyState>Đang tải…</EmptyState>
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

      {/* Lệnh chưa có dòng chuyển tiền (migration 0054).
          Dải này hiện KỂ CẢ khi "Tiền chưa mua" đang dương: số dư ví lớn có thể che một
          `cash` âm, và lúc đó con số trông lành lặn trong khi sổ vẫn thủng. Nó cũng là
          câu thay cho con số âm đỏ khó hiểu trước đây — nói vì sao và bấm gì. */}
      {soLenhThieu > 0 && (
        <div className="rounded-md border border-state-warn-border bg-state-warn-bg px-2.5 py-2 text-2xs text-state-warn-fg">
          <p>
            <Num>{soLenhThieu}</Num> lệnh chưa có dòng chuyển tiền, nên số dư ví đang cao
            hơn tiền thật. Ghi bù để ví về đúng số — Tổng tài sản có thể đổi theo.
          </p>
          {/* Bộ nạp/rút tự ghi là thứ "Ghi bù" KHÔNG thấy — nó dò dòng đã có bằng cột
              `stock_trade_id`. Không nói ra thì nút này nhân đôi tiền nạp trong im lặng,
              đúng như đã xảy ra với sổ thật (xem handWrittenFunding). */}
          {napGhiTay.count > 0 && (
            <p className="mt-1.5">
              Nhưng sổ đã có <Num>{napGhiTay.count}</Num> dòng nạp/rút tự ghi giữa tài khoản
              chứng khoán và ví (ròng{' '}
              <Money amount={napGhiTay.net} currency={VND} showSign />
              ). Ghi bù sẽ cộng THÊM một bộ nữa cho từng lệnh, nên tiền nạp bị đếm hai lần
              và phần thừa nổi lên ở ô “Tiền chưa mua”. Xoá bộ tự ghi trước thì hãy bấm.
            </p>
          )}
          <ActionButton onClick={ghiBuCoHoi} disabled={ghiBu.isPending} className="mt-2">
            {ghiBu.isPending ? 'Đang ghi…' : 'Ghi bù'}
          </ActionButton>
        </div>
      )}

      {/* Tổng danh mục */}
      <Card as="section">
        <div className="flex items-baseline justify-between gap-2">
          <SectionTitle>Giá trị danh mục</SectionTitle>
          {session && <span className="text-2xs text-fg-muted">giá phiên {ngay(session)}</span>}
        </div>
        {giaTriVND === null ? (
          <p className="mt-1 text-sm text-fg-muted">
            {p.cash < 0
              ? 'Chưa tính được — sổ lệnh đang mua nhiều hơn tiền đã nạp.'
              : 'Chưa tính được — chưa có giá cho mã nào đang giữ.'}
          </p>
        ) : (
          <p className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <Money amount={giaTriVND} currency={VND} className="text-kpi font-medium tracking-number" />
            {p.missingPrices.length > 0 && (
              <EstimateMark
                reason={`${p.missingPrices.join(', ')} chưa có giá, đang tạm tính theo giá vốn.`}
              />
            )}
            {/* Quy đổi về đồng tiền gốc — mảnh mà 21a gọi là "nối với chỗ khác": mọi
                tổng khác trong app tính bằng ¥, riêng trang này bằng ₫, nên không có con
                số này thì người đọc không biết danh mục nặng bao nhiêu so với phần tài
                sản còn lại.
                CỐ Ý không hứa nó bằng con số nào ở tab Tài sản: khối này chỉ gồm tài
                khoản CÓ SỔ LỆNH, còn tài khoản đầu tư định giá tay thì không — hai con
                số lệch nhau một cách chính đáng, và viết "bằng số ở tab Tài sản" vào đây
                là mời người sau đi sửa một thứ không hỏng.
                `approx` vì tỷ giá là ảnh chụp, không phải giá khớp lệnh. Ẩn khi base đã
                là VND (không quy đổi gì) hoặc thiếu tỷ giá — in "≈ 0 ₫" ở đó là bịa. */}
            {base !== VND && giaTriBase !== null && (
              <Money
                amount={giaTriBase}
                currency={base}
                approx
                className="text-sm text-fg-muted"
              />
            )}
          </p>
        )}

        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-border-subtle pt-3 text-sm">
          <div>
            <dt className="text-fg-muted">Vốn cổ phiếu</dt>
            <dd>
              <Money amount={p.stockCost} currency={VND} className="font-semibold" />
            </dd>
          </div>
          <div>
            <dt className="text-fg-muted">Tiền chưa mua</dt>
            <dd>
              {/* Tiền ở công ty chứng khoán CỘNG tiền trong ví đã khai: người dùng mua cổ
                  phiếu bằng tiền ở ví, nên tiền chờ mua nằm cả hai chỗ. */}
              <Money
                amount={p.cash + (p.walletCash ?? 0)}
                currency={VND}
                tone={p.cash + (p.walletCash ?? 0) < 0 ? 'out' : 'neutral'}
                className="font-semibold"
              />
              {p.walletCash !== null && (
                <span className="block text-2xs text-fg-muted">
                  gồm <Money amount={p.walletCash} currency={VND} /> ở ví
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-fg-muted">Lời/lỗ chưa bán</dt>
            {/* `flex-wrap` chứ không `flex` trơn: ô này là ô DUY NHẤT trong lưới có HAI
                con số cạnh nhau (số tiền + phần trăm), nên ở 375px với cỡ chữ 1,25× nó
                đòi 192px trong cột 150px và tràn đè lên ô "Lời/lỗ đã bán" bên cạnh — đo
                thật trong app. Cho xuống dòng thì phần trăm rơi xuống dưới, còn khi rộng
                rãi hai số vẫn nằm cùng hàng như cũ. */}
            <dd className="flex flex-wrap items-baseline gap-x-1">
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
          <p className="mt-3 rounded-md border border-state-warn-border bg-state-warn-bg px-2.5 py-2 text-2xs text-state-warn-fg">
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

      {/* Hiệu quả: năm con số + đường danh mục so với VN-Index */}
      <InvestPerformanceSection
        data={chartData}
        hasAccounts={shown.length > 0}
        marketValue={p.marketValue}
        cashNegative={p.cash < 0}
        hasTrades={trades.length > 0}
      />

      {/* Cơ cấu danh mục: bảng đủ cột (desktop) / thẻ từng mã (điện thoại) */}
      <InvestAllocationSection
        table={bangCoCau}
        nameBySymbol={nameBySymbol}
        symbolFilter={symbolFilter}
        onToggleSymbol={(sym) => setSymbolFilter((cur) => (cur === sym ? null : sym))}
        concentration={tapTrung}
        cashflows={dongTienGanMa}
        allSymbols={moiMa}
      />

      <InvestWeightDonut
        positions={bangCoCau.rows}
        cash={p.cash + (p.walletCash ?? 0)}
        industryBySymbol={nganhTheoMa}
      />

      <InvestRiskSection data={chartData} positions={bangCoCau.rows} />

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
                      <span className="font-semibold text-fg-primary">{t.symbol}</span>
                      <span className="truncate text-2xs text-fg-muted">
                        {ngay(t.traded_on)}
                        {/* Khoá theo `shown` — tập mà những dòng này ĐANG được lấy ra —
                            chứ không theo `filtered`: một `?account=` cũ làm `filtered`
                            rỗng trong khi sổ lệnh dưới đây trải mọi tài khoản, và khi đó
                            không dòng nào nói mình thuộc tài khoản nào. */}
                        {shown.length > 1 && ` · ${accountName(t.account_id)}`}
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
