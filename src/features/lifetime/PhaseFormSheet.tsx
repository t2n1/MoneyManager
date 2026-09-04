// Sheet "chi tiết chặng đời" — mở từ nút "⋯" trên một dòng chặng ở bàn sửa kịch bản
// (`ScenarioWorkbench`).
//
// CÒN LẠI GÌ. Hàng inline mang năm · tên · TIỀN · thu · chi. Trường duy nhất nó không
// chứa nổi là QUỐC GIA — mà `YearTableView` in cột "Chặng" bằng `country ?? phaseLabel`,
// nên bỏ hẳn là mất đường sửa một thứ đang hiện trên bảng theo năm.
//
// ĐÃ BỎ ô tiền và ô TỶ GIÁ GIẢ ĐỊNH. Từ bản vẽ v5 tiền khai thẳng trên hàng inline, còn
// tỷ giá không còn là thứ người dùng gõ: mọi quy đổi đi qua tỷ giá hôm nay của app (xem
// `fxModel.ts`). Cả dòng xem trước quy đổi ở đây cũng đi theo — nó tồn tại để bắt ca gõ
// nhầm tỷ giá, mà nay không còn ô tỷ giá nào để gõ nhầm.
//
// GHI VÀO BẢN NHÁP, KHÔNG GHI DB: bàn sửa treo mọi thay đổi ở lớp nháp cho tới khi bấm
// Lưu ở thanh nháp. Một sheet con ghi thẳng xuống DB làm "Bỏ" chỉ hoàn tác được một nửa,
// rồi lần Lưu sau đó `planDraftSave` ghi đè ngược lên chính thứ vừa lưu.
import { useEffect, useId, useState } from 'react'
import { Guide } from '../../components/Guide'
import { MoneyField } from '../../components/MoneyField'
import type { DraftPhase } from './draft'
import { SectionTitle, actionButtonClass } from '../../components/ui'

interface Props {
  /** Mọi chặng của BẢN NHÁP, để chặn `start_year` trùng (DB có
   *  `unique (scenario_id, start_year)`, bắt trước ở đây để hiện câu lỗi tử tế). */
  phases: DraftPhase[]
  /** Chặng đang sửa. Không có ca "tạo mới": chặng mới thêm thẳng trên hàng inline. */
  phase: DraftPhase
  /** Ghi các trường đã sửa vào bản nháp. */
  onApply: (patch: Partial<Omit<DraftPhase, 'id'>>) => void
  /** Bỏ chặng này khỏi bản nháp. */
  onRemove: () => void
  onClose: () => void
}

/** Sheet sửa một CHẶNG ĐỜI — ghi vào bản nháp của bàn sửa kịch bản. */
export function PhaseFormSheet({ phases, phase, onApply, onRemove, onClose }: Props) {
  const [label, setLabel] = useState(phase.label)
  const [startYear, setStartYear] = useState(String(phase.startYear))
  const [country, setCountry] = useState(phase.country ?? '')
  const [income, setIncome] = useState(phase.annualIncomeMinor)
  const [expense, setExpense] = useState(phase.annualExpenseMinor)

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
  const yearValid = Number.isInteger(yearNum) && yearNum >= 1900 && yearNum <= 2200
  const yearDuplicate = yearValid && phases.some((p) => p.id !== phase.id && p.startYear === yearNum)
  const labelValid = label.trim() !== ''
  // DB có `check (annual_income_minor >= 0)` và `check (annual_expense_minor >= 0)`.
  // MoneyField cho gõ biểu thức và NumPad có phím −, nên "5 − 9" ra −4 trên đường
  // mobile: không bắt ở đây thì lần Lưu nổ một lỗi Postgres thô, xa chỗ gõ sai.
  const incomeValid = income >= 0
  const expenseValid = expense >= 0

  const canSave = labelValid && yearValid && !yearDuplicate && incomeValid && expenseValid

  function handleSubmit() {
    if (!canSave) return
    onApply({
      startYear: yearNum,
      label: label.trim(),
      country: country.trim() === '' ? null : country.trim(),
      annualIncomeMinor: income,
      annualExpenseMinor: expense,
    })
    onClose()
  }

  /** KHÔNG hỏi lại: mọi thứ ở đây chỉ là nháp, "Bỏ" ở thanh nháp là undo — cùng luật
   *  với nút thùng rác trên hàng inline. */
  function handleDelete() {
    onRemove()
    onClose()
  }

  const field =
    'w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm dark:text-gray-100'
  const label_ = 'mb-1 block text-sm font-medium text-fg-muted'

  const title = 'Chi tiết chặng đời'

  // `useId` chứ không phải id viết cứng: sheet này nằm trong DOM cùng lúc với bàn sửa,
  // và id trùng thì `htmlFor` bắt vào ô ĐẦU TIÊN khớp — nhãn trỏ sai ô còn tệ hơn không
  // có nhãn. Cùng cách với MoneyField và YearTableView.
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
        className="max-h-[92vh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-2xl bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:rounded-2xl animate-sheet-in lg:animate-sheet-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <SectionTitle role="block" className="mb-1">{title}</SectionTitle>
        <Guide className="mb-3 text-sm text-fg-muted">
          Bấm Xong là ghi vào bản nháp — kịch bản chỉ đổi khi bấm Lưu ở thanh nháp trên đồ
          thị.
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
          <p role="alert" className="mb-2 text-sm text-money-out">
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
          <p role="alert" className="mb-2 text-sm text-money-out">
            Năm phải là số nguyên trong khoảng 1900–2200.
          </p>
        )}
        {yearValid && yearDuplicate && (
          <p role="alert" className="mb-2 text-sm text-money-out">
            Kịch bản đã có một chặng khác bắt đầu năm {yearNum} — mỗi năm chỉ được một chặng.
          </p>
        )}
        {(!startYear || (yearValid && !yearDuplicate)) && <div className="mb-3" />}

        {/* Lý do sheet này còn tồn tại: `YearTableView` in cột "Chặng" bằng
            `country ?? phaseLabel`, nên đây là trường duy nhất đang hiện trên màn mà
            hàng inline không sửa được. */}
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

        {/* <span> chứ KHÔNG phải <label htmlFor>: MoneyField render CẢ HAI ô — nút chạm
            (`lg:hidden`) và input desktop (`hidden lg:block`) — nên luôn có hai đích khả
            dĩ, và `for` trỏ vào cái đang bị CSS ẩn thì bấm nhãn sẽ focus một ô vô hình.
            Tên đọc được đã do `ariaLabel` của MoneyField lo. */}
        <span className={label_}>Thu nền mỗi năm</span>
        <div className="mb-1">
          <MoneyField
            value={income}
            onChange={setIncome}
            currency={phase.currency}
            autoOpen={false}
            ariaLabel="Thu nền mỗi năm"
            className={`text-right font-semibold ${field}`}
          />
        </div>
        {!incomeValid && (
          <p role="alert" className="mb-2 text-sm text-money-out">
            Thu nền không được âm.
          </p>
        )}
        {incomeValid && <div className="mb-2" />}

        <span className={label_}>Chi nền mỗi năm</span>
        <div className="mb-1">
          <MoneyField
            value={expense}
            onChange={setExpense}
            currency={phase.currency}
            autoOpen={false}
            ariaLabel="Chi nền mỗi năm"
            className={`text-right font-semibold ${field}`}
          />
        </div>
        {!expenseValid && (
          <p role="alert" className="mb-2 text-sm text-money-out">
            Chi nền không được âm.
          </p>
        )}
        {expenseValid && <div className="mb-2" />}

        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleDelete}
            className={actionButtonClass('danger')}
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
