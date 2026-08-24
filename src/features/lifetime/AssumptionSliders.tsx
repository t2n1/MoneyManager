// Panel GIẢ ĐỊNH — mọi thứ vặn được của kịch bản, cột phải của tab Tương lai.
//
// Trước bản này, muốn thử "nếu chi ít hơn ¥300k mỗi năm thì sao" phải: mở trình sửa →
// tìm chặng đang chạy → gõ số → lưu → đóng → nhìn đồ thị → thấy sai → mở lại. Sáu bước
// cho một câu hỏi "nếu như", và mỗi lần thử là một lần GHI ĐÈ dữ liệu thật.
//
// Ở đây: kéo, thấy ngay, và chỉ ghi khi bấm Lưu ở thanh nháp đầu trang. Giá trị đang
// kéo sống trong `ScenarioDraft` (draft.ts), bản chiếu đọc thẳng bản nháp đó.
//
// VẼ LẠI NGAY TRONG LÚC KÉO là hợp lệ vì cổng R6 đã mở: `projectLifetime` đo được
// 0,063 ms/lần trên bản chiếu 60 năm, dư 252 lần trong một khung 16 ms. Phép thử
// assumptions.test.ts đo lại con số đó mỗi lần chạy, nên nếu ai làm phép chiếu nặng lên
// thì chỗ báo là bộ test chứ không phải người dùng.
//
// KHÔNG còn nút Lưu/Bỏ trong panel này: bản nháp nay gom cả mốc kéo trên đồ thị và mẫu
// thêm từ thư viện, nên "chỗ để lưu" phải là một chỗ DUY NHẤT cho mọi loại thay đổi —
// xem DraftBanner.tsx. Hai nút Lưu ở hai nơi là hai chỗ để quên.
import { useId } from 'react'
import { ChevronRight } from 'lucide-react'
import { Card, Money, SegmentedControl } from '../../components/ui'
import { minimumReturnBps } from './insights'
import { moneySliderMax, moneySliderStep } from './assumptions'
import { phaseRange, phaseSavings } from './summary'
import type { LifetimeInput, LifetimePhase } from './project'
import type { CurrencyCode } from '../../lib/money'

/** Biên khi giá trị nền bằng 0 — không suy ra được gì từ 0 nên phải có một mốc. */
const FALLBACK_MAX: Record<string, number> = { JPY: 10_000_000, VND: 1_000_000_000 }
const fallbackFor = (c: CurrencyCode) => FALLBACK_MAX[c] ?? 10_000_000

/** Lợi suất: 0–10%/năm, bước 0,25%. Cùng khoảng dò của `minimumReturnBps`. */
const RETURN_MAX_BPS = 1000
const RETURN_STEP_BPS = 25
/** Lạm phát: 0–4%/năm, bước 0,25%. */
const INFLATION_MAX_BPS = 400
const INFLATION_STEP_BPS = 25
/** Tuổi chiếu tới: 70–100. Dưới 70 thì bản chiếu ngắn hơn cả kỳ nghỉ hưu. */
const END_AGE_MIN = 70
const END_AGE_MAX = 100
/** Tuổi bắt đầu chặng cuối — biên trên. Trên 80 thì "nghỉ hưu" không còn là một mốc. */
const RETIRE_AGE_MAX = 80

