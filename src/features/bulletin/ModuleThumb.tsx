// Hình minh hoạ nhỏ của từng loại module trong bảng "Thêm module" — một bản vẽ SƠ ĐỒ
// (không phải ảnh chụp, không có số): đủ để nhận ra "à, cái vành khuyên", "cái danh sách",
// trước khi đọc chữ. Vẽ bằng SVG với màu qua token (fill-*/stroke-*), nên tự đúng ở Sáng,
// Tối và E-ink mà không cần ba bộ ảnh.
//
// Cả khung 64×40, mọi hình nằm trong lề 6 đơn vị. Thêm loại module mới mà quên hình ở đây
// là lỗi biên dịch — `DRAW` khai theo `Record<ModuleType, …>`.
import type { ReactNode } from 'react'
import type { ModuleType } from './board'

const bar = (x: number, h: number, cls: string, w = 4) => <rect x={x} y={34 - h} width={w} height={h} rx={1} className={cls} />
const line = (y: number, w: number, cls = 'fill-border-strong', x = 6, h = 3) => <rect x={x} y={y} width={w} height={h} rx={1.5} className={cls} />

const DRAW: Record<ModuleType, ReactNode> = {
  today: (
    <>
      {line(7, 28, 'fill-fg-primary', 6, 6)}
      {line(19, 52)}
      {line(27, 52)}
      {line(27, 18, 'fill-accent')}
    </>
  ),
  kpi: (
    <>
      {[6, 20, 34, 48].map((x, i) => (
        <g key={x}>
          <rect x={x} y={8} width={11} height={24} rx={2} className="fill-surface stroke-border-strong" strokeWidth={0.8} />
          {line(12, 7, i === 0 ? 'fill-money-in' : i === 1 ? 'fill-money-out' : 'fill-fg-muted', x + 2, 3)}
          {line(24, 7, 'fill-border-strong', x + 2, 2)}
        </g>
      ))}
    </>
  ),
  spending: (
    <>
      {[6, 14, 22, 30, 38, 46].map((x, i) => (
        <g key={x}>
          {bar(x, 8 + ((i * 5) % 12), 'fill-money-in', 3)}
          {bar(x + 3.5, 6 + ((i * 7) % 14), 'fill-money-out', 3)}
        </g>
      ))}
      {bar(54, 22, 'fill-money-out', 4)}
    </>
  ),
  recent: (
    <>
      {[8, 18, 28].map((y) => (
        <g key={y}>
          <circle cx={9} cy={y + 1.5} r={2.5} className="fill-border-strong" />
          {line(y, 26, 'fill-fg-muted', 15)}
          {line(y, 10, 'fill-money-out', 48)}
        </g>
      ))}
    </>
  ),
  todo: (
    <>
      {[8, 18, 28].map((y, i) => (
        <g key={y}>
          <rect x={6} y={y - 1} width={5} height={5} rx={1.5} className={i === 0 ? 'fill-accent' : 'fill-none stroke-border-strong'} strokeWidth={1} />
          {line(y, i === 1 ? 30 : 38, 'fill-fg-muted', 15)}
        </g>
      ))}
    </>
  ),
  budget: (
    <>
      {[8, 18, 28].map((y, i) => (
        <g key={y}>
          {line(y, 52, 'fill-border-strong', 6, 4)}
          {line(y, [40, 22, 50][i], i === 2 ? 'fill-fg-warn' : 'fill-accent', 6, 4)}
        </g>
      ))}
    </>
  ),
  drift: (
    <>
      <polyline points="6,22 16,20 26,21 36,17 46,18 58,14" className="fill-none stroke-money-in" strokeWidth={2} strokeLinecap="round" />
      <polyline points="6,30 16,29 26,27 36,28 46,25 58,24" className="fill-none stroke-money-out" strokeWidth={2} strokeLinecap="round" />
    </>
  ),
  accounts: (
    <>
      {line(6, 22, 'fill-fg-primary', 6, 5)}
      {[16, 23, 30].map((y) => (
        <g key={y}>
          <circle cx={8} cy={y + 1.5} r={2} className="fill-fg-muted" />
          {line(y, 22, 'fill-border-strong', 13)}
          {line(y, 12, 'fill-fg-muted', 46)}
        </g>
      ))}
    </>
  ),
  quyenloi: (
    <>
      {[10, 24].map((y, i) => (
        <g key={y}>
          {line(y, 24, 'fill-fg-muted', 6)}
          <rect x={40} y={y - 2} width={18} height={7} rx={3.5} className={i === 0 ? 'fill-state-good-bg' : 'fill-state-warn-bg'} />
          {line(y, 10, i === 0 ? 'fill-state-good-fg' : 'fill-state-warn-fg', 44, 3)}
        </g>
      ))}
    </>
  ),
  reliability: (
    <>
      <circle cx={20} cy={20} r={11} className="fill-none stroke-border-strong" strokeWidth={4} />
      <circle cx={20} cy={20} r={11} className="fill-none stroke-accent" strokeWidth={4} strokeDasharray="52 70" transform="rotate(-90 20 20)" />
      {line(12, 22, 'fill-fg-muted', 36)}
      {line(19, 16, 'fill-border-strong', 36)}
      {line(26, 20, 'fill-border-strong', 36)}
    </>
  ),
  cashflow: (
    <>
      {[6, 16, 26, 36, 46].map((x, i) => (
        <g key={x}>
          {bar(x, 18 + ((i * 3) % 6), 'fill-money-in')}
          {bar(x + 4.5, 10 + ((i * 5) % 10), 'fill-money-out')}
        </g>
      ))}
      <rect x={6} y={34} width={52} height={0.8} className="fill-border-strong" />
    </>
  ),
  categories: (
    <>
      <circle cx={20} cy={20} r={10} className="fill-none stroke-accent" strokeWidth={6} strokeDasharray="30 63" transform="rotate(-90 20 20)" />
      <circle cx={20} cy={20} r={10} className="fill-none stroke-money-out" strokeWidth={6} strokeDasharray="18 63" strokeDashoffset={-30} transform="rotate(-90 20 20)" />
      <circle cx={20} cy={20} r={10} className="fill-none stroke-fg-warn" strokeWidth={6} strokeDasharray="15 63" strokeDashoffset={-48} transform="rotate(-90 20 20)" />
      {[12, 19, 26].map((y, i) => (
        <g key={y}>
          <circle cx={39} cy={y + 1.5} r={1.8} className={['fill-accent', 'fill-money-out', 'fill-fg-warn'][i]} />
          {line(y, 15, 'fill-fg-muted', 43)}
        </g>
      ))}
    </>
  ),
  cumulative: (
    <>
      <path d="M6 34 L14 31 L22 28 L30 23 L38 20 L46 15 L52 13 L52 34 Z" className="fill-accent-soft" />
      <polyline points="6,34 14,31 22,28 30,23 38,20 46,15 52,13" className="fill-none stroke-accent" strokeWidth={2} strokeLinejoin="round" />
      <line x1={6} y1={9} x2={58} y2={9} className="stroke-fg-muted" strokeWidth={1} strokeDasharray="3 2" />
    </>
  ),
  networth: (
    <>
      <path d="M6 30 L16 27 L26 28 L36 21 L46 18 L58 11 L58 34 L6 34 Z" className="fill-accent-soft" />
      <polyline points="6,30 16,27 26,28 36,21 46,18 58,11" className="fill-none stroke-accent" strokeWidth={2} strokeLinejoin="round" />
    </>
  ),
  assetMix: (
    <>
      <circle cx={20} cy={20} r={10} className="fill-none stroke-accent" strokeWidth={6} strokeDasharray="40 63" transform="rotate(-90 20 20)" />
      <circle cx={20} cy={20} r={10} className="fill-none stroke-fg-muted" strokeWidth={6} strokeDasharray="23 63" strokeDashoffset={-40} transform="rotate(-90 20 20)" />
      {line(12, 17, 'fill-accent', 38, 4)}
      {line(20, 17, 'fill-fg-muted', 38, 4)}
      {line(28, 11, 'fill-border-strong', 38, 4)}
    </>
  ),
}

/** Hình sơ đồ 64×40 của một loại module. Trang trí — `aria-hidden`, chữ bên cạnh đã nói đủ. */
export function ModuleThumb({ type }: { type: ModuleType }) {
  return (
    <svg viewBox="0 0 64 40" className="h-10 w-16 shrink-0 rounded-md border border-border-panel bg-surface-sunken" aria-hidden>
      {DRAW[type]}
    </svg>
  )
}
