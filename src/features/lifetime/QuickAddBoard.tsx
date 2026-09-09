// BẢNG CHỌN NHANH — thứ mở ra khi bấm (hoặc kéo ngang) trên NỀN đồ thị.
//
// Đây là nửa còn lại của "đồ thị chính là bàn sửa": `PhaseLane`/`EventPins` sửa thứ ĐÃ CÓ,
// còn bảng này là đường THÊM MỚI, và nó bắt đầu từ chỗ người dùng vừa chỉ vào — không phải
// từ một nút "+ Mốc" ở đâu đó rồi mới gõ năm.
//
// BỐN THỨ ĐÃ GHI SẴN, ĐỪNG LÀM NGƯỢC LẠI
//
// 1. KHOẢNG NĂM ĐI QUA `applySpanToPreset` (quickAddRange.ts) → `applySpanToResult`
//    (quickAddApply.ts). Mỗi mẫu hấp thu khoảng theo nghĩa RIÊNG: kéo 35 năm trên "Mua
//    nhà" là vay 35 năm, trên "Sinh con" là nuôi tới 22 tuổi, còn lại là hai đầu năm.
//    Nhét khoảng vào `end_year` cho tất cả thì "Mua nhà" thành một khoản chi trải 35 năm
//    KHÔNG có tiền trả trước — sai hẳn hình dạng dòng tiền. Cả hai hàm đều thuần và có
//    phép thử; file này không được có bản chép thứ hai của luật đó.
//
// 2. CHIP MANG "NẶNG CỠ NÀO" (`presetWeight`). Con số đó là thứ duy nhất trả lời "bấm cái
//    này thì kế hoạch của tôi đổi bao nhiêu" TRƯỚC khi bấm, và nó không phải tổng các
//    khoản mỗi năm cộng lại (xem presetWeight.ts, lỗi "Sinh con 436万" bắt được trên app
//    2026-09-02). Nó vào đây từ `PresetPanel.tsx` — màn cũ sẽ nghỉ (spec §10), nên nếu
//    không mang theo thì nó chết cùng file đó.
//
// 3. TÍNH NẶNG TRÊN MẪU ĐÃ HẤP THU KHOẢNG, không trên mẫu mặc định: kéo 20 năm trên "Mua
//    nhà" thì con số phải là trả trước + 20 năm trả vay, không phải + 35 năm. Chip nói một
//    số rồi bấm vào ra một số khác là tệ hơn không có số nào.
//
// 4. `+ Mốc trống` KHÔNG dựng qua `presets.ts`. Nó cố tình không có số nào để "kiểm tra
//    lại": người dùng chọn nó chính vì không mẫu nào khớp việc của họ.
import { ArrowDownCircle, ArrowUpCircle, Plus, X } from 'lucide-react'
import { ActionButton, Card, IconButton, Money, Num, SectionTitle } from '../../components/ui'
import type { CurrencyCode } from '../../lib/currencies'
import { LIFE_PRESETS, type LifePreset, type PresetContext, type PresetResult } from './presets'
import { presetWeight } from './presetWeight'
import { applySpanToResult } from './quickAddApply'
import { applySpanToPreset, spanYears, type SpanApply, type YearSpan } from './quickAddRange'

interface Props {
  /** Khoảng năm đã chọn. Hai đầu TRÙNG nhau = một cú bấm, không phải một khoảng. */
  span: YearSpan
  /** Năm sinh — để nói tuổi cạnh năm, đúng cách cả màn này đọc trục thời gian. */
  birthYear: number
  /** Tiền hiển thị của kịch bản — đơn vị của con số "nặng cỡ nào" trên chip. */
  currency: CurrencyCode
  /** Dựng ngữ cảnh mẫu ở một năm. Chỗ gọi biết chặng đang hiệu lực và tỷ giá. */
  buildCtx: (year: number) => PresetContext
  /**
   * Chọn một mẫu. Nhận CẢ `apply` lẫn `result`: chỗ gọi cần `apply` để dựng lại mẫu ở một
   * năm khác khi mẫu sinh CHẶNG và năm đó đã có chặng (`unique (scenario_id, start_year)`,
   * migration 0031 — xem `freePhaseStartYear`), còn `result` để khỏi dựng lại ở ca thường.
   */
  onAddPreset: (preset: LifePreset, apply: SpanApply, result: PresetResult) => void
  /** "+ Mốc trống" — một mốc rỗng đúng khoảng này, mở ngay bảng sửa trong dock. */
  onAddBlank: (span: YearSpan) => void
  onClose: () => void
}

