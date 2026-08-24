// Sheet "chi tiết mốc" — mở từ nút "⋯" trên một dòng sự kiện trong trình sửa kịch bản
// (`ScenarioEditorDrawer`).
//
// VÌ SAO CÒN TỒN TẠI khi bản vẽ đã cho sửa mốc ngay trên một dòng: dòng inline mang năm
// trường hay dùng (thu/chi · tên · từ · đến · số tiền), còn dòng dưới DB có thêm TIỀN
// của mốc, TỶ GIÁ GIẢ ĐỊNH, cờ THEO LẠM PHÁT và GHI CHÚ. Bốn thứ đó không nhét nổi vào
// một hàng, nhưng bỏ hẳn thì một mốc "Hỗ trợ bố mẹ ở VN" tính bằng ₫ không còn đường
// nào khai — và dòng xem trước quy đổi ở đây là chốt kiểm DUY NHẤT bắt được ca tỷ giá
// bị đảo chiều.
//
// GHI VÀO BẢN NHÁP, KHÔNG GHI DB — lý do đầy đủ ghi ở đầu `PhaseFormSheet.tsx`.
//
// ĐÃ BỎ đường "Chọn mẫu" trong sheet này. Mẫu (`LIFE_PRESETS`) nay vào qua hai chỗ đều
// ghi vào NHÁP: dải chip "Thêm nhanh từ mẫu" trong trình sửa kịch bản, và `PresetPanel`
// ngoài trang. Bản cũ ở đây tạo THẲNG bản ghi DB tuần tự — đúng thứ mà lớp nháp sinh ra
// để thay, và giữ lại là có hai đường thêm mẫu cho ra hai kết quả khác nhau.
import { useEffect, useId, useState } from 'react'
import { AlertCircle } from 'lucide-react'
import { Guide } from '../../components/Guide'
import { CURRENCIES, formatMoney, type CurrencyCode } from '../../lib/money'
import { MoneyField } from '../../components/MoneyField'
import type { DraftEvent } from './draft'
import { fxAfterCurrencyChange, isFxValid } from './fxField'
import { convertLifetimeMinor } from './project'

/** Khớp `check (start_year between 1900 and 2200)` và `check (end_year between 1900
 *  and 2200)` của `life_events` (migration 0031). */
const MIN_YEAR = 1900
const MAX_YEAR = 2200

interface Props {
  /** Tiền hiển thị của kịch bản — quyết định ô tỷ giá có hiện hay không. */
  displayCurrency: CurrencyCode
  /** Mốc đang sửa. Không có ca "tạo mới": mốc mới thêm từ dải chip mẫu hoặc dòng inline. */
  event: DraftEvent
  /** Ghi các trường đã sửa vào bản nháp. */
  onApply: (patch: Partial<Omit<DraftEvent, 'id'>>) => void
  /** Bỏ mốc này khỏi bản nháp. */
  onRemove: () => void
  onClose: () => void
}

