// Khối "Thẻ tín dụng" của tab Hiện tại — thu gọn mặc định, bấm mới xổ chi tiết.
//
// Tách khỏi AssetsNowView vì khối này tự gánh hai phép tính riêng (chia kỳ sao kê
// và đối chiếu nguồn trả) cùng ~170 dòng JSX; để chung thì mỗi lần sửa phải cuộn
// qua cả phần kéo–thả tài khoản không liên quan.
//
// Vì sao thu gọn: thường ngày chỉ cần biết "kỳ này bị rút bao nhiêu, ngày nào".
// Chi tiết từng thẻ (nguồn trả, hạn mức, phần chưa chốt) chỉ cần khi sắp tới hạn,
// mà mở sẵn thì nó đẩy Cơ cấu tài sản và danh sách nhóm xuống rất sâu.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, CreditCard } from 'lucide-react'
import { Money } from '../../components/ui'
import type { CurrencyCode } from '../../lib/currencies'
import { dueDateLabel, dueRelativeLabel } from '../../lib/dates'
import type { Rates } from '../../lib/rates'
import type { AccountBalanceRow } from '../../types/database.types'
import { cardFunding, type CardLiability } from './aggregate'
import { cardsSummary } from './cardsSummary'
import type { MoneyView } from './moneyView'
import { useCardStatements } from './useCardStatements'

interface Props {
  /** Thẻ đã lọc bỏ thẻ ẩn — nơi gọi tự lọc. */
  cards: CardLiability[]
  /** Số dư mọi tài khoản, để tra tài khoản nguồn trả thẻ. */
  balances: AccountBalanceRow[]
  base: CurrencyCode
  rates: Rates
  todayISO: string
  /** Bộ "xem thử bằng tiền khác" của tab Hiện tại — mọi số tiền hiển thị đi qua đây. */
  view: MoneyView
}

