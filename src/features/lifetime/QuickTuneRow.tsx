// HÀNG 9 của bản vẽ — "Vặn nhanh": ba thanh trượt, dòng chênh lệch so với bản đã lưu, và
// cặp nút Lưu / Bỏ.
//
// ĐÂY LÀ ĐƯỜNG LƯU CỦA CẢ MÀN. Mọi thứ người dùng làm trên console — kéo một mốc, dời một
// chặng, thêm một mẫu, gõ một con số trong dock — đi vào BẢN NHÁP trong bộ nhớ và không
// có gì xuống Supabase cho tới khi nút "Lưu vào kế hoạch" ở đây được bấm (spec §12). Nút
// này hỏng thì không phải "thiếu một hàng", mà là cả màn không lưu được gì.
//
// Ba thanh trượt lấy ra TỪ panel Giả định của `ScenarioWorkbench` (bản sẽ nghỉ, spec §10)
// — cùng khuôn `<label htmlFor>` + số bên phải + `accent-[var(--…)]`, cùng phép nới biên
// `sliderBound`. Chép ra chứ không sửa tại chỗ: file kia bị xoá ở task kế tiếp.
//
// KHÔNG SỞ HỮU BẢN NHÁP, cùng lý do đã ghi ở `ScenarioWorkbench`: `TuongLaiPage` giữ
// `draft` và truyền xuống, vì đồ thị, dải thống kê và dock đều đọc CÙNG bản nháp đó.
import { useId } from 'react'
import { ActionButton, Card, deltaTone, Num, SectionTitle, signedPct } from '../../components/ui'
import {
  bpsText,
  EXPENSE_ADJ_MAX_PCT,
  EXPENSE_ADJ_MIN_PCT,
  EXPENSE_ADJ_STEP_PCT,
  RETURN_MAX_BPS,
  RETURN_MIN_BPS,
  RETURN_STEP_BPS,
  sliderBound,
  SPREAD_MAX_BPS,
  SPREAD_MIN_BPS,
  SPREAD_STEP_BPS,
} from './quickTune'

interface Props {
  /** `draft.realReturnBps` — lợi suất THỰC, bps. */
  returnBps: number
  onReturnBps: (bps: number) => void
  /** `draft.bandSpreadBps` — nửa độ rộng dải dao động, bps. Xem JSDoc `SPREAD_MIN_BPS`. */
  spreadBps: number
  onSpreadBps: (bps: number) => void
  /** Chi mỗi năm ±, PHẦN TRĂM so với bản đã lưu. 0 = đúng số đã lưu. */
  expenseAdjPct: number
  onExpenseAdjPct: (pct: number) => void
  /**
   * Chênh lệch so với bản đã lưu, đã thành chữ — `changeParts(changes, …)` của
   * `draftText.ts`, CÙNG hàm mà thanh nháp dùng. Không nhận `DraftChange[]` rồi tự ghép ở
   * đây: hai bản ghép là cách hai câu cách nhau vài trăm pixel mô tả cùng một cú vặn bằng
   * hai lối nói khác nhau.
   */
  changeParts: string[]
  /** Đang lưu — hai nút khoá lại, không để bấm hai lần ra hai lệnh ghi. */
  saving: boolean
  onCommit: () => void
  onDiscard: () => void
}

const SLIDER = 'mt-1 h-6 w-full cursor-pointer'
const SLIDER_LABEL = 'text-2xs uppercase tracking-label text-fg-muted'
const SLIDER_COL = 'min-w-[11.25rem] max-w-[17.5rem] flex-1'