/** Sheet sửa một SỰ KIỆN đầy đủ trường — ghi vào bản nháp của trình sửa kịch bản. */
export function EventFormSheet({ displayCurrency, event, onApply, onRemove, onClose }: Props) {
  const [label, setLabel] = useState(event.label)
  const [kind, setKind] = useState<'income' | 'expense'>(event.kind)
  const [startYear, setStartYear] = useState(String(event.startYear))
  const [forever, setForever] = useState(event.endYear === null)
  const [endYear, setEndYear] = useState(String(event.endYear ?? event.startYear))
  const [amount, setAmount] = useState(event.amountMinor)
  const [currency, setCurrency] = useState<CurrencyCode>(event.currency)
  const [fx, setFx] = useState(String(event.fxToDisplay))
  const [inflate, setInflate] = useState(event.inflate)
  const [note, setNote] = useState(event.note)

  // Cùng tiền hiển thị thì tỷ giá luôn là 1 và KHÔNG hỏi.
  const showFx = currency !== displayCurrency

  /** Đổi tiền của SỰ KIỆN NÀY → đặt lại ô tỷ giá. Cùng luật với `PhaseFormSheet`, xem
   *  `fxAfterCurrencyChange` để biết vì sao effect theo boolean `showFx` bỏ sót đúng ca
   *  đổi giữa hai ngoại tệ (VND → USD) — và vì sao không guard nào bắt được ca đó. */
  function handleCurrencyChange(next: CurrencyCode) {
    setCurrency(next)
    setFx(fxAfterCurrencyChange(next, displayCurrency))
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // `stopPropagation`: trình sửa kịch bản có Esc riêng — xem PhaseFormSheet.
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const yearNum = Number(startYear)
  const yearValid = Number.isInteger(yearNum) && yearNum >= MIN_YEAR && yearNum <= MAX_YEAR
  const endYearNum = Number(endYear)
  const endYearValid =
    forever ||
    (Number.isInteger(endYearNum) &&
      endYearNum >= MIN_YEAR &&
      endYearNum <= MAX_YEAR &&
      endYearNum >= yearNum)
  const fxNum = Number(fx)
  const fxValid = isFxValid(fx)
  const labelValid = label.trim() !== ''
  const amountValid = amount >= 0

  const canSave = labelValid && yearValid && endYearValid && amountValid && (!showFx || fxValid)

  function handleSubmit() {
    if (!canSave) return
    onApply({
      startYear: yearNum,
      endYear: forever ? null : endYearNum,
      kind,
      amountMinor: amount,
      currency,
      label: label.trim(),
      note: note.trim(),
      fxToDisplay: showFx ? fxNum : 1,
      inflate,
    })
    onClose()
  }

  /** KHÔNG hỏi lại — mọi thứ ở đây chỉ là nháp; xem PhaseFormSheet. */
  function handleDelete() {
    onRemove()
    onClose()
  }

  const field =
    'w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm dark:text-gray-100'
  const label_ = 'mb-1 block text-xs font-medium text-fg-muted'

  const title = 'Chi tiết mốc cuộc đời'
  const uid = useId()

  const amountPreview =
    showFx && fxValid ? convertLifetimeMinor(amount, currency, displayCurrency, fxNum) : null

  return (
    <div
      className="fixed inset-0 z-[62] flex items-end justify-center bg-black/40 lg:items-center animate-overlay-in"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:rounded-2xl animate-sheet-in lg:animate-sheet-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-base font-bold text-fg-primary">{title}</h2>
        <Guide className="mb-3 text-xs text-fg-muted">
          Bấm Xong là ghi vào bản nháp — kịch bản chỉ đổi khi bấm "Lưu thay đổi" ở chân
          trình sửa.
        </Guide>

        <label htmlFor={`${uid}-label`} className={label_}>
          Tên sự kiện
        </label>
        <input
          id={`${uid}-label`}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Ví dụ: Học phí đại học"
          className={`mb-1 ${field}`}
        />
        {!labelValid && (
          <p role="alert" className="mb-2 text-xs text-money-out">
            Tên sự kiện không được để trống.
          </p>
        )}
        {labelValid && <div className="mb-2" />}

        {/* KHÔNG phải <label htmlFor>: đây là hai cái NÚT, không phải một form
            control, nên không có gì để `for` trỏ vào. Cách đúng là nhãn nhóm
            (`role="group"` + `aria-labelledby`) — cùng cách với `switchLabelId` ở
            YearTableView.
            `aria-pressed` là phần BẮT BUỘC, không phải thêm cho đẹp: trạng thái đang
            chọn ở đây chỉ thể hiện bằng MÀU (bg-accent vs viền), nên thiếu nó thì
            người dùng screen reader nghe được "Chi, Thu" mà không biết cái nào đang
            bật — tệ hơn cả việc thiếu nhãn. */}
        <span id={`${uid}-kind`} className={label_}>
          Loại
        </span>
        <div role="group" aria-labelledby={`${uid}-kind`} className="mb-3 flex gap-2">
          <button
            type="button"
            aria-pressed={kind === 'expense'}
            onClick={() => setKind('expense')}
            className={`min-h-11 flex-1 rounded-md text-sm font-medium transition active:scale-95 ${
              kind === 'expense'
                ? 'bg-accent text-fg-on-accent'
                : 'border border-border-strong text-fg-secondary'
            }`}
          >
            Chi
          </button>
          <button
            type="button"
            aria-pressed={kind === 'income'}
            onClick={() => setKind('income')}
            className={`min-h-11 flex-1 rounded-md text-sm font-medium transition active:scale-95 ${
              kind === 'income'
                ? 'bg-accent text-fg-on-accent'
                : 'border border-border-strong text-fg-secondary'
            }`}
          >
            Thu
          </button>
        </div>

        <label htmlFor={`${uid}-start`} className={label_}>
          Năm bắt đầu
        </label>
        <input
          id={`${uid}-start`}
          inputMode="decimal"
          value={startYear}
          onChange={(e) => setStartYear(e.target.value)}
          className={`mb-1 ${field}`}
        />
        {!yearValid && startYear !== '' && (
          <p role="alert" className="mb-2 text-xs text-money-out">
            Năm phải là số nguyên trong khoảng {MIN_YEAR}–{MAX_YEAR}.
          </p>
        )}
        {(!startYear || yearValid) && <div className="mb-2" />}

        <label className="mb-2 flex min-h-11 items-center gap-2 text-sm text-fg-secondary">
          <input
            type="checkbox"
            checked={forever}
            onChange={(e) => setForever(e.target.checked)}
            className="h-4 w-4"
          />
          Kéo dài đến hết đời (không có năm kết thúc)
        </label>
        {!forever && (
          <>
            <label htmlFor={`${uid}-end`} className={label_}>
              Năm kết thúc
            </label>
            <input
              id={`${uid}-end`}
              inputMode="decimal"
              value={endYear}
              onChange={(e) => setEndYear(e.target.value)}
              className={`mb-1 ${field}`}
            />
            {!endYearValid && (
              <p role="alert" className="mb-2 text-xs text-money-out">
                Năm kết thúc phải ≥ năm bắt đầu (hoặc bật "đến hết đời" ở trên).
              </p>
            )}
            {endYearValid && <div className="mb-2" />}
          </>
        )}

        <label htmlFor={`${uid}-currency`} className={label_}>
          Tiền của sự kiện này
        </label>
        <select
          id={`${uid}-currency`}
          value={currency}
          onChange={(e) => handleCurrencyChange(e.target.value as CurrencyCode)}
          className={`mb-3 ${field}`}
        >
          {(Object.keys(CURRENCIES) as CurrencyCode[]).map((c) => (
            <option key={c} value={c}>
              {CURRENCIES[c].label} ({c})
            </option>
          ))}
        </select>

        {/* Khối tỷ giá nằm TRÊN ô tiền, không phải dưới. Đo thật ở 375×812 với bàn số
            đang bung: khi khối này ở dưới, nhãn tỷ giá rơi xuống 838px, ô nhập 858px và
            dòng quy đổi 902px — trong khi vùng thấy được chỉ tới 812px. Tức là đúng lúc
            người dùng nhập số tiền thì cả ba biến mất khỏi màn hình, mà dòng quy đổi là
            cách DUY NHẤT phát hiện tỷ giá bị đảo chiều (xem PhaseFormSheet).
            `autoOpen={false}` một mình KHÔNG đủ: nó chỉ chặn bàn số tự bung, còn người
            dùng vẫn buộc phải bấm vào ô tiền để nhập. Đặt lên trên thì bàn số bung ra
            bên dưới không che được nó nữa. */}
        {showFx && (
          <>
            <label htmlFor={`${uid}-fx`} className={`${label_} flex items-center gap-1`}>
              Tỷ giá giả định: 1 {CURRENCIES[currency].label} = ? {CURRENCIES[displayCurrency].label}
              {fxValid && fxNum === 1 && (
                <AlertCircle className="h-3.5 w-3.5 shrink-0 text-fg-warn" aria-hidden="true" />
              )}
            </label>
            <input
              id={`${uid}-fx`}
              inputMode="decimal"
              value={fx}
              onChange={(e) => setFx(e.target.value)}
              className={`mb-1 ${field}`}
            />
            {/* Ô RỖNG có câu riêng — cùng lý do đã ghi ở PhaseFormSheet. */}
            {!fxValid && (
              <p role="alert" className="mb-2 text-xs text-money-out">
                {fx.trim() === ''
                  ? 'Chưa có tỷ giá. Đổi tiền của sự kiện là tỷ giá cũ hết nghĩa (nó quy về đơn vị khác) — khai lại rồi mới lưu được.'
                  : 'Tỷ giá phải là một số lớn hơn 0.'}
              </p>
            )}
            {fxValid && fxNum === 1 && (
              <p className="mb-2 flex items-start gap-1 text-xs text-fg-warn">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                Tỷ giá 1:1 giữa hai tiền khác nhau gần như chắc chắn là ô chưa ai khai — kiểm tra lại.
              </p>
            )}
            {/* Chốt kiểm bắt buộc — xem PhaseFormSheet để biết vì sao dòng này
                không phải tiện nghi: fx_to_display ngược chiều lib/rates.ts. */}
            {amountPreview !== null && (
              <p className="mb-3 text-xs tabular-nums text-fg-muted">
                {formatMoney(amount, currency)} ≈ {formatMoney(amountPreview, displayCurrency)}
              </p>
            )}
          </>
        )}

        {/* <span> chứ không <label htmlFor> — lý do đầy đủ ghi ở PhaseFormSheet:
            MoneyField có hai ô (chạm/desktop) nên `for` luôn trỏ được vào ô đang ẩn. */}
        <span className={label_}>Số tiền mỗi năm</span>
        <div className="mb-1">
          <MoneyField
            value={amount}
            onChange={setAmount}
            currency={currency}
            // Vẫn `false` dù khối tỷ giá đã lên trên: bàn số tự bung giữa form đẩy mọi
            // thứ phía sau xuống và chiếm 257px của một sheet vốn đã dài nhất app.
            autoOpen={false}
            ariaLabel="Số tiền mỗi năm"
            className={`text-right font-semibold ${field}`}
          />
        </div>
        {!amountValid && (
          <p role="alert" className="mb-2 text-xs text-money-out">
            Số tiền không được âm.
          </p>
        )}
        {amountValid && <div className="mb-2" />}

        <label className="mb-3 flex min-h-11 items-center gap-2 text-sm text-fg-secondary">
          <input
            type="checkbox"
            checked={inflate}
            onChange={(e) => setInflate(e.target.checked)}
            className="h-4 w-4"
          />
          Tăng theo lạm phát (giá hôm nay cho việc xảy ra ở tương lai)
        </label>

        <label htmlFor={`${uid}-note`} className={label_}>
          Ghi chú <span className="text-fg-muted">(không bắt buộc)</span>
        </label>
        <input
          id={`${uid}-note`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className={`mb-4 ${field}`}
        />

        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleDelete}
            className="min-h-11 rounded-md px-3 py-2 text-sm font-medium text-money-out transition active:scale-95 hover:bg-state-bad-bg"
          >
            Xóa mốc
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 rounded-md px-3 py-2 text-sm text-fg-muted transition active:scale-95 hover:bg-surface-sunken"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSave}
              className="min-h-11 rounded-md bg-accent text-fg-on-accent px-4 py-2 text-sm font-semibold transition active:scale-95 disabled:opacity-50"
            >
              Xong
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
