// Trang "Sức khỏe tài chính" — khám tổng quát, mỗi chỉ số một thẻ cùng khuôn:
// số lớn + thang màu + một câu nghĩa là gì. Dữ liệu lấy từ 12 tháng ĐÃ HOÀN TẤT
// gần nhất (tháng đang chạy dở bị loại để không kéo trung bình xuống).
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
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
} from '../../hooks/queries'
import { addMonths, getMonthRange, monthKeyForDate, toISODate, type MonthKey } from '../../lib/dates'
import { formatMoney, type CurrencyCode } from '../../lib/money'
import { taxCategoryIds } from '../tax/categories'
import { earmarkedForGoals } from './earmarked'
import { HealthMetricCard, type Zone } from './HealthMetricCard'
import {
  debtServiceRatio,
  debtToIncome,
  emergencyFundMonths,
  incomeConcentration,
  liquidityRatio,
  monteCarloRunway,
  taxBurden,
  verdictFor,
  VERDICT_LABELS,
  type Verdict,
} from './health'
import { buildHealthSnapshot } from './snapshot'

/** Số tháng lịch sử tối đa dùng để chấm điểm. */
const WINDOW_MONTHS = 12

const pct = (v: number) => `${Math.round(v * 100)}%`
/** Số thập phân một chữ số kiểu Việt (dấu phẩy). */
const num1 = (v: number) => v.toFixed(1).replace('.', ',')
/** Trên 5 năm thì con số cụ thể vô nghĩa — nói "≥ 60 tháng" cho gọn. */
const months1 = (v: number) => (v >= 60 ? '≥ 60 tháng' : `${num1(v)} tháng`)

