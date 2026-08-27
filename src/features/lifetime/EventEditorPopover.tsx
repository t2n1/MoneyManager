// Form sửa mốc TẠI CHỖ — nổi lên ngay dưới đồ thị, cạnh chip vừa bấm.
//
// Trước bản này, sửa số tiền của một mốc phải mở trình sửa kịch bản (một sheet toàn màn
// che mất đồ thị), tìm mốc trong danh sách, sửa, lưu, đóng sheet — rồi mới thấy đường
// đổi. Ở đây đồ thị vẫn nằm nguyên trên màn và đổi theo từng ký tự gõ, vì mọi thứ sửa
// vào BẢN NHÁP chứ không vào DB.
//
// Chỉ bốn ô (tên, hai năm, số tiền). Tỷ giá, ghi chú, cờ lạm phát vẫn thuộc trình sửa
// đầy đủ: chúng không phải thứ người ta vặn khi đang nhìn đường đồ thị chạy.
//
// Ngoại lệ: nhận số từ "Tra hộ" thì ghi kèm `currency`/`fxToDisplay` (số phải đi cùng
// đồng tiền của nó) và NỐI thêm nguồn vào `note`. Không ô nào ở đây sửa ba trường đó.
import { useRef, useState } from 'react'
import { X } from 'lucide-react'
import { ActionButton, IconButton, actionButtonClass } from '../../components/ui'
import { useTraSo } from '../../hooks/queries'
import type { CurrencyCode } from '../../lib/currencies'
import { CURRENCIES } from '../../lib/currencies'
import type { DraftEvent } from './draft'
import { dungCauHoi } from './traSo'
import { docKetQua, type KetQuaTra, type LoiTra } from './traSoKetQua'
import { TraSoSheet } from './TraSoSheet'

interface Props {
  event: DraftEvent
  /** Toạ độ x (pixel, trong vùng vẽ) của chip — form nép cạnh nó. */
  anchorX: number
  /** Bề ngang vùng vẽ, để form không tràn ra ngoài thẻ. */
  plotWidth: number
  /** Mép trên của form, tính từ đỉnh vùng vẽ. */
  top: number
  minYear: number
  maxYear: number
  /** Chặng phủ năm bắt đầu của mốc — cho nước và tiền. Null thì ẩn nút "Tra hộ". */
  chang: { nuoc: string | null; tien: CurrencyCode } | null
  onPatch: (patch: Partial<Omit<DraftEvent, 'id'>>) => void
  onDelete: () => void
  onClose: () => void
}

const WIDTH = 268

const FIELD =
  'mt-0.5 block w-full rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm text-fg-primary'

/** Số tiền nhập theo đơn vị LỚN (¥, ₫) rồi quy về minor — người dùng không gõ "cent". */
function toMinor(major: string, currency: CurrencyCode): number {
  const n = Number(major.replace(/[^\d.-]/g, ''))
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 10 ** CURRENCIES[currency].decimals)
}
function toMajor(minor: number, currency: CurrencyCode): string {
  return String(minor / 10 ** CURRENCIES[currency].decimals)
}

