// Đổi TIỀN HIỂN THỊ của bản nháp, trọn vẹn — nhóm ¥/$/₫ ở hàng 5 của bản vẽ gọi đây.
//
// VÌ SAO CÓ FILE THỨ HAI, khi `setDraftCurrency` (draft.ts) đã làm phần lớn việc:
// `draft.ts` thuần và KHÔNG được biết tỷ giá hôm nay, nên nó cố ý bỏ lại `startingAssetsMinor`
// (xem JSDoc của nó) và giao việc quy đổi cho "chỗ gọi". Trước bản này chỗ gọi đó là hai
// sheet đã nghỉ, nên trách nhiệm ấy không còn ai nhận — `setDraftCurrency` có ba test và
// KHÔNG chỗ nào gọi. Chỗ nhận nó phải là một hàm THUẦN có test, không phải mấy dòng nằm
// trong một onClick: bậc thập phân là chỗ đã sai một lần rồi (¥ 0 số lẻ, $ 2 số lẻ).
import { setDraftCurrency, type ScenarioDraft } from './draft'
import { convertMinorToday, type FxOf } from './fxModel'
import type { CurrencyCode } from '../../lib/currencies'

/**
 * Neo về bản ĐÃ LƯU — hai trường của kịch bản trên đĩa, không phải của bản nháp.
 *
 * Vì sao cần: đổi đơn vị là hai phép làm tròn, nên bấm ₫ rồi bấm ¥ lại KHÔNG trả về đúng
 * con số ban đầu. Đo trên app 2026-09-10: dòng "đang đổi" ghi
 * `tài sản khởi điểm 163万 → 163万 · cuối đời 1.4億 → 1.4億 (−2)` — một thay đổi đọc ra
 * là không có thay đổi, và một bản nháp "bẩn" đòi Lưu trong khi người dùng chỉ vừa xem
 * thử rồi bấm về.
 *
 * Luật hẹp và giải thích được: đích TRÙNG đơn vị đã lưu thì lấy lại đúng số đã lưu, vì
 * đó chính là con số mà cột này đang giữ ở đơn vị đó. Ngoài trường hợp ấy thì quy đổi
 * bình thường — kể cả khi người dùng đã tự sửa tài sản khởi điểm: gỡ nhiễu làm tròn
 * không được phép nuốt một thay đổi thật.
 */
export interface SavedAnchor {
  currency: CurrencyCode
  startingAssetsMinor: number
}

/**
 * Bản nháp sau khi đổi tiền hiển thị sang `next`, hoặc `null` khi THIẾU tỷ giá.
 *
 * `null` chứ không phải "đổi đơn vị mà giữ nguyên số": cột `starting_assets_minor` lưu
 * THEO tiền hiển thị, nên đổi nhãn mà không đổi số là biến ¥14.200.000 thành $14.200.000
 * — sai 150 lần ngay tại điểm khởi đầu của cả bản chiếu. Quy ước `hasMissingRate` của
 * repo (69 file): thiếu thì loại ra và nói thẳng, không bao giờ quy 1:1. Chỗ gọi vô hiệu
 * hoá đúng cái chip đó kèm lý do.
 *
 * Trả về CHÍNH `draft` khi `next` là đơn vị đang dùng — để chỗ gọi so bằng `===` mà biết
 * có gì đổi hay không, giống `setDraftCurrency`.
 */
export function changeDisplayCurrency(
  draft: ScenarioDraft,
  next: CurrencyCode,
  fxOf: FxOf,
  saved?: SavedAnchor,
): ScenarioDraft | null {
  if (draft.displayCurrency === next) return draft

  // Quy đổi TRƯỚC khi gọi `setDraftCurrency`: nếu thiếu tỷ giá thì không có nửa việc nào
  // được làm cả. Đổi đơn vị rồi mới phát hiện không quy đổi được là để lại một bản nháp
  // mang nhãn mới với con số cũ — đúng cái sai mà hàm này tồn tại để chặn.
  const converted = convertMinorToday(
    draft.startingAssetsMinor,
    draft.displayCurrency,
    next,
    fxOf,
  )
  if (converted === null) return null

  // Về ĐÚNG đơn vị đã lưu, VÀ con số đang giữ vẫn đúng là số đã lưu quy sang đơn vị
  // hiện tại — tức chưa ai sửa nó, chênh lệch duy nhất là nhiễu làm tròn. Chỉ khi đó mới
  // lấy lại số đã lưu. Điều kiện thứ hai là phần quan trọng: thiếu nó thì một người vừa
  // gõ tay tài sản khởi điểm rồi bấm $ bấm ¥ để xem thử sẽ mất luôn con số vừa gõ, lặng
  // lẽ (có phép kiểm riêng cho đúng ca này).
  const assets = veLaiSoDaLuu(draft, next, fxOf, saved) ? saved.startingAssetsMinor : converted

  return { ...setDraftCurrency(draft, next), startingAssetsMinor: assets }
}

/**
 * Đích có phải là "về chỗ cũ" không — và con số đang giữ có còn là số đã lưu không.
 *
 * `saved is SavedAnchor` để chỗ gọi đọc `saved.startingAssetsMinor` mà không phải khai
 * lại `saved !== undefined`.
 */
function veLaiSoDaLuu(
  draft: ScenarioDraft,
  next: CurrencyCode,
  fxOf: FxOf,
  saved: SavedAnchor | undefined,
): saved is SavedAnchor {
  if (saved === undefined || next !== saved.currency) return false
  // Số đã lưu, quy sang đơn vị NHÁP ĐANG DÙNG. Bằng số nháp đang giữ = chưa ai sửa.
  const chieuDi = convertMinorToday(
    saved.startingAssetsMinor,
    saved.currency,
    draft.displayCurrency,
    fxOf,
  )
  return chieuDi !== null && chieuDi === draft.startingAssetsMinor
}
