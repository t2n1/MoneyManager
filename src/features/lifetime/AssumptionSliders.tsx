// Panel GIẢ ĐỊNH — ba giả định vặn tại chỗ (§4.4 / 13b), cột phải của tab Tương lai.
//
// Trước bản này, muốn thử "nếu chi ít hơn ¥300k mỗi năm thì sao" phải: mở trình sửa →
// tìm chặng đang chạy → gõ số → lưu → đóng → nhìn đồ thị → thấy sai → mở lại. Sáu bước
// cho một câu hỏi "nếu như", và mỗi lần thử là một lần GHI ĐÈ dữ liệu thật.
//
// Ở đây: kéo, thấy ngay, và chỉ ghi khi bấm Lưu. Giá trị đang kéo sống trong bộ nhớ
// (`AssumptionOverride`), bản chiếu đọc lớp đè đó — xem assumptions.ts.
//
// VẼ LẠI NGAY TRONG LÚC KÉO là hợp lệ vì cổng R6 đã mở: `projectLifetime` đo được
// 0,063 ms/lần trên bản chiếu 60 năm, dư 252 lần trong một khung 16 ms. Phép thử
// assumptions.test.ts đo lại con số đó mỗi lần chạy, nên nếu ai làm phép chiếu nặng lên
// thì chỗ báo là bộ test chứ không phải người dùng.
//
// §12 "Chuyển động": đồ thị KHÔNG animate trong lúc kéo — hoạt ảnh 60 khung mỗi lần
// nhích một pixel là 60fps giả, và đường vẽ luôn chạy sau ngón tay. Thả tay mới nội
// suy. `onDragChange` báo trạng thái đó lên trên.
import { useId } from 'react'
import { ChevronRight } from 'lucide-react'
import { ActionButton, Card, Money } from '../../components/ui'
import { minimumReturnBps } from './insights'
import {
  hasOverride,
  moneySliderMax,
  moneySliderStep,
  NO_OVERRIDE,
  type AssumptionOverride,
} from './assumptions'
import { phaseRange, phaseSavings } from './summary'
import type { LifetimeInput, LifetimePhase } from './project'
import type { CurrencyCode } from '../../lib/money'

/** Biên khi giá trị nền bằng 0 — không suy ra được gì từ 0 nên phải có một mốc. */
const FALLBACK_MAX: Record<string, number> = { JPY: 10_000_000, VND: 1_000_000_000 }
const fallbackFor = (c: CurrencyCode) => FALLBACK_MAX[c] ?? 10_000_000

/** Lợi suất: 0–10%/năm, bước 0,25%. Cùng khoảng dò của `minimumReturnBps`. */
const RETURN_MAX_BPS = 1000
const RETURN_STEP_BPS = 25

interface Props {
  /** Input ĐÃ áp lớp đè — bản chiếu đang xem dựa trên chính nó. */
  input: LifetimeInput
  /** Chặng đang chạy, lấy từ input đã áp đè (để thanh trượt khớp thứ đang vẽ). */
  phase: LifetimePhase
  override: AssumptionOverride
  onChange: (next: AssumptionOverride) => void
  /** true trong lúc ngón tay còn trên thanh trượt — tắt hoạt ảnh đồ thị (§12). */
  onDragChange: (dragging: boolean) => void
  onSave: () => void
  onReset: () => void
  saving: boolean
  /** Mở trình sửa kịch bản. undefined = chưa tải được hồ sơ, link tự ẩn. */
  onEditScenario?: () => void
}

function Row({
  label,
  htmlFor,
  value,
  children,
  foot,
}: {
  label: string
  htmlFor: string
  value: React.ReactNode
  children: React.ReactNode
  foot?: React.ReactNode
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={htmlFor} className="text-2xs uppercase tracking-[.1em] text-fg-muted">
          {label}
        </label>
        <span className="font-mono text-[0.8125rem] font-medium text-fg-primary">{value}</span>
      </div>
      {children}
      {foot && <p className="mt-0.5 text-2xs text-fg-muted">{foot}</p>}
    </div>
  )
}

