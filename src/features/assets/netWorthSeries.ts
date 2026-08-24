// Chuỗi tài sản ròng đưa lên trục thời gian: cắt theo khoảng đang chọn, và LOẠI những
// mốc nghi sai quy đổi trước khi vẽ. Thuần, không React.
//
// ---- Vì sao phải loại, và loại theo luật nào ---------------------------------------
//
// Ảnh chụp tài sản ròng ghi mỗi lần mở app (NetWorthHistorySection), và nó chỉ ghi khi
// `netWorthReliable` — tức lúc ghi KHÔNG thiếu tỷ giá. Nhưng "không thiếu" chỉ nói tỷ
// giá CÓ, không nói nó ĐÚNG: một lượt open.er-api.com trả sai (hoặc cache 12h giữ lại
// một con số méo) là vài mốc liên tiếp bị nhân/chia sai một cỡ, rồi tự về lại bình
// thường ở lượt sau. Trên trục 23 tháng, ba mốc như vậy kéo cả trục dãn ra đến mức
// đoạn còn lại thành một đường phẳng — biểu đồ mất hẳn tác dụng vì ba con số rác.
//
// Luật ở đây cố ý HẸP, để không bao giờ ăn vào biến động thật:
//
//   Một ĐOẠN LIÊN TIẾP [i..j] bị loại khi cả ba điều cùng đúng:
//     1. mọi mốc trong đoạn lệch ≥ NGUONG lần so với mốc ngay TRƯỚC đoạn *và* mốc ngay
//        SAU đoạn (cùng chiều — cả đoạn cao hơn cả hai, hoặc cả đoạn thấp hơn cả hai);
//     2. hai mốc kẹp hai đầu xấp xỉ nhau (trong TRO_LAI lần) — tức chuỗi ĐÃ TRỞ VỀ,
//        nên đoạn giữa là một cú nhảy rồi rơi, không phải một bậc thang thật;
//     3. đoạn ngắn — tối đa TRAN_DAI mốc.
//
// Điều 2 là điều quan trọng nhất. Một cú tăng thật (bán nhà, nhận thưởng) đi lên rồi
// Ở LẠI: mốc sau đoạn cũng cao, nên điều 1 tự hỏng và không có gì bị loại. Chỉ hình
// "nhảy lên rồi rơi về đúng chỗ cũ" mới khớp — mà đó là hình của một lỗi quy đổi, không
// phải hình của tiền.
//
// Điều 3 chặn ca xấu nhất: nếu tỷ giá méo suốt nhiều tháng thì đoạn đó là hiện trạng
// của sổ, không phải nhiễu; loại nó đi là xoá lịch sử. Thà vẽ ra một trục xấu còn hơn
// im lặng bỏ mất một phần ba dữ liệu.
import type { NetWorthSnapshotRow } from '../../types/database.types'

/** Lệch bao nhiêu lần thì coi là nghi vấn. 3× — dưới mức đó là biến động sổ bình thường. */
const NGUONG = 3
/** Hai mốc kẹp hai đầu được coi là "đã trở về" khi lệch nhau dưới mức này. */
const TRO_LAI = 2
/** Đoạn dài nhất được phép loại. */
const TRAN_DAI = 5

export interface NetWorthPoint {
  /** ISO 'YYYY-MM-DD'. */
  dateISO: string
  /** base minor. */
  value: number
}

export interface DroppedRun {
  count: number
  fromISO: string
  toISO: string
}

export interface NetWorthSeries {
  /** Mốc đã cắt theo khoảng và đã loại đoạn nghi vấn, cũ → mới. */
  points: NetWorthPoint[]
  /** Các đoạn bị loại (thường 0 hoặc 1) — UI in ra để không loại trong im lặng. */
  dropped: DroppedRun[]
  /** Hiệu mốc cuối − mốc đầu của `points`; null khi chưa đủ hai mốc. */
  delta: number | null
  /** % thay đổi; null khi chưa đủ hai mốc hoặc mốc đầu ≤ 0 (phần trăm vô nghĩa). */
  deltaPct: number | null
}

