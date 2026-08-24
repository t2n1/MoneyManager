// Sheet "chi tiết chặng đời" — mở từ nút "⋯" trên một dòng chặng trong trình sửa kịch
// bản (`ScenarioEditorDrawer`).
//
// VÌ SAO CÒN TỒN TẠI khi bản vẽ đã cho sửa chặng ngay trên một dòng: dòng inline mang
// bốn trường hay dùng (năm · tên · thu · chi), còn dòng dưới DB có thêm QUỐC GIA, TIỀN
// của chặng và TỶ GIÁ GIẢ ĐỊNH. Ba trường đó không nhét nổi vào một hàng, nhưng bỏ hẳn
// thì một chặng "Về VN" tính bằng ₫ không còn đường nào khai — và phần xem trước quy
// đổi ở cuối file này là chốt kiểm DUY NHẤT bắt được ca gõ nhầm 150 thay vì 0,0067.
//
// GHI VÀO BẢN NHÁP, KHÔNG GHI DB. Trước đây sheet này tự gọi `repo.updateLifePhase`.
// Trình sửa kịch bản nay treo mọi thay đổi ở lớp nháp cho tới khi bấm Lưu, nên một
// sheet con ghi thẳng xuống DB là hỏng đúng hợp đồng đó theo cách tệ nhất: "Bỏ thay
// đổi" hoàn tác được một nửa, và lần Lưu sau đó `planDraftSave` so nháp (còn giữ giá
// trị CŨ của chặng này) với DB rồi ghi đè ngược lên chính thứ vừa lưu.
import { useEffect, useId, useState } from 'react'
import { AlertCircle } from 'lucide-react'
import { Guide } from '../../components/Guide'
import { CURRENCIES, formatMoney, type CurrencyCode } from '../../lib/money'
import { MoneyField } from '../../components/MoneyField'
import type { DraftPhase } from './draft'
import { fxAfterCurrencyChange, isFxValid } from './fxField'
import { convertLifetimeMinor } from './project'

interface Props {
  /** Tiền hiển thị của kịch bản — quyết định ô tỷ giá có hiện hay không. */
  displayCurrency: CurrencyCode
  /** Mọi chặng của BẢN NHÁP, để chặn `start_year` trùng (DB có
   *  `unique (scenario_id, start_year)`, bắt trước ở đây để hiện câu lỗi tử tế). */
  phases: DraftPhase[]
  /** Chặng đang sửa. Không có ca "tạo mới": chặng mới thêm thẳng trên dòng inline. */
  phase: DraftPhase
  /** Ghi các trường đã sửa vào bản nháp. */
  onApply: (patch: Partial<Omit<DraftPhase, 'id'>>) => void
  /** Bỏ chặng này khỏi bản nháp. */
  onRemove: () => void
  onClose: () => void
}

