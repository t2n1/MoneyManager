// Khối "Thẻ tín dụng" của chế độ Hôm nay — MỘT panel, nói mỗi con số đúng MỘT lần
// (bản vẽ 2a).
//
// ---- Nó thay cái gì, và vì sao ----------------------------------------------------
//
// Bản trước là một khối thu gọn: bấm mới xổ ra chi tiết từng thẻ. Cái giá của việc thu
// gọn đo được trên chính sổ này — ba thẻ, cùng một nguồn trả, cùng một ngày rút:
//
//   · Con số "Kỳ này ¥396.443" hiện ở dòng thu gọn, rồi hộp "Trả 3 thẻ từ Rakuten Bank"
//     hiện lại đúng nó dưới tên "Kỳ này 3 thẻ", rồi mở chi tiết ra thì mỗi thẻ lại in
//     "Kỳ này" của riêng nó ở cỡ 20px — bốn lần cho một ý.
//   · "Số dư Rakuten Bank ¥410.331" in trong hộp nguồn, và in lại ở dòng tài khoản
//     Rakuten Bank trong bảng ngay dưới.
//   · Câu "đủ trả / cần nạp thêm" in ở badge của khối, ở hộp nguồn, VÀ ở từng thẻ.
//
// Ba thẻ thì mở ra chỉ cao thêm ~120px — tức cái nút thu gọn tiết kiệm ít hơn phần chữ
// nó tạo ra để bù cho việc mình đang che thứ gì. Nên: bỏ nút, bỏ mọi bản nhân đôi, và
// dựng phần chi tiết thành một BẢNG ba cột (kỳ này · chưa chốt · tổng nợ). Bảng nói
// được đúng ba con số đó cho ba thẻ trong sáu dòng, và có dòng TỔNG ở chân — con số
// tổng vì thế không cần một khối riêng nữa.
//
// Phần "còn bao nhiêu ngày" và "đến hạn ngày nào" KHÔNG còn ở đây: nó lên ô KPI "Phải
// trả" ở đầu trang (xem KpiStrip). Hạn chót là thứ phải thấy trước khi cuộn.
import { Link } from 'react-router-dom'
import { CreditCard } from 'lucide-react'
import { Card, Money, SectionTitle, StatusChip } from '../../components/ui'
import { STATUS_FILL } from '../../components/ui/statusColors'
import type { CardLiability } from './aggregate'
import type { MoneyView } from './moneyView'
import type { CardsPanel } from './useCardsPanel'

/** Bốn cột của bảng. rem chứ không px — bề rộng cột phải giãn theo Cỡ chữ (§designSystem).
 *
 *  ---- Bề rộng cột phải đủ cho tiền ĐỒNG, không phải cho tiền YÊN ------------------
 *
 *  Chuỗi dài nhất mà một cột số in ra là "≈ 999.999.999 ₫" — 15 ký tự, trong khi
 *  "¥9,999,999" chỉ 10. (Không có dấu trừ: ba cột này là DƯ NỢ, luôn in số dương.)
 *  Ba cột số từng đặt theo cỡ của yên (7,25rem), nên bấm nút ₫ ở đầu trang là mọi ô gãy
 *  làm hai dòng: con số một dòng, chữ "₫" một dòng. IBM Plex Mono rộng 0,6em mỗi ký tự →
 *  ở text-sm (0,875rem) là 0,525rem/ký tự; đo thật trên trang ra 125px cho chuỗi 15 ký
 *  tự, nên 8rem (128px) là bề rộng khít nhất còn an toàn.
 *
 *  ---- Vì sao @container chứ không `lg:` ------------------------------------------
 *
 *  Khối này KHÔNG chiếm cả bề ngang màn: từ lg nó đứng cạnh khối Cơ cấu rộng cứng 27rem
 *  (xem AssetsNowView), nên ở màn 1024px nó chỉ còn ~28rem — hẹp hơn cả bảng bốn cột.
 *  Mốc `lg:` vì thế nói sai: nó hỏi màn hình rộng bao nhiêu trong khi thứ quyết định là
 *  CHÍNH KHỐI NÀY rộng bao nhiêu. Hậu quả đo được ở 1024px: cột tên thẻ bị ép về 0px và
 *  con số tràn ra ngoài viền 57px. `@xl` = 36rem = 576px — ba cột số (8+8+8,5rem = 392px)
 *  cộng ba khe hở (36px) và hai bên lề (32px) hết 460px, còn ~116px cho tên thẻ, vừa đủ
 *  một tên thẻ trước khi `truncate` cắt. Dưới mốc đó bảng tự về hai cột và phần "chưa
 *  chốt" xuống dòng riêng ở cuối khối. */
