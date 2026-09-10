// Bản đồ khoản lớn — PANE của hàng 11/12 (bản vẽ). Toán ở `bigExpenses.ts` +
// `lifetimeCost.ts` (thuần, có test), dữ liệu ở `useBigExpenseMap` (hook) — file này chỉ
// render.
//
// KHÔNG có tiêu đề khối ở đây: chip chuyển pane ngay trên đã nói "Bản đồ khoản lớn ·
// N khoản", và bản vẽ (dòng 699-705 của .dc.html) đặt ở đầu pane một dòng HƯỚNG DẪN chứ
// không phải một tiêu đề thứ hai. Lặp lại tên ngay dưới cái chip vừa bấm là một dòng
// không mang thông tin nào.
//
// Ba nguồn mốc được gộp: sự kiện kịch bản (chỉ có năm), Khoản sắp chi (có ngày), Mục tiêu
// tiết kiệm (có hạn + phần đã dành). Không khử trùng lặp giữa chúng: nhìn thấy đủ rồi tự
// dọn dễ hơn là đoán xem app đã giấu dòng nào.
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ActionButton, Card, FilterChip, Money, Num } from '../../components/ui'
import { ExplainBox } from '../../components/ExplainBox'
import type { CurrencyCode } from '../../lib/currencies'
import { MAP_TOP_N, costRowLook, costRowViews } from './costItemView'
import { EventIcon } from './eventIcons'
import { PhaseIcon } from './PlanDockParts'
import type { DraftEvent, DraftPhase } from './draft'
import type { LifetimeCostItem } from './lifetimeCost'
import type { BigExpenseMapData } from './useBigExpenseMap'

/** Hai câu khác nhau, xem đầu `lifetimeCost.ts`. */
type CachXep = 'life' | 'need'

interface Props {
  /** Đã tính ở trang (chip chuyển pane cũng đọc nó) — xem `useBigExpenseMap`. */
  data: BigExpenseMapData
  displayCurrency: CurrencyCode
  /**
   * Phần dư mỗi tháng để so với tổng "cần để dành". `real` = số THẬT 12 tháng qua
   * (suggestBaseline); false = số kế hoạch của chặng đang chạy. null = chưa tính được.
   */
  surplus: { monthlyMinor: number; real: boolean } | null
  /** Thiếu tỷ giá ở đâu đó trong kế hoạch → mọi tổng cả đời hiện `≈`. */
  hasMissingRate: boolean
  /**
   * Chặng và mốc của BẢN NHÁP — để mỗi dòng lấy đúng icon và màu mà trục đang vẽ, và để
   * bấm một dòng mở được đúng đối tượng đó. Xem `costRowLook`.
   */
  phases: readonly DraftPhase[]
  events: readonly DraftEvent[]
  /** Bấm một dòng → chọn chặng/mốc đó trong dock, đúng đích mà bấm trên trục cũng tới. */
  onPick: (item: LifetimeCostItem) => void
}

const SOURCE_LABEL: Record<'event' | 'planned' | 'goal', string> = {
  event: 'kịch bản',
  planned: 'khoản sắp chi',
  goal: 'mục tiêu',
}