/** Sheet sửa một CHẶNG ĐỜI đầy đủ trường — ghi vào bản nháp của trình sửa kịch bản. */
export function PhaseFormSheet({
  displayCurrency,
  phases,
  phase,
  onApply,
  onRemove,
  onClose,
}: Props) {
  const [label, setLabel] = useState(phase.label)
  const [startYear, setStartYear] = useState(String(phase.startYear))
  const [country, setCountry] = useState(phase.country ?? '')
  const [currency, setCurrency] = useState<CurrencyCode>(phase.currency)
  const [income, setIncome] = useState(phase.annualIncomeMinor)
  const [expense, setExpense] = useState(phase.annualExpenseMinor)
  const [fx, setFx] = useState(String(phase.fxToDisplay))

  // Cùng tiền hiển thị thì tỷ giá luôn là 1 và KHÔNG hỏi — hiện ô này ra chỉ đúng
  // khi có gì đó cần quy đổi (quyết định đã chốt, áp dụng cả Phase lẫn Event).
  const showFx = currency !== displayCurrency

  /**
   * Đổi tiền của CHẶNG NÀY → đặt lại ô tỷ giá ngay trong `onChange`, không qua effect.
   *
   * Bản trước là `useEffect(() => { if (!showFx) setFx('1') }, [showFx])`. Dep là BOOLEAN
   * `showFx`, nên nó chỉ chạy khi bước vào/ra khỏi "cùng tiền hiển thị": đổi giữa HAI
   * NGOẠI TỆ (VND → USD) để nguyên tỷ giá cũ, và tỷ giá đó giờ nói một câu khác hoàn
   * toàn — xem `fxAfterCurrencyChange` để biết vì sao không guard nào bắt được.
   *
   * Đặt trong onChange thay vì effect có thêm một cái đúng: effect với dep `currency`
   * cũng chạy ở lần mount, tức mở form sửa một chặng đã khai đúng tỷ giá là xoá mất nó.
   */
  function handleCurrencyChange(next: CurrencyCode) {
    setCurrency(next)
    setFx(fxAfterCurrencyChange(next, displayCurrency))
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // `stopPropagation`: trình sửa kịch bản có Esc riêng, và không chặn ở đây thì một
      // phím Esc đóng cả sheet này lẫn cả cái drawer đứng sau nó.
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const yearNum = Number(startYear)
  const yearValid = Number.isInteger(yearNum) && yearNum >= 1900 && yearNum <= 2200
  const yearDuplicate = yearValid && phases.some((p) => p.id !== phase.id && p.startYear === yearNum)
  const fxNum = Number(fx)
  const fxValid = isFxValid(fx)
  const labelValid = label.trim() !== ''
  // DB có `check (annual_income_minor >= 0)` và `check (annual_expense_minor >= 0)`.
  // MoneyField cho gõ biểu thức và NumPad có phím −, nên "5 − 9" ra −4 trên đường
  // mobile: không bắt ở đây thì lần Lưu ở chân drawer nổ một lỗi Postgres thô, xa chỗ
  // gõ sai cả một màn hình.
  const incomeValid = income >= 0
  const expenseValid = expense >= 0

  const canSave =
    labelValid && yearValid && !yearDuplicate && incomeValid && expenseValid && (!showFx || fxValid)

  function handleSubmit() {
    if (!canSave) return
    onApply({
      startYear: yearNum,
      label: label.trim(),
      country: country.trim() === '' ? null : country.trim(),
      currency,
      annualIncomeMinor: income,
      annualExpenseMinor: expense,
      fxToDisplay: showFx ? fxNum : 1,
    })
    onClose()
  }

  /** KHÔNG hỏi lại: mọi thứ ở đây chỉ là nháp, "Bỏ thay đổi" ở chân drawer là undo —
   *  cùng luật với nút thùng rác trên dòng inline (xem bản vẽ, mục Interactions). */
  function handleDelete() {
    onRemove()
    onClose()
  }

  const field =
    'w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm dark:text-gray-100'
  const label_ = 'mb-1 block text-xs font-medium text-fg-muted'

  const title = 'Chi tiết chặng đời'

  // `useId` chứ không phải id viết cứng: sheet này nằm trong DOM cùng lúc với trình sửa
  // kịch bản, và id trùng thì `htmlFor` bắt vào ô ĐẦU TIÊN khớp — nhãn trỏ sai ô còn tệ
  // hơn không có nhãn. Cùng cách với MoneyField và YearTableView.
  const uid = useId()

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
          Tên chặng
        </label>
        <input
          id={`${uid}-label`}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Ví dụ: Chuyển sang Mỹ"
          className={`mb-1 ${field}`}
        />
        {!labelValid && (
          <p role="alert" className="mb-2 text-xs text-money-out">
            Tên chặng không được để trống.
          </p>
        )}
        {labelValid && <div className="mb-2" />}

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
            Năm phải là số nguyên trong khoảng 1900–2200.
          </p>
        )}
        {yearValid && yearDuplicate && (
          <p role="alert" className="mb-2 text-xs text-money-out">
            Kịch bản đã có một chặng khác bắt đầu năm {yearNum} — mỗi năm chỉ được một chặng.
          </p>
        )}
        {(!startYear || (yearValid && !yearDuplicate)) && <div className="mb-3" />}

        <label htmlFor={`${uid}-country`} className={label_}>
          Quốc gia <span className="text-fg-muted">(không bắt buộc)</span>
        </label>
        <input
          id={`${uid}-country`}
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          placeholder="Ví dụ: JP, US, VN — để trống nếu không rõ"
          className={`mb-3 ${field}`}
        />

        <label htmlFor={`${uid}-currency`} className={label_}>
          Tiền dùng ở chặng này
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

        {/* Khối tỷ giá đặt TRÊN hai ô tiền. Đo thật ở 375×812 với NumPad tự bung: khi khối
            này nằm dưới, nhãn tỷ giá rơi xuống 803px trong khi vùng thấy được chỉ tới
            812px — bị cắt ngang, và dòng xem trước quy đổi thì còn xa hơn nữa. Đặt lên
            trên thì bàn số bung ra bên dưới không che được nó. Cùng lý do và cùng cách
            xếp với EventFormSheet. */}
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
            {/* Ô RỖNG có câu riêng: đó là trạng thái `handleCurrencyChange` vừa đặt, và
                "phải là một số lớn hơn 0" không nói được vì sao con số cũ biến mất. */}
            {!fxValid && (
              <p role="alert" className="mb-2 text-xs text-money-out">
                {fx.trim() === ''
                  ? 'Chưa có tỷ giá. Đổi tiền của chặng là tỷ giá cũ hết nghĩa (nó quy về đơn vị khác) — khai lại rồi mới lưu được.'
                  : 'Tỷ giá phải là một số lớn hơn 0.'}
              </p>
            )}
            {fxValid && fxNum === 1 && (
              <p className="mb-2 flex items-start gap-1 text-xs text-fg-warn">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                Tỷ giá 1:1 giữa hai tiền khác nhau gần như chắc chắn là ô chưa ai khai — kiểm tra lại.
              </p>
            )}
            {/* Chốt kiểm bắt buộc: fx_to_display cố ý NGƯỢC chiều với lib/rates.ts, nên
                gõ nhầm 150 thay vì 0,0067 sai hàng chục nghìn lần mà validate > 0
                không bắt được. Dòng xem trước này là cách DUY NHẤT phát hiện ra. */}
            {fxValid && (
              <p className="mb-3 text-xs tabular-nums text-fg-muted">
                Thu: {formatMoney(income, currency)} ≈{' '}
                {formatMoney(
                  convertLifetimeMinor(income, currency, displayCurrency, fxNum),
                  displayCurrency,
                )}
                <br />
                Chi: {formatMoney(expense, currency)} ≈{' '}
                {formatMoney(
                  convertLifetimeMinor(expense, currency, displayCurrency, fxNum),
                  displayCurrency,
                )}
              </p>
            )}
          </>
        )}

        {/* <span> chứ KHÔNG phải <label htmlFor>: MoneyField render CẢ HAI ô — nút chạm
            (`lg:hidden`) và input desktop (`hidden lg:block`) — nên luôn có hai đích khả
            dĩ, và `for` trỏ vào cái đang bị CSS ẩn thì bấm nhãn sẽ focus một ô vô hình.
            Tên đọc được đã do `ariaLabel` của MoneyField lo, và nó còn tốt hơn nhãn thường
            vì đọc kèm giá trị ("Thu nền mỗi năm: ¥5.000.000"). Dòng này là CHÚ THÍCH nhìn
            bằng mắt, nên dùng thẻ đúng nghĩa thay vì <label> mồ côi. */}
        <span className={label_}>Thu nền mỗi năm</span>
        {/* `autoOpen={false}` cho CẢ HAI ô: sheet này mở từ nút "⋯" của một dòng đã có sẵn
            số — người dùng vào đây để sửa TỶ GIÁ hoặc TIỀN chứ không phải gõ lại thu chi
            (thu chi sửa thẳng trên dòng inline), nên bung bàn số ngay chỉ che mất đúng
            khối tỷ giá ở trên. */}
        <div className="mb-1">
          <MoneyField
            value={income}
            onChange={setIncome}
            currency={currency}
            autoOpen={false}
            ariaLabel="Thu nền mỗi năm"
            className={`text-right font-semibold ${field}`}
          />
        </div>
        {!incomeValid && (
          <p role="alert" className="mb-2 text-xs text-money-out">
            Thu nền không được âm.
          </p>
        )}
        {incomeValid && <div className="mb-2" />}

        <span className={label_}>Chi nền mỗi năm</span>
        <div className="mb-1">
          <MoneyField
            value={expense}
            onChange={setExpense}
            currency={currency}
            autoOpen={false}
            ariaLabel="Chi nền mỗi năm"
            className={`text-right font-semibold ${field}`}
          />
        </div>
        {!expenseValid && (
          <p role="alert" className="mb-2 text-xs text-money-out">
            Chi nền không được âm.
          </p>
        )}
        {expenseValid && <div className="mb-2" />}

        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleDelete}
            className="min-h-11 rounded-md px-3 py-2 text-sm font-medium text-money-out transition active:scale-95 hover:bg-state-bad-bg"
          >
            Xóa chặng
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
