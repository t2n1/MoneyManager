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
import { Money, Num, SectionTitle, Select, actionButtonClass } from '../../components/ui'
import {
  MAX_REPEAT_YEARS,
  eventSpanNote,
  type AmountShape,
  type EventShape,
} from './eventAmount'
import { EVENT_ICONS, EVENT_ICON_GROUPS, EventIcon } from './eventIcons'

/** Khớp `check (start_year between 1900 and 2200)` và `check (end_year between 1900
 *  and 2200)` của `life_events` (migration 0031). */
const MIN_YEAR = 1900
const MAX_YEAR = 2200

/**
 * Bốn hình dạng, mỗi cái một câu nói ra NGHĨA của con số. Thứ tự cố ý: 'per_year' đứng
 * đầu vì nó là mặc định và là thứ mọi mốc đang có đều đang dùng.
 */
const SHAPE_LABELS: Record<AmountShape, string> = {
  per_year: 'Số này MỖI NĂM',
  total: 'Số này là TỔNG cả khoảng',
  ramp: 'Đổi dần tới một số khác',
  growth: 'Nhân dồn mỗi năm một tỷ lệ',
}

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
  const [icon, setIcon] = useState(event.icon)
  const [moBoIcon, setMoBoIcon] = useState(false)
  const [amountShape, setAmountShape] = useState<AmountShape>(event.amountShape)
  const [endAmount, setEndAmount] = useState(event.endAmountMinor ?? 0)
  // Tỷ lệ nhập theo PHẦN TRĂM (người dùng gõ "3", không gõ "300"), lưu theo bps.
  const [growthPct, setGrowthPct] = useState(String(event.growthBps / 100))
  const [repeat, setRepeat] = useState(
    event.repeatEveryYears === null ? '' : String(event.repeatEveryYears),
  )

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

  const growthNum = Number(growthPct)
  const growthValid =
    growthPct.trim() !== '' && Number.isFinite(growthNum) && growthNum > -100 && growthNum < 1000
  const repeatNum = Number(repeat)
  const repeatValid =
    repeat.trim() === '' ||
    (Number.isInteger(repeatNum) && repeatNum >= 1 && repeatNum <= MAX_REPEAT_YEARS)
  const endAmountValid = endAmount >= 0

  const canSave =
    labelValid &&
    yearValid &&
    endYearValid &&
    amountValid &&
    (amountShape !== 'growth' || growthValid) &&
    (amountShape !== 'ramp' || endAmountValid) &&
    repeatValid

  // Chỉ 'per_year' còn nghĩa khi mốc chạy tới hết đời: không chia được một tổng cho vô
  // hạn năm, và không có "năm cuối" để đi dần tới. 'growth' thì vẫn được — nhân dồn mãi
  // là một giả định hợp lý (lương hưu tăng theo giá).
  const shapeKhaDung: AmountShape[] = forever
    ? ['per_year', 'growth']
    : ['per_year', 'total', 'ramp', 'growth']

  /** Bản xem trước — cùng hàm mà bàn sửa và đồ thị dùng, nên không lệch nhau được. */
  const xemTruoc: EventShape = {
    startYear: yearValid ? yearNum : event.startYear,
    endYear: forever ? null : endYearValid ? endYearNum : null,
    amountMinor: amount,
    amountShape: shapeKhaDung.includes(amountShape) ? amountShape : 'per_year',
    endAmountMinor: amountShape === 'ramp' ? endAmount : null,
    growthBps: amountShape === 'growth' && growthValid ? Math.round(growthNum * 100) : 0,
    repeatEveryYears: repeatValid && repeat.trim() !== '' ? repeatNum : null,
  }
  const giaiThich = eventSpanNote(xemTruoc)

  /** Nhãn của ô số tiền, theo hình đang chọn — xem chú thích tại chỗ dùng. */
  const amountLabel =
    xemTruoc.amountShape === 'total'
      ? 'Tổng cả khoảng'
      : xemTruoc.amountShape === 'ramp' || xemTruoc.amountShape === 'growth'
        ? `Số tiền của năm ${yearValid ? yearNum : 'đầu'}`
        : 'Số tiền mỗi năm'

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
      icon,
      // Đúng `xemTruoc` mà người dùng vừa đọc câu giải thích của nó — không dựng lại
      // phép chuẩn hoá lần thứ hai ở đây, vì hai bản sẽ trôi khỏi nhau.
      amountShape: xemTruoc.amountShape,
      endAmountMinor: xemTruoc.endAmountMinor,
      growthBps: xemTruoc.growthBps,
      repeatEveryYears: xemTruoc.repeatEveryYears,
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
        className="max-h-[92vh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-2xl bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:rounded-2xl animate-sheet-in lg:animate-sheet-pop"
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

        {/* Icon. Nút đóng/mở chứ không bung sẵn cả 34 ô: sheet này cao 92vh và bốn ô
            hình dạng bên dưới quan trọng hơn — bung sẵn thì trên điện thoại phải cuộn
            qua một tấm lưới icon mới tới được số tiền. */}
        <span className={label_}>Icon</span>
        <div className="mb-3 flex items-center gap-2">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-border-strong text-fg-secondary">
            <EventIcon icon={icon} kind={kind} className="h-5 w-5" />
          </span>
          <button
            type="button"
            aria-expanded={moBoIcon}
            onClick={() => setMoBoIcon((v) => !v)}
            className="min-h-11 rounded-md px-3 py-2 text-sm text-fg-secondary transition active:scale-95 hover:bg-surface-sunken"
          >
            {icon === '' ? 'Chọn icon' : EVENT_ICONS[icon]?.label ?? 'Chọn icon'}
          </button>
          {icon !== '' && (
            <button
              type="button"
              onClick={() => setIcon('')}
              className="min-h-11 rounded-md px-3 py-2 text-sm text-fg-muted transition active:scale-95 hover:bg-surface-sunken"
            >
              Bỏ icon
            </button>
          )}
        </div>
        {moBoIcon && (
          <div className="mb-3 max-h-60 overflow-y-auto overscroll-contain rounded-md border border-border-panel p-2">
            {EVENT_ICON_GROUPS.map((g) => (
              <div key={g.title} className="mb-2 last:mb-0">
                <p className="mb-1 text-2xs uppercase tracking-label text-fg-muted">
                  {g.title}
                </p>
                <div className="flex flex-wrap gap-1">
                  {g.keys.map((k) => (
                    <button
                      key={k}
                      type="button"
                      title={EVENT_ICONS[k].label}
                      aria-label={EVENT_ICONS[k].label}
                      aria-pressed={icon === k}
                      onClick={() => {
                        setIcon(k)
                        setMoBoIcon(false)
                      }}
                      className={`inline-flex h-11 w-11 items-center justify-center rounded-md transition active:scale-95 ${
                        icon === k
                          ? 'bg-accent text-fg-on-accent'
                          : 'border border-border-strong text-fg-secondary hover:bg-surface-sunken'
                      }`}
                    >
                      <EventIcon icon={k} kind={kind} className="h-5 w-5" />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

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

        {/* Nhãn phải ĐỔI THEO HÌNH: để cứng "Số tiền mỗi năm" thì với hình 'total' ô
            này tự cãi ô ngay dưới nó ("Số này là TỔNG cả khoảng") — cùng lớp lỗi với
            "Chi tiêu ¥0 · 6 danh mục" đã phải sửa ở Báo cáo (07/09/2026).

            <span> chứ không <label htmlFor> — lý do đầy đủ ở PhaseFormSheet. */}
        <span className={label_}>
          {amountLabel}{' '}
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
            ariaLabel={amountLabel}
            className={`text-right font-semibold ${field}`}
          />
        </div>
        {!amountValid && (
          <p role="alert" className="mb-2 text-sm text-money-out">
            Số tiền không được âm.
          </p>
        )}
        {amountValid && <div className="mb-2" />}

        {/* Con số ở trên KHÔNG tự nói được nó là gì (migration 0066). Ô này nói. */}
        <label htmlFor={`${uid}-shape`} className={label_}>
          Con số đó nghĩa là gì
        </label>
        <Select
          id={`${uid}-shape`}
          wrapClassName="mb-2 w-full"
          value={xemTruoc.amountShape}
          onChange={(e) => setAmountShape(e.target.value as AmountShape)}
        >
          {shapeKhaDung.map((s) => (
            <option key={s} value={s}>
              {SHAPE_LABELS[s]}
            </option>
          ))}
        </Select>
        {/* <Guide> chứ không <p>: đây là chữ để DẠY (giải thích vì sao ô trên ít lựa
            chọn hơn), đúng loại mà tests/designSystem.test.ts đòi bọc cổng. */}
        {forever && (
          <Guide className="mb-2 text-2xs text-fg-muted">
            Mốc chạy tới hết đời nên chỉ còn hai lựa chọn: không chia được một tổng cho vô
            hạn năm, và không có năm cuối để đi dần tới.
          </Guide>
        )}

        {amountShape === 'ramp' && !forever && (
          <>
            <span className={label_}>
              Số của năm {endYearValid ? endYearNum : 'cuối'}{' '}
              <span className="font-normal text-fg-muted">
                (tính bằng {CURRENCIES[currency].label})
              </span>
            </span>
            <div className="mb-1">
              <MoneyField
                value={endAmount}
                onChange={setEndAmount}
                currency={currency}
                autoOpen={false}
                ariaLabel="Số tiền của năm cuối"
                className={`text-right font-semibold ${field}`}
              />
            </div>
            {!endAmountValid && (
              <p role="alert" className="mb-2 text-sm text-money-out">
                Số tiền không được âm.
              </p>
            )}
            {endAmountValid && <div className="mb-2" />}
          </>
        )}

        {amountShape === 'growth' && (
          <>
            <label htmlFor={`${uid}-growth`} className={label_}>
              Mỗi năm nhân thêm{' '}
              <span className="font-normal text-fg-muted">
                (%/năm; số âm = teo dần. Cộng RIÊNG, không thay lạm phát)
              </span>
            </label>
            <input
              id={`${uid}-growth`}
              inputMode="decimal"
              value={growthPct}
              onChange={(e) => setGrowthPct(e.target.value)}
              className={`mb-1 ${field}`}
            />
            {!growthValid && (
              <p role="alert" className="mb-2 text-sm text-money-out">
                Tỷ lệ phải là số trong khoảng −100 đến 1000.
              </p>
            )}
            {growthValid && <div className="mb-2" />}
          </>
        )}

        <label htmlFor={`${uid}-repeat`} className={label_}>
          Lặp mỗi bao nhiêu năm{' '}
          <span className="font-normal text-fg-muted">(để trống = mọi năm trong khoảng)</span>
        </label>
        <input
          id={`${uid}-repeat`}
          inputMode="decimal"
          value={repeat}
          onChange={(e) => setRepeat(e.target.value)}
          placeholder="Ví dụ: 8 — đổi xe mỗi 8 năm"
          className={`mb-1 ${field}`}
        />
        {!repeatValid && (
          <p role="alert" className="mb-2 text-sm text-money-out">
            Phải là số nguyên từ 1 đến {MAX_REPEAT_YEARS}, hoặc để trống.
          </p>
        )}
        {repeatValid && <div className="mb-2" />}

        {/* XEM TRƯỚC. Bốn hình dạng làm cùng một con số mang bốn nghĩa khác nhau, nên
            người dùng phải đọc được nghĩa đang chọn TRƯỚC khi bấm Xong — không thì
            phải lưu, xem đồ thị, rồi mở lại sheet để sửa. Dùng đúng hàm mà bàn sửa và
            đồ thị dùng (`eventSpanNote`), nên không có đường nào lệch. */}
        {giaiThich !== null && (
          <p className="mb-3 rounded-md bg-surface-sunken px-3 py-2 text-2xs text-fg-secondary">
            {giaiThich.years === null ? (
              giaiThich.shape === 'growth' && giaiThich.growthBps !== 0 ? (
                <>
                  Bắt đầu <Money amount={giaiThich.firstMinor} currency={currency} />, nhân dồn{' '}
                  <Num tone="muted">{giaiThich.growthBps / 100}</Num>%/năm tới hết đời.
                </>
              ) : (
                <>
                  <Money amount={giaiThich.firstMinor} currency={currency} /> mỗi năm, tới hết
                  đời.
                </>
              )
            ) : giaiThich.shape === 'total' ? (
              <>
                Tổng <Money amount={giaiThich.totalMinor ?? 0} currency={currency} /> chia đều{' '}
                <Num tone="muted">{giaiThich.hits ?? 0}</Num> lần →{' '}
                <Money amount={giaiThich.firstMinor} currency={currency} /> mỗi lần.
              </>
            ) : giaiThich.shape === 'ramp' ? (
              <>
                Đổi dần <Money amount={giaiThich.firstMinor} currency={currency} /> →{' '}
                <Money amount={giaiThich.lastMinor ?? 0} currency={currency} /> qua{' '}
                <Num tone="muted">{giaiThich.years}</Num> năm, tổng{' '}
                <Money amount={giaiThich.totalMinor ?? 0} currency={currency} />.
              </>
            ) : giaiThich.shape === 'growth' ? (
              <>
                Từ <Money amount={giaiThich.firstMinor} currency={currency} /> tới{' '}
                <Money amount={giaiThich.lastMinor ?? 0} currency={currency} />, tổng{' '}
                <Money amount={giaiThich.totalMinor ?? 0} currency={currency} />.
              </>
            ) : (
              <>
                <Money amount={giaiThich.firstMinor} currency={currency} /> ×{' '}
                <Num tone="muted">{giaiThich.hits ?? 0}</Num>{' '}
                {giaiThich.repeatEveryYears === null ? 'năm' : 'lần'} ={' '}
                <Money amount={giaiThich.totalMinor ?? 0} currency={currency} /> cả khoảng.
              </>
            )}
            {giaiThich.repeatEveryYears !== null && (
              <>
                {' '}Lặp mỗi <Num tone="muted">{giaiThich.repeatEveryYears}</Num> năm.
              </>
            )}
          </p>
        )}

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
