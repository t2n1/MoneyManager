// Lịch khoản định kỳ của MỘT tháng — thuần, không phụ thuộc React, để unit-test được.
//
// VÌ SAO CÓ FILE NÀY: trang Định kỳ đang liệt kê từng quy tắc kèm "kỳ tới ngày nào".
// Đọc được từng dòng, nhưng KHÔNG trả lời được câu người ta mở trang để hỏi: "tháng này
// còn nợ ai, và ngày nào là ngày nặng". Một danh sách 12 dòng sắp theo tên không nói ra
// việc ngày 15 có ba khoản chồng nhau, cũng không nói ra khoản ngày 6 đã lỡ mất.
//
// BỐN TRẠNG THÁI, và ranh giới giữa chúng là toàn bộ giá trị của thẻ này:
//   · da-tra   — có giao dịch khớp, đúng số
//   · lech-so  — có giao dịch khớp nhưng số tiền KHÁC (hoá đơn điện tháng nóng…)
//   · lo-mat   — đã qua ngày mà không có giao dịch nào
//   · sap-toi  — chưa tới ngày (hôm nay vẫn tính là chưa tới)
//
// GHÉP GIAO DỊCH VỚI KỲ: theo kỳ GẦN NHẤT, không theo một cửa sổ ± mấy ngày. Cửa sổ cố
// định thì phải chọn một con số cho cả hàng tuần lẫn hàng năm — rộng thì một giao dịch
// khớp vào hai kỳ, hẹp thì khoản trả trễ bốn ngày đọc thành "vừa lỡ một kỳ vừa trả thừa
// một kỳ". Kỳ gần nhất không cần tham số nào và không bao giờ ghép một giao dịch vào hai
// chỗ.

import { nthDueDate, type RecurringFrequency } from '../../lib/recurring'
import { daysBetween } from '../../lib/dates'

export type BillCellStatus = 'da-tra' | 'lech-so' | 'lo-mat' | 'sap-toi'

/** Phần một quy tắc cần có để lên lịch. `RecurringRuleRow` thoả kiểu này. */
export interface BillCalRule {
  id: string
  note: string
  type: 'expense' | 'income' | 'transfer'
  amount: number
  frequency: RecurringFrequency
  start_on: string
  end_on: string | null
  is_paused: boolean
  mode?: 'auto' | 'remind'
}

/** Phần một giao dịch cần có để ghép. `TransactionRow` thoả kiểu này. */
export interface BillCalTx {
  id: string
  recurring_rule_id: string | null
  occurred_on: string
  amount: number
}

export interface BillCell {
  ruleId: string
  label: string
  dueISO: string
  /** Số của QUY TẮC (minor units, tiền của tài khoản nguồn). */
  amount: number
  /** Số THẬT đã ghi. null = chưa ghép được giao dịch nào. */
  paid: number | null
  type: BillCalRule['type']
  status: BillCellStatus
}

/** Số kỳ đệm mỗi đầu khi dựng danh sách kỳ để ghép — xem `billCalendar`. */
const DEM = 2

/** Mọi kỳ của một quy tắc rơi vào [từ, đến) — `đến` là ngày LOẠI TRỪ. */
export function dueDatesBetween(
  rule: Pick<BillCalRule, 'frequency' | 'start_on' | 'end_on' | 'is_paused'>,
  tuISO: string,
  denISO: string,
): string[] {
  if (rule.is_paused) return []
  const out: string[] = []
  // Quét từ n = 0 chứ không nhảy thẳng tới kỳ đầu trong khoảng: `nthDueDate` kẹp ngày
  // về cuối tháng ngắn (31 → 28/2) nên bước không đều, phép nhảy bằng số học sẽ lệch.
  // Chặn trên để một `start_on` ở rất xa quá khứ không thành vòng lặp dài vô ích.
  for (let n = 0; n < 4000; n++) {
    const due = nthDueDate(rule.start_on, rule.frequency, n)
    if (rule.end_on && due > rule.end_on) break
    if (due >= denISO) break
    if (due >= tuISO) out.push(due)
  }
  return out
}

/**
 * Lịch của một tháng: mỗi kỳ đến hạn là một ô, đã gắn trạng thái.
 *
 * `txs` chỉ cần phủ khoảng đang xem — giao dịch của kỳ ngoài khoảng không ảnh hưởng kết
 * quả vì phép ghép chạy trên danh sách kỳ ĐỆM THÊM hai kỳ mỗi đầu: khoản trả sớm/trễ vắt
 * qua mép tháng vẫn về đúng kỳ của nó thay vì bị ép vào kỳ đầu hoặc cuối tháng.
 */