export function QuickAddBoard({
  span,
  birthYear,
  currency,
  buildCtx,
  onAddPreset,
  onAddBlank,
  onClose,
}: Props) {
  const years = spanYears(span)

  return (
    // `w-[26rem]` là `rem` nên bảng nở theo Cài đặt → Cỡ chữ; chỗ gọi kẹp toạ độ NGANG
    // bằng px trong hộp đã đo (xem `TimelinePlot`), đúng cách chip đọc số đang làm.
    //
    // `animate-pop-in` = `omPop` của bản vẽ (opacity + translateY −6px, 160ms). Qua token
    // nên nó tự tắt ở `prefers-reduced-motion: reduce` (index.css).
    <div className="w-[26rem] max-w-full animate-pop-in">
      <Card as="section" padding="panel" elevation="panel">
        <div className="flex items-start gap-2">
          {/* `role="card"` chứ không `micro`: `micro` là VIẾT HOA + giãn chữ, dùng cho
              nhãn một hai từ. Câu này có năm và tuổi trong đó, và cả hai đi qua `<Num>`
              (chữ mono) — viết hoa cả cụm thì nó đọc ra như một mã, không phải một câu. */}
          <SectionTitle role="card" as="h3" className="min-w-0 flex-1">
            {years <= 1 ? (
              <>
                Thêm mốc ở năm <Num>{span.startYear}</Num> · tuổi{' '}
                <Num>{span.startYear - birthYear}</Num>
              </>
            ) : (
              <>
                Thêm mốc cho <Num>{`${span.startYear}–${span.endYear}`}</Num> ·{' '}
                <Num>{years}</Num> năm · tuổi{' '}
                <Num>{`${span.startYear - birthYear}–${span.endYear - birthYear}`}</Num>
              </>
            )}
          </SectionTitle>
          <IconButton variant="ghost" aria-label="Đóng bảng chọn nhanh" title="Đóng (Esc)" onClick={onClose}>
            <X className="h-4 w-4" aria-hidden="true" />
          </IconButton>
        </div>

        <p className="mt-1 text-2xs leading-relaxed text-fg-muted">
          {years <= 1
            ? 'Chọn một mẫu để thêm vào bản nháp — số mặc định, kiểm lại rồi kéo trên đồ thị. Chưa có gì được ghi cho tới khi bấm Lưu.'
            : 'Khoảng bạn vừa kéo vào đúng chỗ của từng mẫu: "Mua nhà"/"Mua xe" nhận làm kỳ hạn vay, "Sinh con" nhận làm tuổi nuôi tới, còn lại nhận làm năm bắt đầu – năm kết thúc.'}
        </p>

        {/* Vùng cuộn: mười mẫu + một nút, ở Cỡ chữ 1,25× chúng cao hơn nửa vùng vẽ. Chặn
            bằng `max-h-[18rem]` (rem, co theo Cỡ chữ) chứ không để bảng dài ra khỏi đồ thị. */}
        <div className="mt-2 flex max-h-[18rem] flex-wrap gap-1.5 overflow-y-auto overscroll-contain">
          {LIFE_PRESETS.map((p) => (
            <PresetChip
              key={p.id}
              preset={p}
              span={span}
              currency={currency}
              buildCtx={buildCtx}
              onAdd={onAddPreset}
            />
          ))}

          {/* Mốc trống — không mẫu nào khớp thì tự khai từ đầu. Đứng CUỐI dải chứ không
              đầu: nó là đường thoát, không phải lựa chọn mặc định. */}
          <ActionButton onClick={() => onAddBlank(span)} title="Một mốc rỗng, tự khai tên và số">
            <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Mốc trống
          </ActionButton>
        </div>
      </Card>
    </div>
  )
}

/**
 * Một chip mẫu. Dựng mẫu NGAY TẠI ĐÂY để hiện được con số "nặng cỡ nào" — `build` thuần
 * và rẻ, cùng cách `PresetPanel` đã làm từ trước.
 */
function PresetChip({
  preset,
  span,
  currency,
  buildCtx,
  onAdd,
}: {
  preset: LifePreset
  span: YearSpan
  currency: CurrencyCode
  buildCtx: (year: number) => PresetContext
  onAdd: (preset: LifePreset, apply: SpanApply, result: PresetResult) => void
}) {
  // Ba bước, theo đúng thứ tự: khoảng → tham số của mẫu này → mẫu đã hấp thu khoảng.
  const apply = applySpanToPreset(preset.id, span)
  const result = applySpanToResult(preset.build(buildCtx(apply.year)), apply)
  // Nặng cỡ nào — tính trên mẫu ĐÃ hấp thu khoảng (lời ghi 3 ở đầu file).
  const weight = presetWeight(result, currency)
  const netOut = weight === null || weight.amountMinor >= 0

  return (
    <ActionButton onClick={() => onAdd(preset, apply, result)} title={preset.hint}>
      {netOut ? (
        <ArrowDownCircle className="h-3.5 w-3.5 shrink-0 text-money-out" aria-hidden="true" />
      ) : (
        <ArrowUpCircle className="h-3.5 w-3.5 shrink-0 text-money-in" aria-hidden="true" />
      )}
      {preset.label}
      {weight !== null && weight.amountMinor !== 0 && (
        <span className="font-mono text-2xs text-fg-muted">
          <Money amount={Math.abs(weight.amountMinor)} currency={currency} compact tone="muted" />
          {weight.kind === 'perYear' ? (
            '/năm'
          ) : weight.years > 1 ? (
            <>
              {' · '}
              <Num tone="muted">{weight.years}</Num> năm
            </>
          ) : null}
        </span>
      )}
    </ActionButton>
  )
}
