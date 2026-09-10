// Bảng sửa một CHẶNG ĐỜI — ruột của `PlanDock` khi đang chọn một chặng (spec §10,
// dsg-handoff README mục "Panel chặng").
//
// Thứ tự của bản vẽ: hàng nhận dạng → Thu/năm + Chi/năm → Tiền tệ khai + Quốc gia →
// dòng để dành → Nhân đôi · Xoá.
//
// GHI THẲNG VÀO BẢN NHÁP, KHÔNG CÓ NÚT "XONG". Đây là chỗ khác hẳn `PhaseFormSheet` (màn
// cũ, đã nghỉ ở Task 16): sheet đó đệm mọi ô trong state cục bộ rồi ghi một lần khi bấm
// Xong, vì nó là một lớp phủ mở ra rồi đóng lại. Dock thì LUÔN mở cạnh đồ thị, và cả lý
// do nó tồn tại là "vặn tới đâu đồ thị đổi tới đó" (spec §12) — một nút Xong ở đây sẽ
// chặn đúng thứ người dùng tới đây để xem. Nên mỗi ô ghi ngay, và lớp nháp vẫn là lớp
// duy nhất bị đụng: không có gì xuống Supabase cho tới khi bấm Lưu ở hàng vặn nhanh
// (Task 15b).
//
// Hệ quả phải xử: một ô ghi ngay thì KHÔNG có chỗ nào để "tắt nút Lưu vì số sai". Nên
// mọi giá trị phải được CHẶN thành hợp lệ thay vì bị từ chối:
//   · năm bắt đầu đi qua `clampPhaseStartYear` (phaseYear.ts) — chặng đầu khoá vào năm
//     hiện tại, chặng sau không trùng năm ai và không lùi về quá khứ;
//   · thu/chi âm bị kẹp về 0 (`check (annual_income_minor >= 0)` của DB, và MoneyField
//     cho gõ biểu thức nên "5 − 9" ra số âm là đường có thật);
//   · phần trăm chặng trước kẹp trong 0…MAX_PHASE_PCT (migration 0067).
//
// GIỮ PHẦN TRĂM CHẶNG TRƯỚC (0067) dù bản vẽ 1c không có ô nào tương đương: spec §13
// liệt kê nó trong danh sách "không được để mất". Xem `phasePercent.ts` để biết vì sao
// nó đáng giữ — "nghỉ hưu thì chi khoảng 80% như bây giờ" là câu trả lời được, còn
// "¥3.480.000/năm vào 2056" thì không.
import { useId } from 'react'
import { Copy, Trash2 } from 'lucide-react'
import { Guide } from '../../components/Guide'
import { MoneyField } from '../../components/MoneyField'
import { ActionButton, Money, Num, Select } from '../../components/ui'
import { CURRENCIES, type CurrencyCode } from '../../lib/money'
import type { DraftPhase } from './draft'
import {
  DOCK_INPUT,
  DOCK_LABEL,
  DockPanel,
  IdentityRow,
  PhaseIcon,
  SegButton,
  YearBox,
} from './PlanDockParts'
import { MAX_PHASE_PCT, resolvePhasePercents } from './phasePercent'
import { clampPhaseStartYear } from './phaseYear'
import { phaseColorKey } from './planColors'
import { PHASE_WORDS } from './planWords'

export interface PlanDockPhaseProps {
  /** MỌI chặng của bản nháp, đã sắp theo năm — cần cho ba việc: chặn năm trùng, biết
   *  "đến năm" (chặng kế tiếp quyết định), và giải phần trăm của chặng liền trước. */
  phases: DraftPhase[]
  /** Chặng đang sửa. */
  phase: DraftPhase
  /** Tiền HIỂN THỊ của kịch bản — để quy hai chặng về cùng đơn vị khi tính phần trăm. */
  displayCurrency: CurrencyCode
  /** Năm hiện tại, đọc một lần ở tầng trên (`project.ts` không được gọi `Date`). */
  currentYear: number
  /** Tuổi chiếu tới — "đến năm" của chặng CUỐI là năm cuối bản chiếu. */
  lastYear: number
  /** Ghi các trường đã sửa vào bản nháp (`patchDraftPhase`). */
  onPatch: (patch: Partial<Omit<DraftPhase, 'id'>>) => void
  /**
   * Đổi ĐƠN VỊ TIỀN của chặng — chỗ gọi dùng `setPhaseCurrency` (nó KHÔNG quy đổi số
   * tiền, chỉ đổi nhãn; và gắn nhãn lại mọi mốc rơi vào chặng). Xem `doiTien` bên dưới
   * cho lý do panel này không tự quy đổi trước khi gọi.
   */
  onCurrency: (next: CurrencyCode) => void
  onDuplicate: () => void
  onRemove: () => void
}

