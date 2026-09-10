// Màu của một đối tượng trong KẾ HOẠCH (mốc cuộc đời · chặng đời) — THUẦN, không React,
// không JSX. Hai hàm, hai loại, cùng một bảng bảy màu và cùng một luật "khoá màu riêng
// thắng, không có thì rơi về mặc định của loại".
//
// VÌ SAO CÓ FILE NÀY (phát hiện review cuối nhánh 2026-09-09, Finding 6). Cùng một phép
// "màu riêng của mốc thắng màu theo Thu/Chi" từng nằm ở BA chỗ:
//   · `EventPins.tsx` — icon mốc và thanh độ dài của nó;
//   · `TimelinePlot.tsx` — vạch mốc dọc trong SVG, một bản chép từng ký tự (lớp đó đã bỏ
//     hẳn ngày 2026-09-10, xem `EventPins.tsx`);
//   · `QuickAddBoard.tsx` — chip mẫu, và lời ghi của nó tự thú là chép từ `EventPins`.
// Ba bản ĐÃ LỆCH: hai lớp KỀ NHAU của cùng một đồ thị chạy hai cặp độ mờ khác nhau
// (0,45 / 0,2 ở thanh độ dài, 0,5 / 0,22 ở vạch dọc) — không ai chọn thế, nó chỉ trôi ra.
//
// CẶP ĐỘ MỜ ĐÃ CHỌN: 0,45 khi mốc đang bật · 0,2 khi mốc tắt tạm (migration 0063), tức
// cặp THẤP hơn trong hai cặp. Lý do khi chọn: vạch mốc dọc chạy suốt chiều cao vùng vẽ và
// CẮT QUA đường tài sản — thứ người dùng tới đây để đọc — nên chọn cặp làm nó bớt tranh chỗ
// với dữ liệu.
//
// VẠCH DỌC ĐÓ KHÔNG CÒN (2026-09-10): người dùng chọn kiểu "ghim cắm trục", trong đó chỗ
// của vạch suốt chiều cao là một CUỐNG ngắn dưới ghim cộng một VẠCH ĐẶC ở chân vùng vẽ —
// xem đầu `EventPins.tsx`. Cặp 0,45 / 0,2 vẫn giữ nguyên con số và nay là cặp của NÉT MẢNH
// (cuống ghim). Giữ chứ không chỉnh lại: nó đang đúng cho một nét 1px trên nền đồ thị, và
// đổi số ở đây là đổi luôn chip mẫu ở `QuickAddBoard` — chỗ chẳng liên quan gì tới quyết
// định trên.
//
// BA ĐỘ MỜ, MỘT MỐC. Từ bản 2026-09-10 một mốc có ba loại dấu, ba loại dày mỏng khác nhau,
// nên chúng KHÔNG dùng chung một con số — và cả ba đều trả về từ `eventTint` để không chỗ
// nào phải tự đoán lấy một số thứ tư:
//   · `opacity` — NÉT MẢNH (cuống ghim 1px);
//   · `spanOpacity` — KHỐI (viên nang khoảng năm, dày 10px);
//   · `anchorOpacity` — NEO (vạch chân trục, đặc).
import { TAG_COLOR_KEYS, TAG_HEX, tagColor, type TagColorKey } from '../tags/colors'

/** Độ mờ của NÉT MẢNH (cuống ghim). Xem đoạn "CẶP ĐỘ MỜ ĐÃ CHỌN" ở đầu file. */
export const EVENT_TINT_OPACITY = { on: 0.45, off: 0.2 } as const

/**
 * Độ mờ của VIÊN NANG khoảng năm — thấp hơn `EVENT_TINT_OPACITY` vì nó là KHỐI.
 *
 * Cùng một độ mờ cho một nét 1px và cho một khối dày 10px thì ra hai thứ khác nhau hẳn:
 * 0,45 trên khối cho một thanh gần như đặc, đè lên cả dải lạc quan–bi quan (0,13) và vùng
 * chặng (đỉnh 0,3) nằm dưới nó. 0,22 giữ đúng việc mà thanh này phải làm — nói "mốc kéo dài
 * từ đây tới đây" — mà không thành lớp tô thứ tư tranh chỗ với ba lớp đã có.
 */
