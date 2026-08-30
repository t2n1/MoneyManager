// Những phát hiện KHÁC THƯỜNG của một tháng — thuần, test được. Cùng khuôn dailyHeadline.ts.
//
// Câu tổng (`headlineOf`) trả lời "tháng này thế nào": giữ lại bao nhiêu %, hơn kém kỳ
// trước bao nhiêu. Đó là những con số ĐÃ NẰM TRÊN MÀN HÌNH ở dạng khác — người đọc cuộn
// xuống là thấy. File này lo phần còn lại: thứ nhìn màn hình KHÔNG thấy, vì nó chỉ hiện
// ra khi so tháng này với chính THÓI QUEN của người dùng ở các tháng trước.
//
// Bốn bộ dò, mỗi bộ IM LẶNG khi tháng đó bình thường. Im lặng là tính năng: một dòng
// "phát hiện" luôn có mặt sẽ dạy người đọc bỏ qua cả dòng đó, đúng như ô KPI luôn bằng 0
// đã dạy họ ở bản trước.
//
// Trả về DỮ LIỆU chứ không phải chuỗi — cùng lý do với `dailyHeadline`: mọi số tiền phải
// đi qua <Money> để ăn chế độ che số và tiền tố "≈" khi thiếu tỷ giá. Ghép sẵn thành câu
// ở đây là dựng đường thứ hai in tiền, đi vòng qua cả hai thứ đó.
import { monthKeyForDate, type MonthKey } from '../../lib/dates'
import type { CurrencyCode } from '../../lib/money'
import { convertToBase, type Rates } from '../../lib/rates'
import type { CategoryRow, TransactionRow } from '../../types/database.types'
import { expenseSign, type CurrencyOf, type TransferIds } from './aggregate'
import { median } from './insights'

export type MonthFinding =
  | {
      /** Nhóm tiêu lệch hẳn so với chính nó các tháng trước. Bộ dò đáng tin nhất. */
      kind: 'categorySpike'
      groupId: string
      name: string
      /** chi tháng này của nhóm (base minor, đã trừ hoàn tiền) */
      amount: number
      /** mức thường: trung vị các tháng trước CÓ chi nhóm này */
      usual: number
      /** amount / usual */
      ratio: number
      /** Khoản to nhất nếu nó nuốt phần lớn nhóm; null = nhóm tăng đều tay. */
      biggest: { amount: number; share: number } | null
    }
  | {
      /** Nhiều khoản lẻ dồn lại ngang một khoản cố định to. */
      kind: 'manySmall'
      groupId: string
      name: string
      amount: number
      count: number
      /** Nhóm chi cố định lớn nhất tháng — cái mốc để người đọc quy chiếu. */
      anchorName: string
      anchorAmount: number
    }
  | {
      /** Vẫn ngần ấy lần, nhưng mỗi lần đắt (hoặc rẻ) hẳn đi. */
      kind: 'pricePerVisit'
      groupId: string
      name: string
      count: number
      /** tiền mỗi lần tháng này / mức thường (base minor) */
      perNow: number
      perUsual: number
      ratio: number
    }
  | {
      /** Nhóm đúng mức thường, nhưng gần hết nằm ở một khoản duy nhất. */
      kind: 'lump'
      groupId: string
      name: string
      amount: number
      biggest: number
      share: number
    }

type Finding<K extends MonthFinding['kind']> = Extract<MonthFinding, { kind: K }>

export interface MonthStory {
  /** Tối đa `MAX_FINDINGS`, mỗi nhóm nhiều nhất một lần. Rỗng = tháng không có gì lạ. */
  findings: MonthFinding[]
  hasMissingRate: boolean
}

export interface MonthStoryInput {
  /** Giao dịch của CẢ cửa sổ, gồm cả tháng đang xem (đúng `rangeTxs` của MonthView). */
  txs: TransactionRow[]
  /** Cửa sổ tháng, cũ → mới; phần tử CUỐI là tháng đang xem. */
  months: readonly MonthKey[]
  monthStartDay: number
  categories: CategoryRow[]
  currencyOf: CurrencyOf
  base: CurrencyCode
  rates: Rates
  transferIds?: TransferIds
}

/** Hai dòng là trần: dòng thứ ba biến "phát hiện" thành một danh sách để lướt qua. */
const MAX_FINDINGS = 2
/** Gấp đôi mức thường mới gọi là lệch — dưới đó là dao động của một tháng bình thường. */
const SPIKE_RATIO = 2
/**
 * Trung vị dựng từ 2 điểm không phải "mức thường", nó là một trong hai con số đó. Ba
 * tháng là mức tối thiểu để một nhóm có thứ đáng gọi là thói quen.
 */
