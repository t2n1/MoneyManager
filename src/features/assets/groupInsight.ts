// Ba phép tính đứng sau ba câu chữ của bản vẽ 2b — thuần, không React.
//
//   1. `groupDeltas`      — Δ của một NHÓM trong một cửa sổ, cộng từ Δ của từng tài khoản.
//   2. `concentrationNote`— "ròng sụt X gần như hoàn toàn ở nhóm G — tài khoản A −Y".
//   3. `investmentScope`  — "tính theo LOẠI nên gồm 退職金 ¥50.000 đang ở nhóm Tiết kiệm".
//
// Cả ba đều là loại câu mà bản vẽ gọi là "không còn lỗ đen": trước đó trang in ra một
// con số tổng sụt và để người đọc tự đi tìm chỗ sụt. Câu chữ chỉ có giá trị khi nó do
// SỐ dựng ra, nên chúng nằm ở đây, có phép thử, chứ không viết cứng trong JSX.
import type { CurrencyCode } from '../../lib/money'
import { convertToBase, type Rates } from '../../lib/rates'
import type { AssetAccount, AssetGroup } from './aggregate'

export interface GroupDelta {
  /** base minor; null = không cộng được vì thiếu tỷ giá cho MỌI tài khoản có Δ. */
  delta: number | null
  /** Có ít nhất một tài khoản bị bỏ khỏi tổng vì thiếu tỷ giá. */
  hasMissingRate: boolean
  /** Tài khoản đóng góp phần lớn nhất theo |Δ| (đã quy đổi). null = không có Δ nào. */
  biggest: { name: string; delta: number } | null
}

/**
 * Δ của từng nhóm, cộng từ Δ của các tài khoản bên trong.
 *
 * Δ từng tài khoản do `accountRowStats` trả về Ở ĐƠN VỊ TÀI KHOẢN, nên phải quy đổi
 * trước khi cộng — nhóm "Đầu tư" của sổ này có một tài khoản VND và một tài khoản JPY.
 * Thiếu tỷ giá thì LOẠI khoản đó và bật cờ (quy ước toàn repo, xem convertToBase), không
 * bao giờ coi 1:1.
 */
export function groupDeltas(input: {
  groups: AssetGroup[]
  /** Δ theo id tài khoản, đơn vị của tài khoản. */
  deltaById: Map<string, number>
  base: CurrencyCode
  rates: Rates
}): Map<string, GroupDelta> {
  const { groups, deltaById, base, rates } = input
  const out = new Map<string, GroupDelta>()
  for (const g of groups) {
    let tong = 0
    let co = false
    let missing = false
    let biggest: { name: string; delta: number } | null = null
    for (const a of g.accounts) {
      const d = deltaById.get(a.id)
      if (d == null || d === 0) continue
      const v = convertToBase(d, a.currency, base, rates)
      if (v === null) {
        missing = true
        continue
      }
      tong += v
      co = true
      if (biggest == null || Math.abs(v) > Math.abs(biggest.delta)) {
        biggest = { name: a.name, delta: v }
      }
    }
    out.set(g.name, { delta: co ? tong : null, hasMissingRate: missing, biggest })
  }
  return out
}

export interface Concentration {
  /** Nhóm gánh phần lớn nhất của thay đổi. */
  groupName: string
  /** Δ của nhóm đó (base minor). */
  groupDelta: number
  /** Tài khoản lớn nhất trong nhóm đó. */
  account: { name: string; delta: number } | null
  /** Tổng Δ của MỌI nhóm khác (base minor) — phần "các nhóm khác bù lại". */
  othersDelta: number
  /** Tổng Δ của tất cả các nhóm (base minor). */
  totalDelta: number
}

/** Nhóm phải gánh ít nhất bao nhiêu phần của tổng |Δ| mới đáng gọi là "tập trung". */
const NGUONG_TAP_TRUNG = 0.6

/**
 * Câu "thay đổi nằm gần như hoàn toàn ở đâu" — hoặc null khi không có chỗ nào nổi trội.
 *
 * Đo trên TỔNG TUYỆT ĐỐI, không trên tổng đại số: một tháng mà nhóm A +100 và nhóm B
 * −100 thì tổng đại số bằng 0 nhưng rõ ràng có hai chuyện lớn xảy ra. Chia cho tổng đại
 * số ở ca đó là chia cho 0, và bất kỳ nhóm nào cũng "chiếm 100%".
 *
 * Trả null khi không nhóm nào đạt ngưỡng: một câu "tập trung ở X" khi thật ra dàn đều
 * năm nhóm là câu sai, và nó sai theo hướng khiến người đọc đi kiểm tra sai chỗ.
 */
