// Ba khối của tab Sức khỏe bản 27b mà bản trước không có (hoặc có ở dạng khác):
//   · ScoreBand      — dải ngang 8px thay cung tròn 300px
//   · WeakestCard    — chỉ số rủi ro lên THẺ RIÊNG ở đầu, kèm ba số tách ra
//   · JobLossPanel   — mô phỏng mất việc với thanh trượt THẬT
//
// Bản trước: cung tròn SVG cao ~150px trong một thẻ ~360–420px chỉ để in một con số hai
// chữ số, ba ô đếm "3 Tốt / 2 Cần chú ý / 1 Rủi ro" đếm lại đúng bảng ngay dưới, và chỉ số
// rủi ro nằm ở dòng thứ hai của danh sách cùng cỡ chữ với "Thuế & an sinh 20% · Tốt".

import { useMemo, useState } from 'react'
import { Card, Money, Num, StatusChip } from '../../components/ui'
import { Guide } from '../../components/Guide'
import { formatMoney, type CurrencyCode } from '../../lib/money'
import { STATUS_FILL } from '../../components/ui/statusColors'
import { monteCarloRunway, type Verdict } from './health'

/**
 * Ba vùng của dải điểm — cùng hai mốc 40/70 với `verdictFromScore`, nên "70" trên dải và
 * nhãn "Tốt" của chip không thể nói khác nhau.
 */
const SCORE_BANDS = [
  { tone: 'bad' as const, widthPct: 40 },
  { tone: 'warn' as const, widthPct: 30 },
  { tone: 'good' as const, widthPct: 30 },
]

// ---------------------------------------------------------------------------------
// Dải điểm
// ---------------------------------------------------------------------------------

