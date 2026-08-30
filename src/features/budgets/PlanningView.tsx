// Mặt LẬP KẾ HOẠCH của tab Ngân sách — hiện khi tháng đang xem CHƯA BẮT ĐẦU.
//
// Bốn khối thay cho chín khối của mặt theo dõi. Cần để ý, nhịp chi, dự báo cuối tháng,
// dòng tiền tích luỹ, lịch nhiệt và cơ cấu chi THỰC TẾ đều biến mất — tháng chưa xảy
// ra thì chúng rỗng, hiện ra chỉ tổ chiếm chỗ của phần đang thực sự làm việc.
//
// ---- Panel hạn mức: ba tầng, không phải một danh sách phẳng (B30–B35) ---------------
//
// Bản trước bày 29 dòng CÙNG MỘT TRỌNG LƯỢNG, sắp giảm dần theo tiền, mỗi dòng một câu
// phụ `TB 6 tháng ¥… · cao nhất ¥…`. Bốn hệ quả đo được trên dữ liệu thật tháng 8/2026:
//
//   1. 7 dòng cần quyết nằm lẫn giữa 22 dòng đã xong, ở vị trí 4, 5, 11, 13, 14, 16, 18.
//      Nút "Dùng hết gợi ý (7)" biết chính xác chúng là ai; màn hình không đánh dấu.
//   2. "Dùng hết gợi ý" là nút bấm mù: nó cộng ¥47,070 mà không nói con số đó đẩy Để dành
//      từ 22% xuống 5,8% — thông tin duy nhất khiến người ta bấm hay không bấm.
//   3. Danh sách phẳng trong khi kế hoạch có NHÓM: cột trái báo lỗi và đặt trần theo trục,
//      cột phải không có khái niệm trục nào, nên người đọc phải tự dịch giữa hai cột.
//   4. `TB · cao nhất` in 29 lần cho con số chỉ đọc MỘT lần lúc đặt hạn mức, và 12 dòng
//      dưới ¥1,000 chiếm ~40% chiều cao panel cho 1,4% số tiền.
//
// Nên panel giờ là: hệ quả (chiếu) → việc cần quyết → số đã đặt xếp theo nhóm, đuôi gấp.
// Phần TÍNH nằm ở `planProjection.ts` và `planGroups.ts`; ở đây chỉ có việc bày ra.

import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronRight, Pencil, PiggyBank, Target, TriangleAlert } from 'lucide-react'
import { ActionButton, Card, Money, SectionTitle, SegmentedControl } from '../../components/ui'
import { ConclusionLine } from '../../components/VerdictNote'
import { Guide } from '../../components/Guide'
import {
  useAccountBalances,
  useCategories,
  useCopyBudgetsFromPreviousMonth,
  useRates,
  useSavingsGoals,
  useUpsertBudget,
} from '../../hooks/queries'
import { formatMonthLabel, monthKeyString, type MonthKey } from '../../lib/dates'
import { formatMoney } from '../../lib/money'
import { convertToBase } from '../../lib/rates'
import { confirmDialog, showToast } from '../../lib/dialog'
import { monthlyNeeded } from '../assets/goals'
import { TagPlanBlock } from '../tags/TagPlanBlock'
import { AXIS_LABEL, BASELINE_MONTHS, shareLabel, type AxisKey } from './axisTargets'
import { axisSuggestions, sliderScale } from './axisSuggest'
import { LimitSlider, type LimitSliderProps } from './LimitSlider'
import { PlanStickyBar } from './PlanStickyBar'
import { budgetHint } from './budgetHint'
import { capMismatchNotice, nameList } from './capOverflow'
import { LimitSparkline } from './LimitSparkline'
import { TAIL_LIMIT, type PlanBlock, type PlanRow } from './planGroups'
import { distributeHeadroom } from './planProjection'
import { planVerdict } from './planVerdict'
import { isOffAverage } from './suggest'
import { BudgetEditSheet } from './BudgetEditSheet'
import { ExpectedIncomeSheet } from './ExpectedIncomeSheet'
import { SUGGEST_MONTHS, usePlanning, type PlanDraft } from './usePlanning'
import { SplitGroupSheet } from './SplitGroupSheet'
import { useSyncedBudget } from './useSyncedBudget'
import { STATUS_FILL } from '../../components/ui/statusColors'

/** Chế độ xem panel hạn mức. Sở thích XEM nên ở máy (localStorage), không vào hồ sơ. */
type LimitViewMode = 'list' | 'table'
const VIEW_KEY = 'budget.planView'
const VIEW_OPTIONS = [
  { value: 'list' as const, label: 'Danh sách' },
  { value: 'table' as const, label: 'Bảng' },
]

function readViewMode(): LimitViewMode {
  try {
    return localStorage.getItem(VIEW_KEY) === 'table' ? 'table' : 'list'
  } catch {
    return 'list'
  }
}

/**
 * Bề rộng cột của chế độ Bảng — rem để co theo Cỡ chữ (§13).
 *
 * Điện thoại chỉ đủ chỗ cho BỐN cột, và hai cột phải giữ là `TB` với `Hạn mức`: cả chế độ
 * bảng tồn tại để so đúng hai con số đó thành một lần quét dọc. `Cao nhất` và nhịp 6 tháng
 * là hai cột bổ nghĩa — ẩn chúng dưới `sm` chứ không ẩn `Hạn mức`.
 */
const TABLE_COLS =
  'grid grid-cols-[1.25rem_minmax(0,1fr)_4.25rem_5rem] items-center gap-2 sm:grid-cols-[1.25rem_minmax(0,1fr)_4.25rem_4.25rem_3rem_5rem]'

