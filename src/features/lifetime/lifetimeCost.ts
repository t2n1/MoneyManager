// Bản đồ khoản lớn, cách xếp "CẢ ĐỜI CÁI GÌ NGỐN NHIỀU TIỀN NHẤT" — THUẦN, không React.
//
// Đây là cách xếp THỨ HAI của hàng 12. Cách thứ nhất (`bigExpenses.ts`) trả lời một câu
// khác hẳn: "mỗi tháng phải để dành bao nhiêu cho các khoản sắp tới" — một câu về đường
// tiết kiệm, xếp theo số cần dành, và chỉ nhìn về phía trước. Hai câu không thay được cho
// nhau: với dữ liệu thật, cách thứ nhất đưa một đám cưới 300万 lên đầu vì nó gần, trong
// khi nuôi con 2.760万 và một căn nhà 4.700万 nằm dưới. Bản vẽ
// (dsg-handoff/README.md §"Bản đồ khoản lớn") mô tả đúng cách xếp trong file này.
//
// KHÔNG tính lại luật tiền ở đây. `YearRow` mà `projectLifetime` trả ra ĐÃ áp hết:
// `amountDisplayMinor` của mỗi sự kiện đã quy đổi tỷ giá và đã nhân lạm phát, đã đi qua
// bốn hình dạng (0066) và nhịp lặp; còn `expenseMinor` ĐÃ trừ `replaces_minor` (0067,
// xem project.ts ~dòng 411). Nên cộng chi nền + sự kiện KHÔNG đếm hai lần, và file này
// chỉ là phép GỘP trên đầu ra của engine — không phải một bản sao thứ hai của luật tiền.
import { STRESS_ILLNESS_EVENT_ID, type YearRow } from './project'

export interface LifetimeCostItem {
  kind: 'phase' | 'event'
  /** Ổn định giữa các lần dựng — dùng làm key React và để nối tới đối tượng thật. */
  id: string
  label: string
  /** Tổng cả đời theo tiền hiển thị. Dương = tiền RA, âm = thu (lương hưu). */
  totalMinor: number
  /** Số năm khoản này chạm tới. */
  years: number
}

export interface LifetimeCostMap {
  /** Xếp theo ĐỘ LỚN giảm dần — thu và chi cùng một thang, xem `totalMinor`. */
  items: LifetimeCostItem[]
  /** Mẫu số của cột "% tổng chi": chỉ cộng khoản RA. */
  totalSpendMinor: number
}

/**
 * Tên mốc từ nhãn của một nửa cơ chế. Engine đặt `${label} — trả trước` và
 * `${label} — trả nợ` (project.ts), nên cắt ở ' — ' cho lại tên mốc.
 *
 * Chỉ là ĐƯỜNG LÙI: bình thường mốc mua tài sản cũng sinh một dòng chi phí giữ mang đúng
 * `e.id` và nhãn gốc, và nhãn đó được ưu tiên. Nhưng vòng chi phí ở project.ts `continue`
 * khi chi phí giữ bằng 0 — một mốc "vay mua nhà, không khai chi phí giữ" là hợp lệ, và
 * lúc đó nhãn gốc không xuất hiện ở đâu cả.
 */
function labelOfMechanismHalf(label: string): string {
  const cut = label.indexOf(' — ')
  return cut === -1 ? label : label.slice(0, cut)
}

export function buildLifetimeCostMap({ rows }: { rows: readonly YearRow[] }): LifetimeCostMap {
  interface Acc {
    kind: 'phase' | 'event'
    id: string
    label: string
    /** Đặt bởi dòng KHÔNG có hậu tố — nhãn thật của mốc, ưu tiên hơn nhãn cắt được. */
    labelIsExact: boolean
    totalMinor: number
    years: Set<number>
  }
  const acc = new Map<string, Acc>()
  const bump = (key: string, seed: Omit<Acc, 'totalMinor' | 'years'>, minor: number, year: number) => {
    let a = acc.get(key)
    if (!a) {
      a = { ...seed, totalMinor: 0, years: new Set() }
      acc.set(key, a)
    }
    a.totalMinor += minor
    a.years.add(year)
    // Nhãn chính xác thắng, bất kể thứ tự gặp: dòng ':trano' có thể tới trước dòng gốc.
    if (seed.labelIsExact && !a.labelIsExact) {
      a.label = seed.label
      a.labelIsExact = true
    }
    return a
  }

  // --- Mốc ---
  for (const r of rows) {
    for (const e of r.events) {
      // Stress test là "nếu như", không phải một khoản trong kế hoạch.
      if (e.id === STRESS_ILLNESS_EVENT_ID) continue
      // Một mốc mua tài sản sinh BA dòng (`id`, `id:tratruoc`, `id:trano`) — gộp về mốc.
      // id thật là uuid, không chứa ':', nên cắt ở ':' đầu tiên là an toàn.
      const colon = e.id.indexOf(':')
      const baseId = colon === -1 ? e.id : e.id.slice(0, colon)
      const exact = colon === -1
      bump(
        `event:${baseId}`,
        {
          kind: 'event',
          id: baseId,
          label: exact ? e.label : labelOfMechanismHalf(e.label),
          labelIsExact: exact,
        },
        (e.kind === 'income' ? -1 : 1) * e.amountDisplayMinor,
        r.year,
      )
    }
  }

  // --- Sinh hoạt từng chặng ---
  //
  // Gộp theo QUÃNG LIỀN NHAU, không theo tên: hai chặng trùng tên là hai quãng đời khác
  // nhau và phải là hai dòng. Chặng lấp kín trục không hở (bất biến của mô hình), nên một
  // quãng liền nhau cùng `phaseLabel` đúng bằng một chặng.
  let runStart: number | null = null
  let runLabel: string | null = null
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    if (runLabel !== r.phaseLabel) {
      runLabel = r.phaseLabel
      runStart = r.year
    }
    bump(
      `phase:${runLabel}:${runStart}`,
      { kind: 'phase', id: `phase:${runLabel}:${runStart}`, label: r.phaseLabel, labelIsExact: true },
      r.expenseMinor,
      r.year,
    )
  }

  const items: LifetimeCostItem[] = [...acc.values()]
    .filter((a) => a.totalMinor !== 0)
    .map((a) => ({ kind: a.kind, id: a.id, label: a.label, totalMinor: a.totalMinor, years: a.years.size }))
    .sort((x, y) => Math.abs(y.totalMinor) - Math.abs(x.totalMinor))

  const totalSpendMinor = items.reduce((s, i) => s + (i.totalMinor > 0 ? i.totalMinor : 0), 0)
  return { items, totalSpendMinor }
}