export function ScoreBand({
  score,
  verdict,
  counted,
  total,
  trend,
}: {
  score: number
  verdict: Verdict
  counted: number
  total: number
  /** Điểm 6 tháng trước, để nói xu hướng. null = chưa lưu lịch sử → khối này ẨN. */
  trend: { monthsAgo: number; then: number } | null
}) {
  return (
    <Card as="section" elevation="panel" padding="panel">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="flex items-end gap-2">
          {/* 44px mono thay cung tròn: con số LÀ nội dung, cung tròn chỉ là bao bì —
              và bao bì đó tốn 150px chiều cao ở đúng đầu trang. */}
          <Num tone="neutral" className="text-[2.75rem] font-medium leading-none tracking-[-.02em]">
            {score}
          </Num>
          <span className="pb-1 text-sm text-fg-muted">/100</span>
        </div>
        <StatusChip tone={verdict === 'unknown' ? 'info' : verdict}>
          {verdict === 'good' ? 'Tốt' : verdict === 'warn' ? 'Cần chú ý' : verdict === 'bad' ? 'Rủi ro' : 'Chưa đủ'}
        </StatusChip>
      </div>

      {/* Dải ngang 8px, cùng ba vùng với mọi thang khác trên trang — nên "70" ở đây và
          "70" ở một dòng bảng nằm cùng một chỗ trên trục. */}
      <div className="relative mt-3 h-2">
        <div className="absolute inset-0 flex overflow-hidden rounded-full">
          {/* Đọc STATUS_FILL, không viết lại sắc độ: dải này phải cùng màu với thang của
              sáu dòng bảng ngay dưới — hai bảng màu song song là hai bảng màu sẽ lệch. */}
          {SCORE_BANDS.map((b) => (
            <span key={b.tone} className={STATUS_FILL[b.tone]} style={{ width: `${b.widthPct}%` }} />
          ))}
        </div>
        <span
          aria-hidden
          className="absolute -top-0.5 h-3 w-0.5 rounded-full bg-fg-primary ring-1 ring-surface"
          style={{ left: `calc(${Math.min(100, Math.max(0, score))}% - 1px)` }}
        />
      </div>
      <div aria-hidden className="mt-1 flex justify-between text-3xs text-fg-muted">
        <span>0 · Rủi ro</span>
        <span>40</span>
        <span>70</span>
        <span>100 · Tốt</span>
      </div>

      <p className="mt-2.5 text-[0.8125rem] text-fg-secondary">
        Chấm được <b>{counted}/{total}</b> chỉ số.
        {trend !== null && (
          <>
            {' '}
            {trend.monthsAgo} tháng qua{' '}
            <b className={score >= trend.then ? 'text-money-in' : 'text-money-out'}>
              {score >= trend.then ? '+' : '−'}
              {Math.abs(score - trend.then)} điểm
            </b>{' '}
            (từ {trend.then}).
          </>
        )}
      </p>
      {/* Ba ô đếm "3 Tốt / 2 Cần chú ý / 1 Rủi ro" ĐÃ BỎ: bảng ngay dưới đếm lại đúng
          chúng, và cột Trạng thái của bảng nói thêm được CHỈ SỐ NÀO — thứ ba ô kia không
          nói được. */}
      {trend === null && (
        <Guide className="mt-1.5 text-2xs text-fg-muted">
          Chưa có xu hướng: app tính điểm mới mỗi lần mở tab và chưa lưu lịch sử điểm, nên
          không biết được tháng này so tháng trước là lên hay xuống. Khối xu hướng ẩn thay vì
          vẽ một thẻ rỗng.
        </Guide>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------------
// Chỗ yếu nhất
// ---------------------------------------------------------------------------------

export function WeakestCard({
  title,
  headline,
  facts,
  base,
  onlyRisk,
}: {
  title: string
  headline: React.ReactNode
  /** Ba số tách ra khỏi câu — mỗi số một nhãn, để đọc được mà không phải phân tích câu. */
  facts: { label: string; value: number | null; text?: string }[]
  base: CurrencyCode
  /** true = đây là chỉ số DUY NHẤT đang ở mức rủi ro. */
  onlyRisk: boolean
}) {
  return (
    <Card
      as="section"
      elevation="panel"
      padding="panel"
      className="border-state-danger-border bg-state-danger-bg"
    >
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[0.8125rem] font-semibold text-fg-primary">Chỗ yếu nhất</h2>
        <span className="text-2xs text-fg-muted">{title}</span>
      </div>
      <p className="text-[0.8125rem] text-fg-primary">{headline}</p>

      <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {facts.map((f) => (
          <div key={f.label} className="rounded-md border border-border-panel bg-surface px-2.5 py-2">
            <dt className="text-2xs uppercase tracking-[.1em] text-fg-muted">{f.label}</dt>
            <dd className="mt-0.5">
              {f.text !== undefined ? (
                <Num>{f.text}</Num>
              ) : f.value === null ? (
                <Num tone="muted">—</Num>
              ) : (
                <Money amount={f.value} currency={base} className="text-sm" />
              )}
            </dd>
          </div>
        ))}
      </dl>

      {onlyRisk && (
        <p className="mt-2 text-2xs text-fg-secondary">
          Đây là chỉ số <b>duy nhất</b> đang ở mức rủi ro — năm chỉ số còn lại đều từ “cần chú
          ý” trở lên.
        </p>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------------
// Mô phỏng mất việc
// ---------------------------------------------------------------------------------

interface Scenario {
  key: string
  label: string
  /** Chi mỗi tháng của kịch bản này. */
  monthlyExpense: number
  note?: string
}

export function JobLossPanel({
  liquidAssets,
  investableAssets,
  monthlyIncomes,
  baseExpense,
  oldRegimeExpense,
  fundMonths,
  fundLabel,
  base,
  monthsCounted,
}: {
  liquidAssets: number
  investableAssets: number
  /** Thu từng tháng đã hoàn tất — mô phỏng đặt chúng về 0 (mất việc). */
  monthlyIncomes: readonly number[]
  /** Chi mỗi tháng theo nếp hiện tại (mặc định của thanh trượt). */
  baseExpense: number
  /** Chi mỗi tháng của nếp CŨ trước cú đổi nếp; null = không có cú đổi nào. */
  oldRegimeExpense: number | null
  /** Quỹ dự phòng ở bảng trên — để chứng minh mối liên hệ khi kéo đầu tư về 0%. */
  fundMonths: number | null
  /**
   * Quỹ dự phòng ĐÃ ĐỊNH DẠNG theo đúng quy ước của bảng ("5,0 tháng" / "≥ 60 tháng").
   *
   * Truyền chuỗi thay vì tự `toFixed(1)` ở đây: quy ước chặn-ở-60 nằm trong `months1` của
   * HealthView, và tự định dạng lại làm khối này in "866,2 tháng" trong khi bảng ngay trên
   * in "≥ 60 tháng" — hai con số cho cùng một chỉ số, trên cùng một màn.
   */
  fundLabel: string
  base: CurrencyCode
  monthsCounted: number
}) {
  const [expense, setExpense] = useState(Math.round(baseExpense))
  const [sellPct, setSellPct] = useState(100)

  // Sàn suy từ CHÍNH mức chi hiện tại, không phải một hằng số: đặt sàn cứng ¥10,000 thì
  // với người chi ¥8,500/tháng thanh trượt có `min` LỚN HƠN `value`, và trình duyệt tự
  // kéo tay cầm về `min` — tức con số hiện ra không phải con số của họ.
  const MIN = Math.max(1_000, Math.round(baseExpense * 0.5))
  const MAX = Math.max(MIN + 1_000, Math.round(baseExpense * 1.8))

  const assets = liquidAssets + Math.round((investableAssets * sellPct) / 100)

  const scenarios: Scenario[] = [
    { key: 'now', label: 'Giữ nguyên nếp chi', monthlyExpense: expense },
    {
      key: 'rent',
      label: 'Thêm tiền thuê tăng 10%',
      monthlyExpense: Math.round(expense * 1.1),
      note: 'kịch bản hợp đồng thuê tăng',
    },
    ...(oldRegimeExpense !== null
      ? [
          {
            key: 'old',
            label: 'Nếp cũ trước khi đổi',
            monthlyExpense: Math.round(oldRegimeExpense),
            note: 'để thấy cú đổi nếp mua được bao nhiêu thời gian',
          },
        ]
      : []),
  ]

  // Mô phỏng: MẤT VIỆC nghĩa là thu = 0, nên dòng tiền ròng mỗi tháng là −chi. Vẫn bốc
  // ngẫu nhiên từ dãy để giữ ĐỘ DAO ĐỘNG thật của chi, chỉ dịch mức trung bình về mức
  // thanh trượt đang chọn.
  const results = useMemo(() => {
    const n = Math.max(monthlyIncomes.length, 3)
    return scenarios.map((sc) => {
      const flows = Array.from({ length: n }, () => -sc.monthlyExpense)
      const r = monteCarloRunway(assets, flows, { iterations: 400 })
      return { ...sc, months: r?.p50 ?? null, horizon: r?.horizon ?? 60 }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets, expense, sellPct, oldRegimeExpense, monthlyIncomes.length])

  const axisMax = 60
  const zeroSell = sellPct === 0

  return (
    <Card as="section" elevation="panel" padding="panel">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[0.8125rem] font-semibold text-fg-primary">
          Tài sản cạn sau bao lâu
        </h2>
        <span className="text-2xs text-fg-muted">mô phỏng · không có thu nhập mới</span>
      </div>

      <ul className="flex flex-col gap-2">
        {results.map((sc) => {
          const survived = sc.months !== null && sc.months >= sc.horizon
          const pct = sc.months === null ? 0 : Math.min(100, (sc.months / axisMax) * 100)
          return (
            <li key={sc.key} className="flex flex-col gap-1">
              <span className="flex flex-wrap items-baseline justify-between gap-x-2 text-2xs">
                <span className="min-w-0 text-fg-secondary">
                  {sc.label}
                  {sc.note && <span className="text-fg-muted"> · {sc.note}</span>}
                </span>
                <Num tone={survived ? 'in' : sc.months !== null && sc.months < 6 ? 'out' : 'neutral'}>
                  {sc.months === null
                    ? '—'
                    : survived
                      ? `không cạn trong ${sc.horizon} tháng`
                      : `${sc.months} tháng`}
                </Num>
              </span>
              <span className="h-2 overflow-hidden rounded-full bg-surface-sunken">
                <span
                  className={`block h-full rounded-full ${
                    survived ? 'bg-money-in' : sc.months !== null && sc.months < 6 ? 'bg-money-out' : 'bg-fg-warn'
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </span>
            </li>
          )
        })}
      </ul>
      <div aria-hidden className="mt-1 flex justify-between text-3xs text-fg-muted">
        <span>0</span>
        <span>15</span>
        <span>30</span>
        <span>45</span>
        <span>60 tháng</span>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="flex flex-wrap items-baseline justify-between gap-x-2">
            <span className="text-2xs text-fg-muted">Chi mỗi tháng</span>
            <Money amount={expense} currency={base} className="text-xs" />
          </span>
          <input
            type="range"
            min={MIN}
            max={MAX}
            step={1_000}
            value={expense}
            onChange={(e) => setExpense(Number(e.target.value))}
            className="min-h-11 w-full accent-[var(--accent)]"
          />
          <span aria-hidden className="flex justify-between text-3xs text-fg-muted">
            <span>{formatMoney(MIN, base)}</span>
            <span>{formatMoney(MAX, base)}</span>
          </span>
        </label>

        <label className="flex flex-col gap-1">
          <span className="flex flex-wrap items-baseline justify-between gap-x-2">
            <span className="text-2xs text-fg-muted">Bán được bao nhiêu phần đầu tư</span>
            <Num>{sellPct}%</Num>
          </span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={sellPct}
            onChange={(e) => setSellPct(Number(e.target.value))}
            className="min-h-11 w-full accent-[var(--accent)]"
            disabled={investableAssets <= 0}
          />
          <span aria-hidden className="flex justify-between text-3xs text-fg-muted">
            <span>0%</span>
            <span>100%</span>
          </span>
        </label>
      </div>

      <p className="mt-2 text-[0.8125rem] text-fg-secondary">
        Đang tính trên <b>{formatMoney(assets, base)}</b> tài sản dùng được
        {investableAssets > 0 && (
          <>
            {' '}
            (tiền lỏng {formatMoney(liquidAssets, base)} + {sellPct}% của{' '}
            {formatMoney(investableAssets, base)} đầu tư)
          </>
        )}
        .
      </p>

      {/* Đây là cách GIẢI THÍCH BẰNG TƯƠNG TÁC cho việc "5 tháng đệm" nằm cạnh "≥60 tháng
          cầm cự": kéo đầu tư về 0% thì con số tụt về đúng quỹ dự phòng. */}
      {/* Câu này CHỈ nói "xấp xỉ bằng nhau" khi hai con số thật sự so được: quỹ dự phòng
          dưới ngưỡng 60 tháng. Trên ngưỡng đó cả hai đều bị chặn ở "≥ 60" nên khẳng định
          chúng khớp nhau là khẳng định về hai cái trần, không về hai phép tính. */}
      {zeroSell && fundMonths !== null && (
        <p className="mt-1.5 rounded-md border border-state-good-border bg-state-good-bg px-2.5 py-2 text-2xs text-state-good-fg">
          Ở <b>0%</b> đầu tư, mô phỏng chỉ còn tiền lỏng.{' '}
          {fundMonths < 60 ? (
            <>
              Con số trên xấp xỉ đúng <b>{fundLabel}</b> của quỹ dự phòng ở bảng trên — hai chỉ
              số đó không đá nhau, chúng chỉ đếm hai rổ khác nhau.
            </>
          ) : (
            <>
              Quỹ dự phòng ở bảng trên cũng đang là <b>{fundLabel}</b>: cả hai đều vượt trần 60
              tháng của thang, nên chúng không còn phân biệt được nhau ở mức này.
            </>
          )}
        </p>
      )}

      {investableAssets <= 0 && (
        <p className="mt-1.5 text-2xs text-fg-muted">
          Chưa có tài khoản đầu tư nào nên thanh trượt thứ hai không có gì để kéo.
        </p>
      )}

      <Guide className="mt-2 text-2xs text-fg-muted">
        Mô phỏng đặt thu nhập về <b>0</b> và trừ dần mức chi bạn chọn, chạy 400 kịch bản trên{' '}
        {monthsCounted} tháng dữ liệu. KHÔNG tính lạm phát, KHÔNG tính thuế khi bán tài sản, và
        không tính trợ cấp thất nghiệp — nên đọc nó là mốc thô để so ba nếp chi với nhau, không
        phải một dự báo.
      </Guide>
    </Card>
  )
}
