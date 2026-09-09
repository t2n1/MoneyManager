// Bảng sửa một MỐC CUỘC ĐỜI — ruột của `PlanDock` khi đang chọn một mốc (spec §10,
// dsg-handoff README mục "Panel mốc").
//
// Thứ tự của bản vẽ: hàng "Loại mốc" → hàng nhận dạng → lưới trường → câu tổng → Nâng
// cao (gập) → chân (Nhân đôi · + Chặng đời mới từ đây · Xoá mốc).
//
// HÀNG "LOẠI MỐC" LÀ BỘ MẪU, KHÔNG PHẢI MỘT CỘT `type` (spec §6, quyết định đã chốt).
// Bản vẽ mô hình mốc bằng 8 loại đóng, mỗi loại một bộ tham số riêng, và `type` của nó
// load-bearing mãi mãi vì phép tính đọc nó. App thì có MỘT hình chung với các núm ghép
// lại — `amount_shape` (0066), `replaces_*` (0067), `asset_*`/`loan_*` (0068), `enabled`
// (0063). Chuyển sang mô hình bản vẽ là bỏ ba migration và bỏ luôn phần chống đếm hai
// lần mà bản vẽ KHÔNG CÓ (mốc "Mua nhà" của nó đếm hai lần tiền thuê nhà). Nên các chip
// ở hàng đầu chỉ THÊM một mốc từ mẫu (`presets.ts`), rồi mốc đó là bản ghi thường.
//
// HỆ QUẢ NHÌN THẤY ĐƯỢC, đã được đồng ý: lưới trường bên dưới KHÔNG khớp pixel theo từng
// loại như bản vẽ, vì tên và số ô khác.
//
// GHI THẲNG VÀO BẢN NHÁP, KHÔNG CÓ NÚT "XONG" — lý do đầy đủ ở đầu `PlanDockPhase.tsx`.
// Cùng hệ quả: mọi giá trị bị CHẶN thành hợp lệ thay vì bị từ chối, vì không có nút nào
// để tắt.
//
// "TRA HỘ" mở `TraSoSheet` NGOÀI panel, cùng cấp: hai lớp phủ lồng nhau thì Esc đóng
// nhầm lớp và nền mờ tô hai lần. Ba thứ tinh tế của bản cũ giữ nguyên, mỗi thứ một lý do
// (commit cc31eb1):
//   · thẻ lượt (`luotRef`) — đóng sheet giữa chừng rồi bấm lại là đường có thật; không
//     có thẻ này thì lượt cũ về muộn hơn đè kết quả của lượt mới;
//   · mốc TỰ ĐẶT TÊN dừng ở màn xác nhận trước khi gửi (nhãn mốc là chữ người dùng gõ);
//   · ghi chú NỐI THÊM, không ghi đè — ghi đè là xoá sạch ghi chú người dùng tự viết.
import { useId, useRef, useState } from 'react'
import { ChevronDown, Copy, Layers, Trash2 } from 'lucide-react'
import { Guide } from '../../components/Guide'
import { MoneyField } from '../../components/MoneyField'
import { ActionButton, Collapse, FilterChip, Money, Num, Select } from '../../components/ui'
import { CURRENCIES, formatMoney, type CurrencyCode } from '../../lib/money'
import { useTraSo } from '../../hooks/queries'
import type { DraftEvent } from './draft'
import {
  MAX_REPEAT_YEARS,
  eventSpanNote,
  type AmountShape,
  type EventShape,
} from './eventAmount'
import { EventIcon } from './eventIcons'
import { MAX_LOAN_YEARS, homeCashOutInYear, type HomeAsset } from './homeAsset'
import {
  DOCK_INPUT,
  DOCK_LABEL,
  DockPanel,
  EndYearBox,
  IdentityRow,
  NumBox,
  SegButton,
  YearBox,
} from './PlanDockParts'
import type { LifePreset } from './presets'
import { LIFE_PRESETS } from './presets'
import { dungCauHoi } from './traSo'
import { docKetQua, type KetQuaTra, type LoiTra } from './traSoKetQua'
import { TraSoSheet } from './TraSoSheet'

/** Khớp `check (start_year between 1900 and 2200)` của `life_events` (migration 0031). */
const MIN_YEAR = 1900
const MAX_YEAR = 2200

/** Bốn hình dạng, mỗi cái một câu nói ra NGHĨA của con số (migration 0066). Thứ tự cố ý:
 *  'per_year' đứng đầu vì nó là mặc định và là thứ mọi mốc đang có đều đang dùng. */
