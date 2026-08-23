// Dải NHÃN dưới biểu đồ "Chi từng ngày" — thuần, không phụ thuộc React (B44).
//
// Vì sao thẻ này cần nhãn chứ không cần danh mục: câu "vì sao ngày 09–11 vọt lên" thì
// danh mục KHÔNG trả lời được. Một chuyến Osaka nằm rải ở vé, khách sạn, quà, taxi —
// bốn danh mục, và không hạn mức danh mục nào chặn được cả chuyến (đúng lý lẽ mở đầu
// `tags/budget.ts`). Nhãn thì gom đúng cụm ngày ấy lại thành một hàng.
//
// LUẬT CHẶN của file này (B44.1): các hàng nhãn KHÔNG bao giờ được xếp chồng vào cột
// của biểu đồ. Một giao dịch mang được nhiều nhãn (`#Osaka` ∩ `#Người yêu` là ca thật),
// nên tổng các hàng LỚN HƠN tổng chi — `tags/aggregate.ts` cấm vẽ biểu đồ giả vờ chúng
// cộng lại thành 100%. Chồng vào cột là đếm khoản giao nhau hai lần. Dải riêng, cùng
// trục ngày, thì hàng chồng nhau lại là đúng sự thật.
//
// Vì thế hàm này trả về CẢ HAI con số — `taggedTotal` (mỗi giao dịch một lần) và
// `rowsTotal` (các hàng cộng lại) — để nơi hiển thị in được cả hai kèm câu giải thích
// khoảng lệch (B44.2). In một số mà giấu số kia là để người đọc tự phát hiện ra "lỗi
// tính" không có thật.
import type { CurrencyCode } from '../../lib/money'
import { convertToBase, type Rates } from '../../lib/rates'
import type { TagGroupRow, TagRow, TagSpendRow } from '../../types/database.types'
import type { CurrencyOf, TransferIds } from './aggregate'
import type { DaySpend } from './dailySpike'

/** Một nhãn = một HÀNG, ô vuông rời theo ngày (B44.3/B44.4). */
export interface TagDayRow {
  tagId: string
  name: string
  color: string
  /** base minor cho từng ngày, THẲNG chỉ số với `days` truyền vào; 0 = ngày đó không có. */
  cells: number[]
  /** tổng của nhãn này trong khoảng đang vẽ */
  total: number
  /** ngày đầu và ngày cuối có ô — nguồn của câu "Osaka 09–11" ở kết luận */
  firstISO: string | null
  lastISO: string | null
}

/** Nhóm là TIÊU ĐỀ, nhãn là hàng (bản chốt `41a`, xem B44.4). */
export interface TagDayGroup {
  /** null = mục "Khác" (nhãn chưa xếp nhóm, hoặc trỏ tới nhóm đã xoá). */
  groupId: string | null
  title: string
  rows: TagDayRow[]
}

export interface DayTagCells {
  /** Nhóm rỗng KHÔNG có mặt — không vẽ tiêu đề cho một nhóm không có hàng nào (B44.5). */
  groups: TagDayGroup[]
  /** Số nhãn bị cắt khỏi `groups` vì trần 6 hàng. */
  hidden: number
  /** Tổng chi của những giao dịch CÓ nhãn — mỗi giao dịch đếm ĐÚNG MỘT LẦN. */
  taggedTotal: number
  /** Số giao dịch CÓ nhãn. Trừ khỏi `DailySpendSeries.txCount` ra số chưa gắn nhãn (B47.4). */
  taggedCount: number
  /** Tổng các hàng cộng lại. ≥ `taggedTotal`; chênh lệch = phần mang nhiều nhãn cùng lúc. */
  rowsTotal: number
  hasMissingRate: boolean
}

/**
 * Trần số HÀNG của cả khối, không phải của từng nhóm.
 *
 * Khối này ngồi dưới một biểu đồ cao 176px; 6 hàng × 18px là vừa hết khoảng còn lại mà
 * không đẩy "Giao dịch gần đây" xuống dưới màn. Đếm theo cả khối chứ không theo nhóm vì
 * người dùng chốt chỉ dùng 2 nhóm (xem `collapsedLimit` ở tags/groups.ts) — chia 3 hàng
 * cho mỗi nhóm sẽ cắt mất nhãn to của nhóm này để giữ nhãn bé của nhóm kia.
 */
const MAX_ROWS = 6

/** Nhãn chưa xếp nhóm và nhãn trỏ tới nhóm đã xoá đều rơi về mục "Khác" — cùng ba nơi khác. */
const OTHER = '__other__'

export interface DayTagCellsInput {
  /** Đúng mảng `days` của `dailySpendSeries` — `cells` thẳng chỉ số với nó. */
  days: readonly DaySpend[]
  rows: readonly TagSpendRow[]
  tags: readonly TagRow[]
  groups: readonly TagGroupRow[]
  currencyOf: CurrencyOf
  base: CurrencyCode
  rates: Rates
  /**
   * `getTagSpend()` lọc `type='expense'` + bỏ `is_debt_flow`/`exclude_from_stats` ngay ở
   * truy vấn, nhưng KHÔNG bỏ danh mục `kind='transfer'` — khác `tagBreakdown`. Lọc ở đây
   * để dải nhãn và cột biểu đồ đếm cùng một rổ.
   */
  transferIds: TransferIds
  /** Danh mục bị công tắc "bỏ khoản cố định" loại ra — cùng tập truyền cho `dailySpendSeries`. */
  excludeCategoryIds?: ReadonlySet<string>
}

