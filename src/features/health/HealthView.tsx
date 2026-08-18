// "Sức khỏe tài chính" — bản 27b. Dữ liệu lấy từ 12 tháng ĐÃ HOÀN TẤT gần nhất (tháng
// đang chạy dở bị loại để không kéo trung bình xuống).
//
// DỰNG LẠI (27b): sáu thẻ cao ~165–225px → MỘT bảng 44px/dòng; thang màu LUÔN trái-xấu-
// phải-tốt ở cả sáu dòng (bản trước hai chiều lẫn nhau); chỉ số rủi ro lên thẻ riêng ở
// đầu; cung tròn 150px → dải ngang 8px; ba ô đếm "3 Tốt / 2 Cần chú ý / 1 Rủi ro" bỏ vì
// đếm lại đúng bảng ngay dưới; trọng số gộp một dòng chân bảng; thêm khối mô phỏng mất
// việc có thanh trượt thật; và nhận thêm khối "Nhịp chi" chuyển sang từ tab Tháng này.
//
// Là tab con thứ 4 của Báo cáo (`/reports?view=health`), không còn là trang riêng — trước
// đây nó là màn 532 dòng mà đường vào duy nhất là một card chôn giữa trang Báo cáo. Vì
// vậy component này KHÔNG có nút back và KHÔNG tự đặt padding: vỏ ReportsPage lo cả hai.
// Xem docs/information-architecture.md §2.4.
import { useMemo } from 'react'
import { Num } from '../../components/ui'
import {
  useAccountBalances,
  useAccounts,
  useCategories,
  useDebtPayments,
  useDebts,
  useProfile,
  useRangeTransactions,
  useRates,
  useSavingsGoals,
  useTransferCategoryIds,
} from '../../hooks/queries'
import {
  addDaysISO,
  addMonths,
  dayMonthLabel,
  getMonthRange,
  monthKeyForDate,
  toISODate,
  type MonthKey,
} from '../../lib/dates'
import { formatMoney, type CurrencyCode } from '../../lib/money'
import { taxCategoryIds } from '../tax/categories'
import { earmarkedForGoals } from './earmarked'
import { Section, SectionIndex, type IndexItem } from '../reports/SectionIndex'
import { dailyExpenseTotals, monthlySeries } from '../reports/aggregate'
import { detectPaydays, paydayEffect, weekdayProfile } from '../reports/behavior'
import { findRegime } from '../reports/longRange'
import { ReportBlock } from '../reports/ReportBlock'
import { SpendRhythmCard } from '../reports/SpendRhythmCard'
import {
  debtServiceRatio,
  debtToIncome,
  emergencyFundMonths,
  healthScore,
  HEALTH_ZONES,
  incomeConcentration,
  liquidityRatio,
  monteCarloRunway,
  scoreFromZones,
  taxBurden,
  verdictFor,
  type ScoreItem,
  type Verdict,
} from './health'
import { buildHealthSnapshot } from './snapshot'
import { HealthTable, type HealthRow } from './HealthTable'
import { JobLossPanel, ScoreBand, WeakestCard } from './HealthBlocks'
import { weakestAction } from './weakestAction'

// Mục lục của tab: 6 chỉ số cộng thẻ điểm. Nhãn ngắn hơn tiêu đề thẻ vì đây là hàng
// chip cuộn ngang ("Khả năng trả nợ ngắn hạn" → "Nợ ngắn hạn").
// Thứ tự PHẢI khớp thứ tự khối trong JSX — dải chip này là mục lục, mục lục sai thứ tự
// thì bấm vào chip thứ ba lại nhảy xuống khối thứ năm.
//
// "Quỹ dự phòng" và "Nếu mất việc" đứng LIỀN NHAU và không được tách (B15.2): cùng một rổ
// tiền, khác mẫu số, nên rời nhau ra là hai con số 5,0 và ≥60 đọc thành mâu thuẫn.
const SECTIONS: readonly IndexItem[] = [
  { id: 'hl-yeu-nhat', label: 'Chỗ yếu nhất' },
  { id: 'hl-diem', label: 'Điểm' },
  { id: 'hl-bang', label: 'Sáu chỉ số' },
  { id: 'hl-mat-viec', label: 'Nếu mất việc' },
  { id: 'hl-nhip', label: 'Nhịp chi' },
]

