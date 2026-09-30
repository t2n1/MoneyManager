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
  sharedFund: (
    <>
      {line(7, 52, 'fill-border-strong', 6, 4)}
      {line(7, 30, 'fill-accent', 6, 4)}
      {[17, 24, 31].map((y, i) => (
        <g key={y}>
          {line(y, 22, 'fill-fg-muted', 6)}
          {line(y, 10, i === 2 ? 'fill-money-out' : 'fill-money-in', 48)}
        </g>
      ))}
    </>
  ),
  tagBudgets: (
    <>
      {[8, 19, 30].map((y, i) => (
        <g key={y}>
          <rect x={6} y={y - 1} width={8} height={5} rx={2.5} className={['fill-accent', 'fill-fg-warn', 'fill-money-in'][i]} />
          {line(y, 40, 'fill-border-strong', 18, 3)}
          {line(y, [30, 14, 22][i], i === 0 ? 'fill-money-out' : 'fill-accent', 18, 3)}
        </g>
      ))}
    </>
  ),
  bigSpend: (
    <>
      {[48, 34, 24, 16].map((w, i) => (
        <g key={w}>{line(7 + i * 7, w, i === 0 ? 'fill-money-out' : 'fill-border-strong', 6, 4)}</g>
      ))}
    </>
  ),
  heatmap: (
    <>
      {Array.from({ length: 28 }, (_, i) => {
        const lv = [0, 1, 2, 1, 3, 0, 4, 2, 1, 0, 2, 3, 1, 2, 0, 1, 4, 2, 1, 3, 0, 2, 1, 1, 3, 2, 0, 1][i]
        const cls = ['fill-surface stroke-border-strong', 'fill-money-out opacity-25', 'fill-money-out opacity-50', 'fill-money-out opacity-75', 'fill-money-out'][lv]
        return <rect key={i} x={8 + (i % 7) * 7} y={6 + Math.floor(i / 7) * 7.5} width={5.5} height={5.5} rx={1} className={cls} strokeWidth={0.6} />
      })}
    </>
  ),
  bills: (
    <>
      {Array.from({ length: 21 }, (_, i) => (
        <rect key={i} x={8 + (i % 7) * 7} y={8 + Math.floor(i / 7) * 9} width={5.5} height={7} rx={1} className="fill-surface stroke-border-strong" strokeWidth={0.6} />
      ))}
      <circle cx={17.7} cy={11.5} r={1.6} className="fill-money-in" />
      <circle cx={38.7} cy={20.5} r={1.6} className="fill-money-out" />
      <circle cx={52.7} cy={29.5} r={1.6} className="fill-accent" />
    </>
  ),
  planned: (
    <>
      {[8, 18, 28].map((y, i) => (
        <g key={y}>
          <rect x={6} y={y - 1.5} width={6} height={6} rx={1} className={i === 0 ? 'fill-fg-warn' : 'fill-none stroke-border-strong'} strokeWidth={1} />
          {line(y, 24, 'fill-fg-muted', 16)}
          {line(y, 10, 'fill-border-strong', 48)}
        </g>
      ))}
    </>
  ),
  debts: (
    <>
      <rect x={6} y={7} width={24} height={12} rx={2} className="fill-state-bad-bg" />
      {line(11.5, 14, 'fill-money-out', 10, 3)}
      <rect x={34} y={7} width={24} height={12} rx={2} className="fill-state-good-bg" />
      {line(11.5, 14, 'fill-money-in', 38, 3)}
      {line(25, 26, 'fill-fg-muted', 6)}
      {line(25, 10, 'fill-money-out', 48)}
      {line(31, 22, 'fill-border-strong', 6)}
      {line(31, 10, 'fill-money-in', 48)}
    </>
  ),
  goals: (
    <>
      <circle cx={13} cy={14} r={5.5} className="fill-none stroke-accent" strokeWidth={1.6} />
      <circle cx={13} cy={14} r={2} className="fill-accent" />
      {line(10, 30, 'fill-fg-muted', 24)}
      {line(24, 52, 'fill-border-strong', 6, 4)}
      {line(24, 34, 'fill-accent', 6, 4)}
      {line(31, 20, 'fill-border-strong', 6, 2)}
    </>
  ),
  remittance: (
    <>
      <rect x={6} y={10} width={16} height={20} rx={2} className="fill-surface stroke-border-strong" strokeWidth={0.8} />
      {line(18, 8, 'fill-fg-muted', 10, 3)}
      <path d="M26 20 H40 M36 16 L40 20 L36 24" className="fill-none stroke-accent" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <rect x={42} y={10} width={16} height={20} rx={2} className="fill-state-good-bg" />
      {line(18, 8, 'fill-money-in', 46, 3)}
    </>
  ),
  health: (
    <>
      {line(9, 16, 'fill-fg-primary', 6, 8)}
      {line(24, 52, 'fill-border-strong', 6, 4)}
      {line(24, 22, 'fill-money-out', 6, 4)}
      {line(24, 12, 'fill-fg-warn', 28, 4)}
      {line(24, 18, 'fill-accent', 40, 4)}
      <polyline points="30,15 36,12 42,13 48,9 56,7" className="fill-none stroke-accent" strokeWidth={1.6} strokeLinecap="round" />
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
