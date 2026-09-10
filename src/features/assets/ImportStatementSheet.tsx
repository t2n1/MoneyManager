// Nạp file sao kê của nhà thẻ, đối chiếu từng dòng với sổ, rồi lưu TỔNG hoá đơn.
//
// KHÔNG tạo/sửa/xoá giao dịch nào. Đó là khác biệt cố ý với nút "Chỉnh cho khớp": nút
// kia đẻ một khoản bù làm số khớp ngay, và chôn luôn những dòng ghi sai bên dưới nó.
// Màn này chỉ ra chỗ sai và để người dùng quyết.

import { useMemo, useState } from 'react'
import { FileUp } from 'lucide-react'
import { ActionButton, Card, Collapse, Money, Num, SectionTitle } from '../../components/ui'
import { useEscClose } from '../../hooks/useEscClose'
import { useSearchTransactions, useUpsertCardBills } from '../../hooks/queries'
import { dayMonthLabel } from '../../lib/dates'
import { showToast } from '../../lib/dialog'
import type { CurrencyCode } from '../../lib/money'
import type { TransactionRow } from '../../types/database.types'
import { parsePaypayStatement, type ParsedStatement } from './paypayStatement'
import { billRowsFor, withNeighbours } from './statementNeighbours'
import { reconcileStatement, type LedgerTx, type ReconcileResult } from './statementReconcile'

/**
 * Không có mốc trên, giống `useCardStatements`: một lô 13 file trải 13 kỳ, và cửa sổ
 * truy vấn phải phủ HẾT kỳ muộn nhất. Chặn trên bằng ngày hôm nay là bỏ mất giao dịch
 * ghi ngày tương lai của kỳ chưa chốt, và phần thiếu đó hiện ra thành "cần bạn xem".
 */
const FAR_FUTURE = '9999-12-31'

export interface ImportStatementCard {
  id: string
  name: string
  currency: CurrencyCode
  statementDay: number | null
  paymentDueDay: number | null
}

interface Props {
  card: ImportStatementCard
  onClose: () => void
}

/** `TransactionRow` → `LedgerTx`: chỉ những trường phép ghép cần, không hơn. */
const toLedgerTx = (t: TransactionRow): LedgerTx => ({
  id: t.id,
  occurred_on: t.occurred_on,
  amount: t.amount,
  type: t.type as LedgerTx['type'],
  is_refund: t.is_refund ?? false,
  to_account_id: t.to_account_id,
  note: t.note,
})

interface Reviewed {
  parsed: ParsedStatement
  result: ReconcileResult
}

