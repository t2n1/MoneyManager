// Bộ danh mục chi tiêu kiểu Nhật (nhãn tiếng Việt) cho người Việt sống ở Nhật.
// Dùng cho nút "Thêm bộ danh mục Nhật": CHỈ bổ sung mục còn thiếu, không sửa/xóa.
// planJapanPreset là hàm thuần (test được); repo dùng nó để biết cần tạo gì.

import { normalizeText } from '../transactions/filter'
import type { CategoryRow, CategoryType } from '../../types/database.types'

export interface PresetChild {
  name: string
  icon: string
}

export interface PresetParent {
  name: string
  icon: string
  type: CategoryType
  children: PresetChild[]
}

/** Bộ danh mục kiểu Nhật. Cha có thể trùng danh mục sẵn có (Ăn uống, Đi lại…) →
 *  khi đó tái dùng cha, chỉ thêm con còn thiếu. */
export const JAPAN_PRESET: PresetParent[] = [
  {
    name: 'Nhà ở',
    icon: '🏠',
    type: 'expense',
    children: [
      { name: 'Tiền nhà', icon: '🏠' },
      { name: 'Phí quản lý', icon: '🧾' },
      { name: 'Gas', icon: '🔥' },
    ],
  },
  {
    name: 'Đi lại',
    icon: '🚆',
    type: 'expense',
    children: [
      { name: 'Vé tháng', icon: '🎫' },
      { name: 'Nạp IC', icon: '🚆' },
    ],
  },
  {
    name: 'Hóa đơn & tiện ích',
    icon: '🧾',
    type: 'expense',
    children: [{ name: 'NHK', icon: '📺' }],
  },
  {
    name: 'Ăn uống',
    icon: '🍜',
    type: 'expense',
    children: [{ name: 'Konbini', icon: '🏪' }],
  },
  {
    name: 'Bảo hiểm & lương hưu',
    icon: '🛡️',
    type: 'expense',
    children: [
      { name: 'Bảo hiểm y tế', icon: '🏥' },
      { name: 'Nenkin', icon: '👴' },
    ],
  },
  {
    name: 'Thuế',
    icon: '🏛️',
    type: 'expense',
    children: [
      { name: 'Thuế thị dân', icon: '🏛️' },
      { name: 'Thuế thu nhập', icon: '🧾' },
    ],
  },
  {
    name: 'Về Việt Nam',
    icon: '✈️',
    type: 'expense',
    children: [
      { name: 'Gửi tiền về VN', icon: '💸' },
      { name: 'Vé máy bay về VN', icon: '✈️' },
    ],
  },
  {
    name: 'Làm thêm',
    icon: '💵',
    type: 'income',
    children: [],
  },
  {
    name: 'Hoàn thuế',
    icon: '🧧',
    type: 'income',
    children: [],
  },
]

export interface PresetPlan {
  parentsToCreate: { name: string; icon: string; type: CategoryType }[]
  childrenToCreate: { name: string; icon: string; type: CategoryType; parentName: string }[]
}

/** So bộ Nhật với danh mục hiện có (khớp theo tên chuẩn hóa + loại) → cái còn thiếu.
 *  Cha đã tồn tại thì tái dùng; con đã tồn tại (bất kể cha nào) thì bỏ qua. */
export function planJapanPreset(existing: CategoryRow[]): PresetPlan {
  const key = (name: string, type: CategoryType) => `${type}::${normalizeText(name)}`
  const have = new Set(existing.map((c) => key(c.name, c.type)))

  const parentsToCreate: PresetPlan['parentsToCreate'] = []
  const childrenToCreate: PresetPlan['childrenToCreate'] = []

  for (const p of JAPAN_PRESET) {
    if (!have.has(key(p.name, p.type))) {
      parentsToCreate.push({ name: p.name, icon: p.icon, type: p.type })
    }
    for (const ch of p.children) {
      if (!have.has(key(ch.name, p.type))) {
        childrenToCreate.push({
          name: ch.name,
          icon: ch.icon,
          type: p.type,
          parentName: p.name,
        })
      }
    }
  }

  return { parentsToCreate, childrenToCreate }
}
