// Câu nhắc khi mốc các mục con cộng lại vượt trần nhóm — thuần, test được.
//
// Vì sao phải GỌI TÊN mục con, không chỉ in tổng: ca thật tháng 8/2026 — nhóm "Ngoại
// hình" trần ¥1.800, ba mục con, chỉ một đứa (Cắt tóc) có mốc ¥2.400. Câu cũ in đúng
// một con số 2.400 và không nói nó ở đâu ra; ba mục con thì không ai biết đứa nào mang
// số đó, mà con số duy nhất nhìn thấy trên dòng Cắt tóc lại là "đã chi ¥1.800". Kết quả
// người dùng đọc câu cảnh báo như app tự bịa số.

/** Số mục con được gọi tên trong câu; phần còn lại đếm ra thành chữ, không cắt im lặng. */
const MAX_NAMED = 3

/**
 * Gọi tên tối đa `max` phần tử rồi đếm phần còn lại — MỘT luật cho mọi câu "gồm những
 * gì" của trang Ngân sách.
 *
 * Tách ra khỏi `capMismatchNotice` khi khối "Cần bạn quyết" (B31.1) cần đúng luật này
 * để gọi tên các khoản cam kết ("Claude Pro · Google One · Bitwarden"). Lý do y nguyên
 * lý do ghi ở đầu file: in một con số mà không nói nó ở đâu ra thì người dùng đọc như
 * app tự bịa. Viết bản thứ hai thì hai câu trên cùng một màn sẽ cắt ở hai chỗ khác nhau.
 */
export function nameList(names: string[], max = MAX_NAMED): string {
  const shown = names.slice(0, max)
  const rest = names.length - shown.length
  return `${shown.join(' · ')}${rest > 0 ? ` · …và ${rest} mục nữa` : ''}`
}

/**
 * Một nhóm, rút về đúng những gì cần để so trần cha với tổng con.
 *
 * KHÔNG nhận `BudgetGroupItem`: mặt Theo dõi có kiểu đó, mặt Lập kế hoạch thì không (nó
 * dựng `PlanRow`). Bắt file này biết cả hai là hai đường đi tới cùng một câu, và câu đó
 * sẽ lệch nhau ở một trong hai màn.
 */
export interface CapGroup {
  /** true = trần đặt ở CHA. `false` (nhóm tổng-con) thì không có gì để lệch. */
  capped: boolean
  /** trần nhóm đang hiện */
  cap: number
  /** tổng mốc các mục con */
  markerTotal: number
  /** mục con ĐÃ đặt mốc — tên kèm số, thứ tự tuỳ ý */
  named: { name: string; marker: number }[]
  /** tổng số mục con đang hoạt động, kể cả đứa chưa đặt mốc */
  childCount: number
}

/** Trần nhóm và tổng mốc con lệch nhau ra sao. */
export interface CapMismatch {
  /** `over` = con cộng lại vượt trần; `under` = trần còn phần chưa chia cho con nào. */
  kind: 'over' | 'under'
  text: string
  /** Trần nhóm — để câu mời "Chia ¥50.000 cho 3 mục con" nói đúng số. */
  cap: number
  childCount: number
}

/**
 * Câu nhắc cho một nhóm, hoặc `null` khi trần cha đã đúng bằng tổng con.
 *
 * Luật của cột hạn mức là CHA = TỔNG CÁC CON (xem `useSyncedBudget`), nên MỌI khoảng
 * lệch đều phải nói ra, không chỉ khoảng vượt:
 *
 *   · `over`  — con cộng lại nhiều hơn trần. Sai thật, và gọi tên đứa mang số đó.
 *   · `under` — trần còn phần chưa mục con nào nhận. Không sai, nhưng cũng không dùng
 *     được: ca thật tháng 8/2026 có `Ăn uống` trần ¥50.000 với ba mục con mà không đứa
 *     nào mang một đồng nào, nên nhìn nhóm không ai biết ¥50.000 đó dành cho đâu. Bản
 *     cũ im ở đúng ca này vì nó chỉ đi tìm khoảng VƯỢT.
 *
 * `null` cho nhóm tổng-con (`capped` false): ở đó hạn mức con CHÍNH LÀ trần nhóm nên cả
 * "vượt trần" lẫn "chưa chia hết trần" đều là câu tự mâu thuẫn.
 */
export function capMismatchNotice(
  g: CapGroup,
  money: (v: number) => string,
): CapMismatch | null {
  if (!g.capped || g.cap <= 0) return null
  if (g.markerTotal === g.cap) return null
  const base = { cap: g.cap, childCount: g.childCount }

  if (g.markerTotal < g.cap) {
    const text =
      g.named.length === 0
        ? `Chưa mục con nào chia phần trong trần nhóm ${money(g.cap)}.`
        : `Mốc các mục con mới cộng được ${money(g.markerTotal)} trong trần nhóm ${money(g.cap)}` +
          ` — còn ${money(g.cap - g.markerTotal)} chưa chia.`
    return { kind: 'under', text, ...base }
  }

  if (g.named.length === 0) return null
  const named = [...g.named].sort((a, b) => b.marker - a.marker)
  const text =
    named.length === 1
      ? `${named[0].name} đặt mốc ${money(named[0].marker)}, vượt trần nhóm ${money(g.cap)}.`
      : `Mốc các mục con cộng lại ${money(g.markerTotal)} (${nameList(
          named.map((k) => `${k.name} ${money(k.marker)}`),
        )}), vượt trần nhóm ${money(g.cap)}.`
  return { kind: 'over', text, ...base }
}
