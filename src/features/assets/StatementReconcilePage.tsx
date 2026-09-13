// Trang đối chiếu sao kê của MỘT thẻ — thay màn trượt ImportStatementSheet (Đợt 1).
//
// Vì sao là trang: lô 13 kỳ với vài chục dòng lệch không vừa một màn trượt, và khi bấm
// một dòng để sửa giao dịch thì màn sửa phải mở ĐÈ lên đây rồi đóng lại mà file đã chọn
// vẫn còn — state của trang giữ file trong bộ nhớ, sửa xong query giao dịch invalidate,
// phép ghép tự chạy lại. Rời trang thì mất file đã chọn; hoá đơn đã bấm Lưu thì còn.
//
// Trang này KHÔNG bao giờ tự sửa/tạo/xoá giao dịch. Việc đó chỉ xảy ra khi người dùng bấm
// Sửa / Thêm vào sổ và lưu ở màn đó.

import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { FileUp } from 'lucide-react'
import {
  ActionButton, Card, Collapse, EmptyState, Money, Num, PageHeader, SectionTitle, StatusChip,
} from '../../components/ui'
import { useAccounts, useCardBills, useSearchTransactions, useUpsertCardBills } from '../../hooks/queries'
import { dayMonthLabel } from '../../lib/dates'
import { showToast } from '../../lib/dialog'
import type { CurrencyCode } from '../../lib/money'
import type { TransactionRow } from '../../types/database.types'
import { EditTransactionSheet } from '../transactions/EditTransactionSheet'
import { AddFromStatementSheet } from './AddFromStatementSheet'
import { parseStatement } from './parseStatement'
import { billRowsFor, mergeStatements } from './statementBatch'
import type { ParsedStatement } from './statementLine'
import { overviewRows } from './statementOverview'
import { emptyResult, reconcileBatch, type LedgerTx, type ReconcileResult } from './statementReconcile'
import { prefillFromLine, reviewRows } from './statementReviewRows'

/**
 * Không có mốc trên, giống `useCardStatements`: một lô 13 file trải 13 kỳ, và cửa sổ
 * truy vấn phải phủ HẾT kỳ muộn nhất. Chặn trên bằng ngày hôm nay là bỏ mất giao dịch
 * ghi ngày tương lai của kỳ chưa chốt, và phần thiếu đó hiện ra thành "cần bạn xem".
 */
const FAR_FUTURE = '9999-12-31'

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

