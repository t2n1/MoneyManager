// Một `DraftChange` → một mẩu chữ. Không JSX, nhưng cũng không thuần: số tiền phải đi
// qua `formatCompact` (biết bậc thập phân của từng loại tiền, và tôn trọng chế độ riêng
// tư), thứ mà `draft.ts` cố ý không được biết tới.
//
// VÌ SAO ĐỨNG RIÊNG: hai chỗ đọc cùng danh sách này — thanh nháp đầu trang
// (`DraftBanner`) và dòng tóm tắt ở chân trình sửa kịch bản. Hai bản chép tay là cách
// chúng trôi lệch nhau, và lúc đó cùng một cú vặn sẽ được mô tả bằng hai câu khác nhau
// ở hai chỗ cách nhau 20 pixel.
import type { CurrencyCode } from '../../lib/currencies'
import { formatCompact } from '../../lib/money'
import type { DraftChange } from './draft'

/**
 * Tên chặng đi kèm thu/chi vì trình sửa kịch bản đổi được thu/chi của MỌI chặng — bản
 * vẽ ghi "thu 680万→320万" trần vì lúc vẽ chỉ có chặng đang chạy vặn được, còn ở đây
 * "thu 680万→320万" không nói cho người dùng biết họ vừa sửa chặng nào.
 */
export function describeChange(c: DraftChange, currency: CurrencyCode): string {
  switch (c.kind) {
    case 'name':
      return `đổi tên "${c.from}" → "${c.to}"`
    case 'currency':
      return `tiền hiển thị ${c.from} → ${c.to}`
    case 'startingAssets':
      return `tài sản khởi điểm ${formatCompact(c.fromMinor, c.fromCurrency)} → ${formatCompact(c.toMinor, c.toCurrency)}`
    case 'income':
      return `thu "${c.label}" ${formatCompact(c.fromMinor, c.currency)} → ${formatCompact(c.toMinor, c.currency)}`
    case 'expense':
      return `chi "${c.label}" ${formatCompact(c.fromMinor, c.currency)} → ${formatCompact(c.toMinor, c.currency)}`
    case 'return':
      return `lợi suất ${c.fromBps / 100}% → ${c.toBps / 100}%`
    case 'bandSpread':
      return `dải dao động ±${c.fromBps / 100}% → ±${c.toBps / 100}%`
    case 'endAge':
      return `chiếu đến tuổi ${c.from} → ${c.to}`
    case 'phaseYear':
      return `"${c.label}" dời ${c.from} → ${c.to}`
    case 'phaseLabel':
      return `đổi tên chặng "${c.from}" → "${c.to}"`
    case 'phaseCurrency':
      return `"${c.label}" tính bằng ${c.from} → ${c.to}`
    case 'phaseFx':
      return `tỷ giá của "${c.label}" ${c.from} → ${c.to}`
    case 'phaseCountry':
      return `quốc gia của "${c.label}" → ${c.to ?? 'để trống'}`
    case 'phasesAdded':
      return `thêm ${c.count} chặng`
    case 'phasesRemoved':
      return `bớt ${c.count} chặng`
    case 'eventsAdded':
      return `thêm ${c.count} mốc`
    case 'eventsRemoved':
      return `bớt ${c.count} mốc`
    case 'eventsEdited':
      return `sửa ${c.count} mốc`
    default:
      // `currency` chỉ dùng ở mẩu "cuối đời" bên dưới; giữ tham số để chữ ký ổn định
      // nếu sau này có loại thay đổi tính theo tiền HIỂN THỊ chứ không theo tiền dòng.
      return String(currency)
  }
}

/**
 * Cả danh sách thành các mẩu chữ, kèm mẩu CUỐI CÙNG là hiệu tài sản cuối đời.
 *
 * Hiệu cuối đời đứng cuối vì nó là HỆ QUẢ, không phải một thay đổi người dùng vừa làm —
 * nhưng nó cũng là câu duy nhất trả lời "vặn thế này thì được gì". Hai bên `null` (một
 * bản chiếu chưa ra được năm nào) thì bỏ hẳn mẩu này thay vì viết "0".
 *
 * Chỗ gọi truyền `endBeforeMinor: null` khi hai bản chiếu KHÔNG so được — cụ thể là khi
 * bản nháp vừa đổi tiền hiển thị. Lúc đó "3M → 299M (+296M)" là so một con số tính bằng
 * yên với một con số tính bằng đô: nó không nói người dùng giàu thêm, nó chỉ nói tỷ giá.
 */
export function changeParts(
  changes: DraftChange[],
  currency: CurrencyCode,
  endBeforeMinor: number | null,
  endAfterMinor: number | null,
): string[] {
  const parts = changes.map((c) => describeChange(c, currency))
  if (endBeforeMinor !== null && endAfterMinor !== null && endBeforeMinor !== endAfterMinor) {
    const d = endAfterMinor - endBeforeMinor
    parts.push(
      `cuối đời ${formatCompact(endBeforeMinor, currency)} → ${formatCompact(endAfterMinor, currency)} (${d >= 0 ? '+' : '−'}${formatCompact(Math.abs(d), currency)})`,
    )
  }
  return parts
}
