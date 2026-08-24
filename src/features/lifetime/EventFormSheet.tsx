// Sheet "chi tiết mốc" — mở từ nút "⋯" trên một dòng mốc ở bàn sửa kịch bản
// (`ScenarioWorkbench`).
//
// CÒN LẠI GÌ. Hàng inline mang loại · tên · từ → đến · số tiền. Hai trường nó không chứa
// nổi là THEO LẠM PHÁT và GHI CHÚ. Cờ lạm phát không phải trang trí: nó đổi con số của
// bản chiếu ở chế độ giá danh nghĩa, và các mẫu (`presets.ts`) đặt nó khác nhau tuỳ mốc
// — bỏ hẳn ô này là để người dùng không có đường nào sửa một thứ đang tính vào tiền.
//
// ĐÃ BỎ ô tiền và ô TỶ GIÁ GIẢ ĐỊNH. Từ bản vẽ v5, mốc KHÔNG còn tiền riêng: nó tính
// bằng tiền của chặng phủ năm nó bắt đầu, và quy đổi đi qua tỷ giá hôm nay của app (xem
// `fxModel.ts`). Muốn mốc tính bằng đồng khác thì đổi tiền của CHẶNG.
//
// GHI VÀO BẢN NHÁP, KHÔNG GHI DB — lý do đầy đủ ở đầu `PhaseFormSheet.tsx`.
import { useEffect, useId, useState } from 'react'
import { Guide } from '../../components/Guide'
import { MoneyField } from '../../components/MoneyField'
import { CURRENCIES, type CurrencyCode } from '../../lib/money'
import type { DraftEvent } from './draft'
import { SectionTitle, actionButtonClass } from '../../components/ui'

/** Khớp `check (start_year between 1900 and 2200)` và `check (end_year between 1900
 *  and 2200)` của `life_events` (migration 0031). */
const MIN_YEAR = 1900
const MAX_YEAR = 2200

interface Props {
  /** Mốc đang sửa. Không có ca "tạo mới": mốc mới thêm từ dải chip mẫu. */
  event: DraftEvent
  /** Tiền của CHẶNG phủ năm bắt đầu — mốc tính bằng đơn vị này, không tự khai. */
  currency: CurrencyCode
  /** Ghi các trường đã sửa vào bản nháp. */
  onApply: (patch: Partial<Omit<DraftEvent, 'id'>>) => void
  /** Bỏ mốc này khỏi bản nháp. */
  onRemove: () => void
  onClose: () => void
}

/** Sheet sửa một MỐC CUỘC ĐỜI — ghi vào bản nháp của bàn sửa kịch bản. */
export function EventFormSheet({ event, currency, onApply, onRemove, onClose }: Props) {
  const [label, setLabel] = useState(event.label)
  const [kind, setKind] = useState<'income' | 'expense'>(event.kind)
  const [startYear, setStartYear] = useState(String(event.startYear))
  const [forever, setForever] = useState(event.endYear === null)
  const [endYear, setEndYear] = useState(String(event.endYear ?? event.startYear))
  const [amount, setAmount] = useState(event.amountMinor)
  const [inflate, setInflate] = useState(event.inflate)
  const [note, setNote] = useState(event.note)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
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
  const labelValid = label.trim() !== ''
  const amountValid = amount >= 0

  const canSave = labelValid && yearValid && endYearValid && amountValid

  function handleSubmit() {
    if (!canSave) return
    onApply({
      startYear: yearNum,
      endYear: forever ? null : endYearNum,
      kind,
      amountMinor: amount,
      // Ghi kèm `currency`: dòng dưới DB có thể còn mang tiền cũ (không có migration
      // hàng loạt — xem `fxModel.ts`), nên lần người dùng chạm vào nó là lúc nó tự lành
      // về mô hình mới.
      currency,
      fxToDisplay: 1,
      label: label.trim(),
      note: note.trim(),
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
  const label_ = 'mb-1 block text-sm font-medium text-fg-muted'

  const title = 'Chi tiết mốc cuộc đời'
  const uid = useId()

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 lg:items-center animate-overlay-in"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:rounded-2xl animate-sheet-in lg:animate-sheet-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <SectionTitle role="block" className="mb-1">{title}</SectionTitle>
        <Guide className="mb-3 text-sm text-fg-muted">
          Bấm Xong là ghi vào bản nháp — kịch bản chỉ đổi khi bấm Lưu ở thanh nháp trên đồ
          thị.
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
          <p role="alert" className="mb-2 text-sm text-money-out">
            Tên sự kiện không được để trống.
          </p>
        )}
        {labelValid && <div className="mb-2" />}

        {/* KHÔNG phải <label htmlFor>: đây là hai cái NÚT, không phải một form control,
            nên không có gì để `for` trỏ vào. Cách đúng là nhãn nhóm (`role="group"` +
            `aria-labelledby`). `aria-pressed` là phần BẮT BUỘC: trạng thái đang chọn chỉ
            thể hiện bằng MÀU, thiếu nó thì người dùng screen reader nghe được "Chi, Thu"
            mà không biết cái nào đang bật. */}
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
          <p role="alert" className="mb-2 text-sm text-money-out">
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
              <p role="alert" className="mb-2 text-sm text-money-out">
                Năm kết thúc phải ≥ năm bắt đầu (hoặc bật "đến hết đời" ở trên).
              </p>
            )}
            {endYearValid && <div className="mb-2" />}
          </>
        )}

        {/* <span> chứ không <label htmlFor> — lý do đầy đủ ở PhaseFormSheet. */}
        <span className={label_}>
          Số tiền mỗi năm{' '}
          <span className="font-normal text-fg-muted">
            (tính bằng {CURRENCIES[currency].label} — theo chặng của năm {yearValid ? yearNum : '…'})
          </span>
        </span>
        <div className="mb-1">
          <MoneyField
            value={amount}
            onChange={setAmount}
            currency={currency}
            autoOpen={false}
            ariaLabel="Số tiền mỗi năm"
            className={`text-right font-semibold ${field}`}
          />
        </div>
        {!amountValid && (
          <p role="alert" className="mb-2 text-sm text-money-out">
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
            className={actionButtonClass('danger')}
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
              className={actionButtonClass('primary')}
            >
              Xong
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