export function BigExpenseMapPane({
  data,
  displayCurrency,
  surplus,
  hasMissingRate,
  phases,
  events,
  onPick,
}: Props) {
  const { map, life } = data
  // Mặc định "Cả đời": hàng này tên là bản ĐỒ khoản lớn, và bản vẽ vẽ nó xếp theo tổng cả
  // đời. Câu "cần dành mỗi tháng" là câu thứ hai, một cú bấm là tới.
  const [mode, setMode] = useState<CachXep>('life')
  /** Bản vẽ giấu bớt còn 9 khoản lớn nhất (dòng 1809), có nút mở hết. */
  const [showAll, setShowAll] = useState(false)
  const lifeRows = useMemo(() => costRowViews(life, { showAll }), [life, showAll])

  const over = surplus !== null && map.totalMonthlyNeedMinor > surplus.monthlyMinor
  const heavy = map.heavyYears.length > 0 ? map.heavyYears[0] : null
  const heavyRow = heavy !== null ? map.yearPressure.find((y) => y.year === heavy) : null

  return (
    <Card as="section" elevation="panel" padding="panel" className="min-w-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
        <p className="min-w-0 flex-1 text-2xs text-fg-muted">
          {mode === 'life'
            ? 'Xếp theo tổng tiền cả đời, gồm sinh hoạt từng chặng'
            : 'Cần để dành mỗi tháng, tính từ hôm nay'}
        </p>
        {/* Hai cách xếp trả lời HAI câu khác nhau, nên là một công tắc chứ không phải hai
            khối nối tiếp: đặt cạnh nhau thì hai bảng trông gần như nhau và người đọc lấy
            số của bảng này gán cho câu của bảng kia. Chip co theo chữ (không `flex-1`) —
            control nhỏ thì vừa đúng chữ, chỗ trống để cho bảng. */}
        <span role="group" aria-label="Cách xếp khoản lớn" className="flex items-center gap-1">
          <FilterChip
            size="sm"
            on={mode === 'life'}
            onClick={() => setMode('life')}
            title="Cả đời khoản nào ngốn nhiều tiền nhất — gộp sinh hoạt từng chặng và từng mốc"
          >
            Cả đời
          </FilterChip>
          <FilterChip
            size="sm"
            on={mode === 'need'}
            onClick={() => setMode('need')}
            title="Mỗi tháng cần để dành bao nhiêu cho các khoản sắp tới"
          >
            Cần dành
          </FilterChip>
        </span>
      </div>

      {mode === 'life' ? (
        life.items.length === 0 ? (
          <p className="mt-2 text-sm text-fg-muted">
            Chưa có chặng đời nào để cộng — thêm một chặng thì bảng này có số.
          </p>
        ) : (
          <>
            {/* Vùng cuộn 340px của bản vẽ (dòng 706) → `21.25rem`, rem để nó co theo Cỡ
                chữ: một chiều cao px cứng ở nấc "Rất lớn" chỉ còn chứa nổi ba dòng. */}
            <ul className="mt-2 max-h-[21.25rem] space-y-1.5 overflow-y-auto overscroll-contain">
              {lifeRows.rows.map(({ item: i, monthlyMinor, sharePct, barPct }) => {
                const ra = i.totalMinor > 0
                const look = costRowLook(i, phases, events)
                return (
                  <li key={`${i.kind}:${i.id}`}>
                    {/* Cả dòng là MỘT nút: bản vẽ ghi "bấm một khoản để mở nó ra sửa"
                        (dòng 701), và đích đến đúng bằng đích mà bấm icon mốc trên trục
                        hay bấm khối chặng cũng tới — cùng một `sel` của dock. Trước bản
                        này bảng này là ngõ cụt: nó nói "nhà ngốn 4.700万" rồi để người
                        dùng tự đi tìm cái mốc đó trên trục. */}
                    <button
                      type="button"
                      onClick={() => onPick(i)}
                      className="grid w-full grid-cols-[minmax(0,1fr)_5.75rem_3.5rem] items-center gap-x-3 rounded-md border border-border-subtle bg-surface px-2.5 py-2 text-left transition hover:border-border-strong sm:grid-cols-[minmax(0,1fr)_5.75rem_5.75rem_3.5rem]"
                    >
                      <span className="min-w-0">
                        <span className="flex items-baseline gap-1.5">
                          {/* Icon tô ĐÚNG màu mà trục đang tô chặng/mốc đó — xem
                              `costRowLook`. Màu là số tính được nên đi qua `style`. */}
                          <span className="flex shrink-0 self-center" style={{ color: look.color }}>
                            {i.kind === 'phase' ? (
                              <PhaseIcon icon={look.icon} />
                            ) : (
                              <EventIcon
                                icon={look.icon}
                                kind={look.kind ?? 'expense'}
                                className="h-4 w-4 shrink-0"
                              />
                            )}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-sm text-fg-primary">
                            {i.label}
                          </span>
                        </span>
                        <span className="mt-0.5 block truncate text-2xs text-fg-muted">
                          {i.kind === 'phase' ? 'sinh hoạt' : 'mốc'} ·{' '}
                          <Num tone="muted">{i.startYear}</Num>
                          {i.endYear !== i.startYear && (
                            <>
                              –<Num tone="muted">{i.endYear}</Num>
                            </>
                          )}{' '}
                          · <Num tone="muted">{i.years}</Num> năm
                        </span>
                        {/* Thanh tỉ lệ — bản vẽ §"Bản đồ khoản lớn". Bề rộng là số tính
                            được nên đi qua `style`, không phải một class tuỳ ý. */}
                        <span
                          aria-hidden
                          className="mt-1 block h-1 overflow-hidden rounded-full bg-surface-sunken"
                        >
                          <span
                            className="block h-full rounded-full"
                            style={{ width: `${barPct}%`, backgroundColor: look.color }}
                          />
                        </span>
                      </span>

                      <Money
                        amount={Math.abs(i.totalMinor)}
                        currency={displayCurrency}
                        tone={ra ? 'out' : 'in'}
                        approx={hasMissingRate}
                        className="text-right text-sm font-semibold"
                      />

                      {/* Cột ≈/tháng ẩn ở bề ngang hẹp: bốn cột số cạnh nhau ở 1024px thì
                          cột tên chỉ còn vài chữ. Nó là con số PHỤ (tổng và % mới là câu
                          trả lời), nên nó là cột nhường chỗ. */}
                      <span className="hidden text-right text-2xs text-fg-muted sm:block">
                        ≈
                        <Money amount={monthlyMinor} currency={displayCurrency} tone="muted" />
                        /tháng
                      </span>

                      {/* Bản vẽ ghi chữ "thu vào" ở cột % cho dòng THU — một khoản thu
                          không có phần nào trong TỔNG CHI, in "12%" ở đó là nói ngược. */}
                      <span
                        className="text-right text-2xs tabular-nums"
                        style={{ color: look.color }}
                      >
                        {sharePct === null ? 'thu vào' : `${Math.round(sharePct)}%`}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>

            {lifeRows.hiddenCount > 0 && (
              <ActionButton
                variant="outline"
                onClick={() => setShowAll(true)}
                className="mt-1.5"
                title="Bảng đang xếp theo tổng cả đời, nên phần bị giấu là những khoản nhỏ nhất"
              >
                Xem tất cả <Num tone="muted">{life.items.length}</Num> khoản
              </ActionButton>
            )}
            {showAll && life.items.length > MAP_TOP_N && (
              <ActionButton variant="outline" onClick={() => setShowAll(false)} className="mt-1.5">
                Thu gọn · chỉ <Num tone="muted">{MAP_TOP_N}</Num> khoản lớn nhất
              </ActionButton>
            )}

            <div className="mt-1 flex items-baseline justify-between gap-2 border-t border-border-panel pt-2">
              <span className="text-sm font-medium text-fg-secondary">Tổng chi cả đời</span>
              <Money
                amount={life.totalSpendMinor}
                currency={displayCurrency}
                tone="out"
                approx={hasMissingRate}
                className="text-sm font-semibold"
              />
            </div>
            <ExplainBox label="Cách tính">
              <p>
                <b>Cả đời</b> cộng chi nền của từng chặng và từng mốc suốt bản chiếu, lấy
                thẳng từ phép chiếu — nên đã gồm lạm phát, tỷ giá, bốn hình dạng số tiền và
                ô &quot;thay cho&quot; (không đếm hai lần phần đã trừ khỏi chi nền).
              </p>
              <p>
                Một mốc mua tài sản gộp cả trả trước, trả nợ và chi phí giữ về MỘT dòng.
                Cú sốc của stress test không vào bảng này — nó là &quot;nếu như&quot;, không
                phải một khoản trong kế hoạch.
              </p>
            </ExplainBox>
          </>
        )
      ) : map.items.length === 0 ? (
        <p className="mt-2 text-sm text-fg-muted">
          Không có mốc nào phía trước cần để dành từ bây giờ.
        </p>
      ) : (
        <>
      <ul className="mt-2 divide-y divide-border-subtle">
        {map.items.map((i) => (
          <li key={`${i.source}:${i.id}`} className="flex items-baseline gap-2 py-2">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-fg-primary">{i.label}</span>
              <span className="block text-2xs text-fg-muted">
                {i.recurring ? (
                  <>
                    {i.everyYears > 1 ? `mỗi ${i.everyYears} năm` : 'mỗi năm'} ·{' '}
                    {SOURCE_LABEL[i.source]}
                  </>
                ) : (
                  <>
                    {i.dueMonth ?? `năm ${i.dueYear}`} ·{' '}
                    <Num tone="muted">{i.monthsLeft} tháng</Num> · {SOURCE_LABEL[i.source]}
                  </>
                )}
              </span>
            </span>
            {i.monthlyNeedMinor === null ? (
              <span className="text-sm text-fg-muted">thiếu tỷ giá</span>
            ) : (
              <Money
                amount={i.monthlyNeedMinor}
                currency={displayCurrency}
                tone="out"
                className="text-sm"
              />
            )}
          </li>
        ))}
      </ul>

      <div className="mt-1 flex items-baseline justify-between gap-2 border-t border-border-panel pt-2">
        <span className="text-sm font-medium text-fg-secondary">Tổng cần để dành</span>
        <Money
          amount={map.totalMonthlyNeedMinor}
          currency={displayCurrency}
          tone="out"
          approx={map.hasMissingFx}
          className="text-sm font-semibold"
        />
      </div>
      {surplus !== null && (
        <div className="flex items-baseline justify-between gap-2 py-1">
          <span className="text-sm text-fg-secondary">
            Phần dư của bạn {surplus.real ? '(12 tháng qua)' : '(theo kế hoạch)'}
          </span>
          <Money
            amount={surplus.monthlyMinor}
            currency={displayCurrency}
            tone={over ? 'muted' : 'in'}
            className="text-sm"
          />
        </div>
      )}

      {over && surplus !== null && (
        <p className="mt-1 text-2xs leading-snug text-state-warn-fg">
          Các mốc đang đòi nhiều hơn phần dư — không mốc nào sai, chúng chỉ chưa từng được
          nhìn cùng lúc. Ba lối thoát đều rẻ khi còn thời gian: dời một mốc, thu nhỏ nó,
          hoặc bắt đầu tích sớm hơn.
        </p>
      )}

      {heavyRow && (
        <div className="flex items-baseline justify-between gap-2 py-1">
          <span className="text-sm text-fg-secondary">
            Năm nặng nhất · <Num tone="muted">{heavyRow.year}</Num> (
            <Num tone="muted">{heavyRow.onceCount} khoản</Num> dồn cùng năm)
          </span>
          <Money
            amount={heavyRow.totalMinor}
            currency={displayCurrency}
            tone="out"
            approx={map.hasMissingFx}
            className="text-sm"
          />
        </div>
      )}

      <ExplainBox label="Cách tính">
        <p>
          <b>Cần mỗi tháng</b> = số còn thiếu ÷ số tháng còn lại. Mốc của kịch bản chỉ có
          NĂM nên tính tới tháng 1 của năm đó — thà dư sớm còn hơn hụt.
        </p>
        <p>
          <b>Mục tiêu tiết kiệm</b> đã trừ phần dành được (số dư tài khoản gắn với nó); mục
          tiêu không đặt hạn không vào bản đồ. Sửa hạn và số tiền ở{' '}
          <Link to="/assets" className="font-medium text-fg-accent">
            tab Tài sản
          </Link>{' '}
          và{' '}
          <Link to="/planned" className="font-medium text-fg-accent">
            Khoản sắp chi
          </Link>
          .
        </p>
      </ExplainBox>
        </>
      )}
    </Card>
  )
}
