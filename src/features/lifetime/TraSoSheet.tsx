// Màn kết quả "Tra hộ" — CHỈ RENDER, không tính số. Mọi phép kiểm đã xong ở
// traSoKetQua.docKetQua, và câu ghi chú do traSoKetQua.ghiChuTu dựng — cả hai đều là
// hàm thuần có unit test, ở ngoài React.
//
// BỐN TRẠNG THÁI, và không cái nào dẫn tới một con số lặng lẽ đi vào kịch bản:
//   chờ xác nhận  → CHƯA gửi gì đi cả, chỉ có "Gửi câu hỏi" / "Thôi"
//   đang chạy     → không có nút Lấy
//   lỗi bất kỳ    → không có nút Lấy, nói thẳng hỏng ở đâu
//   có kết quả    → ba nút Lấy, mỗi nút kèm sẵn ghi chú nguồn
//
// VÌ SAO CÓ TRẠNG THÁI THỨ NHẤT. Bản thiết kế đòi mốc tự đặt tên "hiện cảnh báo một dòng
// TRƯỚC KHI GỬI — người dùng bấm tiếp hay thôi". Bản trước hiện cảnh báo như một câu thụ
// động trên một sheet đã mở đè lên request ĐANG BAY: lúc người dùng đọc được "đừng gõ
// chuyện riêng" thì nhãn mốc — ví dụ của chính bản thiết kế là "Chi phí điều trị cho mẹ"
// — đã rời khỏi máy rồi. Một cảnh báo sau khi hành động xong không phải là cảnh báo.
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
import { useEffect, useState } from 'react'
import { ActionButton, Money } from '../../components/ui'
import type { CurrencyCode } from '../../lib/currencies'
import { toISODate } from '../../lib/dates'
import { usePrivacyMode } from '../../lib/privacy'
import { ghiChuTu, laLoi, type KetQuaTra, type LoiTra } from './traSoKetQua'

/**
 * Link nguồn — chỉ biến thành `<a>` khi đúng `https://`.
 *
 * `url` là chữ NHÀ CUNG CẤP trả về, tức dữ liệu không tin được: một href `javascript:…`
 * đặt thẳng vào DOM là một lỗ. Không khớp thì vẫn IN RA nguyên văn — sheet này bảo người
 * dùng "kiểm nguồn kỹ hơn", giấu mất cái link là tự mâu thuẫn.
 */
function LinkNguon({ url }: { url: string }) {
  if (!/^https:\/\//.test(url)) return <>{url}</>
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="underline">
      {url}
    </a>
  )
}

interface Props {
  dangChay: boolean
  ketQua: KetQuaTra | LoiTra | null
  tien: CurrencyCode
  /** true = chưa gửi gì đi, đang chờ người dùng bấm "Gửi câu hỏi". */
  choXacNhan: boolean
  /** true = mốc tự đặt tên, chữ người dùng gõ sẽ đi ra ngoài. Cảnh báo TRƯỚC khi gửi. */
  canhBaoRiengTu: boolean
  /** Người dùng đồng ý gửi. Chỉ gọi từ trạng thái chờ xác nhận. */
  onXacNhan: () => void
  onChon: (minor: number, ghiChu: string) => void
  onDong: () => void
}

export function TraSoSheet({
  dangChay,
  ketQua,
  tien,
  choXacNhan,
  canhBaoRiengTu,
  onXacNhan,
  onChon,
  onDong,
}: Props) {
  // Ghim MỘT lần lúc mở sheet, không tính lại mỗi render: đây là "ngày tra" thật, và nó
  // phải giống hệt nhau ở chỗ hiện lên màn và ở câu ghi vào ghi chú.
  const [ngayTra] = useState(() => new Date())
  // Chế độ riêng tư che mọi <Money>, kể cả ba mức ở đây — tức người dùng chọn mù. Không
  // bỏ <Money> (che số là lời hứa với người dùng, và đây là màn hình); chỉ nói ra để họ
  // biết vì sao ba con số thành '•••' và tắt đi nếu muốn nhìn.
  const dangCheSo = usePrivacyMode()

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

        {choXacNhan ? (
          <div className="py-2">
            <p className="text-sm text-fg-secondary">
              Chưa có gì được gửi đi. Bấm "Gửi câu hỏi" nếu bạn đồng ý.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <ActionButton onClick={onDong}>Thôi</ActionButton>
              <ActionButton variant="primary" onClick={onXacNhan}>
                Gửi câu hỏi
              </ActionButton>
            </div>
          </div>
        ) : (
          <>
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
                <p className="text-sm text-fg-secondary">{ketQua.dienGiai}</p>

                {/* key theo CHỈ SỐ, không theo nội dung: hai cảnh báo trùng chữ là một ca
                    có thật (model lặp lại một câu), và trùng khoá thì React bỏ mất một cái. */}
                {ketQua.canhBao.map((c, i) => (
                  <p key={i} className="mt-2 text-sm text-fg-secondary">
                    ⚠ {c}
                  </p>
                ))}

                {/* Nguồn + link + ngày tra nằm TRÊN ba nút, không dưới: sheet này bảo
                    người dùng "kiểm nguồn kỹ hơn" thì phải đưa được cái link ra trước khi
                    họ chọn, chứ không phải sau. */}
                <p className="mt-3 text-sm text-fg-secondary">
                  Nguồn: {ketQua.nguon.ten}
                  {ketQua.nguon.nam !== null && ` ${ketQua.nguon.nam}`}
                </p>
                <p className="mt-1 break-all text-2xs text-fg-muted">
                  <LinkNguon url={ketQua.nguon.url} />
                </p>
                <p className="mt-1 text-2xs text-fg-muted">Ngày tra: {toISODate(ngayTra)}</p>

                {dangCheSo && (
                  <p className="mt-3 text-sm text-fg-secondary">
                    Đang bật chế độ riêng tư nên ba mức bị che. Bật lại số để chọn.
                  </p>
                )}

                <div className="mt-3 space-y-1">
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
                      onClick={() => onChon(minor, ghiChuTu(ketQua, minor, ngayTra))}
                      className="flex min-h-9 w-full items-center justify-between rounded-md border border-border-strong px-2.5 py-1 text-sm text-fg-primary transition hover:bg-surface-sunken active:scale-95"
                    >
                      <span>{ten}</span>
                      <Money amount={minor} currency={tien} />
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-4 flex justify-end">
              <ActionButton onClick={onDong}>Bỏ qua</ActionButton>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