export function PlanningView({ monthKey }: { monthKey: MonthKey }) {
  const monthKeyStr = monthKeyString(monthKey)
  const monthLabel = formatMonthLabel(monthKey)
  const { base, rates } = useRates()
  const { data: categories = [] } = useCategories()
  const { data: goals = [] } = useSavingsGoals()
  const { data: balances = [] } = useAccountBalances()
  /**
   * Thanh trượt đang mở. Chụp lại LÚC MỞ, không tính lại mỗi lần render:
   *
   * · `suggest` — vạch gợi ý phải ĐỨNG YÊN trong lúc kéo. Tính lại theo số đang kéo thì
   *   trục co lại làm vạch dịch, người dùng kéo tới đâu vạch chạy tới đó.
   * · `shareBefore` — để in "51% → 45%". Chụp trước khi có `draft` nên nó là số thật.
   * · `committed` — số đã ghi xuống máy chủ gần nhất, để nhả tay mà không đổi gì thì
   *   không ghi, và ghi lỗi thì biết bật về đâu. KHÔNG đọc lại từ `budgetedByCat`: cái đó
   *   đã bị `draft` vá nên nó là số đang kéo, không phải số đã lưu.
   * · `max`/`step` — THANG của thanh. Cũng phải đứng yên: tính từ số đang kéo thì đẩy núm
   *   tới mép làm thang nới ra, núm giật về giữa, và còn chỗ đẩy tiếp — một lần kéo liền
   *   tay đưa ¥20.000 lên ¥1.000.000. Xem `LimitSliderProps.max`.
   */
  const [slider, setSlider] = useState<{
    id: string
    suggest: number | null
    axisKey: AxisKey | null
    shareBefore: number | null
    committed: number
    max: number
    step: number
  } | null>(null)
  const [draft, setDraft] = useState<PlanDraft | null>(null)
  /**
   * MỘT bản phân bổ vạch gợi ý, đóng băng cho cả lượt — không tính lại mỗi lần mở một dòng.
   *
   * Vì sao phải đóng băng: vạch là "phần theo tỷ lệ của dòng này trong trần trục", nên tính
   * lại theo tình trạng hiện tại thì sau khi một dòng đã co, dòng còn lại chỉ cần co ít hơn.
   * Đo trên ca thật (Linh hoạt ¥205.000 / trần ¥120.100, 5 dòng): kéo cả 5 dòng về đúng vạch
   * mà tổng vẫn còn ¥141.942 — vượt ¥21.842. Người dùng làm đúng từng thứ app bảo, xong app
   * vẫn báo vượt. Một bản phân bổ đóng băng thì 5 vạch cộng lại bằng ĐÚNG ¥120.100.
   *
   * `null` = chưa dựng, hoặc người dùng vừa đi lệch khỏi bản cũ nên phải lập lại (xem
   * `commitLimit`): bản cũ chỉ cộng đúng trần khi mọi dòng còn theo nó.
   */
  const [marks, setMarks] = useState<Map<string, number> | null>(null)
  const data = usePlanning(monthKey, draft)
  const copy = useCopyBudgetsFromPreviousMonth()
  const upsert = useUpsertBudget()
  // Luật "cha = tổng con" — xem `useSyncedBudget`. Bốn chỗ ghi hạn mức của màn này đều
  // phải đi qua nó, bỏ sót một chỗ là luật thủng đúng ở chỗ đó.
  const { syncAfterWrite, openSplit, splitSheetProps } = useSyncedBudget(monthKeyStr)
  const { summary, projection, groups } = data

  const [editing, setEditing] = useState<string | null>(null)
  const [incomeOpen, setIncomeOpen] = useState(false)
  const [viewMode, setViewMode] = useState<LimitViewMode>(readViewMode)
  /** Đuôi dài đang mở, theo khối. Mặc định ĐÓNG, và ghi nhớ theo khối (B34.2). */
  const [tailOpen, setTailOpen] = useState<Set<string>>(new Set())
  /** Trần nhóm đang xổ ra mốc con. */
  const [groupOpen, setGroupOpen] = useState<Set<string>>(new Set())

  const catOf = (id: string) => categories.find((c) => c.id === id)
  const money = (v: number) => formatMoney(v, base)

  function changeView(m: LimitViewMode) {
    setViewMode(m)
    try {
      localStorage.setItem(VIEW_KEY, m)
    } catch {
      // Trình duyệt chặn lưu (chế độ riêng tư) — chỉ mất lựa chọn khi mở lại.
    }
  }

  const toggleIn = (set: Set<string>, put: (s: Set<string>) => void) => (id: string) => {
    const next = new Set(set)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    put(next)
  }
  const toggleTail = toggleIn(tailOpen, setTailOpen)
  const toggleGroup = toggleIn(groupOpen, setGroupOpen)

  /**
   * Mở / đóng thanh trượt của một dòng. Bấm lại chính dòng đó thì đóng, và ĐÓNG LÀ BỎ
   * `draft`: từ đó trở đi cả mặt tính lại theo số đã lưu, không giữ một số treo lơ lửng.
   *
   * `draft` KHÔNG bị bỏ khi chuyển sang dòng khác: nó luôn bằng số vừa ghi thành công, nên
   * giữ lại tránh một nhịp nhảy số trong khi query chưa kịp về.
   */
  function toggleSlider(row: PlanRow) {
    if (slider?.id === row.cat.id) {
      setSlider(null)
      setDraft(null)
      return
    }
    const axisKey = catOf(row.cat.id)?.need_level ?? null
    const line = axisKey ? (summary.axis?.lines.find((l) => l.key === axisKey) ?? null) : null
    // Trục còn trong trần thì KHÔNG có vạch: không có gì phải đạt, và vẽ một vạch trên mức
    // hiện tại là app đang gợi ý tiêu thêm. Cũng chặn luôn vạch cũ đã đóng băng từ lúc trục
    // còn vượt — nó đúng lúc đó, sai bây giờ.
    const over = !!line && line.direction === 'cap' && line.actual > line.target
    let suggest: number | null = null
    if (over) {
      // Dựng bản phân bổ khi chưa có, hoặc khi dòng này chưa nằm trong bản cũ (mới đặt
      // hạn mức sau khi bản đó lập).
      let m = marks
      if (!m || !m.has(row.cat.id)) {
        m = axisSuggestions(summary.axis)
        setMarks(m)
      }
      suggest = m.get(row.cat.id) ?? null
    }
    setSlider({
      id: row.cat.id,
      suggest,
      axisKey,
      shareBefore: line?.share ?? null,
      committed: row.limit,
      ...sliderScale(row.limit, suggest, row.suggestion?.max ?? 0),
    })
    // Đặt `draft` NGAY khi mở, không đợi tới lúc kéo: `placeAt` là thứ ghim dòng lại đúng
    // chỗ, và nó phải có hiệu lực từ lúc thanh xuất hiện. Chưa kéo thì `amount` bằng đúng
    // hạn mức hiện tại nên không con số nào đổi.
    setDraft({ categoryId: row.cat.id, amount: row.limit, placeAt: row.limit })
  }

  /** Nhả tay = ghi. Không đổi gì thì không ghi — chạm vào núm cũng sinh một lượt nhả tay. */
  async function commitLimit(categoryId: string, amount: number) {
    if (!slider || slider.id !== categoryId || amount === slider.committed) return
    try {
      await upsert.mutateAsync({ categoryId, monthKey: monthKeyStr, amount })
      await syncAfterWrite([{ categoryId, amount }])
      setSlider((s) => (s && s.id === categoryId ? { ...s, committed: amount } : s))
      // Đi lệch khỏi vạch thì bản phân bổ cũ hết đúng — các vạch còn lại cộng vào con số
      // vừa bị đổi sẽ không ra trần nữa. Bỏ đi để dòng mở tiếp theo lập bản mới.
      if (amount !== marks?.get(categoryId)) setMarks(null)
    } catch {
      // Toast lỗi toàn cục đã nói. Việc ở đây là bật số về chỗ cũ, không để màn hình
      // hiện một hạn mức mà máy chủ không có.
      setDraft((d) => ({
        categoryId,
        amount: slider.committed,
        placeAt: d?.categoryId === categoryId ? d.placeAt : slider.committed,
      }))
    }
  }

  const sliderCtl: SliderCtl = {
    openId: slider?.id ?? null,
    toggle: toggleSlider,
    propsFor: (row) => {
      const line = slider?.axisKey
        ? (summary.axis?.lines.find((l) => l.key === slider.axisKey) ?? null)
        : null
      return {
        base,
        value: row.limit,
        suggest: slider?.suggest ?? null,
        max: slider?.max ?? 0,
        step: slider?.step ?? 1,
        axisLabel: slider?.axisKey ? AXIS_LABEL[slider.axisKey] : null,
        axisShareBefore: slider?.shareBefore ?? null,
        axisShareNow: line?.share ?? null,
        axisTargetShare: line?.targetShare ?? null,
        axisOk: line?.ok ?? true,
        onDrag: (v) =>
          setDraft((d) => ({
            categoryId: row.cat.id,
            amount: v,
            placeAt: d?.categoryId === row.cat.id ? d.placeAt : row.limit,
          })),
        onCommit: (v) => void commitLimit(row.cat.id, v),
        onDetail: () => setEditing(row.cat.id),
      }
    },
  }

  // Mục tiêu tiết kiệm gửi sang đúng MỘT con số: cần để riêng bao nhiêu mỗi tháng.
  // Trang này không cần biết mục tiêu tên gì hay tới bao giờ — chuyện đó ở tab Tài sản.
  const goalNeed = useMemo(() => {
    let sum = 0
    for (const g of goals) {
      const bal = balances.find((b) => b.id === g.account_id)
      const need = monthlyNeeded(
        Math.max(0, g.target_amount - Math.max(0, bal?.balance ?? 0)),
        g.target_date,
        monthKey,
        1,
      )
      if (need === null) continue
      const v = convertToBase(need, bal?.currency ?? base, base, rates ?? {})
      if (v !== null) sum += v
    }
    return sum
  }, [goals, balances, monthKey, base, rates])

  const over = summary.unallocated < 0
  // Câu phán: ngưỡng, cách nối mệnh đề và ca "chưa biết thu nhập" nằm ở planVerdict.ts
  // cùng test của nó — ở đây chỉ có việc bày ra.
  const verdict = useMemo(
    () => planVerdict({ summary, gapCount: data.gaps.length }),
    [summary, data.gaps.length],
  )

  /**
   * Gọi tên các khoản cam kết tính vào một trần đang hụt.
   *
   * Cam kết đã LEO LÊN CHA trong `coverageGaps` (trần nhóm là trần chung), nên phải leo
   * lại đúng luật đó ở đây — lọc thẳng `categoryId === g.categoryId` là bỏ mất mọi khoản
   * ghi ở mục con, tức câu giải thích trống trong đúng ca nó cần nhất.
   */
  const commitmentNames = (categoryId: string): string => {
    const parentOf = (id: string) => catOf(id)?.parent_id ?? null
    const names = data.commitments.items
      .filter((it) => {
        if (!it.categoryId) return false
        const p = parentOf(it.categoryId)
        const root = p !== null && data.budgetedByCat.has(p) ? p : it.categoryId
        return root === categoryId
      })
      .map((it) => it.title)
    return nameList(names)
  }

  /** Trục mà một danh mục sẽ rơi vào — nâng hạn mức ở đây làm dịch thanh trục cột trái. */
  const axisNote = (categoryId: string): string => {
    const need = catOf(categoryId)?.need_level ?? null
    return need ? AXIS_LABEL[need] : 'chưa phân loại'
  }

  async function handleCopy() {
    let n: number
    try {
      n = await copy.mutateAsync(monthKeyStr)
    } catch {
      return
    }
    showToast(
      n > 0 ? `Đã chép ${n} hạn mức từ tháng trước` : 'Tháng trước không có hạn mức để chép',
      n > 0 ? 'success' : 'info',
    )
  }

  /** Ghi MỘT hạn mức. Dùng cho nút `Đặt` / `Nâng lên` / `Tạo trần` của khối Cần bạn quyết. */
  async function applyLimit(categoryId: string, amount: number, label: string) {
    try {
      await upsert.mutateAsync({ categoryId, monthKey: monthKeyStr, amount })
    } catch {
      // Toast lỗi toàn cục đã nói — thêm câu thứ hai chỉ là hai thông báo cho một lỗi.
      return
    }
    await syncAfterWrite([{ categoryId, amount }])
    showToast(`${label} ${money(amount)}`, 'success')
  }

  /**
   * Ghi N hạn mức, ĐẾM thành công/thất bại (B40.1).
   *
   * Bản trước chạy `for … await` trong một `try { } catch { return }`: hỏng ở mục thứ 4
   * thì 3 hạn mức đã vào DB, 4 mục không, toast thành công không hiện, và người dùng
   * không được biết trạng thái nào. Với 7 mục qua mạng di động đây không phải ca lý thuyết.
   */
  async function writeMany(rows: { categoryId: string; amount: number }[], noun: string) {
    let ok = 0
    const written: { categoryId: string; amount: number }[] = []
    for (const r of rows) {
      try {
        await upsert.mutateAsync({ categoryId: r.categoryId, monthKey: monthKeyStr, amount: r.amount })
        written.push(r)
        ok++
      } catch {
        // Tiếp tục: mục sau không liên quan gì tới mục vừa hỏng.
      }
    }
    // MỘT lượt cho cả lô: bảy mục con của cùng một nhóm vẫn chỉ ghi trần cha một lần.
    // Chỉ tính những mục ĐÃ ghi được — cộng cả mục vừa hỏng vào là trần cha mang một
    // con số không có dòng nào đỡ.
    if (written.length > 0) await syncAfterWrite(written)
    if (ok === rows.length) {
      showToast(`Đã đặt ${ok} ${noun}`, 'success')
    } else if (ok > 0) {
      showToast(
        `Đã đặt ${ok}/${rows.length} ${noun} — ${rows.length - ok} mục chưa lưu được, thử lại.`,
        'info',
      )
    }
    // `ok === 0` thì để toast lỗi toàn cục nói, không thêm câu thứ hai.
  }

  async function handleUseAllSuggestions() {
    if (data.unset.length === 0) return
    const ok = await confirmDialog({
      title: `Đặt hạn mức cho ${data.unset.length} danh mục?`,
      message: `Dùng số trung bình ${SUGGEST_MONTHS} tháng cho những mục chưa đặt. Sửa lại từng mục sau vẫn được.`,
      confirmLabel: 'Đặt hết',
    })
    if (!ok) return
    await writeMany(
      data.unset.map((r) => ({ categoryId: r.cat.id, amount: r.suggestion.average })),
      'hạn mức',
    )
  }

  const headroomPlan = useMemo(() => {
    if (!projection || projection.headroom <= 0) return null
    return distributeHeadroom(
      projection.headroom,
      data.unset.map((r) => ({ categoryId: r.cat.id, average: r.suggestion.average })),
    )
  }, [projection, data.unset])

  async function handleKeepFloor() {
    if (!headroomPlan || headroomPlan.size === 0) return
    const rows = [...headroomPlan].map(([categoryId, amount]) => ({ categoryId, amount }))
    const ok = await confirmDialog({
      title: `Chia ${money(projection!.headroom)} cho ${rows.length} danh mục?`,
      message: `Chia theo tỉ lệ trung bình ${SUGGEST_MONTHS} tháng của từng mục, vừa đủ để Để dành không xuống dưới sàn ${Math.round(
        (projection!.savingsFloor / summary.income) * 100,
      )}%. Sửa lại từng mục sau vẫn được.`,
      confirmLabel: 'Chia',
    })
    if (!ok) return
    await writeMany(rows, 'hạn mức')
  }

  const floorPct = projection && summary.income > 0
    ? Math.round((projection.savingsFloor / summary.income) * 100)
    : 0

  return (
    <div className="flex flex-col gap-3">
      {data.hasMissingRate && (
        <div className="rounded-md border border-state-warn-border bg-state-warn-bg p-2 text-sm text-state-warn-fg">
          Một phần cam kết ngoại tệ chưa quy đổi được (đang chờ tỷ giá) nên có thể thiếu.
        </div>
      )}

      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4">
        <div className="contents lg:flex lg:flex-col lg:gap-3">
          {/* 1 — Còn chưa phân bổ. Song sinh với "Còn lại" của mặt theo dõi: cùng chỗ,
              cùng cỡ chữ, đổi nghĩa. Mắt không phải học lại cách đọc trang. */}
          <Card as="section" className="order-1">
            <p className="mb-2 text-sm font-medium text-fg-accent">
              Tháng chưa bắt đầu · đang lập kế hoạch
            </p>
            {/* CÂU KẾT LUẬN của 18a, đứng trước mọi con số. Đây là màn duy nhất trong
                app phán được "kế hoạch này có ổn không" TRƯỚC khi tiêu đồng nào, mà bốn
                ô KPI với ba thanh trục thì không tự nói ra điều đó.
                Qua <ConclusionLine> chứ không <VerdictNote> — §5.0/R7: câu kết luận đầu
                màn phải sống sót ở CẢ HAI chế độ mật độ, còn VerdictNote thu về một chip
                vài chữ ở chế độ Gọn. */}
            {verdict && (
              <div className="mb-3">
                <ConclusionLine tone={verdict.tone} short={verdict.short}>
                  {verdict.text}
                </ConclusionLine>
              </div>
            )}
            {summary.incomeSource === 'unknown' ? (
              <>
                <p className="text-sm text-fg-secondary">
                  Chưa biết tháng này thu bao nhiêu nên chưa chia được. Khai một số dự kiến
                  là cả kế hoạch chạy.
                </p>
                <ActionButton
                  variant="primary"
                  onClick={() => setIncomeOpen(true)}
                  className="mt-2"
                >
                  Khai thu dự kiến
                </ActionButton>
              </>
            ) : (
              <>
                {/* BỐN ô của 18a: Thu dự kiến · Đã phân bổ · Chưa phân bổ · Cam kết đã
                    biết. Trước đây chỉ có một con số lớn (chưa phân bổ) và một dòng chữ
                    — ba con số kia phải tự nhẩm hoặc cuộn xuống tìm.

                    "Chưa phân bổ" giữ nguyên vị trí và cỡ chữ của con số lớn cũ: nó vẫn
                    là con số quyết định của màn, ba ô kia là bằng chứng đứng cạnh. */}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <PlanTile label="Thu dự kiến" badge={summary.incomeSource === 'baseline' ? 'NỀN' : undefined}>
                    <Money amount={summary.income} currency={base} tone="in" compact />
                  </PlanTile>
                  <PlanTile label="Đã phân bổ">
                    <Money amount={summary.allocated} currency={base} tone="neutral" compact />
                  </PlanTile>
                  <PlanTile label={over ? 'Chia quá tay' : 'Chưa phân bổ'}>
                    <Money
                      amount={Math.abs(summary.unallocated)}
                      currency={base}
                      tone={over ? 'out' : 'neutral'}
                      compact
                    />
                  </PlanTile>
                  <PlanTile label="Cam kết đã biết">
                    <Money
                      amount={data.commitments.total}
                      currency={base}
                      tone="neutral"
                      approx={data.hasMissingRate}
                      compact
                    />
                  </PlanTile>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-sunken">
                  <div
                    className={`h-full rounded-full ${over ? STATUS_FILL.bad : STATUS_FILL.good}`}
                    style={{
                      width: `${
                        summary.income > 0
                          ? Math.min(100, (summary.allocated / summary.income) * 100)
                          : 100
                      }%`,
                    }}
                  />
                </div>
                <div className="mt-1.5 flex items-baseline justify-between gap-2 text-sm text-fg-secondary">
                  <button
                    type="button"
                    onClick={() => setIncomeOpen(true)}
                    className="-my-2 inline-flex min-h-11 items-center gap-1 text-left"
                  >
                    <span>
                      Sửa thu dự kiến{' '}
                      <span className="text-fg-muted">
                        {summary.incomeSource === 'declared'
                          ? 'đang dùng số tự khai'
                          : `đang dùng nền — TB ${BASELINE_MONTHS} tháng có dữ liệu`}
                      </span>
                    </span>
                    <Pencil className="h-3.5 w-3.5 shrink-0 text-fg-muted" aria-hidden />
                  </button>
                  <span className="shrink-0">đã chia {money(summary.allocated)}</span>
                </div>
              </>
            )}
          </Card>

          {/* 2 — Cơ cấu theo KẾ HOẠCH. Dòng "Để dành" chính là phần chưa phân bổ ở trên
              (xem planSummary): nâng một hạn mức là hai chỗ nhúc nhích cùng nhau vì
              chúng là một phép tính, không phải hai phép được canh cho khớp. */}
          {summary.axis && (
            <Card as="section" className="order-2">
              <SectionTitle className="mb-2">Cơ cấu theo kế hoạch</SectionTitle>
              <ul className="space-y-3">
                {summary.axis.lines.map((l) => {
                  const barPct = Math.min(Math.max(l.share, 0) * 100, 100)
                  const markPct = Math.min(l.targetShare * 100, 100)
                  return (
                    <li key={l.key}>
                      <div className="flex items-baseline justify-between gap-2 text-sm">
                        <span className="text-fg-primary">{AXIS_LABEL[l.key]}</span>
                        <span
                          className={`text-sm font-medium ${l.ok ? 'text-money-in' : 'text-fg-warn'}`}
                        >
                          {shareLabel(l.share)}
                          <span className="ml-1 font-normal text-fg-muted">
                            {l.direction === 'cap' ? 'tối đa' : 'tối thiểu'}{' '}
                            {Math.round(l.targetShare * 100)}%
                          </span>
                        </span>
                      </div>
                      <div className="relative mt-1 h-2 overflow-hidden rounded-full bg-surface-sunken">
                        <div
                          className={`h-full rounded-full ${l.ok ? STATUS_FILL.good : STATUS_FILL.warn}`}
                          style={{ width: `${barPct}%` }}
                        />
                        <div
                          className="absolute top-0 h-2 w-0.5 bg-gray-500 dark:bg-gray-300"
                          style={{ left: `${markPct}%` }}
                          aria-hidden
                        />
                      </div>
                      <div className="mt-0.5 flex justify-between text-sm text-fg-muted">
                        <span className={l.ok ? '' : 'text-fg-warn'}>
                          {money(Math.round(l.actual))}
                          {l.key === 'savings' && (
                            <span className="ml-1 text-fg-accent">= phần chưa phân bổ</span>
                          )}
                        </span>
                        <span>
                          {l.direction === 'cap' ? 'trần' : 'sàn'} {money(l.target)}
                        </span>
                      </div>
                      {/* THÀNH PHẦN của trục, một dòng (18a: "Nhà ở ¥112,000 · Đi lại
                          ¥10,000 · Sức khỏe ¥18,000 · 4 mục khác"). Không có nó thì "41%"
                          là một con số không sửa được: muốn hạ nó xuống phải tự đoán trục
                          Thiết yếu gồm những mục nào.
                          Trục "Để dành" không bao giờ có lát nào — nó là HIỆU, không phải
                          tổng của danh mục nào (xem axisSlices) — nên tự ẩn. */}
                      {l.slices.length > 0 && (
                        <p className="mt-0.5 truncate text-2xs text-fg-muted">
                          {nameList(
                            l.slices.map(
                              (s) =>
                                `${catOf(s.categoryId)?.name ?? 'Chưa rõ'} ${money(Math.round(s.amount))}`,
                            ),
                          )}
                        </p>
                      )}
                    </li>
                  )
                })}
              </ul>

              {goalNeed > 0 && (
                <p className="mt-3 border-t border-border-subtle pt-2 text-sm text-fg-secondary">
                  <Target className="mr-1 inline h-3.5 w-3.5 -translate-y-px" aria-hidden />
                  Mục tiêu tiết kiệm cần {money(goalNeed)}/tháng —{' '}
                  {summary.unallocated >= goalNeed ? (
                    <span className="text-money-in">kế hoạch này đủ.</span>
                  ) : (
                    <span className="text-fg-warn">
                      còn thiếu {money(goalNeed - summary.unallocated)}.
                    </span>
                  )}
                </p>
              )}

              {/* Phần chưa phân loại KHÔNG còn là một hộp vàng lơ lửng ở đây nữa: nó đã
                  thành một KHỐI CÓ MẶT trong panel hạn mức, kèm nút Phân loại ngay tại
                  header (B30.3). Câu nhắc cũ cách chỗ sửa được nó ~1.400px. */}
            </Card>
          )}

          {/* 3 — Đã cam kết. KHÔNG cộng vào "đã chia": cam kết là thực tế, hạn mức là
              kế hoạch. Việc của khối này là chỉ ra chỗ kế hoạch không phủ nổi thực tế. */}
          {data.commitments.items.length > 0 && (
            <Card as="section" className="order-3">
              <div className="flex items-baseline justify-between gap-2">
                <SectionTitle>Đã cam kết</SectionTitle>
                <span className="text-sm font-semibold text-fg-primary">
                  {money(data.commitments.total)}
                </span>
              </div>
              <Guide className="mb-2 text-sm text-fg-muted">
                Tiền chắc chắn ra trong tháng — hạn mức phải phủ được. Số này không cộng vào
                phần đã chia ở trên.
              </Guide>
              <ul className="divide-y divide-border-subtle">
                {data.commitments.items.map((it) => {
                  const c = it.categoryId ? catOf(it.categoryId) : null
                  return (
                    <li key={it.key} className="py-1.5">
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="min-w-0 truncate text-fg-primary">{it.title}</span>
                        <span className="shrink-0 text-fg-primary">
                          {it.unknownAmount ? (
                            <span className="text-sm text-fg-muted">chưa biết</span>
                          ) : (
                            money(it.amount)
                          )}
                        </span>
                      </div>
                      <p className="text-2xs text-fg-muted">
                        {it.kind === 'recurring' ? 'định kỳ' : 'sắp chi'}
                        {it.times > 1 && ` ×${it.times}`}
                        {c ? ` → ${c.name}` : ' · chưa gắn danh mục'}
                      </p>
                    </li>
                  )
                })}
              </ul>

              {/* Danh sách trần hụt cam kết KHÔNG còn ở đây: nó đã thành khối "Cần bạn
                  quyết" ghim trên đầu panel hạn mức, nơi sửa được ngay (B31). Ở đây chỉ
                  còn TỔNG — "phải tìm thêm bao nhiêu tiền" là câu hỏi khác với "thiếu ở
                  đâu", và với ba bốn dòng thì nó thành một phép cộng nhẩm. */}
              {data.gaps.length > 0 && (
                <p className="mt-3 text-2xs font-semibold uppercase tracking-label text-fg-warn">
                  {data.gaps.length} trần chưa phủ hết cam kết · thiếu tổng{' '}
                  {money(data.gaps.reduce((s, g) => s + g.short, 0))}
                </p>
              )}
            </Card>
          )}
        </div>

        <div className="contents lg:flex lg:flex-col lg:gap-3">
          {/* 4 — Panel hạn mức. `padding="none"` để dòng và header nhóm kéo hết bề rộng
              panel: vạch chia đứt đoạn giữa các khối làm mất luôn tín hiệu "đây là một
              nhóm liền mạch". Padding chuyển vào từng dòng. */}
          {/* Dải ghim (mobile) — PHẢI ở ngoài Card dưới đây: Card đặt `overflow: hidden`,
              mà `sticky` trong khối bị cắt thì không dính, và chết im lặng. */}
          <PlanStickyBar axis={summary.axis} monthKey={monthKey} base={base} />

          <Card as="section" padding="none" className="order-4 overflow-hidden">
            <div className="border-b border-border-panel px-4 py-3.5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <SectionTitle>Hạn mức tháng này</SectionTitle>
                <SegmentedControl
                  label="Cách xem hạn mức"
                  items={VIEW_OPTIONS}
                  value={viewMode}
                  onChange={changeView}
                  size="sm"
                  stretch={false}
                />
              </div>

              {/* HAI con số, mỗi con số một nhãn (B30.4). Trước đây 29 dòng cộng lại
                  ¥240,964 trong khi ô "Đã phân bổ" ghi ¥226,138, và `plannedSlices` ĐÚNG
                  khi bỏ ¥14,826 ra (mốc con nằm trong trần cha, cộng cả hai là đếm một
                  đồng hai lần) — nhưng màn hình không nói dòng nào là mốc con, nên hai
                  con số cạnh nhau đọc ra như một lỗi tính. */}
              {summary.incomeSource !== 'unknown' && (
                <p className="mt-1 text-2xs text-fg-muted">
                  tính vào kế hoạch{' '}
                  <Money amount={summary.allocated} currency={base} className="font-semibold text-fg-primary" />{' '}
                  / thu dự kiến {money(summary.income)}
                </p>
              )}
              {groups.markerTotal > 0 && (
                <p className="mt-0.5 text-2xs text-fg-muted">
                  Các dòng dưới đây cộng lại {money(groups.lineTotal)} — lệch{' '}
                  {money(groups.markerTotal)} là mốc con nằm trong trần nhóm, không cộng hai lần.
                </p>
              )}

              {projection && (
                <ProjectionBox
                  projection={projection}
                  income={summary.income}
                  savingsNow={summary.unallocated}
                  floorPct={floorPct}
                  money={money}
                  onKeepFloor={handleKeepFloor}
                  onUseAll={handleUseAllSuggestions}
                  onCopy={handleCopy}
                  busy={upsert.isPending || copy.isPending}
                  headroomCount={headroomPlan?.size ?? 0}
                />
              )}

              {/* Chưa biết thu nhập thì không chiếu được gì, nhưng hai nút ghi hạn mức
                  vẫn phải dùng được — kế hoạch điền dở còn hơn không có kế hoạch. */}
              {!projection && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <ActionButton onClick={handleCopy} disabled={copy.isPending}>
                    Chép tháng trước
                  </ActionButton>
                  <ActionButton
                    onClick={handleUseAllSuggestions}
                    disabled={data.unset.length === 0 || upsert.isPending}
                  >
                    Nhận hết gợi ý{data.unset.length > 0 ? ` (${data.unset.length})` : ''}
                  </ActionButton>
                </div>
              )}
            </div>

            {/* KHỐI "CẦN BẠN QUYẾT" — trên tất cả các khối nhóm (B31).
                `coverageGaps()` là hàm đã viết kỹ (leo cam kết lên cha, bỏ mốc con, sắp
                theo `short`) mà kết quả của nó tới nay chỉ được ĐẾM: `planVerdict` in ra
                "2 danh mục chưa phủ hết khoản đã cam kết", rồi người dùng tự đi tìm hai
                danh mục đó trong 29 dòng.
                Rỗng thì biến mất hoàn toàn — không header, không "Không có việc nào"
                (B31.5): kế hoạch đã xong thì panel mở thẳng vào danh sách nhóm. */}
            {(data.gaps.length > 0 || data.unset.length > 0) && (
              <>
                <BlockHeader
                  title="Cần bạn quyết"
                  meta={`${data.gaps.length + data.unset.length} việc`}
                  tone="warn"
                  right={
                    <span className="text-2xs text-fg-muted">gợi ý = TB {SUGGEST_MONTHS} tháng</span>
                  }
                />
                <ul>
                  {data.gaps.map((g) => {
                    const cat = catOf(g.categoryId)
                    const laNhom = categories.some(
                      (k) => k.parent_id === g.categoryId && !k.is_archived,
                    )
                    const chuaCoTran = g.budgeted === 0
                    return (
                      <DecisionRow
                        key={`gap-${g.categoryId}`}
                        icon={cat?.icon ?? '📦'}
                        name={cat?.name ?? 'Danh mục'}
                        note={`· ${laNhom ? 'nhóm ' : ''}${axisNote(g.categoryId)}`}
                        // Vì sao in CÂU chứ chỉ con số: y nguyên lý do đã ghi trong
                        // capOverflow.ts — in một con số mà không nói nó ở đâu ra thì
                        // người dùng đọc như app tự bịa.
                        reason={
                          chuaCoTran
                            ? `chưa có trần nào mà ${money(g.committed)} đã cam kết (${commitmentNames(g.categoryId)})`
                            : `hạn mức ${money(g.budgeted)} không phủ nổi ${money(g.committed)} đã cam kết (${commitmentNames(g.categoryId)})`
                        }
                        tone="bad"
                        amount={g.committed}
                        base={base}
                        dashed={false}
                        actionLabel={chuaCoTran ? 'Tạo trần' : 'Nâng lên'}
                        busy={upsert.isPending}
                        onAmount={() => setEditing(g.categoryId)}
                        onAction={() =>
                          applyLimit(
                            g.categoryId,
                            g.committed,
                            chuaCoTran ? 'Đã tạo trần' : 'Đã nâng hạn mức lên',
                          )
                        }
                      />
                    )
                  })}
                  {data.unset.map((r) => (
                    <DecisionRow
                      key={`unset-${r.cat.id}`}
                      icon={r.cat.icon}
                      name={r.cat.name}
                      note={`· ${axisNote(r.cat.id)}`}
                      // ĐÂY là chỗ duy nhất `TB · cao nhất` còn đáng in ở dạng câu (B34.1):
                      // hai con số đó dùng để CHỌN một hạn mức, mà đây là dòng chưa chọn.
                      reason={`TB ${SUGGEST_MONTHS} tháng ${money(r.suggestion.average)} · cao nhất ${money(r.suggestion.max)}`}
                      tone="muted"
                      amount={r.suggestion.average}
                      base={base}
                      // Viền nét đứt phân biệt "gợi ý chưa nhận" với "số đã đặt" (B31.3).
                      dashed
                      actionLabel="Đặt"
                      busy={upsert.isPending}
                      onAmount={() => setEditing(r.cat.id)}
                      onAction={() => applyLimit(r.cat.id, r.suggestion.average, 'Đã đặt hạn mức')}
                    />
                  ))}
                </ul>
              </>
            )}

            {/* BỐN KHỐI theo trục. Tên khối lấy từ `PLAN_BLOCK_LABEL` (gói `AXIS_LABEL`)
                chứ không viết chuỗi mới — đây là lý do bảng đó tồn tại. */}
            {groups.blocks.map((b) => (
              <BlockBody
                key={b.key}
                block={b}
                base={base}
                money={money}
                viewMode={viewMode}
                tailOpen={tailOpen.has(b.key)}
                onToggleTail={() => toggleTail(b.key)}
                groupOpen={groupOpen}
                onToggleGroup={toggleGroup}
                onEdit={setEditing}
                onSplit={openSplit}
                slider={sliderCtl}
              />
            ))}

            {groups.blocks.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-fg-muted">
                Chưa đặt hạn mức nào cho tháng này.
              </p>
            )}

            {/* KHỐI THỨ NĂM trong cùng thẻ, không phải một card riêng lơ lửng dưới đáy
                (B35.1). Nó là một LOẠI TRẦN KHÁC — cắt ngang danh mục — nên nằm cuối,
                sau Mốc con. */}
            <TagPlanBlock
              lines={data.tagPlan}
              base={base}
              hasMissingRate={data.tagHasMissingRate}
            />
          </Card>

          {/* Cả dòng là chữ để DẠY nên bọc <Guide> từ ngoài: bọc mỗi phần chữ thì ở
              chế độ Gọn còn trơ lại một cái icon không nói gì. */}
          <Guide className="order-6 flex items-start gap-1.5 px-1 text-2xs text-fg-muted">
            <PiggyBank className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>
              Kế hoạch không cần chốt: tháng {monthLabel} bắt đầu là trang này tự chuyển sang
              theo dõi, dùng đúng những hạn mức bạn vừa đặt.
            </span>
          </Guide>
        </div>
      </div>

      {editing && (
        <BudgetEditSheet
          key={editing}
          monthKey={monthKeyStr}
          categoryId={editing}
          categoryLabel={`${catOf(editing)?.icon ?? '📦'} ${catOf(editing)?.name ?? ''}`}
          current={data.budgetedByCat.get(editing) ?? 0}
          /* Hai prop dưới đây từng thiếu, mỗi cái một lỗi thật:
             · currentRollover — thiếu thì checkbox khởi tạo về unticked, bấm Lưu là ghi
               rollover=false lên một hạn mức đang bật dồn.
             · hint — thiếu thì đặt mốc cho mục con của nhóm ĐÃ có trần diễn ra trong im
               lặng ở tab này, trong khi tab Ngân sách vẫn nói rõ. */
          currentRollover={data.rolloverByCat.get(editing)}
          budgetId={data.budgetIdByCat.get(editing)}
          /* `hint` dùng `.has` chứ không phải `> 0`: trần nhóm ¥0 vẫn là trần thật, nên mục
             con của nó vẫn chỉ là mốc theo dõi. Xét `> 0` là nói ngược lại — và BudgetView
             vốn đã xét đúng bằng `budgets.some(...)`, hai màn lệch nhau từ trước. */
          hint={budgetHint(editing, categories, (id) => data.budgetedByCat.has(id))}
          suggestion={data.suggestions.get(editing) ?? null}
          onAfterWrite={syncAfterWrite}
          onClose={() => setEditing(null)}
        />
      )}

      {/* Xem ghi chú cùng chỗ ở BudgetView: trạng thái màn chia phải sống ở màn này. */}
      {splitSheetProps && <SplitGroupSheet {...splitSheetProps} />}

      {incomeOpen && (
        <ExpectedIncomeSheet
          monthKey={monthKeyStr}
          monthLabel={monthLabel}
          declared={data.declared}
          baseline={data.baseline}
          onClose={() => setIncomeOpen(false)}
        />
      )}
    </div>
  )
}