// Thanh trượt gốc, tạo kiểu bằng accent-color: nó lật theo token và không cần dựng lại
// tay cầm bằng div — một thanh trượt tự chế thì mất luôn điều khiển bằng bàn phím
// (mũi tên / Home / End) mà <input type="range"> có sẵn.
//
// Mỗi thanh một MÀU riêng (mock turn 31): ba thanh xếp dọc cùng màu thì lúc liếc mắt
// chúng đọc thành một khối, và giá trị đang kéo nằm ở đầu kia của dòng. Màu lấy thẳng
// từ token nghĩa đã có — thu là màu số thu, chi là màu cảnh báo — chứ không đặt bảng
// màu thứ hai cho cùng một ý nghĩa (docs/design-system.md).
const SLIDER =
  'mt-1.5 h-6 w-full cursor-pointer disabled:cursor-not-allowed disabled:opacity-50'

export function AssumptionSliders({
  input,
  phase,
  override,
  onChange,
  onDragChange,
  onSave,
  onReset,
  saving,
  onEditScenario,
}: Props) {
  const id = useId()
  const cur = phase.currency

  const thuMax = moneySliderMax(phase.annualIncomeMinor, fallbackFor(cur))
  const chiMax = moneySliderMax(phase.annualExpenseMinor, fallbackFor(cur))

  // Tối thiểu tính trên input ĐANG XEM (đã áp đè), không trên bản đã lưu: kéo chi lên
  // thì con số "cần bao nhiêu lợi suất" phải đi theo, không thì nó đang trả lời cho một
  // kịch bản khác với cái đang vẽ.
  const toiThieu = minimumReturnBps(input)

  const dirty = hasOverride(override)
  const range = phaseRange(input, phase)
  const savings = phaseSavings(phase)

  return (
    <Card as="section" elevation="panel" padding="panel">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-2xs uppercase tracking-[.1em] text-fg-muted">Giả định</h2>
        {/* Đường vào trình sửa đầy đủ (chặng khác, sự kiện, tỷ giá). Trước đây nó là một
            nút bút chì trơ ở header và một dải chữ 11px chạy hết bề ngang phía trên đồ
            thị — cả hai đều không nói ra là chúng dẫn tới đâu. */}
        {onEditScenario && (
          <button
            type="button"
            onClick={onEditScenario}
            className="inline-flex items-center gap-0.5 text-2xs font-medium text-fg-accent transition active:scale-95"
          >
            Sửa kịch bản
            <ChevronRight className="h-3 w-3" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Ba thanh trượt vặn ĐÚNG MỘT chặng — chặng đang chạy — chứ không vặn cả đời, và
          không có gì trên màn nói ra điều đó trước bản này. Khoảng năm suy từ chặng kế
          tiếp (`phaseRange`), vì `LifetimePhase` không mang năm kết thúc. */}
      <p className="mt-1 text-2xs leading-relaxed text-fg-muted">
        Chặng đang chạy: {phase.label} · {range.start}
        {range.end !== null ? `–${range.end}` : ' trở đi'}. Kéo để xem bản chiếu đổi ngay; muốn
        giữ thì bấm Lưu.
      </p>

      <div className="mt-2.5 flex flex-col gap-3">
        <Row
          label="Thu mỗi năm"
          htmlFor={`${id}-thu`}
          value={<Money amount={phase.annualIncomeMinor} currency={cur} tone="neutral" />}
        >
          <input
            id={`${id}-thu`}
            type="range"
            className={`${SLIDER} accent-[var(--money-in)]`}
            min={0}
            max={thuMax}
            step={moneySliderStep(thuMax)}
            value={phase.annualIncomeMinor}
            disabled={saving}
            onPointerDown={() => onDragChange(true)}
            onPointerUp={() => onDragChange(false)}
            onKeyDown={() => onDragChange(true)}
            onKeyUp={() => onDragChange(false)}
            onChange={(e) => onChange({ ...override, annualIncomeMinor: Number(e.target.value) })}
          />
        </Row>

        <Row
          label="Chi mỗi năm"
          htmlFor={`${id}-chi`}
          value={<Money amount={phase.annualExpenseMinor} currency={cur} tone="neutral" />}
        >
          <input
            id={`${id}-chi`}
            type="range"
            className={`${SLIDER} accent-[var(--fg-warn)]`}
            min={0}
            max={chiMax}
            step={moneySliderStep(chiMax)}
            value={phase.annualExpenseMinor}
            disabled={saving}
            onPointerDown={() => onDragChange(true)}
            onPointerUp={() => onDragChange(false)}
            onKeyDown={() => onDragChange(true)}
            onKeyUp={() => onDragChange(false)}
            onChange={(e) => onChange({ ...override, annualExpenseMinor: Number(e.target.value) })}
          />
        </Row>

        <Row
          label="Lợi suất thực"
          htmlFor={`${id}-ls`}
          value={`${input.realReturnBps / 100}%/năm`}
          // §4.4/13b: "Dưới thanh lợi suất ghi minimumReturnBps". Đây là chỗ con số đó
          // có ích nhất — nó nói kéo tới đâu thì đủ, thay vì để người dùng dò mò.
          // null = dò hết 10% vẫn không đủ; in "10%" ở đây sẽ nói dối rằng 10% là đáp án.
          foot={
            toiThieu === null ? (
              'Không mức lợi suất nào trong khoảng 0–10% đủ để không năm nào âm — phải sửa thu hoặc chi.'
            ) : toiThieu === 0 ? (
              'Thu chi đã tự đủ: không cần lợi suất nào để tránh năm âm.'
            ) : (
              <>
                Tối thiểu để không năm nào âm:{' '}
                <span className="font-mono font-medium">{toiThieu / 100}%</span>
              </>
            )
          }
        >
          <input
            id={`${id}-ls`}
            type="range"
            className={`${SLIDER} accent-[var(--accent)]`}
            min={0}
            max={RETURN_MAX_BPS}
            step={RETURN_STEP_BPS}
            value={Math.min(input.realReturnBps, RETURN_MAX_BPS)}
            disabled={saving}
            onPointerDown={() => onDragChange(true)}
            onPointerUp={() => onDragChange(false)}
            onKeyDown={() => onDragChange(true)}
            onKeyUp={() => onDragChange(false)}
            onChange={(e) => onChange({ ...override, realReturnBps: Number(e.target.value) })}
          />
        </Row>
      </div>

      {/* Hệ quả của hai thanh trượt trên, đứng ngay dưới chúng: kéo thu/chi thì con số
          này đổi theo. Không có nó thì "để dành được bao nhiêu" — câu hỏi thật sự đằng
          sau việc vặn hai thanh đó — phải tự nhẩm trong đầu.
          Tỷ lệ vắng mặt khi thu bằng 0 (`ratePct` null): xem JSDoc `phaseSavings`. */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle pt-3">
        <p className="text-2xs text-fg-muted">
          Để dành{' '}
          <Money amount={savings.amountMinor} currency={cur} className="text-2xs font-medium" />
          /năm
          {savings.ratePct !== null && ` · ${savings.ratePct}%`}
        </p>

        {/* Hai nút chỉ hiện khi có gì để lưu. Một nút Lưu mờ đứng đó thường trực là một
            nút người ta học cách bỏ qua — mock turn 31 vẽ nó hiện sẵn, nhưng đó là ảnh
            của trạng thái ĐANG KÉO, không phải trạng thái nghỉ. */}
        {/* <ActionButton>, không viết tay: nó đã mang sẵn min-h-11, rounded-md (bán kính
            CONTROL 6px của 1a, khác bán kính panel 8px) và cặp bg-accent/text-fg-on-accent
            — chữ trắng trên --accent ở dark chỉ được 2,22:1. designSystem.test.ts canh
            đúng idiom này và đã bắt tôi ở lượt đầu. */}
        {dirty && (
          <div className="flex gap-2">
            <ActionButton variant="primary" onClick={onSave} disabled={saving}>
              {saving ? 'Đang lưu…' : 'Lưu'}
            </ActionButton>
            <ActionButton
              onClick={() => {
                onReset()
                onChange(NO_OVERRIDE)
              }}
              disabled={saving}
            >
              Bỏ
            </ActionButton>
          </div>
        )}
      </div>
    </Card>
  )
}
