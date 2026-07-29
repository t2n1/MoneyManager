import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, ChevronLeft, Sparkles } from 'lucide-react'
import { repo } from '../../data'
import type { LifeEventPatch, NewLifeEvent } from '../../data/repo'
import { confirmDialog, promptDialog, showToast } from '../../lib/dialog'
import { CURRENCIES, formatMoney, type CurrencyCode } from '../../lib/money'
import { MoneyField } from '../../components/MoneyField'
import type { LifeEventRow, LifePhaseRow } from '../../types/database.types'
import { convertLifetimeMinor } from './project'
import { LIFE_PRESETS, type PresetContext } from './presets'

/** Khớp `check (start_year between 1900 and 2200)` và `check (end_year between 1900
 *  and 2200)` của cả `life_phases` lẫn `life_events` (migration 0031). */
const MIN_YEAR = 1900
const MAX_YEAR = 2200

interface Props {
  scenarioId: string
  /** Tiền hiển thị của kịch bản — quyết định ô tỷ giá có hiện hay không. */
  displayCurrency: CurrencyCode
  /** Toàn bộ chặng của kịch bản. Cần cho nút "Chọn mẫu": vài mẫu (Cưới, Nghỉ hưu,
   *  Chuyển nước) sinh cả một CHẶNG ở năm người dùng gõ, mà DB có
   *  `unique (scenario_id, start_year)` nên trùng năm là nổ ở tầng dưới. */
  phases: LifePhaseRow[]
  /** Có giá trị = sửa; không = tạo mới. */
  event?: LifeEventRow
  /** Dựng `PresetContext` cho một năm cụ thể — phần còn lại (chặng hiệu lực, tỷ
   *  giá hôm nay) đã được `ScenarioEditorSheet` chuẩn bị sẵn (xem đó để biết vì
   *  sao chỉ thiếu mỗi `year`). */
  buildPresetCtx: (year: number) => PresetContext
  /** true = mở thẳng vào danh sách mẫu thay vì form tạo sự kiện trống — dùng khi
   *  vào từ nút "Chọn mẫu" của khối Chặng đời (mẫu có thể sinh cả chặng lẫn sự
   *  kiện, nên khối nào cũng có lối vào, nhưng chỉ có MỘT cách hiện mẫu). */
  initialPresetsOpen?: boolean
  onClose: () => void
}

/** Sheet tạo/sửa một SỰ KIỆN (khoản có năm bắt đầu, tùy chọn năm kết thúc) của
 *  Lifetime, kèm lối tắt sinh chùm sự kiện từ mẫu (`LIFE_PRESETS`). */
