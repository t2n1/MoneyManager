// "Chi đi vào đâu" vẽ theo DIỆN TÍCH — thẻ đứng ngay trên bảng danh mục của khối 02.
//
// VÌ SAO THÊM MỘT HÌNH NỮA CẠNH BẢNG: bản 26a đã gỡ ba thẻ cùng nói về chi theo danh mục
// vì chúng vẽ lại cùng bộ số bằng ba hình khác nhau, CÁCH NHAU NỬA MÀN HÌNH. Cái sai ở đó
// là khoảng cách, không phải việc có hình. Thẻ này đứng KỀ bảng và trả lời hai câu bảng
// không trả lời được:
//   · bảng phẳng và cắt ở 10 dòng — hình hiện đủ mọi danh mục;
//   · bảng không có tầng cha — hình gom "Nhà ở 39,9%" thành một khối đọc được trong một
//     cái liếc.
// Số thì lấy từ ĐÚNG mảng `rows` mà bảng đang hiện (xem `buildCategoryTreemap`), nên hai
// thẻ không bao giờ nói hai con số khác nhau.
//
// CHỮ TRONG SVG: `formatMoney` chứ không phải <Money> (component nhả <span>, không đặt
// trong <text> được), và phải gọi `usePrivacyMode()` để thẻ vẽ lại khi bấm nút che số —
// cùng cái bẫy đã ghi ở đầu SankeyCard.tsx.

import { useId, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, SectionTitle, SegmentedControl, type SegmentedItem } from '../../components/ui'
import { Guide } from '../../components/Guide'
import { GROUP_COLOR_NONE, GROUP_PALETTE } from '../assets/groupColors'
import { useBoxSize } from '../lifetime/useBoxSize'
import { CHART_TEXT_3XS, CHART_TEXT_2XS } from '../../lib/chartText'
import { formatMoney, type CurrencyCode } from '../../lib/money'
import { monthKeyString, type MonthKey } from '../../lib/dates'
import { usePrivacyMode } from '../../lib/privacy'
import {
  SMALL_GROUP_ID,
  buildCategoryTreemap,
  collapseSmallGroups,
  layoutFlat,
  layoutGrouped,
  type CategoryAmountRow,
  type CategoryTreeLike,
  type Rect,
} from './treemap'

type Mode = 'group' | 'flat'

const MODES: readonly SegmentedItem<Mode>[] = [
  { value: 'group', label: 'Theo nhóm' },
  { value: 'flat', label: 'Phẳng' },
]

/**
 * MỖI NHÓM CHA MỘT MÀU, lấy nguyên bảng của `assets/groupColors.ts` — không đẻ bảng thứ hai.
 *
 * Đây là lần chọn màu thứ hai. Lần đầu dùng thang một tông `--chart-slice-*` (cùng thang với
 * donut Cơ cấu bên Đầu tư): số đo tương phản đạt hết, nhưng mở app ra thì tám nhóm nằm trên
 * cùng một dải xanh dương nên hai nhóm cạnh nhau gần như cùng màu — tức là cái CÔNG DỤNG duy
 * nhất của màu ở hình này (phân biệt nhóm) không có. Thang tuần tự hợp với thứ có THỨ TỰ;
 * nhóm chi tiêu thì không.
 *
 * Bảng này đã phục vụ ba màn Tài sản, nên dùng lại là app có đúng một bộ màu phân loại thay
 * vì hai. Màu gán theo HẠNG của nhóm trong kỳ (nặng nhất lấy màu đầu), và gán từ danh sách
 * CHƯA gộp — nhờ vậy một danh mục giữ nguyên màu khi gạt qua lại giữa hai kiểu xếp.
 */
const groupColorAt = (i: number): string => GROUP_PALETTE[i % GROUP_PALETTE.length]