export function StatementReconcilePage() {
  const { accountId = '' } = useParams()
  const { data: accounts = [] } = useAccounts()
  const account = accounts.find((a) => a.id === accountId)
  const isCard = account?.type === 'card'
  const card = account
    ? {
        id: account.id,
        name: account.name,
        currency: account.currency as CurrencyCode,
        statementDay: account.statement_day,
        paymentDueDay: account.payment_due_day,
      }
    : null
  // Thiếu ngày chốt / ngày trả thì không dựng được kỳ, mà bộ đọc file lấy kỳ TỪ hai ngày
  // đó — nên không có chúng thì mọi file đều "không đọc được". Chặn ngay ở ô chọn file.
  const coNgay = !!card && isCard && card.statementDay != null && card.paymentDueDay != null

  const [parsed, setParsed] = useState<ParsedStatement[]>([])
  const [unreadable, setUnreadable] = useState<string[]>([])
  const [chon, setChon] = useState<string | null>(null)          // closeISO kỳ đang chọn
  const [moGiaiThich, setMoGiaiThich] = useState(false)
  const [editing, setEditing] = useState<TransactionRow | null>(null)
  const [adding, setAdding] = useState<TransactionRow | null>(null)
  // Ước lượng CAO, cố ý: `EditTransactionSheet` không nói được "đã lưu hay chỉ đóng", nên
  // mọi lần đóng đều tính một. Dòng nhắc bên dưới là lời gợi ý đi kiểm số nợ, không phải
  // con số kế toán — đếm dư một hai lần không làm nó sai việc.
  const [soLanSua, setSoLanSua] = useState(0)
  const upsert = useUpsertCardBills()
  const { data: cardBills = [] } = useCardBills()

  const merged = useMemo(() => mergeStatements(parsed), [parsed])

  // Cửa sổ truy vấn suy TỪ chính các file đã bóc: trang tài khoản chỉ giữ một tháng, mà lô
  // này trải nhiều kỳ. Mở xuống tới NGÀY DÒNG THẺ SỚM NHẤT chứ không chỉ range.start: ETC
  // ghi trễ 5 tuần nằm trước kỳ, không có dòng sổ của ngày đó thì không ghép được.
  const earliestStart = useMemo(() => {
    let min: string | null = null
    for (const m of merged) {
      for (const d of [m.range.start, ...m.lines.map((l) => l.iso)]) if (min == null || d < min) min = d
    }
    return min
  }, [merged])

  const { data: txs = [], isPending } = useSearchTransactions(
    { start: earliestStart ?? FAR_FUTURE, end: FAR_FUTURE, accountIds: [accountId] },
    earliestStart != null,
  )
  const dangDocSo = earliestStart != null && isPending

  // Chưa đọc xong sổ thì KHÔNG ghép: ghép với mảng giao dịch rỗng cho ra "cả kỳ đều thiếu
  // trong sổ", tức một màn đỏ rực trong khoảnh khắc rồi tự khỏi. Map rỗng = chưa có kết quả.
  const results = useMemo(
    () =>
      dangDocSo
        ? new Map<string, ReconcileResult>()
        : reconcileBatch(merged, txs.map(toLedgerTx), accountId),
    [dangDocSo, merged, txs, accountId],
  )
  const rows = useMemo(
    () => overviewRows(cardBills, accountId, merged, results),
    [cardBills, accountId, merged, results],
  )
  // Kỳ đang chọn: người dùng bấm thì theo họ; chưa bấm thì kỳ muộn nhất còn hàng cần xem,
  // không có thì kỳ muộn nhất vừa nạp.
  const chonHieuLuc =
    chon ?? rows.find((r) => r.status === 'review')?.closeISO ?? rows.find((r) => r.loaded)?.closeISO ?? null
  const kyChon = merged.find((m) => m.range.closeISO === chonHieuLuc) ?? null
  const ketQua = kyChon ? results.get(kyChon.range.closeISO) ?? emptyResult() : null
  const hang = kyChon && ketQua ? reviewRows(ketQua, kyChon.range.closeISO) : []

  // Ngày chốt / ngày trả khai sai thì MỌI kỳ xếp nhầm chỗ — chặn lưu, đừng lưu một nửa.
  const lechNgay = merged.some((m) => m.dueDateMismatch)

  async function chonFile(files: FileList | null) {
    const danhSach = files ? Array.from(files) : []
    if (danhSach.length === 0) return
    const doc: ParsedStatement[] = []
    const hong: string[] = []
    for (const f of danhSach) {
      const p = parseStatement(await f.text(), card!, f.name)
      if (p) doc.push(p)
      else hong.push(f.name)
    }
    setUnreadable(hong)
    setParsed(doc)
    // Lô mới thì kỳ đang chọn của lô cũ không còn nghĩa — trả về cho phép chọn tự động.
    setChon(null)
  }

  function luu() {
    if (!card) return
    upsert.mutate(billRowsFor(card.id, merged), {
      onSuccess: () => showToast(`Đã lưu ${merged.length} kỳ`, 'success'),
      onError: (err) => showToast(`Không lưu được: ${(err as Error).message}`, 'error'),
    })
  }

  const txById = useMemo(() => new Map(txs.map((t) => [t.id, t])), [txs])

  return (
    <div className="flex flex-col gap-3 p-3 lg:p-6">
      <PageHeader
        title="Đối chiếu sao kê"
        back={`/assets/account/${accountId}`}
        subtitle={card ? `${card.name} · chỉ lưu tổng hoá đơn, không đụng giao dịch nào` : undefined}
      />

      {/* `multiple` là BẮT BUỘC: hai luật "giải thích được" của phép đối chiếu cần
          dòng của kỳ liền kề, nên nạp từng file lẻ là tự tắt hai luật đó. */}
      <Card
        as="label"
        className="flex cursor-pointer items-center gap-3 focus-within:ring-2 focus-within:ring-accent"
      >
        <FileUp className="h-5 w-5 text-fg-muted" />
        <span className="flex-1 text-sm text-fg-primary">
          Chọn file CSV (chọn cả lô, nhiều kỳ một lần)
        </span>
        <input
          type="file"
          multiple
          accept=".csv"
          disabled={!coNgay}
          className="sr-only"
          onChange={(e) => {
            // `e.target.files` là FileList SỐNG — đặt value='' xoá luôn file bên
            // trong chính nó, nên phải đọc xong rồi mới reset. Reset để chọn LẠI
            // đúng lô cũ vẫn sinh sự kiện change lần hai.
            const chonDuoc = e.target.files
            void chonFile(chonDuoc)
            e.target.value = ''
          }}
        />
      </Card>

      {!coNgay && (
        <p className="text-sm text-fg-muted">
          Thẻ chưa có đủ ngày chốt sao kê và ngày đến hạn nên chưa dựng được kỳ. Sửa tài khoản
          rồi quay lại đây.
        </p>
      )}

      {unreadable.length > 0 && (
        <p className="rounded-md border border-state-warn-border bg-state-warn-bg px-2.5 py-2 text-2xs text-state-warn-fg">
          Không đọc được: {unreadable.join(', ')}. File phải là sao kê PayPay hoặc Rakuten
          e-NAVI tải từ app/web nhà thẻ, và thẻ phải khai đủ ngày chốt + ngày đến hạn.
        </p>
      )}

      {lechNgay && (
        <p className="rounded-md border border-state-warn-border bg-state-warn-bg px-2.5 py-2 text-2xs text-state-warn-fg">
          Ngày chốt / ngày trả khai trong app không khớp file — mọi kỳ sẽ xếp nhầm chỗ. Sửa
          tài khoản rồi nạp lại; chưa sửa thì không lưu được.
        </p>
      )}

      {/* Bảng tổng quan */}
      <Card as="section" padding="none">
        <SectionTitle className="px-3 pt-3">Các kỳ</SectionTitle>
        {rows.length === 0 ? (
          <EmptyState compact>Chưa có hoá đơn nào. Chọn file sao kê để bắt đầu.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm tabular-nums">
              <thead>
                <tr className="text-fg-muted">
                  <th className="py-1 pl-3 pr-2 text-left font-medium">Kỳ</th>
                  <th className="hidden py-1 px-2 font-medium sm:table-cell">Bị rút</th>
                  <th className="py-1 px-2 font-medium">Hoá đơn</th>
                  <th className="py-1 px-2 font-medium">Khớp</th>
                  <th className="py-1 pl-2 pr-3 text-left font-medium">Tình trạng</th>
                </tr>
              </thead>
              <tbody className="text-fg-secondary">
                {rows.map((r) => (
                  <tr
                    key={r.closeISO}
                    className={`cursor-pointer border-t border-border-subtle ${r.closeISO === chonHieuLuc ? 'bg-surface-sunken' : ''}`}
                    onClick={() => r.loaded && setChon(r.closeISO)}
                  >
                    <td className="py-2 pl-3 pr-2 text-left text-fg-primary">{dayMonthLabel(r.closeISO)}</td>
                    <td className="hidden py-2 px-2 sm:table-cell">{dayMonthLabel(r.dueISO)}</td>
                    <td className="py-2 px-2">
                      <Money amount={r.billTotal} currency={card?.currency ?? 'JPY'} tone="out" />
                      {r.loaded && r.loaded.parts.length > 1 && (
                        <span className="block text-2xs text-fg-muted">
                          {r.loaded.parts.map((p, i) => (
                            <span key={p.source}>
                              {i > 0 && ' · '}
                              {p.sourceLabel}{' '}
                              <Money amount={p.total} currency={card?.currency ?? 'JPY'} tone="muted" />
                            </span>
                          ))}
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-2">
                      {r.loaded ? (
                        <>
                          <Num tone="muted">{r.loaded.matchedCount}</Num>/
                          <Num tone="muted">{r.loaded.lineCount}</Num>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-2 pl-2 pr-3 text-left">
                      {/* Đang đọc sổ thì CHƯA có kết quả ghép: `overviewRows` trả 'ok' cho
                          mọi kỳ vừa nạp, và một chip "Khớp hết" trong lúc chờ là nói dối.
                          Nói thẳng là đang đọc, chip chỉ hiện khi đã ghép xong. */}
                      {r.loaded && dangDocSo ? (
                        <span className="text-fg-muted">Đang đọc sổ…</span>
                      ) : (
                        <>
                          {r.status === 'saved-only' && (
                            <span className="text-fg-muted">Đã lưu, chưa nạp file lần này</span>
                          )}
                          {r.status === 'ok' && <StatusChip tone="good">Khớp hết</StatusChip>}
                          {r.status === 'review' && (
                            <StatusChip tone="warn">
                              <Num tone="warn">{r.loaded!.reviewCount}</Num> cần xem
                            </StatusChip>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Kỳ đang chọn */}
      {kyChon && ketQua && (
        <Card as="section" padding="lg">
          <SectionTitle>
            Quẹt {dayMonthLabel(kyChon.range.start)} – {dayMonthLabel(kyChon.range.closeISO)} · bị
            rút {dayMonthLabel(kyChon.range.dueISO)}
          </SectionTitle>
          {hang.length > 0 && (
            <div className="mt-2">
              <p className="text-sm font-medium text-fg-primary">
                Cần bạn xem (<Num>{hang.length}</Num>)
              </p>
              {hang.map((h) => (
                <div
                  key={h.key}
                  className="flex items-center justify-between gap-2 border-t border-border-subtle py-1.5 text-sm first:border-t-0"
                >
                  <span className="min-w-0 flex-1 text-fg-muted">
                    {h.kind === 'ledger' && `${dayMonthLabel(h.tx.occurred_on)} · ${h.tx.note || 'không ghi chú'} — sổ có, thẻ không`}
                    {h.kind === 'statement' && `${dayMonthLabel(h.line.iso)} · ${h.line.name} — thẻ có, sổ không`}
                    {h.kind === 'topups' && `Nạp ví chưa ghép được — ${h.count} lần, ví có số dư nên chưa chắc là lỗi sổ`}
                  </span>
                  <Money
                    amount={Math.abs(h.amount)}
                    currency={card!.currency}
                    tone={h.amount < 0 ? 'in' : 'out'}
                  />
                  {/* Hàng hoàn-tiền dựng lại từ `refundDiffs` không giữ id giao dịch gốc
                      (Task 1), nên không mở được màn sửa — không có id thì không có nút. */}
                  {h.kind === 'ledger' && h.tx.id !== '' && (
                    <ActionButton
                      onClick={() => {
                        const t = txById.get(h.tx.id)
                        if (t) setEditing(t)
                      }}
                    >
                      Sửa
                    </ActionButton>
                  )}
                  {h.kind === 'statement' && (
                    <ActionButton onClick={() => setAdding(prefillFromLine(h.line, card!.id))}>
                      Thêm vào sổ
                    </ActionButton>
                  )}
                </div>
              ))}
            </div>
          )}

          {ketQua.explained.length > 0 && (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => setMoGiaiThich((s) => !s)}
                aria-expanded={moGiaiThich}
                aria-controls={`giai-thich-${kyChon.range.closeISO}`}
                className="min-h-11 text-sm text-fg-muted"
              >
                Giải thích được, bỏ qua (<Num tone="muted">{ketQua.explained.length}</Num>){' '}
                {moGiaiThich ? '▴' : '▾'}
              </button>
              <Collapse open={moGiaiThich} id={`giai-thich-${kyChon.range.closeISO}`}>
                {ketQua.explained.map((e, i) => (
                  <div
                    key={`${e.cause}-${i}`}
                    className="flex items-baseline justify-between gap-2 text-sm"
                  >
                    <span className="text-fg-muted">{e.label}</span>
                    <Money amount={Math.abs(e.amount)} currency={card!.currency} tone="muted" />
                  </div>
                ))}
              </Collapse>
            </div>
          )}
        </Card>
      )}

      {/* Cuối trang */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {soLanSua > 0 && (
          <p className="mr-auto text-2xs text-fg-muted">
            Đã sửa <Num tone="muted">{soLanSua}</Num> dòng. Số dư thẻ đổi theo — nhớ Chỉnh số nợ
            trên trang thẻ.
          </p>
        )}
        {merged.length > 0 && (
          <ActionButton
            variant="primary"
            onClick={luu}
            disabled={lechNgay || upsert.isPending || dangDocSo}
          >
            {upsert.isPending ? 'Đang lưu…' : 'Lưu'} <Num tone="onAccent">{merged.length}</Num> kỳ
          </ActionButton>
        )}
      </div>

      {editing && (
        <EditTransactionSheet
          tx={editing}
          onClose={() => {
            setEditing(null)
            setSoLanSua((n) => n + 1)
          }}
        />
      )}
      {adding && (
        <AddFromStatementSheet
          initial={adding}
          onClose={() => setAdding(null)}
          onSaved={() => setSoLanSua((n) => n + 1)}
        />
      )}
    </div>
  )
}
