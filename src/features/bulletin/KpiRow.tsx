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
import { useProfile } from '../../hooks/queries'
import { resolveMethod, savingsTargetShare } from '../budgets/budgetMethods'
import { pendingText } from '../../lib/loadStatus'
import { tr } from '../../i18n'

/** Nhãn eyebrow + số 22px mono — khung chung của cả bốn ô. */
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
    // Ô là một Ô TRONG PANEL CHUNG (bản vẽ redesign 2026-09-05), không phải bốn thẻ
    // rời: bốn con số là một câu trả lời "kỳ này ra sao", tách bốn khung là bốn viền
    // chen giữa một câu. Padding của ô lặp đúng bậc `panel` của Card (px-4 py-3.5).
    <div className="min-w-0 px-4 py-3.5">
      <p className="text-2xs uppercase tracking-label text-fg-muted">{label}</p>
      {/* KHÔNG kèm `tabular-nums`: ô này đã là `font-mono`, mà trong một font đơn cách
          mọi glyph vốn cùng bề rộng — thêm nữa chỉ là nhân bản một quyết định đã có
          trong <Money>. (Ở font sans thì nó vẫn cần, và <Money> vẫn tự bật.) */}
      {/* 22px (text-kpi): ở mobile hai ô nằm cạnh nhau trong 375px nên lòng ô chỉ còn
          ~139px, mà "¥2,605,070" ở 26px cần ~156px — đo thật, số bị tràn ra ngoài thẻ.
          22px cho vừa, thay vì rút gọn thành "2.6M": bản rút gọn không có ký hiệu tiền
          (formatCompact cố ý bỏ, nó sinh ra cho nhãn trục), mà app này trộn ¥ với ₫ nên
          một con số không đơn vị là câu đố. */}
      <div className="mt-1.5 font-mono text-kpi font-medium tracking-number">
        <Swap on={swapOn}>{children}</Swap>
      </div>
      <div className="mt-2 flex items-end justify-between gap-2">{foot}</div>
    </div>
  )
}

/**
 * Dòng so tháng trước. `null` → "chưa so được", KHÔNG in 0% (§14: chưa biết ≠ 0).
 *
 * `invert` cho ô CHI: chi tăng là chiều xấu, nên màu phải ngược với ô Thu. Không tự suy
 * từ dấu của delta — cùng một dấu "+" mang hai nghĩa trái ngược ở hai ô.
 */
function Delta({ pct, invert = false }: { pct: number | null; invert?: boolean }) {
  if (pct === null) return <span className="font-mono text-2xs text-fg-muted">{tr('chưa so được')}</span>
  if (pct === 0) return <span className="font-mono text-2xs text-fg-muted">{tr('như tháng trước')}</span>
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
  /**
   * Dải nhiều tháng (nguồn của Thu/Chi/Giữ lại) CHƯA VỀ. Lúc đó ba ô in "Đang tính" chứ
   * không in số: mảng mặc định `[]` của query chưa về cho ra ¥0 và "chưa có thu", tức
   * một con số sai trông rất thật trong vài giây đầu mỗi lần mở app (§14: chưa biết ≠ 0).
   */
  pending?: boolean
  /**
   * Dải nhiều tháng tải HỎNG hẳn (không còn đang thử lại). Ba ô vẫn không in số, nhưng nói
   * "Chưa tải được" thay vì "Đang tính…" — không thì ô đứng "đang tính" mãi mãi.
   */
  failed?: boolean
  /** Tài sản ròng chưa tính xong (số dư chưa về) — khác với "không tính được". */
  netWorthPending?: boolean
  /**
   * Kỳ tính của tỷ lệ giữ lại, ghép vào nhãn ô — "tới hôm nay" khi tháng đang dở. App có
   * nhiều tỷ lệ giữ lại đo trên những khoảng khác nhau; nhãn không nói kỳ thì người đọc
   * đem so với con số ở Báo cáo rồi tưởng app tự mâu thuẫn.
   */
  keptScope?: string
}