const COLS = 'grid grid-cols-[1fr_auto] gap-x-3 @xl:grid-cols-[1fr_8rem_8rem_8.5rem]'

interface Props {
  /** Thẻ đã lọc bỏ thẻ ẩn — nơi gọi tự lọc. */
  cards: CardLiability[]
  /** Kỳ sao kê · phân bổ nguồn trả · tóm tắt, tính ở `useCardsPanel` (một chỗ duy nhất). */
  panel: CardsPanel
  /** Bộ "xem thử bằng tiền khác" — mọi số tiền hiển thị đi qua đây. */
  view: MoneyView
}

export function CardsSection({ cards, panel, view }: Props) {
  const { statements, funding, summary } = panel
  if (cards.length === 0) return null

  // Ba dòng tổng của bảng, cộng theo ĐỒNG TIỀN ĐANG XEM. `summary.billedBase` chỉ có cột
  // "Kỳ này"; hai cột kia phải tự cộng, và cộng qua `view.view` để một sổ trộn ¥ với ₫
  // không lặng lẽ cho ra một tổng của hai loại tiền.
  const tong = cards.reduce(
    (acc, c) => {
      const st = statements.get(c.id)
      const owed = st?.totalOwed ?? 0
      const billed = st?.billed ?? owed
      const unbilled = st?.unbilled ?? 0
      const b = view.view(billed, c.currency)
      const u = view.view(unbilled, c.currency)
      const o = view.view(owed, c.currency)
      return {
        billed: acc.billed + (b.currency === view.cur ? b.amount : 0),
        unbilled: acc.unbilled + (u.currency === view.cur ? u.amount : 0),
        owed: acc.owed + (o.currency === view.cur ? o.amount : 0),
        // Một thẻ không quy đổi được thì ba cột tổng đều thiếu phần của nó.
        approx: acc.approx || b.approx || b.currency !== view.cur,
      }
    },
    { billed: 0, unbilled: 0, owed: 0, approx: false },
  )

  // Câu ở đầu khối chỉ đúng khi CẢ BỘ thẻ dùng một nguồn và một ngày rút — sổ này đúng
  // như vậy, nhưng câu phải do số quyết định, không viết cứng.
  const dueDays = new Set(
    cards.flatMap((c) => {
      const d = statements.get(c.id)?.dueISO
      return d ? [d] : []
    }),
  )
  const motMoi =
    cards.length > 1 &&
    funding.groups.length === 1 &&
    funding.groups[0].cardCount === cards.length &&
    dueDays.size === 1

  return (
    <Card
      as="section"
      elevation="panel"
      padding="none"
      className="@container flex min-w-0 flex-1 flex-col overflow-hidden"
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border-panel px-4 py-2.5">
        <CreditCard className="h-3.5 w-3.5 shrink-0 text-fg-muted" aria-hidden />
        <SectionTitle role="micro">Thẻ tín dụng</SectionTitle>
        <span className="shrink-0 rounded-full bg-surface-sunken px-1.5 text-2xs font-medium text-fg-on-track">
          {cards.length}
        </span>
        {motMoi && (
          <span className="ml-auto text-2xs text-fg-muted">
            Cả {cards.length} thẻ cùng ngày rút và cùng nguồn trả — ghi một lần ở đây.
          </span>
        )}
      </div>

      {/* Một dòng phủ cho MỖI nguồn trả. Sổ này có một nguồn nên ra đúng bản vẽ; sổ nào
          trả từ hai bank thì ra hai dòng, thay vì một dòng gộp không nói được nguồn nào
          đang thiếu. */}
      {funding.groups.map((g) => {
        const phu = g.sourceBalance <= 0 ? 0 : Math.min(100, (g.totalOwed / g.sourceBalance) * 100)
        return (
          <div
            key={g.sourceId}
            className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border-subtle px-4 py-2.5"
          >
            <span className="h-1.5 w-full shrink-0 overflow-hidden rounded-full bg-surface-sunken @xl:w-[11.25rem]">
              <span
                className={`block h-full rounded-full ${g.enough ? STATUS_FILL.good : STATUS_FILL.bad}`}
                style={{ width: `${phu}%` }}
              />
            </span>
            <span className="text-sm text-fg-secondary">
              Rút <Money {...view.view(g.totalOwed, g.currency)} className="font-semibold" /> / số
              dư {g.sourceName} <Money {...view.view(g.sourceBalance, g.currency)} tone="muted" />
            </span>
            <StatusChip tone={g.enough ? 'good' : 'bad'} className="ml-auto shrink-0">
              {g.enough ? (
                <>
                  đủ trả · dư{' '}
                  <Money
                    {...view.view(g.sourceBalance - g.totalOwed, g.currency)}
                    tone="good"
                  />
                </>
              ) : (
                <>
                  cần nạp thêm <Money {...view.view(g.shortfall, g.currency)} tone="warn" />
                </>
              )}
            </StatusChip>
          </div>
        )
      })}

      <div
        className={`${COLS} border-b border-border-subtle px-4 py-1.5 text-2xs font-semibold uppercase tracking-label text-fg-muted`}
      >
        <span>Thẻ</span>
        <span className="text-right">Kỳ này</span>
        <span className="hidden text-right @xl:block">Chưa chốt</span>
        <span className="hidden text-right @xl:block">Tổng nợ</span>
      </div>

      {cards.map((c) => {
        const st = statements.get(c.id)
        const owed = st?.totalOwed ?? 0
        const billed = st?.billed ?? null
        const unbilled = st?.unbilled ?? 0
        return (
          <Link
            key={c.id}
            to={`/assets/account/${c.id}`}
            className={`${COLS} items-center border-b border-border-subtle px-4 py-2 text-sm transition hover:bg-surface-sunken`}
          >
            <span className="min-w-0 truncate text-fg-secondary">
              {c.name}
              {!c.includeInTotals && (
                <span className="ml-1 text-2xs font-normal text-fg-muted">(ngoài tổng)</span>
              )}
              {/* Thẻ thiếu ngày chốt/ngày trả thì không chia được kỳ — cột "Kỳ này" của
                  nó là TOÀN BỘ dư nợ, và điều đó phải nói ra tại dòng, không để người
                  đọc cộng ba dòng rồi thắc mắc vì sao không khớp. */}
              {owed > 0 && billed == null && (
                <span className="ml-1 text-2xs font-normal text-state-warn-fg">
                  chưa đặt ngày chốt
                </span>
              )}
            </span>
            {owed > 0 ? (
              <Money
                {...view.view(billed ?? owed, c.currency)}
                tone="out"
                className="text-right font-semibold"
              />
            ) : (
              <span className="text-right text-sm text-fg-muted">chưa nợ</span>
            )}
            <span className="hidden text-right @xl:block">
              {unbilled > 0 ? (
                <Money {...view.view(unbilled, c.currency)} tone="muted" />
              ) : (
                <span className="text-sm text-fg-muted">—</span>
              )}
            </span>
            <span className="hidden text-right @xl:block">
              <Money {...view.view(owed, c.currency)} tone="neutral" className="font-normal" />
            </span>
          </Link>
        )
      })}

      <div
        className={`${COLS} mt-auto items-center border-t border-border-panel bg-surface-chrome px-4 py-2 text-sm`}
      >
        <span className="text-fg-muted">Tổng · phần chưa chốt sang kỳ sau</span>
        <Money
          amount={tong.billed}
          currency={view.cur}
          tone="out"
          approx={tong.approx || summary.approx}
          className="text-right font-bold"
        />
        <Money
          amount={tong.unbilled}
          currency={view.cur}
          tone="muted"
          approx={tong.approx}
          className="hidden text-right @xl:block"
        />
        <Money
          amount={tong.owed}
          currency={view.cur}
          tone="neutral"
          approx={tong.approx}
          className="hidden text-right font-bold @xl:block"
        />
      </div>

      {/* Dưới @xl hai cột kia không có chỗ, nên phần chưa chốt xuống một dòng riêng —
          bỏ hẳn thì con số "Kỳ này" trông như toàn bộ nợ thẻ. */}
      {tong.unbilled > 0 && (
        <div className="flex items-center justify-between border-t border-border-subtle bg-surface-chrome px-4 py-2 text-sm @xl:hidden">
          <span className="text-fg-muted">Chưa chốt · kỳ sau</span>
          <Money
            amount={tong.unbilled}
            currency={view.cur}
            tone="muted"
            approx={tong.approx}
          />
        </div>
      )}
    </Card>
  )
}