const SHAPE_LABELS: Record<AmountShape, string> = {
  per_year: 'Số này MỖI NĂM',
  total: 'Số này là TỔNG cả khoảng',
  ramp: 'Đổi dần tới một số khác',
  growth: 'Nhân dồn mỗi năm một tỷ lệ',
}

export interface PlanDockEventProps {
  /** Mốc đang sửa, lấy từ BẢN NHÁP. */
  event: DraftEvent
  /** Tiền của CHẶNG phủ năm bắt đầu — mốc tính bằng đơn vị này, không tự khai (v5, xem
   *  `fxModel.ts`). Muốn mốc tính bằng đồng khác thì đổi tiền của CHẶNG. */
  currency: CurrencyCode
  /** Tên chặng phủ năm bắt đầu — dòng tổng của bản vẽ có "Rơi vào chặng Z". */
  phaseLabel: string | null
  /**
   * Chặng phủ năm bắt đầu — nguồn NƯỚC và TIỀN cho nút "Tra hộ". `null` thì ẩn nút đó
   * (không biết hỏi giá ở nước nào, bằng đồng nào).
   */
  chang: { nuoc: string | null; tien: CurrencyCode } | null
  /**
   * Chi THẬT theo danh mục, đã quy năm hoá, theo `currency` — để ô "thay cho khoản nào"
   * (chống đếm hai lần, migration 0067) điền sẵn một con số CÓ THẬT thay vì bắt người
   * dùng đoán. Nguồn là `suggestBaseline` trên sổ 12 tháng qua.
   *
   * Rỗng/không truyền thì ô đó vẫn dùng được, chỉ là phải tự gõ số. Chỗ gọi có nghĩa vụ
   * chỉ truyền khi ĐƠN VỊ TIỀN khớp `currency` — `suggestBaseline` không quy đổi, nên một
   * danh sách tính bằng đồng khác sẽ gợi ý một con số sai đơn vị (xem TuongLaiPage).
   */
  chiTheoDanhMuc?: { name: string; annualMinor: number }[]
  /** Ghi các trường đã sửa vào bản nháp (`patchDraftEvent`). */
  onPatch: (patch: Partial<Omit<DraftEvent, 'id'>>) => void
  /** Thêm một mốc từ mẫu và nhắm con trỏ vào nó (hàng "Loại mốc"). */
  onAddPreset: (preset: LifePreset) => void
  onDuplicate: () => void
  /** "+ Chặng đời mới từ đây" — sinh một chặng bắt đầu đúng năm của mốc này. */
  onNewPhaseFromHere: () => void
  onRemove: () => void
}

