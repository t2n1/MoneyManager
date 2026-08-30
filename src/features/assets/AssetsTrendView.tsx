// Chế độ "Theo thời gian" của trang Tài sản — trả lời "tôi đang tiến bộ không". Bản vẽ 2b.
//
// ---- Nó là một MÀN RIÊNG, không phải bốn khối chèn thêm ---------------------------
//
// Bản trước: bật công tắc thì AssetsNowView vẫn dựng nguyên và bốn khối theo thời gian
// MỌC THÊM xuống dưới. Lý do khi đó là "gạt công tắc không làm trang nhảy". Cái giá đo
// được trên sổ này: bảng chín tài khoản, bảng ba thẻ và vạch cơ cấu — tức toàn bộ phần
// trả lời "giờ tôi có bao nhiêu" — nằm CHÈN GIỮA con số ròng và biểu đồ đường đi của
// chính con số đó. Người bật công tắc để xem đường đi phải cuộn qua ~900px thứ mình
// không hỏi.
//
// Bản vẽ 2b chốt lại: hai chế độ là hai màn, và dải KPI bốn ô ở trên là phần CHUNG (nó
// đứng yên khi gạt công tắc, chỉ đổi ô đầu và ô cuối — xem AssetsKpi.tsx). Nhờ vậy vẫn
// giữ được điều mà bản trước muốn — mép trên trang không nhảy — mà không phải chở theo
// cả màn kia.
//
// Bảng tài khoản ở đây co thành ĐÚNG các dòng NHÓM: chín dòng tài khoản không nói thêm
// gì về "đang tiến bộ không" mà chúng đã nói ở chế độ Hôm nay, và ở đây chúng sẽ đẩy hai
// biểu đồ ra khỏi màn đầu.
import { useMemo } from 'react'
import { Card, Money, SectionTitle, Sparkline, pct1, signedPct } from '../../components/ui'
import { Guide } from '../../components/Guide'
import { useCategories, useNetWorthSnapshots, useRangeTransactions } from '../../hooks/queries'
import { addDaysISO } from '../../lib/dates'
import type { CurrencyCode } from '../../lib/money'
import { lastReconciledMap } from '../notifications/reconciledAt'
import { accountRowStats, DELTA_DAYS } from './accountRowStats'
import { AssetsKpi } from './AssetsKpi'
import { RANGE_NOUN, type AssetsRange, type RangeSpan } from './assetsRange'
import { concentrationNote, groupDeltas, type GroupDelta } from './groupInsight'
import { investTxRange } from './investHistory'
import { InvestmentPerformanceSection } from './InvestmentPerformanceSection'
import { InvestmentValueHistorySection } from './InvestmentValueHistorySection'
import { makeMoneyView } from './moneyView'
import { netWorthSeries } from './netWorthSeries'
import { NetWorthHistorySection } from './NetWorthHistorySection'
import { SavingsGoalsSection } from './SavingsGoalsSection'
import { GROUP_COLOR_NONE, groupColorMap } from './groupColors'
import { useAssetsData } from './useAssetsData'


interface Props {
  /** Đồng tiền đang xem thử — nút ¥/₫/$ ở header trang. */
  viewCur: CurrencyCode | null
  /** Khoảng đang chọn (dải 1 th / 3 th / 12 th / Từ đầu ở header trang). */
  range: AssetsRange
  /** Khoảng đã kẹp về dữ liệu thật có — xem assetsRange.ts. */
  span: RangeSpan
}

