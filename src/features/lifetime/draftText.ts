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
import { tr } from '../../i18n'

/**
 * Tên chặng đi kèm thu/chi vì trình sửa kịch bản đổi được thu/chi của MỌI chặng — bản
 * vẽ ghi "thu 680万→320万" trần vì lúc vẽ chỉ có chặng đang chạy vặn được, còn ở đây
 * "thu 680万→320万" không nói cho người dùng biết họ vừa sửa chặng nào.
 */
export function describeChange(c: DraftChange, currency: CurrencyCode): string {
  switch (c.kind) {
    case 'name':
      return tr('đổi tên "{from}" → "{to}"', { from: c.from, to: c.to })
    case 'currency':
      return tr('tiền hiển thị {from} → {to}', { from: c.from, to: c.to })
    case 'startingAssets':
      return tr('tài sản khởi điểm {from} → {to}', {
        from: formatCompact(c.fromMinor, c.fromCurrency),
        to: formatCompact(c.toMinor, c.toCurrency),
      })
    case 'income':
      return tr('thu "{label}" {from} → {to}', {
        label: c.label,
        from: formatCompact(c.fromMinor, c.currency),
        to: formatCompact(c.toMinor, c.currency),
      })
    case 'expense':
      return tr('chi "{label}" {from} → {to}', {
        label: c.label,
        from: formatCompact(c.fromMinor, c.currency),
        to: formatCompact(c.toMinor, c.currency),
      })
    case 'return':
      return tr('lợi suất {from}% → {to}%', { from: c.fromBps / 100, to: c.toBps / 100 })
    case 'bandSpread':
      return tr('dải dao động ±{from}% → ±{to}%', { from: c.fromBps / 100, to: c.toBps / 100 })
    case 'endAge':
      return tr('chiếu đến tuổi {from} → {to}', { from: c.from, to: c.to })
    case 'phaseYear':
      return tr('"{label}" dời {from} → {to}', { label: c.label, from: c.from, to: c.to })
    case 'phaseLabel':
      return tr('đổi tên chặng "{from}" → "{to}"', { from: c.from, to: c.to })
    case 'phaseCurrency':
      return tr('"{label}" tính bằng {from} → {to}', { label: c.label, from: c.from, to: c.to })
    case 'phaseFx':
      return tr('tỷ giá của "{label}" {from} → {to}', { label: c.label, from: c.from, to: c.to })
    case 'phaseCountry':
      return tr('quốc gia của "{label}" → {to}', { label: c.label, to: c.to ?? tr('để trống') })
    case 'phaseLook':
      return tr('đổi màu/icon chặng "{label}"', { label: c.label })
    case 'phasePct': {
      const noi = (v: number | null) => (v === null ? tr('số tự khai') : tr('{pct}% chặng trước', { pct: v }))
      const vars = { label: c.label, from: noi(c.from), to: noi(c.to) }
      return c.field === 'income'
        ? tr('thu của "{label}" {from} → {to}', vars)
        : tr('chi của "{label}" {from} → {to}', vars)
    }
    case 'phasesAdded':
      return tr('thêm {n} chặng', { n: c.count })
    case 'phasesRemoved':
      return tr('bớt {n} chặng', { n: c.count })
    case 'eventsAdded':
      return tr('thêm {n} mốc', { n: c.count })
    case 'eventsRemoved':
      return tr('bớt {n} mốc', { n: c.count })
    case 'eventsEdited':
      return tr('sửa {n} mốc', { n: c.count })
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
      tr('cuối đời {from} → {to} ({delta})', {
        from: formatCompact(endBeforeMinor, currency),
        to: formatCompact(endAfterMinor, currency),
        delta: `${d >= 0 ? '+' : '−'}${formatCompact(Math.abs(d), currency)}`,
      }),
    )
  }
  return parts
}