/** Bảng sửa mốc cuộc đời trong dock. */
export function PlanDockEvent({
  event,
  currency,
  phaseLabel,
  chang,
  chiTheoDanhMuc = [],
  onPatch,
  onAddPreset,
  onDuplicate,
  onNewPhaseFromHere,
  onRemove,
}: PlanDockEventProps) {
  const uid = useId()
  const [advOpen, setAdvOpen] = useState(false)

  const forever = event.endYear === null
  /** Chỉ 'per_year' và 'growth' còn nghĩa khi mốc chạy tới hết đời: không chia được một
   *  tổng cho vô hạn năm, và không có "năm cuối" để đi dần tới. */
  const shapeKhaDung: AmountShape[] = forever
    ? ['per_year', 'growth']
    : ['per_year', 'total', 'ramp', 'growth']
  const shape = shapeKhaDung.includes(event.amountShape) ? event.amountShape : 'per_year'

  const muaTaiSan = event.assetValueMinor > 0
  /**
   * `loanMinor > 0` là điều kiện DUY NHẤT, cố ý KHÔNG kèm `loanYears > 0` như
   * `EventFormSheet` làm. Sheet đó đệm ô kỳ hạn trong state cục bộ, còn ở đây mỗi ký tự
   * ghi thẳng vào nháp: xoá ô "Kỳ hạn" để gõ lại "20" đi qua trạng thái rỗng → kỳ hạn 0
   * → cả khối vay biến mất ngay dưới con trỏ đang gõ. `homeAsset.loanOf` đã trả 0 khi
   * `loanYears <= 0`, nên bản chiếu vẫn đúng trong lúc ô còn trống.
   */
  const dangVay = muaTaiSan && event.loanMinor > 0

  /** Phần tài sản, đúng thứ engine đọc — nên ô xem trước không thể lệch khỏi bản chiếu. */
  const taiSan: HomeAsset = {
    startYear: event.startYear,
    assetValueMinor: event.assetValueMinor,
    assetChangeBps: event.assetChangeBps,
    loanMinor: dangVay ? event.loanMinor : 0,
    loanRateBps: event.loanRateBps,
    loanYears: dangVay ? event.loanYears : 0,
  }
  const tienMua = homeCashOutInYear(taiSan, taiSan.startYear)

  /** Bản xem trước — CÙNG hàm mà đồ thị và bảng theo năm dùng (`eventSpanNote`), nên hai
   *  bên không lệch nhau được. */
  const xemTruoc: EventShape = {
    startYear: event.startYear,
    endYear: event.endYear,
    amountMinor: event.amountMinor,
    amountShape: shape,
    endAmountMinor: shape === 'ramp' ? event.endAmountMinor : null,
    growthBps: shape === 'growth' ? event.growthBps : 0,
    repeatEveryYears: event.repeatEveryYears,
  }
  const giaiThich = eventSpanNote(xemTruoc)

  // --- "Tra hộ" (giữ nguyên ba thứ tinh tế của EventFormSheet) -------------------------
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
          nhan: event.label,
          kind: event.kind,
          namBatDau: event.startYear,
          namKetThuc: event.endYear,
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

  /** Nhãn của ô số tiền, theo hình đang chọn. Để cứng "Số tiền mỗi năm" thì với hình
   *  'total' ô này tự cãi ô ngay dưới nó ("Số này là TỔNG cả khoảng"). */
  const amountLabel = muaTaiSan
    ? `Chi phí GIỮ mỗi năm (${CURRENCIES[currency].symbol})`
    : shape === 'total'
      ? `Tổng cả khoảng (${CURRENCIES[currency].symbol})`
      : shape === 'ramp' || shape === 'growth'
        ? `Số của năm ${event.startYear} (${CURRENCIES[currency].symbol})`
        : `Số tiền mỗi năm (${CURRENCIES[currency].symbol})`

  /** Đổi năm kết thúc. Bật "hết đời" mà hình đang là 'total'/'ramp' thì hình phải đi
   *  theo — không thì mốc mang một hình vô nghĩa và `eventSpanNote` rơi về 'per_year'
   *  trong khi ô chọn vẫn hiện 'total'. */
  function ghiEndYear(y: number | null) {
    const kep = y === null ? null : Math.min(MAX_YEAR, Math.max(MIN_YEAR, y))
    const hetDoi = kep === null
    const canDoiHinh = hetDoi && event.amountShape !== 'per_year' && event.amountShape !== 'growth'
    onPatch({
      endYear: kep === null ? null : Math.max(event.startYear, kep),
      ...(canDoiHinh && { amountShape: 'per_year' as AmountShape, endAmountMinor: null }),
    })
  }

  return (
    <>
      <DockPanel title="Mốc cuộc đời">
        {/* --- Hàng "Loại mốc" của bản vẽ = BỘ MẪU (spec §6) --------------------- */}
        <span id={`${uid}-mau`} className={DOCK_LABEL}>
          Thêm mốc từ mẫu
        </span>
        <div role="group" aria-labelledby={`${uid}-mau`} className="flex flex-wrap gap-1">
          {LIFE_PRESETS.map((p) => (
            <FilterChip
              key={p.id}
              on={false}
              size="sm"
              title={p.hint}
              onClick={() => onAddPreset(p)}
            >
              {p.label}
            </FilterChip>
          ))}
        </div>
        <Guide className="mb-2 mt-1 block text-2xs text-fg-muted">
          Mẫu chỉ điền sẵn số — sinh ra rồi là mốc thường, sửa xoá như mọi mốc khác. Số mặc
          định là phỏng đoán, kiểm tra lại.
        </Guide>

        {/* --- Hàng nhận dạng (dùng chung với panel chặng) ----------------------- */}
        <IdentityRow
          icon={event.icon}
          onIcon={(icon) => onPatch({ icon })}
          color={event.color}
          onColor={(color) => onPatch({ color })}
          // Mốc tô TƯƠI, chặng tô TRẦM — spec §8.
          treatment="vivid"
          renderIcon={(icon) => <EventIcon icon={icon} kind={event.kind} className="h-4 w-4" />}
          name={event.label}
          onName={(label) => onPatch({ label })}
          nameLabel="Tên mốc"
          fromYear={
            <YearBox
              value={event.startYear}
              ariaLabel={`Năm bắt đầu mốc ${event.label}`}
              onCommit={(y) => {
                const kep = Math.min(MAX_YEAR, Math.max(MIN_YEAR, y))
                onPatch({
                  startYear: kep,
                  // Năm kết thúc không được lùi trước năm bắt đầu (`check` của DB).
                  ...(event.endYear !== null &&
                    event.endYear < kep && { endYear: kep }),
                })
              }}
            />
          }
          toYear={
            <EndYearBox
              value={event.endYear}
              ariaLabel={`Năm kết thúc mốc ${event.label} — để trống là tới hết đời`}
              onCommit={ghiEndYear}
            />
          }
        />

        {/* --- Lưới trường (các núm THẬT của app, không phải lưới theo loại) ------ */}
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div>
            <span id={`${uid}-chieu`} className={DOCK_LABEL}>
              Chiều tiền
            </span>
            {/* KHÔNG phải <label htmlFor>: đây là hai cái NÚT, không phải một form
                control. `aria-pressed` là phần BẮT BUỘC — trạng thái đang chọn chỉ thể
                hiện bằng MÀU. */}
            <div role="group" aria-labelledby={`${uid}-chieu`} className="flex gap-1">
              {(['expense', 'income'] as const).map((k) => (
                <SegButton key={k} active={event.kind === k} onClick={() => onPatch({ kind: k })}>
                  {k === 'expense' ? 'Chi' : 'Thu'}
                </SegButton>
              ))}
            </div>
          </div>

          <div>
            <span id={`${uid}-bat`} className={DOCK_LABEL}>
              Tính vào bản chiếu
            </span>
            {/* Tắt tạm (migration 0063) — "thử bỏ mốc này ra xem sao" mà không xoá số
                đã nhập. `<FilterChip>` là <button> mang `aria-pressed`. */}
            <div role="group" aria-labelledby={`${uid}-bat`} className="flex">
              <FilterChip
                on={event.enabled}
                size="sm"
                onClick={() => onPatch({ enabled: !event.enabled })}
                title="Tắt tạm để xem bản chiếu không có mốc này"
              >
                {event.enabled ? 'Đang tính' : 'Đang tắt'}
              </FilterChip>
            </div>
          </div>
        </div>

        {/* Số tiền. <span> chứ không <label htmlFor> — MoneyField render CẢ HAI ô (nút
            chạm `lg:hidden` và input desktop `hidden lg:block`), nên `for` luôn có nguy
            cơ trỏ vào ô đang bị CSS ẩn. Tên đọc được đã do `ariaLabel` lo. */}
        <div className="mt-2">
          <span className={DOCK_LABEL}>{amountLabel}</span>
          <MoneyField
            value={event.amountMinor}
            currency={currency}
            autoOpen={false}
            ariaLabel={amountLabel}
            // Kẹp về 0: dock không có nút Xong nào để tắt, và MoneyField cho gõ biểu
            // thức nên "5 − 9" ra số âm là đường có thật.
            onChange={(v) => onPatch({ amountMinor: Math.max(0, v) })}
            className={`w-full text-right font-semibold ${DOCK_INPUT}`}
          />
          {cauHoi !== null && (
            <div className="mt-1 flex justify-end">
              <ActionButton onClick={batDauTra} className="px-2 py-1 text-2xs">
                Tra hộ
              </ActionButton>
            </div>
          )}
        </div>

        {/* Con số ở trên KHÔNG tự nói được nó là gì (migration 0066). Ô này nói. */}
        <div className="mt-2">
          <label htmlFor={`${uid}-hinh`} className={DOCK_LABEL}>
            Con số đó nghĩa là gì
          </label>
          <Select
            id={`${uid}-hinh`}
            value={shape}
            wrapClassName="block w-full"
            onChange={(e) => {
              const next = e.target.value as AmountShape
              onPatch({
                amountShape: next,
                // Bỏ số cuối khi rời hình 'ramp': một `end_amount_minor` còn treo lại
                // làm câu giải thích của hình mới nói một con số không ai đặt.
                ...(next !== 'ramp' && { endAmountMinor: null }),
              })
            }}
          >
            {shapeKhaDung.map((s) => (
              <option key={s} value={s}>
                {SHAPE_LABELS[s]}
              </option>
            ))}
          </Select>
          {forever && (
            <Guide className="mt-1 block text-2xs text-fg-muted">
              Mốc chạy tới hết đời nên chỉ còn hai lựa chọn: không chia được một tổng cho
              vô hạn năm, và không có năm cuối để đi dần tới.
            </Guide>
          )}
        </div>

        <div className="mt-2 grid grid-cols-2 gap-2">
          {shape === 'ramp' && !forever && (
            <div>
              <span className={DOCK_LABEL}>
                Số của năm {event.endYear ?? '…'} ({CURRENCIES[currency].symbol})
              </span>
              <MoneyField
                value={event.endAmountMinor ?? 0}
                currency={currency}
                autoOpen={false}
                ariaLabel="Số tiền của năm cuối"
                onChange={(v) => onPatch({ endAmountMinor: Math.max(0, v) })}
                className={`w-full text-right font-semibold ${DOCK_INPUT}`}
              />
            </div>
          )}

          {shape === 'growth' && (
            <div>
              <label htmlFor={`${uid}-nhan`} className={DOCK_LABEL}>
                Mỗi năm nhân thêm (%)
              </label>
              <NumBox
                id={`${uid}-nhan`}
                value={event.growthBps / 100}
                emptyIsNull={false}
                ariaLabel="Mỗi năm nhân thêm, phần trăm mỗi năm"
                // Cộng RIÊNG, không thay lạm phát. Kẹp trong (−100, 1000).
                onCommit={(n) =>
                  n !== null &&
                  onPatch({ growthBps: Math.round(Math.min(1000, Math.max(-99, n)) * 100) })
                }
              />
            </div>
          )}

          <div>
            <label htmlFor={`${uid}-lap`} className={DOCK_LABEL}>
              Lặp mỗi N năm
            </label>
            <NumBox
              id={`${uid}-lap`}
              value={event.repeatEveryYears}
              emptyIsNull
              ariaLabel="Lặp mỗi bao nhiêu năm — để trống là mọi năm trong khoảng"
              placeholder="mọi năm"
              onCommit={(n) =>
                onPatch({
                  repeatEveryYears:
                    n === null ? null : Math.min(MAX_REPEAT_YEARS, Math.max(1, Math.round(n))),
                })
              }
            />
          </div>
        </div>

        {/* CHỐNG ĐẾM HAI LẦN (migration 0067). Chi nền của chặng lấy từ CHI THẬT, nên nó
            đã chứa tiền thuê nhà, tiền học, mọi thứ đang tiêu. Một mốc "Mua nhà" cộng
            khoản trả nợ LÊN TRÊN tiền thuê vẫn còn nguyên trong chi nền — phần nhà ở bị
            tính hai lần và không có gì nói ra. Ô này là chỗ nói ra. */}
        <div className="mt-2">
          <span className={DOCK_LABEL}>
            Thay cho khoản đang tiêu nào ({CURRENCIES[currency].symbol}/năm)
          </span>
          {/* "Lấy số thật từ một danh mục…" — đây là chỗ ô này thôi đòi người dùng ĐOÁN.
              Chi nền của chặng vốn lấy từ sổ, nên con số "thôi không tiêu nữa" đã có sẵn
              trong chính sổ đó: chọn "Nhà ở" là điền đúng số tiền nhà 12 tháng qua, đã
              quy năm hoá. Ghi THẲNG vào nháp (không đệm state cục bộ) — cùng luật với mọi
              ô khác trong dock, xem đầu file. */}
          {chiTheoDanhMuc.length > 0 && (
            <Select
              aria-label="Chọn danh mục để lấy số thật"
              wrapClassName="mb-1 w-full"
              // Luôn quay về mục rỗng: đây là một LỆNH ("điền hộ tôi"), không phải một
              // trường có giá trị — giá trị thật nằm ở ô tiền ngay dưới, và giữ tên danh
              // mục ở đây sẽ nói dối khi người dùng sửa tay con số đó.
              value=""
              // Nhận diện bằng CHỈ SỐ, không bằng tên: `suggestBaseline` gán cùng một tên
              // "Danh mục đã xóa" cho mọi danh mục đã bị xoá LẪN nhóm không danh mục, nên
              // tra theo tên có thể lấy đúng dòng khác (và hai `key` trùng nhau). Bản ở
              // `EventFormSheet` tra theo tên — đây là chỗ sửa lại khi dời về.
              onChange={(e) => {
                const c = chiTheoDanhMuc[Number(e.target.value)]
                if (!c) return
                onPatch({ replacesMinor: c.annualMinor, replacesLabel: c.name })
              }}
            >
              <option value="">Lấy số thật từ một danh mục…</option>
              {chiTheoDanhMuc.map((c, i) => (
                <option key={i} value={i}>
                  {c.name} — {formatMoney(c.annualMinor, currency)}/năm
                </option>
              ))}
            </Select>
          )}
          <MoneyField
            value={event.replacesMinor}
            currency={currency}
            autoOpen={false}
            ariaLabel="Số mỗi năm thôi không tiêu nữa"
            onChange={(v) => {
              const so = Math.max(0, v)
              onPatch({
                replacesMinor: so,
                // Bỏ nhãn khi số về 0: một nhãn "thay cho Nhà ở" còn treo lại trong khi
                // không thay gì cả là câu giải thích nói dối.
                ...(so === 0 && { replacesLabel: '' }),
              })
            }}
            className={`w-full text-right font-semibold ${DOCK_INPUT}`}
          />
          {event.replacesMinor > 0 && (
            <input
              value={event.replacesLabel}
              onChange={(e) => onPatch({ replacesLabel: e.target.value })}
              placeholder="Tên khoản bị thay — ví dụ: Nhà ở"
              aria-label="Tên khoản bị thay"
              className={`mt-1 w-full ${DOCK_INPUT}`}
            />
          )}
        </div>

        {/* MUA TÀI SẢN (migration 0068). Trước bản đó, "Mua nhà" là một mốc CHI thuần
            tuý: tài sản ròng tụt bằng khoản trả trước rồi KHÔNG BAO GIỜ nhận lại căn
            nhà — nên trên đồ thị mua nhà luôn trông tệ hơn thực tế. */}
        <div className="mt-2">
          <span id={`${uid}-ts`} className={DOCK_LABEL}>
            Khoản này có mua một tài sản không
          </span>
          <div role="group" aria-labelledby={`${uid}-ts`} className="flex gap-1">
            <SegButton
              active={!muaTaiSan}
              onClick={() =>
                onPatch({ assetValueMinor: 0, loanMinor: 0, loanYears: 0, assetChangeBps: 0 })
              }
            >
              Không
            </SegButton>
            <SegButton active={muaTaiSan} onClick={() => onPatch({ assetValueMinor: 40_000_000 })}>
              Có — nhà, xe, đất
            </SegButton>
          </div>
        </div>

        {muaTaiSan && (
          <div className="mt-2 rounded-md border border-border-panel p-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className={DOCK_LABEL}>
                  Giá trị ({CURRENCIES[currency].symbol})
                </span>
                <MoneyField
                  value={event.assetValueMinor}
                  currency={currency}
                  autoOpen={false}
                  ariaLabel="Giá trị tài sản"
                  onChange={(v) => {
                    const gia = Math.max(0, v)
                    onPatch({
                      assetValueMinor: gia,
                      // DB có `check (loan_minor <= asset_value_minor)`. Kẹp ở đây thay
                      // vì để lần Lưu nổ một lỗi Postgres thô, xa chỗ gõ sai.
                      ...(event.loanMinor > gia && { loanMinor: gia }),
                    })
                  }}
                  className={`w-full text-right font-semibold ${DOCK_INPUT}`}
                />
              </div>
              <div>
                <label htmlFor={`${uid}-tsdoi`} className={DOCK_LABEL}>
                  Mỗi năm đổi (%)
                </label>
                <NumBox
                  id={`${uid}-tsdoi`}
                  value={event.assetChangeBps / 100}
                  emptyIsNull={false}
                  ariaLabel="Mỗi năm giá trị tài sản đổi, phần trăm — nhà khoảng +1, xe khoảng −15"
                  onCommit={(n) =>
                    n !== null &&
                    onPatch({ assetChangeBps: Math.round(Math.min(99, Math.max(-99, n)) * 100) })
                  }
                />
              </div>
            </div>

            <span id={`${uid}-vay`} className={`mt-2 ${DOCK_LABEL}`}>
              Trả thế nào
            </span>
            <div role="group" aria-labelledby={`${uid}-vay`} className="flex gap-1">
              <SegButton active={!dangVay} onClick={() => onPatch({ loanMinor: 0, loanYears: 0 })}>
                Trả thẳng
              </SegButton>
              <SegButton
                active={dangVay}
                // Mặc định 80% giá và 35 năm: đúng cách vay mua nhà phổ biến ở Nhật, và
                // 20% trả trước là mức tránh được bảo hiểm khoản vay ở nhiều nước.
                onClick={() =>
                  onPatch({
                    loanMinor: event.loanMinor > 0 ? event.loanMinor : Math.round(event.assetValueMinor * 0.8),
                    loanYears: event.loanYears > 0 ? event.loanYears : 35,
                  })
                }
              >
                Vay
              </SegButton>
            </div>

            {dangVay && (
              <div className="mt-2 grid grid-cols-3 gap-2">
                <div>
                  <span className={DOCK_LABEL}>Phần vay</span>
                  <MoneyField
                    value={event.loanMinor}
                    currency={currency}
                    autoOpen={false}
                    ariaLabel="Phần đi vay"
                    onChange={(v) =>
                      onPatch({ loanMinor: Math.min(event.assetValueMinor, Math.max(0, v)) })
                    }
                    className={`w-full text-right font-semibold ${DOCK_INPUT}`}
                  />
                </div>
                <div>
                  <label htmlFor={`${uid}-lai`} className={DOCK_LABEL}>
                    Lãi (%)
                  </label>
                  <NumBox
                    id={`${uid}-lai`}
                    value={event.loanRateBps / 100}
                    emptyIsNull={false}
                    ariaLabel="Lãi suất, phần trăm mỗi năm"
                    onCommit={(n) =>
                      n !== null &&
                      onPatch({ loanRateBps: Math.round(Math.min(100, Math.max(0, n)) * 100) })
                    }
                  />
                </div>
                <div>
                  <label htmlFor={`${uid}-kyhan`} className={DOCK_LABEL}>
                    Kỳ hạn
                  </label>
                  <NumBox
                    id={`${uid}-kyhan`}
                    value={event.loanYears === 0 ? null : event.loanYears}
                    emptyIsNull
                    ariaLabel="Kỳ hạn vay, số năm"
                    onCommit={(n) =>
                      onPatch({
                        loanYears:
                          n === null
                            ? 0
                            : Math.min(MAX_LOAN_YEARS, Math.max(1, Math.round(n))),
                      })
                    }
                  />
                </div>
              </div>
            )}

            {/* Ba con số này là toàn bộ điều người dùng muốn biết, và chúng do đúng
                `homeAsset.ts` mà engine dùng tính ra. */}
            <p className="mt-2 rounded-md bg-surface-sunken px-2 py-1.5 text-2xs text-fg-secondary">
              Năm <Num tone="muted">{taiSan.startYear}</Num>: bỏ ra{' '}
              <Money amount={tienMua.downMinor} currency={currency} compact className="font-semibold" />
              {tienMua.loanMinor > 0 ? (
                <>
                  {' '}và trả nợ{' '}
                  <Money amount={tienMua.loanMinor} currency={currency} compact className="font-semibold" />
                  /năm trong <Num tone="muted">{taiSan.loanYears}</Num> năm.
                </>
              ) : (
                '. Không vay.'
              )}
            </p>
          </div>
        )}

        {/* --- Dòng tổng của bản vẽ: tổng ảnh hưởng · trải N năm · Y/năm · chặng --- */}
        {giaiThich !== null && (
          <p className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-md bg-surface-sunken px-2 py-1.5 text-2xs text-fg-secondary">
            <span className="text-fg-muted">Tổng ảnh hưởng</span>
            {giaiThich.totalMinor === null ? (
              // "tới hết đời" là CHỮ, không phải số — không đi qua <Num> (xem đầu file
              // Num.tsx, và cùng luật với "chưa đạt" ở PlanSummaryCard).
              <span className="text-fg-muted">tới hết đời</span>
            ) : (
              <Money
                amount={giaiThich.totalMinor}
                currency={currency}
                compact
                tone={event.kind === 'income' ? 'in' : 'out'}
                className="font-semibold"
              />
            )}
            {giaiThich.years !== null && (
              <>
                <span aria-hidden className="text-fg-muted">
                  ·
                </span>
                <Num tone="muted">{giaiThich.years} năm</Num>
              </>
            )}
            <span aria-hidden className="text-fg-muted">
              ·
            </span>
            <Money amount={giaiThich.firstMinor} currency={currency} compact />
            <span className="text-fg-muted">/lần</span>
            {giaiThich.repeatEveryYears !== null && (
              <>
                <span aria-hidden className="text-fg-muted">
                  ·
                </span>
                <span className="text-fg-muted">lặp mỗi</span>
                <Num tone="muted">{giaiThich.repeatEveryYears} năm</Num>
              </>
            )}
            {phaseLabel !== null && (
              <>
                <span aria-hidden className="text-fg-muted">
                  ·
                </span>
                <span className="min-w-0 truncate">Rơi vào chặng "{phaseLabel}"</span>
              </>
            )}
          </p>
        )}

        {/* --- Nâng cao (gập) --------------------------------------------------- */}
        <button
          type="button"
          aria-expanded={advOpen}
          aria-controls={`${uid}-adv`}
          onClick={() => setAdvOpen((v) => !v)}
          className="mt-2 flex min-h-8 w-full items-center justify-between gap-2 rounded-full px-2 text-2xs uppercase tracking-label text-fg-muted transition active:scale-95 hover:bg-surface-sunken"
        >
          Nâng cao
          <ChevronDown
            aria-hidden
            className={`h-3 w-3 motion-group ${advOpen ? 'rotate-180' : ''}`}
          />
        </button>
        <Collapse open={advOpen} id={`${uid}-adv`}>
          <div className="pt-1">
            {/* TIỀN TỆ KHAI là CHỮ, không phải ô chọn — và đó là chỗ cố ý lệch bản vẽ.
                Từ bản vẽ v5 (fxModel.ts) một mốc KHÔNG còn tiền riêng: nó tính bằng tiền
                của chặng phủ năm nó bắt đầu. Cho gõ một đồng khác ở đây là dựng lại đúng
                cái ô đã bỏ, và `normalizeToPhaseCurrency` sẽ quy đổi nó ngược lại ngay
                lần đọc sau — tức ô đó không giữ được giá trị nào. */}
            <span className={DOCK_LABEL}>Tiền tệ khai</span>
            <p className="mb-2 text-2xs text-fg-secondary">
              {CURRENCIES[currency].label} — theo chặng
              {phaseLabel === null ? '' : ` "${phaseLabel}"`}. Đổi ở bảng chặng.
            </p>

            <label className="mb-2 flex min-h-8 items-center gap-2 text-2xs text-fg-secondary">
              <input
                type="checkbox"
                checked={event.inflate}
                onChange={(e) => onPatch({ inflate: e.target.checked })}
                className="h-3.5 w-3.5"
              />
              Tăng theo lạm phát
            </label>

            <label htmlFor={`${uid}-ghichu`} className={DOCK_LABEL}>
              Ghi chú
            </label>
            <input
              id={`${uid}-ghichu`}
              value={event.note}
              onChange={(e) => onPatch({ note: e.target.value })}
              className={`w-full ${DOCK_INPUT}`}
            />
          </div>
        </Collapse>

        {/* --- Chân panel ------------------------------------------------------- */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <ActionButton onClick={onDuplicate} className="px-2 py-1 text-2xs">
            <Copy className="h-3 w-3" aria-hidden="true" />
            Nhân đôi
          </ActionButton>
          {/* Bản vẽ chỉ cho nút này với ba loại `job`/`move`/`study`. App không có cột
              `type` để lọc theo (spec §6), nên nút hiện cho MỌI mốc — "đổi việc / về
              nước / đi học" là chuyện đổi thu chi nền, và mốc nào cũng có thể là chỗ
              người dùng nhận ra điều đó. */}
          <ActionButton onClick={onNewPhaseFromHere} className="px-2 py-1 text-2xs">
            <Layers className="h-3 w-3" aria-hidden="true" />
            Chặng đời mới từ đây
          </ActionButton>
          <ActionButton variant="danger" onClick={onRemove} className="ml-auto px-2 py-1 text-2xs">
            <Trash2 className="h-3 w-3" aria-hidden="true" />
            Xoá mốc
          </ActionButton>
        </div>
      </DockPanel>

      {/* Sheet "Tra hộ" nằm NGOÀI panel, cùng cấp: hai lớp phủ lồng nhau thì Esc đóng
          nhầm lớp và nền mờ tô hai lần. Cùng luật với `EventFormSheet` (commit cc31eb1). */}
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
            // NỐI THÊM, không thay: ghi đè ở đây là xoá sạch ghi chú người dùng tự viết.
            const cu = event.note
            onPatch({
              amountMinor: minor,
              note: cu.trim() === '' ? ghiChu : `${cu}\n\n${ghiChu}`,
            })
            setMoTraSo(false)
          }}
        />
      )}
    </>
  )
}