/** Ô đang chờ dữ liệu: chữ thay cho số, cùng khung để hàng ô không nhảy. */
function Pending({ failed = false }: { failed?: boolean }) {
  return (
    <span className="font-sans text-sm text-fg-muted">
      {pendingText(failed ? 'failed' : 'pending')}
    </span>
  )
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
  pending = false,
  failed = false,
  netWorthPending = false,
  keptScope,
}: Props) {
  const { data: profile } = useProfile()
  const keptTargetPct = Math.round(savingsTargetShare(resolveMethod(profile)) * 100)
  return (
    // MỘT panel chia bốn cột (bản vẽ redesign), không phải bốn thẻ flex-wrap. Kẻ dọc
    // bằng `md:divide-x` — cùng idiom với InsightCards: divide chỉ đúng khi các ô là anh
    // em TRÊN CÙNG MỘT HÀNG, nên ở mobile (lưới 2×2) tắt divide, khoảng padding tự tách.
    <Card
      elevation="panel"
      padding="none"
      as="section"
      className="grid grid-cols-2 md:grid-cols-4 md:divide-x md:divide-border-subtle"
    >
      <Tile
        label={tr('Thu tháng')}
        swapOn={pending ? null : income.value}
        foot={
          pending ? null : (
            <>
              {/* Thu bằng 0 thì KHÔNG in "-100%" đỏ: đầu tháng lương chưa về là chuyện
                  bình thường, mà "-100%" đọc như tai nạn. Câu kết luận đầu màn đã dùng
                  đúng chữ "chưa có thu" — hai chỗ phải nói cùng một giọng. */}
              {income.value === 0 ? (
                <span className="font-mono text-2xs text-fg-muted">{tr('chưa có thu')}</span>
              ) : (
                <Delta pct={income.deltaPct} />
              )}
              <Sparkline values={income.spark} label={tr('Thu 8 tháng gần đây')} />
            </>
          )
        }
      >
        {pending ? <Pending failed={failed} /> : <Money amount={income.value} currency={base} tone="in" approx={approx} />}
      </Tile>

      <Tile
        label={tr('Chi tháng')}
        swapOn={pending ? null : expense.value}
        foot={
          pending ? null : (
            <>
              <Delta pct={expense.deltaPct} invert />
              <Sparkline values={expense.spark} label={tr('Chi 8 tháng gần đây')} />
            </>
          )
        }
      >
        {pending ? <Pending failed={failed} /> : <Money amount={expense.value} currency={base} tone="out" approx={approx} />}
      </Tile>

      <Tile
        label={keptScope ? tr('Giữ lại {scope}', { scope: keptScope }) : tr('Giữ lại')}
        swapOn={pending ? null : keptPct}
        foot={
          pending ? null : (
            <>
              {/* Thanh 4px có VẠCH MỐC (§4.1) — mốc Để dành của phương pháp trong hồ sơ.
                  Vạch nằm trong cùng khung với thanh nên nó đọc được là "còn bao xa tới
                  mốc", chứ một con số viết rời thì phải tự nhẩm. */}
              <span className="relative h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-sunken">
                <span
                  className={`absolute inset-y-0 left-0 rounded-full ${
                    keptPct !== null && keptPct >= keptTargetPct ? 'bg-money-in' : 'bg-fg-warn'
                  }`}
                  style={{ width: `${keptBarPct(keptPct)}%` }}
                />
                <span
                  className="absolute inset-y-0 w-px bg-fg-muted"
                  style={{ left: `${keptTargetPct}%` }}
                  aria-hidden
                />
              </span>
              <Sparkline values={keptSpark} label={tr('Tiền giữ lại 8 tháng gần đây')} />
            </>
          )
        }
      >
        {/* Chưa có thu thì KHÔNG in cả "—" lẫn số tiền: "giữ lại ¥0" đọc như "tháng này
            tiêu hết sạch", trong khi sự thật là chưa ghi khoản thu nào để mà tính (§14:
            chưa biết ≠ 0). Dòng dưới thanh nói lý do. */}
        {pending ? (
          <Pending failed={failed} />
        ) : keptPct === null ? (
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
        label={tr('Tài sản ròng')}
        swapOn={netWorth}
        foot={
          <>
            {/* Thiếu tỷ giá thì assets/useAssetsData báo không tin cậy — nói ra thay vì
                in một con số thiếu vài tài khoản. */}
            <span className="font-mono text-2xs text-fg-muted">
              {netWorthPending ? tr('đang tải') : netWorth === null ? tr('chưa tính được') : tr('sau nợ và cho vay')}
            </span>
            <Sparkline values={netWorthSpark} label={tr('Tài sản ròng gần đây')} />
          </>
        }
      >
        {netWorthPending ? (
          <Pending />
        ) : netWorth === null ? (
          <span className="text-fg-muted">—</span>
        ) : (
          <Money amount={netWorth} currency={base} tone="neutral" />
        )}
      </Tile>
    </Card>
  )
}
