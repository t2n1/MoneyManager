// Bản tin — trang chủ mới (§4.1 của bản redesign 1a, thiết kế chốt 8a). Tách khỏi Sổ:
// Sổ trả lời "tôi đã tiêu gì", Bản tin trả lời "tình hình thế nào" — hai câu hỏi khác
// nhau, trước đây bị nhét chung một màn.
//
// Thứ tự khối theo §4.1. Khối 1 (Việc cần làm) và khối 5 (Độ tin cậy dữ liệu) CHƯA có ở
// PR này: §8 chốt chúng ở PR 9, sau khi các màn nguồn xong, vì chúng chỉ gom kết luận
// của những màn đó. Chỗ của khối 1 tạm dùng banner nhắc nhở sẵn có — đúng như §8 ghi.
//
// Trang này KHÔNG tự tính một con số nào: chuỗi tháng từ reports/aggregate, ngân sách từ
// useBudgetReport, tài sản ròng từ assets/useAssetsData. Nó chỉ chọn khối nào đứng đâu.
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChartColumn, LineChart, Milestone, Settings } from 'lucide-react'
import { ActionButton, Card, PageHeader, SectionTitle, iconButtonClass } from '../../components/ui'
import { ConclusionLine } from '../../components/VerdictNote'
import { useMonthKey } from '../../hooks/useMonthKey'
import {
  useAccounts,
  useBudgetReport,
  useCategories,
  useMonthTransactions,
  useNetWorthSnapshots,
  usePlannedExpenses,
  useProfile,
  useRangeTransactions,
  useRates,
  useRecurringRules,
  useTagGroups,
  useTags,
  useTagSpend,
  useTransferCategoryIds,
  useTrips,
} from '../../hooks/queries'
import {
  addDaysISO,
  addMonths,
  formatMonthLabel,
  getMonthRange,
  monthKeyForDate,
  periodDays,
  toISODate,
} from '../../lib/dates'
import type { CurrencyCode } from '../../lib/money'
import { loadStatus, mergeLoad } from '../../lib/loadStatus'
import { convertToBase } from '../../lib/rates'
import { collectCommitments } from '../budgets/commitments'
import { totalCapOf } from '../budgets/progress'
import { NotificationBoundary } from '../notifications/NotificationBoundary'
import { useNotifications } from '../notifications/useNotifications'
import { historyCoverage, reliability } from '../notifications/reliability'
import { lastReconciledMap } from '../notifications/reconciledAt'
import { RECONCILE_STALE_DAYS } from '../notifications/rules/dataRules'
import { monthExpenseCompare, monthlySeries } from '../reports/aggregate'
import { ngayDiVang } from '../reports/ngayDiVang'
import { dailySpendSeries } from '../reports/dailySpike'
import { cumulativeCompare } from '../reports/cumulativeCompare'
import { dayTagCells } from '../reports/dayTagCells'
import { headlineOf, headlinePaceOf } from '../reports/headline'
import { useMonthPace } from '../reports/useMonthPace'
import { resolveMethod, savingsTargetShare } from '../budgets/budgetMethods'
import { useAssetsData } from '../assets/useAssetsData'
import { useTagBudgets } from '../tags/useTagBudgets'
import { TransactionItem } from '../transactions/TransactionItem'
import { EditTransactionSheet } from '../transactions/EditTransactionSheet'
import {
  BULLETIN_MONTHS,
  deltaPct,
  kpiFromSeries,
  recentTransactions,
  seriesAnchor,
  toiNgayLuong,
} from './bulletin'
import { AccountsPanel } from './AccountsPanel'
import { FirstRunPanel } from './FirstRunPanel'
import { DriftPanel } from './DriftPanel'
import { QuyenLoiPanel } from './QuyenLoiPanel'
import { ReliabilityPanel } from './ReliabilityPanel'
import { TodoPanel } from './TodoPanel'
import { BudgetPanel } from './BudgetPanel'
import { DailySpendPanel, readDailyScope, writeDailyScope, type DailyScope } from './DailySpendPanel'
import { KpiRow } from './KpiRow'
import { HomNayPanel } from './HomNayPanel'
import type { TransactionRow } from '../../types/database.types'

/** Số dòng ở khối Giao dịch gần đây. */
const RECENT = 6

/** Hằng ngoài component: `new Set()` tại chỗ đổi identity mỗi lần bày, phá mọi useMemo dưới nó. */
const EMPTY_IDS: ReadonlySet<string> = new Set()