/**
 * NỀN ô tô mờ, VIỀN ô tô đặc cùng màu. Đo mới thấy, đừng đổi bằng mắt.
 *
 * Bảng màu là mã hex cố định (không lật theo chế độ Tối), nên nếu tô ĐẶC thì màu chữ phải
 * đổi theo từng ô — trắng trên tím đậm, đen trên vàng — và không có màu chữ nào đúng cho cả
 * mười hai. Tô mờ 0,30 giữ ô luôn gần màu nền thẻ, nên một màu chữ `--fg-primary` là đủ cho
 * mọi ô ở cả hai chế độ; VIỀN tô đặc lo việc "đâu là ranh giới một ô".
 *
 * Thử nghiệm trước đó tô mờ dần theo số tiền, và ô nhỏ nhất tụt xuống 1,2:1 với nền thẻ —
 * tàng hình đúng những ô cần chỉ ra. Nên độ đục là một HẰNG SỐ, không theo số tiền: diện
 * tích đã nói độ nặng rồi.
 *
 * 0,45 là TRẦN đo được, không phải con số chọn cho đẹp: ở 0,5 chữ trên ô tối nhất còn 5,4
 * và ở 0,6 tụt xuống 4,3 — trượt AA. 0,45 giữ chữ ở ~5,9 (Tối) / ~9,1 (Sáng) trên cả mười
 * hai màu, mà vẫn đủ đậm để ra màu chứ không ra một vệt xám ám màu.
 */
const FILL_ALPHA = 0.45

/** Khung nhóm chỉ là một vệt nền rất nhạt để mắt gom các ô con lại — chữ nằm trên nó. */
const FRAME_OPACITY = 0.1

/**
 * Viền nền cho chữ — CHỈ dùng cho chữ nằm trên khung nhóm (nền nhạt, gần màu thẻ).
 *
 * KHÔNG dùng cho nhãn trong ô: ô tô đặc, nên viền `--surface` quanh chữ `--fg-inverse` sẽ
 * vẽ một đường sáng quanh chữ trắng ở chế độ Sáng — đúng thứ làm chữ nhoè mà nó sinh ra để
 * chống.
 */
const HALO = {
  paintOrder: 'stroke' as const,
  stroke: 'var(--surface)',
  strokeWidth: 3,
  strokeLinejoin: 'round' as const,
}

/** Nhóm dưới ngưỡng này gom thành "Nhóm nhỏ khác" — dưới 1,5% là một sợi không đọc nổi. */
const MIN_GROUP_SHARE = 0.015

const GAP = 2

/**
 * Bề ngang một chữ, ước theo cỡ chữ. Không đo thật được vì chữ chưa vẽ ra lúc tính bố cục;
 * ước hụt thì nhãn bị cắt sớm một chữ, ước thừa thì nhãn tràn khỏi ô — nên ước HỤT.
 */
const CHAR_W = 0.56
const fit = (label: string, w: number, px: number): string => {
  const max = Math.floor((w - 9) / (px * CHAR_W))
  if (max <= 1) return ''
  return label.length <= max ? label : `${label.slice(0, max - 1)}…`
}

/**
 * Mọi ngưỡng bố cục suy từ CỠ CHỮ THẬT, không phải từ hằng số pixel.
 *
 * Cài đặt → Cỡ chữ đặt `--app-font-scale` lên <html> và index.css nhân nó vào font-size
 * gốc, nên `0.625rem` ở mức "Rất lớn" là 12,5px chứ không phải 10px. Bản đầu ghi cứng 10
 * và 11, và ở 375px × 1,25 lần thì tên nhóm "Đi lại" in ra thành "Đi..9,6%" — chữ đè lên
 * phần trăm. `npm test` không thấy được chuyện này; phải mở app mới thấy.
 *
 * Không cần theo dõi thay đổi: chiều cao vùng vẽ đặt bằng `rem`, nên đổi cỡ chữ là
 * ResizeObserver bắn và cả bố cục tính lại.
 */
function metricsOf(): { px2: number; px3: number; header: number } {
  const root =
    typeof document === 'undefined'
      ? 16
      : parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
  return {
    px2: parseFloat(CHART_TEXT_2XS) * root,
    px3: parseFloat(CHART_TEXT_3XS) * root,
    header: parseFloat(CHART_TEXT_3XS) * root * 1.5,
  }
}

type Metrics = ReturnType<typeof metricsOf>