export const EVENT_SPAN_OPACITY = { on: 0.22, off: 0.1 } as const

/**
 * Độ mờ của NEO: vạch 2×8px ở chân vùng vẽ, đúng năm bắt đầu của mốc.
 *
 * ĐẶC (1,0) chứ không mờ, và đây là chỗ duy nhất trong bộ dấu của mốc được đặc: sau khi bỏ
 * vạch gạch dọc suốt chiều cao, nó là thứ DUY NHẤT nói chính xác "năm nào" — 8 pixel mà còn
 * mờ nữa thì không đọc được, nhất là khi nó nằm trên vùng màu chặng ở chân đồ thị. Mốc đang
 * TẮT hạ xuống 0,35 (chứ không 0,2 như nét mảnh): vẫn phải thấy được rằng có một mốc để
 * ngoài ở năm đó — cùng lý do đã ghi ở `EventPins` về việc không giấu hẳn mốc tắt.
 */
export const EVENT_ANCHOR_OPACITY = { on: 1, off: 0.35 } as const

export interface EventTint {
  /** Mã màu để bơm vào `stroke`/`backgroundColor`/`borderColor`. */
  color: string
  /** Độ mờ của NÉT MẢNH (cuống ghim) — chỗ nào không vẽ mờ (chip mẫu) thì bỏ qua. */
  opacity: number
  /** Độ mờ của KHỐI: viên nang khoảng năm. Xem `EVENT_SPAN_OPACITY`. */
  spanOpacity: number
  /** Độ mờ của NEO: vạch đặc ở chân vùng vẽ. Xem `EVENT_ANCHOR_OPACITY`. */
  anchorOpacity: number
  /**
   * Màu của ICON nằm TRONG cái ghim đã tô đặc — mực đục ngược ra khỏi màu mốc.
   *
   * Hai nhánh vì hai loại nền, và đây là phép đo chứ không phải khẩu vị:
   *   · Mốc CÓ khoá màu riêng → nền là một hex CỐ ĐỊNH của `TAG_HEX` (không lật theo
   *     Sáng/Tối), và với cả sáu màu đó mực gần-đen thắng mực gần-trắng: đỏ 5,3:1 (trắng
   *     3,3), vàng 10,2 (trắng 1,9 — trượt), xanh lá 5,5 (3,1), xanh dương 6,4 (2,8 —
   *     trượt), tím than 4,3 (4,2), hồng 5,1 (3,5). Xám là `--fg-muted`: 3,7:1 ở Sáng,
   *     7:1 ở Tối. Nên nhánh này dùng MỘT mực gần-đen, đúng ở cả hai chế độ.
   *   · Mốc KHÔNG có màu riêng → nền là `--money-in`/`--money-out`, mà hai token này LẬT:
   *     ở Sáng chúng là green-800/red-700 (nền TỐI, cần mực sáng), ở Tối là #5ce08a/#ff7a76
   *     (nền SÁNG, cần mực tối). Đúng một token lật đúng chiều đó: `--surface-chrome`.
   */
  ink: string
}

/**
 * Màu của một mốc: KHOÁ MÀU RIÊNG thắng (migration 0067), không có thì tô theo Thu/Chi.
 *
 * `color` là một KHOÁ trong bảng bảy màu (`features/tags/colors.ts`), không phải hex —
 * `tagColor` chịu trách nhiệm nhận cả khoá lạ/rỗng và rơi về `gray`. Rỗng/thiếu thì trả
 * token `--money-in`/`--money-out`, tức màu Thu/Chi của cả app, không phải một sắc mới.
 *
 * Tô TƯƠI (màu đặc của bảng biểu đồ) là đúng ý spec §8: mốc tươi, chặng trầm — đó là thứ
 * người dùng phân biệt hai dải chỉ bằng mắt. Chặng KHÔNG đi qua hàm này (nó dùng
 * `TAG_CHIP_CLASS` + `phaseColorKey`).
 */