/**
 * Ô vuông theo ngày cho từng nhãn, cùng trục ngày với biểu đồ.
 *
 * Hoàn tiền mang dấu ÂM (cùng `spendSign` của tags/budget.ts), nên một nhãn có thể có ô
 * âm — nơi hiển thị vẽ ô đó bằng màu `money-in`, không phải bỏ đi.
 *
 * Thiếu tỷ giá thì LOẠI khoản đó và bật cờ, không bao giờ quy 1:1 — quy ước toàn repo.
 */
export function dayTagCells({
  days,
  rows,
  tags,
  groups,
  currencyOf,
  base,
  rates,
  transferIds,
  excludeCategoryIds = new Set(),
}: DayTagCellsInput): DayTagCells {
  const indexOf = new Map(days.map((d, i) => [d.date, i]))
  const tagById = new Map(tags.map((t) => [t.id, t]))

  const sums = new Map<string, number[]>()
  // Một giao dịch mang hai nhãn ra HAI dòng `TagSpendRow`; `taggedTotal` phải đếm nó một
  // lần, nên phải nhớ đã gặp transaction_id nào rồi. Cặp (tag, transaction) thì ngược
  // lại — dữ liệu lỗi có thể lặp, và ở đó lặp là đếm đúp thật.
  const seenPair = new Set<string>()
  const seenTx = new Set<string>()
  let taggedTotal = 0
  let hasMissingRate = false

  for (const r of rows) {
    const i = indexOf.get(r.occurred_on)
    if (i === undefined) continue
    if (r.category_id !== null && transferIds.has(r.category_id)) continue
    if (r.category_id !== null && excludeCategoryIds.has(r.category_id)) continue
    if (!tagById.has(r.tag_id)) continue

    const pair = `${r.tag_id}\0${r.transaction_id}`
    if (seenPair.has(pair)) continue
    seenPair.add(pair)

    const raw = convertToBase(r.amount, currencyOf(r.account_id), base, rates)
    if (raw === null) {
      hasMissingRate = true
      continue
    }
    const v = r.is_refund ? -raw : raw

    const cells = sums.get(r.tag_id) ?? new Array<number>(days.length).fill(0)
    cells[i] += v
    sums.set(r.tag_id, cells)

    if (!seenTx.has(r.transaction_id)) {
      seenTx.add(r.transaction_id)
      taggedTotal += v
    }
  }

  const all: TagDayRow[] = [...sums.entries()]
    .map(([tagId, cells]): TagDayRow => {
      const tag = tagById.get(tagId)!
      const hit = cells.map((v, i) => (v !== 0 ? i : -1)).filter((i) => i >= 0)
      return {
        tagId,
        name: tag.name,
        color: tag.color,
        cells,
        total: cells.reduce((s, v) => s + v, 0),
        firstISO: hit.length > 0 ? days[hit[0]].date : null,
        lastISO: hit.length > 0 ? days[hit[hit.length - 1]].date : null,
      }
    })
    // Nhãn không có ngày nào trong khoảng đang vẽ thì không có hàng — một hàng trống
    // chiếm đúng chỗ của một hàng có nội dung mà không nói được gì.
    .filter((r) => r.total !== 0)
    .sort((a, b) => b.total - a.total)

  const shown = all.slice(0, MAX_ROWS)
  // `rowsTotal` đếm những hàng ĐANG HIỆN, không phải mọi nhãn: câu giải thích khoảng lệch
  // ở chân khối nói về mấy hàng người đọc nhìn thấy, cộng cả hàng đã cắt vào thì con số
  // đó không cộng ra được từ màn hình.
  const rowsTotal = shown.reduce((s, r) => s + r.total, 0)

  // Thứ tự nhóm = thứ tự `groups` (repo đã sắp `sort_order`), "Khác" ở cuối — cùng quy ước
  // `pickerSections`. Không gọi thẳng hàm đó: nó xếp hạng nhãn TRONG nhóm theo mức dùng,
  // còn ở đây thứ tự trong nhóm phải theo TIỀN (hàng to nằm trên). Hai luật khác nhau,
  // dùng chung một hàm là ép một trong hai đi sai.
  const known = new Set(groups.map((g) => g.id))
  const groupIdOf = (tagId: string): string => {
    const g = tagById.get(tagId)?.group_id
    return g && known.has(g) ? g : OTHER
  }
  const order: { id: string | null; key: string; title: string }[] = [
    ...groups.map((g) => ({ id: g.id, key: g.id, title: g.name })),
    { id: null, key: OTHER, title: 'Khác' },
  ]

  const out: TagDayGroup[] = []
  for (const g of order) {
    const rowsOfGroup = shown.filter((r) => groupIdOf(r.tagId) === g.key)
    if (rowsOfGroup.length === 0) continue
    out.push({ groupId: g.id, title: g.title, rows: rowsOfGroup })
  }

  return {
    groups: out,
    hidden: all.length - shown.length,
    taggedTotal,
    taggedCount: seenTx.size,
    rowsTotal,
    hasMissingRate,
  }
}
