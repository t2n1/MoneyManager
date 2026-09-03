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
import { ChartColumn, Settings } from 'lucide-react'
import { Card, PageHeader, SectionTitle, iconButtonClass } from '../../components/ui'
import { ConclusionLine } from '../../components/VerdictNote'
import { useMonthKey } from '../../hooks/useMonthKey'
import {
  useAccounts,
  useBudgetReport,
  useCategories,
  useMonthTransactions,
  useNetWorthSnapshots,
  useProfile,
  useRangeTransactions,
  useRates,
  useTagGroups,
  useTags,
  useTagSpend,
  useTransferCategoryIds,
} from '../../hooks/queries'
import {
  addDaysISO,
  addMonths,
  formatMonthLabel,
  getMonthRange,
  monthKeyForDate,
  toISODate,
} from '../../lib/dates'
import type { CurrencyCode } from '../../lib/money'
import { NotificationBoundary } from '../notifications/NotificationBoundary'
import { useNotifications } from '../notifications/useNotifications'
import { reliability } from '../notifications/reliability'
import { monthExpenseCompare, monthlySeries } from '../reports/aggregate'
import { dailySpendSeries } from '../reports/dailySpike'
import { dayTagCells } from '../reports/dayTagCells'
import { headlineOf } from '../reports/headline'
import { useMonthPace } from '../reports/monthPace'
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
import { QuyenLoiPanel } from './QuyenLoiPanel'
import { ReliabilityPanel } from './ReliabilityPanel'
import { TodoPanel } from './TodoPanel'
import { BudgetPanel } from './BudgetPanel'
import { CashflowPanel } from './CashflowPanel'
import { DailySpendPanel, readDailyScope, writeDailyScope, type DailyScope } from './DailySpendPanel'
import { KpiRow } from './KpiRow'
import { PaydayStrip } from './PaydayStrip'
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
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()
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
  const range = useMemo(
    () => ({
      start: getMonthRange(months[0], monthStartDay).start,
      end: getMonthRange(months[BULLETIN_MONTHS - 1], monthStartDay).end,
    }),
    [months, monthStartDay],
  )
  const { data: rangeTxs = [] } = useRangeTransactions(range)
  const series = useMemo(
    () => monthlySeries(rangeTxs, months, monthStartDay, currencyOf, base, rates ?? {}, transferIds),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rangeTxs, months, monthStartDay, accounts, base, rates],
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
        rangeTxs,
        activeMonthKey,
        monthStartDay,
        toISODate(new Date()),
        currencyOf,
        base,
        rates ?? {},
        transferIds,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rangeTxs, activeMonthKey, monthStartDay, accounts, base, rates, transferIds],
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
  const luong =
    dangXemThangNay && report && !budgetLoading
      ? toiNgayLuong({
          todayISO: toISODate(new Date()),
          kyBatDauISO: kyHienTai.start,
          ngayLuongISO: kyHienTai.end,
          hanMuc: report.totalBudgeted,
          daTieu: report.totalSpent,
        })
      : null

  // Câu kết luận đứng đầu màn. Dùng chung `headlineOf` với Báo cáo: hai màn nói cùng một
  // kết luận thì phải nói bằng đúng một câu, không phải hai bản chép tay.
  // Cùng hook dự báo mà tab Ngân sách và Báo cáo dùng — ba màn phải nói CÙNG một con số
  // dự báo, không phải ba phép tính song song (xem chú thích ở ReportsPage).
  const bulletinPace = useMonthPace(activeMonthKey)
  // Cùng mốc với KpiRow ("Giữ lại") — lấy từ khoản Để dành của phương pháp đang chọn,
  // không phải hằng số 20% cứng.
  const savingsShare = savingsTargetShare(resolveMethod(profile))
  const headline = headlineOf({
    income: incomeKpi.value,
    expense: expenseKpi.value,
    priorExpense: expenseKpi.prev,
    periodNoun: 'tháng này',
    pace:
      bulletinPace.forecast && report
        ? { forecast: bulletinPace.forecast.projected, budgeted: report.totalBudgeted }
        : null,
    savingsTargetShare: savingsShare,
  })
  // Lấy % từ chính `headline` chứ không gọi `savingsRate` rồi tự nhân 100: savingsRate
  // trả về TỶ LỆ (0,685), còn ô KPI cần PHẦN TRĂM đã làm tròn (69) — và quan trọng hơn,
  // ô KPI với câu kết luận ngay trên nó phải là cùng một con số, không phải hai phép
  // làm tròn song song.
  const keptPct = headline?.ratePct ?? null

  // Một `useMonthTransactions` cho CẢ hai chỗ cần giao dịch của tháng đang xem: dòng
  // "Giao dịch gần đây" và đường "Chi từng ngày". Gọi hai lần thì react-query vẫn trả
  // cùng một cache, nhưng hai biến cùng tên trong một component là chỗ để lệch nhau.
  const { data: monthTxs = [], range: activeRange } = useMonthTransactions(activeMonthKey)
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

  // Dải nhãn dưới biểu đồ (B44). `useTagSpend` dùng chung khoá truy vấn với `useTagBudgets`
  // ngay dưới — react-query gộp thành một lượt tải, không phải hai.
  const { data: tags = [] } = useTags()
  const { data: tagGroups = [] } = useTagGroups()
  const { data: tagSpendRows = [] } = useTagSpend(tags.length > 0)
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

  const { netWorth, netWorthReliable, purposeGroups } = useAssetsData()
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
  const laLanDau = accounts.length === 0

  // Việc cần làm — ĐỌC bộ luật sẵn có, không tính lại điều kiện nào. `actions` đã qua
  // trần 5 việc, đã xếp theo mức, đã lọc loại bị tắt ở Cài đặt và việc đã ẩn.
  const notif = useNotifications()

  // Độ tin cậy dữ liệu. Dùng lại chính chuỗi 8 tháng và danh sách tài khoản trang này
  // đã tải — không thêm một request nào.
  const doTinCay = useMemo(
    () =>
      reliability({
        todayISO: toISODate(new Date()),
        recentTxs: rangeTxs,
        categories,
        // ĐÚNG tập tài khoản mà `reconcileStaleRule` xét, không phải `purposeGroups`.
        // Đã dựng sai một lần và đo ra ngay: purposeGroups chỉ có TÀI SẢN nên thẻ tín
        // dụng rơi ra ngoài — khối Việc cần làm ghi "7 tài khoản chưa đối chiếu" trong
        // khi khối Độ tin cậy ngay dưới ghi "6". Hai con số cho cùng một câu hỏi trên
        // cùng một màn là lỗi tệ hơn cả hai con số đều sai: người dùng thôi tin cả hai.
        accounts: accounts.filter(
          (a) => !a.is_archived && !a.is_hidden && a.include_in_totals,
        ),
        monthsWithData: series.points.filter((p) => p.income > 0 || p.expense > 0).length,
        // Giả định của Lifetime: chưa khai năm sinh là một giả định trống. Hai giả định
        // còn lại (lợi suất, kịch bản) thuộc màn Tương lai — PR 10 nối vào đây.
        blankAssumptions: profile?.birth_year ? 0 : 1,
      }),
    [rangeTxs, categories, accounts, series.points, profile?.birth_year],
  )

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
          Hai nút bên phải là ĐƯỜNG VÀO MOBILE của hai màn không có tab (§3 chốt bốn tab
          + "+"; xem NAV_ITEMS). Đặt ở Bản tin vì đây là màn mở đầu tiên — bỏ khỏi thanh
          tab mà không mở lối khác thì trên mobile hai màn đó biến mất hẳn. */}
      <PageHeader title="Bản tin" flush mobileOnly>
        <p aria-live="polite" className="ml-auto font-mono text-sm text-fg-muted">
          {formatMonthLabel(activeMonthKey)}
        </p>
        {/* iconButtonClass() chứ không viết tay: <Link> là thẻ <a> nên không dùng được
            <IconButton>, và đây đúng là lý do hàm đó tồn tại. */}
        <Link to="/reports" aria-label="Báo cáo" className={iconButtonClass('ghost')}>
          <ChartColumn className="h-5 w-5" strokeWidth={1.6} />
        </Link>
        <Link to="/settings" aria-label="Cài đặt" className={iconButtonClass('ghost')}>
          <Settings className="h-5 w-5" strokeWidth={1.6} />
        </Link>
      </PageHeader>

      {/* Khối 1 — Việc cần làm (§4.9). Nó THAY banner nhắc nhở cũ, không đứng cạnh: hai
          chỗ cùng nhắc một việc là đúng cái 16a đi dẹp.
          NotificationBoundary vẫn bọc: bộ luật đọc gần hết bảng dữ liệu, một query hỏng
          không được kéo sập cả trang chủ.

          ĐỨNG SAU tiêu đề mobile, không đứng đầu trang. Trên desktop khác biệt này bằng
          không (tiêu đề là <h1 class="sr-only"> + top bar), nhưng dưới lg thì khối này
          cao gần một màn: đặt nó trước thì chữ "Bản tin" rơi xuống giữa trang, sau một
          tấm thẻ — người mở app không đọc được mình đang ở màn nào cho tới khi cuộn.
          Đổi bằng THỨ TỰ DOM chứ không order-*: thứ tự đọc và thứ tự tiêu điểm phải đi
          cùng nhau (WCAG 2.4.3), cùng luật đã chốt ở BudgetView. */}
      <NotificationBoundary>
        <TodoPanel items={notif.actions} onDismiss={notif.dismiss} />
      </NotificationBoundary>

      {/* Khối Quyền lợi (spec 2026-09-03): tình trạng ba khoản năm nay. Đứng sau Việc cần làm
          vì nó là TÌNH TRẠNG, còn việc đã nằm ở trên. Bọc NotificationBoundary cùng lý do:
          query hỏng không được kéo sập trang chủ. */}
      <NotificationBoundary>
        <QuyenLoiPanel todayISO={todayISO} />
      </NotificationBoundary>

      {/* ConclusionLine, KHÔNG VerdictNote (§5.0 / R7): đây là kết luận của cả màn, và
          Gọn là chế độ mặc định — đưa nó qua VerdictNote thì mặc định người dùng chỉ
          thấy một cái chip thay cho kết luận. */}
      {headline && (
        <ConclusionLine tone={headline.tone} short={headline.short}>
          {headline.text}
        </ConclusionLine>
      )}

      {/* ĐỨNG TRƯỚC bốn ô, không phải sau. §14: kết luận trước, bằng chứng sau — bốn ô
          là tổng của kỳ (bằng chứng), câu này là kết luận về hôm nay.

          Từng đặt SAU bốn ô với lập luận ngược lại ("bốn ô nói kỳ này đã đi tới đâu,
          dòng này nói từ đây tới ngày lương thì sao"). Lập luận đó chỉ đứng vững khi câu
          này còn là một dòng 0.8125rem; từ lúc nó thành chữ LỚN NHẤT màn thì thứ tự cũ
          bắt thứ to nhất nằm thứ ba — cỡ chữ nói một đằng, thứ tự đọc nói một nẻo.

          Vẫn đứng SAU ConclusionLine: §5.0 chốt câu kết luận đứng đầu màn, và hai câu
          này khác kỳ hạn — trên nói cả tháng đã ra sao, dưới nói hôm nay tiêu được bao
          nhiêu. Đổi bằng THỨ TỰ DOM chứ không order-*: thứ tự đọc và thứ tự tiêu điểm
          phải đi cùng nhau (WCAG 2.4.3), cùng luật đã chốt ở TodoPanel ngay trên. */}
      {luong && (
        <PaydayStrip
          data={luong}
          base={base}
          approx={report?.hasMissingRate ?? false}
          monthStartDay={monthStartDay}
        />
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
      />

      {/* Cặp panel: xếp ngang từ xl, dọc ở dưới (§6). `flex-wrap` + `flex-1` với
          `min-w-0` là công thức chống tràn đã chốt ở §6. */}
      <div className="flex flex-wrap gap-2.5">
        <CashflowPanel
          points={series.points}
          active={activeMonthKey}
          base={base}
          onPick={setMonthKey}
          approx={series.hasMissingRate}
        />
        <BudgetPanel report={report} isLoading={budgetLoading} base={base} nameOf={nameOf} />
      </div>

      {/* Chi từng ngày — NGAY DƯỚI "Dòng tiền 8 tháng", và chiếm HẾT chiều ngang.
          Đứng dưới thẻ kia vì hai thẻ là một cặp thu-phóng: trên mỗi cột một tháng, dưới
          mỗi điểm một ngày của tháng đang chọn — bấm một cột ở trên là đường dưới đổi theo.
          Không nhét vào cặp hai cột: 31 điểm ngày trong một panel ~380px (bề rộng của
          panel ở xl) là nhãn trục đè lên nhau. */}
      <DailySpendPanel
        series={dailySpend}
        fullTotal={fullSpendTotal}
        cells={dailyTagCells}
        tagLines={tagBudgets.lines}
        compare={expenseCmp}
        cutoffISO={dangXemThangNay ? toISODate(new Date()) : monthLastISO}
        base={base}
        categoryOf={categoryOf}
        approx={dailySpend.hasMissingRate || dailyTagCells.hasMissingRate}
        scope={dailyScope}
        onScope={pickDailyScope}
      />

      <div className="flex flex-wrap gap-2.5">
        <Card
          elevation="panel"
          padding="panel"
          as="section"
          className="min-w-0 flex-1 basis-full xl:basis-0"
        >
          <div className="flex items-baseline justify-between gap-2">
            <SectionTitle>Giao dịch gần đây</SectionTitle>
            <Link to="/so" className="-my-2 py-2 text-2xs font-medium text-fg-accent hover:underline">
              Mở Sổ →
            </Link>
          </div>
          {recent.length === 0 ? (
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

        <AccountsPanel groups={purposeGroups} />
      </div>

      {/* Khối 5 — Độ tin cậy dữ liệu (§4.9). Đứng CUỐI vì nó nói về cái thước, không
          phải về tiền: đọc sau khi đã xem xong các con số thì mới có nghĩa. */}
      <ReliabilityPanel data={doTinCay} />

      {editing && (
        <EditTransactionSheet tx={editing} onClose={() => setEditing(null)} />
      )}
    </div>
  )
}