export function eventTint(
  color: string | undefined,
  kind: 'income' | 'expense',
  enabled?: boolean,
): EventTint {
  const off = enabled === false
  return {
    color: color
      ? TAG_HEX[tagColor(color)]
      : kind === 'income'
        ? 'var(--money-in)'
        : 'var(--money-out)',
    ink: color ? 'var(--color-gray-950)' : 'var(--surface-chrome)',
    opacity: off ? EVENT_TINT_OPACITY.off : EVENT_TINT_OPACITY.on,
    spanOpacity: off ? EVENT_SPAN_OPACITY.off : EVENT_SPAN_OPACITY.on,
    anchorOpacity: off ? EVENT_ANCHOR_OPACITY.off : EVENT_ANCHOR_OPACITY.on,
  }
}

/**
 * Sáu khoá màu mà một chặng CHƯA CHỌN MÀU rơi về, xoay theo THỨ TỰ chặng.
 *
 * Đúng chữ trong migration 0069 ("`''` = tô theo thứ tự chặng như hiện nay") — nhờ vậy dữ
 * liệu cũ hiện ra ổn định chứ không thành một dải xám đều. Khớp số màu của `PHCOLORS` trong
 * bản vẽ; `gray` để ngoài vì nó là màu của "không màu".
 */
export const PHASE_FALLBACK_KEYS: readonly TagColorKey[] = TAG_COLOR_KEYS.filter(
  (k) => k !== 'gray',
)

/**
 * VÙNG chặng đời trên nền đồ thị (`TimelinePlot`, lớp 0): màu ĐẬM ở sát chân vùng vẽ rồi
 * TAN DẦN lên, tắt hẳn ở `PHASE_BAND_FADE` (tỷ lệ chiều cao vùng vẽ, tính từ chân).
 *
 * VÌ SAO GRADIENT chứ không phải một khối màu đều — đây là phương án người dùng chọn giữa
 * ba bản mẫu (2026-09-10). Nền đồ thị này ĐÃ có ba lớp tô: dải lạc quan–bi quan (0,13),
 * vùng âm (0,1) và các dấu mốc. Một khối màu đều chạy hết chiều cao thì đúng chỗ
 * đường tài sản chạy — thứ người dùng tới đây để đọc — lại là chỗ màu đậm nhất, tức vùng
 * chặng tranh chỗ với chính dữ liệu nó đang chú giải. Tắt dần lên thì màu nằm ở nửa dưới,
 * nơi thường trống, mà mắt vẫn đọc ra "đoạn trục này thuộc chặng nào".
 *
 * 0,3 nghe cao so với 0,13 của dải: nó là đỉnh của một gradient tan về 0, không phải độ
 * mờ của cả khối, nên diện tích đậm thật sự chỉ là một vạch mỏng ở chân. Và bảy màu chặng
 * (`TAG_HEX`) là màu ĐẶC, cần đủ đậm để phân biệt được nhau trên nền gần đen của chế độ Tối.
 */
export const PHASE_BAND_OPACITY = 0.3
/** Xem `PHASE_BAND_OPACITY`. 0,65 = gradient tắt hẳn ở khoảng hai phần ba chiều cao. */
export const PHASE_BAND_FADE = 0.65

/**
 * Khoá màu mà một chặng THẬT SỰ được vẽ bằng: khoá riêng của nó nếu có, không thì màu xoay
 * theo `index` (thứ hạng theo năm trong dải).
 *
 * VÌ SAO EXPORT (phát hiện review cuối nhánh 2026-09-09, Finding 7). Luật này từng chỉ nằm
 * trong `PhaseLane.tsx`, nên BẢNG CHỌN MÀU trong dock không biết nó: một chặng `color === ''`
 * hiện trên trục bằng một màu thật, mà ô màu trong dock lại là vòng nét đứt "không màu" và
 * không ô nào trong lưới được đánh dấu — hai chỗ nói hai điều về cùng một chặng. Bảng chọn
 * đọc hàm này để VẼ đúng thứ dải đang vẽ, còn trạng thái "chưa chọn" thì vẫn được nói ra
 * bằng nét đứt: dock không được biến một mặc định thành một lựa chọn người dùng đã làm.
 *
 * Tô TRẦM (`TAG_CHIP_CLASS`) là việc của chỗ vẽ, không phải của hàm này — spec §8.
 */
export function phaseColorKey(color: string, index: number): TagColorKey {
  if (color !== '') return tagColor(color)
  const n = PHASE_FALLBACK_KEYS.length
  return PHASE_FALLBACK_KEYS[((index % n) + n) % n]
}