interface TileView extends Rect {
  id: string
  label: string
  value: number
  share: number
  color: string
  /** Nhóm cha, để câu chú giải nói rõ "Cơm ngoài · Ăn uống". null khi chính nó là nhóm. */
  groupLabel: string | null
  /** Ô gộp thì không mở được trang chi tiết của một danh mục nào cả. */
  linkable: boolean
}

interface Props {
  /** ĐÚNG mảng dòng mà `MonthCategoryTable` đang hiện — xem ghi chú đầu file. */
  rows: readonly CategoryAmountRow[]
  categories: readonly CategoryTreeLike[]
  base: CurrencyCode
  monthKey: MonthKey
  /** Có ngoại tệ quy đổi → tiền tố ≈, cùng quy ước với <Money approx>. */
  approx?: boolean
}

export function TreemapCard({ rows, categories, base, monthKey, approx = false }: Props) {
  // Đăng ký chế độ riêng tư — giá trị không dùng tới, việc của nó là buộc thẻ vẽ lại khi
  // người dùng bấm nút che số.
  usePrivacyMode()
  const navigate = useNavigate()
  const titleId = useId()
  const [mode, setMode] = useState<Mode>('group')
  const [active, setActive] = useState<string | null>(null)
  // Cỡ thật của vùng vẽ: bố cục tính bằng PIXEL, không bằng viewBox cố định. Một viewBox
  // 620×300 kéo xuống 375px làm mọi chữ co theo còn ~6px — cái không bậc chữ nào cho phép.
  const { box, attachBox } = useBoxSize({ w: 620, h: 288 })

  const { groups, flat, total } = useMemo(
    () => buildCategoryTreemap(rows, categories),
    [rows, categories],
  )

  const money = (v: number) => `${approx ? '≈ ' : ''}${formatMoney(v, base)}`
  const pct = (s: number) => `${(s * 100).toFixed(1).replace('.', ',')}%`

  const frame: Rect = { x: 0, y: 0, w: box.w, h: box.h }

  const metrics = metricsOf()

  const { frames, tiles } = useMemo(() => {
    const m = metricsOf()
    if (total <= 0 || box.w <= 0 || box.h <= 0) return { frames: [], tiles: [] as TileView[] }

    // Màu tra theo NHÓM GỐC của từng danh mục, không theo nhóm sau khi gộp — nhờ vậy
    // "Sách vở" giữ nguyên màu dù ở kiểu Phẳng nó đứng riêng còn ở kiểu Theo nhóm nó nằm
    // trong ô "Nhóm nhỏ khác". Gạt qua lại mà cả hình đổi màu thì mắt phải học lại từ đầu.
    const rank = new Map(groups.map((g, i) => [g.id, i]))
    const homeGroup = new Map(flat.map((l) => [l.id, l.groupId]))
    const colorOfLeaf = (id: string) => groupColorAt(rank.get(homeGroup.get(id) ?? '') ?? 0)

    if (mode === 'flat') {
      return {
        frames: [],
        tiles: layoutFlat(flat, frame, total).map((t) => ({
          ...t,
          color: colorOfLeaf(t.id),
          groupLabel: t.groupLabel === t.label ? null : t.groupLabel,
          linkable: true,
        })),
      }
    }

    const packed = collapseSmallGroups(groups, MIN_GROUP_SHARE)
    const laid = layoutGrouped(packed, frame, { gap: GAP, header: m.header }, total)
    return {
      // Khung "Nhóm nhỏ khác" không phải một nhóm thật nên không ăn một màu của bảng —
      // cùng quy ước với `GROUP_COLOR_NONE` bên Tài sản. Ô con bên trong vẫn giữ màu riêng.
      frames: laid.groups.map((g) => ({
        ...g,
        color: g.id === SMALL_GROUP_ID ? GROUP_COLOR_NONE : groupColorAt(rank.get(g.id) ?? 0),
      })),
      tiles: laid.leaves.map((t) => ({
        ...t,
        color: colorOfLeaf(t.id),
        groupLabel: t.groupLabel === t.label ? null : t.groupLabel,
        linkable: true,
      })),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, groups, flat, total, box.w, box.h])

  if (total <= 0) return null

  const open = (id: string) =>
    navigate(`/reports/category/${id}?ym=${monthKeyString(monthKey)}`)

  const lit = tiles.find((t) => t.id === active) ?? null

  return (
    <Card as="section" elevation="panel" padding="panel">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <SectionTitle as="h3" id={titleId} className="min-w-0">
          Chi đi vào đâu — theo diện tích
        </SectionTitle>
        <SegmentedControl
          items={MODES}
          value={mode}
          onChange={setMode}
          label="Cách xếp ô"
          size="sm"
          stretch={false}
        />
      </div>

      {/* Chiều cao CỐ ĐỊNH theo bậc, không theo tỉ lệ khung: tỉ lệ cố định ở 375px cho ra
          một dải cao 181px, và mọi ô dưới 3% tụt xuống dưới ngưỡng in được chữ. */}
      <div ref={attachBox} className="h-72 w-full lg:h-96">
        <svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${box.w} ${box.h}`}
          role="img"
          aria-labelledby={titleId}
        >
          {frames.map((f) => (
            <g key={`f-${f.id}`}>
              <rect
                x={f.x + GAP / 2}
                y={f.y + GAP / 2}
                width={Math.max(0, f.w - GAP)}
                height={Math.max(0, f.h - GAP)}
                rx={4}
                fill={f.color}
                opacity={FRAME_OPACITY}
              />
              {f.showHeader && <GroupHeader frame={f} label={pct(f.share)} metrics={metrics} />}
            </g>
          ))}

          {tiles.map((t) => (
            <Tile
              key={t.id}
              tile={t}
              metrics={metrics}
              money={money}
              pct={pct}
              dim={active !== null && active !== t.id}
              onEnter={() => setActive(t.id)}
              onLeave={() => setActive(null)}
              onOpen={t.linkable ? () => open(t.id) : undefined}
            />
          ))}
        </svg>
      </div>

      {/* Dòng đọc số của ô đang trỏ. Chỗ này CỐ ĐỊNH một dòng kể cả khi không trỏ gì —
          để nó mọc ra/biến mất là mỗi lần rê chuột cả bảng bên dưới lại nhảy lên xuống. */}
      <p className="mt-1.5 min-h-5 text-sm text-fg-secondary" aria-live="polite">
        {lit ? (
          <>
            <b className="text-fg-primary">{lit.label}</b>
            {lit.groupLabel ? ` · ${lit.groupLabel}` : ''} — <b>{money(lit.value)}</b>,{' '}
            {pct(lit.share)} tổng chi
          </>
        ) : (
          <span className="text-fg-muted">Trỏ vào một ô để xem số; bấm để mở chi tiết.</span>
        )}
      </p>

      <Guide className="mt-1 text-2xs text-fg-muted">
        Ô càng lớn thì càng tốn tiền — <b>diện tích</b> tỉ lệ đúng với số tiền, nên so hai ô
        bằng mắt là so được. <b>Theo nhóm</b> gom danh mục con vào nhóm cha của nó (Ăn uống,
        Nhà ở…), <b>Phẳng</b> bỏ tầng nhóm và xếp thẳng mọi danh mục. Bảng ngay dưới là cùng
        bộ số này, thêm cột so với tháng trước và hạn mức.
      </Guide>
    </Card>
  )
}

/**
 * Dòng tên nhóm. Khi không đủ chỗ cho cả hai thì BỎ PHẦN TRĂM, giữ TÊN.
 *
 * Thứ tự ưu tiên này là kết quả của một lần mở app ở 375px × cỡ chữ 1,25: bản trước cắt
 * tên để nhường chỗ cho phần trăm, và nhóm "Đi lại" in ra một khung xanh chỉ có "9,6%" —
 * một con số không biết đang nói về cái gì. Tên là danh tính của khung, phần trăm thì ô
 * bên dưới và bảng bên cạnh đều nói lại được.
 */
function GroupHeader({
  frame,
  label,
  metrics,
}: {
  frame: { x: number; y: number; w: number; label: string }
  label: string
  metrics: Metrics
}) {
  const { px3 } = metrics
  // Chỗ dành cho phần trăm tính theo ĐỘ DÀI THẬT của chuỗi ("9,6%" hẹp hơn "36,2%").
  const pctW = label.length * px3 * CHAR_W + 14
  const withPct = fit(frame.label, frame.w - pctW, px3)
  const name = withPct || fit(frame.label, frame.w - GAP * 2 - 8, px3)
  const y = frame.y + GAP + px3

  return (
    <>
      {name && (
        <text
          x={frame.x + GAP + 4}
          y={y}
          style={{ fontSize: CHART_TEXT_3XS, ...HALO }}
          className="fill-fg-secondary font-semibold"
        >
          {name}
        </text>
      )}
      {!!withPct && (
        <text
          x={frame.x + frame.w - GAP - 4}
          y={y}
          textAnchor="end"
          style={{ fontSize: CHART_TEXT_3XS, ...HALO }}
          className="fill-fg-muted"
        >
          {label}
        </text>
      )}
    </>
  )
}

function Tile({
  tile,
  metrics,
  money,
  pct,
  dim,
  onEnter,
  onLeave,
  onOpen,
}: {
  tile: TileView
  metrics: Metrics
  money: (v: number) => string
  pct: (s: number) => string
  dim: boolean
  onEnter: () => void
  onLeave: () => void
  onOpen?: () => void
}) {
  const { px2, px3 } = metrics
  const w = Math.max(0, tile.w - GAP)
  const h = Math.max(0, tile.h - GAP)
  // Ba bậc nhãn. Ngưỡng đo theo chỗ THẬT còn lại sau khi trừ khe, không theo ô lý thuyết,
  // và theo cỡ chữ thật chứ không theo pixel ghi cứng (xem `metricsOf`).
  const twoLines = w > px2 * 6 && h > px2 * 1.4 + px3 * 1.4 + 8
  // Ngưỡng bề ngang cố ý THẤP (≈3 chữ): một cái tên cắt ngắn "Tàu đ…" vẫn nói được nhiều
  // hơn một ô xanh trống. `fit` tự trả chuỗi rỗng khi hẹp tới mức không còn hai chữ.
  const oneLine = !twoLines && w > px3 * 3 && h > px3 * 1.55
  const name = twoLines ? fit(tile.label, w, px2) : oneLine ? fit(tile.label, w, px3) : ''
  const amount = twoLines ? fit(money(tile.value), w, px3) : ''

  return (
    <g
      className={onOpen ? 'cursor-pointer transition-opacity' : 'transition-opacity'}
      opacity={dim ? 0.45 : 1}
      tabIndex={0}
      role={onOpen ? 'link' : undefined}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={onEnter}
      onBlur={onLeave}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (onOpen && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onOpen()
        }
      }}
    >
      {/* <title> là tên mà máy đọc màn hình đọc ra, và là chú giải khi rê chuột — nên ô
          quá nhỏ để in chữ vẫn nói được đủ ba số. */}
      <title>
        {tile.label}
        {tile.groupLabel ? ` · ${tile.groupLabel}` : ''} · {money(tile.value)} ·{' '}
        {pct(tile.share)}
      </title>
      <rect
        x={tile.x + GAP / 2}
        y={tile.y + GAP / 2}
        width={w}
        height={h}
        rx={3}
        fill={tile.color}
        fillOpacity={FILL_ALPHA}
        stroke={tile.color}
        strokeWidth={1.5}
      />
      {name && (
        <text
          x={tile.x + GAP / 2 + 5}
          y={tile.y + GAP / 2 + (twoLines ? px2 * 1.25 : px3 * 1.2) + 2}
          style={{ fontSize: twoLines ? CHART_TEXT_2XS : CHART_TEXT_3XS }}
          className="fill-fg-primary font-medium"
        >
          {name}
        </text>
      )}
      {amount && (
        <text
          x={tile.x + GAP / 2 + 5}
          y={tile.y + GAP / 2 + px2 * 1.25 + px3 * 1.25 + 4}
          style={{ fontSize: CHART_TEXT_3XS }}
          className="fill-fg-secondary font-mono"
        >
          {amount}
        </text>
      )}
    </g>
  )
}