interface Props {
  /** Input ĐÃ áp bản nháp — thanh trượt phải khớp thứ đang vẽ, không phải bản đã lưu. */
  input: LifetimeInput
  /** Chặng đang chạy, lấy từ chính `input` ở trên. */
  phase: LifetimePhase
  birthYear: number
  /** Chặng CUỐI của kịch bản — thanh "nghỉ hưu từ tuổi" dời năm bắt đầu của nó. */
  lastPhase: { label: string; startYear: number } | null
  /** Năm bắt đầu của chặng ngay TRƯỚC chặng cuối; `null` khi chỉ có một chặng. */
  prevPhaseStartYear: number | null
  onIncome: (minor: number) => void
  onExpense: (minor: number) => void
  onReturn: (bps: number) => void
  onRetireYear: (year: number) => void
  onEndAge: (age: number) => void
  /** Giá hiển thị: false = giá hôm nay, true = giá danh nghĩa (có lạm phát). */
  nominal: boolean
  onNominal: (v: boolean) => void
  inflationBps: number
  onInflation: (bps: number) => void
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
// Mỗi thanh một MÀU riêng: mấy thanh xếp dọc cùng màu thì lúc liếc mắt chúng đọc thành
// một khối. Màu lấy thẳng từ token nghĩa đã có — thu là màu số thu, chi là màu cảnh báo
// — chứ không đặt bảng màu thứ hai cho cùng một ý nghĩa (docs/design-system.md).
const SLIDER = 'mt-1.5 h-6 w-full cursor-pointer disabled:cursor-not-allowed disabled:opacity-50'

export function AssumptionSliders({
  input,
  phase,
  birthYear,
  lastPhase,
  prevPhaseStartYear,
  onIncome,
  onExpense,
  onReturn,
  onRetireYear,
  onEndAge,
  nominal,
  onNominal,
  inflationBps,
  onInflation,
  onEditScenario,
}: Props) {
  const id = useId()
  const cur = phase.currency

  const thuMax = moneySliderMax(phase.annualIncomeMinor, fallbackFor(cur))
  const chiMax = moneySliderMax(phase.annualExpenseMinor, fallbackFor(cur))

  // Tối thiểu tính trên input ĐANG XEM (đã áp nháp), không trên bản đã lưu: kéo chi lên
  // thì con số "cần bao nhiêu lợi suất" phải đi theo, không thì nó đang trả lời cho một
  // kịch bản khác với cái đang vẽ.
  const toiThieu = minimumReturnBps(input)

  const range = phaseRange(input, phase)
  const savings = phaseSavings(phase)

  // Thanh "nghỉ hưu từ tuổi" chỉ có nghĩa khi CÓ chặng cuối tách khỏi chặng đang chạy:
  // một kịch bản một chặng thì kéo nó là dời chính chặng đang sống, không phải nghỉ hưu.
  const showRetire = lastPhase !== null && lastPhase.startYear !== phase.startYear
  const retireAge = lastPhase ? lastPhase.startYear - birthYear : 0
  // Không cho lùi vào quá khứ, và không cho vượt qua chặng liền trước (hai chặng đảo
  // thứ tự thì `phaseForYear` bỏ hẳn một chặng và bản chiếu đổi mà không ai hiểu vì sao).
  const retireMin = Math.max(
    input.currentYear - birthYear + 1,
    prevPhaseStartYear !== null ? prevPhaseStartYear - birthYear + 1 : 0,
  )

  return (
    <Card as="section" elevation="panel" padding="panel">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-2xs uppercase tracking-[.1em] text-fg-muted">Giả định</h2>
        {/* Đường vào trình sửa đầy đủ (chặng khác, tỷ giá, tên kịch bản, xoá). */}
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

      {/* Hai thanh thu/chi vặn ĐÚNG MỘT chặng — chặng đang chạy — chứ không vặn cả đời.
          Khoảng năm suy từ chặng kế tiếp (`phaseRange`), vì `LifetimePhase` không mang
          năm kết thúc. */}
      <p className="mt-1 text-2xs leading-relaxed text-fg-muted">
        Chặng đang chạy: {phase.label} · {range.start}
        {range.end !== null ? `–${range.end}` : ' trở đi'}. Kéo để xem bản chiếu đổi ngay; muốn
        giữ thì bấm Lưu ở thanh nháp đầu trang.
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
            onChange={(e) => onIncome(Number(e.target.value))}
          />
        </Row>

        <Row
          label="Chi mỗi năm"
          htmlFor={`${id}-chi`}
          value={<Money amount={phase.annualExpenseMinor} currency={cur} tone="neutral" />}
          // Hệ quả của hai thanh trên, đứng ngay dưới chúng: kéo thu/chi thì con số này
          // đổi theo. Không có nó thì "để dành được bao nhiêu" — câu hỏi thật sự đằng
          // sau việc vặn hai thanh đó — phải tự nhẩm trong đầu.
          // Tỷ lệ vắng mặt khi thu bằng 0 (`ratePct` null): xem JSDoc `phaseSavings`.
          foot={
            <>
              Để dành{' '}
              <Money amount={savings.amountMinor} currency={cur} className="text-2xs font-medium" />
              /năm
              {savings.ratePct !== null && ` · ${savings.ratePct}%`}
            </>
          }
        >
          <input
            id={`${id}-chi`}
            type="range"
            className={`${SLIDER} accent-[var(--fg-warn)]`}
            min={0}
            max={chiMax}
            step={moneySliderStep(chiMax)}
            value={phase.annualExpenseMinor}
            onChange={(e) => onExpense(Number(e.target.value))}
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
            onChange={(e) => onReturn(Number(e.target.value))}
          />
        </Row>

        {/* "Nghỉ hưu sớm hơn thì sao" là câu hỏi lớn thứ hai của cả màn này (sau "tiền
            có đủ không"), mà trước đây trả lời được nó phải mở trình sửa và gõ tay năm
            bắt đầu của chặng cuối. Thanh này kéo đúng con số đó, tính theo TUỔI vì đó
            là đơn vị người ta nghĩ khi nói "nghỉ hưu năm 55". */}
        {showRetire && lastPhase && (
          <Row
            label={`${lastPhase.label} từ tuổi`}
            htmlFor={`${id}-huu`}
            value={`${retireAge} tuổi (${lastPhase.startYear})`}
          >
            <input
              id={`${id}-huu`}
              type="range"
              className={`${SLIDER} accent-[var(--accent)]`}
              min={retireMin}
              max={RETIRE_AGE_MAX}
              step={1}
              value={Math.min(Math.max(retireAge, retireMin), RETIRE_AGE_MAX)}
                onChange={(e) => onRetireYear(birthYear + Number(e.target.value))}
            />
          </Row>
        )}

        <Row
          label="Chiếu đến tuổi"
          htmlFor={`${id}-end`}
          value={`${input.endAge} tuổi (${birthYear + input.endAge})`}
        >
          <input
            id={`${id}-end`}
            type="range"
            className={`${SLIDER} accent-[var(--accent)]`}
            min={END_AGE_MIN}
            max={END_AGE_MAX}
            step={1}
            value={Math.min(Math.max(input.endAge, END_AGE_MIN), END_AGE_MAX)}
            onChange={(e) => onEndAge(Number(e.target.value))}
          />
        </Row>
      </div>

      {/* Giá hiển thị. Đây KHÔNG phải một giả định của kịch bản mà là cách ĐỌC bản
          chiếu: cùng một tương lai, hoặc quy hết về sức mua hôm nay, hoặc in ra con số
          sẽ thật sự nằm trong tài khoản năm đó. Vì vậy nó đứng tách dưới một đường kẻ,
          không xếp chung với mấy thanh trên. */}
      <div className="mt-3 border-t border-border-subtle pt-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-2xs uppercase tracking-[.1em] text-fg-muted">Giá hiển thị</span>
          <SegmentedControl
            size="sm"
            items={[
              { value: 'today', label: 'Hôm nay' },
              { value: 'nominal', label: 'Danh nghĩa' },
            ]}
            value={nominal ? 'nominal' : 'today'}
            onChange={(v) => onNominal(v === 'nominal')}
            label="Giá hiển thị"
            stretch={false}
          />
        </div>
        <p className="mt-1 text-2xs leading-relaxed text-fg-muted">
          {nominal
            ? 'Số in ra là tiền của chính năm đó — nhìn to hơn nhưng mua được ít hơn.'
            : 'Mọi số quy về sức mua hôm nay, dễ so với chi tiêu hiện tại nhất.'}
        </p>

        {/* Thanh lạm phát chỉ có nghĩa ở chế độ danh nghĩa: ở "giá hôm nay" engine
            KHÔNG dùng `inflationBps` ở đâu cả (xem JSDoc `nominalTerms` trong
            project.ts), nên để nó hiện ở đó là một thanh kéo không làm gì. */}
        {nominal && (
          <div className="mt-2">
            <Row
              label="Lạm phát"
              htmlFor={`${id}-lp`}
              value={`${inflationBps / 100}%/năm`}
            >
              <input
                id={`${id}-lp`}
                type="range"
                className={`${SLIDER} accent-[var(--fg-warn)]`}
                min={0}
                max={INFLATION_MAX_BPS}
                step={INFLATION_STEP_BPS}
                value={Math.min(inflationBps, INFLATION_MAX_BPS)}
                    onChange={(e) => onInflation(Number(e.target.value))}
              />
            </Row>
          </div>
        )}
      </div>
    </Card>
  )
}
