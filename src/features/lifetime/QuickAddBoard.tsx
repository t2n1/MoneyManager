// BẢNG CHỌN NHANH — thứ mở ra khi bấm (hoặc kéo ngang) trên NỀN đồ thị.
//
// Đây là nửa còn lại của "đồ thị chính là bàn sửa": `PhaseLane`/`EventPins` sửa thứ ĐÃ CÓ,
// còn bảng này là đường THÊM MỚI, và nó bắt đầu từ chỗ người dùng vừa chỉ vào — không phải
// từ một nút "+ Mốc" ở đâu đó rồi mới gõ năm.
//
// NĂM THỨ ĐÃ GHI SẴN, ĐỪNG LÀM NGƯỢC LẠI
//
// 1. KHOẢNG NĂM ĐI QUA `applySpanToPreset` (quickAddRange.ts) → `applySpanToResult`
//    (quickAddApply.ts). Mỗi mẫu hấp thu khoảng theo nghĩa RIÊNG: kéo 35 năm trên "Mua
//    nhà" là vay 35 năm, trên "Sinh con" là nuôi tới 22 tuổi, còn lại là hai đầu năm.
//    Nhét khoảng vào `end_year` cho tất cả thì "Mua nhà" thành một khoản chi trải 35 năm
//    KHÔNG có tiền trả trước — sai hẳn hình dạng dòng tiền. Cả hai hàm đều thuần và có
//    phép thử; file này không được có bản chép thứ hai của luật đó.
//
// 2. DÒNG MẪU MANG "NẶNG CỠ NÀO" (`presetWeight`). Con số đó là thứ duy nhất trả lời "bấm
//    cái này thì kế hoạch của tôi đổi bao nhiêu" TRƯỚC khi bấm, và nó không phải tổng các
//    khoản mỗi năm cộng lại (xem presetWeight.ts, lỗi "Sinh con 436万" bắt được trên app
//    2026-09-02). Nó vào đây từ `PresetPanel.tsx` — màn cũ, đã nghỉ ở Task 16 — nên nếu
//    không mang theo thì nó đã chết cùng file đó.
//
// 3. TÍNH NẶNG TRÊN MẪU ĐÃ HẤP THU KHOẢNG, không trên mẫu mặc định: kéo 20 năm trên "Mua
//    nhà" thì con số phải là trả trước + 20 năm trả vay, không phải + 35 năm. Một dòng nói
//    một số rồi bấm vào ra một số khác là tệ hơn không có số nào.
//
// 4. `+ Mốc trống` KHÔNG dựng qua `presets.ts`. Nó cố tình không có số nào để "kiểm tra
//    lại": người dùng chọn nó chính vì không mẫu nào khớp việc của họ.
//
// 5. DANH SÁCH MỘT CỘT, MÀU RÚT VỀ ICON (người dùng chọn, 2026-09-10).
//
//    Bản trước dựng mỗi mẫu bằng một `ActionButton` — nút chữ dùng chung của cả app: cao
//    44px, bo tròn hết cạnh, và tô VIỀN + CHỮ theo `preset.color`. Chín nút như thế, bảy
//    màu khác nhau, tự xếp so le hai cột. Người dùng xem trên app gọi đúng ba thứ: "to",
//    "thô kệch", "màu sắc không đồng nhất ở mỗi cục".
//
//    Cả ba đều là hệ quả của một quyết định: chở thông tin bằng KÍCH CỠ và MÀU NỀN/VIỀN.
//    Bản này chở bằng VỊ TRÍ — một cột, số tiền thẳng cột nên đọc được "cái nào nặng nhất"
//    chỉ bằng cách rê mắt xuống, việc mà chín cái pill xếp so le không làm được vì con số
//    của mỗi cái nằm ở một hoành độ khác nhau.
//
//    `preset.color` KHÔNG bị xoá — nó vẫn là màu mà mốc sẽ mang sau khi bấm (bản vẽ
//    dsg-handoff/README.md §"Bảng chọn nhanh": "10 chip mẫu, mỗi chip một màu riêng"), chỉ
//    thu về đúng cái ICON thay vì tô cả viền lẫn chữ. Vẫn qua `eventTint` (planColors.ts)
//    chứ không tra `TAG_HEX` tay: dòng này SINH ra một mốc mang đúng khoá màu đó, nên nó
//    phải tô bằng chính hàm sẽ tô cái mốc ấy (Finding 6, review 2026-09-09).
//
//    CHIỀU TIỀN (Thu/Chi) trước do một mũi tên lên/xuống nói; giờ do `tone` của `<Money>`
//    nói — đỏ/xanh đúng cách mọi con số khác trong app nói chiều tiền. Đổi vậy vì mũi tên
//    đã phải nhường ô icon cho `preset.icon` (lời ghi 6), và một dòng có HAI icon là quay
//    lại đúng chỗ rậm rạp vừa dọn.
//
// 6. ICON LẤY TỪ `preset.icon`, không phải mũi tên Thu/Chi. Chín mẫu trước đây chung đúng
//    một mũi tên xuống — tức chín dòng chỉ khác nhau ở chữ, đúng cái mà `eventIcons.tsx`
//    (đầu file) ghi là lý do bộ icon tồn tại. Khoá đó cũng đi theo mốc lên trục thời gian
//    (xem `LIFE_PRESETS` cuối presets.ts), nên icon trên dòng mẫu và icon trên trục là
//    CÙNG một hình — đó là thứ nối cái vừa bấm với cái vừa hiện ra.
import { Plus, X } from 'lucide-react'
import { Guide } from '../../components/Guide'
import { ActionButton, Card, IconButton, Money, Num, SectionTitle } from '../../components/ui'
import type { CurrencyCode } from '../../lib/currencies'
import { EventIcon } from './eventIcons'
import { eventTint } from './planColors'
import { LIFE_PRESETS, type LifePreset, type PresetContext, type PresetResult } from './presets'
import { presetWeight } from './presetWeight'
import { applySpanToResult } from './quickAddApply'
import { applySpanToPreset, spanYears, type SpanApply, type YearSpan } from './quickAddRange'