/**
 * Khối chiếu hệ quả + ba nút, mỗi nút ĐÃ IN SẴN hệ quả của nó (B32, B35.2).
 *
 * Bản trước có hai nút cùng cỡ (`Chép tháng trước` / `Dùng hết gợi ý (7)`) và cả hai đều
 * không nói mình làm gì với Để dành. `Giữ sàn` là nút CHÍNH vì nó là hành động duy nhất
 * giữ được cả hai ràng buộc: phủ hết danh mục chưa đặt, và không phá sàn để dành.
 */
function ProjectionBox({
  projection,
  income,
  savingsNow,
  floorPct,
  money,
  onKeepFloor,
  onUseAll,
  onCopy,
  busy,
  headroomCount,
}: {
  projection: import('./planProjection').PlanProjection
  income: number
  savingsNow: number
  floorPct: number
  money: (v: number) => string
  onKeepFloor: () => void
  onUseAll: () => void
  onCopy: () => void
  busy: boolean
  headroomCount: number
}) {
  const p = projection
  const nowShare = income > 0 ? savingsNow / income : 0
  const daDatSan = savingsNow >= p.savingsFloor
  const conViec: string[] = []
  if (p.unsetCount > 0) conViec.push(`${p.unsetCount} danh mục chưa đặt`)
  if (p.gapCount > 0) conViec.push(`${p.gapCount} trần chưa phủ cam kết`)
  const chuaXong = conViec.length > 0

  // Cả hai đều 0 → khối biến mất, panel gọn lại: kế hoạch đã điền xong thì `planVerdict`
  // ở cột trái nói là đủ, và một khối chiếu "nếu điền tiếp" là chiếu một việc không còn.
  if (!chuaXong) {
    return (
      <div className="mt-3 flex flex-wrap gap-2">
        <ActionButton onClick={onCopy} disabled={busy}>
          Chép tháng trước
        </ActionButton>
      </div>
    )
  }

  const keepFloorLabel =
    p.headroom > 0 && headroomCount > 0
      ? `Giữ sàn ${floorPct}% — chia ${money(p.headroom)} cho ${headroomCount} mục`
      : `Giữ sàn ${floorPct}%`

  return (
    <div className="mt-3 rounded-md border border-state-warn-border bg-state-warn-bg p-3 text-state-warn-fg">
      <p className="flex items-start gap-2 text-sm font-semibold">
        <TriangleAlert className="mt-px h-4 w-4 shrink-0" aria-hidden />
        <span>
          Để dành đang {shareLabel(nowShare)} — {daDatSan ? 'đạt' : 'chưa đạt'} sàn {floorPct}%.
          {conViec.length > 0 && ` Nhưng kế hoạch chưa xong: ${conViec.join(', ')}.`}
        </span>
      </p>

      {/* Hai dòng chiếu, mono và nhỏ hơn câu trên: chúng là BẰNG CHỨNG cho câu đó, và
          mỗi dòng chỉ hiện khi việc tương ứng còn (B32). */}
      <div className="mt-2 flex flex-col gap-0.5 text-2xs">
        {p.unsetCount > 0 && (
          <p>
            Nhận hết {p.unsetCount} gợi ý ({money(p.suggestedTotal)}) → để dành còn{' '}
            <b className={p.savingsIfSuggested < p.savingsFloor ? 'text-money-out' : undefined}>
              {money(Math.abs(p.savingsIfSuggested))}
              {p.savingsIfSuggested < 0 && ' âm'} ·{' '}
              {shareLabel(income > 0 ? p.savingsIfSuggested / income : 0)}
            </b>
            , sàn {money(p.savingsFloor)}
          </p>
        )}
        {p.gapTotal > 0 && (
          <p>
            Phủ luôn cam kết còn hụt (+{money(p.gapTotal)}) →{' '}
            <b className="text-money-out">
              {p.savingsIfCovered < 0
                ? `chia quá thu ${money(-p.savingsIfCovered)}`
                : `để dành còn ${money(p.savingsIfCovered)}`}
            </b>
          </p>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <ActionButton
          variant="primary"
          onClick={onKeepFloor}
          disabled={busy || p.headroom <= 0 || headroomCount === 0}
        >
          {keepFloorLabel}
        </ActionButton>
        <ActionButton onClick={onUseAll} disabled={busy || p.unsetCount === 0}>
          Nhận hết gợi ý{p.unsetCount > 0 ? ` (${p.unsetCount})` : ''}
        </ActionButton>
        <ActionButton onClick={onCopy} disabled={busy}>
          Chép tháng trước
        </ActionButton>
        {/* KHÔNG hạ sàn hộ người dùng (B35.4): sàn để dành là mục tiêu họ tự đặt, app tự
            nới ra để kế hoạch "vừa" là làm hỏng đúng cái thước đang dùng để đo. Nên đây
            là link phụ mở Cài đặt, không phải một nút cùng hạng. */}
        <Link
          to="/settings?edit=profile"
          className="-my-2 ml-auto inline-flex min-h-11 items-center text-2xs font-medium underline"
        >
          Hạ sàn
        </Link>
      </div>

      {/* Ẩn nút thì người dùng tưởng app thiếu tính năng — nên nó bị vô hiệu hoá kèm câu
          nói vì sao, và câu đó nói ra hai đường thoát (B35.3). */}
      {p.headroom <= 0 && (
        <p className="mt-2 text-2xs">
          Đã chia hết phần giữ được sàn — muốn thêm thì phải hạ sàn hoặc bớt một hạn mức.
        </p>
      )}
    </div>
  )
}

/** Header của một khối trong panel. Nền `surface-chrome` để mắt bắt ngay ranh giới nhóm. */
function BlockHeader({
  title,
  meta,
  tone = 'normal',
  bar,
  right,
}: {
  title: string
  meta?: string
  tone?: 'normal' | 'warn'
  bar?: ReactNode
  right?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border-panel bg-surface-chrome px-4 py-2.5">
      {/* Vai trò 'card' cho cả hai trạng thái — chỉ nhánh cảnh báo mượn thêm dáng chữ
          hoa của 'micro' và đổi màu. Trước đây nhánh thường dùng font-bold, lệch với 57
          nhãn thẻ khác đang font-semibold. */}
      <SectionTitle
        as="h3"
        className={tone === 'warn' ? 'uppercase tracking-label text-fg-warn' : ''}
      >
        {title}
      </SectionTitle>
      {meta && <span className="text-2xs text-fg-muted">{meta}</span>}
      {bar}
      {right && <span className="ml-auto">{right}</span>}
    </div>
  )
}

/**
 * Một dòng trong khối "Cần bạn quyết": tên + trục + CÂU vì sao + số + nút.
 *
 * Ô số bấm được (mở sheet để gõ số khác) tách khỏi nút hành động (ghi luôn con số đang
 * hiện). Hai việc khác nhau nên là hai vùng chạm khác nhau — gộp lại thì muốn sửa số
 * phải bấm rồi huỷ.
 */
function DecisionRow({
  icon,
  name,
  note,
  reason,
  tone,
  amount,
  base,
  dashed,
  actionLabel,
  busy,
  onAmount,
  onAction,
}: {
  icon: string
  name: string
  note: string
  reason: string
  tone: 'bad' | 'muted'
  amount: number
  base: Parameters<typeof Money>[0]['currency']
  dashed: boolean
  actionLabel: string
  busy: boolean
  onAmount: () => void
  onAction: () => void
}) {
  return (
    <li
      className={`flex items-center gap-3 border-t border-border-subtle px-4 py-2 ${
        tone === 'bad' ? 'bg-state-bad-bg' : ''
      }`}
    >
      <span aria-hidden className="w-5 shrink-0 text-center text-sm">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-fg-primary">
          {name} <span className="text-2xs text-fg-muted">{note}</span>
        </span>
        <span
          className={`block text-2xs ${tone === 'bad' ? 'text-state-bad-fg' : 'text-fg-muted'}`}
        >
          {reason}
        </span>
      </span>
      <button
        type="button"
        onClick={onAmount}
        className={`min-h-11 shrink-0 rounded-md border px-2.5 text-sm ${
          dashed ? 'border-dashed border-border-strong text-fg-secondary' : 'border-border-strong text-fg-primary'
        }`}
      >
        <Money amount={amount} currency={base} className="font-semibold" />
      </button>
      <ActionButton variant="primary" onClick={onAction} disabled={busy} className="shrink-0">
        {actionLabel}
      </ActionButton>
    </li>
  )
}

/** Một khối nhóm: header có tiểu tổng, rồi các dòng, rồi đuôi dài gấp lại. */
/**
 * Cần điều khiển thanh trượt, gói thành MỘT prop.
 *
 * Vì sao gói: bốn thứ (dòng nào đang mở, mở/đóng, dựng props, và số đang kéo) phải xuyên
 * qua `BlockBody` → `ListRow`/`TableRow`. Rải thành bốn prop là bốn chỗ phải sửa mỗi lần
 * thêm một mảnh, và `propsFor` giữ toàn bộ phần TÍNH ở lại `PlanningView` — hai dòng chỉ
 * còn việc gọi nó.
 */
interface SliderCtl {
  /** id dòng đang xổ thanh; null = không dòng nào */
  openId: string | null
  toggle: (row: PlanRow) => void
  propsFor: (row: PlanRow) => LimitSliderProps
}

function BlockBody({
  block,
  base,
  money,
  viewMode,
  tailOpen,
  onToggleTail,
  groupOpen,
  onToggleGroup,
  onEdit,
  onSplit,
  slider,
}: {
  block: PlanBlock
  base: Parameters<typeof Money>[0]['currency']
  money: (v: number) => string
  viewMode: LimitViewMode
  tailOpen: boolean
  onToggleTail: () => void
  groupOpen: Set<string>
  onToggleGroup: (id: string) => void
  onEdit: (id: string) => void
  onSplit: (id: string) => void
  slider: SliderCtl
}) {
  // Khối "Mốc con" KHÔNG có thanh trượt: mốc con bị loại khỏi `counted` (xem plannedSlices)
  // nên kéo nó không làm trục nhúc nhích, mà dòng "Linh hoạt 45%" đứng im trong lúc kéo
  // đọc ra như app bị treo. Bấm mốc con vẫn mở tấm trượt như trước.
  const rowSlider = block.key === 'markers' ? null : slider
  const pct =
    block.target && block.target > 0 ? Math.min(100, (block.total / block.target) * 100) : null

  return (
    <>
      <BlockHeader
        title={block.label}
        meta={
          block.key === 'unclassified'
            ? `${block.rows.length + block.tail.length} mục · chưa gắn nhóm nên không vào trần nào`
            : block.key === 'markers'
              ? `${block.rows.length + block.tail.length} mục · nằm trong trần nhóm cha, không cộng vào kế hoạch`
              : `${block.rows.length + block.tail.length} mục${
                  block.remaining !== null
                    ? ` · ${block.remaining >= 0 ? 'còn' : 'vượt'} ${money(Math.abs(block.remaining))}`
                    : ''
                }`
        }
        // Khối không có trần thì KHÔNG vẽ thanh (B30): một thanh không có mốc là một
        // thanh không nói được gì, và vẽ ra thì đọc như "đã dùng hết".
        bar={
          pct !== null ? (
            <span className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-surface-sunken">
              <span
                className={`block h-full rounded-full ${
                  block.remaining !== null && block.remaining < 0 ? STATUS_FILL.bad : STATUS_FILL.good
                }`}
                style={{ width: `${pct}%` }}
              />
            </span>
          ) : undefined
        }
        right={
          <span className="text-2xs text-fg-secondary">
            <Money amount={block.total} currency={base} />
            {block.target !== null && (
              <span className="text-fg-muted"> / trần {money(block.target)}</span>
            )}
          </span>
        }
      />

      {/* Nút Phân loại ngay tại HEADER của chính nhóm đó (B30.3), không phải một hộp vàng
          ở cột trái cách chỗ sửa được nó ~1.400px.
          `?ids=` gửi ĐÚNG những danh mục đang đếm ở dòng trên, không phải `?todo=1`: các
          danh mục này là danh mục CHA (trần nhóm), và bộ lọc "chưa phân loại" chung còn
          kéo theo cả cha của những nhóm không đặt trần — nút nói 3 mà trang mở ra 11 thì
          lại là một con số thứ hai để người đọc tự đối chiếu. */}
      {block.key === 'unclassified' && (
        <div className="border-t border-border-subtle px-4 py-2">
          <Link
            to={`/settings/categories/classify?ids=${[...block.rows, ...block.tail]
              .map((r) => r.cat.id)
              .join(',')}`}
            className="-my-2 inline-flex min-h-11 items-center text-2xs font-medium text-fg-accent underline"
          >
            Phân loại {block.rows.length + block.tail.length} danh mục này
          </Link>
        </div>
      )}

      <ul className={viewMode === 'table' ? '' : ''}>
        {viewMode === 'table' && (
          <li
            className={`${TABLE_COLS} border-t border-border-subtle bg-surface-chrome px-4 py-1.5 text-2xs uppercase tracking-label text-fg-muted`}
          >
            <span />
            <span>Danh mục</span>
            <span className="text-right">TB {SUGGEST_MONTHS} th</span>
            <span className="hidden text-right sm:block">Cao nhất</span>
            <span className="hidden text-right sm:block">{SUGGEST_MONTHS} tháng</span>
            <span className="text-right text-fg-secondary">Hạn mức</span>
          </li>
        )}
        {block.rows.map((r) =>
          viewMode === 'table' ? (
            <TableRow
              key={r.cat.id}
              row={r}
              base={base}
              money={money}
              onEdit={onEdit}
              onSplit={onSplit}
              slider={rowSlider}
            />
          ) : (
            <ListRow
              key={r.cat.id}
              row={r}
              base={base}
              money={money}
              open={groupOpen.has(r.cat.id)}
              onToggle={() => onToggleGroup(r.cat.id)}
              onEdit={onEdit}
              onSplit={onSplit}
              slider={rowSlider}
            />
          ),
        )}

        {/* ĐUÔI DÀI gấp lại (B34.2). Ngưỡng là số TIỀN tuyệt đối, không phải "10 dòng
            cuối": cái đáng gấp là dòng không đáng đọc, mà "không đáng đọc" ở đây là một
            con số tiền. Đóng theo mặc định, ghi nhớ theo khối. */}
        {block.tail.length > 0 && (
          <li className="border-t border-border-subtle">
            <button
              type="button"
              onClick={onToggleTail}
              aria-expanded={tailOpen}
              className="flex min-h-11 w-full items-center gap-3 px-4 text-left"
            >
              {tailOpen ? (
                <ChevronDown className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden />
              ) : (
                <ChevronRight className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden />
              )}
              <span className="min-w-0 flex-1 truncate text-sm text-fg-muted">
                {block.tail.length} mục dưới {money(TAIL_LIMIT)} —{' '}
                {nameList(block.tail.map((r) => r.cat.name))}
              </span>
              <Money amount={block.tailTotal} currency={base} className="shrink-0 text-2xs !text-fg-muted" />
            </button>
            {tailOpen && (
              <ul>
                {block.tail.map((r) =>
                  viewMode === 'table' ? (
                    <TableRow
                      key={r.cat.id}
                      row={r}
                      base={base}
                      money={money}
                      onEdit={onEdit}
                      onSplit={onSplit}
                      slider={rowSlider}
                    />
                  ) : (
                    <ListRow
                      key={r.cat.id}
                      row={r}
                      base={base}
                      money={money}
                      open={false}
                      onToggle={() => undefined}
                      onEdit={onEdit}
                      onSplit={onSplit}
                      slider={rowSlider}
                    />
                  ),
                )}
              </ul>
            )}
          </li>
        )}
      </ul>
    </>
  )
}

/**
 * Câu phụ của một dòng ĐÃ ĐẶT — và phần lớn dòng KHÔNG có câu nào (B34.1).
 *
 * `TB · cao nhất` là hai con số để CHỌN một hạn mức; đã chọn rồi thì hết việc. In 29 lần
 * là 29 dòng trông giống nhau trong khi chỉ 3 dòng có gì đáng nói. Giữ lại đúng một mảnh
 * ngắn cho dòng lệch đáng kể, và KHÔNG in `cao nhất` ở đó — nó không phải thứ đang lệch.
 */
/**
 * Trần nhóm của dòng này có lệch tổng mốc con không (`capMismatchNotice`).
 *
 * Mặt Theo dõi dựng câu này từ `BudgetGroupItem`, mặt Lập kế hoạch từ `PlanRow` — hai
 * kiểu khác nhau, MỘT hàm dựng câu. Nếu không thì cùng một nhóm sẽ được hai màn nói
 * bằng hai câu khác nhau.
 */
function groupMismatch(row: PlanRow, money: (v: number) => string) {
  if (!row.groupCap) return null
  return capMismatchNotice(
    {
      capped: true,
      cap: row.limit,
      markerTotal: row.markers.reduce((t, m) => t + m.limit, 0),
      named: row.markers.map((m) => ({ name: m.cat.name, marker: m.limit })),
      childCount: row.childCount,
    },
    money,
  )
}

function rowNote(row: PlanRow, money: (v: number) => string): { text: string; warn: boolean } | null {
  if (row.short > 0) {
    return { text: `đang chờ nâng lên ${money(row.limit + row.short)}`, warn: true }
  }
  const avg = row.suggestion?.average ?? 0
  if (isOffAverage(row.limit, avg)) {
    const factor = row.limit / avg
    const label = factor >= 1 ? `gấp ${factor.toFixed(factor < 10 ? 1 : 0)}×` : `${Math.round(factor * 100)}% của TB`
    return { text: `TB ${money(avg)} — ${label}`, warn: true }
  }
  if (row.committed > 0 && row.committed <= row.limit) {
    return { text: 'khớp cam kết', warn: false }
  }
  return null
}

/** Dòng chế độ Danh sách (38a). */
function ListRow({
  row,
  base,
  money,
  open,
  onToggle,
  onEdit,
  onSplit,
  slider,
}: {
  row: PlanRow
  base: Parameters<typeof Money>[0]['currency']
  money: (v: number) => string
  open: boolean
  onToggle: () => void
  onEdit: (id: string) => void
  onSplit: (id: string) => void
  slider: SliderCtl | null
}) {
  const note = rowNote(row, money)
  const mismatch = groupMismatch(row, money)
  const sliderOpen = slider?.openId === row.cat.id
  return (
    <li className="border-t border-border-subtle">
      <div className="flex items-center gap-2 px-4">
        {/* Trần nhóm xổ ra được, cùng kiểu accordion của mặt theo dõi (B30.6). Mốc con
            nằm BÊN TRONG khi xổ, không đứng riêng ở khối "Mốc con". */}
        {row.groupCap && row.markers.length > 0 ? (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-label={open ? 'Thu gọn mốc con' : 'Xem mốc con'}
            className="-ml-1 flex min-h-11 w-6 shrink-0 items-center justify-center text-fg-muted"
          >
            {open ? (
              <ChevronDown className="h-4 w-4" aria-hidden />
            ) : (
              <ChevronRight className="h-4 w-4" aria-hidden />
            )}
          </button>
        ) : (
          <span aria-hidden className="w-5 shrink-0 text-center text-sm">
            {row.cat.icon}
          </span>
        )}
        {/* Bấm dòng giờ XỔ THANH TRƯỢT, không mở tấm trượt nữa: kéo là việc làm nhiều
            lần trong một lượt lập kế hoạch, còn gõ số chính xác / bật cờ dồn / xoá là
            việc làm một lần — chúng lùi vào "Sửa chi tiết" trong vùng xổ ra. */}
        <button
          type="button"
          onClick={() => (slider ? slider.toggle(row) : onEdit(row.cat.id))}
          aria-expanded={slider ? sliderOpen : undefined}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2 py-1 text-left"
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm text-fg-primary">
              {row.groupCap && <span aria-hidden>{row.cat.icon} </span>}
              {row.cat.name}
              {row.groupCap && (
                <span className="text-2xs text-fg-muted"> trần nhóm · {row.childCount} mục con</span>
              )}
              {row.parentName && (
                <span className="text-2xs text-fg-muted"> trong {row.parentName}</span>
              )}
            </span>
            {note && (
              <span className={`block truncate text-2xs ${note.warn ? 'text-fg-warn' : 'text-fg-muted'}`}>
                {note.text}
              </span>
            )}
          </span>
          <Money
            amount={row.limit}
            currency={base}
            className="w-[4.75rem] shrink-0 text-right text-sm font-semibold"
          />
        </button>
      </div>

      {mismatch && <MismatchNote notice={mismatch} onSplit={() => onSplit(row.cat.id)} />}

      {sliderOpen && slider && <LimitSlider {...slider.propsFor(row)} />}

      {open && row.markers.length > 0 && (
        <ul className="ml-9 mb-2 divide-y divide-border-strong rounded-md bg-surface-sunken px-3">
          {row.markers.map((m) => (
            <li key={m.cat.id}>
              <button
                type="button"
                onClick={() => onEdit(m.cat.id)}
                className="flex min-h-9 w-full items-center justify-between gap-2 text-left text-sm"
              >
                <span className="min-w-0 truncate text-fg-secondary">
                  {m.cat.icon} {m.cat.name}
                  <span className="ml-1 text-2xs text-fg-on-track">mốc</span>
                </span>
                <Money amount={m.limit} currency={base} className="shrink-0 text-2xs !text-fg-on-track" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

/**
 * Dòng chế độ Bảng (38b) — cùng dữ liệu, xếp thành lưới số.
 *
 * Vì sao có chế độ thứ hai: so `TB` với `hạn mức` thành MỘT lần quét dọc thay vì đọc 29
 * câu. Không phải hai màn — cùng `usePlanning()`, cùng bốn khối, khác cách render một dòng.
 */
function TableRow({
  row,
  base,
  money,
  onEdit,
  onSplit,
  slider,
}: {
  row: PlanRow
  base: Parameters<typeof Money>[0]['currency']
  money: (v: number) => string
  onEdit: (id: string) => void
  onSplit: (id: string) => void
  slider: SliderCtl | null
}) {
  const avg = row.suggestion?.average ?? 0
  const mismatch = groupMismatch(row, money)
  const off = isOffAverage(row.limit, avg)
  const sliderOpen = slider?.openId === row.cat.id
  return (
    <li className="border-t border-border-subtle">
      <button
        type="button"
        onClick={() => (slider ? slider.toggle(row) : onEdit(row.cat.id))}
        aria-expanded={slider ? sliderOpen : undefined}
        className={`${TABLE_COLS} min-h-11 w-full px-4 py-1 text-left`}
      >
        <span aria-hidden className="text-center text-sm">
          {row.cat.icon}
        </span>
        <span className="min-w-0 truncate text-sm text-fg-primary">{row.cat.name}</span>
        {avg > 0 ? (
          <Money
            amount={avg}
            currency={base}
            className={`text-right text-2xs ${off ? '!text-fg-warn' : '!text-fg-muted'}`}
          />
        ) : (
          <span className="text-right text-2xs text-fg-muted">—</span>
        )}
        {row.suggestion ? (
          <Money
            amount={row.suggestion.max}
            currency={base}
            className="hidden text-right text-2xs !text-fg-muted sm:block"
          />
        ) : (
          <span className="hidden text-right text-2xs text-fg-muted sm:block">—</span>
        )}
        <span className="hidden justify-end sm:flex">
          {row.suggestion && <LimitSparkline months={row.suggestion.months} />}
        </span>
        <Money amount={row.limit} currency={base} className="text-right text-sm font-semibold" />
      </button>
      {mismatch && <MismatchNote notice={mismatch} onSplit={() => onSplit(row.cat.id)} />}
      {sliderOpen && slider && <LimitSlider {...slider.propsFor(row)} />}
    </li>
  )
}

/**
 * Câu "trần cha lệch tổng con" kèm nút chia một chạm.
 *
 * `under` để màu chìm chứ không phải màu cảnh báo: nó không sai, chỉ là chưa xong. Tô
 * đỏ mọi nhóm chưa chia là biến một việc-chưa-làm thành một lỗi, và một cảnh báo lúc
 * nào cũng kêu thì mất luôn cả lần nó đúng (cùng lý lẽ với `OFF_MIN_GAP` ở `suggest.ts`).
 */
function MismatchNote({
  notice,
  onSplit,
}: {
  notice: NonNullable<ReturnType<typeof groupMismatch>>
  onSplit: () => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 px-4 pb-2">
      <p className={`text-2xs ${notice.kind === 'over' ? 'text-fg-warn' : 'text-fg-muted'}`}>
        {notice.text}
      </p>
      {notice.childCount > 0 && (
        <ActionButton onClick={onSplit}>Chia cho {notice.childCount} mục con</ActionButton>
      )}
    </div>
  )
}

/**
 * Một ô trong hàng bốn ô của mặt lập kế hoạch (18a).
 *
 * `badge` chỉ dùng cho ô Thu dự kiến: chữ "NỀN" nói rằng con số đó là app TỰ SUY từ
 * trung bình các tháng có dữ liệu, không phải người dùng khai. Phân biệt này quan trọng
 * vì cả kế hoạch treo trên nó — chia hết một mẫu số app đoán hộ thì tháng lương thấp là
 * vỡ kế hoạch mà không ai báo trước.
 */
function PlanTile({
  label,
  badge,
  children,
}: {
  label: string
  badge?: string
  children: ReactNode
}) {
  return (
    <div className="min-w-0 rounded-md border border-border-panel bg-surface px-3 py-2.5">
      <p className="flex items-center gap-1 text-2xs uppercase tracking-label text-fg-muted">
        <span className="min-w-0 truncate">{label}</span>
        {badge && (
          <span className="shrink-0 rounded border border-state-warn-border bg-state-warn-bg px-1 text-2xs font-semibold tracking-normal text-state-warn-fg">
            {badge}
          </span>
        )}
      </p>
      <p className="mt-1.5 font-mono text-kpi font-medium tracking-number text-fg-primary">
        {children}
      </p>
    </div>
  )
}
