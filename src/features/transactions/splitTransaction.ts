// Chia một giao dịch thành nhiều dòng — thuần, không React, để unit-test được.
//
// VÌ SAO CÓ FILE NÀY: một lần đi siêu thị ¥8.400 gồm đồ ăn và đồ dùng nhà. Trước nay
// phải chọn MỘT danh mục cho cả khoản, nên hoặc "Ăn uống" phồng lên vì mấy cuộn giấy,
// hoặc phải nhớ tách tay lúc ghi — mà lúc ghi thì đang đứng ở quầy.
//
// CÁCH LÀM: thay một dòng bằng N dòng cộng lại ĐÚNG bằng nó. Không dựng quan hệ cha–con
// trong DB: app này coi một giao dịch là một lá, và mọi phép tổng (aggregate.ts, ngân
// sách, báo cáo, MCP) đều cộng lá. Thêm một tầng cha thì phải dạy lại tất cả những chỗ
// đó biết "đừng cộng dòng cha", mà bỏ sót một chỗ là tổng chi nhân đôi trong im lặng.
//
// RÀNG BUỘC PHẢI GIỮ: tổng các phần = số gốc, KHÔNG sai một đồng. Vì thế phần cuối lấy
// số DƯ chứ không lấy số người dùng gõ — xem `planSplit`.

export interface SplitPart {
  /** minor units, cùng đơn vị với giao dịch gốc. Phải > 0. */
  amount: number
  categoryId: string | null
  note: string
}

export interface SplitPlan {
  parts: SplitPart[]
  /** Phần chưa phân bổ. 0 = vừa khít. Âm = đã gõ quá số gốc. */
  remainder: number
  /** Chia được hay không, kèm lý do để UI hiện thẳng. */
  error: string | null
}

/** Số phần tối thiểu — chia làm một là không chia. */
export const MIN_PARTS = 2

/**
 * Dựng kế hoạch chia từ những con số người dùng đang gõ.
 *
 * PHẦN CUỐI LẤY SỐ DƯ, không lấy số đã gõ. Người dùng gõ 8.400 → 3.000 + 5.400 thì hai
 * số đó cộng đúng; nhưng gõ 1/3 của 10.000 ba lần thì 3.333×3 = 9.999, thiếu một đồng.
 * Một đồng đó không được phép biến mất: nó làm tổng chi của tháng lệch với số dư tài
 * khoản, và đó đúng là lớp lỗi mà cả app này được dựng để tránh.
 */
export function planSplit(total: number, inputs: readonly SplitPart[]): SplitPlan {
  const parts = inputs.map((p) => ({ ...p }))
  if (parts.length < MIN_PARTS) {
    return { parts, remainder: total, error: `Cần ít nhất ${MIN_PARTS} phần.` }
  }
  if (total <= 0) {
    return { parts, remainder: 0, error: 'Chỉ chia được khoản có số tiền dương.' }
  }

  // Mọi phần TRỪ phần cuối lấy đúng số đã gõ; phần cuối nhận số dư.
  const head = parts.slice(0, -1)
  const daGo = head.reduce((s, p) => s + Math.max(0, Math.round(p.amount)), 0)
  const remainder = total - daGo

  const out = head.map((p) => ({ ...p, amount: Math.max(0, Math.round(p.amount)) }))
  out.push({ ...parts[parts.length - 1], amount: remainder })

  if (out.some((p) => p.amount <= 0)) {
    return {
      parts: out,
      remainder,
      error:
        remainder <= 0
          ? 'Các phần đầu đã dùng hết (hoặc quá) số tiền gốc.'
          : 'Mỗi phần phải lớn hơn 0.',
    }
  }
  return { parts: out, remainder, error: null }
}

/** Tổng của một kế hoạch — dùng để khẳng định bất biến ở nơi gọi và trong test. */
export function splitTotal(plan: SplitPlan): number {
  return plan.parts.reduce((s, p) => s + p.amount, 0)
}

/**
 * Chia đều `total` thành `n` phần, phần cuối gánh số dư.
 *
 * Nút "chia đều" là thứ người ta bấm trước tiên, và nó phải cho ra một kết quả CỘNG
 * ĐÚNG ngay lập tức — không phải một bộ số gần đúng để rồi tự sửa.
 */
export function evenSplit(total: number, n: number): number[] {
  if (n < 1 || total <= 0) return []
  const base = Math.floor(total / n)
  const out = Array.from({ length: n }, () => base)
  out[n - 1] = total - base * (n - 1)
  return out
}
