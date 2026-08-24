// Khối "Stress test" — sáu cú sốc bật/tắt được, vẽ thêm MỘT đường trên đồ thị.
//
// VÌ SAO TÁCH KHỎI BẢN NHÁP. Dải dao động lạc quan–bi quan trả lời "lợi suất lệch đi
// thì sao"; nó KHÔNG trả lời "mất việc một năm thì sao", "khủng hoảng mất 20% thì sao".
// Hai câu đó khác hẳn nhau: cái đầu là nhiễu quanh một đường, cái sau là một cú va.
//
// Cú sốc KHÔNG BAO GIỜ được ghi xuống dữ liệu, và đó là lý do nó không đi qua
// `ScenarioDraft`: "nếu năm 2030 khủng hoảng" không phải một kế hoạch của người dùng —
// lưu nó vào kịch bản là biến một câu hỏi thành một dự định. Vì vậy khối này đọc/ghi
// thẳng một `StressConfig` sống trong bộ nhớ trang, và thanh nháp ở đầu trang KHÔNG bật
// lên khi bật cú sốc.
import { AlertTriangle } from 'lucide-react'
import { Guide } from '../../components/Guide'
import { Card, SectionTitle } from '../../components/ui'
import type { CurrencyCode } from '../../lib/currencies'
import { formatCompact } from '../../lib/money'
import type { StressConfig } from './project'

/**
 * Giá trị khởi đầu của sáu cú sốc, suy TỪ CHÍNH kịch bản đang xem.
 *
 * Không dùng thẳng `NO_STRESS` (mọi năm bằng 0, số tiền bằng 0): nhãn của công tắc in ra
 * chính mấy con số đó, nên trước khi bật thì dòng phụ đọc thành "chi thêm 0 năm 0". Một
 * mặc định vô nghĩa còn buộc người dùng gõ lại từng ô chỉ để xem thử một lần.
 *
 * Số tiền bệnh nặng = 3/4 chi tiêu MỘT NĂM của chính họ, không phải một con số gõ cứng:
 * gõ cứng thì hợp với ¥ và sai 5000 lần với ₫ — cùng lý do đã ghi ở `extraSavingsForFire`.
 *
 * Mấy khoảng cách năm (2 · 4 · 9 · 14) chỉ để rải sáu cú sốc ra chứ không phải một dự
 * báo: xếp cả sáu vào cùng một năm thì bật hai cái là chúng chồng lên nhau và không đọc
 * ra được cái nào gây ra chỗ gãy nào.
 */
export function defaultStress(
  currentYear: number,
  annualExpenseDisplayMinor: number,
): StressConfig {
  return {
    jobloss: { on: false, year: currentYear + 2 },
    crash: { on: false, year: currentYear + 4, dropPct: 20 },
    illness: {
      on: false,
      year: currentYear + 14,
      amountDisplayMinor: Math.max(1, Math.round(annualExpenseDisplayMinor * 0.75)),
    },
    recession: { on: false, year: currentYear + 4, years: 5 },
    paycut: { on: false, year: currentYear + 9, cutPct: 30 },
    longevity: { on: false, years: 10 },
  }
}

interface Props {
  value: StressConfig
  onChange: (next: StressConfig) => void
  currency: CurrencyCode
  /** Kẹp ô năm trong khoảng bản chiếu — gõ 1999 thì cú sốc không rơi vào năm nào. */
  minYear: number
  maxYear: number
  /** Năm âm đầu tiên của bản chiếu GỐC và của bản CÓ sốc; `null` = không năm nào âm. */
  baseNegativeYear: number | null
  stressNegativeYear: number | null
  birthYear: number
  /**
   * 'card' (mặc định) = khối riêng trong cột Giả định.
   * 'inline' = chỉ RUỘT, không thẻ không tiêu đề — dùng trong tab "Stress test" của bàn
   * sửa kịch bản, nơi tên tab đã nói nó là gì và một thẻ lồng trong thẻ chỉ thêm một
   * tầng viền. Một prop chứ hai component: sáu cú sốc và câu kết luận là phần đáng dùng
   * chung, chép sang chỗ thứ hai là hai bảng cú sốc trôi lệch nhau.
   */
  variant?: 'card' | 'inline'
}