export function BulletinPage() {
  const { activeMonthKey, setMonthKey } = useMonthKey()
  const { data: profile } = useProfile()
  const monthStartDay = profile?.month_start_day ?? 1
  const todayISO = toISODate(new Date())
  const { base, rates } = useRates()
  const transferIds = useTransferCategoryIds()
  // Ngày đi vắng (chuyến đi) — mốc so 'cùng số ngày' phải bỏ chúng ra, xem ngayDiVang.ts
  const { data: trips = [] } = useTrips()
  const vang = useMemo(() => ngayDiVang(trips), [trips])
  const { data: accounts = [], isSuccess: accountsReady } = useAccounts()
  const { data: categories = [], isSuccess: categoriesReady } = useCategories()
  const [editing, setEditing] = useState<TransactionRow | null>(null)

  const currencyOf = (id: string): CurrencyCode =>
    accounts.find((a) => a.id === id)?.currency ?? base

  // Dải tám tháng. Neo theo `seriesAnchor` chứ không theo tháng đang xem — xem lý do ở
  // đó: neo vào tháng đang xem thì bấm một cột là cả dải trượt sang phải.
  const currentMonthKey = monthKeyForDate(toISODate(new Date()), monthStartDay)
  const anchor = seriesAnchor(activeMonthKey, currentMonthKey)
  const months = useMemo(
    () => Array.from({ length: BULLETIN_MONTHS }, (_, i) => addMonths(anchor, i - (BULLETIN_MONTHS - 1))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [anchor.year, anchor.month],
  )
  // MỘT truy vấn cho cả trang: hợp của dải 8 tháng (biểu đồ) và dải 25 tháng mà panel
  // "Thu nhập & nếp chi" cần (12 tháng hoàn tất + cùng kỳ năm ngoái của chúng). Trước
  // đây DriftPanel tự tải dải 25 tháng RIÊNG — phần 8 tháng bị kéo về hai lần, mà sổ
  // lớn thì mỗi lượt là cả chục request phân trang.
  const range = useMemo(() => {
    const dau = getMonthRange(months[0], monthStartDay).start
    const cuoi = getMonthRange(months[BULLETIN_MONTHS - 1], monthStartDay).end
    const nepChiDau = getMonthRange(addMonths(currentMonthKey, -24), monthStartDay).start
    const nepChiCuoi = getMonthRange(currentMonthKey, monthStartDay).end
    return {
      start: dau < nepChiDau ? dau : nepChiDau,
      end: cuoi > nepChiCuoi ? cuoi : nepChiCuoi,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [months, monthStartDay, currentMonthKey.year, currentMonthKey.month])
  const rangeQ = useRangeTransactions(range)
  const rangeData = rangeQ.data
  const rangeTxs = useMemo(() => rangeData ?? [], [rangeData])
  // MỤC 1a (2026-09-23): dải nhiều tháng là truy vấn NẶNG NHẤT trang (hàng chục request
  // phân trang), về SAU giao dịch của tháng đang xem. Trước đây nó được đọc bằng mặc định
  // `[]` mà không ai chờ, nên vài giây đầu ô Thu/Chi in ¥0, câu kết luận nói "chưa có
  // thu", Độ tin cậy khoe điểm cao — trong khi biểu đồ chi từng ngày ngay dưới (nguồn
  // nhanh hơn) đã hiện số thật. Mọi thứ tính từ `rangeTxs` phải chờ cờ này.
  // Lỗi tải thì vẫn là "chưa có" — không có số nào để in, và thà không in còn hơn ¥0. Nhưng
  // lỗi HẲN (hết lượt thử lại) thì `seriesFailed` bật: các ô đổi chữ "Đang tính…" thành
  // "Chưa tải được", và đầu trang có một dòng cho thử lại — không thì trang kẹt ở "đang
  // tính" mãi mãi mà người dùng không biết phải làm gì.
  const seriesReady = rangeData !== undefined
  const seriesLoad = loadStatus(rangeQ)
  const seriesFailed = seriesLoad === 'failed'

  // Các khối CŨ của trang chỉ được nhìn đúng cửa sổ 8 tháng như trước, không phải cả
  // dải hợp: `reliability` đo "% đã phân loại" trên cửa sổ GẦN ĐÂY (giao dịch chưa gắn
  // nhãn của 2 năm trước không được kéo tụt điểm hôm nay), còn cờ thiếu-tỷ-giá của
  // `monthlySeries` bật theo MỌI dòng nó được đưa — đưa dải rộng là dấu ≈ nổi oan.
  const seriesRange = useMemo(
    () => ({
      start: getMonthRange(months[0], monthStartDay).start,
      end: getMonthRange(months[BULLETIN_MONTHS - 1], monthStartDay).end,
    }),
    [months, monthStartDay],
  )
  const seriesTxs = useMemo(
    () => rangeTxs.filter((t) => t.occurred_on >= seriesRange.start && t.occurred_on < seriesRange.end),
    [rangeTxs, seriesRange],
  )
  const series = useMemo(
    () => monthlySeries(seriesTxs, months, monthStartDay, currencyOf, base, rates ?? {}, transferIds),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [seriesTxs, months, monthStartDay, accounts, base, rates],
  )

  // Ô KPI nói về THÁNG ĐANG XEM, mà dải có thể kết thúc ở một tháng khác (xem
  // `seriesAnchor`). Cắt chuỗi tới đúng tháng đang xem rồi mới đưa vào `kpiFromSeries` —
  // nó lấy phần tử cuối làm giá trị và phần tử kề cuối làm mốc so.
  const activeIndex = series.points.findIndex(
    (p) => p.key.year === activeMonthKey.year && p.key.month === activeMonthKey.month,
  )
  // `seriesAnchor` bảo đảm tháng đang xem luôn nằm trong dải; -1 chỉ xảy ra ở nhịp render
  // đầu khi `monthStartDay` chưa về, và lúc đó cắt cả dải là đúng hơn cắt rỗng.
  const upTo = series.points.slice(0, activeIndex >= 0 ? activeIndex + 1 : series.points.length)
  const incomeKpi = kpiFromSeries(upTo.map((p) => p.income))
  // Ô Chi và câu kết luận so với tháng trước ĐÃ CẮT VỀ CÙNG SỐ NGÀY.
  //
  // `kpiFromSeries` lấy phần tử kề cuối làm mốc, tức TRỌN tháng trước. Giữa tháng đó là
  // so 18 ngày với 31 ngày: đo trên tháng 8/2026 ra "giảm 13%" trong khi cắt cùng 18
  // ngày ra "TĂNG 23%". Bản tin và Báo cáo dùng đúng một hàm (`monthExpenseCompare`) để
  // hai màn không thể nói hai chiều khác nhau về cùng một tháng.
  const expenseCmp = useMemo(
    () =>
      monthExpenseCompare(
        seriesTxs,
        activeMonthKey,
        monthStartDay,
        toISODate(new Date()),
        currencyOf,
        base,
        rates ?? {},
        transferIds,
        vang,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [seriesTxs, activeMonthKey, monthStartDay, accounts, base, rates, transferIds, vang],
  )
  const expenseRaw = kpiFromSeries(upTo.map((p) => p.expense))
  const expenseKpi =
    expenseCmp === null
      ? expenseRaw
      : {
          ...expenseRaw,
          prev: expenseCmp.priorSameDays,
          deltaPct: deltaPct(expenseRaw.value, expenseCmp.priorSameDays),
        }
  const keptSpark = upTo.map((p) => p.income - p.expense)

  // Nguồn của cả `headline`, `BudgetPanel` LẪN dòng "tới ngày lương" — một `useBudgetReport`
  // cho cả màn. Ba chỗ tự cộng lại "đã tiêu" là ba con số sớm muộn lệch nhau: trần nhóm
  // cha, hạn mức dồn và giao dịch thiếu tỷ giá đều là chỗ dễ tính khác đi.
  const { report, isLoading: budgetLoading } = useBudgetReport(activeMonthKey)

  // Kỳ tính của tỷ lệ giữ lại (MỤC 14) — "tới hôm nay" khi tháng đang xem chưa hết. Nguồn
  // là quy ước chung `periodDays` (lib/dates), cùng chỗ Báo cáo lấy.
  const rateScope = periodDays(getMonthRange(activeMonthKey, monthStartDay), todayISO).inProgress
    ? 'tới hôm nay'
    : undefined

  // Tới ngày lương (§4.9). Luôn tính theo KỲ HIỆN TẠI, không theo tháng đang xem — nó
  // nói về hôm nay. Nhưng chỉ HIỆN khi hai cái trùng nhau: đang xem tháng 3 mà có một
  // dòng nói "còn 26 ngày tới ngày lương" thì trên cùng một màn có hai mốc thời gian,
  // và người đọc phải tự đoán dòng nào thuộc mốc nào.
  //
  // Vì đã chốt `dangXemThangNay` nên `report` (khoá theo THÁNG ĐANG XEM) chính là báo cáo
  // của kỳ hiện tại — không thêm query thứ hai cho cùng một tháng.
  //
  // Chờ `budgetLoading` xong mới dựng: `report` về trước khi budgets tải xong thì
  // `totalBudgeted` là 0, và thanh sẽ loé câu "chưa đặt hạn mức" cho người ĐÃ đặt.
  const dangXemThangNay =
    activeMonthKey.year === currentMonthKey.year && activeMonthKey.month === currentMonthKey.month
  const kyHienTai = getMonthRange(currentMonthKey, monthStartDay)
  // Cam kết CHƯA RA của kỳ hiện tại — CÙNG đường với trang Ngân sách và tab Lịch
  // (`collectCommitments` đã tự bỏ kỳ đã sinh giao dịch và khoản sắp chi đã ghi).
  // Thiếu nó thì "mỗi ngày còn" ở đây chia cả phần đã hứa, và Bản tin in một con số
  // /ngày KHÁC với hai màn kia cho cùng một kỳ.
  const { data: recurringRules = [], isSuccess: recurringReady } = useRecurringRules()
  const { data: plannedExpenses = [], isSuccess: plannedReady } = usePlannedExpenses()
  const camKet = useMemo(() => {
    if (!dangXemThangNay) return 0
    const r = rates ?? {}
    return collectCommitments(recurringRules, plannedExpenses, kyHienTai, currencyOf, (amount, c) =>
      convertToBase(amount, c, base, r),
    ).total
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dangXemThangNay, recurringRules, plannedExpenses, kyHienTai.start, kyHienTai.end, accounts, base, rates])
  // Cũng chờ định kỳ + khoản sắp chi: `camKet` tính từ mặc định `[]` là 0, và "mỗi ngày
  // còn" loé lên một con số CAO hơn thật (chưa trừ cam kết) rồi mới tụt xuống.
  const luong =
    dangXemThangNay && report && !budgetLoading && recurringReady && plannedReady
      ? toiNgayLuong({
          todayISO: toISODate(new Date()),
          kyBatDauISO: kyHienTai.start,
          ngayLuongISO: kyHienTai.end,
          hanMuc: report.totalBudgeted,
          daTieu: report.totalSpent,
          camKet,
          // "Chưa đặt" = không có dòng ngân sách, không phải tổng trần = 0 (trần ¥0 là thật).
          coDongHanMuc: totalCapOf(report) !== 'unset',
        })
      : null

  // Một `useMonthTransactions` cho CẢ hai chỗ cần giao dịch của tháng đang xem: dòng
  // "Giao dịch gần đây" và đường "Chi từng ngày". Gọi hai lần thì react-query vẫn trả
  // cùng một cache, nhưng hai biến cùng tên trong một component là chỗ để lệch nhau.
  // Đứng TRƯỚC câu kết luận vì câu đó phải chờ nó (`monthReady`).
  const monthQ = useMonthTransactions(activeMonthKey)
  const { data: monthData, range: activeRange } = monthQ
  const monthTxs = useMemo(() => monthData ?? [], [monthData])
  // Giao dịch tháng đang xem đã về chưa — "Chưa ghi giao dịch nào" và "Chưa ghi khoản chi
  // nào" chỉ được nói khi đã biết chắc, không phải khi query còn đang chạy.
  const monthReady = monthData !== undefined
  const monthLoad = loadStatus(monthQ)
  const monthFailed = monthLoad === 'failed'

  // Câu kết luận đứng đầu màn. Dùng chung `headlineOf` với Báo cáo: hai màn nói cùng một
  // kết luận thì phải nói bằng đúng một câu, không phải hai bản chép tay.
  // Cùng hook dự báo mà tab Ngân sách và Báo cáo dùng — ba màn phải nói CÙNG một con số
  // dự báo, không phải ba phép tính song song (xem chú thích ở ReportsPage).
  const bulletinPace = useMonthPace(activeMonthKey)
  // Cùng mốc với KpiRow ("Giữ lại") — lấy từ khoản Để dành của phương pháp đang chọn,
  // không phải hằng số 20% cứng.
  const savingsShare = savingsTargetShare(resolveMethod(profile))
  // Chờ CẢ dải nhiều tháng lẫn giao dịch tháng đang xem (nguồn của dự báo): dựng câu từ
  // mảng rỗng là "Chưa ghi khoản thu nào tháng này" cho người vừa nhận lương.
  const headlinePending = !(seriesReady && monthReady)
  // Một trong hai nguồn đã hỏng hẳn → câu kết luận không bao giờ dựng được nữa (cho tới khi
  // thử lại). Nói ra thay vì "Đang tính kết luận tháng…" mãi.
  const headlineFailed = mergeLoad(seriesLoad, monthLoad) === 'failed'
  const headline = headlinePending ? null : headlineOf({
    income: incomeKpi.value,
    expense: expenseKpi.value,
    priorExpense: expenseKpi.prev,
    periodNoun: 'tháng này',
    // Cùng luật "chưa đặt" và cùng phạm vi so với thẻ ngân sách (`pickBudgetVerdict`).
    pace: headlinePaceOf(bulletinPace),
    savingsTargetShare: savingsShare,
    rateScope,
  })
  // Lấy % từ chính `headline` chứ không gọi `savingsRate` rồi tự nhân 100: savingsRate
  // trả về TỶ LỆ (0,685), còn ô KPI cần PHẦN TRĂM đã làm tròn (69) — và quan trọng hơn,
  // ô KPI với câu kết luận ngay trên nó phải là cùng một con số, không phải hai phép
  // làm tròn song song.
  const keptPct = headline?.ratePct ?? null

  const recent = useMemo(() => recentTransactions(monthTxs, RECENT), [monthTxs])

  // Chi TỪNG NGÀY của tháng đang xem — nguồn của thẻ "Chi từng ngày".
  //
  // Không tính từ `rangeTxs` (tám tháng) dù nó đã có trong tay: khoảng của nó dựng từ
  // `seriesAnchor`, không phải từ tháng đang xem, nên lọc lại theo ngày là chép tay lần
  // thứ hai định nghĩa "một tháng" — đúng thứ mà `getMonthRange` tồn tại để chấm dứt.
  const monthLastISO = addDaysISO(activeRange.end, -1)

  // Công tắc "bỏ khoản cố định" (B46). Mặc định TẮT — xem `readDailyScope` để biết vì sao
  // đó là luật chứ không phải sở thích.
  const [dailyScope, setDailyScope] = useState<DailyScope>(readDailyScope)
  const pickDailyScope = (s: DailyScope) => {
    setDailyScope(s)
    writeDailyScope(s)
  }
  // `cost_type` của danh mục LÁ, đúng cột mà `fixedShareOf` ở budgetSort.ts đang dùng.
  const fixedCategoryIds = useMemo(
    () => new Set(categories.filter((c) => c.cost_type === 'fixed').map((c) => c.id)),
    [categories],
  )
  const excludeIds = dailyScope === 'flex' ? fixedCategoryIds : EMPTY_IDS

  const dailySpend = useMemo(
    () =>
      dailySpendSeries(
        monthTxs,
        activeRange.start,
        monthLastISO,
        currencyOf,
        base,
        rates ?? {},
        transferIds,
        excludeIds,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [monthTxs, activeRange.start, monthLastISO, accounts, base, rates, transferIds, excludeIds],
  )

  // Tổng CHƯA lọc, chỉ để in cạnh số đã lọc (B46.2). Lấy từ `expenseKpi` chứ không cộng
  // lại lần nữa: ô CHI THÁNG ngay trên thẻ này in đúng con số đó, và hai phép cộng song
  // song cho cùng một tháng là chỗ để chúng trôi khỏi nhau.
  const fullSpendTotal = expenseKpi.value

  // CÙNG KỲ NĂM NGOÁI — nguồn của chế độ "So năm ngoái" trong thẻ Chi từng ngày.
  //
  // Tải qua chính `useMonthTransactions` để "một tháng" của cả hai năm cùng đi qua
  // `getMonthRange` (tôn trọng ngày bắt đầu tháng tùy chỉnh) — tự cắt khoảng ngày ở đây
  // là chép tay định nghĩa "một tháng" lần thứ hai. react-query giữ cache theo khoảng
  // ngày nên lượt tải thêm này không lặp lại khi qua về giữa các tháng.
  //
  // Cùng `excludeIds` với chuỗi năm nay: công tắc "bỏ cố định" mà chỉ áp một bên thì
  // hai đường không còn so được với nhau.
  const priorYearKey = { year: activeMonthKey.year - 1, month: activeMonthKey.month }
  const { data: priorTxs = [], range: priorRange } = useMonthTransactions(priorYearKey)
  const priorLastISO = addDaysISO(priorRange.end, -1)
  const priorSpend = useMemo(
    () =>
      dailySpendSeries(
        priorTxs,
        priorRange.start,
        priorLastISO,
        currencyOf,
        base,
        rates ?? {},
        transferIds,
        excludeIds,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [priorTxs, priorRange.start, priorLastISO, accounts, base, rates, transferIds, excludeIds],
  )

  const cutoffISO = dangXemThangNay ? toISODate(new Date()) : monthLastISO

  // `txCount === 0` = năm ngoái KHÔNG ghi khoản nào trong tháng đó (sổ chỉ có từ 6/2025)
  // → không có gì để so, thẻ giấu hẳn công tắc thay vì vẽ một đường nằm bẹp ở 0.
  const yoy = useMemo(
    () =>
      priorSpend.txCount === 0
        ? null
        : cumulativeCompare(dailySpend.days, cutoffISO, priorSpend.days),
    [priorSpend, dailySpend.days, cutoffISO],
  )

  // Dải nhãn dưới biểu đồ (B44). `useTagSpend` dùng chung khoá truy vấn với `useTagBudgets`
  // ngay dưới — react-query gộp thành một lượt tải, không phải hai.
  const { data: tags = [], isPending: tagsLoading } = useTags()
  const { data: tagGroups = [], isPending: groupsLoading } = useTagGroups()
  const { data: tagSpendRows = [], isPending: tagSpendLoading } = useTagSpend(tags.length > 0)
  // `useTagSpend` bị tắt khi chưa có nhãn nào — lúc đó isPending luôn true nhưng không có
  // gì để chờ. Chưa chờ đúng chỗ thì dải nhãn in "¥X chưa gắn nhãn" bằng cả tổng chi.
  const tagsPending = tagsLoading || groupsLoading || (tags.length > 0 && tagSpendLoading)
  const tagBudgets = useTagBudgets(activeMonthKey)
  const dailyTagCells = useMemo(
    () =>
      dayTagCells({
        days: dailySpend.days,
        rows: tagSpendRows,
        tags,
        groups: tagGroups,
        currencyOf,
        base,
        rates: rates ?? {},
        transferIds,
        excludeCategoryIds: excludeIds,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dailySpend.days, tagSpendRows, tags, tagGroups, accounts, base, rates, transferIds, excludeIds],
  )

  const nameOf = (id: string) => categories.find((c) => c.id === id)?.name ?? 'Chưa rõ'

  const {
    netWorth,
    netWorthReliable,
    purposeGroups,
    isLoading: assetsLoading,
    loadFailed: assetsFailed,
  } = useAssetsData()
  const { data: snapshots = [] } = useNetWorthSnapshots()
  const netWorthSpark = useMemo(
    () =>
      [...snapshots]
        .sort((a, b) => (a.snapshot_on < b.snapshot_on ? -1 : 1))
        .slice(-BULLETIN_MONTHS)
        .map((s) => s.net_worth),
    [snapshots],
  )

  const accountOf = (id: string | null) => accounts.find((a) => a.id === id)
  const categoryOf = (id: string | null) => categories.find((c) => c.id === id)

  // Lần đầu mở, chưa có tài khoản nào (§4.8 / 20b). Kiểm bằng `accounts`, KHÔNG bằng
  // `purposeGroups`: nhóm rỗng bị lọc ở useAssetsData, nên người đã tạo tài khoản rồi
  // ẩn hết đi cũng ra mảng rỗng — mà họ đã qua bước này, bày lại lời chào là sai.
  // Chờ accounts VỀ rồi mới kết luận: mặc định `[]` của query đang chạy từng làm lời chào
  // lần đầu loé lên với người đã có hàng chục tài khoản.
  const laLanDau = accountsReady && accounts.length === 0

  // Việc cần làm — ĐỌC bộ luật sẵn có, không tính lại điều kiện nào. `actions` đã qua
  // trần 5 việc, đã xếp theo mức, đã lọc loại bị tắt ở Cài đặt và việc đã ẩn.
  const notif = useNotifications()

  // Độ tin cậy dữ liệu. Dùng lại dữ liệu trang này đã tải — không thêm một request nào.
  //
  // Phần "Lịch sử" (MỤC 15) đếm 12 tháng GẦN NHẤT từ dải đã tải (`rangeTxs` luôn phủ 25
  // tháng tới kỳ hiện tại), KHÔNG từ chuỗi 8 tháng của biểu đồ: đếm trên 8 thì câu "mới
  // 8/12 tháng có dữ liệu" không bao giờ hết, dù sổ đã ghi đủ hai năm.
  const lichSu = useMemo(
    () => historyCoverage(rangeTxs, currentMonthKey, monthStartDay),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rangeTxs, currentMonthKey.year, currentMonthKey.month, monthStartDay],
  )
  // null = chưa đủ dữ liệu để chấm — xem ReliabilityPanel.
  const doTinCay = useMemo(
    () =>
      !(seriesReady && accountsReady && categoriesReady) ? null : reliability({
        todayISO: toISODate(new Date()),
        recentTxs: seriesTxs,
        categories,
        // ĐÚNG tập tài khoản mà `reconcileStaleRule` xét, không phải `purposeGroups`.
        // Đã dựng sai một lần và đo ra ngay: purposeGroups chỉ có TÀI SẢN nên thẻ tín
        // dụng rơi ra ngoài — khối Việc cần làm ghi "7 tài khoản chưa đối chiếu" trong
        // khi khối Độ tin cậy ngay dưới ghi "6". Hai con số cho cùng một câu hỏi trên
        // cùng một màn là lỗi tệ hơn cả hai con số đều sai: người dùng thôi tin cả hai.
        accounts: accounts.filter(
          (a) => !a.is_archived && !a.is_hidden && a.include_in_totals,
        ),
        monthsWithData: lichSu.withData,
        missingMonths: lichSu.missing,
        // Giả định của Lifetime: chưa khai năm sinh là một giả định trống. Hai giả định
        // còn lại (lợi suất, kịch bản) thuộc màn Tương lai — PR 10 nối vào đây.
        blankAssumptions: profile?.birth_year ? 0 : 1,
      }),
    [seriesReady, accountsReady, categoriesReady, seriesTxs, categories, accounts, lichSu, profile?.birth_year],
  )

  // Chấm "chưa đối chiếu" cạnh từng dòng ở panel Tài khoản. CÙNG nguồn và CÙNG tập tài
  // khoản với `doTinCay` và chuông nhắc (`lastReconciledMap` + RECONCILE_STALE_DAYS) —
  // ba chỗ trên một màn nói về "tài khoản cũ" mà ba danh sách khác nhau thì người dùng
  // thôi tin cả ba. Không có mục trong map = chưa đối chiếu bao giờ → cũng là cũ.
  const staleIds = useMemo(() => {
    // Chưa có giao dịch để đọc mốc đối chiếu → chưa biết, KHÔNG phải "cũ hết": chấm cả
    // danh sách tài khoản là báo động giả trong vài giây đầu.
    if (!seriesReady || !categoriesReady) return EMPTY_IDS
    const cutoff = addDaysISO(todayISO, -RECONCILE_STALE_DAYS)
    const lanCuoi = lastReconciledMap(
      accounts.filter((a) => !a.is_archived && !a.is_hidden && a.include_in_totals),
      seriesTxs,
      categories,
    )
    const out = new Set<string>()
    for (const a of accounts) {
      if (a.is_archived || a.is_hidden || !a.include_in_totals) continue
      const ngay = lanCuoi.get(a.id)
      if (!ngay || ngay < cutoff) out.add(a.id)
    }
    return out
  }, [seriesReady, categoriesReady, accounts, seriesTxs, categories, todayISO])

  // Chưa có tài khoản → MỘT việc duy nhất, không phải sáu khối rỗng (§4.8 / 20b).
  // Thoát sớm hẳn chứ không lồng điều kiện vào từng khối: mỗi khối tự lo trạng thái
  // rỗng của nó là đúng khi thiếu MỘT loại dữ liệu, còn đây là chưa có gì cả.
  if (laLanDau) {
    return (
      <div className="flex flex-col gap-2.5 p-3 lg:p-4">
        <PageHeader title="Bản tin" flush mobileOnly />
        <FirstRunPanel hasBirthYear={profile?.birth_year != null} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2.5 p-3 lg:p-4">
      {/* Tiêu đề màn cho MOBILE (top bar chỉ có từ lg). Bản vẽ 17a: mỗi màn mobile tự
          mang tiêu đề + một dòng meta bên phải.
          Bốn nút bên phải là ĐƯỜNG VÀO MOBILE của bốn màn không có tab (§3 chốt bốn tab
          + "+"; xem NAV_ITEMS). Đặt ở Bản tin vì đây là màn mở đầu tiên — bỏ khỏi thanh
          tab mà không mở lối khác thì trên mobile bốn màn đó biến mất hẳn. */}
      <PageHeader title="Bản tin" flush mobileOnly>
        <p aria-live="polite" className="ml-auto font-mono text-sm text-fg-muted">
          {formatMonthLabel(activeMonthKey)}
        </p>
        {/* iconButtonClass() chứ không viết tay: <Link> là thẻ <a> nên không dùng được
            <IconButton>, và đây đúng là lý do hàm đó tồn tại.

            Đầu tư có mặt ở đây dù trang Tài sản cũng có nút vào nó: nút bên đó chỉ hiện
            khi `hasPortfolio`, nên người chưa có tài khoản đầu tư nào thì trên mobile
            không còn lối nào. tests/navMobile.test.ts canh đúng chỗ này.

            Tương lai (console dòng thời gian) CẦN 1280px nên bản thân màn đó tự chặn ở
            mobile (xem TuongLaiPage.tsx) — nút này chỉ để người dùng TÌM RA nó tồn tại,
            không hứa nó dùng được ở đây.

            MỘT nhóm <span>, không bốn ô rời trên hàng flex: ở Cỡ chữ 1,25× tại 375px cả
            hàng vượt 345px và `flex-wrap` xuống dòng — ô rời thì nó cắt Ở GIỮA nhóm (một
            phần trên, một phần dưới, đọc thành lỗi). Bọc lại thì cả bốn xuống cùng nhau.
            Đo được: 1× một dòng, 1,25× hai dòng, không tràn ngang ở cả hai. */}
        <span className="flex shrink-0 items-center gap-1">
          <Link to="/invest" aria-label="Đầu tư" className={iconButtonClass('ghost')}>
            <LineChart className="h-5 w-5" strokeWidth={1.6} />
          </Link>
          <Link to="/tuong-lai" aria-label="Tương lai" className={iconButtonClass('ghost')}>
            <Milestone className="h-5 w-5" strokeWidth={1.6} />
          </Link>
          <Link to="/reports" aria-label="Báo cáo" className={iconButtonClass('ghost')}>
            <ChartColumn className="h-5 w-5" strokeWidth={1.6} />
          </Link>
          <Link to="/settings" aria-label="Cài đặt" className={iconButtonClass('ghost')}>
            <Settings className="h-5 w-5" strokeWidth={1.6} />
          </Link>
        </span>
      </PageHeader>

      {/* Việc cần làm phải đứng ĐẦU ở mobile (như trước redesign — nó cao gần một màn
          và là thứ cần hành động) nhưng lại thuộc ĐỈNH CỘT PHỤ ở desktop. Đổi chỗ theo
          breakpoint bằng HAI LẦN BÀY (`xl:hidden` ở đây / `hidden xl:block` trong cột
          phụ), KHÔNG bằng order-*: `display:none` rút hẳn bản kia khỏi cây a11y, nên ở
          mọi bề rộng chỉ có đúng một bản — thứ tự đọc và thứ tự tiêu điểm vẫn đi cùng
          thứ tự nhìn (WCAG 2.4.3), đúng luật đã chốt ở BudgetView. Giá phải trả là một
          lần render thừa; trạng thái đóng/mở của hai bản độc lập nhau nhưng không bao
          giờ cùng hiện nên không lệch được trước mắt ai. */}
      <NotificationBoundary>
        <TodoPanel items={notif.actions} onDismiss={notif.dismiss} className="xl:hidden" />
      </NotificationBoundary>

      {/* Bố cục bản vẽ redesign (2026-09-05): từ xl là HAI CỘT — nội dung chính co giãn,
          cột phụ 23.75rem (380px của bản vẽ, quy về rem để Cài đặt → Cỡ chữ còn co giãn
          được). Dưới xl cả hai cột xếp dọc theo đúng THỨ TỰ DOM — không order-*: thứ tự
          đọc và thứ tự tiêu điểm phải đi cùng nhau (WCAG 2.4.3), cùng luật đã chốt ở
          BudgetView. */}
      {/* Nguồn tải HỎNG hẳn: một dòng cho cả trang, có nút thử lại. Các ô bên dưới đã đổi
          "Đang tính…" thành "Chưa tải được", nên đây là chỗ DUY NHẤT nói lý do và lối ra. */}
      {(seriesFailed || monthFailed) && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border border-state-warn-border bg-state-warn-bg px-3 py-2 text-sm text-state-warn-fg"
        >
          <span className="min-w-0 flex-1">
            {seriesFailed && monthFailed
              ? 'Không tải được giao dịch tháng này và các tháng trước — thử tải lại.'
              : seriesFailed
                ? 'Không tải được dữ liệu các tháng trước — thử tải lại.'
                : 'Không tải được giao dịch tháng này — thử tải lại.'}
          </span>
          <ActionButton
            onClick={() => {
              if (seriesFailed) void rangeQ.refetch()
              if (monthFailed) void monthQ.refetch()
            }}
          >
            Thử lại
          </ActionButton>
        </div>
      )}

      <div className="grid items-start gap-2.5 xl:grid-cols-[minmax(0,1fr)_23.75rem]">
        {/* ===== CỘT CHÍNH ===== */}
        <div className="flex min-w-0 flex-col gap-2.5">
          {/* Khối Hôm nay — mở màn bằng câu người ta mở app ra để hỏi. Nó mang luôn câu
              kết luận của cả màn (ConclusionLine, §5.0 / R7 — không đi qua VerdictNote)
              ở góc phải. Chỉ dựng được khi đang xem đúng kỳ hiện tại; xem tháng khác thì
              còn lại một mình câu kết luận. */}
          {luong ? (
            <HomNayPanel
              data={luong}
              base={base}
              approx={report?.hasMissingRate ?? false}
              monthStartDay={monthStartDay}
              todayISO={todayISO}
              kyBatDauISO={kyHienTai.start}
              ngayLuongISO={kyHienTai.end}
              daTieu={report?.totalSpent ?? 0}
              hanMuc={report?.totalBudgeted ?? 0}
              headline={headline}
              headlinePending={headlinePending}
              headlineFailed={headlineFailed}
            />
          ) : headlinePending ? (
            <p className="text-sm text-fg-muted">
              {headlineFailed ? 'Chưa tính được kết luận tháng.' : 'Đang tính kết luận tháng…'}
            </p>
          ) : (
            headline && (
              <ConclusionLine tone={headline.tone} short={headline.short}>
                {headline.text}
              </ConclusionLine>
            )
          )}

          <KpiRow
            base={base}
            income={incomeKpi}
            expense={expenseKpi}
            keptPct={keptPct}
            keptAmount={incomeKpi.value - expenseKpi.value}
            keptSpark={keptSpark}
            netWorth={netWorthReliable ? netWorth : null}
            netWorthSpark={netWorthSpark}
            approx={series.hasMissingRate}
            pending={!seriesReady}
            failed={seriesFailed}
            netWorthPending={assetsLoading}
            keptScope={rateScope}
          />

          {/* Thẻ Chi tiêu — GỘP dải 8 tháng với chi từng ngày trong một khung, vì hai
              hình là một cặp thu-phóng: trên mỗi cột một tháng, dưới mỗi cột một ngày
              của tháng đang chọn — bấm một cột ở trên là phần dưới đổi theo. Chiếm hết
              bề ngang cột chính: 31 cột ngày trong một panel hẹp là nhãn trục đè nhau. */}
          <DailySpendPanel
            points={series.points}
            activeMonth={activeMonthKey}
            onPickMonth={setMonthKey}
            series={dailySpend}
            fullTotal={fullSpendTotal}
            monthBudget={
              // Chờ `budgetLoading` xong mới đưa số xuống — cùng lý do đã ghi ở `luong`:
              // `report` về trước budgets thì `totalBudgeted` là 0, và đường hạn mức nháy
              // mất một nhịp ở mọi lần mở app của người ĐÃ đặt hạn mức.
              report && !budgetLoading ? report.totalBudgeted : 0
            }
            cells={dailyTagCells}
            tagLines={tagBudgets.lines}
            compare={seriesReady ? expenseCmp : null}
            cutoffISO={cutoffISO}
            yoy={yoy}
            yoyApprox={priorSpend.hasMissingRate}
            priorLabel={formatMonthLabel(priorYearKey)}
            base={base}
            categoryOf={categoryOf}
            approx={dailySpend.hasMissingRate || dailyTagCells.hasMissingRate}
            scope={dailyScope}
            onScope={pickDailyScope}
            monthPending={!monthReady}
            seriesPending={!seriesReady}
            tagsPending={tagsPending}
            monthFailed={monthFailed}
            seriesFailed={seriesFailed}
          />

          <Card elevation="panel" padding="panel" as="section" className="min-w-0">
            <div className="flex items-baseline justify-between gap-2">
              <SectionTitle>Giao dịch gần đây</SectionTitle>
              <Link to="/so" className="-my-2 py-2 text-2xs font-medium text-fg-accent hover:underline">
                Mở Sổ →
              </Link>
            </div>
            {!monthReady ? (
              <p className="mt-3 text-sm text-fg-muted">
                {monthFailed ? 'Chưa tải được giao dịch tháng này.' : 'Đang tải…'}
              </p>
            ) : recent.length === 0 ? (
              <p className="mt-3 text-sm text-fg-muted">
                Chưa ghi giao dịch nào {formatMonthLabel(activeMonthKey)}.{' '}
                <Link to="/entry" className="font-medium text-fg-accent hover:underline">
                  Ghi một khoản
                </Link>
              </p>
            ) : (
              <ul className="mt-1 divide-y divide-border-subtle">
                {recent.map((t) => (
                  <li key={t.id}>
                    {/* Dùng lại đúng dòng của Sổ: hai màn vẽ cùng một giao dịch thì không
                        được lệch cách đọc dấu, màu hay chip nhãn. */}
                    <TransactionItem
                      tx={t}
                      categoryOf={categoryOf}
                      accountOf={accountOf}
                      base={base}
                      onClick={() => setEditing(t)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* ===== CỘT PHỤ ===== */}
        <div className="flex min-w-0 flex-col gap-2.5">
          {/* Việc cần làm đứng ĐẦU cột phụ, MỞ SẴN (xem TodoPanel) — bản DESKTOP của
              khối `xl:hidden` trên đầu trang, xem chú thích ở đó. Nó THAY banner nhắc
              nhở cũ, không đứng cạnh: hai chỗ cùng nhắc một việc là đúng cái 16a đi dẹp.
              NotificationBoundary vẫn bọc: bộ luật đọc gần hết bảng dữ liệu, một query
              hỏng không được kéo sập cả trang chủ. */}
          <NotificationBoundary>
            <TodoPanel
              items={notif.actions}
              onDismiss={notif.dismiss}
              className="hidden xl:block"
            />
          </NotificationBoundary>

          <BudgetPanel report={report} isLoading={budgetLoading} base={base} nameOf={nameOf} />

          {/* Thu nhập & nếp chi (drift.ts): tự ẩn khi không có gì đáng nói — đứng sau
              Ngân sách vì cùng nói về NẾP, khác Ngân sách ở chỗ nhìn nhiều tháng chứ
              không phải tháng này. Nhận `rangeTxs` (dải HỢP, đủ 25 tháng nó cần) thay vì
              tự tải — xem chú thích ở `range`. Bọc NotificationBoundary như cũ. */}
          <NotificationBoundary>
            <DriftPanel txs={rangeTxs} />
          </NotificationBoundary>

          <AccountsPanel
            groups={purposeGroups}
            netWorth={netWorthReliable ? netWorth : null}
            base={base}
            staleIds={staleIds}
            pending={assetsLoading}
            failed={assetsFailed}
          />

          {/* Khối Quyền lợi (spec 2026-09-03): tình trạng ba khoản năm nay — TÌNH TRẠNG,
              không phải việc; việc đã nằm ở khối trên cùng. Bọc NotificationBoundary
              cùng lý do. */}
          <NotificationBoundary>
            <QuyenLoiPanel todayISO={todayISO} />
          </NotificationBoundary>

          {/* Độ tin cậy dữ liệu (§4.9). Đứng CUỐI vì nó nói về cái thước, không phải về
              tiền: đọc sau khi đã xem xong các con số thì mới có nghĩa. */}
          <ReliabilityPanel data={doTinCay} failed={seriesFailed} />
        </div>
      </div>

      {editing && (
        <EditTransactionSheet tx={editing} onClose={() => setEditing(null)} />
      )}
    </div>
  )
}