export function QuickTuneRow({
  returnBps,
  onReturnBps,
  spreadBps,
  onSpreadBps,
  expenseAdjPct,
  onExpenseAdjPct,
  changeParts,
  saving,
  onCommit,
  onDiscard,
}: Props) {
  const uid = useId()
  const returnBound = sliderBound(RETURN_MIN_BPS, RETURN_MAX_BPS, returnBps, RETURN_STEP_BPS)
  const spreadBound = sliderBound(SPREAD_MIN_BPS, SPREAD_MAX_BPS, spreadBps, SPREAD_STEP_BPS)
  const dirty = changeParts.length > 0

  return (
    <Card as="section" padding="panel" elevation="panel">
      <div className="flex min-w-0 flex-wrap items-start gap-x-5 gap-y-3">
        <SectionTitle role="micro" className="shrink-0">
          Vặn nhanh
        </SectionTitle>

        {/* --- Lợi suất thực -------------------------------------------------------- */}
        <div className={SLIDER_COL}>
          <div className="flex items-baseline justify-between gap-2">
            <label htmlFor={`${uid}-return`} className={SLIDER_LABEL}>
              Lợi suất thực / năm
            </label>
            <Num className="text-sm font-semibold">{bpsText(returnBps)}</Num>
          </div>
          <input
            id={`${uid}-return`}
            type="range"
            min={returnBound.min}
            max={returnBound.max}
            step={RETURN_STEP_BPS}
            value={returnBps}
            onChange={(e) => onReturnBps(Number(e.target.value))}
            className={`${SLIDER} accent-[var(--accent)]`}
          />
        </div>

        {/* --- Chi mỗi năm ± --------------------------------------------------------
                Thanh này KHÔNG cắm vào một cột riêng nào: nó nhân chi mỗi năm của mọi
                chặng khai số tuyệt đối, tính từ bản ĐÃ LƯU (`scaleExpenses`). Nên kéo về
                0 trả lại đúng từng đồng đã lưu, và không có cột "hệ số chi" nào phải thêm
                vào lược đồ. */}
        <div className={SLIDER_COL}>
          <div className="flex items-baseline justify-between gap-2">
            <label htmlFor={`${uid}-expense`} className={SLIDER_LABEL}>
              Chi mỗi năm ±
            </label>
            {/* `signedPct` + `deltaTone` (Num.tsx) chứ không tự ghép dấu: chúng sở hữu
                dấu ÂM THẬT (−, U+2212) và quy ước "tăng chi là tông chi, giảm chi là tông
                thu" mà bốn màn khác đang dùng. */}
            <Num className="text-sm font-semibold" tone={deltaTone(expenseAdjPct)}>
              {signedPct(expenseAdjPct)}
            </Num>
          </div>
          <input
            id={`${uid}-expense`}
            type="range"
            min={EXPENSE_ADJ_MIN_PCT}
            max={EXPENSE_ADJ_MAX_PCT}
            step={EXPENSE_ADJ_STEP_PCT}
            value={expenseAdjPct}
            onChange={(e) => onExpenseAdjPct(Number(e.target.value))}
            className={`${SLIDER} accent-[var(--accent)]`}
          />
        </div>

        {/* --- Dải dao động ± (thanh cảnh báo của bản vẽ) --------------------------- */}
        <div className={SLIDER_COL}>
          <div className="flex items-baseline justify-between gap-2">
            <label htmlFor={`${uid}-spread`} className={SLIDER_LABEL}>
              Dải dao động ±
            </label>
            <Num className="text-sm font-semibold" tone="warn">
              ±{bpsText(spreadBps)}
            </Num>
          </div>
          <input
            id={`${uid}-spread`}
            type="range"
            min={spreadBound.min}
            max={spreadBound.max}
            step={SPREAD_STEP_BPS}
            value={spreadBps}
            onChange={(e) => onSpreadBps(Number(e.target.value))}
            className={`${SLIDER} accent-[var(--fg-warn)]`}
          />
          <p className="text-2xs text-fg-disabled">
            bi quan <Num tone="out">{bpsText(returnBps - spreadBps)}</Num> · lạc quan{' '}
            <Num tone="in">{bpsText(returnBps + spreadBps)}</Num>
          </p>
        </div>

        {/* --- Dòng chênh lệch + Lưu / Bỏ ------------------------------------------
                `basis-full` để khối này LUÔN chiếm một dòng riêng: chen nó vào cùng dòng
                với ba thanh trượt thì ở 1280px mỗi thanh còn ~11rem, tức núm và số đọc
                chồng nhau. Câu chênh lệch giãn hết chỗ, cặp nút dán mép phải như bản vẽ. */}
        <div className="flex min-w-0 basis-full items-center gap-2.5 border-t border-border-subtle pt-2.5">
          <p className="min-w-0 flex-1 text-2xs leading-relaxed text-fg-secondary">
            {dirty ? `Đang đổi: ${changeParts.join(' · ')}.` : 'Trùng bản đã lưu.'}
          </p>
          <ActionButton
            variant="primary"
            onClick={onCommit}
            disabled={!dirty || saving}
            className="shrink-0"
          >
            {saving ? 'Đang lưu…' : 'Lưu vào kế hoạch'}
          </ActionButton>
          <ActionButton onClick={onDiscard} disabled={!dirty || saving} className="shrink-0">
            Bỏ
          </ActionButton>
        </div>
      </div>
    </Card>
  )
}
