// Sáu phương pháp phân bổ ngân sách — thuần, test được.
//
// Mỗi phương pháp là một danh sách KHOẢN. Khoản chi lấy số từ nhãn `need_level` của
// danh mục (gắn MỘT lần, mọi phương pháp gom theo bảng riêng của nó) hoặc từ tổng chi;
// khoản Để dành là phần dư thu − chi. Luật xương sống (test chặn): mỗi nhãn phải thuộc
// về ĐÚNG MỘT khoản trong MỌI phương pháp — thiếu là tiền biến mất lặng lẽ, thừa là
// đếm hai lần. Chi tiết và mockup bằng số thật:
// docs/superpowers/specs/2026-09-03-phuong-phap-phan-bo-design.md

import type { NeedLevel, ProfileRow } from '../../types/database.types'

export type BudgetMethodId = '50-30-20' | '80-20' | '70-20-10' | 'jars' | 'kakeibo' | 'custom'

/**
 * Khoá khoản — nằm trong URL (`?axis=`) nên phải ổn định qua các phương pháp.
 * Nhãn hiển thị thuộc về PHƯƠNG PHÁP: cùng `essential` đọc là "Thiết yếu" ở JARS
 * và "Sinh tồn" ở Kakeibo.
 */
export type AxisKey =
  | 'essential' | 'flexible' | 'education' | 'giving' | 'buffer'
  | 'living' | 'allSpend'
  | 'savings'

export type BucketSource =
  | { kind: 'needs'; levels: readonly NeedLevel[] }
  | { kind: 'allExpense' }
  | { kind: 'residual' }

export interface MethodBucket {
  key: AxisKey
  label: string
  /** chữ CHỈ ĐỂ DẠY — ẩn ở chế độ Gọn, render qua <Guide> */
  hint: string
  /** mốc mặc định của phương pháp; người dùng đè qua budget_targets */
  bps: number
  /** 'cap' = trần, càng thấp càng tốt · 'floor' = sàn, cần vượt */
  direction: 'cap' | 'floor'
  source: BucketSource
}

export interface BudgetMethod {
  id: BudgetMethodId
  name: string
  /** một câu trong Cài đặt, dưới ô chọn phương pháp */
  blurb: string
  buckets: readonly MethodBucket[]
}

const savings = (hint = 'phần còn lại sau khi tiêu'): MethodBucket => ({
  key: 'savings',
  label: 'Để dành',
  hint,
  bps: 2000,
  direction: 'floor',
  source: { kind: 'residual' },
})

const needs = (
  key: AxisKey,
  label: string,
  hint: string,
  bps: number,
  levels: readonly NeedLevel[],
): MethodBucket => ({ key, label, hint, bps, direction: 'cap', source: { kind: 'needs', levels } })