/** |a/b| lớn hơn hay bằng `lan` lần? Số 0 coi như lệch vô hạn nếu vế kia khác 0. */
function lechIt(a: number, b: number, lan: number): boolean {
  const x = Math.abs(a)
  const y = Math.abs(b)
  if (x === 0 && y === 0) return true
  if (x === 0 || y === 0) return false
  return Math.max(x / y, y / x) < lan
}

/**
 * Chuỗi để vẽ.
 *
 * `startISO` = null nghĩa là không cắt. Cắt TRƯỚC khi lọc nhiễu (không phải sau): luật
 * lọc đọc hai mốc kẹp hai đầu đoạn, mà nếu lọc trên cả sổ rồi mới cắt thì một đoạn nằm
 * sát mép trái của khoảng sẽ được kẹp bởi một mốc NGOÀI khoảng — người dùng thấy nó bị
 * loại mà không thấy căn cứ.
 */
export function netWorthSeries(
  snapshots: Pick<NetWorthSnapshotRow, 'snapshot_on' | 'net_worth'>[],
  startISO: string | null,
): NetWorthSeries {
  const raw: NetWorthPoint[] = snapshots
    .filter((s) => startISO == null || s.snapshot_on >= startISO)
    .map((s) => ({ dateISO: s.snapshot_on, value: s.net_worth }))
    .sort((a, b) => a.dateISO.localeCompare(b.dateISO))

  const { points, dropped } = locNhieu(raw)
  const first = points[0]?.value
  const last = points[points.length - 1]?.value
  const delta = points.length >= 2 ? last - first : null
  const deltaPct = delta != null && first > 0 ? (delta / first) * 100 : null
  return { points, dropped, delta, deltaPct }
}

function locNhieu(raw: NetWorthPoint[]): { points: NetWorthPoint[]; dropped: DroppedRun[] } {
  // Cần ít nhất một mốc kẹp mỗi bên → chuỗi dưới 3 mốc không có gì loại được.
  if (raw.length < 3) return { points: raw, dropped: [] }

  const bo = new Array<boolean>(raw.length).fill(false)
  const dropped: DroppedRun[] = []

  for (let i = 1; i < raw.length - 1; i++) {
    if (bo[i]) continue
    const truoc = raw[i - 1].value
    // Thử mọi độ dài đoạn từ 1 tới TRAN_DAI, lấy đoạn DÀI NHẤT khớp: đoạn ngắn hơn
    // trong cùng một cú nhảy sẽ có mốc "sau" nằm ngay trong chính cú nhảy đó, nên nó
    // không khớp điều 1 — nhưng đi từ ngắn lên vẫn có thể dừng sớm ở một ca biên.
    let khop = -1
    for (let dai = 1; dai <= TRAN_DAI; dai++) {
      const j = i + dai - 1
      if (j >= raw.length - 1) break
      const sau = raw[j + 1].value
      if (!lechIt(truoc, sau, TRO_LAI)) continue
      let deu = true
      let chieu = 0
      for (let k = i; k <= j; k++) {
        const v = raw[k].value
        const caoHon = Math.abs(v) >= Math.abs(truoc) * NGUONG && Math.abs(v) >= Math.abs(sau) * NGUONG
        const thapHon =
          Math.abs(truoc) >= Math.abs(v) * NGUONG && Math.abs(sau) >= Math.abs(v) * NGUONG
        const c = caoHon ? 1 : thapHon ? -1 : 0
        if (c === 0 || (chieu !== 0 && c !== chieu)) {
          deu = false
          break
        }
        chieu = c
      }
      if (deu) khop = j
    }
    if (khop < 0) continue
    for (let k = i; k <= khop; k++) bo[k] = true
    dropped.push({ count: khop - i + 1, fromISO: raw[i].dateISO, toISO: raw[khop].dateISO })
    i = khop
  }

  return { points: raw.filter((_, i) => !bo[i]), dropped }
}
