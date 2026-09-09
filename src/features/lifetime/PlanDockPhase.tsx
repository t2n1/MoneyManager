// Bảng sửa một CHẶNG ĐỜI — ruột của `PlanDock` khi đang chọn một chặng (spec §10,
// dsg-handoff README mục "Panel chặng").
//
// Thứ tự của bản vẽ: hàng nhận dạng → Thu/năm + Chi/năm → Tiền tệ khai + Quốc gia →
// dòng để dành → Nhân đôi · Xoá.
//
// GHI THẲNG VÀO BẢN NHÁP, KHÔNG CÓ NÚT "XONG". Đây là chỗ khác hẳn `PhaseFormSheet` (sẽ
// nghỉ): sheet đó đệm mọi ô trong state cục bộ rồi ghi một lần khi bấm Xong, vì nó là
// một lớp phủ mở ra rồi đóng lại. Dock thì LUÔN mở cạnh đồ thị, và cả lý do nó tồn tại
// là "vặn tới đâu đồ thị đổi tới đó" (spec §12) — một nút Xong ở đây sẽ chặn đúng thứ
// người dùng tới đây để xem. Nên mỗi ô ghi ngay, và lớp nháp vẫn là lớp duy nhất bị
// đụng: không có gì xuống Supabase cho tới khi bấm Lưu ở hàng vặn nhanh (Task 15b).
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
import { showToast } from '../../lib/dialog'
import type { DraftPhase } from './draft'
import { convertMinorToday, type FxOf } from './fxModel'
import { DOCK_INPUT, DOCK_LABEL, DockPanel, IdentityRow, PhaseIcon, YearBox } from './PlanDockParts'
import { MAX_PHASE_PCT, resolvePhasePercents } from './phasePercent'
import { clampPhaseStartYear } from './phaseYear'

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
  /** Tỷ giá HÔM NAY. Thiếu tỷ giá thì đổi "Tiền tệ khai" KHÔNG đổi gì cả (xem `doiTien`). */
  fxOf: FxOf
  /** Ghi các trường đã sửa vào bản nháp (`patchDraftPhase`). */
  onPatch: (patch: Partial<Omit<DraftPhase, 'id'>>) => void
  /**
   * Đổi ĐƠN VỊ TIỀN của chặng — chỗ gọi dùng `setPhaseCurrency` (nó còn gắn nhãn lại
   * mọi mốc rơi vào chặng), rồi ghi kèm hai con số ĐÃ QUY ĐỔI.
   */
  onCurrency: (next: CurrencyCode, incomeMinor: number, expenseMinor: number) => void
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
  fxOf,
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
   * Đổi "Tiền tệ khai" phải QUY ĐỔI số tiền, không chỉ đổi ký hiệu (bản vẽ 1c:
   * `round(fromJPY(toJPY(v, cũ), mới))`). Ở repo này phép đó là `convertMinorToday` —
   * nó đi qua `convertLifetimeMinor` nên biết USD có 2 chữ số lẻ còn JPY có 0; nhân
   * thẳng `minor × tỷ giá` là sai 100 lần (đã bắt được trên app 2026-09-02).
   *
   * ⚠️ ĐÂY LÀ CHỖ BẢN VẼ 1c ĐẢO NGƯỢC MỘT QUYẾT ĐỊNH CŨ. `setPhaseCurrency` (draft.ts,
   * 2026-08-24) cố ý KHÔNG quy đổi: "người dùng bấm đổi tiền của chặng thì ý họ là ĐỔI
   * ĐƠN VỊ". Bản vẽ 1c (2026-09-09) nói ngược lại, và bản vẽ mới thắng — nhưng nói ra
   * ở đây để không ai đọc hai chỗ rồi tưởng một trong hai là lỗi. Hàng inline cũ
   * (`ScenarioWorkbench`) vẫn theo luật cũ cho tới khi nó nghỉ.
   *
   * THIẾU TỶ GIÁ THÌ KHÔNG ĐỔI GÌ CẢ — một trạng thái thay vì ba, và không có ca nào
   * con số sai kịp xuất hiện trên màn. Quy ước `hasMissingRate` của cả repo: thà thiếu
   * còn hơn bịa, không bao giờ quy 1:1.
   */
  function doiTien(next: CurrencyCode) {
    if (next === phase.currency) return
    const thu = convertMinorToday(phase.annualIncomeMinor, phase.currency, next, fxOf)
    const chi = convertMinorToday(phase.annualExpenseMinor, phase.currency, next, fxOf)
    if (thu === null || chi === null) {
      showToast(
        `Chưa có tỷ giá ${phase.currency} → ${next} nên chưa đổi được đơn vị của chặng — thu và chi sẽ sai đơn vị. Thử lại khi có mạng.`,
        'error',
      )
      return
    }
    onCurrency(next, thu, chi)
  }

  const sym = CURRENCIES[phase.currency].symbol
  const deDanh = phase.annualIncomeMinor - phase.annualExpenseMinor
  const tyLe =
    phase.annualIncomeMinor === 0 ? null : Math.round((deDanh / phase.annualIncomeMinor) * 100)

  return (
    <DockPanel title="Chặng đời">
      <IdentityRow
        icon={phase.icon}
        onIcon={(icon) => onPatch({ icon })}
        color={phase.color}
        onColor={(color) => onPatch({ color })}
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
            <span className="w-[3.75rem] shrink-0 text-center text-sm text-fg-muted">
              <Num tone="muted">{currentYear}</Num>
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
      {laChangDau && (
        <Guide className="mt-1 block text-2xs text-fg-muted">
          Chặng đầu bắt đầu từ năm nay — bản chiếu tính từ hôm nay.
        </Guide>
      )}

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
            <button
              type="button"
              aria-pressed={!dangDungPct}
              onClick={() => ghiPct(null)}
              className={`min-h-8 flex-1 rounded-full text-2xs font-medium transition active:scale-95 ${
                !dangDungPct
                  ? 'bg-accent text-fg-on-accent'
                  : 'border border-border-strong text-fg-secondary hover:bg-surface-sunken'
              }`}
            >
              Gõ số
            </button>
            <button
              type="button"
              aria-pressed={dangDungPct}
              title={`Khai bằng phần trăm chặng "${prevPhase.label}"`}
              onClick={() => ghiPct(pct ?? 80)}
              className={`min-h-8 flex-1 rounded-full text-2xs font-medium transition active:scale-95 ${
                dangDungPct
                  ? 'bg-accent text-fg-on-accent'
                  : 'border border-border-strong text-fg-secondary hover:bg-surface-sunken'
              }`}
            >
              % chặng trước
            </button>
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