interface Props {
  /** Khoảng năm đã chọn. Hai đầu TRÙNG nhau = một cú bấm, không phải một khoảng. */
  span: YearSpan
  /** Năm sinh — để nói tuổi cạnh năm, đúng cách cả màn này đọc trục thời gian. */
  birthYear: number
  /** Tiền hiển thị của kịch bản — đơn vị của con số "nặng cỡ nào" trên mỗi dòng. */
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
    // `w-[24rem]` là `rem` nên bảng nở theo Cài đặt → Cỡ chữ; chỗ gọi kẹp toạ độ NGANG
    // bằng px trong hộp đã đo (`QUICK_BOARD_HALF_W_PX` ở plotFrame.ts — đổi bề rộng ở đây
    // thì đổi cả hằng số đó, nó tính từ chính con số này).
    //
    // `animate-pop-in` = `omPop` của bản vẽ (opacity + translateY −6px, 160ms). Qua token
    // nên nó tự tắt ở `prefers-reduced-motion: reduce` (index.css).
    <div className="w-[24rem] max-w-full animate-pop-in">
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

        {/* Finding 4 (review 2026-09-09): hai nhánh này TỪNG chung một `<p>` qua một biểu
            thức ba ngôi — guardrail `tests/designSystem.test.ts` đếm văn xuôi bằng cách
            BÓC hết `{…}` rồi đếm ký tự còn lại, nên cả khối tính ra 0 ký tự dù có ~120 ký
            tự chữ DẠY thật bên trong (thoát trần bằng một kỹ thuật, không phải bằng việc
            thật sự ngắn). Tách THẬT theo đúng ranh giới `Guide.tsx` vẽ (dòng 6-10): câu
            CHỈ ĐƯỜNG ngắn, GIỐNG NHAU cho cả hai nhánh ("chọn một mẫu"), đứng NGOÀI
            `<Guide>` — đúng ngoại lệ trạng thái rỗng mà `Guide.tsx:12-17` ghi, và đủ ngắn
            (<45 ký tự) nên guardrail tự bỏ qua theo đúng thiết kế của nó, không phải một kẽ
            hở. Phần GIẢI THÍCH — mỗi mẫu HIỂU khoảng đã kéo thế nào, số là mặc định chưa
            ghi gì — là chữ DẠY thật, bọc `<Guide>`, biến mất ở chế độ Gọn (mặc định của
            app) đúng như mọi đoạn dạy khác. KHÔNG nâng PROSE_MAX. */}
        <p className="mt-1 text-2xs leading-relaxed text-fg-muted">
          Chọn một mẫu để thêm vào bản nháp.
        </p>
        <Guide className="mt-1 text-2xs leading-relaxed text-fg-muted">
          {years <= 1
            ? 'Số mặc định, kiểm lại rồi kéo trên đồ thị. Chưa có gì được ghi cho tới khi bấm Lưu.'
            : 'Khoảng bạn vừa kéo vào đúng chỗ của từng mẫu: "Mua nhà"/"Mua xe" nhận làm kỳ hạn vay, "Sinh con" nhận làm tuổi nuôi tới, còn lại nhận làm năm bắt đầu – năm kết thúc.'}
        </Guide>

