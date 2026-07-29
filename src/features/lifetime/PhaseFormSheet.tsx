import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertCircle } from 'lucide-react'
import { repo } from '../../data'
import type { LifePhasePatch, NewLifePhase } from '../../data/repo'
import { confirmDialog, showToast } from '../../lib/dialog'
import { CURRENCIES, formatMoney, type CurrencyCode } from '../../lib/money'
import { MoneyField } from '../../components/MoneyField'
import type { LifePhaseRow } from '../../types/database.types'
import { fxAfterCurrencyChange, isFxValid } from './fxField'
import { convertLifetimeMinor } from './project'

interface Props {
  scenarioId: string
  /** Tiền hiển thị của kịch bản — quyết định ô tỷ giá có hiện hay không. */
  displayCurrency: CurrencyCode
  /** Toàn bộ chặng khác của kịch bản, dùng để chặn `start_year` trùng (DB có
   *  `unique (scenario_id, start_year)`, bắt trước ở đây để hiện câu lỗi tử tế). */
  phases: LifePhaseRow[]
  /** Có giá trị = sửa; không = tạo mới. */
  phase?: LifePhaseRow
  onClose: () => void
}

/** Sheet tạo/sửa một CHẶNG ĐỜI (thu chi nền của kịch bản Lifetime). */
export function PhaseFormSheet({ scenarioId, displayCurrency, phases, phase, onClose }: Props) {
  const qc = useQueryClient()
  const create = useMutation({ mutationFn: (input: NewLifePhase) => repo.createLifePhase(input) })
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: LifePhasePatch }) => repo.updateLifePhase(id, patch),
  })
  const del = useMutation({ mutationFn: (id: string) => repo.deleteLifePhase(id) })

  const [label, setLabel] = useState(phase?.label ?? '')
  const [startYear, setStartYear] = useState(String(phase?.start_year ?? new Date().getFullYear()))
  const [country, setCountry] = useState(phase?.country ?? '')
  const [currency, setCurrency] = useState<CurrencyCode>((phase?.currency as CurrencyCode) ?? displayCurrency)
  const [income, setIncome] = useState(phase?.annual_income_minor ?? 0)
  const [expense, setExpense] = useState(phase?.annual_expense_minor ?? 0)
  const [fx, setFx] = useState(String(phase?.fx_to_display ?? 1))
  const [saving, setSaving] = useState(false)
  // true trong lúc chờ confirmDialog xoá — chặn Esc của SHEET NÀY đóng đè lên hộp
  // thoại xác nhận (dialog.tsx có Esc riêng của nó; không guard thì Esc vừa đóng
  // hộp thoại vừa đóng luôn sheet, mất đúng lúc người dùng chỉ định huỷ xoá).
  const [confirming, setConfirming] = useState(false)

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

  // Đóng bằng Esc — trừ lúc đang chờ xác nhận xoá (xem comment `confirming` ở trên).
  useEffect(() => {
    if (confirming) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [confirming, onClose])

  const yearNum = Number(startYear)
  const yearValid = Number.isInteger(yearNum) && yearNum >= 1900 && yearNum <= 2200
  const yearDuplicate = yearValid && phases.some((p) => p.id !== phase?.id && p.start_year === yearNum)
  const fxNum = Number(fx)
  const fxValid = isFxValid(fx)
  const labelValid = label.trim() !== ''
  // DB có `check (annual_income_minor >= 0)` và `check (annual_expense_minor >= 0)`.
  // MoneyField cho gõ biểu thức và NumPad có phím −, nên "5 − 9" ra −4 trên đường
  // mobile: không bắt ở đây thì nút Lưu im lặng không làm gì (canSave vẫn true, DB
  // đá về), hoặc nổ một lỗi Postgres thô. Cùng cách EventFormSheet đã làm cho
  // amount_minor.
  const incomeValid = income >= 0
  const expenseValid = expense >= 0

  const canSave =
    labelValid && yearValid && !yearDuplicate && incomeValid && expenseValid && (!showFx || fxValid) && !saving

  async function invalidateAll() {
    await qc.invalidateQueries({ queryKey: ['lifePhases'] })
  }

  async function handleSubmit() {
    if (!canSave) return
    setSaving(true)
    try {
      const input = {
        start_year: yearNum,
        label: label.trim(),
        country: country.trim() === '' ? null : country.trim(),
        currency,
        annual_income_minor: income,
        annual_expense_minor: expense,
        fx_to_display: showFx ? fxNum : 1,
      }
      if (phase) await update.mutateAsync({ id: phase.id, patch: input })
      else await create.mutateAsync({ scenario_id: scenarioId, ...input })
      await invalidateAll()
      onClose()
    } catch (err) {
      // Không có catch thì mọi lỗi tầng dưới (ràng buộc DB, mất mạng) thành một
      // unhandled rejection: sheet cứ đứng đó, không toast, không câu nào.
      showToast(err instanceof Error ? err.message : 'Không lưu được chặng đời.', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!phase) return
    setConfirming(true)
    const ok = await confirmDialog({ title: 'Xóa chặng này?', danger: true, confirmLabel: 'Xóa' })
    setConfirming(false)
    if (!ok) return
    setSaving(true)
    try {
      await del.mutateAsync(phase.id)
      await invalidateAll()
      onClose()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Không xóa được chặng đời.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const field =
    'w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm outline-green-500 dark:text-gray-100'
  const label_ = 'mb-1 block text-xs font-medium text-fg-muted'

  // Xem trước quy đổi — chốt bắt buộc: hiện NGAY khi đang gõ, dùng đúng số tiền
  // của dòng đang sửa (thu VÀ chi, vì chặng có hai con số chứ không phải một).
  const incomePreview = showFx && fxValid ? convertLifetimeMinor(income, currency, displayCurrency, fxNum) : null
  const expensePreview = showFx && fxValid ? convertLifetimeMinor(expense, currency, displayCurrency, fxNum) : null

  const title = phase ? 'Sửa chặng đời' : 'Chặng đời mới'

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 lg:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-3 text-base font-bold text-fg-primary">{title}</h2>

        <label className={label_}>Tên chặng</label>
        <input
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

        <label className={label_}>Năm bắt đầu</label>
        <input
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

        <label className={label_}>
          Quốc gia <span className="text-fg-muted">(không bắt buộc)</span>
        </label>
        <input
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          placeholder="Ví dụ: JP, US, VN — để trống nếu không rõ"
          className={`mb-3 ${field}`}
        />

        <label className={label_}>Tiền dùng ở chặng này</label>
        <select
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
            <label className={`${label_} flex items-center gap-1`}>
              Tỷ giá giả định: 1 {CURRENCIES[currency].label} = ? {CURRENCIES[displayCurrency].label}
              {fxValid && fxNum === 1 && (
                <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden="true" />
              )}
            </label>
            <input inputMode="decimal" value={fx} onChange={(e) => setFx(e.target.value)} className={`mb-1 ${field}`} />
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
              <p className="mb-2 flex items-start gap-1 text-xs text-amber-700 dark:text-amber-400">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                Tỷ giá 1:1 giữa hai tiền khác nhau gần như chắc chắn là ô chưa ai khai — kiểm tra lại.
              </p>
            )}
            {/* Chốt kiểm bắt buộc: fx_to_display cố ý NGƯỢC chiều với lib/rates.ts, nên
                gõ nhầm 150 thay vì 0,0067 sai hàng chục nghìn lần mà validate > 0
                không bắt được. Dòng xem trước này là cách DUY NHẤT phát hiện ra. */}
            {incomePreview !== null && expensePreview !== null && (
              <p className="mb-3 text-xs tabular-nums text-fg-muted">
                Thu: {formatMoney(income, currency)} ≈ {formatMoney(incomePreview, displayCurrency)}
                <br />
                Chi: {formatMoney(expense, currency)} ≈ {formatMoney(expensePreview, displayCurrency)}
              </p>
            )}
          </>
        )}

        <label className={label_}>Thu nền mỗi năm</label>
        {/* Ô tiền CHÍNH của form này → để `autoOpen` mặc định (bung NumPad ngay).
            Ô "Chi nền" bên dưới là ô phụ: hai ô cùng tự bung thì ô mount SAU thắng,
            nên bàn phím hiện ra dưới ô thứ hai — xem hợp đồng `autoOpen` ở MoneyField. */}
        <div className="mb-1">
          <MoneyField value={income} onChange={setIncome} currency={currency} ariaLabel="Thu nền mỗi năm" className={`text-right font-semibold ${field}`} />
        </div>
        {!incomeValid && (
          <p role="alert" className="mb-2 text-xs text-money-out">
            Thu nền không được âm.
          </p>
        )}
        {incomeValid && <div className="mb-2" />}

        <label className={label_}>Chi nền mỗi năm</label>
        <div className="mb-1">
          <MoneyField value={expense} onChange={setExpense} currency={currency} autoOpen={false} ariaLabel="Chi nền mỗi năm" className={`text-right font-semibold ${field}`} />
        </div>
        {!expenseValid && (
          <p role="alert" className="mb-2 text-xs text-money-out">
            Chi nền không được âm.
          </p>
        )}
        {expenseValid && <div className="mb-2" />}

        <div className="flex items-center justify-between gap-2">
          {phase ? (
            <button
              type="button"
              onClick={handleDelete}
              disabled={saving}
              className="min-h-11 rounded-lg px-3 py-2 text-sm font-medium text-money-out active:scale-95 hover:bg-red-50 dark:hover:bg-red-900/30 disabled:opacity-50"
            >
              Xóa
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 rounded-lg px-3 py-2 text-sm text-fg-muted active:scale-95 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSave}
              className="min-h-11 rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white active:scale-95 disabled:opacity-50"
            >
              {saving ? 'Đang lưu…' : 'Lưu'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