export function ImportStatementSheet({ card, onClose }: Props) {
  useEscClose(onClose)
  const [parsed, setParsed] = useState<ParsedStatement[]>([])
  const [unreadable, setUnreadable] = useState<string[]>([])
  const [moRong, setMoRong] = useState<Record<string, boolean>>({})
  const upsert = useUpsertCardBills()

  // Cửa sổ truy vấn suy TỪ chính các file đã bóc, không nhận từ nơi gọi: trang tài
  // khoản chỉ giữ giao dịch của MỘT tháng đang xem, mà lô này trải nhiều kỳ — đối
  // chiếu 13 kỳ với rổ một tháng thì 12 kỳ báo lệch sạch.
  const earliestStart = useMemo(
    () =>
      parsed.reduce<string | null>(
        (min, p) => (min == null || p.range.start < min ? p.range.start : min),
        null,
      ),
    [parsed],
  )

  const { data: txs = [], isPending } = useSearchTransactions(
    {
      start: earliestStart ?? FAR_FUTURE,
      end: FAR_FUTURE,
      accountIds: [card.id],
    },
    earliestStart != null,
  )
  const dangDocSo = earliestStart != null && isPending

  const reviewed: Reviewed[] = useMemo(
    () =>
      withNeighbours(parsed).map(({ parsed: p, neighbours }) => ({
        parsed: p,
        // `reconcileStatement` đòi rổ đã lọc sẵn về ĐÚNG một thẻ và ĐÚNG một kỳ:
        // `range.end` là mốc loại trừ (hôm sau ngày chốt) nên so `<`, không `<=`.
        result: reconcileStatement(
          p.lines,
          txs
            .filter((t) => t.occurred_on >= p.range.start && t.occurred_on < p.range.end)
            .map(toLedgerTx),
          card.id,
          neighbours,
        ),
      })),
    [parsed, txs, card.id],
  )

  // Ngày chốt / ngày trả khai sai thì MỌI kỳ xếp nhầm chỗ — chặn lưu, đừng lưu một nửa.
  const lechNgay = parsed.some((p) => p.dueDateMismatch)

  async function chonFile(files: FileList | null) {
    const danhSach = files ? Array.from(files) : []
    if (danhSach.length === 0) return
    const doc: ParsedStatement[] = []
    const hong: string[] = []
    for (const f of danhSach) {
      const p = parsePaypayStatement(await f.text(), card)
      if (p) doc.push(p)
      else hong.push(f.name)
    }
    setUnreadable(hong)
    setParsed(doc)
  }

  function luu() {
    upsert.mutate(billRowsFor(card.id, parsed), {
      onSuccess: onClose,
      onError: (err) => showToast(`Không lưu được: ${(err as Error).message}`, 'error'),
    })
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 lg:items-center animate-overlay-in"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-2xl bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:rounded-2xl animate-sheet-in lg:animate-sheet-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <SectionTitle role="block" className="mb-1">
          Nạp sao kê
        </SectionTitle>
        <p className="mb-3 text-sm text-fg-muted">
          {card.name} · chỉ lưu tổng hoá đơn, không đụng giao dịch nào.
        </p>

        {/* `multiple` là BẮT BUỘC: hai luật "giải thích được" của phép đối chiếu cần
            dòng của kỳ liền kề, nên nạp từng file lẻ là tự tắt hai luật đó. */}
        <Card
          as="label"
          className="mb-3 flex cursor-pointer items-center gap-3 focus-within:ring-2 focus-within:ring-accent"
        >
          <FileUp className="h-5 w-5 text-fg-muted" />
          <span className="flex-1 text-sm text-fg-primary">
            Chọn file CSV (chọn cả lô, nhiều kỳ một lần)
          </span>
          <input
            type="file"
            multiple
            accept=".csv"
            className="sr-only"
            onChange={(e) => {
              // `e.target.files` là FileList SỐNG — đặt value='' xoá luôn file bên
              // trong chính nó, nên phải đọc xong rồi mới reset. Reset để chọn LẠI
              // đúng lô cũ vẫn sinh sự kiện change lần hai.
              const chon = e.target.files
              void chonFile(chon)
              e.target.value = ''
            }}
          />
        </Card>

        {unreadable.length > 0 && (
          <p className="mb-3 rounded-md border border-state-warn-border bg-state-warn-bg px-2.5 py-2 text-2xs text-state-warn-fg">
            Không đọc được: {unreadable.join(', ')}. File phải là sao kê PayPay tải từ app, và
            thẻ phải khai đủ ngày chốt + ngày đến hạn.
          </p>
        )}

        {lechNgay && (
          <p className="mb-3 rounded-md border border-state-warn-border bg-state-warn-bg px-2.5 py-2 text-2xs text-state-warn-fg">
            Ngày chốt / ngày trả khai trong app không khớp file — mọi kỳ sẽ xếp nhầm chỗ. Sửa
            tài khoản rồi nạp lại; chưa sửa thì không lưu được.
          </p>
        )}

        {dangDocSo && <p className="mb-3 text-sm text-fg-muted">Đang đọc sổ…</p>}

        {!dangDocSo &&
          reviewed.map(({ parsed: p, result }) => {
            const canXem = [
              ...result.extraInLedger.map((e) => ({
                key: `led-${e.tx.id}`,
                chu: `${dayMonthLabel(e.tx.occurred_on)} · ${e.tx.note || 'không ghi chú'} — sổ có, thẻ không`,
                amount: e.amount,
              })),
              ...result.missingFromLedger.map((l, i) => ({
                key: `stm-${l.iso}-${i}`,
                chu: `${dayMonthLabel(l.iso)} · ${l.name} — thẻ có, sổ không`,
                amount: l.amount,
              })),
            ]
            const mo = moRong[p.range.closeISO] ?? false
            return (
              <section key={p.range.closeISO} className="mb-3">
                <SectionTitle>
                  Quẹt {dayMonthLabel(p.range.start)} – {dayMonthLabel(p.range.closeISO)}
                </SectionTitle>

                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-fg-muted">Hoá đơn nhà thẻ · bị rút {dayMonthLabel(p.range.dueISO)}</span>
                  <Money
                    amount={p.total}
                    currency={card.currency}
                    tone="out"
                    className="font-bold"
                  />
                </div>

                {p.dueDateMismatch && (
                  <p className="mt-1.5 rounded-md border border-state-warn-border bg-state-warn-bg px-2.5 py-2 text-2xs text-state-warn-fg">
                    File ghi ngày rút {p.dueDateFromFile}, app tính {p.range.dueISO}.
                  </p>
                )}

                <p className="mt-1.5 text-sm text-fg-muted">
                  Khớp <Num tone="muted">{result.matchedCount}</Num>/
                  <Num tone="muted">{p.lines.length}</Num> dòng
                </p>

                {canXem.length > 0 && (
                  <div className="mt-2">
                    <p className="text-sm font-medium text-fg-primary">
                      Cần bạn xem (<Num>{canXem.length}</Num>)
                    </p>
                    {canXem.map((d) => (
                      <div key={d.key} className="flex items-baseline justify-between gap-2 text-sm">
                        <span className="text-fg-muted">{d.chu}</span>
                        <Money
                          amount={Math.abs(d.amount)}
                          currency={card.currency}
                          tone={d.amount < 0 ? 'in' : 'out'}
                        />
                      </div>
                    ))}
                  </div>
                )}

                {result.explained.length > 0 && (
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={() =>
                        setMoRong((s) => ({ ...s, [p.range.closeISO]: !mo }))
                      }
                      aria-expanded={mo}
                      aria-controls={`giai-thich-${p.range.closeISO}`}
                      className="min-h-11 text-sm text-fg-muted"
                    >
                      Giải thích được, bỏ qua (<Num tone="muted">{result.explained.length}</Num>){' '}
                      {mo ? '▴' : '▾'}
                    </button>
                    <Collapse open={mo} id={`giai-thich-${p.range.closeISO}`}>
                      {result.explained.map((e, i) => (
                        <div
                          key={`${e.cause}-${i}`}
                          className="flex items-baseline justify-between gap-2 text-sm"
                        >
                          <span className="text-fg-muted">{e.label}</span>
                          <Money
                            amount={Math.abs(e.amount)}
                            currency={card.currency}
                            tone="muted"
                          />
                        </div>
                      ))}
                    </Collapse>
                  </div>
                )}
              </section>
            )
          })}

        <div className="mt-1 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-md px-3 py-2 text-sm text-fg-muted hover:bg-surface-sunken"
          >
            Đóng
          </button>
          {reviewed.length > 0 && (
            <ActionButton
              variant="primary"
              onClick={luu}
              disabled={lechNgay || upsert.isPending}
            >
              {upsert.isPending ? 'Đang lưu…' : 'Lưu'} <Num tone="onAccent">{reviewed.length}</Num>{' '}
              kỳ
            </ActionButton>
          )}
        </div>
      </div>
    </div>
  )
}
