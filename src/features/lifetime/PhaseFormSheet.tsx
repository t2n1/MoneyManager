import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertCircle } from 'lucide-react'
import { repo } from '../../data'
import type { LifePhasePatch, NewLifePhase } from '../../data/repo'
import { confirmDialog } from '../../lib/dialog'
import { CURRENCIES, formatMoney, type CurrencyCode } from '../../lib/money'
import { MoneyField } from '../../components/MoneyField'
import type { LifePhaseRow } from '../../types/database.types'
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
  useEffect(() => {
    if (!showFx) setFx('1')
  }, [showFx])

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
  const fxValid = Number.isFinite(fxNum) && fxNum > 0
  const labelValid = label.trim() !== ''

  const canSave = labelValid && yearValid && !yearDuplicate && (!showFx || fxValid) && !saving

  async function invalidateAll() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['lifePhases'] }),
    ])
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
    } finally {
      setSaving(false)
    }
  }

  const field =
    'w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm outline-green-500 dark:text-gray-100'
  const label_ = 'mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400'

  // Xem trước quy đổi — chốt bắt buộc: hiện NGAY khi đang gõ, dùng đúng số tiền
  // của dòng đang sửa (thu VÀ chi, vì chặng có hai con số chứ không phải một).
  const incomePreview = showFx && fxValid ? convertLifetimeMinor(income, currency, displayCurrency, fxNum) : null
  const expensePreview = showFx && fxValid ? convertLifetimeMinor(expense, currency, displayCurrency, fxNum) : null

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 lg:items-center" onClick={onClose}>
      <div
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white dark:bg-gray-900 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-3 text-base font-bold text-gray-800 dark:text-gray-100">
          {phase ? 'Sửa chặng đời' : 'Chặng đời mới'}
        </h2>

        <label className={label_}>Tên chặng</label>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Ví dụ: Chuyển sang Mỹ"
          className={`mb-3 ${field}`}
        />

        <label className={label_}>Năm bắt đầu</label>
        <input
          inputMode="decimal"
          value={startYear}
          onChange={(e) => setStartYear(e.target.value)}
          className={`mb-1 ${field}`}
        />
        {!yearValid && startYear !== '' && (
          <p role="alert" className="mb-2 text-xs text-red-600 dark:text-red-400">
            Năm phải là số nguyên trong khoảng 1900–2200.
          </p>
        )}
        {yearValid && yearDuplicate && (
          <p role="alert" className="mb-2 text-xs text-red-600 dark:text-red-400">
            Kịch bản đã có một chặng khác bắt đầu năm {yearNum} — mỗi năm chỉ được một chặng.
          </p>
        )}
        {(!startYear || (yearValid && !yearDuplicate)) && <div className="mb-3" />}

        <label className={label_}>
          Quốc gia <span className="text-gray-500 dark:text-gray-400">(không bắt buộc)</span>
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
          onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
          className={`mb-3 ${field}`}
        >
          {(Object.keys(CURRENCIES) as CurrencyCode[]).map((c) => (
            <option key={c} value={c}>
              {CURRENCIES[c].label} ({c})
            </option>
          ))}
        </select>

        <label className={label_}>Thu nền mỗi năm</label>
        <div className="mb-3">
          <MoneyField value={income} onChange={setIncome} currency={currency} ariaLabel="Thu nền mỗi năm" className={`text-right font-semibold ${field}`} />
        </div>

        <label className={label_}>Chi nền mỗi năm</label>
        <div className="mb-3">
          <MoneyField value={expense} onChange={setExpense} currency={currency} ariaLabel="Chi nền mỗi năm" className={`text-right font-semibold ${field}`} />
        </div>

        {showFx && (
          <>
            <label className={`${label_} flex items-center gap-1`}>
              Tỷ giá giả định: 1 {CURRENCIES[currency].label} = ? {CURRENCIES[displayCurrency].label}
              {fxValid && fxNum === 1 && (
                <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden="true" />
              )}
            </label>
            <input inputMode="decimal" value={fx} onChange={(e) => setFx(e.target.value)} className={`mb-1 ${field}`} />
            {!fxValid && (
              <p role="alert" className="mb-2 text-xs text-red-600 dark:text-red-400">
                Tỷ giá phải là một số lớn hơn 0.
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
            {fxValid && (
              <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
                Thu: {formatMoney(income, currency)} ≈ {formatMoney(incomePreview ?? 0, displayCurrency)}
                <br />
                Chi: {formatMoney(expense, currency)} ≈ {formatMoney(expensePreview ?? 0, displayCurrency)}
              </p>
            )}
          </>
        )}

        <div className="flex items-center justify-between gap-2">
          {phase ? (
            <button
              type="button"
              onClick={handleDelete}
              disabled={saving}
              className="min-h-11 rounded-lg px-3 py-2 text-sm font-medium text-red-600 dark:text-red-400 active:scale-95 hover:bg-red-50 dark:hover:bg-red-900/30 disabled:opacity-50"
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
              className="min-h-11 rounded-lg px-3 py-2 text-sm text-gray-500 dark:text-gray-400 active:scale-95 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSave}
              className="min-h-11 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white active:scale-95 disabled:opacity-50"
            >
              {saving ? 'Đang lưu…' : 'Lưu'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
