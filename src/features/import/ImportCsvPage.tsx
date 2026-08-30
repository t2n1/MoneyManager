import { useCallback, useMemo, useState } from 'react'
import { Guide } from '../../components/Guide'
import { useQueryClient } from '@tanstack/react-query'
import { Upload } from 'lucide-react'
import { repo } from '../../data'
import { useAccounts, useCategories, useRangeTransactions } from '../../hooks/queries'
import { addDaysISO, toISODate } from '../../lib/dates'
import { formatMoney, type CurrencyCode } from '../../lib/money'
import { expenseLeaves } from '../categories/leaf'
import { expenseMedianForCurrency, isUnusuallyLarge } from './anomaly'
import {
  buildImportPreview,
  detectColumnMapping,
  detectInternalTransfers,
  parseCsvText,
  type DateOrder,
  type ImportItem,
} from './csvImport'
import type { CategoryRow } from '../../types/database.types'
import { classifyDuplicates, mergeStatementFiles } from './dedupe'
import {
  groupByMerchant,
  guessCategoryForMerchants,
  isTopUp,
  normalizeMerchant,
  type HistoryTx,
} from './merchantCategory'
import { detectStatementFormat, type StatementFormat } from './statementFormat'
import { Card, PageHeader, SectionTitle, Select, actionButtonClass } from '../../components/ui'

type Encoding = 'utf-8' | 'shift-jis'

// Bảng xem trước chỉ hiện bấy nhiêu dòng đầu. Đặt tên riêng để không lẫn với
// ANOMALY_MIN_SAMPLES trong anomaly.ts — hai hằng số cùng giá trị 20 nhưng
// nghĩa khác hẳn nhau.
const PREVIEW_ROWS = 20

/** ISO ngày + 1 (mốc loại trừ cho truy vấn khoảng ngày). */
function nextDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return toISODate(new Date(y, m - 1, d + 1))
}

