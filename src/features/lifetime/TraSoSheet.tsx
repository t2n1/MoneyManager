// Màn kết quả "Tra hộ" — CHỈ RENDER, không tính số. Mọi phép kiểm đã xong ở
// traSoKetQua.docKetQua trước khi component này thấy dữ liệu.
//
// BA TRẠNG THÁI, và không cái nào dẫn tới một con số lặng lẽ đi vào kịch bản:
//   đang chạy      → không có nút Lấy
//   lỗi bất kỳ     → không có nút Lấy, nói thẳng hỏng ở đâu
//   có kết quả     → ba nút Lấy, mỗi nút kèm sẵn ghi chú nguồn
//
// Khuôn lớp phủ chép NGUYÊN SI (từng token) từ EventFormSheet.tsx:110-116 — không tự
// nghĩ khuôn mới, kể cả các phần trông như "không cần" ở một sheet nhỏ:
//   - max-h-[92vh] + overflow-y-auto: dienGiai và canhBao không giới hạn độ dài/số
//     lượng — thiếu cuộn thì nội dung dài đẩy ba nút Thấp/Giữa/Cao ra khỏi màn hình.
//   - pb-[max(1rem,env(safe-area-inset-bottom))]: tránh nút Bỏ qua đè lên vạch home
//     iPhone.
//   - animate-sheet-in / lg:animate-sheet-pop: khớp hoạt ảnh với mọi sheet khác.
//   - rounded-t-2xl / lg:rounded-2xl: docs/design-system.md gán 2xl theo VAI TRÒ
//     ("thẻ hero và sheet trượt lên"), không theo kích cỡ — sheet này trượt lên
//     (items-end, rounded-t-*) nên thuộc vai trò đó dù nội dung ngắn.
//   - aria-modal="true": không có thì một số trình đọc màn hình không coi nền là
//     bất hoạt khi sheet mở.
import { useEffect } from 'react'
import { ActionButton, Money } from '../../components/ui'
import type { CurrencyCode } from '../../lib/currencies'
import { laLoi, type KetQuaTra, type LoiTra } from './traSoKetQua'

interface Props {
  dangChay: boolean
  ketQua: KetQuaTra | LoiTra | null
  tien: CurrencyCode
  /** true = mốc tự đặt tên, chữ người dùng gõ sẽ đi ra ngoài. Cảnh báo TRƯỚC khi gửi. */
  canhBaoRiengTu: boolean
  onChon: (minor: number, ghiChu: string) => void
  onDong: () => void
}

/** Câu ghi vào ô Ghi chú của mốc. Sáu tháng sau mở lại còn biết số ở đâu ra. */
function ghiChuTu(k: KetQuaTra, mucDaChon: number): string {
  const nam = k.nguon.nam === null ? '' : ` ${k.nguon.nam}`
  const canhBao = k.canhBao.length > 0 ? ` — ${k.canhBao.join(' ')}` : ''
  return `Tra hộ: ${mucDaChon} ${k.tien}. Nguồn: ${k.nguon.ten}${nam} (${k.nguon.url}). ${k.dienGiai}${canhBao}`
}

export function TraSoSheet({ dangChay, ketQua, tien, canhBaoRiengTu, onChon, onDong }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDong()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onDong])

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 lg:items-center animate-overlay-in"
      onClick={onDong}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Tra số cho mốc"
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:rounded-2xl animate-sheet-in lg:animate-sheet-pop"
        onClick={(e) => e.stopPropagation()}
      >
        {canhBaoRiengTu && (
          <p className="mb-3 rounded-md bg-surface-sunken p-2 text-sm text-fg-secondary">
            Đây là mốc bạn tự đặt tên, nên tên mốc sẽ được gửi ra ngoài. Đừng gõ chuyện riêng.
          </p>
        )}

        {dangChay && <p className="py-6 text-center text-sm text-fg-secondary">Đang tra…</p>}

        {!dangChay && ketQua !== null && laLoi(ketQua) && (
          <div className="py-2">
            <p className="text-sm font-medium text-fg-primary">Không lấy được số</p>
            <p className="mt-1 text-sm text-fg-secondary">{ketQua.noiDung}</p>
            <p className="mt-3 text-sm text-fg-secondary">Số bạn đang có giữ nguyên.</p>
          </div>
        )}

        {!dangChay && ketQua !== null && !laLoi(ketQua) && (
          <div>
            <div className="space-y-1">
              {(
                [
                  ['Thấp', ketQua.thapMinor],
                  ['Giữa', ketQua.giuaMinor],
                  ['Cao', ketQua.caoMinor],
                ] as const
              ).map(([ten, minor]) => (
                <button
                  key={ten}
                  type="button"
                  onClick={() => onChon(minor, ghiChuTu(ketQua, minor))}
                  className="flex min-h-9 w-full items-center justify-between rounded-md border border-border-strong px-2.5 py-1 text-sm text-fg-primary transition hover:bg-surface-sunken active:scale-95"
                >
                  <span>{ten}</span>
                  <Money amount={minor} currency={tien} />
                </button>
              ))}
            </div>

            <p className="mt-3 text-sm text-fg-secondary">{ketQua.dienGiai}</p>

            {ketQua.canhBao.map((c) => (
              <p key={c} className="mt-2 text-sm text-fg-secondary">
                ⚠ {c}
              </p>
            ))}

            <p className="mt-3 text-sm text-fg-secondary">
              Nguồn: {ketQua.nguon.ten}
              {ketQua.nguon.nam !== null && ` ${ketQua.nguon.nam}`}
            </p>
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <ActionButton onClick={onDong}>Bỏ qua</ActionButton>
        </div>
      </div>
    </div>
  )
}
