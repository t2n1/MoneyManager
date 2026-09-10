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
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, FilterChip, Money, Num } from '../../components/ui'
import { ExplainBox } from '../../components/ExplainBox'
import type { CurrencyCode } from '../../lib/currencies'
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
}

const SOURCE_LABEL: Record<'event' | 'planned' | 'goal', string> = {
  event: 'kịch bản',
  planned: 'khoản sắp chi',
  goal: 'mục tiêu',
}

export function BigExpenseMapPane({ data, displayCurrency, surplus, hasMissingRate }: Props) {
  const { map, life } = data
  // Mặc định "Cả đời": hàng này tên là bản ĐỒ khoản lớn, và bản vẽ vẽ nó xếp theo tổng cả
  // đời. Câu "cần dành mỗi tháng" là câu thứ hai, một cú bấm là tới.
  const [mode, setMode] = useState<CachXep>('life')

  const over = surplus !== null && map.totalMonthlyNeedMinor > surplus.monthlyMinor
  const heavy = map.heavyYears.length > 0 ? map.heavyYears[0] : null
  const heavyRow = heavy !== null ? map.yearPressure.find((y) => y.year === heavy) : null
  const doiNhat = life.items.length > 0 ? Math.abs(life.items[0].totalMinor) : 0

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
            <ul className="mt-2 divide-y divide-border-subtle">
              {life.items.map((i) => {
                const ra = i.totalMinor > 0
                const pct =
                  life.totalSpendMinor > 0 && ra ? (i.totalMinor / life.totalSpendMinor) * 100 : null
                return (
                  <li key={`${i.kind}:${i.id}`} className="py-2">
                    <span className="flex items-baseline gap-2">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-fg-primary">{i.label}</span>
                        <span className="block text-2xs text-fg-muted">
                          {i.kind === 'phase' ? 'sinh hoạt' : 'mốc'} ·{' '}
                          <Num tone="muted">{i.years} năm</Num>
                          {pct !== null && (
                            <>
                              {' · '}
                              <Num tone="muted">{Math.round(pct)}%</Num> tổng chi
                            </>
                          )}
                        </span>
                      </span>
                      <Money
                        amount={Math.abs(i.totalMinor)}
                        currency={displayCurrency}
                        tone={ra ? 'out' : 'in'}
                        approx={hasMissingRate}
                        className="text-sm"
                      />
                    </span>
                    {/* Thanh tỉ lệ — bản vẽ §"Bản đồ khoản lớn". Bề rộng là số tính được
                        nên đi qua `style`, không phải một class tuỳ ý. */}
                    <span
                      aria-hidden
                      className="mt-1 block h-1 overflow-hidden rounded-full bg-surface-sunken"
                    >
                      <span
                        className={`block h-full rounded-full ${ra ? 'bg-money-out' : 'bg-money-in'}`}
                        style={{
                          width: `${doiNhat > 0 ? (Math.abs(i.totalMinor) / doiNhat) * 100 : 0}%`,
                        }}
                      />
                    </span>
                  </li>
                )
              })}
            </ul>
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
