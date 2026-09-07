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
import { useEffect, useId, useRef, useState } from 'react'
import { Guide } from '../../components/Guide'
import { MoneyField } from '../../components/MoneyField'
import { CURRENCIES, formatMoney, type CurrencyCode } from '../../lib/money'
import type { DraftEvent } from './draft'
import { Money, Num, SectionTitle, Select, actionButtonClass } from '../../components/ui'
import {
  MAX_REPEAT_YEARS,
  eventSpanNote,
  type AmountShape,
  type EventShape,
} from './eventAmount'
import { EVENT_ICONS, EVENT_ICON_GROUPS, EventIcon } from './eventIcons'
import { MAX_LOAN_YEARS, homeCashOutInYear, type HomeAsset } from './homeAsset'
import { useTraSo } from '../../hooks/queries'
import { dungCauHoi } from './traSo'
import { docKetQua, type KetQuaTra, type LoiTra } from './traSoKetQua'
import { TraSoSheet } from './TraSoSheet'
import { TAG_COLOR_KEYS, TAG_COLOR_LABELS, TAG_HEX, tagColor } from '../tags/colors'

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
  /**
   * Chi THẬT theo danh mục, đã quy năm hoá, theo `currency` — để ô "thay cho khoản
   * nào" điền sẵn một con số CÓ THẬT thay vì bắt người dùng đoán.
   *
   * Rỗng/không truyền thì ô đó vẫn dùng được, chỉ là phải tự gõ số.
   */
  chiTheoDanhMuc?: { name: string; annualMinor: number }[]
  /**
   * Chặng phủ năm bắt đầu của mốc — nguồn NƯỚC và TIỀN cho nút "Tra hộ". `null` thì ẩn
   * nút đó (không biết hỏi giá ở nước nào, bằng đồng nào).
   *
   * "Tra hộ" trước đây nằm ở `EventEditorPopover` — form nhỏ cạnh đồ thị. Popover đã bỏ
   * (08/09/2026: nó trùng khít với hàng mốc trong bàn sửa, và từ khi bàn sửa nằm CẠNH đồ
   * thị thì lý do tồn tại của nó — "sửa mà không mất hình" — cũng hết). Nút theo về đây,
   * chỗ duy nhất còn sửa được mọi thứ của một mốc.
   */
  chang?: { nuoc: string | null; tien: CurrencyCode } | null
  /** Ghi các trường đã sửa vào bản nháp. */
  onApply: (patch: Partial<Omit<DraftEvent, 'id'>>) => void
  /** Bỏ mốc này khỏi bản nháp. */
  onRemove: () => void
  onClose: () => void
}

