// Chia trần nhóm xuống các mục con — thuần, test được.
//
// Luật một câu của cột hạn mức: CHA = TỔNG CÁC CON. Đặt số ở cha thì số đó phải rơi
// xuống con; sửa số ở con thì cha cộng lại. File này lo chiều thứ nhất.
//
// Vì sao phải có: trước đây trần nhóm và mốc con là hai con số sống độc lập, nên tháng
// 8/2026 có `Ăn uống` trần ¥50.000 mà không mục con nào mang một đồng nào của nó —
// người dùng nhìn nhóm không biết ¥50.000 đó dành cho Cơm ngoài hay Đi chợ, và app cũng
// không biết.

/** Số đặt tay của một mục con, kèm lịch sử để chia khi nó chưa có số. */
export interface SplitChild {
  categoryId: string
  /** hạn mức ĐANG ĐẶT (`BudgetRow.amount`, CHƯA cộng phần dồn); null = chưa đặt */
  limit: number | null
  /** TB 6 tháng đã chi; 0 = chưa có lịch sử */
  average: number
}

export interface SplitPart {
  categoryId: string
  amount: number
}

/**
 * Đơn vị làm tròn của một hạn mức chia tự động — cùng con số với `STEP` của
 * `planProjection.ts`, vì cùng một lý do: số lẻ tới từng đồng không ai đặt bằng tay.
 */
export const SPLIT_STEP = 100

/**
 * Chia `cap` cho các con, tổng LUÔN đúng bằng `cap`.
 *
 * Giữ lời khai trước, chỉ điền chỗ trống:
 *   · Con ĐÃ có hạn mức → GIỮ NGUYÊN số đó, kể cả ¥0 (đó là một lời khai — "tháng này
 *     không tiêu ở đây" — không phải chỗ trống).
 *   · Phần trần còn dư → chia cho các con CHƯA khai, theo tỉ lệ TB 6 tháng đã chi.
 *   · Con chưa khai mà cũng chưa có lịch sử → chia đều phần dư.
 *   · Không còn con nào chưa khai, hoặc các con đã khai cộng lại VƯỢT trần → lúc đó mới
 *     nâng/hạ tất cả theo tỉ lệ, vì giữ nguyên lời khai là bất khả.
 */
export function splitCapToChildren(cap: number, children: SplitChild[]): SplitPart[] {
  if (children.length === 0) return []

  // Phần trần chưa con nào nhận. Còn dư và còn con chưa khai → chỉ chia PHẦN DƯ đó, các
  // con đã khai giữ nguyên số. Đây là điều câu nhắc đã hứa ("còn ¥25.000 chưa chia"), và
  // là khác biệt giữa "điền nốt chỗ trống" với "viết đè lên con số tôi vừa khai".
  const free = children.filter((c) => c.limit === null)
  const declared = children.reduce((s, c) => s + (c.limit ?? 0), 0)
  const rest = cap - declared
  if (free.length > 0 && rest >= 0) {
    const shares = spread(rest, free.map((c) => Math.max(0, c.average)))
    const byId = new Map(free.map((c, i) => [c.categoryId, shares[i]]))
    return children.map((c) => ({
      categoryId: c.categoryId,
      amount: c.limit ?? byId.get(c.categoryId) ?? 0,
    }))
  }

  // Không còn chỗ nào để chia (mọi con đã khai, hoặc khai cộng lại đã vượt trần) → hạ/nâng
  // TẤT CẢ theo tỉ lệ. Trọng số của từng con: hạn mức nếu nó có, không thì TB 6 tháng.
  const mixed = children.map((c) => c.limit ?? Math.max(0, c.average))
  const amounts = spread(cap, mixed.some((w) => w > 0) ? mixed : children.map(() => 1))
  return children.map((c, i) => ({ categoryId: c.categoryId, amount: amounts[i] }))
}

/**
 * Chia `amount` theo `weights`, tổng LUÔN đúng bằng `amount`.
 *
 * Phần lẻ sau khi làm tròn dồn vào phần tử có trọng số LỚN NHẤT: cộng ba số đã làm tròn
 * hiếm khi ra đúng `amount`, mà lệch một đồng ở đây là thủng đúng cái luật file này giữ.
 * Dồn vào phần lớn nhất vì ở đó phần lẻ là nhiễu; dồn vào phần bé có thể nhân đôi nó.
 * Bằng điểm thì phần tử đứng trước thắng — thứ tự truyền vào là thứ tự hiển thị, nên
 * phần lẻ rơi vào chỗ người dùng nhìn thấy đầu tiên.
 */
