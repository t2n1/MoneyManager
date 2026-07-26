// Hạn mức theo TRỤC chi (thiết yếu / linh hoạt / tiết kiệm) — thuần, test được.
//
// Ngân sách theo danh mục trả lời "tháng này ăn uống bao nhiêu là đủ".
// Ngân sách theo trục trả lời câu khác hẳn: "cơ cấu chi của mình có lành mạnh
// không" — và nó dùng lại đúng need_level đã gắn cho danh mục lá, nên người
// dùng không phải khai báo thêm lần nào nữa.

import type { ClassificationBreakdown } from '../reports/aggregate'

export type AxisKey = 'essential' | 'flexible' | 'savings'

export interface AxisTargets {
  /** trần chi thiết yếu, basis points của thu nhập (5000 = 50%) */
  essentialBps: number
  /** trần chi linh hoạt */
  flexibleBps: number
  /** SÀN tiết kiệm — mốc cần vượt, không phải trần */
  savingsBps: number
}

/** Quy tắc 50/30/20 — chỉ là điểm khởi đầu, người dùng sửa trong Cài đặt. */
export const DEFAULT_AXIS_TARGETS: AxisTargets = {
  essentialBps: 5000,
  flexibleBps: 3000,
  savingsBps: 2000,
}

export interface AxisLine {
  key: AxisKey
  /** số tiền thực tế trong kỳ (base minor); tiết kiệm có thể ÂM */
  actual: number
  /** mốc quy ra tiền (base minor) */
  target: number
  /** actual / thu nhập */
  share: number
  /** mốc dưới dạng tỷ lệ (0..1) */
  targetShare: number
  /** 'cap' = càng thấp càng tốt · 'floor' = càng cao càng tốt */
  direction: 'cap' | 'floor'
  /** đã đạt mốc chưa (bằng đúng mốc = đạt) */
  ok: boolean
}

export interface AxisProgress {
  lines: AxisLine[]
  income: number
  /** chi chưa gắn need_level — hai dòng đầu chưa bao gồm phần này */
  unclassified: number
}

/**
 * So chi thực tế với mốc theo trục. `income` <= 0 → null: không có mẫu số thì
 * mọi tỷ lệ đều vô nghĩa, thà không hiện còn hơn hiện số sai.
 *
 * Tiết kiệm = thu − TỔNG chi (kể cả phần chưa phân loại), nên nó luôn đúng kể
 * cả khi người dùng chưa gắn nhãn cho danh mục nào.
 */
export function axisProgress(
  income: number,
  data: ClassificationBreakdown,
  targets: AxisTargets,
): AxisProgress | null {
  if (income <= 0) return null

  const line = (
    key: AxisKey,
    actual: number,
    bps: number,
    direction: 'cap' | 'floor',
  ): AxisLine => {
    const targetShare = bps / 10_000
    const target = Math.round(income * targetShare)
    return {
      key,
      actual,
      target,
      share: actual / income,
      targetShare,
      direction,
      ok: direction === 'cap' ? actual <= target : actual >= target,
    }
  }

  return {
    income,
    unclassified: data.needUnclassified,
    lines: [
      line('essential', data.needEssential, targets.essentialBps, 'cap'),
      line('flexible', data.needFlexible, targets.flexibleBps, 'cap'),
      line('savings', income - data.totalExpense, targets.savingsBps, 'floor'),
    ],
  }
}