export function HealthPage() {
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

  const money = (v: number) => formatMoney(Math.round(v), base)
  const nameOf = (id: string) => categories.find((c) => c.id === id)?.name ?? 'Nguồn khác'

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
  // Kịch bản thứ hai: cắt sạch chi linh hoạt. Cùng seed nên hai con số so được với nhau.
  const runwayLean = useMemo(
    () => monteCarloRunway(snap.liquidAssets, snap.essentialNetFlows),
    [snap.liquidAssets, snap.essentialNetFlows],
  )
  // Chỉ hiện khi thực sự có gì để cắt và việc cắt tạo ra khác biệt
  const showLean =
    runway !== null &&
    runwayLean !== null &&
    snap.monthlyFlexibleExpense > 0 &&
    (runwayLean.p50 > runway.p50 || runwayLean.survivalRate > runway.survivalRate)

  const burden = taxBurden(snap.taxAndSocial, snap.annualIncome)
  const burdenVerdict: Verdict = snap.taxAndSocial <= 0 ? 'unknown' : verdictFor(burden, 0.35, 0.25, false)

  const verdicts = [fundVerdict, liqVerdict, dtiVerdict, concVerdict, runwayVerdict, burdenVerdict]
  const tally = {
    good: verdicts.filter((v) => v === 'good').length,
    warn: verdicts.filter((v) => v === 'warn').length,
    bad: verdicts.filter((v) => v === 'bad').length,
  }

  const fundZones: Zone[] = [
    { upTo: 3, tone: 'bad' },
    { upTo: 6, tone: 'warn' },
    { upTo: 12, tone: 'good' },
  ]
  const liqZones: Zone[] = [
    { upTo: 1, tone: 'bad' },
    { upTo: 2, tone: 'warn' },
    { upTo: 4, tone: 'good' },
  ]
  const dtiZones: Zone[] = [
    { upTo: 0.5, tone: 'good' },
    { upTo: 1.5, tone: 'warn' },
    { upTo: 3, tone: 'bad' },
  ]
  const concZones: Zone[] = [
    { upTo: 0.7, tone: 'good' },
    { upTo: 0.95, tone: 'warn' },
    { upTo: 1, tone: 'bad' },
  ]
  const runwayZones: Zone[] = [
    { upTo: 6, tone: 'bad' },
    { upTo: 18, tone: 'warn' },
    { upTo: 60, tone: 'good' },
  ]
  const burdenZones: Zone[] = [
    { upTo: 0.25, tone: 'good' },
    { upTo: 0.35, tone: 'warn' },
    { upTo: 0.6, tone: 'bad' },
  ]

  if (!isFetched) {
    return <p className="p-6 text-center text-sm text-gray-400 dark:text-gray-500">Đang tính…</p>
  }

  return (
    <div className="flex flex-col gap-3 p-3 lg:p-6">
      <div className="flex items-center gap-2">
        <Link
          to="/reports"
          aria-label="Quay lại Báo cáo"
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-white shadow-sm active:scale-95 dark:bg-gray-900"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold text-gray-800 dark:text-gray-100">Sức khỏe tài chính</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Dựa trên {snap.monthsCounted} tháng gần nhất
          </p>
        </div>
      </div>

      {/* Tóm tắt một dòng để biết ngay có gì cần lo không */}
      <section className="grid grid-cols-3 gap-2">
        {(
          [
            ['good', tally.good, 'text-green-600 dark:text-green-400'],
            ['warn', tally.warn, 'text-amber-600 dark:text-amber-400'],
            ['bad', tally.bad, 'text-red-600 dark:text-red-400'],
          ] as const
        ).map(([key, count, cls]) => (
          <div key={key} className="rounded-xl bg-white p-3 text-center shadow-sm dark:bg-gray-900">
            <p className={`text-xl font-bold tabular-nums ${cls}`}>{count}</p>
            <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
              {VERDICT_LABELS[key]}
            </p>
          </div>
        ))}
      </section>

      {snap.hasMissingRate && (
        <div className="rounded-lg bg-amber-50 p-2 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
          Một phần số liệu ngoại tệ chưa quy đổi được (đang chờ tỷ giá) nên các chỉ số có thể thiếu.
        </div>
      )}

      {snap.monthsCounted < 3 && (
        <div className="rounded-lg bg-sky-50 p-2 text-xs text-sky-700 dark:bg-sky-900/30 dark:text-sky-300">
          Mới có {snap.monthsCounted} tháng dữ liệu. Các chỉ số dựa trên trung bình tháng sẽ chính
          xác dần khi bạn ghi chép đủ 3–6 tháng.
        </div>
      )}

      {/* 1. Quỹ dự phòng */}
      <HealthMetricCard
        title="Quỹ dự phòng"
        display={fund === null ? '—' : months1(fund)}
        verdict={fundVerdict}
        value={fund}
        zones={fundZones}
        zoneLabels={['3', '6']}
        meaning={
          fund === null ? (
            <>
              Chưa tính được vì chưa biết mỗi tháng bạn phải trả cố định bao nhiêu.{' '}
              <Link to="/settings/categories/classify" className="font-medium text-green-700 dark:text-green-400">
                Phân loại danh mục chi
              </Link>{' '}
              để mở chỉ số này.
            </>
          ) : (
            <>
              Nếu hôm nay mất thu nhập, tiền lỏng ({money(snap.liquidAssets)}) đủ trả các khoản cố
              định ({money(snap.monthlyFixedExpense)}/tháng) trong <b>{months1(fund)}</b>.
            </>
          )
        }
        extra={
          showFree ? (
            <div className="mt-2 rounded-lg bg-sky-50 p-2 dark:bg-sky-900/30">
              <p className="text-xs leading-relaxed text-gray-700 dark:text-gray-200">
                Trong đó <b>{money(earmarked.total)}</b> đang để dành cho mục tiêu tiết kiệm. Trừ
                phần đã có chủ thì quỹ dự phòng thật sự tự do là{' '}
                <b>{months1(freeFund!)}</b>.{' '}
                <Link to="/assets" className="font-medium text-green-700 dark:text-green-400">
                  Xem mục tiêu
                </Link>
              </p>
            </div>
          ) : null
        }
        how={
          <>
            <p>
              <b>Cách tính:</b> tiền mặt + ngân hàng + IC + ví điện tử, chia cho chi CỐ ĐỊNH trung
              bình mỗi tháng. Tiền đầu tư và tài sản cố định không tính vì không rút ra tiêu ngay được.
            </p>
            <p>
              Nếu bạn có mục tiêu tiết kiệm gắn với một tài khoản lỏng, app tính thêm con số thứ hai
              đã trừ phần tiền đang gom cho mục tiêu đó — vì tiêu vào nó nghĩa là bỏ mục tiêu.
            </p>
            <p>
              <b>Mốc:</b> dưới 3 tháng là rủi ro, 3–6 tháng tạm ổn, từ 6 tháng trở lên là tốt. Ở Nhật
              nếu bạn đang ở visa phụ thuộc công ty thì nên nhắm 6–12 tháng.
            </p>
            <p>
              <b>Nên làm:</b> chuyển phần dư mỗi tháng vào một tài khoản riêng và đừng gắn thẻ vào nó.
            </p>
          </>
        }
      />

      {/* 2. Tỷ lệ thanh khoản */}
      <HealthMetricCard
        title="Khả năng trả nợ ngắn hạn"
        display={
          snap.debtDueWithin12m <= 0 ? 'Không có nợ' : liq === null ? '—' : `${num1(liq)}×`
        }
        verdict={liqVerdict}
        value={snap.debtDueWithin12m <= 0 ? null : liq}
        zones={liqZones}
        zoneLabels={['1×', '2×']}
        meaning={
          snap.debtDueWithin12m <= 0 ? (
            <>Bạn không có khoản nợ nào phải trả trong 12 tháng tới. Nhẹ đầu.</>
          ) : (
            <>
              Tiền lỏng đang gấp <b>{liq === null ? '—' : `${num1(liq)}×`}</b> số nợ phải trả trong 12 tháng tới (
              {money(snap.debtDueWithin12m)}). Dưới 1× nghĩa là bán sạch tiền mặt vẫn chưa trả hết.
            </>
          )
        }
        how={
          <>
            <p>
              <b>Cách tính:</b> tài sản lỏng ÷ (dư nợ thẻ tín dụng + khoản vay đến hạn trong 12 tháng).
              Khoản vay không ghi hạn trả được tính là ngắn hạn cho an toàn.
            </p>
            <p>
              <b>Mốc:</b> dưới 1× là rủi ro, 1–2× tạm ổn, từ 2× trở lên là thoải mái.
            </p>
          </>
        }
      />

      {/* 3. Nợ trên thu nhập */}
      <HealthMetricCard
        title="Nợ trên thu nhập năm"
        display={snap.totalDebt <= 0 ? 'Không nợ' : dti === null ? '—' : `${(dti * 100).toFixed(0)}%`}
        verdict={dtiVerdict}
        value={snap.totalDebt <= 0 ? null : dti}
        zones={dtiZones}
        zoneLabels={['50%', '150%']}
        meaning={
          snap.totalDebt <= 0 ? (
            <>Bạn không có dư nợ nào. Chỉ số này chỉ bật khi có nợ.</>
          ) : dti === null ? (
            <>Cần có khoản Thu trong kỳ mới so sánh được với dư nợ {money(snap.totalDebt)}.</>
          ) : (
            <>
              Tổng nợ {money(snap.totalDebt)} bằng <b>{pct(dti)}</b> thu nhập một năm của bạn.
              {dsr !== null && dsr > 0 && (
                <> Mỗi tháng đang trả nợ {money(snap.monthlyDebtPayment)} ({pct(dsr)} thu nhập).</>
              )}
            </>
          )
        }
        how={
          <>
            <p>
              <b>Cách tính:</b> (dư nợ thẻ + dư nợ vay) ÷ tổng thu nhập {snap.monthsCounted} tháng qua.
            </p>
            <p>
              <b>Mốc:</b> dưới 50% là tốt, 50–150% cần chú ý, trên 150% là nặng. Mốc này dành cho nợ
              tiêu dùng — nếu bạn có vay mua nhà thì đọc con số này rộng tay hơn.
            </p>
          </>
        }
      />

      {/* 4. Runway */}
      <HealthMetricCard
        title="Cầm cự được bao lâu (mô phỏng)"
        display={
          runway === null
            ? '—'
            : runway.p50 >= runway.horizon
              ? `≥ ${runway.horizon} tháng`
              : months1(runway.p50)
        }
        verdict={runwayVerdict}
        value={runway?.p50 ?? null}
        zones={runwayZones}
        zoneLabels={['6', '18']}
        meaning={
          runway === null ? (
            <>Cần ít nhất 3 tháng dữ liệu và số dư dương để chạy mô phỏng.</>
          ) : runway.survivalRate >= 0.95 ? (
            <>
              Với đà thu chi hiện tại, hầu như mọi kịch bản đều <b>không cạn tiền</b> trong{' '}
              {runway.horizon} tháng tới.
            </>
          ) : (
            <>
              Kịch bản trung bình: cạn tiền sau <b>{runway.p50} tháng</b>. Nếu xui (10% tệ nhất):{' '}
              {runway.p10} tháng. Nếu may: {runway.p90} tháng.
            </>
          )
        }
        extra={
          showLean ? (
            <div className="mt-2 rounded-lg bg-green-50 p-2 dark:bg-green-900/30">
              <p className="text-xs leading-relaxed text-gray-700 dark:text-gray-200">
                <b>Nếu cắt hết chi linh hoạt</b> (
                {formatMoney(Math.round(snap.monthlyFlexibleExpense), base)}/tháng):{' '}
                {runwayLean.survivalRate >= 0.95 ? (
                  <>hầu như không còn cạn tiền trong {runwayLean.horizon} tháng tới.</>
                ) : (
                  <>
                    cầm cự được <b>{months1(runwayLean.p50)}</b> thay vì {months1(runway!.p50)}.
                  </>
                )}
              </p>
            </div>
          ) : null
        }
        how={
          <>
            <p>
              <b>Cách tính:</b> chạy 2.000 kịch bản; mỗi tháng bốc ngẫu nhiên một mức thu–chi ròng
              mà bạn ĐÃ từng trải qua trong {snap.monthsCounted} tháng gần nhất, cộng dồn vào tiền
              lỏng cho tới khi âm.
            </p>
            <p>
              Khác với phép chia đơn giản ở chỗ nó tính cả những tháng đột biến, nên con số sát thực
              tế hơn. Càng nhiều tháng dữ liệu thì càng đáng tin.
            </p>
            <p>
              Kịch bản "cắt chi linh hoạt" chạy lại đúng phép trên nhưng bỏ hết khoản thuộc danh mục
              bạn đã đánh dấu <b>Linh hoạt</b>. Danh mục chưa phân loại vẫn bị coi là thiết yếu, nên
              đây là con số thận trọng.
              {snap.hasUnclassifiedNeed && (
                <>
                  {' '}
                  Bạn còn danh mục chưa phân loại — vào{' '}
                  <Link
                    to="/settings/categories/classify"
                    className="font-medium text-green-700 dark:text-green-400"
                  >
                    Phân loại nhanh
                  </Link>{' '}
                  để con số này sát hơn.
                </>
              )}
            </p>
          </>
        }
      />

      {/* 5. Tập trung thu nhập */}
      <HealthMetricCard
        title="Phụ thuộc một nguồn thu"
        display={conc === null ? '—' : pct(conc.topShare)}
        verdict={concVerdict}
        value={conc?.topShare ?? null}
        zones={concZones}
        zoneLabels={['70%', '95%']}
        meaning={
          conc === null ? (
            <>Chưa ghi nhận khoản Thu nào trong kỳ.</>
          ) : (
            <>
              <b>{pct(conc.topShare)}</b> thu nhập đến từ “{nameOf(conc.topKey)}”. Bạn đang có{' '}
              {conc.sourceCount} nguồn thu. Mất nguồn lớn nhất là mất chừng đó thu nhập.
            </>
          )
        }
        how={
          <>
            <p>
              <b>Cách tính:</b> tỷ trọng nguồn thu lớn nhất trên tổng thu {snap.monthsCounted} tháng,
              gom theo danh mục Thu.
            </p>
            <p>
              <b>Mốc:</b> trên 95% là rủi ro cao (một nguồn duy nhất), 70–95% cần chú ý, dưới 70% là
              đã có chân thứ hai.
            </p>
            <p>
              <b>Nên làm:</b> ai đi làm công ăn lương thì con số này gần 100% là bình thường — bù lại
              bằng quỹ dự phòng dày hơn.
            </p>
          </>
        }
      />

      {/* 6. Gánh nặng thuế & an sinh */}
      <HealthMetricCard
        title="Thuế & an sinh trên lương gộp"
        display={snap.taxAndSocial <= 0 || burden === null ? '—' : pct(burden)}
        verdict={burdenVerdict}
        value={snap.taxAndSocial <= 0 ? null : burden}
        zones={burdenZones}
        zoneLabels={['25%', '35%']}
        meaning={
          snap.taxAndSocial <= 0 ? (
            <>
              Chưa ghi khoản thuế/bảo hiểm nào. Muốn theo dõi 所得税・住民税・社会保険料, hãy{' '}
              <Link to="/settings/categories" className="font-medium text-green-700 dark:text-green-400">
                tạo bộ danh mục Thuế &amp; An sinh
              </Link>{' '}
              rồi nhập theo 給与明細.
            </>
          ) : (
            <>
              Bạn nộp {money(snap.taxAndSocial)} thuế và bảo hiểm trong {snap.monthsCounted} tháng,
              bằng <b>{burden === null ? '—' : pct(burden)}</b> thu nhập gộp.
            </>
          )
        }
        how={
          <>
            <p>
              <b>Cách tính:</b> tổng chi thuộc nhóm “Thuế &amp; An sinh” ÷ tổng khoản Thu trong kỳ.
              Chỉ đúng nếu bạn ghi <b>lương gộp</b> là khoản Thu và các khoản khấu trừ trên phiếu
              lương là khoản Chi.
            </p>
            <p>
              <b>Tham chiếu ở Nhật:</b> người làm công ăn lương thường rơi vào 20–30% (thuế thu nhập
              + thuế cư trú + bảo hiểm y tế + hưu trí). Trên 35% thì nên xem lại các khoản khấu trừ
              (扶養控除, 生命保険料控除, ふるさと納税).
            </p>
          </>
        }
      />
    </div>
  )
}
