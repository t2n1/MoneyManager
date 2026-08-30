// Dải tiêu đề của một panel — chữ hoa nhỏ trên nền chrome, kẻ dưới.
//
// Vì sao tách ra: đợt vẽ lại Cài đặt (2026-08-30) dựng đúng dải này ở NĂM chỗ — ba thẻ
// của trang Dữ liệu, thẻ Sao lưu, và bốn thẻ của trang Chung. Mỗi chỗ chép lại chuỗi
// `border-b border-border-panel bg-surface-chrome px-3 py-2.5`, và chép tay thì chỉ cần
// một chỗ gõ `py-2` là bốn thẻ nằm cạnh nhau cao lệch nhau 4px.
//
// Chỉ dùng với `<Card elevation="panel" padding="none">`: dải này TỰ mang padding ngang
// của nó, nên thẻ bọc phải không có padding, không thì lề cộng đôi.
import type { ReactNode } from 'react'
import { SectionTitle } from './SectionTitle'

interface Props {
  children: ReactNode
  /** Mép phải — con số, chú thích ngắn, hoặc một nút nhỏ. */
  right?: ReactNode
  className?: string
}

export function PanelHeader({ children, right, className = '' }: Props) {
  return (
    <div
      className={`flex items-center justify-between gap-2 border-b border-border-panel bg-surface-chrome px-3 py-2.5 ${className}`.trim()}
    >
      <SectionTitle role="micro" className="min-w-0 truncate">
        {children}
      </SectionTitle>
      {right && <span className="shrink-0 text-2xs text-fg-muted">{right}</span>}
    </div>
  )
}