export function billCalendar(
  rules: readonly BillCalRule[],
  txs: readonly BillCalTx[],
  range: { start: string; end: string },
  todayISO: string,
): BillCell[] {
  const byRule = new Map<string, BillCalTx[]>()
  for (const t of txs) {
    if (t.recurring_rule_id === null) continue
    const arr = byRule.get(t.recurring_rule_id)
    if (arr) arr.push(t)
    else byRule.set(t.recurring_rule_id, [t])
  }

  const out: BillCell[] = []
  for (const rule of rules) {
    if (rule.is_paused) continue
    const trongThang = dueDatesBetween(rule, range.start, range.end)
    if (trongThang.length === 0) continue

    // Danh sách kỳ dùng để GHÉP rộng hơn danh sách hiện ra: thêm DEM kỳ mỗi đầu.
    const rong: string[] = []
    for (let n = 0; n < 4000; n++) {
      const due = nthDueDate(rule.start_on, rule.frequency, n)
      if (rule.end_on && due > rule.end_on) break
      rong.push(due)
      if (rong.length > 8000) break
    }
    const dau = rong.indexOf(trongThang[0])
    const cuoi = rong.indexOf(trongThang[trongThang.length - 1])
    const dungDeGhep = rong.slice(Math.max(0, dau - DEM), cuoi + 1 + DEM)

    // Mỗi giao dịch về kỳ GẦN NHẤT. Hoà thì về kỳ SỚM HƠN — quy ước phải cố định, không
    // thì cùng một bộ dữ liệu cho ra hai kết quả tuỳ thứ tự mảng.
    const daGhep = new Map<string, BillCalTx>()
    for (const t of byRule.get(rule.id) ?? []) {
      let best: string | null = null
      let bestD = Infinity
      for (const due of dungDeGhep) {
        const d = Math.abs(daysBetween(due, t.occurred_on))
        if (d < bestD) {
          bestD = d
          best = due
        }
      }
      // Một kỳ chỉ nhận MỘT giao dịch; cái sát ngày hơn thắng. Không cộng dồn: hai
      // giao dịch cùng kỳ nghĩa là ghi trùng, mà cộng lại thì nó đọc ra "trả gấp đôi".
      if (best === null) continue
      const cu = daGhep.get(best)
      if (cu === undefined || bestD < Math.abs(daysBetween(best, cu.occurred_on))) {
        daGhep.set(best, t)
      }
    }

    for (const dueISO of trongThang) {
      const tx = daGhep.get(dueISO) ?? null
      const status: BillCellStatus =
        tx !== null
          ? tx.amount === rule.amount
            ? 'da-tra'
            : 'lech-so'
          : dueISO < todayISO
            ? 'lo-mat'
            : 'sap-toi'
      out.push({
        ruleId: rule.id,
        label: rule.note,
        dueISO,
        amount: rule.amount,
        paid: tx?.amount ?? null,
        type: rule.type,
        status,
      })
    }
  }

  // Sắp theo ngày rồi theo nhãn: cùng một ngày thì thứ tự phải ổn định giữa các lần vẽ.
  return out.sort((a, b) =>
    a.dueISO === b.dueISO ? a.label.localeCompare(b.label) : a.dueISO < b.dueISO ? -1 : 1,
  )
}

/**
 * Lưới tuần để vẽ lịch: mỗi hàng 7 ô, tuần bắt đầu THỨ HAI.
 *
 * Ô ngoài kỳ trả `null` chứ không bỏ đi — bỏ thì các cột lệch nhau và thứ trong tuần
 * không còn thẳng hàng, tức là mất đúng thứ duy nhất một cái lịch làm được mà danh sách
 * không làm được.
 *
 * Bắt đầu từ Thứ Hai chứ không Chủ Nhật: đây là lịch tiếng Việt, và tuần làm việc là
 * đơn vị người dùng nghĩ theo khi xếp ngày trả tiền.
 */
export function monthGrid(tuISO: string, denISO: string): (string | null)[][] {
  const ngay = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

  const dau = ngay(tuISO)
  // getDay(): 0 = Chủ Nhật. Đổi sang "số ngày phải lùi để về Thứ Hai".
  const lui = (dau.getDay() + 6) % 7
  const con = new Date(dau)
  con.setDate(con.getDate() - lui)

  const weeks: (string | null)[][] = []
  for (let w = 0; w < 8; w++) {
    const row: (string | null)[] = []
    let coNgayTrongKy = false
    for (let i = 0; i < 7; i++) {
      const cur = iso(con)
      const trongKy = cur >= tuISO && cur < denISO
      if (trongKy) coNgayTrongKy = true
      row.push(trongKy ? cur : null)
      con.setDate(con.getDate() + 1)
    }
    if (!coNgayTrongKy && weeks.length > 0) break
    weeks.push(row)
  }
  return weeks
}

export interface BillCalendarSummary {
  /** Tổng CHI của tháng (số theo quy tắc), gồm mọi trạng thái. */
  expected: number
  /** Phần đã thực sự rời ví — lấy số THẬT khi có, không lấy số của quy tắc. */
  paid: number
  loMat: number
  lechSo: number
}

/** Tóm tắt để in trên đầu lịch. Chỉ tính CHI: thu và chuyển khoản là câu hỏi khác. */
export function summarizeBills(cells: readonly BillCell[]): BillCalendarSummary {
  let expected = 0
  let paid = 0
  let loMat = 0
  let lechSo = 0
  for (const c of cells) {
    if (c.type !== 'expense') continue
    expected += c.amount
    if (c.paid !== null) paid += c.paid
    if (c.status === 'lo-mat') loMat++
    if (c.status === 'lech-so') lechSo++
  }
  return { expected, paid, loMat, lechSo }
}