export function EventEditorPopover({
  event,
  anchorX,
  plotWidth,
  top,
  minYear,
  maxYear,
  chang,
  onPatch,
  onDelete,
  onClose,
}: Props) {
  // Nép cạnh chip nhưng không tràn: kẹp cả hai mép. Ở màn hẹp hơn chính form thì nó
  // dán về 0 và chiếm trọn bề ngang — vẫn đọc được, chỉ không còn "cạnh chip".
  const left = Math.max(0, Math.min(anchorX - WIDTH / 2, Math.max(0, plotWidth - WIDTH)))

  const [moSheet, setMoSheet] = useState(false)
  const [ketQua, setKetQua] = useState<KetQuaTra | LoiTra | null>(null)
  // true = sheet đang mở nhưng CHƯA gửi gì đi. Xem `batDauTra`.
  const [choXacNhan, setChoXacNhan] = useState(false)
  // Đếm số lần nhận số từ sheet — chỉ để làm `key` cho ô nhập, xem chỗ dùng.
  const [lanNhanSo, setLanNhanSo] = useState(0)
  const traSo = useTraSo()
  // Thẻ lượt: đóng sheet giữa chừng rồi bấm "Tra hộ" lại là một đường có thật (Esc/bấm ra
  // ngoài không huỷ request đang bay). Không có thẻ này, lượt cũ về muộn hơn sẽ đè kết quả
  // của lượt mới — người dùng bấm "Lấy" một con số không thuộc câu mình vừa hỏi.
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
   * Đồng tiền của Ô SỐ TIỀN — của CHẶNG, không phải `event.currency`.
   *
   * Từ bản v5 (`fxModel.ts`) tiền nằm trên chặng chứ không trên mốc, và `event.currency`
   * có thể còn mang đồng CŨ (không có migration hàng loạt — ca 年金 giữ ¥ trong chặng $ là
   * trạng thái HỢP LỆ). Đọc ô theo `event.currency` trong khi lượt tra hỏi theo tiền của
   * chặng thì hai bên nói hai đồng khác nhau, và số tra về ghi vào một ô đang tính bằng
   * đồng khác — ra một con số người dùng chưa bao giờ chọn, không cảnh báo gì.
   * `ScenarioWorkbench` (MoneyField, `currencyAt`) đã đọc theo chặng; đây đọc y như vậy.
   */
  const tienO = chang?.tien ?? event.currency

  /**
   * Ghi số tiền KÈM đồng tiền, y hệt `ScenarioWorkbench.tsx` — lần người dùng chạm vào là
   * lúc dòng dữ liệu tự lành về mô hình v5. Không có `chang` thì không biết lành về đâu,
   * nên chỉ ghi con số (giữ nguyên hành vi cũ).
   */
  function ghiSoTien(minor: number) {
    onPatch(
      chang === null
        ? { amountMinor: minor }
        : { amountMinor: minor, currency: chang.tien, fxToDisplay: 1 },
    )
  }

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
    setMoSheet(true)
    if (!cauHoi.laMocCoSan) {
      setChoXacNhan(true)
      return
    }
    setChoXacNhan(false)
    gui()
  }

  function gui() {
    if (cauHoi === null || chang === null) return
    setChoXacNhan(false)
    const luot = ++luotRef.current // mỗi lần gửi là một lượt mới
    // Truyền cả `tien`: bản demo dội lại đúng đồng đó, nếu không `docKetQua` sẽ từ chối
    // với `sai-tien` ở mọi chặng không phải JPY. Xem JSDoc `Repo.traSo`.
    traSo.mutate(
      { van: cauHoi.van, tien: chang.tien },
      {
        // Chỉ lượt MỚI NHẤT được phép ghi kết quả. Lượt cũ về muộn thì bỏ qua lặng lẽ.
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

  return (
    <>
      <div
        className="absolute z-30 rounded-lg border border-border-strong bg-surface p-3 shadow-lg"
        style={{ left, top, width: WIDTH }}
        // Bấm trong form không được coi là bấm lên đồ thị (sẽ ghim/bỏ ghim một năm).
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-2xs uppercase tracking-label text-fg-muted">Sửa mốc</p>
          <IconButton
            variant="ghost"
            onClick={onClose}
            aria-label="Đóng form sửa mốc"
            className="px-2"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </IconButton>
        </div>

        <label className="mt-1.5 block text-2xs text-fg-muted">
          Tên
          <input
            value={event.label}
            onChange={(e) => onPatch({ label: e.target.value })}
            className={FIELD}
          />
        </label>

        <div className="mt-1.5 flex gap-2">
          <label className="flex-1 text-2xs text-fg-muted">
            Từ năm
            <input
              type="number"
              value={event.startYear}
              min={minYear}
              max={maxYear}
              onChange={(e) => {
                const v = Number(e.target.value)
                if (!Number.isFinite(v) || v < minYear || v > maxYear) return
                // Kéo năm bắt đầu thì năm kết thúc đi theo, giữ nguyên ĐỘ DÀI: "nuôi con
                // 22 năm" dời sang 2033 vẫn phải là 22 năm, không phải co lại còn 19.
                const span = event.endYear !== null ? event.endYear - event.startYear : null
                onPatch({ startYear: v, ...(span !== null && { endYear: v + span }) })
              }}
              className={`${FIELD} tabular-nums`}
            />
          </label>
          <label className="flex-1 text-2xs text-fg-muted">
            Đến năm
            <input
              type="number"
              // `endYear` null = kéo tới hết đời. Hiện tuổi cuối thay vì để ô trống —
              // một ô trống đọc như "chưa khai", trong khi đây là một lựa chọn có nghĩa.
              value={event.endYear ?? maxYear}
              min={event.startYear}
              max={maxYear}
              onChange={(e) => {
                const v = Number(e.target.value)
                if (!Number.isFinite(v) || v < event.startYear || v > maxYear) return
                onPatch({ endYear: v })
              }}
              className={`${FIELD} tabular-nums`}
            />
          </label>
        </div>

        <label className="mt-1.5 block text-2xs text-fg-muted">
          Số tiền mỗi năm ({tienO})
          <div className="flex items-end gap-1.5">
            <input
              // `key` nhảy khi số ĐẾN TỪ SHEET, không nhảy khi người dùng đang gõ: ô này
              // là uncontrolled (defaultValue), nên không có nó thì bấm "Lấy" xong ô vẫn
              // in số cũ trong khi đồ thị đã đổi — hai con số khác nhau trên cùng màn.
              //
              // Ba mảnh, thiếu mảnh nào cũng hở: `event.id` remount khi đổi CHIP (popover
              // không tự remount theo mốc); `tienO` remount khi sửa "Từ năm" đẩy mốc sang
              // một CHẶNG khác đồng tiền — nhãn đổi mà DOM giữ số cũ thì phím tiếp theo ghi
              // số cũ kèm đồng tiền mới, sai theo đúng tỷ giá; `lanNhanSo` remount khi số về
              // từ sheet "Tra hộ", như lý do đã ghi ở trên. Cả `event.id` lẫn `tienO` đều
              // không đổi được trong lúc đang gõ vào chính ô này, nên thêm chúng không làm
              // sống lại lỗi con trỏ nhảy mà `key={lanNhanSo}` sinh ra để chặn.
              key={`${event.id}-${tienO}-${lanNhanSo}`}
              inputMode="decimal"
              defaultValue={toMajor(event.amountMinor, tienO)}
              onChange={(e) => ghiSoTien(toMinor(e.target.value, tienO))}
              className={`${FIELD} tabular-nums`}
            />
            {cauHoi !== null && (
              <button
                type="button"
                onClick={batDauTra}
                className="min-h-9 shrink-0 rounded-md border border-border-strong px-2.5 py-1 text-sm font-medium text-fg-secondary transition hover:bg-surface-sunken active:scale-95"
              >
                Tra hộ
              </button>
            )}
          </div>
        </label>

        <div className="mt-2.5 flex items-center justify-between gap-2">
          <button type="button" onClick={onDelete} className={actionButtonClass('danger')}>
            Xoá mốc
          </button>
          <ActionButton variant="primary" onClick={onClose}>
            Xong
          </ActionButton>
        </div>
      </div>

      {moSheet && chang !== null && cauHoi !== null && (
        <TraSoSheet
          dangChay={traSo.isPending}
          ketQua={ketQua}
          tien={chang.tien}
          choXacNhan={choXacNhan}
          canhBaoRiengTu={!cauHoi.laMocCoSan}
          onXacNhan={gui}
          onDong={() => {
            setMoSheet(false)
            setChoXacNhan(false)
          }}
          onChon={(minor, ghiChu) => {
            onPatch({
              amountMinor: minor,
              // Đồng tiền đi CÙNG con số. `docKetQua` đã kiểm câu trả lời đúng
              // `chang.tien`, nên số này là số của chặng — ghi thiếu `currency` là để nó
              // rơi vào một ô còn mang đồng cũ và bị quy đổi tiếp một lần nữa.
              currency: chang.tien,
              fxToDisplay: 1,
              // NỐI THÊM, không thay: `draft.ts` mang `note` theo chỉ để không ghi đè
              // mất, và `planDraftSave` đẩy nó xuống DB lúc Lưu — ghi đè ở đây là xoá
              // sạch ghi chú người dùng tự viết trong mốc đó.
              note: event.note.trim() === '' ? ghiChu : `${event.note}\n\n${ghiChu}`,
            })
            setLanNhanSo((n) => n + 1)
            setMoSheet(false)
          }}
        />
      )}
    </>
  )
}