const MIN_HISTORY_MONTHS = 3
/** Một khoản chiếm ngần này mức chi của nhóm thì chính nó là câu chuyện, không phải nhóm. */
const LUMP_SHARE = 0.6
/** Dưới 20 lần thì "nhiều khoản lẻ" chưa phải hình dạng đáng gọi tên. */
const MANY_SMALL_COUNT = 20
/** Đủ gần khoản cố định to nhất thì phép so mới có sức nặng. */
const MANY_SMALL_SHARE = 0.7
/**
 * SÀN chung cho mọi bộ dò: nhóm phải chiếm ngần này chi của tháng thì mới được lên câu
 * tóm. Không có nó, một nhóm ¥4.130 lệch 79% vẫn thắng, và câu tóm của THÁNG đi nói về
 * 4% của tháng (đo trên dữ liệu demo, đúng chỗ dòng phát hiện duy nhất bị chiếm mất).
 * Người dùng chi vào khoảng mươi nhóm, nên dưới 8% là nhóm nhỏ hơn mức trung bình.
 */
const MIN_MONTH_SHARE = 0.08
/** Dưới 10 lần thì trung bình mỗi lần nhiễu quá, không nói lên thói quen. */
const PRICE_MIN_COUNT = 10
const PRICE_UP = 1.3
const PRICE_DOWN = 0.75

const keyOf = (k: MonthKey) => `${k.year}-${k.month}`

interface GroupMonth {
  /** chi ròng (đã trừ hoàn tiền) */
  total: number
  /** tổng các khoản DƯƠNG — mẫu số của mọi tỷ trọng "một khoản chiếm bao nhiêu" */
  gross: number
  /** số lần chi, KHÔNG đếm hoàn tiền */
  count: number
  /** khoản đơn lớn nhất */
  biggest: number
  /** khoản đơn lớn nhất đó có thuộc danh mục chi CỐ ĐỊNH không */
  biggestFixed: boolean
  /** phần chi thuộc danh mục cost_type = 'fixed' */
  fixed: number
}

const emptyMonth = (): GroupMonth => ({
  total: 0,
  gross: 0,
  count: 0,
  biggest: 0,
  biggestFixed: false,
  fixed: 0,
})

/**
 * Gom theo NHÓM CHA, không theo danh mục lá.
 *
 * Vì sao: "Cơm ngoài" 60 lần ¥28.000 không nói được điều gì, còn "Ăn uống" 72 lần
 * ¥108.102 thì nói được — và người dùng cũng nghĩ tiền của mình theo nhóm, không theo lá.
 * Luật gán cha lặp đúng `groupByParent`: có `parent_id` thì về cha, không thì tự nó là
 * một cha đứng riêng (kể cả danh mục mồ côi).
 */