function spread(amount: number, weights: number[]): number[] {
  if (weights.length === 0) return []
  const w = weights.some((x) => x > 0) ? weights : weights.map(() => 1)
  const totalWeight = w.reduce((s, x) => s + x, 0)
  const out = w.map((x) => Math.round((amount * x) / totalWeight / SPLIT_STEP) * SPLIT_STEP)
  let big = 0
  for (let i = 1; i < w.length; i++) if (w[i] > w[big]) big = i
  const others = out.reduce((s, x, i) => (i === big ? s : s + x), 0)
  out[big] = Math.max(0, amount - others)
  return out
}

/**
 * Chia đều — nút "điền lại cả bảng" của màn chia nhóm.
 *
 * Cố ý ghi đè cả những dòng đã khai: đó chính là việc người dùng đang nhờ nó làm khi
 * bấm. Khác `splitCapToChildren`, hàm kia giữ lời khai vì nó chạy TỰ ĐỘNG.
 */
export function splitEvenly(cap: number, categoryIds: string[]): SplitPart[] {
  const amounts = spread(cap, categoryIds.map(() => 1))
  return categoryIds.map((categoryId, i) => ({ categoryId, amount: amounts[i] }))
}

/** Chia theo TB 6 tháng — nút điền lại thứ hai. Không mục con nào có lịch sử → chia đều. */
export function splitByAverage(cap: number, children: SplitChild[]): SplitPart[] {
  const amounts = spread(cap, children.map((c) => Math.max(0, c.average)))
  return children.map((c, i) => ({ categoryId: c.categoryId, amount: amounts[i] }))
}

/**
 * Tổng hạn mức ĐẶT TAY của các con — con số mà trần cha phải bằng.
 *
 * Nhận thẳng dòng `budgets` chứ không nhận số đã hiển thị: số trên màn đã cộng phần dồn
 * từ tháng trước (`rollover`), và cộng ngược phần dồn đó lên cha là mỗi lần sửa một mục
 * con lại nhân thêm một lần dồn nữa.
 */
export function sumChildLimits(
  budgets: { category_id: string; amount: number }[],
  childIds: string[],
): number {
  const ids = new Set(childIds)
  return budgets.reduce((s, b) => (ids.has(b.category_id) ? s + b.amount : s), 0)
}

/** Một danh mục con vừa được ghi; `amount: null` = hạn mức vừa bị xoá. */
export interface LimitPatch {
  categoryId: string
  amount: number | null
}

export interface ResyncTree {
  parentOf: (categoryId: string) => string | null
  childrenOf: (categoryId: string) => string[]
  /** Hạn mức ĐANG LƯU theo danh mục (`BudgetRow.amount`); vắng mặt = chưa đặt. */
  limits: Map<string, number>
  /** Cha có dòng hạn mức RIÊNG không (nhóm trần-nhóm), hay chỉ là tổng các con. */
  hasCap: (categoryId: string) => boolean
}

/**
 * Chiều thứ hai của luật: sửa con xong thì trần cha phải bằng tổng con.
 *
 * Trả về danh sách trần cha cần ghi lại — rỗng khi không có gì đổi. Gộp theo cha nên
 * sửa bốn con một lượt vẫn chỉ một lượt ghi cho cha.
 *
 * KHÔNG đẻ trần cho nhóm chưa có trần (`hasCap` false): nhóm đó đang là kiểu TỔNG-CON,
 * số của cha vốn ĐÃ là tổng các con nên không có gì phải sửa. Ghi một dòng cho cha ở đó
 * là lặng lẽ đổi nhóm sang kiểu trần-nhóm — mốc con thôi không được tính vào kế hoạch
 * nữa và cả nhóm nhảy sang khối theo `need_level` của cha. Đổi cách tính tiền mà không
 * ai bấm gì cả là thứ tuyệt đối không được làm sau lưng người dùng.
 */
export function parentsToResync(patch: LimitPatch[], tree: ResyncTree): { categoryId: string; amount: number }[] {
  const next = new Map(tree.limits)
  for (const p of patch) {
    if (p.amount === null) next.delete(p.categoryId)
    else next.set(p.categoryId, p.amount)
  }

  const out: { categoryId: string; amount: number }[] = []
  const done = new Set<string>()
  for (const p of patch) {
    const parent = tree.parentOf(p.categoryId)
    if (parent === null || done.has(parent) || !tree.hasCap(parent)) continue
    done.add(parent)
    const total = tree.childrenOf(parent).reduce((s, id) => s + (next.get(id) ?? 0), 0)
    if (total === tree.limits.get(parent)) continue
    out.push({ categoryId: parent, amount: total })
  }
  return out
}
