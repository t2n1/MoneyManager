import { useEffect, useId, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, ChevronLeft, Sparkles } from 'lucide-react'
import { repo } from '../../data'
import type { LifeEventPatch, NewLifeEvent } from '../../data/repo'
import { confirmDialog, promptDialog, showToast } from '../../lib/dialog'
import { CURRENCIES, formatMoney, type CurrencyCode } from '../../lib/money'
import { MoneyField } from '../../components/MoneyField'
import type { LifeEventRow, LifePhaseRow } from '../../types/database.types'
import { fxAfterCurrencyChange, isFxValid } from './fxField'
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

  /** Đổi tiền của SỰ KIỆN NÀY → đặt lại ô tỷ giá. Cùng luật với `PhaseFormSheet`, xem
   *  `fxAfterCurrencyChange` để biết vì sao effect theo boolean `showFx` bỏ sót đúng ca
   *  đổi giữa hai ngoại tệ (VND → USD) — và vì sao không guard nào bắt được ca đó. */
  function handleCurrencyChange(next: CurrencyCode) {
    setCurrency(next)
    setFx(fxAfterCurrencyChange(next, displayCurrency))
  }

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
  const fxValid = isFxValid(fx)
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
    // Đã có dòng nào THẬT SỰ vào DB chưa. Quyết định hai thứ: có phải làm mới cache
    // hay không, và câu chữ của toast lỗi (mẫu ghi tuần tự nên lỗi giữa chùm để lại
    // một mớ dở dang, khác hẳn lỗi ngay ở dòng đầu).
    let wrote = false
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
      //
      // Làm mới cache trong `finally` chứ không sau vòng ghi: đặt sau vòng ghi thì
      // một lỗi giữa chùm (mất mạng, RLS, timeout) để lại chặng ĐÃ vào DB mà
      // ['lifePhases'] không ai đụng — staleTime 30s (main.tsx) nên UI không biết
      // gì. Hệ quả nặng hơn cả cái toast: bộ chặn trùng năm ngay ở trên và
      // `yearDuplicate` của PhaseFormSheet đều đọc prop `phases`, tức đọc đúng cái
      // cache cũ đó — thử lại mẫu này, hay gõ chính năm đó vào "Thêm chặng", sẽ lọt
      // qua câu lỗi tử tế rồi đâm thẳng vào `unique (scenario_id, start_year)`. Bộ
      // chặn chỉ đáng tin bằng độ tươi của dữ liệu nó đọc.
      try {
        for (const p of built.phases) {
          await repo.createLifePhase(p)
          wrote = true
        }
        for (const e of built.events) {
          await repo.createLifeEvent(e)
          wrote = true
        }
      } finally {
        if (wrote) {
          await Promise.all([
            qc.invalidateQueries({ queryKey: ['lifePhases'] }),
            qc.invalidateQueries({ queryKey: ['lifeEvents'] }),
          ])
        }
      }
      onClose()
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'lỗi không rõ'
      showToast(
        wrote
          ? // Ghi tuần tự nên lỗi giữa chùm để lại một mớ dòng ĐÃ vào — nói ra, cùng
            // cách "Nhân bản kịch bản" đã làm, để người dùng biết có thứ cần dọn.
            `Không tạo xong bản ghi từ mẫu (${detail}). Mẫu ghi từng dòng một nên có thể đã có vài chặng/sự kiện vào rồi — xem hai khối "Chặng đời"/"Sự kiện" và xoá dòng thừa nếu cần.`
          : `Không tạo được bản ghi từ mẫu (${detail}).`,
        'error',
      )
    } finally {
      setSaving(false)
    }
  }

  const field =
    'w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm dark:text-gray-100'
  const label_ = 'mb-1 block text-xs font-medium text-fg-muted'

  // Chốt kiểm bắt buộc: xem trước quy đổi dùng đúng số tiền của dòng đang sửa.
  const amountPreview = showFx && fxValid ? convertLifetimeMinor(amount, currency, displayCurrency, fxNum) : null

  const title = presetsOpen ? 'Chọn mẫu' : event ? 'Sửa sự kiện' : 'Sự kiện mới'

  // `useId` chứ không phải id viết cứng — cùng lý do đã ghi ở PhaseFormSheet: id trùng
  // thì `htmlFor` bắt vào ô đầu tiên khớp, tức nhãn trỏ SAI ô.
  const uid = useId()

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 lg:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:rounded-2xl"
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
                <ChevronLeft className="h-5 w-5 text-fg-secondary" />
              </button>
              <h2 className="text-base font-bold text-fg-primary">Chọn mẫu</h2>
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
                    <span className="block text-sm font-semibold text-fg-primary">{p.label}</span>
                    <span className="block text-xs text-fg-muted">{p.hint}</span>
                  </button>
                </li>
              ))}
            </ul>
            {saving && (
              <p className="mt-3 text-center text-xs text-fg-muted">Đang tạo bản ghi từ mẫu…</p>
            )}
          </>
        ) : (
          <>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-base font-bold text-fg-primary">{title}</h2>
              {!event && (
                <button
                  type="button"
                  onClick={() => setPresetsOpen(true)}
                  className="inline-flex min-h-11 items-center gap-1 rounded-lg bg-green-50 dark:bg-green-900/30 px-3 text-xs font-semibold text-fg-accent active:scale-95"
                >
                  <Sparkles className="h-3.5 w-3.5" /> Chọn mẫu
                </button>
              )}
            </div>

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
                chọn ở đây chỉ thể hiện bằng MÀU (bg-green-700 vs viền), nên thiếu nó thì
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
                className={`min-h-11 flex-1 rounded-lg text-sm font-medium active:scale-95 ${
                  kind === 'expense'
                    ? 'bg-green-700 text-white'
                    : 'border border-border-strong text-fg-secondary'
                }`}
              >
                Chi
              </button>
              <button
                type="button"
                aria-pressed={kind === 'income'}
                onClick={() => setKind('income')}
                className={`min-h-11 flex-1 rounded-lg text-sm font-medium active:scale-95 ${
                  kind === 'income'
                    ? 'bg-green-700 text-white'
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

            <label className="mb-3 flex min-h-11 items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input type="checkbox" checked={inflate} onChange={(e) => setInflate(e.target.checked)} className="h-4 w-4" />
              Tăng theo lạm phát (giá hôm nay cho việc xảy ra ở tương lai)
            </label>

            <label htmlFor={`${uid}-note`} className={label_}>
              Ghi chú <span className="text-fg-muted">(không bắt buộc)</span>
            </label>
            <input id={`${uid}-note`} value={note} onChange={(e) => setNote(e.target.value)} className={`mb-4 ${field}`} />

            <div className="flex items-center justify-between gap-2">
              {event ? (
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
          </>
        )}
      </div>
    </div>
  )
}
