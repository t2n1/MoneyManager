// Trang đối chiếu sao kê của MỘT thẻ — thay màn trượt ImportStatementSheet (Đợt 1).
//
// Vì sao là trang: lô 13 kỳ với vài chục dòng lệch không vừa một màn trượt, và khi bấm
// một dòng để sửa giao dịch thì màn sửa phải mở ĐÈ lên đây rồi đóng lại mà file đã chọn
// vẫn còn — state của trang giữ file trong bộ nhớ, sửa xong query giao dịch invalidate,
// phép ghép tự chạy lại. Rời trang thì mất file đã chọn; hoá đơn đã bấm Lưu thì còn.
//
// Trang này KHÔNG bao giờ tự sửa/tạo/xoá giao dịch. Việc đó chỉ xảy ra khi người dùng bấm
// Sửa / Thêm vào sổ và lưu ở màn đó.

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { FileUp } from 'lucide-react'
import {
  ActionButton, Card, EmptyState, Money, Num, PageHeader, SectionTitle, SegmentedControl,
  StatusChip, STATUS_FILL, type MoneyTone,
} from '../../components/ui'
import { useAccounts, useCardBills, useSearchTransactions, useUpsertCardBills } from '../../hooks/queries'
import { dayMonthLabel } from '../../lib/dates'
import { showToast } from '../../lib/dialog'
import type { CurrencyCode } from '../../lib/money'
import type { TransactionRow } from '../../types/database.types'
import { EditTransactionSheet } from '../transactions/EditTransactionSheet'
import { AddFromStatementSheet } from './AddFromStatementSheet'
import { CAUSE_LABEL, pairRows, type PairRow } from './pairRows'
import { parseStatement } from './parseStatement'
import { billRowsFor, mergeStatements } from './statementBatch'
import { billAfterDismiss, keysFor, splitDismissed, toggleKey } from './statementDismiss'
import { sourceLabelFor, type ParsedStatement } from './statementLine'
import { overviewRows } from './statementOverview'
import { emptyResult, reconcileBatch, type LedgerTx, type ReconcileResult } from './statementReconcile'
import { prefillFromLine, reviewRows, type ReviewRow } from './statementReviewRows'

/**
 * Không có mốc trên, giống `useCardStatements`: một lô 13 file trải 13 kỳ, và cửa sổ
 * truy vấn phải phủ HẾT kỳ muộn nhất. Chặn trên bằng ngày hôm nay là bỏ mất giao dịch
 * ghi ngày tương lai của kỳ chưa chốt, và phần thiếu đó hiện ra thành "cần bạn xem".
 */
const FAR_FUTURE = '9999-12-31'

/** Hiện dòng nào trong bảng ghép đôi: chỉ phần lệch, hay cả những cặp đã khớp. */
type CheDo = 'lech' | 'tatca'

/**
 * Lớp của cả HÀNG trong bảng ghép đôi. `matched` mờ đi bằng `text-fg-muted` chứ KHÔNG
 * bằng `opacity` viết tay: opacity làm mờ luôn nền cảnh báo và viền, mà ở đây chỉ có
 * chữ cần lùi lại.
 */
const LOP_HANG: Record<PairRow['kind'], string> = {
  diff: 'bg-state-warn-bg',
  explained: 'italic text-fg-secondary',
  matched: 'text-fg-muted',
  dismissed: 'text-fg-muted',
}

/**
 * Một bên của cặp không có gì để đối chiếu. Nói thẳng thay vì để ô trống: ô trống trong
 * một lưới hai cột đọc ra như lỗi render, không ra như "sổ không ghi khoản này".
 */
const KHONG_CO_DONG = <span className="italic text-fg-muted">không có dòng nào</span>

/**
 * Khoá render một hàng. Hàng lệch / đã bỏ qua đã có khoá riêng (`ReviewRow.key`, đã tính
 * hậu tố cho dòng trùng); cặp thì lấy cause + vị trí — `pairRows` dựng lại cả danh sách
 * mỗi lượt nên vị trí ổn định trong một lượt bày.
 */
function keyHang(r: PairRow, i: number): string {
  if (r.kind === 'diff' || r.kind === 'dismissed') return r.row.key
  return `${r.pair.cause ?? 'match'}-${i}`
}

