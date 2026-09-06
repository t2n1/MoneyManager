// Sơ đồ dòng tiền của kỳ — SVG viết tay, không qua Recharts.
//
// VÌ SAO VIẾT TAY: Recharts không có Sankey, và cái khó ở đây không phải vẽ mà là RÀNG
// BUỘC CÂN BẰNG (mọi cột cộng đúng bằng tiền vào) — thứ đã nằm trọn trong sankey.ts và
// có test. Phần còn lại chỉ là <path>. Đổi lại được một thứ Recharts không cho: màu đi
// bằng class Tailwind nên tự lật theo `.dark` (§"Màu biểu đồ", ngoại lệ SVG viết tay).
//
// CHỮ TRONG SVG: dùng `formatMoney` chứ không dùng <Money> (component nhả <span>, không
// đặt trong <text> được). `formatMoney` vẫn tôn trọng chế độ riêng tư vì nó tự đọc
// `isPrivacyEnabled()`; thứ nó KHÔNG tự làm là vẽ lại khi người dùng bật/tắt — nên
// component phải gọi `usePrivacyMode()` để đăng ký. Bỏ dòng đó thì số tiền vẫn nằm đó
// sau khi bấm nút che, và đó đúng là lỗi mà chế độ riêng tư sinh ra để chặn.

import { useId, useState } from 'react'
import { Card, Num, SectionTitle } from '../../components/ui'
import { Guide } from '../../components/Guide'
import { formatMoney, type CurrencyCode } from '../../lib/money'
import { CHART_TEXT_3XS, CHART_TEXT_2XS } from '../../lib/chartText'
import { usePrivacyMode } from '../../lib/privacy'
import {
  buildSankey,
  labelPlan,
  type LabelLines,
  type SankeyInput,
  type SankeyNode,
  type SankeyTone,
} from './sankey'

/** Màu thân nút. Trùng đúng bảng của OutflowTiersCard để hai hình cạnh nhau không lệch. */
const NODE_FILL: Record<SankeyTone, string> = {
  in: 'fill-money-in',
  deficit: 'fill-fg-warn',
  hub: 'fill-fg-secondary',
  expense: 'fill-money-out',
  transfer: 'fill-fg-warn',
  kept: 'fill-money-in',
  unknown: 'fill-fg-muted',
}

/**
 * Dải nối tô NHẠT hơn thân nút rất nhiều: dải là phần lớn diện tích hình, để đậm thì
 * nhãn chữ nằm đè lên không đọc được, và mắt bám vào đường đi thay vì vào độ dày.
 */
const LINK_FILL: Record<SankeyTone, string> = {
  in: 'fill-money-in/20',
  deficit: 'fill-fg-warn/20',
  hub: 'fill-fg-secondary/20',
  expense: 'fill-money-out/20',
  transfer: 'fill-fg-warn/20',
  kept: 'fill-money-in/20',
  unknown: 'fill-fg-muted/20',
}

/** Nhãn chữ có viền nền phía sau để đọc được khi nằm đè lên dải. */
const HALO = {
  paintOrder: 'stroke' as const,
  stroke: 'var(--surface)',
  strokeWidth: 3,
  strokeLinejoin: 'round' as const,
}

interface Props extends SankeyInput {
  base: CurrencyCode
  /** Tổng có ngoại tệ quy đổi → tiền tố ≈ (cùng quy ước với <Money approx>). */
  approx?: boolean
}