/** Sheet sửa một MỐC CUỘC ĐỜI — ghi vào bản nháp của bàn sửa kịch bản. */
export function EventFormSheet({
  event,
  currency,
  chiTheoDanhMuc = [],
  chang = null,
  onApply,
  onRemove,
  onClose,
}: Props) {
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
  const [color, setColor] = useState(event.color)
  const [replaces, setReplaces] = useState(event.replacesMinor)
  const [replacesLabel, setReplacesLabel] = useState(event.replacesLabel)
  // Mua tài sản (migration 0068). `assetValue === 0` = mốc thường.
  const [assetValue, setAssetValue] = useState(event.assetValueMinor)
  const [assetChangePct, setAssetChangePct] = useState(String(event.assetChangeBps / 100))
  const [loan, setLoan] = useState(event.loanMinor)
  const [loanRatePct, setLoanRatePct] = useState(String(event.loanRateBps / 100))
  const [loanYears, setLoanYears] = useState(
    event.loanYears === 0 ? '' : String(event.loanYears),
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

  const muaTaiSan = assetValue > 0
  const assetChangeNum = Number(assetChangePct)
  const assetChangeValid =
    assetChangePct.trim() !== '' &&
    Number.isFinite(assetChangeNum) &&
    assetChangeNum > -100 &&
    assetChangeNum < 100
  const loanRateNum = Number(loanRatePct)
  const loanRateValid =
    loanRatePct.trim() !== '' && Number.isFinite(loanRateNum) && loanRateNum >= 0 && loanRateNum <= 100
  const loanYearsNum = Number(loanYears)
  const loanYearsValid =
    loanYears.trim() === '' ||
    (Number.isInteger(loanYearsNum) && loanYearsNum >= 1 && loanYearsNum <= MAX_LOAN_YEARS)
  // DB có `check (loan_minor <= asset_value_minor)` — bắt trước ở đây để hiện câu lỗi
  // tử tế thay vì để lần Lưu nổ một lỗi Postgres thô, xa chỗ gõ sai.
  const loanValid = loan >= 0 && loan <= assetValue
  const dangVay = muaTaiSan && loanYears.trim() !== '' && loan > 0

  /** Phần tài sản đã chuẩn hoá — đúng thứ sẽ ghi, và đúng thứ ô xem trước đọc. */
  const taiSan: HomeAsset = {
    startYear: yearValid ? yearNum : event.startYear,
    assetValueMinor: muaTaiSan ? assetValue : 0,
    assetChangeBps: assetChangeValid ? Math.round(assetChangeNum * 100) : 0,
    loanMinor: dangVay ? loan : 0,
    loanRateBps: loanRateValid ? Math.round(loanRateNum * 100) : 0,
    loanYears: dangVay ? loanYearsNum : 0,
  }
  const tienMua = homeCashOutInYear(taiSan, taiSan.startYear)

  const canSave =
    labelValid &&
    yearValid &&
    endYearValid &&
    amountValid &&
    (amountShape !== 'growth' || growthValid) &&
    (amountShape !== 'ramp' || endAmountValid) &&
    repeatValid &&
    (!muaTaiSan || (assetChangeValid && loanValid && loanYearsValid && loanRateValid))

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

  // --- "Tra hộ" (dời từ EventEditorPopover) -------------------------------------------
  const [moTraSo, setMoTraSo] = useState(false)
  const [ketQua, setKetQua] = useState<KetQuaTra | LoiTra | null>(null)
  /** true = sheet đang mở nhưng CHƯA gửi gì đi. Xem `batDauTra`. */
  const [choXacNhan, setChoXacNhan] = useState(false)
  const traSo = useTraSo()
  /**
   * Thẻ lượt: đóng sheet giữa chừng rồi bấm "Tra hộ" lại là một đường có thật (Esc/bấm
   * ra ngoài KHÔNG huỷ request đang bay). Không có thẻ này, lượt cũ về muộn hơn sẽ đè
   * kết quả của lượt mới — người dùng bấm "Lấy" một con số không thuộc câu mình vừa hỏi.
   */
  const luotRef = useRef(0)

  const cauHoi =
    chang === null
      ? null
      : dungCauHoi({
          nhan: label,
          kind,
          namBatDau: yearValid ? yearNum : event.startYear,
          namKetThuc: forever ? null : endYearValid ? endYearNum : null,
          nuoc: chang.nuoc,
          tien: chang.tien,
        })

  /**
   * Bấm "Tra hộ".
   *
   * Mốc TỰ ĐẶT TÊN dừng ở màn xác nhận, chưa gửi gì: nhãn mốc là chữ người dùng gõ, và
   * bản thiết kế đòi cảnh báo "trước khi gửi — người dùng bấm tiếp hay thôi". Mốc có sẵn
   * dựng câu hỏi TỪ LUẬT (không mang chữ người dùng) nên gửi thẳng, không hỏi lại.
   */
  function batDauTra() {
    if (cauHoi === null || chang === null) return
    setKetQua(null)
    setMoTraSo(true)
    if (!cauHoi.laMocCoSan) {
      setChoXacNhan(true)
      return
    }
    setChoXacNhan(false)
    guiTraSo()
  }

  function guiTraSo() {
    if (cauHoi === null || chang === null) return
    setChoXacNhan(false)
    const luot = ++luotRef.current
    // Truyền cả `tien`: bản demo dội lại đúng đồng đó, nếu không `docKetQua` sẽ từ chối
    // với 'sai-tien' ở mọi chặng không phải JPY. Xem JSDoc `Repo.traSo`.
    traSo.mutate(
      { van: cauHoi.van, tien: chang.tien },
      {
        onSuccess: (tho) => {
          if (luot !== luotRef.current) return
          setKetQua(docKetQua(tho, chang.tien))
        },
        // Mất mạng / function lỗi / hết hạn mức đều dừng ở đây — dùng 'khong-goi-duoc',
        // KHÔNG dùng 'doc-khong-ra' (đó là mã cho kết quả đọc không ra, nói sai chỗ hỏng).
        onError: (e) => {
          if (luot !== luotRef.current) return
          setKetQua({ loi: 'khong-goi-duoc', noiDung: e instanceof Error ? e.message : String(e) })
        },
      },
    )
  }

  /** Nhãn của ô số tiền, theo hình đang chọn — xem chú thích tại chỗ dùng. */
  const amountLabel = muaTaiSan
    ? 'Chi phí GIỮ mỗi năm (thuế, bảo hiểm, bảo trì)'
    : xemTruoc.amountShape === 'total'
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
      color,
      // Bỏ nhãn khi số về 0: một nhãn "thay cho Nhà ở" còn treo lại trong khi không
      // thay gì cả là câu giải thích nói dối.
      replacesMinor: replaces,
      replacesLabel: replaces > 0 ? replacesLabel.trim() : '',
      assetValueMinor: taiSan.assetValueMinor,
      assetChangeBps: taiSan.assetChangeBps,
      loanMinor: taiSan.loanMinor,
      loanRateBps: taiSan.loanRateBps,
      loanYears: taiSan.loanYears,
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
    <>
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

        {/* Màu. Icon nói mốc này là VIỆC GÌ; màu nhóm các mốc LIÊN QUAN với nhau —
            mọi thứ về con một màu, mọi thứ về nhà một màu. Dùng chung bảng khoá màu
            của nhãn, không dựng bảng thứ hai.

            Nút chấm tròn nên PHẢI có `aria-label`: màu là thứ duy nhất phân biệt
            chúng, mà đó đúng là thứ người dùng screen reader không nhận được. */}
        <span id={`${uid}-color`} className={label_}>
          Màu <span className="font-normal text-fg-muted">(không chọn = tô theo Thu/Chi)</span>
        </span>
        <div
          role="group"
          aria-labelledby={`${uid}-color`}
          className="mb-3 flex flex-wrap items-center gap-1.5"
        >
          <button
            type="button"
            aria-label="Không màu riêng"
            aria-pressed={color === ''}
            onClick={() => setColor('')}
            className={`min-h-11 rounded-md px-3 text-sm transition active:scale-95 ${
              color === ''
                ? 'bg-accent text-fg-on-accent'
                : 'border border-border-strong text-fg-secondary'
            }`}
          >
            Theo Thu/Chi
          </button>
          {TAG_COLOR_KEYS.map((k) => (
            <button
              key={k}
              type="button"
              aria-label={`Màu ${TAG_COLOR_LABELS[k]}`}
              aria-pressed={color === k}
              onClick={() => setColor(k)}
              className={`flex h-11 w-11 items-center justify-center rounded-md transition active:scale-95 ${
                color === k ? 'ring-2 ring-accent' : ''
              }`}
            >
              <span
                aria-hidden
                className="h-5 w-5 rounded-full border border-border-strong"
                style={{ backgroundColor: TAG_HEX[tagColor(k)] }}
              />
            </button>
          ))}
        </div>

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
        {cauHoi !== null && (
          <div className="mb-1 flex justify-end">
            <button
              type="button"
              onClick={batDauTra}
              className="min-h-11 rounded-md border border-border-strong px-3 text-sm font-medium text-fg-secondary transition active:scale-95 hover:bg-surface-sunken"
            >
              Tra hộ
            </button>
          </div>
        )}
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

        {/* MUA TÀI SẢN (migration 0068). Trước bản này, "Mua nhà" là một mốc CHI thuần
            tuý: tài sản ròng tụt bằng khoản trả trước rồi KHÔNG BAO GIỜ nhận lại căn
            nhà — nên trên đồ thị mua nhà luôn trông tệ hơn thực tế. */}
        <span id={`${uid}-ts`} className={label_}>
          Khoản này có mua một tài sản không?
        </span>
        <div role="group" aria-labelledby={`${uid}-ts`} className="mb-2 flex gap-2">
          <button
            type="button"
            aria-pressed={!muaTaiSan}
            onClick={() => setAssetValue(0)}
            className={`min-h-11 flex-1 rounded-md text-sm font-medium transition active:scale-95 ${
              !muaTaiSan
                ? 'bg-accent text-fg-on-accent'
                : 'border border-border-strong text-fg-secondary'
            }`}
          >
            Không
          </button>
          <button
            type="button"
            aria-pressed={muaTaiSan}
            onClick={() => setAssetValue(assetValue > 0 ? assetValue : 40_000_000)}
            className={`min-h-11 flex-1 rounded-md text-sm font-medium transition active:scale-95 ${
              muaTaiSan
                ? 'bg-accent text-fg-on-accent'
                : 'border border-border-strong text-fg-secondary'
            }`}
          >
            Có — nhà, xe, đất
          </button>
        </div>

        {muaTaiSan && (
          <div className="mb-3 rounded-md border border-border-panel p-2.5">
            <span className={label_}>
              Giá trị tài sản{' '}
              <span className="font-normal text-fg-muted">
                (tính bằng {CURRENCIES[currency].label})
              </span>
            </span>
            <div className="mb-2">
              <MoneyField
                value={assetValue}
                onChange={setAssetValue}
                currency={currency}
                autoOpen={false}
                ariaLabel="Giá trị tài sản"
                className={`text-right font-semibold ${field}`}
              />
            </div>

            <label htmlFor={`${uid}-tsdoi`} className={label_}>
              Mỗi năm giá trị đổi{' '}
              <span className="font-normal text-fg-muted">(%/năm; nhà ~+1, xe ~−15)</span>
            </label>
            <input
              id={`${uid}-tsdoi`}
              inputMode="decimal"
              value={assetChangePct}
              onChange={(e) => setAssetChangePct(e.target.value)}
              className={`mb-2 ${field}`}
            />
            {!assetChangeValid && (
              <p role="alert" className="mb-2 text-sm text-money-out">
                Phải là số trong khoảng −100 đến 100.
              </p>
            )}

            <span id={`${uid}-vay`} className={label_}>
              Trả thế nào
            </span>
            <div role="group" aria-labelledby={`${uid}-vay`} className="mb-2 flex gap-2">
              <button
                type="button"
                aria-pressed={!dangVay}
                onClick={() => {
                  setLoan(0)
                  setLoanYears('')
                }}
                className={`min-h-11 flex-1 rounded-md text-sm font-medium transition active:scale-95 ${
                  !dangVay
                    ? 'bg-accent text-fg-on-accent'
                    : 'border border-border-strong text-fg-secondary'
                }`}
              >
                Trả thẳng
              </button>
              <button
                type="button"
                aria-pressed={dangVay}
                onClick={() => {
                  // Mặc định 80% giá và 35 năm: đúng cách vay mua nhà phổ biến ở Nhật,
                  // và 20% trả trước là mức tránh được bảo hiểm khoản vay ở nhiều nước.
                  if (loan <= 0) setLoan(Math.round(assetValue * 0.8))
                  if (loanYears.trim() === '') setLoanYears('35')
                }}
                className={`min-h-11 flex-1 rounded-md text-sm font-medium transition active:scale-95 ${
                  dangVay
                    ? 'bg-accent text-fg-on-accent'
                    : 'border border-border-strong text-fg-secondary'
                }`}
              >
                Vay
              </button>
            </div>

            {dangVay && (
              <>
                <span className={label_}>Phần đi vay</span>
                <div className="mb-1">
                  <MoneyField
                    value={loan}
                    onChange={setLoan}
                    currency={currency}
                    autoOpen={false}
                    ariaLabel="Phần đi vay"
                    className={`text-right font-semibold ${field}`}
                  />
                </div>
                {!loanValid && (
                  <p role="alert" className="mb-2 text-sm text-money-out">
                    Phần vay không được lớn hơn giá trị tài sản.
                  </p>
                )}
                <div className="mb-2 flex gap-2">
                  <div className="flex-1">
                    <label htmlFor={`${uid}-lai`} className={label_}>
                      Lãi suất <span className="font-normal text-fg-muted">(%/năm)</span>
                    </label>
                    <input
                      id={`${uid}-lai`}
                      inputMode="decimal"
                      value={loanRatePct}
                      onChange={(e) => setLoanRatePct(e.target.value)}
                      className={field}
                    />
                  </div>
                  <div className="flex-1">
                    <label htmlFor={`${uid}-kyhan`} className={label_}>
                      Kỳ hạn <span className="font-normal text-fg-muted">(năm)</span>
                    </label>
                    <input
                      id={`${uid}-kyhan`}
                      inputMode="decimal"
                      value={loanYears}
                      onChange={(e) => setLoanYears(e.target.value)}
                      className={field}
                    />
                  </div>
                </div>
                {(!loanRateValid || !loanYearsValid) && (
                  <p role="alert" className="mb-2 text-sm text-money-out">
                    Lãi suất 0–100%/năm; kỳ hạn là số nguyên 1–{MAX_LOAN_YEARS} năm.
                  </p>
                )}
              </>
            )}

            {/* Ba con số này là toàn bộ điều người dùng muốn biết trước khi bấm Xong,
                và chúng do đúng `homeAsset.ts` mà engine dùng tính ra. */}
            <p className="rounded-md bg-surface-sunken px-2.5 py-1.5 text-2xs text-fg-secondary">
              Năm {taiSan.startYear}: bỏ ra{' '}
              <Money amount={tienMua.downMinor} currency={currency} className="font-semibold" />
              {tienMua.loanMinor > 0 ? (
                <>
                  {' '}và trả nợ{' '}
                  <Money
                    amount={tienMua.loanMinor}
                    currency={currency}
                    className="font-semibold"
                  />
                  /năm trong <Num tone="muted">{taiSan.loanYears}</Num> năm.
                </>
              ) : (
                '. Không vay.'
              )}{' '}
              Tài sản vào bản chiếu như một dòng riêng, không phải tiền tiêu được.
            </p>
          </div>
        )}

        {/* CHỐNG ĐẾM HAI LẦN (migration 0067). Chi nền của chặng lấy từ CHI THẬT, nên
            nó đã chứa tiền thuê nhà, tiền học, mọi thứ đang tiêu. Một mốc "Mua nhà"
            cộng khoản trả nợ LÊN TRÊN tiền thuê vẫn còn nguyên trong chi nền — phần
            nhà ở bị tính hai lần và không có gì nói ra. Ô này là chỗ nói ra. */}
        <span className={label_}>
          Khoản này THAY cho khoản đang tiêu nào?{' '}
          <span className="font-normal text-fg-muted">(để 0 nếu là khoản hoàn toàn mới)</span>
        </span>
        {chiTheoDanhMuc.length > 0 && (
          <Select
            aria-label="Chọn danh mục để lấy số thật"
            wrapClassName="mb-1.5 w-full"
            value=""
            onChange={(e) => {
              const c = chiTheoDanhMuc.find((x) => x.name === e.target.value)
              if (!c) return
              setReplaces(c.annualMinor)
              setReplacesLabel(c.name)
            }}
          >
            <option value="">Lấy số thật từ một danh mục…</option>
            {chiTheoDanhMuc.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name} — {formatMoney(c.annualMinor, currency)}/năm
              </option>
            ))}
          </Select>
        )}
        <div className="mb-1.5">
          <MoneyField
            value={replaces}
            onChange={setReplaces}
            currency={currency}
            autoOpen={false}
            ariaLabel="Số mỗi năm thôi không tiêu nữa"
            className={`text-right font-semibold ${field}`}
          />
        </div>
        {replaces > 0 && (
          <>
            <input
              value={replacesLabel}
              onChange={(e) => setReplacesLabel(e.target.value)}
              placeholder="Tên khoản bị thay — ví dụ: Nhà ở"
              aria-label="Tên khoản bị thay"
              className={`mb-1 ${field}`}
            />
            <Guide className="mb-3 text-2xs text-fg-muted">
              Từ năm {yearValid ? yearNum : '…'}
              {forever ? ' trở đi' : ` tới ${endYearValid ? endYearNum : '…'}`}, chi nền
              của chặng bớt đi đúng số này — nên bản chiếu không cộng chồng hai khoản
              cho cùng một việc.
            </Guide>
          </>
        )}
        {replaces === 0 && <div className="mb-2" />}

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

    {/* Sheet "Tra hộ" nằm NGOÀI sheet mốc, cùng cấp: hai lớp phủ lồng nhau thì Esc đóng
        nhầm lớp và nền mờ tô hai lần. Cùng luật với bảng theo năm ở LifetimeView. */}
    {moTraSo && chang !== null && cauHoi !== null && (
      <TraSoSheet
        dangChay={traSo.isPending}
        ketQua={ketQua}
        tien={chang.tien}
        choXacNhan={choXacNhan}
        canhBaoRiengTu={!cauHoi.laMocCoSan}
        onXacNhan={guiTraSo}
        onDong={() => {
          setMoTraSo(false)
          setChoXacNhan(false)
        }}
        onChon={(minor, ghiChu) => {
          setAmount(minor)
          // NỐI THÊM, không thay: ghi đè ở đây là xoá sạch ghi chú người dùng tự viết.
          setNote((cu) => (cu.trim() === '' ? ghiChu : `${cu}

${ghiChu}`))
          setMoTraSo(false)
        }}
      />
    )}
    </>
  )
}