        {/* Vùng cuộn: chín mẫu ở Cỡ chữ 1,25× vẫn cao hơn nửa vùng vẽ. Chặn bằng
            `max-h-[18rem]` (rem, co theo Cỡ chữ) chứ không để bảng dài ra khỏi đồ thị. */}
        <div className="mt-2 max-h-[18rem] overflow-y-auto overscroll-contain rounded-md border border-border-subtle">
          <ul className="divide-y divide-border-subtle">
            {LIFE_PRESETS.map((p) => (
              <PresetRow
                key={p.id}
                preset={p}
                span={span}
                currency={currency}
                buildCtx={buildCtx}
                onAdd={onAddPreset}
              />
            ))}
          </ul>
        </div>

        {/* Mốc trống — không mẫu nào khớp thì tự khai từ đầu. Đứng NGOÀI danh sách và DƯỚI
            nó: nó không phải một mẫu (lời ghi 4), và nó là đường thoát chứ không phải lựa
            chọn mặc định. */}
        <div className="mt-2">
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
 * Một dòng mẫu. Dựng mẫu NGAY TẠI ĐÂY để hiện được con số "nặng cỡ nào" — `build` thuần
 * và rẻ, cùng cách `PresetPanel` đã làm từ trước.
 */
function PresetRow({
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
  const mau = eventTint(preset.color, netOut ? 'expense' : 'income').color
  // Giữ chính `weight` (không phải một cờ boolean): một cờ không thu hẹp kiểu, nên
  // `weight.amountMinor` phía dưới sẽ là lỗi biên dịch "possibly null".
  const so = weight !== null && weight.amountMinor !== 0 ? weight : null

  return (
    <li>
      {/* Bốn cột bề rộng CỐ ĐỊNH (rem, không px — chúng phải co theo Cỡ chữ): icon · tên ·
          tiền · quãng. Cố định là chủ ý duy nhất của cả bản này — số tiền của chín mẫu
          nằm trên cùng một hoành độ thì so được với nhau bằng mắt (lời ghi 5). */}
      <button
        type="button"
        onClick={() => onAdd(preset, apply, result)}
        title={preset.hint}
        className="grid w-full grid-cols-[1.25rem_minmax(0,1fr)_4.5rem_3.25rem] items-center gap-2 px-2 py-1.5 text-left transition hover:bg-surface-sunken"
      >
        {/* Icon kế thừa `currentColor` (lucide), nên tô màu mẫu bằng `color` trên thẻ bọc
            là đủ — không cần `EventIcon` nhận thêm prop style. */}
        <span className="flex justify-center" style={{ color: mau }}>
          <EventIcon
            icon={preset.icon}
            kind={netOut ? 'expense' : 'income'}
            className="h-4 w-4 shrink-0"
          />
        </span>
        <span className="truncate text-xs text-fg-primary">{preset.label}</span>
        {/* Hai ô cuối LUÔN được vẽ, kể cả khi rỗng: lưới tự dồn phần tử sang ô trống, nên
            một `null` ở đây làm quãng năm của dòng đó nhảy vào cột tiền. */}
        {so !== null ? (
          <Money
            amount={Math.abs(so.amountMinor)}
            currency={currency}
            compact
            tone={netOut ? 'out' : 'in'}
            className="text-right text-2xs"
          />
        ) : (
          <span />
        )}
        <span className="text-right text-2xs text-fg-muted">
          {so === null ? null : so.kind === 'perYear' ? (
            '/năm'
          ) : so.years > 1 ? (
            <>
              <Num tone="muted">{so.years}</Num> năm
            </>
          ) : null}
        </span>
      </button>
    </li>
  )
}