export function SankeyCard({ base, approx = false, ...input }: Props) {
  // Đăng ký chế độ riêng tư — xem ghi chú đầu file. Giá trị không dùng tới, việc của nó
  // là buộc component vẽ lại khi người dùng bấm nút che số.
  usePrivacyMode()
  const [active, setActive] = useState<string | null>(null)
  const titleId = useId()
  const model = buildSankey(input)

  if (model === null) return null
  const { nodes, links, width, height, total, hasDeficit } = model

  /** Dải có dính tới nút đang trỏ không. null = không trỏ nút nào, mọi dải đậm như nhau. */
  const lit = (source: string, target: string) =>
    active === null || active === source || active === target

  const money = (v: number) => `${approx ? '≈ ' : ''}${formatMoney(v, base)}`
  const plan = labelPlan(nodes)

  return (
    <Card as="section" elevation="panel" padding="panel">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
        <SectionTitle as="h3" id={titleId} className="min-w-0">
          Đường đi của tiền
        </SectionTitle>
        <span className="shrink-0 text-2xs text-fg-muted">% trên tiền vào</span>
      </div>

      {/* Hình rộng hơn màn điện thoại là chuyện đã biết trước, không phải lỗi bố cục:
          bốn cột chữ không nhét vừa 360px mà vẫn đọc được. Cho cuộn NGANG TRONG THẺ để
          trang không bao giờ cuộn ngang theo. */}
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-auto w-full min-w-[38rem]"
          role="img"
          aria-labelledby={titleId}
        >
          {links.map((l) => (
            <path
              key={l.id}
              d={l.path}
              className={`${LINK_FILL[l.tone]} transition-opacity`}
              opacity={lit(l.source, l.target) ? 1 : 0.25}
            />
          ))}

          {nodes.map((n) => (
            <NodeMark
              key={n.id}
              node={n}
              width={width}
              money={money}
              lines={plan.get(n.id) ?? 0}
              dim={active !== null && active !== n.id}
              onEnter={() => setActive(n.id)}
              onLeave={() => setActive(null)}
            />
          ))}
        </svg>
      </div>

      <p className="mt-1 text-sm text-fg-secondary">
        Tiền vào <b>{money(total)}</b>
        {hasDeficit ? (
          <>
            {' — trong đó '}
            <b className="text-fg-warn">{money(nodeValue(nodes, 'in:deficit'))}</b> lấy từ số dư
            sẵn có, vì kỳ này chi nhiều hơn thu.
          </>
        ) : (
          <>
            {', giữ lại '}
            <b className="text-money-in">
              <Num>{pctOf(nodes, 'tier:kept')}</Num>%
            </b>
            .
          </>
        )}
      </p>

      <Guide className="mt-1.5 text-2xs text-fg-muted">
        Đọc từ trái sang: tiền vào từ đâu → chia làm ba đường → khúc “Chi tiêu” vỡ ra theo{' '}
        <b>nhóm danh mục</b>. Mọi phần trăm đều lấy <b>tiền vào</b> làm mẫu số, nên các con số
        trên cùng một hình cộng trừ được với nhau. Trỏ vào một nút để làm nổi đường của riêng nó.
        Mỗi cột chỉ hiện vài mục lớn nhất, phần còn lại gộp thành “Khác”.
      </Guide>
    </Card>
  )
}

function nodeValue(nodes: readonly SankeyNode[], id: string): number {
  return nodes.find((n) => n.id === id)?.value ?? 0
}

function pctOf(nodes: readonly SankeyNode[], id: string): number {
  return nodes.find((n) => n.id === id)?.pct ?? 0
}

function NodeMark({
  node,
  width,
  money,
  lines,
  dim,
  onEnter,
  onLeave,
}: {
  node: SankeyNode
  width: number
  money: (v: number) => string
  lines: LabelLines
  dim: boolean
  onEnter: () => void
  onLeave: () => void
}) {
  // Cột cuối viết nhãn sang TRÁI: viết sang phải thì chữ tràn khỏi viewBox.
  const last = node.x1 >= width - 0.5
  const tx = last ? node.x0 - 6 : node.x1 + 6
  const anchor = last ? 'end' : 'start'
  const cy = (node.y0 + node.y1) / 2

  return (
    <g
      className="cursor-default transition-opacity"
      opacity={dim ? 0.45 : 1}
      tabIndex={0}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={onEnter}
      onBlur={onLeave}
    >
      <title>
        {node.label} · {money(node.value)}
        {node.pct === null ? '' : ` · ${node.pct}%`}
      </title>
      <rect
        x={node.x0}
        y={node.y0}
        width={node.x1 - node.x0}
        height={node.y1 - node.y0}
        rx={2}
        className={NODE_FILL[node.tone]}
      />
      {lines > 0 && (
        <text
          x={tx}
          y={lines === 2 ? cy - 2 : cy + 3}
          textAnchor={anchor}
          style={{ fontSize: lines === 2 ? CHART_TEXT_2XS : CHART_TEXT_3XS, ...HALO }}
          className="fill-fg-primary font-medium"
        >
          {node.label}
        </text>
      )}
      {lines === 2 && (
        <text
          x={tx}
          y={cy + 11}
          textAnchor={anchor}
          style={{ fontSize: CHART_TEXT_3XS, ...HALO }}
          className="fill-fg-muted font-mono"
        >
          {money(node.value)}
          {node.pct === null ? '' : ` · ${node.pct}%`}
        </text>
      )}
    </g>
  )
}