export const BUDGET_METHODS: readonly BudgetMethod[] = [
  {
    id: '50-30-20',
    name: '50/30/20',
    blurb: 'Nửa thu nhập cho thứ bắt buộc, 30% cho sở thích, giữ lại 20%. Điểm khởi đầu quen thuộc nhất.',
    buckets: [
      needs('essential', 'Thiết yếu', 'tiền nhà, điện nước, đi lại — cắt là ảnh hưởng cuộc sống', 5000, ['essential', 'buffer']),
      needs('flexible', 'Linh hoạt', 'ăn ngoài, mua sắm, giải trí — cắt được khi cần', 3000, ['flexible', 'education', 'giving']),
      savings(),
    ],
  },
  {
    id: '80-20',
    name: '80/20 — Trả cho mình trước',
    blurb: 'Giữ 20% trước, 80% còn lại tiêu sao cũng được — không phải phân loại gì thêm.',
    buckets: [
      {
        key: 'allSpend',
        label: 'Chi tiêu',
        hint: 'mọi khoản chi — miễn là giữ được phần để dành',
        bps: 8000,
        direction: 'cap',
        source: { kind: 'allExpense' },
      },
      savings('trả cho mình trước: mốc phải giữ mỗi tháng'),
    ],
  },
  {
    id: '70-20-10',
    name: '70/20/10',
    blurb: 'Sinh hoạt 70%, để dành 20%, cho đi 10% — dành cho người muốn tách riêng phần biếu tặng.',
    buckets: [
      needs('living', 'Sinh hoạt', 'toàn bộ chi tiêu cho mình — nhà cửa, ăn uống, sở thích', 7000, ['essential', 'flexible', 'education', 'buffer']),
      needs('giving', 'Cho đi', 'quà, biếu tặng, hỗ trợ gia đình', 1000, ['giving']),
      savings(),
    ],
  },
  {
    id: 'jars',
    name: '6 cái lọ (JARS)',
    blurb: 'Chia thu nhập vào 6 hũ; hũ Giáo dục và Cho đi ép tiêu có chủ đích thay vì gộp hết vào "linh hoạt".',
    buckets: [
      needs('essential', 'Thiết yếu', 'hũ nhu cầu thiết yếu — nhà, ăn ở, đi lại', 5500, ['essential', 'buffer']),
      needs('flexible', 'Hưởng thụ', 'hũ chơi — tiêu cho vui, không áy náy', 1000, ['flexible']),
      needs('education', 'Giáo dục', 'hũ học — sách, khóa học, phát triển bản thân', 1000, ['education']),
      needs('giving', 'Cho đi', 'hũ cho đi — quà, từ thiện, hỗ trợ gia đình', 500, ['giving']),
      savings('gồm hai hũ Đầu tư và Tiết kiệm dài hạn — app tính chung vì để dành = thu − chi'),
    ],
  },
  {
    id: 'kakeibo',
    name: 'Kakeibo',
    blurb: 'Sổ chi tiêu kiểu Nhật: đặt mục tiêu để dành trước, rồi soi bốn nhóm chi — sinh tồn, hưởng thụ, văn hóa, dự phòng.',
    buckets: [
      needs('essential', 'Sinh tồn', '生存費 — thứ không tiêu không sống được', 5000, ['essential']),
      needs('flexible', 'Hưởng thụ', '浪費 — muốn chứ không cần, gồm cả quà cáp', 2000, ['flexible', 'giving']),
      needs('education', 'Văn hóa', '文化費 — sách, học, bảo tàng, nuôi cái đầu', 500, ['education']),
      needs('buffer', 'Dự phòng', '予備費 — bất ngờ: ốm đau, hỏng hóc, hiếu hỉ', 500, ['buffer']),
      savings(),
    ],
  },
  {
    id: 'custom',
    name: 'Tự đặt',
    blurb: 'Hiện đủ 6 khoản, tự gõ phần trăm theo ý mình.',
    buckets: [
      needs('essential', 'Thiết yếu', 'tiền nhà, điện nước, đi lại — cắt là ảnh hưởng cuộc sống', 5000, ['essential']),
      needs('flexible', 'Hưởng thụ', 'ăn ngoài, mua sắm, giải trí', 1500, ['flexible']),
      needs('education', 'Giáo dục', 'sách, khóa học, phát triển bản thân', 500, ['education']),
      needs('giving', 'Cho đi', 'quà, từ thiện, hỗ trợ gia đình', 500, ['giving']),
      needs('buffer', 'Dự phòng', 'bất ngờ: ốm đau, hỏng hóc, hiếu hỉ', 500, ['buffer']),
      savings(),
    ],
  },
]

const DEFAULT_METHOD = BUDGET_METHODS[0]

/** bps trong khoảng 0–10000; null hoặc NaN → fallback. (Chuyển từ ProfileEditSheet lên đây — Task 6 dùng lại.) */
export function clampBps(bps: number | null, fallback: number): number {
  if (bps === null || !Number.isFinite(bps)) return fallback
  return Math.min(10_000, Math.max(0, Math.round(bps)))
}

/**
 * profile → phương pháp đã áp mốc người dùng chỉnh.
 *
 * Chịu được dữ liệu lạ mà không làm trắng màn, giống `parseDensity()`: `budget_method`
 * là cột text (id lạ → 50/30/20), `budget_targets` là jsonb (không phải object, hoặc
 * giá trị không phải số → bỏ qua khoá đó). Khoá THIẾU nghĩa là "theo mặc định của
 * phương pháp" — nên đổi mặc định trong code thì người chưa chỉnh đi theo luôn.
 */
export function resolveMethod(
  profile: Pick<ProfileRow, 'budget_method' | 'budget_targets'> | null | undefined,
): BudgetMethod {
  const method = BUDGET_METHODS.find((m) => m.id === profile?.budget_method) ?? DEFAULT_METHOD
  const raw = profile?.budget_targets
  const overrides: Record<string, number> =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  return {
    ...method,
    buckets: method.buckets.map((b) => {
      const v = overrides[b.key]
      return typeof v === 'number' ? { ...b, bps: clampBps(v, b.bps) } : b
    }),
  }
}

/**
 * Khoản chứa một nhãn — nguồn DUY NHẤT của phép "danh mục này thuộc khoản nào",
 * dùng chung cho `axisSlices` và `planGroups` để hai bên khớp nhau từng đồng.
 *
 * Nhãn null ở phương pháp `allExpense` vẫn có nhà (mọi khoản chi đều được đếm);
 * ở phương pháp `needs` thì null = chưa phân loại → trả null.
 */
export function bucketForNeed(method: BudgetMethod, level: NeedLevel | null): MethodBucket | null {
  if (level !== null) {
    const owner = method.buckets.find(
      (b) => b.source.kind === 'needs' && b.source.levels.includes(level),
    )
    if (owner) return owner
  }
  return method.buckets.find((b) => b.source.kind === 'allExpense') ?? null
}