export function AssetsTrendView({ viewCur, range, span }: Props) {
  const {
    todayISO,
    base,
    rates,
    balances,
    purposeGroups,
    investmentAccounts,
    netWorth,
    netWorthReliable,
  } = useAssetsData()

  const displayCur = viewCur ?? base
  // Bộ quy đổi dùng chung cho mọi con số trên màn. Lịch sử ròng quy đổi bằng tỷ giá HÔM
  // NAY cho mọi mốc — đủ cho mục đích ước chừng, có ≈ đi kèm.
  const mv = useMemo(
    () => makeMoneyView(base, displayCur, rates ?? {}),
    [base, displayCur, rates],
  )

  const { data: snapshots = [] } = useNetWorthSnapshots()
  const series = useMemo(() => netWorthSeries(snapshots, span.startISO), [snapshots, span.startISO])

  /**
   * MỘT lượt đọc sổ cho cả hai cột Δ.
   *
   * `investTxRange` là đúng khoảng mà hai khối biểu đồ đầu tư dưới đây đã đọc, nên dùng
   * lại nó ở đây KHÔNG thêm request nào — react-query khoá cache theo chuỗi start/end
   * (xem ghi chú tại investTxRange). Một khoảng khác, dù rộng hơn hay hẹp hơn, là một
   * lượt đọc cả sổ thứ hai.
   *
   * `accountRowStats` tự lọc theo `windowStartISO`, nên cùng một mảng giao dịch phục vụ
   * được cả cửa sổ 30 ngày và cửa sổ người dùng chọn.
   */
  const { data: txs = [] } = useRangeTransactions(investTxRange(todayISO))
  const { data: categories = [] } = useCategories()
  const statsArgs = useMemo(
    () => ({
      balanceById: new Map(balances.map((b) => [b.id, b.balance])),
      txs,
      lastReconciledById: lastReconciledMap(balances, txs, categories),
      todayISO,
    }),
    [balances, txs, categories, todayISO],
  )
  const stats30 = useMemo(
    () => accountRowStats({ ...statsArgs, windowStartISO: addDaysISO(todayISO, -DELTA_DAYS) }),
    [statsArgs, todayISO],
  )
  // "Từ đầu" (`startISO === null`) rơi về mốc đầu của CHÍNH LƯỢT ĐỌC — không thể đo xa
  // hơn phần sổ đã tải, và `investTxRange` là 10 năm nên với một app ghi tay thì đó đúng
  // là "từ đầu". Lấy `'0000-01-01'` thay vào cũng cho cùng kết quả nhưng nói dối về căn
  // cứ: nó ngụ ý đã xét cả những giao dịch chưa hề được đọc về.
  const txStartISO = investTxRange(todayISO).start
  const statsRange = useMemo(
    () => accountRowStats({ ...statsArgs, windowStartISO: span.startISO ?? txStartISO }),
    [statsArgs, span.startISO, txStartISO],
  )

  const delta30 = useMemo(
    () =>
      groupDeltas({
        groups: purposeGroups,
        deltaById: new Map([...stats30].map(([id, s]) => [id, s.delta])),
        base,
        rates: rates ?? {},
      }),
    [purposeGroups, stats30, base, rates],
  )
  const deltaRange = useMemo(
    () =>
      groupDeltas({
        groups: purposeGroups,
        deltaById: new Map([...statsRange].map(([id, s]) => [id, s.delta])),
        base,
        rates: rates ?? {},
      }),
    [purposeGroups, statsRange, base, rates],
  )
  // Câu kết ở chân bảng đo trên cửa sổ 30 ngày, vì đó là cửa sổ mà ô KPI "Tài sản ròng"
  // ở chế độ Hôm nay dùng — hai chỗ nói về cùng một cú sụt thì phải cùng một cửa sổ.
  const tapTrung = useMemo(() => concentrationNote(delta30), [delta30])


  const colorByName = useMemo(() => groupColorMap(purposeGroups), [purposeGroups])
  const colorOf = (name: string) => colorByName.get(name) ?? GROUP_COLOR_NONE

  // Cột Δ thứ hai chỉ có nghĩa khi nó KHÁC cột Δ 30 ngày. Chọn "1 th" thì hai cột đo
  // gần như cùng một cửa sổ, và hai cột cùng một con số là một cột thừa.
  const showRangeCol = range !== '1m'
  const accountCount = purposeGroups.reduce((n, g) => n + g.accounts.length, 0)

  return (
    <div className="flex flex-col gap-3">
      <AssetsKpi
        viewCur={viewCur}
        tail="invested"
        netWorthFoot={
          series.delta == null ? (
            <span>chưa đủ hai mốc trong khoảng này</span>
          ) : (
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Money
                amount={mv.view(Math.abs(series.delta)).amount}
                currency={mv.cur}
                tone={series.delta >= 0 ? 'in' : 'out'}
                showSign
              />
              <span>
                {series.deltaPct != null && `${signedPct(pct1(series.deltaPct / 100))} · `}
                {RANGE_NOUN[range]}
              </span>
              <Sparkline
                values={series.points.map((p) => p.value)}
                label="Tài sản ròng trong khoảng đang xem"
              />
            </span>
          )
        }
      />

      <NetWorthHistorySection
        currentNetWorth={netWorthReliable ? netWorth : null}
        view={mv}
        series={series}
        rangeNoun={RANGE_NOUN[range]}
      />

      <InvestmentValueHistorySection
        accounts={investmentAccounts}
        base={base}
        view={mv}
        span={span}
      />

      {/* Hai khối "bản chốt" đứng cạnh nhau: cả hai đều là một con số kết luận cộng một
          thanh, và cả hai đều ngắn. Xếp dọc là chừa hai dải trắng bằng nửa bề ngang. */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <InvestmentPerformanceSection
            accounts={investmentAccounts}
            base={base}
            view={mv}
            purposeGroups={purposeGroups}
          />
        </div>
        <div className="lg:w-[27rem] lg:shrink-0">
          <SavingsGoalsSection view={mv} />
        </div>
      </div>

      <Card as="section" elevation="panel" padding="none" className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border-panel px-4 py-2">
          <SectionTitle role="micro">
            Danh sách tài khoản
          </SectionTitle>
          <span className="text-2xs text-fg-muted">
            {purposeGroups.length} nhóm · {accountCount} tài khoản
          </span>
          <Guide as="span" className="ml-auto text-2xs text-fg-muted">
            Mở <span className="text-fg-secondary">Hôm nay</span> để xem từng tài khoản
          </Guide>
        </div>

        <div className="hidden items-center border-b border-border-panel px-4 py-1.5 text-2xs font-semibold uppercase tracking-label text-fg-muted lg:flex">
          <span className="min-w-0 flex-1">Nhóm</span>
          <span className="w-[6.5rem] shrink-0 text-right">Tỷ trọng</span>
          <span className="w-[8.125rem] shrink-0 text-right">Δ {DELTA_DAYS} ngày</span>
          {showRangeCol && (
            <span className="w-[8.125rem] shrink-0 text-right">Δ {RANGE_NOUN[range]}</span>
          )}
          <span className="w-[10rem] shrink-0 text-right">Số dư</span>
        </div>

        {purposeGroups.map((g) => {
          const outsideTotals = !g.includeInTotals || (g.total === 0 && g.rawTotal !== 0)
          return (
            <div
              key={g.name}
              className="flex flex-col border-b border-border-subtle px-4 py-2.5 lg:flex-row lg:items-center lg:py-2"
            >
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <span
                  className="h-2 w-2 shrink-0 rounded-sm"
                  style={{ backgroundColor: colorOf(g.name) }}
                  aria-hidden
                />
                <span
                  className={`truncate text-sm font-semibold ${
                    outsideTotals ? 'text-fg-secondary' : 'text-fg-primary'
                  }`}
                >
                  {g.name}
                </span>
                <span className="shrink-0 text-2xs text-fg-muted">{g.accounts.length}</span>
                {/* Dưới lg số dư đứng cuối DÒNG MỘT; từ lg nó về cột của mình. */}
                <span className="ml-auto shrink-0 lg:hidden">
                  <SoDuNhom g={g} view={mv} outsideTotals={outsideTotals} />
                </span>
              </span>

              {/* `lg:contents` để bốn ô này thành con trực tiếp của dòng ở khổ lớn (nhận
                  đúng bề rộng cột), còn dưới lg chúng gom thành TẦNG HAI một dòng. */}
              <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 pl-4 text-2xs text-fg-muted lg:mt-0 lg:contents">
                <span className="flex shrink-0 items-center justify-end gap-1.5 lg:w-[6.5rem]">
                  {outsideTotals ? (
                    'ngoài tổng'
                  ) : (
                    <>
                      <span className="hidden h-1 w-14 rounded-full bg-surface-sunken lg:block">
                        <span
                          className="block h-1 rounded-full"
                          style={{
                            width: `max(2px, ${g.share * 100}%)`,
                            backgroundColor: colorOf(g.name),
                          }}
                        />
                      </span>
                      <span className="font-mono">{phanTram(g.share)}</span>
                    </>
                  )}
                </span>
                <DeltaCell
                  d={delta30.get(g.name)}
                  label={`${DELTA_DAYS} ngày`}
                  view={mv}
                  className="lg:w-[8.125rem]"
                />
                {showRangeCol && (
                  <DeltaCell
                    d={deltaRange.get(g.name)}
                    label={RANGE_NOUN[range]}
                    view={mv}
                    className="lg:w-[8.125rem]"
                  />
                )}
                <span className="hidden shrink-0 text-right lg:block lg:w-[10rem]">
                  <SoDuNhom g={g} view={mv} outsideTotals={outsideTotals} />
                </span>
              </span>
            </div>
          )
        })}

        {tapTrung && (
          <p className="bg-surface-chrome px-4 py-2.5 text-2xs leading-snug text-fg-muted">
            {tapTrung.totalDelta >= 0 ? 'Ròng tăng ' : 'Ròng sụt '}
            <Money
              amount={mv.view(Math.abs(tapTrung.totalDelta)).amount}
              currency={mv.cur}
              tone={tapTrung.totalDelta >= 0 ? 'in' : 'out'}
            />{' '}
            trong {DELTA_DAYS} ngày gần như hoàn toàn ở{' '}
            <span className="text-fg-secondary">{tapTrung.groupName}</span>
            {tapTrung.account && (
              <>
                {' '}— {tapTrung.account.name}{' '}
                <Money
                  amount={mv.view(Math.abs(tapTrung.account.delta)).amount}
                  currency={mv.cur}
                  tone={tapTrung.account.delta >= 0 ? 'in' : 'out'}
                  showSign
                />
              </>
            )}
            {tapTrung.othersDelta !== 0 && (
              <>
                , các nhóm khác{' '}
                {Math.sign(tapTrung.othersDelta) === Math.sign(tapTrung.groupDelta)
                  ? 'cùng chiều'
                  : 'bù lại'}{' '}
                <Money
                  amount={mv.view(Math.abs(tapTrung.othersDelta)).amount}
                  currency={mv.cur}
                  tone={tapTrung.othersDelta >= 0 ? 'in' : 'out'}
                  showSign
                />
              </>
            )}
            .
          </p>
        )}
      </Card>
    </div>
  )
}

/** Ô Δ của một nhóm. Nhãn hiện dưới lg (không có tên cột) và ẩn từ lg (có tên cột). */
function DeltaCell({
  d,
  label,
  view,
  className,
}: {
  d: GroupDelta | undefined
  label: string
  view: ReturnType<typeof makeMoneyView>
  className: string
}) {
  return (
    <span className={`flex shrink-0 items-center justify-end gap-1 ${className}`}>
      <span className="lg:hidden">{label}</span>
      {d?.delta == null || d.delta === 0 ? (
        <span>—</span>
      ) : (
        <Money
          amount={view.view(Math.abs(d.delta)).amount}
          currency={view.cur}
          tone={d.delta > 0 ? 'in' : 'out'}
          showSign
          approx={d.hasMissingRate || view.converted}
        />
      )}
    </span>
  )
}

/**
 * Số dư của một nhóm. Nhóm ĐỨNG NGOÀI TỔNG in bản quy đổi MỜ chứ không in đậm: nó không
 * góp vào Tổng tài sản nên nó cũng không được đọc ngang hàng với những nhóm góp.
 */
function SoDuNhom({
  g,
  view,
  outsideTotals,
}: {
  g: { total: number; rawTotal: number; hasMissingRate: boolean; rawHasMissingRate: boolean }
  view: ReturnType<typeof makeMoneyView>
  outsideTotals: boolean
}) {
  const v = view.view(outsideTotals ? g.rawTotal : g.total)
  return (
    <Money
      {...v}
      tone={outsideTotals ? 'muted' : 'neutral'}
      approx={v.approx || (outsideTotals ? g.rawHasMissingRate : g.hasMissingRate)}
      className={`text-sm ${outsideTotals ? 'font-medium' : 'font-bold'}`}
    />
  )
}

/** 83% · 1,9% · 0,05% — giữ chữ số có nghĩa đầu tiên thay vì làm tròn một nhóm về 0. */
function phanTram(share: number): string {
  const pct = share * 100
  if (pct >= 10) return `${Math.round(pct)}%`
  if (pct >= 1) return `${pct.toFixed(1).replace('.', ',')}%`
  return `${pct.toFixed(2).replace('.', ',')}%`
}