/** Bảng sửa chặng đời trong dock. */
export function PlanDockPhase({
  phases,
  phase,
  displayCurrency,
  currentYear,
  lastYear,
  onPatch,
  onCurrency,
  onDuplicate,
  onRemove,
}: PlanDockPhaseProps) {
  const uid = useId()
  const sorted = [...phases].sort((a, b) => a.startYear - b.startYear)
  const idx = sorted.findIndex((p) => p.id === phase.id)
  const laChangDau = idx === 0
  /** "Đến năm" là CHỮ TĨNH: chặng kế tiếp quyết định nó (bản vẽ ghi thẳng). Chặng cuối
   *  chạy tới hết bản chiếu. */
  const denNam = idx >= 0 && idx + 1 < sorted.length ? sorted[idx + 1].startYear - 1 : lastYear

  /** Chặng liền trước, ĐÃ GIẢI phần trăm của chính nó — "80% chặng trước" mà chặng
   *  trước lại là "50% chặng trước nữa" thì phải lấy số đã giải (xem `phasePercent.ts`). */
  const prevPhase = idx > 0 ? resolvePhasePercents(sorted, displayCurrency)[idx - 1] : null

  /**
   * Đổi "Tiền tệ khai" của chặng — KHÔNG quy đổi số tiền, chỉ đổi nhãn. Số ở "Thu/năm"
   * và "Chi/năm" giữ nguyên, chỉ ký hiệu đổi từ ¥ sang ₫; đi thẳng qua `setPhaseCurrency`
   * (draft.ts) với đúng hành vi đã có sẵn ở đó — không dựng thêm đường thứ hai.
   *
   * ⚠️ ĐÃ CÂN NHẮC VÀ BÁC BỎ hướng ngược lại. Bản trình sửa 1c (dsg-handoff, 2026-09-09)
   * ghi "Đổi 'Tiền tệ khai' phải quy đổi số tiền, không chỉ đổi ký hiệu"
   * (`round(fromJPY(toJPY(v, cũ), mới))`). NHƯNG ở app này đổi tiền của một chặng còn
   * gắn nhãn lại mọi MỐC rơi vào chặng đó — vì tiền của một mốc SUY RA từ chặng phủ năm
   * nó bắt đầu (xem JSDoc `setPhaseCurrency`, draft.ts:822). Bản vẽ 1c không có luật
   * "mốc thừa hưởng tiền của chặng" — mỗi mốc trong bản vẽ tự mang `cur` riêng — nên góc
   * đã gây lỗi ở app không thể xảy ra trong mô hình của bản vẽ; lời khuyên của bản vẽ
   * được viết cho một mô hình khác, không áp dụng thẳng vào đây. Quy đổi số tiền của
   * chặng RỒI gắn nhãn lại mốc theo tiền mới (không quy đổi mốc) từng nhân một con số
   * lên 170 lần trong một lỗi thật trên app (bắt được 2026-08-24, xem JSDoc
   * `setPhaseCurrency`) — ĐỪNG khôi phục lại quy đổi ở đây tưởng là "theo đúng bản vẽ".
   * `ScenarioWorkbench` (hàng inline cũ) và dock này giờ đi cùng một luật.
   */
  function doiTien(next: CurrencyCode) {
    onCurrency(next)
  }

  const sym = CURRENCIES[phase.currency].symbol
  const deDanh = phase.annualIncomeMinor - phase.annualExpenseMinor
  const tyLe =
    phase.annualIncomeMinor === 0 ? null : Math.round((deDanh / phase.annualIncomeMinor) * 100)

  return (
    <DockPanel title={PHASE_WORDS.name} hint={PHASE_WORDS.hint}>
      <IdentityRow
        icon={phase.icon}
        onIcon={(icon) => onPatch({ icon })}
        color={phase.color}
        onColor={(color) => onPatch({ color })}
        // Màu mà DẢI CHẶNG thật sự tô khi chặng chưa chọn màu — cùng `phaseColorKey` và
        // cùng thứ hạng theo năm mà `PhaseLane` dùng, nên ô màu trong dock vẽ đúng thứ trên
        // trục (review cuối nhánh 2026-09-09, Finding 7). `Math.max(idx, 0)` cho ca chặng
        // không có trong `phases` — không xảy ra trên đường thật, và một chỉ số âm chỉ làm
        // vòng màu lệch đi chứ không được làm sập panel.
        fallbackColor={phaseColorKey('', Math.max(idx, 0))}
        // Chặng tô TRẦM, mốc tô TƯƠI — spec §8, đó là cách người dùng phân biệt hai loại
        // chỉ bằng mắt.
        treatment="muted"
        renderIcon={(icon) => <PhaseIcon icon={icon} />}
        name={phase.label}
        onName={(label) => onPatch({ label })}
        nameLabel="Tên chặng"
        fromYear={
          laChangDau ? (
            // Chặng đầu KHÔNG có ô nhập: năm của nó là năm hiện tại, không phải một
            // lựa chọn (xem `phaseYear.ts`). Một ô nhập luôn tự chặn về đúng một giá
            // trị đọc ra như một ô bị hỏng.
            //
            // Hiện `phase.startYear` THẬT, KHÔNG `currentYear` cứng (phát hiện review
            // 2026-09-09 #3). `PhaseFormSheet` (sheet cũ, sống tới Task 16) không ép "chặng
            // đầu luôn = currentYear", nên dữ liệu chặng đầu lệch năm nay là một hình dạng
            // có thật — hiện một chữ tĩnh SAI với dữ liệu thật là nói dối, và không có cách
            // nào sửa nó từ đây (không ghi đè âm thầm — xem <Guide> ngay dưới).
            <span className="w-[3.75rem] shrink-0 text-center text-sm text-fg-muted">
              <Num tone="muted">{phase.startYear}</Num>
            </span>
          ) : (
            <YearBox
              value={phase.startYear}
              ariaLabel={`Năm bắt đầu chặng ${phase.label}`}
              onCommit={(y) =>
                onPatch({ startYear: clampPhaseStartYear(sorted, phase.id, y, currentYear) })
              }
            />
          )
        }
        toYear={
          <span className="w-[3.75rem] shrink-0 text-center text-sm text-fg-muted">
            <Num tone="muted">{denNam}</Num>
          </span>
        }
      />
      {laChangDau &&
        (phase.startYear === currentYear ? (
          <Guide className="mt-1 block text-2xs text-fg-muted">
            Chặng đầu bắt đầu từ năm nay — bản chiếu tính từ hôm nay.
          </Guide>
        ) : (
          // Chặng đầu KHÔNG ở năm nay (dữ liệu cũ/hỏng — xem ghi chú ở `fromYear` trên).
          // KHÔNG tự ghi đè về `currentYear` ở đây: dock không có nút Xong để tắt, nên mọi
          // ô bị SAI thì bị CHẶN, nhưng đây không phải một ô — nó là một khác biệt dữ liệu
          // có thật, và ghi đè âm thầm dữ liệu người dùng không phải việc của phép chặn.
          //
          // KHÔNG mời "kéo khối chặng trên trục" nữa (phát hiện review cuối nhánh
          // 2026-09-09, Finding 3): khối chặng ĐÃ kéo được từ nhánh này, nhưng chặng ĐẦU
          // thì không — `blockPhaseStartYearAtNeighbours` trả nguyên năm đang có ở `i === 0`
          // vì chặng đầu không có mép trái, nên kéo giữa khối đầu là NO-OP. Một câu chỉ dẫn
          // tới một cử chỉ không làm gì là tệ hơn không có câu nào. Nói HỆ QUẢ thay vì hứa
          // một cách sửa: `phaseForYear` (project.ts) dùng chặng sớm nhất cho mọi năm nằm
          // trước nó, nên bản chiếu vẫn liền mạch, chỉ là quãng đầu đọc theo chặng này.
          <Guide className="mt-1 block text-2xs text-fg-muted">
            Chặng đầu đang bắt đầu ở năm <Num tone="muted">{phase.startYear}</Num>, không phải
            năm nay (<Num tone="muted">{currentYear}</Num>). Bản chiếu vẫn tính từ hôm nay —
            những năm trước <Num tone="muted">{phase.startYear}</Num> đọc theo đúng chặng này.
          </Guide>
        ))}

      <div className="mt-2 grid grid-cols-2 gap-2">
        {khoiTien('income')}
        {khoiTien('expense')}
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <div>
          <label htmlFor={`${uid}-tien`} className={DOCK_LABEL}>
            Tiền tệ khai
          </label>
          {/* KHÔNG bóp chiều cao `<Select>` bằng className: `min-h-11` của primitive và
              một `min-h-8` chêm ngoài là hai class CÙNG hạng, và Tailwind quyết theo thứ
              tự trong CSS chứ không theo thứ tự trong chuỗi — tức kết quả không đoán
              được. Sàn 44px ở đây vô hại: dock là màn máy tính, chỗ rộng. */}
          <Select
            id={`${uid}-tien`}
            value={phase.currency}
            wrapClassName="block w-full"
            onChange={(e) => doiTien(e.target.value as CurrencyCode)}
          >
            {(Object.keys(CURRENCIES) as CurrencyCode[]).map((c) => (
              <option key={c} value={c}>
                {CURRENCIES[c].symbol} {c}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label htmlFor={`${uid}-nuoc`} className={DOCK_LABEL}>
            Quốc gia
          </label>
          <input
            id={`${uid}-nuoc`}
            value={phase.country ?? ''}
            placeholder="JP, US, VN…"
            onChange={(e) =>
              onPatch({ country: e.target.value.trim() === '' ? null : e.target.value })
            }
            className={`w-full ${DOCK_INPUT}`}
          />
        </div>
      </div>

      {/* Dòng "để dành" của bản vẽ — hiệu thu trừ chi, và tỷ lệ so với thu. `<Money>` cho
          tiền, `<Num>` cho phần trăm: hai primitive khác nhau vì `<Money>` đi qua chế độ
          riêng tư và định dạng theo loại tiền. */}
      <p className="mt-2 flex items-baseline justify-between gap-2 rounded-md bg-surface-sunken px-2 py-1.5 text-2xs text-fg-secondary">
        <span className="shrink-0 text-fg-muted">Để dành mỗi năm</span>
        <span className="flex min-w-0 items-baseline gap-1.5 whitespace-nowrap">
          <Money amount={deDanh} currency={phase.currency} compact tone="bySign" />
          {tyLe !== null && <Num tone="muted">{tyLe}% thu</Num>}
        </span>
      </p>

      <div className="mt-2 flex items-center justify-between gap-2">
        <ActionButton onClick={onDuplicate} className="px-2 py-1 text-2xs">
          <Copy className="h-3 w-3" aria-hidden="true" />
          Nhân đôi
        </ActionButton>
        {/* Chặng ĐẦU không xoá được: bản chiếu phải bắt đầu từ một chặng nào đó — cùng
            luật với hàng inline cũ. */}
        {!laChangDau && (
          <ActionButton variant="danger" onClick={onRemove} className="px-2 py-1 text-2xs">
            <Trash2 className="h-3 w-3" aria-hidden="true" />
            Xoá
          </ActionButton>
        )}
      </div>
    </DockPanel>
  )

  /**
   * Số mà một phần trăm sẽ cho ra, tính theo TIỀN CỦA CHẶNG NÀY. `null` = không tính
   * được (chặng đầu, hoặc tỷ giá của chặng hỏng — xem `phasePercent.ts`).
   *
   * Đi qua đúng `resolvePhasePercents` mà engine dùng, không dựng lại phép nhân ở đây:
   * "80% chặng trước" với hai chặng khác đồng tiền mà nhân thẳng thì sai 165 lần, và
   * KHÔNG có guard nào bắt được (cả hai số đều hợp lệ).
   */
  function xemTruocPct(n: number, field: 'income' | 'expense'): number | null {
    if (prevPhase === null) return null
    const [giai] = resolvePhasePercents(
      [
        prevPhase,
        {
          ...phase,
          startYear: prevPhase.startYear + 1,
          ...(field === 'income' ? { incomePctOfPrev: n } : { expensePctOfPrev: n }),
        },
      ],
      displayCurrency,
    ).slice(1)
    return field === 'income' ? giai.annualIncomeMinor : giai.annualExpenseMinor
  }

  /**
   * Một khối "Thu/năm" hoặc "Chi/năm": hai nút chọn CÁCH KHAI, rồi ô tương ứng.
   *
   * Hai NÚT CÓ NHÃN chứ không phải một công tắc — hai trạng thái ở đây là hai cách khai
   * khác hẳn nhau, không phải bật/tắt một thứ (lời ghi lấy từ `PhaseFormSheet`).
   */
  function khoiTien(loai: 'income' | 'expense') {
    const laThu = loai === 'income'
    const ten = laThu ? `Thu/năm (${sym})` : `Chi/năm (${sym})`
    const aria = laThu ? `Thu mỗi năm của chặng ${phase.label}` : `Chi mỗi năm của chặng ${phase.label}`
    const pct = laThu ? phase.incomePctOfPrev : phase.expensePctOfPrev
    const dangDungPct = pct != null
    const gid = `${uid}-${loai}`

    /** Ghi CẢ HAI: phần trăm nói CÁCH khai, còn `annual_*_minor` giữ số đã tính để mọi
     *  chỗ chưa biết đến phần trăm (bảng theo năm, thanh nháp, bản sao lưu) vẫn đọc ra
     *  một con số đúng thay vì 0. Cùng luật với `PhaseFormSheet.handleSubmit`. */
    function ghiPct(raw: number | null) {
      if (raw === null) {
        onPatch(laThu ? { incomePctOfPrev: null } : { expensePctOfPrev: null })
        return
      }
      const n = Math.min(MAX_PHASE_PCT, Math.max(0, Math.round(raw)))
      const so = xemTruocPct(n, loai)
      onPatch(
        laThu
          ? { incomePctOfPrev: n, ...(so !== null && { annualIncomeMinor: so }) }
          : { expensePctOfPrev: n, ...(so !== null && { annualExpenseMinor: so }) },
      )
    }

    return (
      <div key={loai}>
        <span id={gid} className={DOCK_LABEL}>
          {ten}
        </span>
        {prevPhase !== null && (
          <div role="group" aria-labelledby={gid} className="mb-1 flex gap-1">
            <SegButton active={!dangDungPct} onClick={() => ghiPct(null)}>
              Gõ số
            </SegButton>
            <SegButton
              active={dangDungPct}
              title={`Khai bằng phần trăm chặng "${prevPhase.label}"`}
              onClick={() => ghiPct(pct ?? 80)}
            >
              % chặng trước
            </SegButton>
          </div>
        )}

        {dangDungPct ? (
          <>
            <div className="flex items-center gap-1">
              <input
                inputMode="decimal"
                value={String(pct)}
                aria-label={`${aria}, tính bằng phần trăm chặng trước`}
                onChange={(e) => {
                  const n = Number(e.target.value)
                  if (e.target.value.trim() !== '' && Number.isFinite(n)) ghiPct(n)
                }}
                className={`w-full text-right font-semibold ${DOCK_INPUT}`}
              />
              <span aria-hidden className="shrink-0 text-2xs text-fg-muted">
                %
              </span>
            </div>
            <p className="mt-0.5 truncate text-2xs text-fg-secondary">
              ={' '}
              <Money
                amount={laThu ? phase.annualIncomeMinor : phase.annualExpenseMinor}
                currency={phase.currency}
                compact
              />
              /năm
            </p>
          </>
        ) : (
          // <span> chứ KHÔNG <label htmlFor>: MoneyField render CẢ HAI ô (nút chạm
          // `lg:hidden` và input desktop `hidden lg:block`), nên `for` luôn có nguy cơ
          // trỏ vào ô đang bị CSS ẩn. Tên đọc được đã do `ariaLabel` lo.
          <MoneyField
            value={laThu ? phase.annualIncomeMinor : phase.annualExpenseMinor}
            currency={phase.currency}
            autoOpen={false}
            ariaLabel={aria}
            // Kẹp về 0 thay vì hiện câu lỗi: dock không có nút Xong nào để tắt, và DB
            // có `check (annual_income_minor >= 0)`.
            onChange={(v) =>
              onPatch(
                laThu
                  ? { annualIncomeMinor: Math.max(0, v) }
                  : { annualExpenseMinor: Math.max(0, v) },
              )
            }
            className={`w-full text-right font-semibold ${DOCK_INPUT}`}
          />
        )}
      </div>
    )
  }
}
