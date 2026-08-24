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
 * "+23%" · "−14%" · "−37,3%" · "±0%" · "—".
 *
 * Gom vào đây vì bốn màn cần đúng chuỗi này (bảng danh mục, bảng so cùng số ngày, bảng theo
 * năm, rổ quen thuộc) và mỗi màn tự viết là bốn quy ước dấu khác nhau. `null` = KHÔNG so
 * được, và nó phải in "—" chứ không in "0%": một danh mục mới không "đi ngang", nó chưa có
 * mốc để so.
 *
 * Hai chi tiết dễ mất nếu để nơi gọi tự dựng chuỗi:
 *   · dấu ÂM THẬT (−, U+2212), không phải hyphen. Trong dãy mono hyphen ngắn hơn dấu cộng
 *     nên hai dòng liền nhau đọc ra lệch nhau.
 *   · dấu THẬP PHÂN kiểu Việt (phẩy). `${-37.3}` của JS ra "-37.3" — vừa sai dấu âm vừa
 *     sai dấu thập phân, ngay trong một app mà mọi số tiền khác đều dùng phẩy.
 */
export function signedPct(pct: number | null): string {
  if (pct === null) return '—'
  if (pct === 0) return '±0%'
  const abs = Math.abs(pct)
  const body = Number.isInteger(abs) ? String(abs) : String(abs).replace('.', ',')
  return `${pct > 0 ? '+' : '−'}${body}%`
}

/** Tông của một Δ chi tiêu: TĂNG chi là tông chi, giảm chi là tông thu. */
/**
 * Tỷ lệ (0,585) → phần trăm làm tròn một chữ số (58,5), để đưa vào `signedPct`.
 *
 * `signedPct` cố ý KHÔNG tự làm tròn: chỗ gọi mới biết bao nhiêu chữ số là có nghĩa (bảng
 * so tháng dùng số nguyên, tỷ suất đầu tư cần một chữ số). Nhưng "một chữ số" là bậc hay
 * dùng nhất và tự viết `Math.round(x * 1000) / 10` tại chỗ là chỗ dễ lệch bậc — đã có ba
 * bản chép tay của đúng biểu thức này trong features/assets và features/reports.
 */
export function pct1(ratio: number): number {
  return Math.round(ratio * 1000) / 10
}

export function deltaTone(pct: number | null): NumTone {
  if (pct === null || pct === 0) return 'muted'
  return pct > 0 ? 'out' : 'in'
}
