// Bốn ô KPI của Bản tin (§4.1): Thu · Chi · Giữ lại · Tài sản ròng.
//
// KHÔNG dùng <StatTile>: ô của 1a có thêm hai thứ StatTile không có — dòng so tháng
// trước và đường tí hon nằm cùng hàng với nó, cộng thanh mốc 20% riêng của ô "Giữ lại".
// Nhét cả ba vào StatTile bằng prop là biến một primitive hai-dòng thành một component
// bốn nhánh, mà chỗ dùng chỉ có đây.
import type { ReactNode } from 'react'
import { Card, Money, Sparkline, Swap } from '../../components/ui'
import { shortCompare } from '../reports/headline'
import { keptBarPct } from './bulletin'
import type { CurrencyCode } from '../../lib/money'

/** Nhãn eyebrow + số 26px mono — khung chung của cả bốn ô. */
function Tile({
  label,
  swapOn,
  children,
  foot,
}: {
  label: string
  /** Con số của ô — đổi thì số mới bật lên trong 140ms (§12). Xem Swap.tsx. */
  swapOn: string | number | null
  children: ReactNode
  foot: ReactNode
}) {
  return (
    <Card elevation="panel" padding="panel" className="min-w-0 flex-1 basis-40">
      <p className="text-2xs uppercase tracking-label text-fg-muted">{label}</p>
      {/* KHÔNG kèm `tabular-nums`: ô này đã là `font-mono`, mà trong một font đơn cách
          mọi glyph vốn cùng bề rộng — thêm nữa chỉ là nhân bản một quyết định đã có
          trong <Money>. (Ở font sans thì nó vẫn cần, và <Money> vẫn tự bật.) */}
      {/* 26px là bậc của bản DESKTOP (8a). Ở mobile hai ô nằm cạnh nhau trong 375px nên
          lòng ô chỉ còn ~139px, mà "¥2,605,070" ở 26px cần ~156px — đo thật, số bị tràn
          ra ngoài thẻ. Hạ về 22px cho vừa, thay vì rút gọn thành "2.6M": bản rút gọn
          không có ký hiệu tiền (formatCompact cố ý bỏ, nó sinh ra cho nhãn trục), mà app
          này trộn ¥ với ₫ nên một con số không đơn vị là câu đố. §6 cũng chốt mobile là
          bố cục riêng chứ không phải bản thu nhỏ của desktop. */}
      <div className="mt-1.5 font-mono text-kpi font-medium tracking-number">
        <Swap on={swapOn}>{children}</Swap>
      </div>
      <div className="mt-2 flex items-end justify-between gap-2">{foot}</div>
    </Card>
  )
}

/**
 * Dòng so tháng trước. `null` → "chưa so được", KHÔNG in 0% (§14: chưa biết ≠ 0).
 *
 * `invert` cho ô CHI: chi tăng là chiều xấu, nên màu phải ngược với ô Thu. Không tự suy
 * từ dấu của delta — cùng một dấu "+" mang hai nghĩa trái ngược ở hai ô.
 */
function Delta({ pct, invert = false }: { pct: number | null; invert?: boolean }) {
  if (pct === null) return <span className="font-mono text-2xs text-fg-muted">chưa so được</span>
  if (pct === 0) return <span className="font-mono text-2xs text-fg-muted">như tháng trước</span>
  const good = invert ? pct < 0 : pct > 0
  return (
    <span className={`font-mono text-2xs ${good ? 'text-money-in' : 'text-money-out'}`}>
      {shortCompare(pct)}
    </span>
  )
}

interface Props {
  base: CurrencyCode
  income: { value: number; deltaPct: number | null; spark: number[] }
  expense: { value: number; deltaPct: number | null; spark: number[] }
  /** Tỷ lệ giữ lại của tháng đang xem (%). null = chưa có thu. */
  keptPct: number | null
  /** Tiền giữ lại được (thu − chi), minor units base. */
  keptAmount: number
  keptSpark: number[]
  netWorth: number | null
  netWorthSpark: number[]
  /** Có khoản chưa quy đổi được tỷ giá → mọi tổng đều là ƯỚC CHỪNG (§14). */
  approx: boolean
}

export function KpiRow({
  base,
  income,
  expense,
  keptPct,
  keptAmount,
  keptSpark,
  netWorth,
  netWorthSpark,
  approx,
}: Props) {
  return (
    <div className="flex flex-wrap gap-2.5">
      <Tile
        label="Thu tháng"
        swapOn={income.value}
        foot={
          <>
            <Delta pct={income.deltaPct} />
            <Sparkline values={income.spark} label="Thu 8 tháng gần đây" />
          </>
        }
      >
        <Money amount={income.value} currency={base} tone="in" approx={approx} />
      </Tile>

      <Tile
        label="Chi tháng"
        swapOn={expense.value}
        foot={
          <>
            <Delta pct={expense.deltaPct} invert />
            <Sparkline values={expense.spark} label="Chi 8 tháng gần đây" />
          </>
        }
      >
        <Money amount={expense.value} currency={base} tone="out" approx={approx} />
      </Tile>

      <Tile
        label="Giữ lại"
        swapOn={keptPct}
        foot={
          <>
            {/* Thanh 4px có VẠCH MỐC 20% (§4.1) — mốc của quy tắc 50/30/20. Vạch nằm
                trong cùng khung với thanh nên nó đọc được là "còn bao xa tới mốc", chứ
                một con số 20% viết rời thì phải tự nhẩm. */}
            <span className="relative h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-sunken">
              <span
                className={`absolute inset-y-0 left-0 rounded-full ${
                  keptPct !== null && keptPct >= 20 ? 'bg-money-in' : 'bg-fg-warn'
                }`}
                style={{ width: `${keptBarPct(keptPct)}%` }}
              />
              <span className="absolute inset-y-0 left-[20%] w-px bg-fg-muted" aria-hidden />
            </span>
            <Sparkline values={keptSpark} label="Tiền giữ lại 8 tháng gần đây" />
          </>
        }
      >
        {/* Chưa có thu thì KHÔNG in cả "—" lẫn số tiền: "giữ lại ¥0" đọc như "tháng này
            tiêu hết sạch", trong khi sự thật là chưa ghi khoản thu nào để mà tính (§14:
            chưa biết ≠ 0). Dòng dưới thanh nói lý do. */}
        {keptPct === null ? (
          <span className="text-fg-muted">—</span>
        ) : (
          <>
            <span className="text-fg-primary">{keptPct}%</span>
            <span className="ml-2 font-mono text-sm text-fg-muted">
              <Money amount={keptAmount} currency={base} tone="neutral" approx={approx} compact />
            </span>
          </>
        )}
      </Tile>

      <Tile
        label="Tài sản ròng"
        swapOn={netWorth}
        foot={
          <>
            {/* Thiếu tỷ giá thì assets/useAssetsData báo không tin cậy — nói ra thay vì
                in một con số thiếu vài tài khoản. */}
            <span className="font-mono text-2xs text-fg-muted">
              {netWorth === null ? 'chưa tính được' : 'sau nợ và cho vay'}
            </span>
            <Sparkline values={netWorthSpark} label="Tài sản ròng gần đây" />
          </>
        }
      >
        {netWorth === null ? (
          <span className="text-fg-muted">—</span>
        ) : (
          <Money amount={netWorth} currency={base} tone="neutral" />
        )}
      </Tile>
    </div>
  )
}