/** Công tắc gạt. `<button role="switch">` chứ không `<input type=checkbox>`: cần một
 *  vùng chạm 44px trải hết bề ngang dòng, và nhãn hai dòng nằm trong chính nút đó. */
function Toggle({
  on,
  label,
  sub,
  onToggle,
}: {
  on: boolean
  label: string
  sub: string
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className="flex min-h-11 w-full items-center gap-2.5 rounded-md py-1 text-left transition hover:bg-surface-sunken"
    >
      <span
        className={`relative block h-5 w-9 shrink-0 rounded-full transition-colors ${
          on ? 'bg-accent' : 'bg-border-strong'
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-surface shadow-sm transition-[left] ${
            on ? 'left-[1.125rem]' : 'left-0.5'
          }`}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-fg-primary">{label}</span>
        <span className="block text-2xs text-fg-muted">{sub}</span>
      </span>
    </button>
  )
}

const FIELD =
  'mt-0.5 block w-full rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm text-fg-primary tabular-nums'

function NumField({
  label,
  value,
  onCommit,
  min,
  max,
  width = 'w-20',
}: {
  label: string
  value: number
  onCommit: (v: number) => void
  min: number
  max: number
  width?: string
}) {
  return (
    <label className={`${width} text-2xs text-fg-muted`}>
      {label}
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        // `onChange` chứ không `onBlur`: đường phủ phải đổi ngay theo con số đang gõ,
        // đó là toàn bộ điểm của khối này. Giá trị ngoài khoảng thì BỎ QUA thay vì kẹp
        // — kẹp lúc đang gõ sẽ nhảy số dưới ngón tay (gõ "2" trong "2035" thành "2026").
        onChange={(e) => {
          const v = Number(e.target.value)
          if (Number.isFinite(v) && v >= min && v <= max) onCommit(v)
        }}
        className={FIELD}
      />
    </label>
  )
}