export function ImportCsvPage() {
  const qc = useQueryClient()
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()

  // Nhận NHIỀU file một lượt và giữ TỪNG file riêng: sao kê tháng sau lặp lại vài
  // dòng cuối của tháng trước, mà phần chồng lấn đó chỉ khử đúng khi biết dòng nào
  // thuộc file nào (xem mergeStatementFiles).
  const [rowsPerFile, setRowsPerFile] = useState<string[][][]>([])
  // File đầu dùng để dựng danh sách cột — sao kê cùng một thẻ có tiêu đề giống nhau.
  const rows = rowsPerFile[0] ?? []
  const [fileName, setFileName] = useState('')
  const [format, setFormat] = useState<StatementFormat | null>(null)
  const [encoding, setEncoding] = useState<Encoding>('utf-8')
  const [accountId, setAccountId] = useState('')
  const [dateCol, setDateCol] = useState(0)
  const [amountCol, setAmountCol] = useState(1)
  const [noteCol, setNoteCol] = useState(2)
  const [hasHeader, setHasHeader] = useState(true)
  const [dateOrder, setDateOrder] = useState<DateOrder>('ymd')
  const [negativeIsExpense, setNegativeIsExpense] = useState(true)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [buffers, setBuffers] = useState<ArrayBuffer[]>([])
  /** Danh mục người dùng tự chọn cho một quán (khóa = tên quán đã chuẩn hóa). */
  const [catByMerchant, setCatByMerchant] = useState<Record<string, string>>({})

  const account = accounts.find((a) => a.id === accountId)
  const currency = account?.currency ?? 'JPY'
  const headerRow = rows[0] ?? []
  const columns = headerRow.map((h, i) => ({ i, label: hasHeader ? h || `Cột ${i + 1}` : `Cột ${i + 1}` }))

  function decodeAndParse(bufs: ArrayBuffer[], enc: Encoding) {
    const dec = new TextDecoder(enc)
    const parsed = bufs.map((b) => parseCsvText(dec.decode(b)))
    setRowsPerFile(parsed)
    const first = parsed[0] ?? []
    // Đoán cột theo nội dung (đoán lại cả khi đổi mã hóa — chữ hết vỡ thì mới đọc
    // được cột). Không đoán được thì giữ nguyên như đang có.
    const guess = detectColumnMapping(first, hasHeader)
    if (guess) {
      setDateCol(guess.date)
      setAmountCol(guess.amount)
      setNoteCol(guess.note)
    }
    // Sao kê quen mặt thì đặt sẵn chiều tiền. Đây là chỗ hay sai nhất mà không có
    // dấu hiệu gì: PayPay ghi khoản mua là số DƯƠNG, để nguyên mặc định "số âm là
    // chi" thì cả xấp khoản mua vào sổ thành khoản THU.
    const fmt = detectStatementFormat(first)
    setFormat(fmt)
    if (fmt) {
      setNegativeIsExpense(fmt.negativeIsExpense)
      setDateOrder(fmt.dateOrder)
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (picked.length === 0) return
    setResult(null)
    setCatByMerchant({})
    const bufs = await Promise.all(picked.map((f) => f.arrayBuffer()))
    setBuffers(bufs)
    setFileName(picked.length === 1 ? picked[0].name : `${picked.length} file sao kê`)
    decodeAndParse(bufs, encoding)
  }

  function changeEncoding(enc: Encoding) {
    setEncoding(enc)
    if (buffers.length > 0) decodeAndParse(buffers, enc)
  }

  const preview = useMemo(() => {
    if (rowsPerFile.length === 0 || !account) return { items: [] as ImportItem[], errorCount: 0 }
    const opts = {
      mapping: { date: dateCol, amount: amountCol, note: noteCol },
      dateOrder,
      hasHeader,
      negativeIsExpense,
      currency,
    }
    const per = rowsPerFile.map((r) => buildImportPreview(r, opts))
    return {
      items: mergeStatementFiles(per.map((p) => p.items)),
      errorCount: per.reduce((s, p) => s + p.errorCount, 0),
    }
  }, [
    rowsPerFile,
    account,
    dateCol,
    amountCol,
    noteCol,
    dateOrder,
    hasHeader,
    negativeIsExpense,
    currency,
  ])
  // Số dòng bị cắt vì chồng lấn giữa các sao kê — nói ra để không ai tưởng mất dòng.
  const overlapCount = useMemo(() => {
    if (rowsPerFile.length < 2) return 0
    const opts = {
      mapping: { date: dateCol, amount: amountCol, note: noteCol },
      dateOrder,
      hasHeader,
      negativeIsExpense,
      currency,
    }
    const raw = rowsPerFile.reduce((s, r) => s + buildImportPreview(r, opts).items.length, 0)
    return Math.max(0, raw - preview.items.length)
  }, [
    rowsPerFile,
    preview.items.length,
    dateCol,
    amountCol,
    noteCol,
    dateOrder,
    hasHeader,
    negativeIsExpense,
    currency,
  ])

  // Khoản nhỏ nhất / lớn nhất đọc được — để người dùng tự soát xem có chọn nhầm cột tiền
  // hay nhầm đơn vị không. Tính trên TOÀN BỘ dòng, không chỉ 10 dòng bảng xem trước.
  const amountRange = useMemo(() => {
    if (preview.items.length === 0) return null
    let min = preview.items[0].amount
    let max = min
    for (const it of preview.items) {
      if (it.amount < min) min = it.amount
      if (it.amount > max) max = it.amount
    }
    return { min, max }
  }, [preview.items])

  // Soát khoản lớn bất thường: trung vị số tiền CHI trong 90 ngày gần nhất.
  const todayISO = toISODate(new Date())
  const historyRange = useMemo(
    () => ({ start: addDaysISO(todayISO, -90), end: addDaysISO(todayISO, 1) }),
    [todayISO],
  )
  const { data: historyTxs = [] } = useRangeTransactions(historyRange, !!accountId)
  // Tra loại tiền của một tài khoản — truyền dạng hàm cho anomaly.ts, cùng quy
  // ước currencyOf đã dùng ở features/reports/aggregate.ts và bộ quy tắc
  // thông báo. Việc LỌC theo loại tiền (vì sao phải lọc) được giải thích ngay
  // tại `expenseMedianForCurrency` trong anomaly.ts.
  const currencyOf = useMemo(() => {
    const map = new Map<string, CurrencyCode>()
    for (const a of accounts) map.set(a.id, a.currency)
    return (id: string): CurrencyCode | undefined => map.get(id)
  }, [accounts])
  const median = useMemo(
    () => expenseMedianForCurrency(historyTxs, currencyOf, currency, historyRange.start),
    [historyTxs, currencyOf, currency, historyRange.start],
  )

  // Chống trùng: đối chiếu với giao dịch đã có của TÀI KHOẢN đích trong khoảng ngày nhập.
  const span = useMemo(() => {
    if (preview.items.length === 0) return null
    let min = preview.items[0].occurred_on
    let max = min
    for (const it of preview.items) {
      if (it.occurred_on < min) min = it.occurred_on
      if (it.occurred_on > max) max = it.occurred_on
    }
    return { start: min, end: nextDay(max) }
  }, [preview.items])

  const { data: existing = [] } = useRangeTransactions(
    span ?? { start: '2000-01-01', end: '2000-01-02' },
    !!span && !!accountId,
  )

  // Ba mức: trùng chắc chắn (bỏ im lặng) · nghi trùng (bày ra, mặc định bỏ) · mới.
  // Vì sao phải có mức giữa: ghi chú trong sao kê là tên quán tiếng Nhật, còn khoản
  // ghi tay ghi tiếng Việt — luật cũ đòi khớp cả ghi chú nên gần như không bắt được
  // khoản nào đã ghi tay. Chi tiết trong dedupe.ts.
  const dupes = useMemo(
    () =>
      accountId
        ? classifyDuplicates(preview.items, existing, { accountId })
        : preview.items.map(() => null),
    [preview.items, existing, accountId],
  )
  const [skipLikely, setSkipLikely] = useState(true)

  // Chuyển khoản nội bộ: dòng sao kê thực chất là tiền chạy giữa ví của chính
  // mình (trả thẻ, chuyển sang tiết kiệm). Nhập nguyên xi sẽ thổi phồng Chi lẫn Thu.
  const sameCurrencyIds = useMemo(
    () =>
      new Set(
        accounts.filter((a) => a.currency === currency && a.id !== accountId).map((a) => a.id),
      ),
    [accounts, currency, accountId],
  )
  const transferCandidates = useMemo(
    () =>
      accountId
        ? detectInternalTransfers(preview.items, existing, {
            importingAccountId: accountId,
            candidateAccountIds: sameCurrencyIds,
          })
        : [],
    [preview.items, existing, accountId, sameCurrencyIds],
  )
  const [skipTransfers, setSkipTransfers] = useState(true)
  const transferKeys = useMemo(
    () => new Set(transferCandidates.map((c) => c.key)),
    [transferCandidates],
  )

  // Nạp ví (「チャージ」) xếp chung rổ với chuyển khoản nội bộ: tiền chạy từ thẻ
  // sang ví rồi mới tiêu ở quán, nhập nguyên xi là đếm hai lần.
  const isInternal = useCallback(
    (it: ImportItem) => transferKeys.has(it.key) || isTopUp(it.note),
    [transferKeys],
  )

  const toImport = useMemo(
    () =>
      preview.items.filter((it, i) => {
        const d = dupes[i]
        if (d?.level === 'exact') return false
        if (skipLikely && d?.level === 'likely') return false
        return !(skipTransfers && isInternal(it))
      }),
    [preview.items, dupes, skipLikely, skipTransfers, isInternal],
  )
  const dupCount = dupes.filter((d) => d?.level === 'exact').length
  /** Dòng nghi trùng, kèm dòng sao kê tương ứng — để bày danh sách cho người dùng soát. */
  const likelyRows = useMemo(
    () =>
      preview.items
        .map((it, i) => ({ it, dup: dupes[i] }))
        .filter((r) => r.dup?.level === 'likely'),
    [preview.items, dupes],
  )
  const transferCount = preview.items.filter(
    (it, i) => dupes[i] === null && isInternal(it),
  ).length
  const nameOfAccount = (id: string) => accounts.find((a) => a.id === id)?.name ?? 'tài khoản khác'

  // ─── Danh mục: gom theo QUÁN, không theo dòng ────────────────────────────────
  // Gán tay từng dòng thì một xấp sao kê là cả buổi tối; gom theo quán thì mỗi quán
  // chỉ phải chọn MỘT lần, và vài chục quán đầu đã phủ phần lớn số dòng.
  const leaves = useMemo(() => expenseLeaves(categories), [categories])
  const labelOfCategory = useCallback(
    (c: CategoryRow) => {
      const parent = c.parent_id ? categories.find((x) => x.id === c.parent_id)?.name : null
      return parent ? `${parent} › ${c.name}` : c.name
    },
    [categories],
  )
  const groups = useMemo(() => groupByMerchant(toImport), [toImport])

  // Nguồn học: khoản cũ trong khoảng ngày của file (đã tải sẵn để chống trùng) cộng
  // 90 ngày gần nhất (đã tải sẵn để dò khoản lớn bất thường). Không thêm truy vấn nào.
  const guessHistory = useMemo<HistoryTx[]>(() => {
    const seen = new Set<string>()
    const out: HistoryTx[] = []
    for (const t of [...existing, ...historyTxs]) {
      if (seen.has(t.id)) continue
      seen.add(t.id)
      out.push({ note: t.note, category_id: t.category_id, type: t.type })
    }
    return out
  }, [existing, historyTxs])

  const guesses = useMemo(
    () => guessCategoryForMerchants(groups.map((g) => g.merchant), guessHistory, leaves),
    [groups, guessHistory, leaves],
  )

  /** Tên quán (đã chuẩn hóa) → danh mục sẽ ghi. Người dùng chọn thì thắng máy đoán. */
  const catByKey = useMemo(() => {
    const m = new Map<string, string | null>()
    for (const g of groups) {
      const k = normalizeMerchant(g.merchant)
      const picked = catByMerchant[k]
      m.set(k, picked !== undefined ? picked || null : (guesses.get(g.merchant)?.categoryId ?? null))
    }
    return m
  }, [groups, guesses, catByMerchant])

  const categoryOf = useCallback(
    (note: string) => catByKey.get(normalizeMerchant(note)) ?? null,
    [catByKey],
  )
  const withCategory = toImport.filter((it) => categoryOf(it.note) !== null).length
  const blankGroups = groups.filter((g) => catByKey.get(normalizeMerchant(g.merchant)) == null)
  const khac = leaves.find((c) => c.name.trim().toLowerCase() === 'khác')

  function fillRestWith(categoryId: string) {
    setCatByMerchant((prev) => {
      const next = { ...prev }
      for (const g of blankGroups) next[normalizeMerchant(g.merchant)] = categoryId
      return next
    })
  }

  // Khoản lớn bất thường — viết predicate một lần, dùng lại cho cả dòng bảng
  // (tô đỏ) lẫn phần đếm ở dưới, tránh lệch logic giữa hai chỗ.
  const isAnomalyRow = useCallback(
    (it: ImportItem) => it.type === 'expense' && isUnusuallyLarge(it.amount, median),
    [median],
  )
  // Bảng chỉ hiện PREVIEW_ROWS dòng đầu (giữ nguyên thứ tự CSV, không sắp lại),
  // nên khoản bất thường rơi vào dòng sau đó sẽ không được tô gì — đếm riêng
  // phần bị ẩn này để còn báo cho người dùng biết mà cuộn xuống soát.
  // Chỉ đếm từ dòng PREVIEW_ROWS trở đi: các dòng trước đã tô đỏ tại chỗ rồi,
  // đếm lại sẽ trùng.
  const hiddenAnomalyCount = useMemo(
    () => toImport.slice(PREVIEW_ROWS).filter(isAnomalyRow).length,
    [toImport, isAnomalyRow],
  )

  async function handleImport() {
    if (!accountId || toImport.length === 0) return
    setBusy(true)
    setResult(null)
    let done = 0
    try {
      for (const it of toImport) {
        await repo.createTransaction({
          type: it.type,
          amount: it.amount,
          to_amount: null,
          category_id: categoryOf(it.note),
          account_id: accountId,
          to_account_id: null,
          occurred_on: it.occurred_on,
          note: it.note,
        })
        done++
      }
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['balances'] })
      qc.invalidateQueries({ queryKey: ['search'] })
      setResult({ kind: 'ok', text: `Đã nhập ${done} giao dịch.` })
      setRowsPerFile([])
      setFileName('')
      setFormat(null)
      setBuffers([])
      setCatByMerchant({})
    } catch (err) {
      setResult({ kind: 'error', text: `Nhập lỗi sau ${done} giao dịch: ${(err as Error).message}` })
    } finally {
      setBusy(false)
    }
  }


  return (
    <div className="flex flex-col gap-3 p-3 lg:p-6">
      <PageHeader title="Nhập giao dịch từ CSV" back="/settings/data" flush />

      <Card as="section">
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border-strong py-4 text-sm font-medium text-fg-secondary focus-within:ring-2 focus-within:ring-accent">
          <Upload className="h-4 w-4" />
          {fileName || 'Chọn file CSV sao kê…'}
          <input
            type="file"
            multiple
            accept=".csv,text/csv"
            className="sr-only"
            onChange={handleFile}
          />
        </label>
        {/* Nhận ra sao kê quen mặt thì nói ra, vì lúc đó trang vừa TỰ đổi chiều tiền —
            đổi lặng lẽ là kiểu thay đổi khó chịu nhất. */}
        {format && (
          <p className="mt-2 rounded-lg bg-state-good-bg px-2.5 py-2 text-sm text-state-good-fg">
            Đã nhận ra sao kê <b>{format.label}</b> — khoản mua ghi số dương, đã đặt sẵn chiều
            tiền cho đúng. Nếu muốn đổi thì công tắc vẫn ở dưới.
          </p>
        )}
        {/* Trang trống trơn thì người chưa dùng lần nào không biết file của mình có hợp
            không cho tới khi thử. Một câu nói rõ: đọc được CSV bất kỳ, đã thử với sao kê
            thẻ Nhật phổ biến. */}
        {!fileName && (
          <Guide className="mt-2 text-sm text-fg-muted">
            Đọc được CSV sao kê của mọi ngân hàng/thẻ — chọn file xong bạn tự trỏ cột ngày,
            cột tiền, cột ghi chú. Chọn được <b>nhiều file một lượt</b>: phần chồng lấn giữa
            các tháng sẽ tự bỏ. Đã dùng tốt với sao kê Rakuten Card và PayPay Card (UTF-8);
            file ngân hàng Nhật đời cũ mở ra lỗi font thì đổi mã hóa sang Shift-JIS.
          </Guide>
        )}
        <div className="mt-2 flex items-center gap-2 text-sm text-fg-muted">
          <span>Mã hóa:</span>
          {/* "Mã hóa:" là <span> chứ không <label htmlFor>, nên tên ô phải đi qua aria-label */}
          <Select
            aria-label="Mã hóa file"
            value={encoding}
            onChange={(e) => changeEncoding(e.target.value as Encoding)}>
            <option value="utf-8">UTF-8</option>
            <option value="shift-jis">Shift-JIS (ngân hàng Nhật)</option>
          </Select>
        </div>
      </Card>

      {rows.length > 0 && (
        <>
          <Card as="section" className="grid grid-cols-2 gap-2">
            <label className="col-span-2 flex flex-col gap-1 text-sm text-fg-muted">
              Nhập vào tài khoản
              <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                <option value="">— Chọn tài khoản —</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.currency})
                  </option>
                ))}
              </Select>
            </label>
            <label className="flex flex-col gap-1 text-sm text-fg-muted">
              Cột ngày
              <Select value={dateCol} onChange={(e) => setDateCol(Number(e.target.value))}>
                {columns.map((c) => (
                  <option key={c.i} value={c.i}>{c.label}</option>
                ))}
              </Select>
            </label>
            <label className="flex flex-col gap-1 text-sm text-fg-muted">
              Cột số tiền
              <Select value={amountCol} onChange={(e) => setAmountCol(Number(e.target.value))}>
                {columns.map((c) => (
                  <option key={c.i} value={c.i}>{c.label}</option>
                ))}
              </Select>
            </label>
            <label className="flex flex-col gap-1 text-sm text-fg-muted">
              Cột ghi chú
              <Select value={noteCol} onChange={(e) => setNoteCol(Number(e.target.value))}>
                {columns.map((c) => (
                  <option key={c.i} value={c.i}>{c.label}</option>
                ))}
              </Select>
            </label>
            <label className="flex flex-col gap-1 text-sm text-fg-muted">
              Thứ tự ngày
              <Select value={dateOrder} onChange={(e) => setDateOrder(e.target.value as DateOrder)}>
                <option value="ymd">Năm/Tháng/Ngày</option>
                <option value="dmy">Ngày/Tháng/Năm</option>
                <option value="mdy">Tháng/Ngày/Năm</option>
              </Select>
            </label>
            <label className="col-span-2 flex items-center gap-2 text-sm text-fg-secondary">
              <input type="checkbox" checked={hasHeader} onChange={(e) => setHasHeader(e.target.checked)} />
              Dòng đầu là tiêu đề cột
            </label>
            <label className="col-span-2 flex items-center gap-2 text-sm text-fg-secondary">
              <input
                type="checkbox"
                checked={negativeIsExpense}
                onChange={(e) => setNegativeIsExpense(e.target.checked)}
              />
              Số âm là chi tiêu (số dương là thu nhập)
            </label>
          </Card>

          {account && (
            <Card as="section">
              <p className="text-sm text-fg-secondary">
                Sẽ nhập <strong>{toImport.length}</strong> giao dịch
                {dupCount > 0 && ` · bỏ qua ${dupCount} trùng`}
                {skipLikely && likelyRows.length > 0 && ` · bỏ qua ${likelyRows.length} nghi trùng`}
                {skipTransfers && transferCount > 0 && ` · bỏ qua ${transferCount} chuyển khoản`}
                {overlapCount > 0 && ` · gộp ${overlapCount} dòng chồng lấn giữa các sao kê`}
                {preview.errorCount > 0 && ` · ${preview.errorCount} dòng lỗi`}
              </p>

              {/* Soát đơn vị tiền: mượn cách permtrack ghi thẳng "số này do bên ngoài khai,
                  có thể sai đơn vị". Ở đây nói được cụ thể hơn — bày luôn khoản nhỏ nhất và
                  lớn nhất đọc được, vì chọn nhầm cột tiền hay nhầm đơn vị thì hai đầu này
                  lệch ngay, mà nhìn bảng xem trước 10 dòng đầu thì không thấy. */}
              {amountRange && (
                <p className="mt-1.5 text-2xs text-fg-muted">
                  Số tiền đọc được chạy từ <b>{formatMoney(amountRange.min, currency)}</b> tới{' '}
                  <b>{formatMoney(amountRange.max, currency)}</b>. Nếu hai con số này trông sai
                  cỡ (một bữa trưa thành tiền triệu) thì thường là chọn nhầm cột số tiền, hoặc
                  file ghi tiền theo đơn vị khác — sửa ở trên rồi xem lại.
                </p>
              )}

              {/* Nghi trùng — KHÔNG tự vứt. Hai ly cà phê ¥480 hai ngày liền là chuyện
                  có thật, nên máy chỉ được chỉ ra, người quyết định. */}
              {likelyRows.length > 0 && (
                <div className="mt-2 rounded-lg bg-state-warn-bg p-2.5">
                  <label className="flex items-start gap-2 text-sm text-fg-warn">
                    <input
                      type="checkbox"
                      checked={skipLikely}
                      onChange={(e) => setSkipLikely(e.target.checked)}
                      className="mt-0.5"
                    />
                    <span>
                      <b>{likelyRows.length} dòng có vẻ đã có trong sổ</b> — cùng số tiền, lệch
                      không quá 3 ngày, nhưng ghi chú khác (sao kê ghi tên quán, sổ ghi tay
                      tiếng Việt). Mặc định bỏ qua; bỏ tick nếu đó thật sự là khoản khác.
                    </span>
                  </label>
                  <ul className="mt-1.5 space-y-0.5 pl-6 text-2xs text-fg-warn">
                    {likelyRows.slice(0, 5).map(({ it, dup }) => (
                      <li key={`${it.key}-${dup?.matchedTxId}`} className="truncate">
                        {it.occurred_on} · {formatMoney(it.amount, currency)} · {it.note} ↔ đã có
                        “{dup?.matchedNote || 'không ghi chú'}”
                        {dup && dup.dayGap > 0 && ` (lệch ${dup.dayGap} ngày)`}
                      </li>
                    ))}
                    {likelyRows.length > 5 && <li>…và {likelyRows.length - 5} dòng nữa.</li>}
                  </ul>
                </div>
              )}

              {/* Cảnh báo chuyển khoản nội bộ */}
              {transferCount > 0 && (
                <div className="mt-2 rounded-lg bg-state-warn-bg p-2.5">
                  <label className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-300">
                    <input
                      type="checkbox"
                      checked={skipTransfers}
                      onChange={(e) => setSkipTransfers(e.target.checked)}
                      className="mt-0.5"
                    />
                    <span>
                      <b>{transferCount} dòng có vẻ là chuyển tiền giữa ví của bạn</b>, không phải
                      chi tiêu thật — mỗi dòng đều có một giao dịch ngược chiều, cùng số tiền ở tài
                      khoản khác. Nhập vào sẽ làm phồng cả Chi lẫn Thu, nên mặc định bỏ qua.
                    </span>
                  </label>
                  <ul className="mt-1.5 space-y-0.5 pl-6 text-2xs text-fg-warn">
                    {transferCandidates.slice(0, 5).map((c) => {
                      const it = preview.items.find((x) => x.key === c.key)
                      return (
                        <li key={c.key} className="truncate">
                          {it?.occurred_on} · {formatMoney(it?.amount ?? 0, currency)} ↔{' '}
                          {nameOfAccount(c.matchedAccountId)}
                          {c.dayGap > 0 && ` (lệch ${c.dayGap} ngày)`}
                        </li>
                      )
                    })}
                    {transferCandidates.length > 5 && (
                      <li>…và {transferCandidates.length - 5} dòng nữa.</li>
                    )}
                  </ul>
                </div>
              )}
              {/* Danh mục theo QUÁN. Trang này trước đây ghi thẳng category_id = null,
                  nên khoản nhập vào rơi khỏi bảng "tiêu vào việc gì" — tổng Chi đúng mà
                  không biết tiêu vào đâu. */}
              {groups.length > 0 && (
                <div className="mt-3 rounded-lg border border-border-subtle p-2.5">
                  <SectionTitle as="h3">Danh mục cho từng quán</SectionTitle>
                  <p className="mt-1 text-2xs text-fg-muted">
                    Chọn một lần cho mỗi quán, tất cả dòng của quán đó ăn theo. Ô nào đã điền
                    sẵn là máy đoán — từ chính sổ của bạn, hoặc từ bảng quán quen. Để trống
                    cũng được, nhưng khoản đó sẽ không hiện trong bảng “tiêu vào việc gì”.
                  </p>
                  <p className="mt-1.5 text-sm text-fg-secondary">
                    <strong>{withCategory}</strong>/{toImport.length} dòng đã có danh mục
                    {blankGroups.length > 0 && ` · ${blankGroups.length} quán chưa chọn`}
                  </p>
                  {khac && blankGroups.length > 0 && (
                    <button
                      type="button"
                      onClick={() => fillRestWith(khac.id)}
                      className={actionButtonClass('outline', 'mt-1.5')}
                    >
                      Dồn {blankGroups.length} quán còn lại vào “Khác”
                    </button>
                  )}
                  <ul className="mt-2 max-h-64 space-y-1 overflow-auto">
                    {groups.map((g) => {
                      const k = normalizeMerchant(g.merchant)
                      const value = catByKey.get(k) ?? ''
                      const guessed = catByMerchant[k] === undefined && guesses.get(g.merchant)
                      return (
                        // Tên quán và ô chọn xếp HAI DÒNG, không cạnh nhau: nhãn danh
                        // mục dài nhất ("Giấy tờ & Pháp lý › Dịch thuật & công chứng")
                        // quyết định bề rộng tối thiểu của <select>, nên ở 375px nó ăn
                        // hết hàng và bóp tên quán về 0px — đo được trên máy thật.
                        <li
                          key={k}
                          className="border-t border-border-subtle py-1.5 first:border-t-0 first:pt-0"
                        >
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="min-w-0 truncate text-sm" title={g.merchant}>
                              {g.merchant}
                            </span>
                            <span className="shrink-0 text-2xs text-fg-muted tabular-nums">
                              {g.count} khoản · {formatMoney(g.total, currency)}
                            </span>
                          </div>
                          <Select
                            aria-label={`Danh mục cho ${g.merchant}`}
                            wrapClassName="mt-1 block w-full"
                            value={value}
                            onChange={(e) =>
                              setCatByMerchant((prev) => ({ ...prev, [k]: e.target.value }))
                            }
                          >
                            <option value="">— chưa chọn —</option>
                            {leaves.map((c) => (
                              <option key={c.id} value={c.id}>
                                {labelOfCategory(c)}
                              </option>
                            ))}
                          </Select>
                          {guessed && (
                            <p className="mt-0.5 text-2xs text-fg-muted">
                              {guessed.source === 'history'
                                ? 'Điền sẵn theo sổ cũ của bạn'
                                : 'Điền sẵn theo bảng quán quen'}
                            </p>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}

              <div className="mt-2 max-h-64 overflow-auto text-sm">
                <table className="w-full">
                  <thead className="text-fg-muted">
                    <tr>
                      <th className="py-1 text-left font-medium">Ngày</th>
                      <th className="py-1 text-left font-medium">Loại</th>
                      <th className="py-1 text-right font-medium">Số tiền</th>
                      <th className="py-1 text-left font-medium">Ghi chú</th>
                      <th className="py-1 text-left font-medium">Danh mục</th>
                    </tr>
                  </thead>
                  <tbody>
                    {toImport.slice(0, PREVIEW_ROWS).map((it: ImportItem, i) => {
                      // Tô đỏ để soát bằng mắt — KHÔNG chặn lưu (mục G của spec).
                      const odd = isAnomalyRow(it)
                      return (
                        <tr
                          key={i}
                          className={`border-t border-border-subtle ${odd ? 'bg-red-50 dark:bg-red-950/40' : ''}`}
                        >
                          <td className="py-1 tabular-nums">{it.occurred_on}</td>
                          <td className={`py-1 ${it.type === 'expense' ? 'text-money-out' : 'text-money-in'}`}>
                            {it.type === 'expense' ? 'Chi' : 'Thu'}
                          </td>
                          <td className="py-1 text-right tabular-nums">
                            {formatMoney(it.amount, currency)}
                            {odd && (
                              <span className="ml-1 rounded bg-red-100 px-1.5 py-0.5 text-2xs font-semibold text-state-bad-fg dark:bg-red-900/50">
                                khoản lớn bất thường
                              </span>
                            )}
                          </td>
                          <td className="py-1">{it.note}</td>
                          <td className="py-1 text-fg-muted">
                            {leaves.find((c) => c.id === categoryOf(it.note))?.name ?? '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {toImport.length > PREVIEW_ROWS && (
                  <p className="mt-1 text-center text-fg-muted">
                    … và {toImport.length - PREVIEW_ROWS} dòng nữa
                    {hiddenAnomalyCount > 0 && (
                      <span className="font-semibold text-money-out">
                        , trong đó {hiddenAnomalyCount} khoản lớn bất thường
                      </span>
                    )}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={handleImport}
                disabled={busy || toImport.length === 0}
                className={actionButtonClass('primary', 'mt-3 w-full')}
              >
                {busy ? 'Đang nhập…' : `Nhập ${toImport.length} giao dịch`}
              </button>
            </Card>
          )}
        </>
      )}

      {result && (
        <p
          className={`rounded-lg px-3 py-2 text-sm ${
            result.kind === 'error'
              ? 'bg-state-bad-bg text-state-bad-fg'
              : 'bg-state-good-bg text-state-good-fg'
          }`}
        >
          {result.text}
        </p>
      )}
    </div>
  )
}