export function CardsSection({ cards, balances, base, rates, todayISO, view }: Props) {
  const [open, setOpen] = useState(false)

  // Chia dư nợ thành kỳ đã chốt (sắp bị rút) và phần chưa chốt
  const statements = useCardStatements(cards, todayISO)
  // Đối chiếu tiền trả thẻ: phân bổ số dư nguồn cho các thẻ dùng chung → badge nhất quán.
  // Đo theo số của KỲ NÀY, vì đó mới là số rời tài khoản vào ngày đến hạn.
  const cardSources = new Map(
    balances.map((b) => [
      b.id,
      { id: b.id, name: b.name, currency: b.currency, balance: b.balance },
    ]),
  )
  const billedByCard = new Map(
    [...statements].flatMap(([id, s]) => (s.billed == null ? [] : [[id, s.billed] as const])),
  )
  const funding = cardFunding(cards, cardSources, billedByCard)
  // Chỉ tổng gộp khi ≥2 thẻ chung nguồn và đang thực nợ (dòng "cần nạp thêm")
  const sharedSources = funding.groups.filter((g) => g.cardCount >= 2 && g.totalOwed > 0)
  const summary = cardsSummary(cards, statements, funding, base, rates)
  // Dòng tổng "Kỳ này" theo đồng tiền đang xem (null = chưa phát sinh nợ)
  const billedView = summary.billedBase == null ? null : view.view(summary.billedBase)

  // Hook phải chạy vô điều kiện nên mới thoát ở đây, không thoát sớm phía trên.
  if (cards.length === 0) return null

  return (
    <section className="rounded-2xl bg-surface p-4 shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="block w-full text-left"
      >
        <div className="flex items-center gap-1.5">
          <CreditCard className="h-3.5 w-3.5 shrink-0 text-fg-muted" />
          <h2 className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
            Thẻ tín dụng
          </h2>
          <span className="shrink-0 rounded-full bg-surface-sunken px-1.5 py-0.5 text-3xs font-medium text-fg-on-track">
            {cards.length}
          </span>
          {/* Badge thiếu tiền phải thấy được cả khi thu gọn: đây là khối DUY NHẤT
              trên trang có hạn chót, giấu đi thì người dùng lỡ ngày trả. */}
          {summary.shortCount > 0 && (
            <span className="ml-auto shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-2xs font-semibold text-red-700 dark:bg-red-900/40 dark:text-red-300">
              {summary.singleShortfall
                ? `thiếu ${view.fmt(summary.singleShortfall.amount, summary.singleShortfall.currency)}`
                : `${summary.shortCount} thẻ thiếu tiền`}
            </span>
          )}
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-fg-muted transition-transform ${
              summary.shortCount > 0 ? 'ml-1' : 'ml-auto'
            } ${open ? 'rotate-180' : ''}`}
          />
        </div>

        {/* Dòng tổng — con số duy nhất cần khi không mở chi tiết */}
        <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          {billedView == null ? (
            <span className="text-sm font-medium text-fg-muted">Chưa phát sinh nợ</span>
          ) : (
            <>
              <span className="text-xs text-fg-muted">Kỳ này</span>
              <Money
                amount={billedView.amount}
                currency={billedView.currency}
                tone="out"
                approx={summary.approx || billedView.approx}
                className="text-xl font-bold"
              />
              {summary.nextDueISO && (
                <span className="ml-auto text-xs text-fg-muted">
                  Đến hạn{' '}
                  <span className="font-semibold text-gray-700 dark:text-gray-200">
                    {dueDateLabel(summary.nextDueISO)}
                  </span>
                  <span className="text-fg-muted">
                    {' '}· {dueRelativeLabel(todayISO, summary.nextDueISO)}
                  </span>
                </span>
              )}
            </>
          )}
        </div>
      </button>

      {open && (
        <div className="mt-3">
          {/* Tổng theo ngân hàng nguồn — con số cần khi chuyển tiền vào để thanh toán */}
          {sharedSources.length > 0 && (
            <div className="mb-3 space-y-2">
              {sharedSources.map((g) => (
                <div
                  key={g.sourceId}
                  className="rounded-xl border border-gray-100 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-800/50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Trả {g.cardCount} thẻ từ {g.sourceName}
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-2xs font-semibold ${
                        g.enough
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                          : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                      }`}
                    >
                      {g.enough ? 'đủ trả' : `cần nạp thêm ${view.fmt(g.shortfall, g.currency)}`}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-fg-muted">
                    {/* Đã là tổng KỲ NÀY (cardFunding nhận override billed), không phải nợ gộp */}
                    <span>Kỳ này {g.cardCount} thẻ</span>
                    <span className="tabular-nums font-medium text-money-out">
                      − {view.fmt(g.totalOwed, g.currency)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs text-fg-muted">
                    <span>Số dư {g.sourceName}</span>
                    <span className="tabular-nums">{view.fmt(g.sourceBalance, g.currency)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <ul className="space-y-3">
            {cards.map((c) => {
              const st = statements.get(c.id)
              const owed = st?.totalOwed ?? 0 // toàn bộ dư nợ (currency gốc)
              // Kỳ này = số bị rút vào ngày đến hạn; null khi thẻ chưa đặt ngày chốt/trả
              const billed = st?.billed ?? null
              const unbilled = st?.unbilled ?? 0
              // Hạn mức bị chiếm bởi CẢ phần chưa chốt, nên trừ theo tổng nợ
              const available = c.creditLimit != null ? c.creditLimit - owed : null
              // Đối chiếu nguồn trả thẻ (đã phân bổ nếu dùng chung nguồn)
              const f = funding.byCard.get(c.id)
              // Ngày đến hạn trả kế tiếp (đã dời T7/CN sang T2)
              const dueISO = st?.dueISO ?? null
              // Hai con số nổi bật của thẻ, theo đồng tiền đang xem
              const mainView = view.view(billed ?? owed, c.currency)
              const unbilledView = view.view(unbilled, c.currency)
              return (
                <li key={c.id}>
                  <Link
                    to={`/assets/account/${c.id}`}
                    className="block rounded-xl px-2 py-2 transition hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    {/* Tên thẻ + trạng thái đủ/thiếu tiền trả */}
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4 shrink-0 text-fg-muted" />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-700 dark:text-gray-300">
                        {c.name}
                        {!c.includeInTotals && (
                          <span className="ml-1 text-3xs font-normal text-fg-muted">
                            (ngoài tổng)
                          </span>
                        )}
                      </span>
                      {owed > 0 && f && (
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-2xs font-semibold ${
                            f.enough
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                              : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                          }`}
                        >
                          {f.enough ? 'đủ trả' : `thiếu ${view.fmt(f.shortfall, c.currency)}`}
                        </span>
                      )}
                    </div>

                    {/* Số bị rút kỳ tới (nổi bật) + ngày đến hạn.
                        Thẻ đủ ngày chốt/trả hiện "Kỳ này" = số thật sự rời tài khoản;
                        thẻ thiếu ngày không chia được kỳ nên rơi về tổng "Cần trả". */}
                    <div className="mt-1.5 ml-6 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      {owed > 0 ? (
                        <>
                          <span className="text-xs text-fg-muted">
                            {billed != null ? 'Kỳ này' : 'Cần trả'}
                          </span>
                          <Money
                            amount={mainView.amount}
                            currency={mainView.currency}
                            tone={(billed ?? owed) > 0 ? 'out' : 'neutral'}
                            approx={mainView.approx}
                            className="text-xl font-bold"
                          />
                        </>
                      ) : (
                        <span className="text-sm font-medium text-fg-muted">
                          Chưa phát sinh nợ
                        </span>
                      )}
                      {owed > 0 && dueISO && (
                        <span className="ml-auto text-xs text-fg-muted">
                          Đến hạn{' '}
                          <span className="font-semibold text-gray-700 dark:text-gray-200">
                            {dueDateLabel(dueISO)}
                          </span>
                          <span className="text-fg-muted">
                            {' '}· {dueRelativeLabel(todayISO, dueISO)}
                          </span>
                        </span>
                      )}
                    </div>

                    {/* Phần quẹt sau ngày chốt — kỳ sau mới đòi, KHÔNG bị rút lần này */}
                    {billed != null && unbilled > 0 && (
                      <p className="mt-1 ml-6 text-xs text-fg-muted">
                        Chưa chốt{' '}
                        <Money
                          amount={unbilledView.amount}
                          currency={unbilledView.currency}
                          approx={unbilledView.approx}
                          className="font-medium"
                        />
                        {billed > 0
                          ? ` · tổng nợ ${view.fmt(owed, c.currency)}`
                          : ' — kỳ sau mới đòi'}
                      </p>
                    )}

                    {/* Nguồn trả + hạn mức còn lại */}
                    {(f || available != null) && (
                      <p className="mt-1 ml-6 text-xs text-fg-muted">
                        {f && (
                          <>
                            Trả từ {f.sourceName}
                            {!f.shared && (
                              <>
                                {' '}· số dư{' '}
                                <span className="tabular-nums">
                                  {view.fmt(f.sourceBalance, c.currency)}
                                </span>
                              </>
                            )}
                          </>
                        )}
                        {f && available != null && ' · '}
                        {available != null && (
                          <>
                            còn dùng được{' '}
                            <span className="tabular-nums">
                              {view.fmt(available, c.currency)}
                            </span>
                          </>
                        )}
                      </p>
                    )}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </section>
  )
}