export function monthStory({
  txs,
  months,
  monthStartDay,
  categories,
  currencyOf,
  base,
  rates,
  transferIds,
}: MonthStoryInput): MonthStory {
  const nowKey = months[months.length - 1]
  if (!nowKey) return { findings: [], hasMissingRate: false }
  const nowId = keyOf(nowKey)
  const priorIds = new Set(months.slice(0, -1).map(keyOf))

  const catById = new Map(categories.map((c) => [c.id, c]))
  const groupIdOf = (categoryId: string) => catById.get(categoryId)?.parent_id ?? categoryId
  const nameOf = (groupId: string) => catById.get(groupId)?.name ?? 'Khác'

  const byGroup = new Map<string, Map<string, GroupMonth>>()
  let hasMissingRate = false

  for (const t of txs) {
    if (t.type !== 'expense' || !t.category_id || t.is_debt_flow || t.exclude_from_stats) continue
    // Chuyển tài sản (gửi tiền về VN) là tiền vẫn của mình — cùng quy ước categoryBreakdown.
    if (transferIds?.has(t.category_id)) continue
    const monthId = keyOf(monthKeyForDate(t.occurred_on, monthStartDay))
    if (monthId !== nowId && !priorIds.has(monthId)) continue
    const raw = convertToBase(t.amount, currencyOf(t.account_id), base, rates)
    if (raw === null) {
      hasMissingRate = true
      continue
    }
    const groupId = groupIdOf(t.category_id)
    let months_ = byGroup.get(groupId)
    if (!months_) byGroup.set(groupId, (months_ = new Map()))
    let cell = months_.get(monthId)
    if (!cell) months_.set(monthId, (cell = emptyMonth()))
    cell.total += raw * expenseSign(t)
    if (!t.is_refund) {
      const isFixed = catById.get(t.category_id)?.cost_type === 'fixed'
      cell.gross += raw
      cell.count += 1
      if (raw > cell.biggest) {
        cell.biggest = raw
        cell.biggestFixed = isFixed
      }
      if (isFixed) cell.fixed += raw
    }
  }

  // Mốc quy chiếu của bộ dò "nghìn nhát dao nhỏ": nhóm chi CỐ ĐỊNH lớn nhất tháng này.
  // Đòi quá nửa tiền của nhóm là cố định, để một nhóm biến đổi có lẫn một khoản cố định
  // nhỏ không được đem ra làm mốc.
  let anchor: { name: string; amount: number } | null = null
  for (const [groupId, months_] of byGroup) {
    const cell = months_.get(nowId)
    if (!cell || cell.gross <= 0 || cell.fixed * 2 <= cell.gross) continue
    if (!anchor || cell.total > anchor.amount) anchor = { name: nameOf(groupId), amount: cell.total }
  }

  // Mẫu số của sàn tỷ trọng: chi RÒNG của cả tháng, cùng tập khoản mà các bộ dò đang đọc.
  let monthTotal = 0
  for (const months_ of byGroup.values()) {
    const cell = months_.get(nowId)
    if (cell && cell.total > 0) monthTotal += cell.total
  }

  const spikes: Finding<'categorySpike'>[] = []
  const manySmall: Finding<'manySmall'>[] = []
  const prices: Finding<'pricePerVisit'>[] = []
  const lumps: Finding<'lump'>[] = []

  for (const [groupId, months_] of byGroup) {
    const now = months_.get(nowId)
    if (!now || now.total <= 0) continue
    if (monthTotal > 0 && now.total < monthTotal * MIN_MONTH_SHARE) continue
    const name = nameOf(groupId)
    const share = now.gross > 0 ? now.biggest / now.gross : 0
    // `!biggestFixed` là cái bẫy `dailyHeadline` đã gỡ một lần, ở dạng khác: tiền nhà
    // chiếm 85% nhóm Nhà ở thì đúng, nhưng đó là hệ quả của lịch trả tiền, không phải
    // chuyện của tháng này. Đo được trên dữ liệu demo — nó chiếm mất dòng phát hiện duy
    // nhất bằng một câu ai cũng đoán ra.
    const lumpy = now.count >= 2 && share >= LUMP_SHARE && !now.biggestFixed

    // Tháng trước CÓ chi nhóm này. Tháng bằng 0 bị loại khỏi trung vị: một nhóm mới xuất
    // hiện tháng này sẽ có trung vị 0 và mọi mức chi đều thành "gấp vô hạn lần".
    const priorTotals: number[] = []
    const priorPer: number[] = []
    for (const id of priorIds) {
      const cell = months_.get(id)
      if (!cell || cell.total <= 0) continue
      priorTotals.push(cell.total)
      if (cell.count >= PRICE_MIN_COUNT) priorPer.push(cell.total / cell.count)
    }

    if (priorTotals.length >= MIN_HISTORY_MONTHS) {
      const usual = median(priorTotals)
      if (usual > 0 && now.total >= usual * SPIKE_RATIO) {
        spikes.push({
          kind: 'categorySpike',
          groupId,
          name,
          amount: now.total,
          usual,
          ratio: now.total / usual,
          biggest: lumpy ? { amount: now.biggest, share } : null,
        })
      }

      if (now.count >= PRICE_MIN_COUNT && priorPer.length >= MIN_HISTORY_MONTHS) {
        const perUsual = median(priorPer)
        const perNow = now.total / now.count
        const ratio = perUsual > 0 ? perNow / perUsual : 0
        if (perUsual > 0 && (ratio >= PRICE_UP || ratio <= PRICE_DOWN)) {
          prices.push({ kind: 'pricePerVisit', groupId, name, count: now.count, perNow, perUsual, ratio })
        }
      }
    }

    if (
      anchor &&
      anchor.name !== name &&
      now.count >= MANY_SMALL_COUNT &&
      now.total >= anchor.amount * MANY_SMALL_SHARE
    ) {
      manySmall.push({
        kind: 'manySmall',
        groupId,
        name,
        amount: now.total,
        count: now.count,
        anchorName: anchor.name,
        anchorAmount: anchor.amount,
      })
    }

    if (lumpy) {
      lumps.push({ kind: 'lump', groupId, name, amount: now.total, biggest: now.biggest, share })
    }
  }

  // Trong mỗi bộ dò, xếp theo SỐ TIỀN chứ không theo tỷ lệ: một nhóm ¥1.132 gấp 4 lần
  // mức thường ¥283 vẫn đúng về số học, nhưng đem nó lên câu tóm của tháng là hét về
  // một chuyện không ai cần biết. "Dôi ra bao nhiêu tiền" mới là thứ đáng xếp trước.
  spikes.sort((a, b) => b.amount - b.usual - (a.amount - a.usual))
  manySmall.sort((a, b) => b.amount - a.amount)
  prices.sort((a, b) => impact(b) - impact(a))
  lumps.sort((a, b) => b.biggest - a.biggest)

  // Thứ tự GIỮA các bộ dò là cố định, không đấu điểm với nhau — cùng cách `dailyHeadline`
  // xếp bốn nhánh của nó. Xếp theo mức "người đọc chưa biết": lệch với chính mình là thứ
  // không màn hình nào nói; còn "một khoản to" thì nhìn danh sách giao dịch là thấy.
  const findings: MonthFinding[] = []
  const used = new Set<string>()
  for (const f of [...spikes, ...manySmall, ...prices, ...lumps]) {
    if (findings.length >= MAX_FINDINGS) break
    if (used.has(f.groupId)) continue
    used.add(f.groupId)
    findings.push(f)
  }

  return { findings, hasMissingRate }
}

/** Số tiền mà việc đắt/rẻ lên mỗi lần cộng dồn thành trong tháng. */
const impact = (f: Finding<'pricePerVisit'>) => Math.abs(f.perNow - f.perUsual) * f.count