/**
 * Một bên của hàng ghép đôi: ngày · tên (hoặc ghi chú) · nguồn · số tiền.
 *
 * Chữ KHÔNG mang lớp màu riêng — màu của cả hàng do `LOP_HANG` quyết. Tô riêng ngày bằng
 * `text-fg-muted` là đặt một cặp màu chưa ai đo lên nền `bg-state-warn-bg` của hàng lệch,
 * mà hàng lệch chính là hàng cần đọc rõ nhất.
 */
function ben(
  iso: string,
  ten: string,
  amount: number,
  currency: CurrencyCode,
  tone: MoneyTone,
  duoi?: string,
): ReactNode {
  return (
    <>
      {dayMonthLabel(iso)} · {ten}
      {duoi ? ` · ${duoi}` : ''}{' '}
      <Money amount={Math.abs(amount)} currency={currency} tone={tone} />
    </>
  )
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
  adjust_kind: t.adjust_kind ?? null,
})

export function StatementReconcilePage() {
  const { accountId = '' } = useParams()
  const { data: accounts = [], isPending: dangTaiTaiKhoan } = useAccounts()
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
  // Mặc định 'lech': phần khớp thẳng là ~200 dòng của một kỳ, mở sẵn thì bốn dòng đáng
  // sửa nằm lẫn trong đó — đúng cái mà cả phép ghép sinh ra để tránh.
  const [cheDo, setCheDo] = useState<CheDo>('lech')
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

  // `dangLamMoi`: trang này đọc sổ qua cache ['search', filter], còn `useCreateTransaction`
  // chèn optimistic vào cache ['transactions', start, end] — hai khoá khác nhau, nên "Thêm
  // vào sổ" xong, dòng vừa lưu vẫn còn ở "Cần bạn xem" với nút sống cho tới khi ['search']
  // refetch xong. Khoá cả hai nút (Sửa và Thêm vào sổ) trong lúc đó để tránh bấm lần hai ghi
  // trùng — KHÔNG gộp vào `chuaGhepDuoc`, vì cờ đó xoá cả khối "Cần bạn xem" mỗi lần refetch nền.
  const { data: txs = [], isPending, isError, isFetching: dangLamMoi } = useSearchTransactions(
    { start: earliestStart ?? FAR_FUTURE, end: FAR_FUTURE, accountIds: [accountId] },
    earliestStart != null,
  )
  const dangDocSo = earliestStart != null && isPending
  // Query HỎNG thì `isPending` là false, tức không có cái cờ kia che — và ghép với mảng
  // rỗng cho ra "cả kỳ thẻ có, sổ không", MỖI dòng kèm nút "Thêm vào sổ". Một lần mạng
  // chập không được phép trông giống một quyển sổ trống: người dùng bấm theo là ghi vào
  // sổ hàng chục bản trùng. Nên lỗi đọc sổ khoá y như lúc đang đọc, và nói thẳng là lỗi.
  const loiDocSo = earliestStart != null && isError
  const chuaGhepDuoc = dangDocSo || loiDocSo

  // Chưa đọc xong sổ thì KHÔNG ghép: ghép với mảng giao dịch rỗng cho ra "cả kỳ đều thiếu
  // trong sổ", tức một màn đỏ rực trong khoảnh khắc rồi tự khỏi. Map rỗng = chưa có kết quả.
  const results = useMemo(
    () =>
      chuaGhepDuoc
        ? new Map<string, ReconcileResult>()
        : reconcileBatch(merged, txs.map(toLedgerTx), accountId),
    [chuaGhepDuoc, merged, txs, accountId],
  )
  const rows = useMemo(
    () => overviewRows(cardBills, accountId, merged, results),
    [cardBills, accountId, merged, results],
  )
  // Kỳ đang chọn: người dùng bấm thì theo họ; chưa bấm thì kỳ muộn nhất còn hàng cần xem,
  // không có thì kỳ muộn nhất vừa nạp.
  const chonHieuLuc =
    chon ?? rows.find((r) => r.status === 'review')?.closeISO ?? rows.find((r) => r.loaded)?.closeISO ?? null
  // GHIM kỳ suy ra đầu tiên. Để nguyên dạng suy thì sửa xong dòng cần xem CUỐI của kỳ đang
  // mở là kỳ đó tụt về 'ok', phép suy nhảy sang kỳ khác, và màn đổi dưới tay người đang
  // đọc. Chỉ ghim khi đã ghép xong — ghim lúc `results` còn rỗng là ghim nhầm kỳ, vì lúc
  // đó chưa kỳ nào mang 'review' để mà ưu tiên. Bấm kỳ khác hay nạp lô mới vẫn đổi được
  // (`chonFile` trả `chon` về null).
  useEffect(() => {
    if (!chuaGhepDuoc && chon == null && chonHieuLuc != null) setChon(chonHieuLuc)
  }, [chuaGhepDuoc, chon, chonHieuLuc])
  const kyChon = merged.find((m) => m.range.closeISO === chonHieuLuc) ?? null
  const ketQua = kyChon ? results.get(kyChon.range.closeISO) ?? emptyResult() : null
  const hang = kyChon && ketQua ? reviewRows(ketQua, kyChon.range.closeISO) : []

  // Bill đã lưu của kỳ đang chọn (nếu có) — dấu Bỏ qua nằm ở đây.
  const billChon = kyChon
    ? cardBills.find((b) => b.account_id === accountId && b.close_date === kyChon.range.closeISO) ?? null
    : null
  const daBoQua = billChon?.dismissed ?? []
  const { open: hangMo, hidden: hangDaBo } = splitDismissed(hang, daBoQua)
  // Khoá LƯU của từng hàng, tra theo khoá render `h.key`. Phải tính `keysFor` trên TOÀN
  // `hang`: hậu tố `#k` của dòng trùng đếm theo thứ tự cả kỳ, tính lại trên một danh sách
  // con (hangMo / hangDaBo) sẽ cho khoá khác — tức bỏ qua nhầm dòng.
  const khoaHang = keysFor(hang)
  const khoaTheoHang = new Map(hang.map((h, i) => [h.key, khoaHang[i]] as const))
  const khoaCua = (h: ReviewRow) => khoaTheoHang.get(h.key)!

  // Một danh sách duy nhất cho cả kỳ: lệch → giải thích được → (khớp, nếu hỏi) → đã bỏ qua.
  const hangGhep = ketQua ? pairRows(ketQua, hangMo, hangDaBo, cheDo === 'tatca') : []

  // Thanh tỷ lệ và dòng tóm tắt đếm CÙNG một thứ, bằng CÙNG một phép: số DÒNG THẺ, mỗi
  // dòng đúng một lần. Không dùng `matchedCount` — nó đếm CẶP 1-1, mà cặp `date-edge` /
  // `late-posting` vừa nằm trong nó vừa mang cause, nên "khớp + giải thích" cộng lại vượt
  // quá số dòng của kỳ: một kỳ 10 dòng có 2 dòng lệch ngày ra 12/10, và thanh ra 120%.
  const dongCuaCap = (coCause: boolean) =>
    ketQua ? ketQua.pairs.reduce((s, p) => s + (!!p.cause === coCause ? p.lines.length : 0), 0) : 0
  const khopDong = dongCuaCap(false)
  const giaiThichDong = dongCuaCap(true)
  const tongDongThe = kyChon?.lines.length ?? 0
  const pct = tongDongThe ? Math.round((100 * (khopDong + giaiThichDong)) / tongDongThe) : 100

  // Ngày chốt / ngày trả khai sai thì MỌI kỳ xếp nhầm chỗ — chặn lưu, đừng lưu một nửa.
  const lechNgay = merged.some((m) => m.dueDateMismatch)

  // Khoá nút Bỏ qua / Xem lại. Gác theo `dueDateMismatch` CỦA KỲ ĐANG MỞ, không phải
  // `lechNgay` gộp cả lô — xem comment ở `ghiDau`.
  const khoaDau = dangLamMoi || upsert.isPending || (kyChon?.dueDateMismatch ?? false)

  // Bỏ qua / Xem lại: ghi NGAY một dòng card_bills cho kỳ đó (tạo bill luôn nếu chưa có),
  // không đợi "Lưu N kỳ". Gác theo `kyChon.dueDateMismatch` — CỦA RIÊNG kỳ đang mở, không
  // phải `lechNgay` (gộp cả lô): một file khai sai ngày không được phép khoá luôn nút Bỏ
  // qua của mười hai kỳ còn lại đang đúng. `lechNgay` chỉ còn dùng cho nút Lưu, vì Lưu ghi
  // NGUYÊN LÔ một lượt nên phải chặn khi bất kỳ kỳ nào trong lô sai.
  function ghiDau(keys: string[], on: boolean) {
    if (!card || !kyChon || kyChon.dueDateMismatch) return
    let next: string[] = [...daBoQua]
    for (const k of keys) next = toggleKey(next, k, on)
    // `onSettled` ở useUpsertCardBills trả về promise invalidate ['cardBills'] — mutate()
    // chỉ rời isPending SAU khi cache mới về, nên `daBoQua` đọc lại đã tươi trước khi nút
    // Bỏ qua/Xem lại bật lại (xem comment tại onSettled trong queries.ts).
    upsert.mutate([billAfterDismiss(kyChon, card.id, next, hang)], {
      onError: (err) => showToast(`Không ghi được: ${(err as Error).message}`, 'error'),
    })
  }

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
    upsert.mutate(billRowsFor(card.id, merged, { existing: cardBills, results }), {
      onSuccess: () => showToast(`Đã lưu ${merged.length} kỳ`, 'success'),
      onError: (err) => showToast(`Không lưu được: ${(err as Error).message}`, 'error'),
    })
  }

  const txById = useMemo(() => new Map(txs.map((t) => [t.id, t])), [txs])

  // Ba hàm dựng ba cột của một hàng ghép đôi. Dùng CHUNG cho cả bốn loại hàng — chép
  // riêng cho "đã bỏ qua" như bản trước là hai bản trôi khỏi nhau, và bản nằm trong cụm
  // gấp lại chẳng ai soi để thấy nó sai.

  /** Bên SỔ (cột trái). */
  function beTrai(r: PairRow, currency: CurrencyCode): ReactNode {
    if (r.kind === 'diff' || r.kind === 'dismissed') {
      const h = r.row
      if (h.kind === 'ledger') {
        const tone: MoneyTone = r.kind === 'dismissed' ? 'muted' : h.amount < 0 ? 'in' : 'out'
        return ben(h.tx.occurred_on, h.tx.note || 'không ghi chú', h.amount, currency, tone)
      }
      // Cụm nạp ví là chuyện của phía thẻ: ví có số dư nên sổ KHÔNG chắc thiếu gì. In
      // "không có dòng nào" ở đây là vu cho quyển sổ một lỗi nó chưa chắc có.
      if (h.kind === 'topups') return null
      return KHONG_CO_DONG
    }
    const p = r.pair
    if (p.ledger.length === 0) return KHONG_CO_DONG
    // Cặp n:m (sổ ghi gộp, nạp ví) nối tên bằng " + " và in TỔNG của cặp — số của từng
    // dòng con không nói được gì khi hai bên khác độ mịn.
    return ben(
      p.ledger[0].occurred_on,
      p.ledger.map((t) => t.note || 'không ghi chú').join(' + '),
      p.amount,
      currency,
      'muted',
    )
  }

  /** Bên THẺ (cột phải). */
  function bePhai(r: PairRow, currency: CurrencyCode): ReactNode {
    if (r.kind === 'diff' || r.kind === 'dismissed') {
      const h = r.row
      const tone: MoneyTone = r.kind === 'dismissed' ? 'muted' : h.amount < 0 ? 'in' : 'out'
      if (h.kind === 'statement') {
        return ben(h.line.iso, h.line.name, h.amount, currency, tone, sourceLabelFor(h.line.source ?? ''))
      }
      if (h.kind === 'topups') {
        return (
          <>
            Nạp ví chưa ghép được — <Num tone="muted">{h.count}</Num> lần{' '}
            <Money amount={Math.abs(h.amount)} currency={currency} tone={tone} />
          </>
        )
      }
      return KHONG_CO_DONG
    }
    const p = r.pair
    if (p.lines.length === 0) return KHONG_CO_DONG
    return ben(
      p.lines[0].iso,
      p.lines.map((l) => l.name).join(' + '),
      p.amount,
      currency,
      'muted',
      sourceLabelFor(p.lines[0].source ?? ''),
    )
  }

  /** Chiều của cặp: → chỉ sổ có, ← chỉ thẻ có, ↔ hai bên cùng có. */
  function muiTen(r: PairRow): string {
    if (r.kind === 'diff' || r.kind === 'dismissed') return r.row.kind === 'ledger' ? '→' : '←'
    const p = r.pair
    if (p.ledger.length > 0 && p.lines.length > 0) return '↔'
    return p.ledger.length > 0 ? '→' : '←'
  }

  /** Cột nút / nhãn cuối hàng. */
  function nut(r: PairRow, cardId: string): ReactNode {
    if (r.kind === 'matched') return null
    if (r.kind === 'explained') {
      return r.pair.cause ? <StatusChip tone="info">{CAUSE_LABEL[r.pair.cause]}</StatusChip> : null
    }
    const h = r.row
    if (r.kind === 'dismissed') {
      return (
        <ActionButton disabled={khoaDau} onClick={() => ghiDau([khoaCua(h)], false)}>
          Xem lại
        </ActionButton>
      )
    }
    return (
      <>
        {/* Không dán nhãn thì một dòng điều chỉnh bị nhà thẻ GỘP đọc y hệt một khoản quên
            ghi — và người dùng bấm "Thêm vào sổ" thật. */}
        {h.kind !== 'topups' && h.refund && <StatusChip tone="info">hoàn tiền</StatusChip>}
        {/* Hàng hoàn-tiền dựng lại từ `refundDiffs` không giữ id giao dịch gốc (Task 1),
            nên không mở được màn sửa — không có id thì không có nút. */}
        {h.kind === 'ledger' && h.tx.id !== '' && (
          <ActionButton
            disabled={dangLamMoi}
            onClick={() => {
              const t = txById.get(h.tx.id)
              if (t) setEditing(t)
            }}
          >
            Sửa
          </ActionButton>
        )}
        {h.kind === 'statement' && (
          <ActionButton
            disabled={dangLamMoi}
            onClick={() => setAdding(prefillFromLine(h.line, cardId))}
          >
            Thêm vào sổ
          </ActionButton>
        )}
        {/* Cụm nạp ví chỉ có nút này (spec §4.4): không sửa được một cụm. */}
        <ActionButton disabled={khoaDau} onClick={() => ghiDau([khoaCua(h)], true)}>
          Bỏ qua
        </ActionButton>
      </>
    )
  }

  return (
    <div className="flex flex-col gap-3 p-3 lg:p-6">
      <PageHeader
        title="Đối chiếu sao kê"
        back={`/assets/account/${accountId}`}
        subtitle={card ? `${card.name} · chỉ lưu tổng hoá đơn, không đụng giao dịch nào` : undefined}
      />

      {/* Danh sách tài khoản chưa về thì `card` là null — mà null ở đây KHÔNG có nghĩa
          "thẻ khai thiếu ngày". Mở thẳng link hay tải nguội là rơi đúng khoảnh khắc đó,
          và như vậy câu "Thẻ chưa có đủ ngày chốt…" sẽ hiện rồi ô chọn file bị khoá cho
          một cái thẻ hoàn toàn hợp lệ. Đang tải thì nói đang tải, không phán gì về thẻ. */}
      {dangTaiTaiKhoan ? (
        <EmptyState compact>Đang tải…</EmptyState>
      ) : !account ? (
        // Đã tải xong danh sách tài khoản mà không thấy id này — khác hẳn "đang tải": không
        // có tài khoản thì không có gì để dựng (không ô chọn file, không bảng), nói thẳng.
        <EmptyState compact>Không tìm thấy tài khoản này.</EmptyState>
      ) : (
        <>
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
              Thẻ chưa có đủ ngày chốt sao kê và ngày đến hạn nên chưa dựng được kỳ. Sửa tài
              khoản rồi quay lại đây.
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

          {loiDocSo && (
            <p className="rounded-md border border-state-warn-border bg-state-warn-bg px-2.5 py-2 text-2xs text-state-warn-fg">
              Không đọc được sổ giao dịch nên chưa đối chiếu được. Thử tải lại trang; chưa đọc
              được sổ thì không lưu được hoá đơn.
            </p>
          )}

          {/* Bảng tổng quan. Chỉ dựng khi đã có thẻ: mọi con số ở đây là tiền của THẺ ĐÓ,
              nên không có thẻ thì không có loại tiền để in — đoán một loại là in số sai. */}
          {card && (
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
                        <th className="hidden py-1 px-2 font-medium sm:table-cell">Sổ</th>
                        <th className="py-1 px-2 font-medium">Lệch</th>
                        <th className="py-1 pl-2 pr-3 text-left font-medium">Tình trạng</th>
                      </tr>
                    </thead>
                    <tbody className="text-fg-secondary">
                      {rows.map((r) => (
                        <tr
                          key={r.closeISO}
                          className={`border-t border-border-subtle ${r.closeISO === chonHieuLuc ? 'bg-surface-sunken' : ''}`}
                        >
                          <td className="py-2 pl-3 pr-2 text-left text-fg-primary">
                            {/* Chỗ bấm là một <button> THẬT chứ không phải onClick trên
                                <tr>: hàng bảng không nhận tiêu điểm bàn phím, nên bản
                                trước chỉ mở được kỳ bằng chuột. Kỳ chưa nạp file lần này
                                thì không có gì để mở — in chữ trơn. */}
                            {r.loaded ? (
                              <button
                                type="button"
                                onClick={() => setChon(r.closeISO)}
                                aria-pressed={r.closeISO === chonHieuLuc}
                                className="min-h-11 cursor-pointer rounded-md px-1 text-left text-sm text-fg-primary hover:bg-surface-sunken"
                              >
                                {dayMonthLabel(r.closeISO)}
                              </button>
                            ) : (
                              dayMonthLabel(r.closeISO)
                            )}
                          </td>
                          <td className="hidden py-2 px-2 sm:table-cell">{dayMonthLabel(r.dueISO)}</td>
                          <td className="py-2 px-2">
                            <Money amount={r.billTotal} currency={card.currency} tone="out" />
                            {r.loaded && r.loaded.parts.length > 1 && (
                              <span className="block text-2xs text-fg-muted">
                                {r.loaded.parts.map((p, i) => (
                                  <span key={p.source}>
                                    {i > 0 && ' · '}
                                    {p.sourceLabel}{' '}
                                    <Money amount={p.total} currency={card.currency} tone="muted" />
                                  </span>
                                ))}
                              </span>
                            )}
                          </td>
                          {/* Sổ: tổng phía sổ của kỳ. Chỉ có khi kỳ này vừa nạp file —
                              kỳ đã lưu không giữ số sổ, và đoán một số là bịa. Đang đọc
                              sổ / đọc hỏng thì `results` rỗng (xem comment ô Tình trạng)
                              nên `ledgerTotal` là 0 giả — im lặng thay vì in ¥0 sai. */}
                          <td className="hidden py-2 px-2 sm:table-cell">
                            {r.loaded && !chuaGhepDuoc ? (
                              <Money amount={r.loaded.ledgerTotal} currency={card.currency} tone="out" />
                            ) : (
                              '—'
                            )}
                          </td>
                          {/* Lệch: chỉ ĐỘ LỚN, không dấu. `showSign` ở đây sẽ lấy dấu từ
                              `tone` (xem Money), mà tone ở cột này nói TÌNH TRẠNG chứ
                              không nói chiều tiền — in ra là in sai chiều. Chiều lệch đọc
                              ở khối kỳ bên dưới, nơi có cả hai bên để so. Đang đọc sổ / đọc
                              hỏng thì `gap` = −billTotal giả (cùng lý do cột Sổ ở trên) —
                              im lặng thay vì in một "Lệch" toàn bộ hoá đơn màu cam. */}
                          <td className="py-2 px-2">
                            {r.loaded && !chuaGhepDuoc ? (
                              <Money
                                amount={Math.abs(r.loaded.gap)}
                                currency={card.currency}
                                tone={
                                  r.loaded.gap === 0
                                    ? 'muted'
                                    : // Kỳ không còn hàng MỞ (đã xem hết, hoặc mọi dòng lệch
                                      // đều là khác biệt cấu trúc đã hiểu — trả góp, nạp ví)
                                      // thì lệch còn lại không phải điều cần cảnh báo nữa.
                                      r.reviewed || r.status === 'ok'
                                      ? 'neutral'
                                      : 'warn'
                                }
                              />
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="py-2 pl-2 pr-3 text-left">
                            {/* Chưa ghép được thì CHƯA có kết quả: `overviewRows` trả 'ok'
                                cho mọi kỳ vừa nạp, và một chip "Khớp hết" lúc chờ — hay
                                tệ hơn, lúc đọc sổ hỏng — là nói dối. Nói ra trạng thái
                                thật, chip chỉ hiện khi đã ghép xong. */}
                            {r.loaded && loiDocSo ? (
                              <span className="text-state-warn-fg">Không đọc được sổ</span>
                            ) : r.loaded && dangDocSo ? (
                              <span className="text-fg-muted">Đang đọc sổ…</span>
                            ) : (
                              <>
                                {/* Thứ tự có ý: lô vừa nạp còn hàng MỞ thì "cần xem" thắng,
                                    kể cả khi bill cũ mang reviewed=true — dấu cũ nói về lô
                                    cũ, dòng mới xuất hiện thì kỳ lại cần xem. */}
                                {r.status === 'review' ? (
                                  <StatusChip tone="warn">
                                    <Num tone="warn">{r.loaded!.reviewCount}</Num> cần xem
                                  </StatusChip>
                                ) : r.reviewed ? (
                                  <StatusChip tone="good">Đã đối chiếu</StatusChip>
                                ) : (
                                  <>
                                    {r.status === 'saved-only' && (
                                      <span className="text-fg-muted">
                                        Đã lưu, chưa nạp file lần này
                                      </span>
                                    )}
                                    {r.status === 'ok' && (
                                      <StatusChip tone="good">Khớp hết</StatusChip>
                                    )}
                                  </>
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
          )}

          {/* Kỳ đang chọn. Đọc sổ hỏng thì KHÔNG dựng khối này: mọi dòng thẻ sẽ hiện ra
              "thẻ có, sổ không" kèm nút "Thêm vào sổ", và bấm theo là ghi vào sổ hàng
              chục bản trùng của những khoản đã có sẵn. */}
          {card && kyChon && ketQua && !loiDocSo && (
            <Card as="section" padding="lg">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <SectionTitle>
                  Quẹt {dayMonthLabel(kyChon.range.start)} – {dayMonthLabel(kyChon.range.closeISO)} ·
                  bị rút {dayMonthLabel(kyChon.range.dueISO)}
                </SectionTitle>
                {/* Đây là đổi CÁCH XEM cùng một dữ liệu, không phải lọc một tập con — nên
                    SegmentedControl chứ không FilterChip (design-system §"Ba họ"). */}
                <SegmentedControl<CheDo>
                  label="Hiện dòng nào"
                  size="sm"
                  stretch={false}
                  items={[
                    { value: 'lech', label: 'Chỉ dòng lệch' },
                    {
                      value: 'tatca',
                      // Đang đọc sổ / đọc hỏng thì `ketQua` là `emptyResult()` (xem comment
                      // ô Tình trạng) — đếm lúc đó là "0 cặp" giả, bỏ số đi cho tới khi có.
                      label: chuaGhepDuoc ? (
                        'Tất cả'
                      ) : (
                        <>
                          Tất cả <Num tone="muted">{ketQua.pairs.length + hang.length}</Num> cặp
                        </>
                      ),
                    },
                  ]}
                  value={cheDo}
                  onChange={setCheDo}
                />
              </div>

              {/* Chưa đọc xong sổ thì `results` còn rỗng ⇒ `ketQua` là `emptyResult()`, và
                  cả khối dưới sẽ nói "Khớp 0 · Sổ ¥0 · Kỳ này khớp hết" — đúng lời nói dối
                  mà chip trạng thái ở bảng trên đã từ chối nói (xem comment ô Tình trạng).
                  Giữ đầu khối để bộ gạt không nhảy chỗ, phần còn lại im cho tới khi có số. */}
              {dangDocSo ? (
                <p className="mt-2 text-sm text-fg-muted">Đang đọc sổ…</p>
              ) : (
                <>
                  {/* Thanh tỷ lệ dòng thẻ đã yên. Câu hỏi đầu tiên của một kỳ là "còn bao
                      nhiêu chưa xong" — một thanh trả lời nhanh hơn ba con số ở dòng dưới. */}
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-sunken">
                    <div className={`h-full ${STATUS_FILL.good}`} style={{ width: `${pct}%` }} />
                  </div>
                  <p className="mt-1 flex flex-wrap justify-between gap-2 text-2xs text-fg-muted">
                    <span>
                      Hoá đơn <Money amount={kyChon.total} currency={card.currency} tone="muted" />
                    </span>
                    <span>
                      Khớp <Num tone="muted">{khopDong}</Num> · giải thích{' '}
                      <Num tone="muted">{giaiThichDong}</Num> /{' '}
                      <Num tone="muted">{kyChon.lines.length}</Num> dòng
                    </span>
                    <span>
                      Sổ <Money amount={ketQua.ledgerTotal} currency={card.currency} tone="muted" />
                    </span>
                  </p>

                  {hangGhep.length === 0 ? (
                    <p className="mt-2 text-sm text-fg-muted">Kỳ này khớp hết.</p>
                  ) : (
                    <>
                      {/* Kỳ đã xử lý xong nhưng không rỗng: không nói gì thì bảng bên dưới
                          toàn dòng mờ, đọc ra như thẻ kỳ chưa nạp được file. */}
                      {hangMo.length === 0 && (
                        <p className="mt-2 text-sm text-fg-muted">Kỳ này không còn gì cần xem.</p>
                      )}
                      {/* Một bảng ghép đôi duy nhất: sổ | chiều | thẻ | nút. Dưới sm lưới
                          rơi về một cột (bên sổ trên, bên thẻ dưới, nút cuối) và cột mũi
                          tên ẩn — xếp dọc thì chiều đã nằm ở thứ tự, mũi tên ngang nói ngược. */}
                      <div className="mt-2 divide-y divide-border-subtle">
                        {hangGhep.map((r, i) => (
                          <div
                            key={keyHang(r, i)}
                            className={`grid gap-x-2 gap-y-1 py-1.5 text-sm sm:grid-cols-12 sm:items-center ${LOP_HANG[r.kind]}`}
                          >
                            <div className="min-w-0 sm:col-span-5">{beTrai(r, card.currency)}</div>
                            <div className="hidden text-center text-fg-muted sm:col-span-1 sm:block">
                              {muiTen(r)}
                            </div>
                            <div className="min-w-0 sm:col-span-4">{bePhai(r, card.currency)}</div>
                            <div className="flex flex-wrap items-center justify-end gap-2 sm:col-span-2">
                              {nut(r, card.id)}
                            </div>
                          </div>
                        ))}
                      </div>
                      {hangMo.length > 0 && (
                        <div className="mt-2 flex justify-end">
                          <ActionButton
                            disabled={khoaDau}
                            onClick={() => ghiDau(hangMo.map(khoaCua), true)}
                          >
                            Bỏ qua hết phần còn lại kỳ này
                          </ActionButton>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </Card>
          )}

          {/* Cuối trang */}
          <div className="flex flex-wrap items-center justify-end gap-2">
            {soLanSua > 0 && (
              <p className="mr-auto text-2xs text-fg-muted">
                Đã sửa <Num tone="muted">{soLanSua}</Num> dòng. Số dư thẻ đổi theo — nhớ Chỉnh số
                nợ trên trang thẻ.
              </p>
            )}
            {merged.length > 0 && (
              <ActionButton
                variant="primary"
                onClick={luu}
                disabled={lechNgay || upsert.isPending || chuaGhepDuoc}
              >
                {upsert.isPending ? 'Đang lưu…' : 'Lưu'} <Num tone="onAccent">{merged.length}</Num>{' '}
                kỳ
              </ActionButton>
            )}
          </div>
        </>
      )}

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