export function concentrationNote(
  deltas: Map<string, GroupDelta>,
): Concentration | null {
  let tongTuyetDoi = 0
  let tong = 0
  let dan: { name: string; d: GroupDelta } | null = null
  for (const [name, d] of deltas) {
    if (d.delta == null || d.delta === 0) continue
    tongTuyetDoi += Math.abs(d.delta)
    tong += d.delta
    if (dan == null || Math.abs(d.delta) > Math.abs(dan.d.delta!)) dan = { name, d }
  }
  if (dan == null || tongTuyetDoi === 0) return null
  if (Math.abs(dan.d.delta!) / tongTuyetDoi < NGUONG_TAP_TRUNG) return null
  return {
    groupName: dan.name,
    groupDelta: dan.d.delta!,
    account: dan.d.biggest,
    othersDelta: tong - dan.d.delta!,
    totalDelta: tong,
  }
}

export interface InvestmentScope {
  /** Tài khoản đầu tư đang nằm NGOÀI nhóm giữ phần lớn tiền đầu tư. */
  outsiders: { id: string; name: string; groupName: string; baseValue: number }[]
  /** Tên nhóm giữ phần lớn tiền đầu tư (mẫu số mà bảng dưới in). */
  mainGroupName: string
  /** Tổng giá trị của `outsiders` — đúng bằng độ lệch giữa hai cách cắt (base minor). */
  gap: number
}

/**
 * Nhóm chính phải giữ QUÁ NỬA tiền đầu tư mới đáng gọi là "nhà chính".
 *
 * Không có ngưỡng này thì câu chữ vẫn đúng số học nhưng sai về hàm ý. Dựng ra được trên
 * bộ dữ liệu demo: ba tài khoản loại đầu tư nằm ở ba nhóm khác nhau (¥661.845 / ¥396.180
 * / ¥80.757). Nhóm lớn nhất giữ 58% nên câu đọc được; nhưng nếu nó chỉ giữ 34% thì câu
 * "lệch đúng X với nhóm Y" đang chỉ vào một nhóm KHÔNG phải nhà của tiền đầu tư, và nó
 * liệt kê phần lớn danh mục dưới nhãn "ngoại lệ". Lúc đó sự thật là "tiền đầu tư rải khắp
 * các nhóm", mà đó là một câu khác — không nói còn hơn nói câu này.
 */
const NGUONG_NHA_CHINH = 0.5

/**
 * Vì sao ô "Hiệu quả đầu tư" lệch với dòng "Đầu tư" của bảng nhóm.
 *
 * Hai khối cắt bằng hai dao khác nhau: ô hiệu quả lấy theo LOẠI tài khoản
 * (`type === 'investment'`, xem useAssetsData.investmentAccounts) còn bảng nhóm lấy theo
 * MỤC ĐÍCH (`asset_group`, do người dùng tự đặt). Một tài khoản loại đầu tư nằm trong
 * nhóm "Tiết kiệm" thì có mặt ở khối trên mà không có ở dòng dưới — và độ lệch đúng bằng
 * số tiền của nó.
 *
 * Đó không phải lỗi để sửa (cả hai cách cắt đều đúng với câu hỏi của mình), nên việc
 * duy nhất phải làm là NÓI RA. Trước bản này hai con số lệch nhau đứng cách nhau 300px
 * mà không có gì giải thích — đúng loại "lỗ đen" mà bản vẽ 2b đặt tên.
 *
 * Trả null khi mọi tài khoản đầu tư cùng một nhóm (không có gì lệch để nói).
 */
export function investmentScope(input: {
  /** Tài khoản loại đầu tư đang tính vào tổng — cùng tập với ô Hiệu quả đầu tư. */
  investmentAccounts: AssetAccount[]
  /** Nhóm theo mục đích — để tra một tài khoản đang ở nhóm nào. */
  purposeGroups: AssetGroup[]
}): InvestmentScope | null {
  const { investmentAccounts, purposeGroups } = input
  const groupOf = new Map<string, string>()
  for (const g of purposeGroups) for (const a of g.accounts) groupOf.set(a.id, g.name)

  // Tổng theo nhóm để biết nhóm nào là "nhà chính" của tiền đầu tư.
  const theoNhom = new Map<string, number>()
  for (const a of investmentAccounts) {
    const name = groupOf.get(a.id)
    if (name == null) continue
    theoNhom.set(name, (theoNhom.get(name) ?? 0) + (a.baseValue ?? 0))
  }
  if (theoNhom.size < 2) return null

  let mainGroupName = ''
  let max = -Infinity
  let tong = 0
  for (const [name, v] of theoNhom) {
    tong += v
    if (v > max) {
      max = v
      mainGroupName = name
    }
  }
  if (tong <= 0 || max / tong <= NGUONG_NHA_CHINH) return null

  const outsiders = investmentAccounts
    .filter((a) => groupOf.get(a.id) != null && groupOf.get(a.id) !== mainGroupName)
    .map((a) => ({
      id: a.id,
      name: a.name,
      groupName: groupOf.get(a.id)!,
      baseValue: a.baseValue ?? 0,
    }))
    .sort((a, b) => b.baseValue - a.baseValue)
  if (outsiders.length === 0) return null

  return {
    outsiders,
    mainGroupName,
    gap: outsiders.reduce((s, o) => s + o.baseValue, 0),
  }
}