export function StressPanel({
  value,
  onChange,
  currency,
  minYear,
  maxYear,
  baseNegativeYear,
  stressNegativeYear,
  birthYear,
  variant = 'card',
}: Props) {
  const set = <K extends keyof StressConfig>(k: K, patch: Partial<StressConfig[K]>) =>
    onChange({ ...value, [k]: { ...value[k], ...patch } })

  const anyOn =
    value.jobloss.on ||
    value.crash.on ||
    value.illness.on ||
    value.recession.on ||
    value.paycut.on ||
    value.longevity.on

  const body = (
    <>
      <Guide className="text-2xs leading-relaxed text-fg-muted">
        Lớp phủ thử — vẽ thêm một đường trên đồ thị, không đụng dữ liệu kịch bản và không
        cần lưu.
      </Guide>

      <div className="mt-2 flex flex-col">
        <Toggle
          on={value.jobloss.on}
          label="Mất việc 1 năm"
          sub={`thu về 0 trong năm ${value.jobloss.year}`}
          onToggle={() =>
            set('jobloss', { on: !value.jobloss.on })
          }
        />
        {value.jobloss.on && (
          <div className="mb-1.5 ml-11 flex gap-2">
            <NumField
              label="Năm"
              value={value.jobloss.year}
              min={minYear}
              max={maxYear}
              onCommit={(v) => set('jobloss', { year: v })}
            />
          </div>
        )}

        <Toggle
          on={value.crash.on}
          label={`Khủng hoảng −${value.crash.dropPct}%`}
          sub={`tài sản mất ${value.crash.dropPct}% ngay đầu năm ${value.crash.year}`}
          onToggle={() =>
            set('crash', { on: !value.crash.on })
          }
        />
        {value.crash.on && (
          <div className="mb-1.5 ml-11 flex gap-2">
            <NumField
              label="Năm"
              value={value.crash.year}
              min={minYear}
              max={maxYear}
              onCommit={(v) => set('crash', { year: v })}
            />
            <NumField
              label="Mất (%)"
              value={value.crash.dropPct}
              min={1}
              max={90}
              onCommit={(v) => set('crash', { dropPct: v })}
            />
          </div>
        )}

        <Toggle
          on={value.illness.on}
          label="Bệnh nặng"
          sub={`chi thêm ${formatCompact(value.illness.amountDisplayMinor, currency)} năm ${value.illness.year}`}
          onToggle={() =>
            set('illness', { on: !value.illness.on })
          }
        />
        {value.illness.on && (
          <div className="mb-1.5 ml-11 flex gap-2">
            <NumField
              label="Năm"
              value={value.illness.year}
              min={minYear}
              max={maxYear}
              onCommit={(v) => set('illness', { year: v })}
            />
            <NumField
              label={`Số tiền (${currency})`}
              value={value.illness.amountDisplayMinor}
              min={0}
              max={Number.MAX_SAFE_INTEGER}
              width="w-32"
              onCommit={(v) => set('illness', { amountDisplayMinor: v })}
            />
          </div>
        )}

        <Toggle
          on={value.recession.on}
          label="Suy thoái kéo dài"
          sub={`lợi suất 0% trong ${value.recession.year}–${value.recession.year + value.recession.years - 1}`}
          onToggle={() =>
            set('recession', { on: !value.recession.on })
          }
        />
        {value.recession.on && (
          <div className="mb-1.5 ml-11 flex gap-2">
            <NumField
              label="Năm"
              value={value.recession.year}
              min={minYear}
              max={maxYear}
              onCommit={(v) => set('recession', { year: v })}
            />
            <NumField
              label="Số năm"
              value={value.recession.years}
              min={1}
              max={20}
              onCommit={(v) => set('recession', { years: v })}
            />
          </div>
        )}

        <Toggle
          on={value.paycut.on}
          label={`Giảm thu ${value.paycut.cutPct}%`}
          sub={`thu giảm vĩnh viễn từ năm ${value.paycut.year} (đổi nghề, sức khoẻ…)`}
          onToggle={() =>
            set('paycut', { on: !value.paycut.on })
          }
        />
        {value.paycut.on && (
          <div className="mb-1.5 ml-11 flex gap-2">
            <NumField
              label="Năm"
              value={value.paycut.year}
              min={minYear}
              max={maxYear}
              onCommit={(v) => set('paycut', { year: v })}
            />
            <NumField
              label="Giảm (%)"
              value={value.paycut.cutPct}
              min={1}
              max={90}
              onCommit={(v) => set('paycut', { cutPct: v })}
            />
          </div>
        )}

        <Toggle
          on={value.longevity.on}
          label="Sống thọ hơn dự tính"
          sub={`chiếu thêm ${value.longevity.years} năm quá tuổi cuối của kịch bản`}
          onToggle={() => set('longevity', { on: !value.longevity.on })}
        />
        {value.longevity.on && (
          <div className="mb-1.5 ml-11 flex gap-2">
            <NumField
              label="Thêm năm"
              value={value.longevity.years}
              min={1}
              max={20}
              onCommit={(v) => set('longevity', { years: v })}
            />
          </div>
        )}
      </div>

      {/* Kết luận của cú sốc, viết thành CÂU chứ không để người dùng tự so hai đường:
          đường phủ nói "đi thấp hơn", còn câu này nói thấp hơn thì HẬU QUẢ là gì. */}
      {anyOn && (
        <p className="mt-2 flex items-start gap-1.5 rounded-md border border-state-warn-border bg-state-warn-bg px-2.5 py-2 text-sm leading-relaxed text-state-warn-fg">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            {stressNegativeYear === null
              ? 'Kịch bản chịu được các cú sốc đang bật: vẫn không năm nào âm.'
              : baseNegativeYear === null
                ? `Cú sốc làm nhánh bi quan âm từ ${stressNegativeYear} (tuổi ${stressNegativeYear - birthYear}) — kịch bản gốc vốn không năm nào âm.`
                : `Cú sốc kéo năm âm từ ${baseNegativeYear} lên ${stressNegativeYear}.`}
          </span>
        </p>
      )}
    </>
  )

  if (variant === 'inline') return body

  return (
    <Card as="section" elevation="panel" padding="panel">
      <SectionTitle role="micro" className="mb-1">Stress test</SectionTitle>
      {body}
    </Card>
  )
}