/** Số tháng lịch sử tối đa dùng để chấm điểm. */
const WINDOW_MONTHS = 12

const pct = (v: number) => `${Math.round(v * 100)}%`
/** Số thập phân một chữ số kiểu Việt (dấu phẩy). */
const num1 = (v: number) => v.toFixed(1).replace('.', ',')
/** Trên 5 năm thì con số cụ thể vô nghĩa — nói "≥ 60 tháng" cho gọn. */
const months1 = (v: number) => (v >= 60 ? '≥ 60 tháng' : `${num1(v)} tháng`)

export function HealthView() {
  const { data: profile } = useProfile()
  const monthStartDay = profile?.month_start_day ?? 1
  const { base, rates } = useRates()
  const r = rates ?? {}
  const { data: accounts = [] } = useAccounts()
  const { data: balances = [] } = useAccountBalances()
  const { data: categories = [] } = useCategories()
  const { data: debts = [] } = useDebts()
  const { data: debtPayments = [] } = useDebtPayments()
  const { data: goals = [] } = useSavingsGoals()
  const transferIds = useTransferCategoryIds()

  const todayISO = toISODate(new Date())
  // 12 tháng đã hoàn tất, KHÔNG gồm tháng đang chạy dở
  const allMonths = useMemo(() => {
    const current = monthKeyForDate(todayISO, monthStartDay)
    return Array.from({ length: WINDOW_MONTHS }, (_, i) => addMonths(current, i - WINDOW_MONTHS))
  }, [todayISO, monthStartDay])

  const range = useMemo(
    () => ({
      start: getMonthRange(allMonths[0], monthStartDay).start,
      end: getMonthRange(allMonths[allMonths.length - 1], monthStartDay).end,
    }),
    [allMonths, monthStartDay],
  )
  const { data: txs = [], isFetched } = useRangeTransactions(range, !!profile)

  // Người mới dùng app chỉ có vài tháng dữ liệu → chia cho 12 sẽ ra trung bình
  // thấp giả tạo. Chỉ tính từ tháng đầu tiên CÓ giao dịch trở đi.
  const months: MonthKey[] = useMemo(() => {
    if (txs.length === 0) return allMonths
    const earliest = txs.reduce((m, t) => (t.occurred_on < m ? t.occurred_on : m), txs[0].occurred_on)
    const firstKey = monthKeyForDate(earliest, monthStartDay)
    const idx = allMonths.findIndex((k) => k.year > firstKey.year || (k.year === firstKey.year && k.month >= firstKey.month))
    return idx <= 0 ? allMonths : allMonths.slice(idx)
  }, [txs, allMonths, monthStartDay])

  const currencyOf = (id: string): CurrencyCode =>
    accounts.find((a) => a.id === id)?.currency ?? base

  const snap = useMemo(
    () =>
      buildHealthSnapshot({
        balances,
        debts,
        debtPayments,
        txs,
        categories,
        months,
        monthStartDay,
        currencyOf,
        base,
        rates: r,
        today: todayISO,
        taxCategoryIds: taxCategoryIds(categories),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [balances, debts, debtPayments, txs, categories, months, monthStartDay, accounts, base, rates, todayISO],
  )

  // Chuỗi thu/chi theo tháng — nền cho kịch bản "nếp cũ" của khối mô phỏng. Dùng lại
  // `monthlySeries` chứ không tự cộng: hai chỗ cộng chi là hai chỗ sớm muộn lệch nhau.
  const monthSums = useMemo(
    () => monthlySeries(txs, months, monthStartDay, currencyOf, base, r, transferIds).points,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [txs, months, monthStartDay, accounts, base, rates, transferIds],
  )

  // --- Tính từng chỉ số ---
  const fund = emergencyFundMonths(snap.liquidAssets, snap.monthlyFixedExpense)
  const fundVerdict = verdictFor(fund, 3, 6)
  // Tiền đang gom cho mục tiêu thì không thực sự sẵn sàng cho lúc mất thu nhập
  const earmarked = useMemo(
    () => earmarkedForGoals(goals, balances, base, r),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [goals, balances, base, rates],
  )
  const freeFund = emergencyFundMonths(
    Math.max(snap.liquidAssets - earmarked.total, 0),
    snap.monthlyFixedExpense,
  )
  // Chỉ nói thêm khi việc trừ ra thật sự đổi kết luận hoặc đổi con số đáng kể
  const showFree =
    fund !== null && freeFund !== null && earmarked.total > 0 && fund - freeFund >= 0.1

  const liq = liquidityRatio(snap.liquidAssets, snap.debtDueWithin12m)
  const liqVerdict = snap.debtDueWithin12m <= 0 ? 'good' : verdictFor(liq, 1, 2)

  const dti = debtToIncome(snap.totalDebt, snap.annualIncome)
  const dtiVerdict = snap.totalDebt <= 0 ? 'good' : verdictFor(dti, 1.5, 0.5, false)

  const dsr = debtServiceRatio(snap.monthlyDebtPayment, snap.monthlyIncome)

  const conc = incomeConcentration(snap.incomeSlices)
  const concVerdict: Verdict = conc === null ? 'unknown' : verdictFor(conc.topShare, 0.95, 0.7, false)

  const runway = useMemo(
    () => monteCarloRunway(snap.liquidAssets, snap.netFlows),
    [snap.liquidAssets, snap.netFlows],
  )
  const runwayVerdict: Verdict = runway === null ? 'unknown' : verdictFor(runway.p50, 6, 18)
  // Kịch bản "cắt sạch chi linh hoạt" của bản trước KHÔNG còn là một con số cố định: 27b
  // biến nó thành thanh trượt "chi mỗi tháng" của khối mô phỏng, nơi người dùng tự chọn
  // mức chi thay vì app chọn hộ một mức duy nhất. `essentialNetFlows` vẫn còn trong
  // snapshot vì nó là dữ liệu thật, chỉ không còn nơi hiển thị riêng.

  // Gộp = ròng + phần bị giữ lại. Khoản thuế nhập từ phiếu lương mang
  // `exclude_from_stats` nên KHÔNG nằm trong `annualIncome`; cộng lại mới ra gộp.
  // Xem ghi chú trong snapshot.ts về vì sao phần bị giữ lại == taxAndSocial.
  const burden = taxBurden(snap.taxAndSocial, snap.annualIncome + snap.taxAndSocial)
  const burdenVerdict: Verdict = snap.taxAndSocial <= 0 ? 'unknown' : verdictFor(burden, 0.35, 0.25, false)


  // Thang đo lấy từ health.ts — cùng mốc với phép chấm điểm bên dưới, nên thanh màu
  // trên thẻ và con số trên đồng hồ không thể nói khác nhau.
  const fundZones = HEALTH_ZONES.fund
  const liqZones = HEALTH_ZONES.liquidity
  const dtiZones = HEALTH_ZONES.dti
  const concZones = HEALTH_ZONES.concentration
  const runwayZones = HEALTH_ZONES.runway
  const burdenZones = HEALTH_ZONES.taxBurden

  // --- Điểm tổng ---
  // Trọng số theo mức độ "mất cái này thì hỏng chuyện đến đâu", không chia đều:
  // quỹ dự phòng và số tháng cầm cự là hai thứ quyết định có sống qua được cú sốc
  // hay không. Tập trung nguồn thu nặng (20) vì visa lao động gắn với một công ty —
  // mất nguồn đó là mất cả thu nhập lẫn quyền ở lại.
  const scoreItems: ScoreItem[] = [
    {
      key: 'fund',
      label: 'Quỹ dự phòng',
      weight: 25,
      score: scoreFromZones(fund, fundZones),
    },
    {
      key: 'runway',
      label: 'Nếu mất việc',
      weight: 20,
      score: runway === null ? null : scoreFromZones(runway.p50, runwayZones),
    },
    {
      key: 'conc',
      label: 'Phụ thuộc một nguồn thu',
      weight: 20,
      score: conc === null ? null : scoreFromZones(conc.topShare, concZones),
    },
    {
      key: 'dti',
      label: 'Nợ trên thu nhập',
      weight: 15,
      // Không có nợ là điểm ĐẦY, không phải thiếu dữ liệu: mẫu số bằng 0 nhưng
      // tình trạng thì rõ ràng tốt.
      score: snap.totalDebt <= 0 ? 100 : scoreFromZones(dti, dtiZones),
    },
    {
      key: 'liq',
      label: 'Khả năng trả nợ ngắn hạn',
      weight: 10,
      score: snap.debtDueWithin12m <= 0 ? 100 : scoreFromZones(liq, liqZones),
    },
    {
      key: 'burden',
      label: 'Gánh nặng thuế & an sinh',
      weight: 10,
      score: snap.taxAndSocial <= 0 ? null : scoreFromZones(burden, burdenZones),
    },
  ]
  // Không cần useMemo: chỉ là trung bình có trọng số của 6 số đã tính xong ở trên.
  const score = healthScore(scoreItems)

  // VIỆC CẦN LÀM cho chỉ số yếu nhất (15b mục 2). Mọi ngưỡng, và mọi quyết định "chỉ số
  // nào ra được số tiền", nằm ở weakestAction.ts cùng 18 test của nó.
  //
  // `heaviest` so trọng số của chỉ số yếu nhất với trọng số LỚN NHẤT trong cả sáu, chứ
  // không hỏi "có ≥ 25 không": scoreItems là chỗ duy nhất giữ bộ trọng số, nên một hằng
  // số 25 viết tay ở đây sẽ nói sai ngay lần đầu ai đó đổi bộ trọng số.
  const maxWeight = Math.max(...scoreItems.map((i) => i.weight))
  const action =
    score?.weakest != null && score.weakest.score !== null
      ? weakestAction({
          key: score.weakest.key,
          score: score.weakest.score,
          weight: score.weakest.weight,
          heaviest: score.weakest.weight >= maxWeight,
          snap,
          base,
          formatMoney,
        })
      : null

  // Nhịp chi theo thứ + sau ngày lương — CHUYỂN TỪ tab "Tháng này" sang đây (bản 26a).
  // Lý do: nó nói về NẾP, không về kỳ. Một tab tên "Tháng này" mà chứa trung bình sáu
  // tháng theo thứ là đặt sai chỗ, và ở đó nó là khối duy nhất không nói về tháng.
  const PAYDAY_WINDOW = 3
  const rhythm = useMemo(() => {
    const daily = dailyExpenseTotals(
      txs,
      range.start,
      addDaysISO(range.end, -1),
      currencyOf,
      base,
      r,
      transferIds,
    )
    const paydays = detectPaydays(txs, currencyOf, base, r)
    return {
      payday: paydayEffect(daily.points, paydays, PAYDAY_WINDOW),
      weekdays: weekdayProfile(daily.points),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txs, range.start, range.end, accounts, base, rates, transferIds])

  // Mức chi nếp CŨ, cho kịch bản thứ ba của khối mô phỏng. null = chưa có cú đổi nếp nào
  // trong cửa sổ, và lúc đó kịch bản đó biến mất chứ không dựng một mức bịa.
  const oldRegimeExpense = useMemo(() => {
    const regime = findRegime(
      monthSums.map((m) => ({ key: m.key, income: m.income, expense: m.expense })),
    )
    return regime === null ? null : regime.before
  }, [monthSums])

  if (!isFetched) {
    return <p className="p-6 text-center text-sm text-fg-muted">Đang tính…</p>
  }

  // ------------------------------------------------------------------ sáu dòng bảng
  //
  // Thứ tự khai KHÔNG quyết định thứ tự hiện: HealthTable tự xếp rủi ro trước. Nhưng hai
  // dòng "Quỹ dự phòng" và "Cầm cự nếu mất việc" LUÔN mang nhãn rổ + mẫu số của chúng
  // (B15.2) — đó là điều duy nhất giải thích được vì sao 5,0 tháng nằm cạnh ≥60 tháng.
  const rows: HealthRow[] = [
    {
      key: 'liq',
      label: 'Khả năng trả nợ ngắn hạn',
      display: liq === null ? '—' : `${num1(liq)}×`,
      value: liq,
      zones: liqZones,
      verdict: liqVerdict,
      weight: 10,
      meaning: (
        <>
          Tiền mặt dùng được ÷ nợ tới hạn 12 tháng. Mốc <b>1×</b> là đủ trả, <b>2×</b> là
          thoải mái.
        </>
      ),
    },
    {
      key: 'conc',
      label: 'Phụ thuộc một nguồn thu',
      display: conc === null ? '—' : pct(conc.topShare),
      value: conc?.topShare ?? null,
      zones: concZones,
      verdict: concVerdict,
      weight: 20,
      meaning: (
        <>
          Phần thu nhập đến từ nguồn lớn nhất
          {conc !== null && conc.sourceCount > 0 && <> trong {conc.sourceCount} nguồn</>}. Càng
          gần 100% thì mất một nguồn là mất gần hết.
        </>
      ),
    },
    {
      key: 'fund',
      label: 'Quỹ dự phòng',
      note: 'tiền mặt ÷ chi cố định',
      display: fund === null ? '—' : months1(fund),
      value: fund,
      zones: fundZones,
      verdict: fundVerdict,
      weight: 25,
      meaning: (
        <>
          Giả định <b>thu bằng 0</b>: tiền mặt + ngân hàng + IC + ví điện tử chia cho chi CỐ
          ĐỊNH mỗi tháng. Đầu tư không tính vì phải bán mới ra tiền.
          {showFree && freeFund !== null && (
            <>
              {' '}
              Trừ phần đang gom cho mục tiêu thì còn <b>{months1(freeFund)}</b>.
            </>
          )}
        </>
      ),
    },
    {
      key: 'dti',
      label: 'Nợ trên thu nhập năm',
      display: dti === null ? '—' : pct(dti),
      value: dti,
      zones: dtiZones,
      verdict: dtiVerdict,
      weight: 15,
      meaning: <>Tổng dư nợ ÷ thu nhập một năm. Dưới 50% là thoải mái, trên 150% là nặng.</>,
    },
    {
      key: 'burden',
      label: 'Thuế & an sinh trên lương gộp',
      display: burden === null ? '—' : pct(burden),
      value: burden,
      zones: burdenZones,
      verdict: burdenVerdict,
      weight: 10,
      meaning: (
        <>
          Thuế + bảo hiểm đã nộp ÷ lương gộp. Nó không phải chỉ số “tốt/xấu” của bạn — nó cho
          biết phần thu nhập không bao giờ đi qua tay bạn.
        </>
      ),
    },
    {
      key: 'runway',
      label: 'Cầm cự nếu mất việc',
      note: 'tiền mặt ÷ thu chi ròng thật',
      display: runway === null ? '—' : months1(runway.p50),
      value: runway?.p50 ?? null,
      zones: runwayZones,
      verdict: runwayVerdict,
      weight: 20,
      meaning: (
        <>
          Bốc lại những mức thu–chi ròng bạn ĐÃ từng trải qua trong {snap.monthsCounted} tháng,
          cộng dồn vào tiền mặt cho tới khi âm. Cùng rổ tiền với quỹ dự phòng, khác mẫu số —
          xem khối mô phỏng bên dưới để kéo thử.
        </>
      ),
    },
  ]

  // ------------------------------------------------------------------ chỗ yếu nhất
  const weakestRow = rows.find((row) => row.key === score?.weakest?.key) ?? null
  const badCount = rows.filter((row) => row.verdict === 'bad').length
  const weakestFacts = (() => {
    switch (weakestRow?.key) {
      case 'liq':
        return [
          { label: 'Tiền mặt dùng được', value: snap.liquidAssets },
          { label: 'Nợ tới hạn 12 tháng', value: snap.debtDueWithin12m },
          {
            label: 'Với nhịp giữ lại hiện tại',
            value: null,
            text:
              action?.etaMonths != null ? `${action.etaMonths} tháng` : 'chưa tính được',
          },
        ]
      case 'fund':
        return [
          { label: 'Tiền mặt dùng được', value: snap.liquidAssets },
          { label: 'Chi cố định mỗi tháng', value: snap.monthlyFixedExpense },
          {
            label: 'Còn thiếu để đủ 6 tháng',
            value: Math.max(0, snap.monthlyFixedExpense * 6 - snap.liquidAssets),
          },
        ]
      case 'dti':
        return [
          { label: 'Tổng dư nợ', value: snap.totalDebt },
          { label: 'Thu nhập một năm', value: snap.annualIncome },
          { label: 'Trả nợ mỗi tháng', value: snap.monthlyDebtPayment },
        ]
      case 'conc':
        return [
          { label: 'Nguồn thu lớn nhất', value: null, text: conc ? pct(conc.topShare) : '—' },
          { label: 'Số nguồn thu', value: null, text: conc ? String(conc.sourceCount) : '—' },
          { label: 'Thu nhập mỗi tháng', value: snap.monthlyIncome },
        ]
      default:
        return [
          { label: 'Tiền mặt dùng được', value: snap.liquidAssets },
          { label: 'Chi mỗi tháng', value: snap.monthlyExpense },
          { label: 'Thu mỗi tháng', value: snap.monthlyIncome },
        ]
    }
  })()

  return (
    <div className="flex flex-col gap-2.5">
      {/* Cửa sổ thời gian nói ngay tại đây: tab này KHÔNG theo tháng đang chọn ở tab Tháng
          này, nên phải tự nói mình đọc dữ liệu nào. */}
      <Num tone="muted" className="text-2xs tracking-[.06em]">
        {snap.monthsCounted} tháng gần nhất · cập nhật {dayMonthLabel(todayISO)}
      </Num>

      {snap.hasMissingRate && (
        <div className="rounded-lg bg-state-warn-bg p-2 text-xs text-state-warn-fg">
          Một phần giao dịch ngoại tệ chưa quy đổi được (đang chờ tỷ giá) nên số liệu có thể
          thiếu.
        </div>
      )}

      <div className="lg:hidden">
        <SectionIndex items={SECTIONS} />
      </div>

      {/* CHỖ YẾU NHẤT lên đầu, thẻ riêng (27b). Bản trước để nó ở dòng thứ hai của danh
          sách, cùng cỡ chữ với "Thuế & an sinh 20% · Tốt" — tức chỉ số duy nhất đang đỏ
          trông ngang hàng với chỉ số không cần làm gì. */}
      {weakestRow !== null && weakestRow.verdict !== 'good' && (
        <Section id="hl-yeu-nhat">
          <WeakestCard
            title={weakestRow.label}
            headline={
              <>
                {weakestRow.label} đang là <b>{weakestRow.display}</b>
                {action === null ? (
                  '.'
                ) : (
                  <>
                    {' '}
                    — {action.text}
                    {action.amountText !== null && (
                      <>
                        {' '}
                        (<b>{action.amountText}</b>)
                      </>
                    )}
                    {/* `action.text` của weakestAction.ts đã tự kết câu bằng dấu chấm ở
                        phần lớn nhánh. Thêm dấu chấm vô điều kiện ra ".." — kiểm ký tự
                        cuối thay vì sửa 8 chuỗi ở file kia. */}
                    {!/[.!?]$/.test(action.text) && '.'}
                  </>
                )}
              </>
            }
            facts={weakestFacts}
            base={base}
            onlyRisk={badCount === 1 && weakestRow.verdict === 'bad'}
          />
        </Section>
      )}

      <Section id="hl-diem">
        <ScoreBand
          score={score?.score ?? 0}
          verdict={score?.verdict ?? 'unknown'}
          counted={score?.counted ?? 0}
          total={score?.total ?? rows.length}
          // Xu hướng ẨN: app chưa lưu lịch sử điểm (không có bảng, không có localStorage —
          // xem snapshot.ts). Vẽ một thẻ "±0 điểm" là bịa ra một sự ổn định chưa đo được.
          trend={null}
        />
      </Section>

      <Section id="hl-bang">
        <ReportBlock no="01" title="Sáu chỉ số · trái là xấu, phải là tốt ở cả sáu dòng">
          <HealthTable rows={rows} />
          {/* CÂU BẮT BUỘC (B15.2) — hai chỉ số cùng rổ, khác mẫu số. Không bọc <Guide>:
              thiếu nó thì "5,0 tháng" cạnh "≥60 tháng" đọc ra như hai số đá nhau, và người
              đọc mất tin cả trang.
              Chú ý: bản vẽ 27b ghi rằng phần cầm cự "đếm cả đầu tư" — SAI. Cả hai chỉ đếm
              tiền lỏng (`snapshot.LIQUID_TYPES`); khác biệt nằm ở MẪU SỐ. */}
          <p className="rounded-lg border border-border-panel bg-surface px-3 py-2 text-xs text-fg-secondary">
            {/* Mệnh đề mở đầu chỉ nêu HAI CON SỐ khi cả hai thật sự có và thật sự lệch
                nhau. Thiếu điều kiện đó thì câu tự nói "vì sao ≥60 tháng đệm mà cầm cự tới
                lâu hơn nhiều" — một câu hỏi về một nghịch lý không tồn tại. Nhưng phần
                KHAI RỔ thì luôn in, ở mọi trường hợp: đó là yêu cầu B15.2. */}
            {fund !== null && runway !== null && runway.p50 > fund + 1 ? (
              <b>
                Vì sao {months1(fund)} đệm mà cầm cự tới {months1(runway.p50)}:{' '}
              </b>
            ) : (
              <b>Hai chỉ số quỹ dự phòng và cầm cự đo gì: </b>
            )}
            chúng đếm <b>cùng một rổ tiền</b> — tiền mặt, ngân hàng, IC, ví điện tử; tiền đầu
            tư không nằm trong cả hai. Khác nhau ở <b>mẫu số</b>: quỹ dự phòng giả định thu
            bằng 0 và chia cho chi cố định, còn phần cầm cự bốc lại những mức thu–chi ròng đã
            từng xảy ra trong {snap.monthsCounted} tháng gần nhất. Kéo thanh trượt ở khối dưới
            về 0% đầu tư để thấy hai con số gặp nhau.
          </p>
        </ReportBlock>
      </Section>

      <Section id="hl-mat-viec">
        <ReportBlock no="02" title="Nếu mất việc — thử các nếp chi">
          <JobLossPanel
            liquidAssets={snap.liquidAssets}
            investableAssets={snap.investableAssets}
            monthlyIncomes={monthSums.map((m) => m.income)}
            baseExpense={snap.monthlyExpense}
            oldRegimeExpense={oldRegimeExpense}
            fundMonths={fund}
            fundLabel={fund === null ? '—' : months1(fund)}
            base={base}
            monthsCounted={snap.monthsCounted}
          />
        </ReportBlock>
      </Section>

      {/* Nhịp chi — chuyển từ tab "Tháng này" (26a): nó nói về NẾP, không về kỳ. */}
      <Section id="hl-nhip">
        <SpendRhythmCard
          payday={rhythm.payday}
          weekdays={rhythm.weekdays}
          base={base}
          windowDays={PAYDAY_WINDOW}
        />
      </Section>

      <p className="px-1 pb-2 text-2xs text-fg-muted">
        {snap.monthsCounted} tháng gần nhất · quy đổi ≈ {base} · mô phỏng không tính lạm phát
        và thuế bán tài sản
        {dsr !== null && dsr > 0 && <> · trả nợ chiếm {pct(dsr)} thu nhập tháng</>}
      </p>
    </div>
  )
}
