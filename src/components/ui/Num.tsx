// Con số KHÔNG phải tiền: phần trăm, số lần, tỷ lệ, Δ%, số ngày.
//
// Vì sao cần primitive riêng cạnh <Money>: bản 1a đưa MỌI con số sang mono + `tabular-nums`
// (§1.2 — "mọi con số tiền, ngày, %, mã tháng"), nhưng <Money> định dạng theo loại tiền nên
// không dùng được cho "46%" hay "68 lần". Kết quả là mỗi bảng lại viết tay
// `font-mono text-xs tabular-nums` một lần nữa, và `designSystem.test.ts` đếm đúng chuyện
// đó: ngưỡng `tabular-nums` là ngưỡng CHỈ ĐƯỢC GIẢM, nên mỗi bảng mới là một lần đội trần.
//
// Ba việc nó làm, và không làm gì thêm: cột số thẳng hàng (`tabular-nums`), chữ mono, và
// dấu ÂM thật (−, U+2212) thay hyphen — §G của gói việc đòi vậy cho cột số mono, còn
// hyphen trong dãy mono thì ngắn hơn dấu cộng nên hai dòng liền nhau đọc ra lệch nhau.

import type { ReactNode } from 'react'

export type NumTone = 'neutral' | 'muted' | 'in' | 'out' | 'warn'

const TONE: Record<NumTone, string> = {
  neutral: 'text-fg-primary',
  muted: 'text-fg-muted',
  in: 'text-money-in',
  out: 'text-money-out',
  warn: 'text-fg-warn',
}

interface Props {
  children: ReactNode
  tone?: NumTone
  className?: string
}

export function Num({ children, tone = 'neutral', className = '' }: Props) {
  return (
    <span className={`font-mono tabular-nums ${TONE[tone]} ${className}`.trim()}>{children}</span>
  )
}

/**
 * "+23%" · "−14%" · "±0%" · "—".
 *
 * Gom vào đây vì ba màn cần đúng chuỗi này (bảng danh mục, bảng so cùng số ngày, bảng
 * theo năm) và mỗi màn tự viết là ba quy ước dấu khác nhau. `null` = KHÔNG so được, và nó
 * phải in "—" chứ không in "0%": một danh mục mới không "đi ngang", nó chưa có mốc để so.
 */
export function signedPct(pct: number | null): string {
  if (pct === null) return '—'
  if (pct === 0) return '±0%'
  return `${pct > 0 ? '+' : '−'}${Math.abs(pct)}%`
}

/** Tông của một Δ chi tiêu: TĂNG chi là tông chi, giảm chi là tông thu. */
export function deltaTone(pct: number | null): NumTone {
  if (pct === null || pct === 0) return 'muted'
  return pct > 0 ? 'out' : 'in'
}