export function EventFormSheet({
  scenarioId,
  displayCurrency,
  phases,
  event,
  buildPresetCtx,
  initialPresetsOpen = false,
  onClose,
}: Props) {
  const qc = useQueryClient()
  const create = useMutation({ mutationFn: (input: NewLifeEvent) => repo.createLifeEvent(input) })
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: LifeEventPatch }) => repo.updateLifeEvent(id, patch),
  })
  const del = useMutation({ mutationFn: (id: string) => repo.deleteLifeEvent(id) })

  const [label, setLabel] = useState(event?.label ?? '')
  const [kind, setKind] = useState<'income' | 'expense'>(event?.kind ?? 'expense')
  const [startYear, setStartYear] = useState(String(event?.start_year ?? new Date().getFullYear()))
  const [forever, setForever] = useState(event ? event.end_year === null : false)
  const [endYear, setEndYear] = useState(
    String(event?.end_year ?? event?.start_year ?? new Date().getFullYear()),
  )
  const [amount, setAmount] = useState(event?.amount_minor ?? 0)
  const [currency, setCurrency] = useState<CurrencyCode>((event?.currency as CurrencyCode) ?? displayCurrency)
  const [fx, setFx] = useState(String(event?.fx_to_display ?? 1))
  const [inflate, setInflate] = useState(event?.inflate ?? true)
  const [note, setNote] = useState(event?.note ?? '')
  const [saving, setSaving] = useState(false)
  // true trong lúc chờ confirmDialog/promptDialog — chặn Esc của sheet này đóng đè
  // lên hộp thoại con (cùng lý do đã ghi ở PhaseFormSheet).
  const [busy, setBusy] = useState(false)
  const [presetsOpen, setPresetsOpen] = useState(initialPresetsOpen)

  // Cùng tiền hiển thị thì tỷ giá luôn là 1 và KHÔNG hỏi.
  const showFx = currency !== displayCurrency
  useEffect(() => {
    if (!showFx) setFx('1')
  }, [showFx])

  useEffect(() => {
    if (busy) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  const yearNum = Number(startYear)
  const yearValid = Number.isInteger(yearNum) && yearNum >= MIN_YEAR && yearNum <= MAX_YEAR
  const endYearNum = Number(endYear)
  const endYearValid =
    forever ||
    (Number.isInteger(endYearNum) && endYearNum >= MIN_YEAR && endYearNum <= MAX_YEAR && endYearNum >= yearNum)
  const fxNum = Number(fx)
  const fxValid = Number.isFinite(fxNum) && fxNum > 0
  const labelValid = label.trim() !== ''
  const amountValid = amount >= 0

  const canSave = labelValid && yearValid && endYearValid && amountValid && (!showFx || fxValid) && !saving

  async function invalidateEvents() {
    await qc.invalidateQueries({ queryKey: ['lifeEvents'] })
  }

  async function handleSubmit() {
    if (!canSave) return
    setSaving(true)
    try {
      const input = {
        start_year: yearNum,
        end_year: forever ? null : endYearNum,
        kind,
        amount_minor: amount,
        currency,
        label: label.trim(),
        note: note.trim(),
        fx_to_display: showFx ? fxNum : 1,
        inflate,
      }
      if (event) await update.mutateAsync({ id: event.id, patch: input })
      else await create.mutateAsync({ scenario_id: scenarioId, ...input })
      await invalidateEvents()
      onClose()
    } catch (err) {
      // Không có catch thì mọi lỗi tầng dưới (ràng buộc DB, mất mạng) thành một
      // unhandled rejection: sheet cứ đứng đó, không toast, không câu nào.
      showToast(err instanceof Error ? err.message : 'Không lưu được sự kiện.', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!event) return
    setBusy(true)
    const ok = await confirmDialog({ title: 'Xóa sự kiện này?', danger: true, confirmLabel: 'Xóa' })
    setBusy(false)
    if (!ok) return
    setSaving(true)
    try {
      await del.mutateAsync(event.id)
      await invalidateEvents()
      onClose()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Không xóa được sự kiện.', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handlePickPreset(presetId: string) {
    const preset = LIFE_PRESETS.find((p) => p.id === presetId)
    if (!preset) return
    setBusy(true)
    const raw = await promptDialog({
      title: preset.yearLabel,
      placeholder: 'Ví dụ: 2029',
      defaultValue: startYear,
    })
    setBusy(false)
    if (raw === null) return
    const year = Number(raw)
    if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
      showToast(`Năm không hợp lệ — nhập một số nguyên trong khoảng ${MIN_YEAR}–${MAX_YEAR}.`, 'error')
      return
    }
    setSaving(true)
    try {
      const ctx = buildPresetCtx(year)
      const built = preset.build(ctx)

      // Kiểm TRƯỚC KHI GHI một dòng nào. Mẫu suy mọi mốc từ năm người dùng vừa gõ
      // (Mua nhà cộng thêm 34 năm), nên nó dựng được cả năm trùng chặng đã có lẫn
      // năm vượt 2200 — hai ràng buộc DB thật (`unique (scenario_id, start_year)`
      // và `check (end_year between 1900 and 2200)`). Bắt sau khi ghi là vô nghĩa:
      // demoRepo không kiểm gì nên chỉ Supabase thật mới đá về, lúc đó nửa chùm
      // bản ghi đã vào rồi.
      const dupYear = built.phases.find((p) => phases.some((e) => e.start_year === p.start_year))
      if (dupYear) {
        showToast(
          `Kịch bản đã có một chặng khác bắt đầu năm ${dupYear.start_year} — mỗi năm chỉ được một chặng. Chọn năm khác cho mẫu này, hoặc sửa/xoá chặng đang ở năm đó trước.`,
          'error',
        )
        return
      }
      const years = [
        ...built.phases.map((p) => p.start_year),
        ...built.events.flatMap((e) => (e.end_year === null ? [e.start_year] : [e.start_year, e.end_year])),
      ]
      const badYear = years.find((y) => y < MIN_YEAR || y > MAX_YEAR)
      if (badYear !== undefined) {
        showToast(
          `Mẫu này sinh mốc năm ${badYear}, ngoài khoảng ${MIN_YEAR}–${MAX_YEAR} nên không lưu được. Chọn một năm sớm hơn.`,
          'error',
        )
        return
      }

      // Mẫu tạo THẬT bản ghi (không phải điền sẵn form) — sinh ra rồi là bản ghi
      // thường, sửa xoá như mọi dòng khác (xem presets.ts).
      //
      // Chặng TRƯỚC, sự kiện SAU, và tuần tự chứ không Promise.all: chạy song song
      // thì một lỗi ở chặng vẫn để lại đủ chùm sự kiện đứng một mình.
      for (const p of built.phases) await repo.createLifePhase(p)
      for (const e of built.events) await repo.createLifeEvent(e)

      await Promise.all([
        qc.invalidateQueries({ queryKey: ['lifePhases'] }),
        qc.invalidateQueries({ queryKey: ['lifeEvents'] }),
      ])
      onClose()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Không tạo được bản ghi từ mẫu.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const field =
    'w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm outline-green-500 dark:text-gray-100'
  const label_ = 'mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400'

  // Chốt kiểm bắt buộc: xem trước quy đổi dùng đúng số tiền của dòng đang sửa.
  const amountPreview = showFx && fxValid ? convertLifetimeMinor(amount, currency, displayCurrency, fxNum) : null

  const title = presetsOpen ? 'Chọn mẫu' : event ? 'Sửa sự kiện' : 'Sự kiện mới'

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 lg:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white dark:bg-gray-900 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {presetsOpen ? (
          <>
            <div className="mb-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPresetsOpen(false)}
                aria-label="Quay lại"
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg active:scale-95 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <ChevronLeft className="h-5 w-5 text-gray-600 dark:text-gray-300" />
              </button>
              <h2 className="text-base font-bold text-gray-800 dark:text-gray-100">Chọn mẫu</h2>
            </div>
            <ul className="flex flex-col gap-2">
              {LIFE_PRESETS.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => handlePickPreset(p.id)}
                    className="min-h-11 w-full rounded-lg bg-gray-50 dark:bg-gray-800 p-2.5 text-left active:scale-95 disabled:opacity-50"
                  >
                    <span className="block text-sm font-semibold text-gray-800 dark:text-gray-100">{p.label}</span>
                    <span className="block text-xs text-gray-500 dark:text-gray-400">{p.hint}</span>
                  </button>
                </li>
              ))}
            </ul>
            {saving && (
              <p className="mt-3 text-center text-xs text-gray-500 dark:text-gray-400">Đang tạo bản ghi từ mẫu…</p>
            )}
          </>
        ) : (
          <>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-base font-bold text-gray-800 dark:text-gray-100">{title}</h2>
              {!event && (
                <button
                  type="button"
                  onClick={() => setPresetsOpen(true)}
                  className="inline-flex min-h-11 items-center gap-1 rounded-lg bg-green-50 dark:bg-green-900/30 px-3 text-xs font-semibold text-green-700 dark:text-green-400 active:scale-95"
                >
                  <Sparkles className="h-3.5 w-3.5" /> Chọn mẫu
                </button>
              )}
            </div>

            <label className={label_}>Tên sự kiện</label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Ví dụ: Học phí đại học"
              className={`mb-1 ${field}`}
            />
            {!labelValid && (
              <p role="alert" className="mb-2 text-xs text-red-600 dark:text-red-400">
                Tên sự kiện không được để trống.
              </p>
            )}
            {labelValid && <div className="mb-2" />}

            <label className={label_}>Loại</label>
            <div className="mb-3 flex gap-2">
              <button
                type="button"
                onClick={() => setKind('expense')}
                className={`min-h-11 flex-1 rounded-lg text-sm font-medium active:scale-95 ${
                  kind === 'expense'
                    ? 'bg-green-600 text-white'
                    : 'border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300'
                }`}
              >
                Chi
              </button>
              <button
                type="button"
                onClick={() => setKind('income')}
                className={`min-h-11 flex-1 rounded-lg text-sm font-medium active:scale-95 ${
                  kind === 'income'
                    ? 'bg-green-600 text-white'
                    : 'border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300'
                }`}
              >
                Thu
              </button>
            </div>

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
            {(!startYear || yearValid) && <div className="mb-2" />}

            <label className="mb-2 flex min-h-11 items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input type="checkbox" checked={forever} onChange={(e) => setForever(e.target.checked)} className="h-4 w-4" />
              Kéo dài đến hết đời (không có năm kết thúc)
            </label>
            {!forever && (
              <>
                <label className={label_}>Năm kết thúc</label>
                <input
                  inputMode="decimal"
                  value={endYear}
                  onChange={(e) => setEndYear(e.target.value)}
                  className={`mb-1 ${field}`}
                />
                {!endYearValid && (
                  <p role="alert" className="mb-2 text-xs text-red-600 dark:text-red-400">
                    Năm kết thúc phải ≥ năm bắt đầu (hoặc bật "đến hết đời" ở trên).
                  </p>
                )}
                {endYearValid && <div className="mb-2" />}
              </>
            )}

            <label className={label_}>Tiền của sự kiện này</label>
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

            <label className={label_}>Số tiền mỗi năm</label>
            <div className="mb-1">
              <MoneyField
                value={amount}
                onChange={setAmount}
                currency={currency}
                ariaLabel="Số tiền mỗi năm"
                className={`text-right font-semibold ${field}`}
              />
            </div>
            {!amountValid && (
              <p role="alert" className="mb-2 text-xs text-red-600 dark:text-red-400">
                Số tiền không được âm.
              </p>
            )}
            {amountValid && <div className="mb-2" />}

            {showFx && (
              <>
                <label className={`${label_} flex items-center gap-1`}>
                  Tỷ giá giả định: 1 {CURRENCIES[currency].label} = ? {CURRENCIES[displayCurrency].label}
                  {fxValid && fxNum === 1 && (
                    <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden="true" />
                  )}
                </label>
                <input
                  inputMode="decimal"
                  value={fx}
                  onChange={(e) => setFx(e.target.value)}
                  className={`mb-1 ${field}`}
                />
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
                {/* Chốt kiểm bắt buộc — xem PhaseFormSheet để biết vì sao dòng này
                    không phải tiện nghi: fx_to_display ngược chiều lib/rates.ts. */}
                {amountPreview !== null && (
                  <p className="mb-3 text-xs tabular-nums text-gray-500 dark:text-gray-400">
                    {formatMoney(amount, currency)} ≈ {formatMoney(amountPreview, displayCurrency)}
                  </p>
                )}
              </>
            )}

            <label className="mb-3 flex min-h-11 items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input type="checkbox" checked={inflate} onChange={(e) => setInflate(e.target.checked)} className="h-4 w-4" />
              Tăng theo lạm phát (giá hôm nay cho việc xảy ra ở tương lai)
            </label>

            <label className={label_}>
              Ghi chú <span className="text-gray-500 dark:text-gray-400">(không bắt buộc)</span>
            </label>
            <input value={note} onChange={(e) => setNote(e.target.value)} className={`mb-4 ${field}`} />

            <div className="flex items-center justify-between gap-2">
              {event ? (
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
          </>
        )}
      </div>
    </div>
  )
}
