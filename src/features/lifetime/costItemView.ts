// Bản đồ khoản lớn, cách xếp "Cả đời" — phần DÒNG: cắt bớt, ba con số dẫn xuất, và
// icon/màu của mỗi dòng. THUẦN, không React.
//
// Bản vẽ (.dc.html dòng 699-720) cho mỗi dòng bốn cột: tên + phụ đề + thanh tỉ lệ · tổng ·
// ≈/tháng · % tổng chi; mặc định 9 khoản với nút "Xem tất cả N khoản", vùng cuộn 340px.
// `lifetimeCost.ts` chỉ gộp và xếp hạng — ba con số dẫn xuất kia nằm ở đây, có test, vì cả
// ba đều có một cái bẫy: chia cho 0, mẫu số của tỉ lệ, và thanh 0px.
import { phaseForYear } from './project'
import { eventTint, phaseColorKey } from './planColors'
import { TAG_HEX } from '../tags/colors'
import type { DraftEvent, DraftPhase } from './draft'
import type { LifetimeCostItem, LifetimeCostMap } from './lifetimeCost'

/** Bản vẽ dòng 1809: `bigRaw.slice(0, 9)`. */
export const MAP_TOP_N = 9

/**
 * Sàn bề rộng thanh tỉ lệ, %. Bản vẽ dùng `Math.max(0.02, …)` — khoản nhỏ nhất bên cạnh
 * một căn nhà ra thanh 0,1px, tức KHÔNG có thanh, và một dòng thiếu thanh đọc ra là "chưa
 * tính được" chứ không phải "nhỏ".
 */
export const BAR_MIN_PCT = 2

export interface CostRowView {
  item: LifetimeCostItem
  /**
   * Trung bình mỗi tháng, rải trên QUÃNG (`endYear − startYear + 1`), không trên số năm
   * CHẠM. Một mốc mua xe lặp 2030 và 2038 chạm 2 năm nhưng trải 9 năm: chia cho 24 tháng
   * cho ra con số của người mua hai cái xe liền nhau rồi thôi, sai gấp bốn lần.
   */
  monthlyMinor: number
  /** % của tổng chi. `null` = dòng THU — nó không có phần nào trong tổng chi. */
  sharePct: number | null
  /** Bề rộng thanh tỉ lệ, % của khoản lớn nhất. Sàn `BAR_MIN_PCT`. */
  barPct: number
}

/**
 * Dòng để vẽ, đã cắt bớt.
 *
 * `hiddenCount` là số khoản BỊ GIẤU — chỗ gọi in nó ra nút "Xem tất cả N khoản". Không
 * bao giờ giấu trong im lặng: ràng buộc "không cắt bớt âm thầm" của dự án.
 */
export function costRowViews(
  map: LifetimeCostMap,
  { showAll }: { showAll: boolean },
): { rows: CostRowView[]; hiddenCount: number } {
  // Đo thanh theo khoản lớn nhất của CẢ bảng, không của phần đang hiện: gập lại rồi mở ra
  // mà mấy thanh đầu đổi bề rộng thì bảng trông như số liệu vừa đổi.
  const lonNhat = map.items.length > 0 ? Math.abs(map.items[0].totalMinor) : 0
  const shown = showAll ? map.items : map.items.slice(0, MAP_TOP_N)
  return {
    rows: shown.map((item) => {
      // Quãng tính bằng năm, tối thiểu 1: một mốc một năm vẫn phải chia cho 12 tháng.
      const quang = Math.max(1, item.endYear - item.startYear + 1)
      const lon = Math.abs(item.totalMinor)
      return {
        item,
        monthlyMinor: Math.round(lon / (quang * 12)),
        sharePct:
          item.totalMinor > 0 && map.totalSpendMinor > 0
            ? (item.totalMinor / map.totalSpendMinor) * 100
            : null,
        barPct: lonNhat > 0 ? Math.max(BAR_MIN_PCT, (lon / lonNhat) * 100) : 0,
      }
    }),
    hiddenCount: Math.max(0, map.items.length - shown.length),
  }
}

export interface CostRowLook {
  /** Khoá icon (`eventIcons.tsx`). `''` = chưa chọn, chỗ vẽ tự rơi về. */
  icon: string
  /** Mã màu bơm thẳng vào `style` — hex của bảng bảy màu, hoặc token `--money-*`. */
  color: string
  /** Thu/Chi của MỐC; `null` cho chặng (chặng không có chiều tiền). */
  kind: 'income' | 'expense' | null
}

/** Chưa nối được về đối tượng thật — xem `costRowLook`. */
const LOOK_UNKNOWN: CostRowLook = { icon: '', color: 'var(--fg-muted)', kind: null }

/**
 * Icon và màu mà một dòng được vẽ bằng — CÙNG màu mà dải chặng và chip mốc trên trục đang
 * vẽ, không phải một thang màu thứ hai cho riêng bảng này. Bản vẽ tô mỗi dòng theo màu
 * của chính chặng/mốc đó, và đó là thứ nối một dòng trong bảng với một hình trên đồ thị.
 *
 * Chặng nối qua `startYear` chứ không qua id (id của dòng chặng là tổng hợp — xem
 * `LifetimeCostItem.startYear`), và `phaseForYear` là CHÍNH hàm engine dùng để quyết chặng
 * nào phủ một năm, nên không có bản chép thứ hai của luật đó ở đây.
 *
 * Không nối được (chặng/mốc vừa bị xoá trong nháp mà bản chiếu trên màn còn là bản cũ) thì
 * trả `LOOK_UNKNOWN` — xám, không icon. Đoán một màu ở đây là gán cho dòng đó màu của một
 * chặng khác.
 */
export function costRowLook(
  item: LifetimeCostItem,
  phases: readonly DraftPhase[],
  events: readonly DraftEvent[],
): CostRowLook {
  if (item.kind === 'event') {
    const e = events.find((x) => x.id === item.id)
    if (!e) return LOOK_UNKNOWN
    return { icon: e.icon, color: eventTint(e.color, e.kind, e.enabled).color, kind: e.kind }
  }

  const sorted = [...phases].sort((a, b) => a.startYear - b.startYear)
  const p = phaseForYear(sorted, item.startYear)
  if (!p) return LOOK_UNKNOWN
  // `phaseColorKey` cần THỨ HẠNG theo năm — cùng chỉ số mà dải chặng dùng để xoay màu cho
  // chặng chưa chọn màu. Lấy từ `sorted`, không từ `phases` như chỗ gọi truyền vào.
  return {
    icon: p.icon,
    color: TAG_HEX[phaseColorKey(p.color, sorted.indexOf(p))],
    kind: null,
  }
}
