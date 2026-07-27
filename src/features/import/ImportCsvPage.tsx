import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, Upload } from 'lucide-react'
import { repo } from '../../data'
import { useAccounts, useCategories, useRangeTransactions } from '../../hooks/queries'
import { toISODate } from '../../lib/dates'
import { formatMoney } from '../../lib/money'
import { normalizeText } from '../transactions/filter'
import type { CategoryType } from '../../types/database.types'
import {
  buildImportPreview,
  countExistingByKey,
  detectInternalTransfers,
  findDuplicateRowIds,
  parseCsvText,
  type DateOrder,
  type ImportItem,
  type SkipReason,
} from './csvImport'
import {
  buildNoteHistory,
  detectPossibleDuplicates,
  mergeNote,
  type CategorySource,
  type DuplicateCandidate,
} from './classify'

type Encoding = 'utf-8' | 'shift-jis'

/** ISO ngày + 1 (mốc loại trừ cho truy vấn khoảng ngày). */
function nextDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return toISODate(new Date(y, m - 1, d + 1))
}

/** Danh mục mặc định gợi ý sẵn: danh mục "Khác" mà mọi sổ đều có từ lúc tạo. */
const DEFAULT_FALLBACK_NAME = 'Khác'

/** Số dòng hiện trong bảng xem trước (mỗi dòng có ô chọn danh mục nên đừng vẽ quá nhiều). */
const ROW_LIMIT = 100

/** Số dòng lỗi kể tên trong cảnh báo (chọn sai cột thì cả file thành lỗi, đừng liệt kê hết). */
const SKIP_LIMIT = 5

/** Vì sao dòng đó không nhập được, nói bằng tiếng người. */
const SKIP_LABEL: Record<SkipReason, string> = {
  date: 'không đọc được ngày',
  amount: 'không đọc được số tiền',
  zero: 'số tiền bằng 0',
}

/** Vì sao dòng đó có danh mục — nói thẳng để người dùng biết chỗ nào cần soi lại. */
const SOURCE_LABEL: Record<CategorySource, string> = {
  file: 'Từ file',
  history: 'Lịch sử',
  keyword: 'Từ khoá',
  fallback: 'Mặc định',
  none: 'Chưa có',
}

export function ImportCsvPage() {
  const qc = useQueryClient()
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()

  const [rows, setRows] = useState<string[][]>([])
  const [fileName, setFileName] = useState('')
  const [encoding, setEncoding] = useState<Encoding>('utf-8')
  const [accountId, setAccountId] = useState('')
  const [dateCol, setDateCol] = useState(0)
  const [amountCol, setAmountCol] = useState(1)
  const [noteCol, setNoteCol] = useState(2)
  // -1 = file không có cột danh mục (mọi dòng dùng danh mục mặc định)
  const [categoryCol, setCategoryCol] = useState(-1)
  // null = chưa chạm vào ô → dùng gợi ý "Khác"; '' = người dùng cố ý bỏ trống
  const [expenseCatPick, setExpenseCatPick] = useState<string | null>(null)
  const [incomeCatPick, setIncomeCatPick] = useState<string | null>(null)
  const [hasHeader, setHasHeader] = useState(true)
  const [dateOrder, setDateOrder] = useState<DateOrder>('ymd')
  const [negativeIsExpense, setNegativeIsExpense] = useState(true)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [lastBuffer, setLastBuffer] = useState<ArrayBuffer | null>(null)
  // Người dùng sửa/bỏ tick từng dòng ở bảng xem trước, khoá theo ImportItem.rowId.
  const [rowCat, setRowCat] = useState<Record<string, string>>({})
  const [rowOn, setRowOn] = useState<Record<string, boolean>>({})
  // Dòng chọn GỘP vào giao dịch đã ghi tay: không tạo khoản mới, chỉ thêm tên trong
  // file vào ghi chú của khoản cũ.
  const [rowMerge, setRowMerge] = useState<Record<string, boolean>>({})

  const account = accounts.find((a) => a.id === accountId)
  const currency = account?.currency ?? 'JPY'
  const headerRow = rows[0] ?? []
  const columns = headerRow.map((h, i) => ({ i, label: hasHeader ? h || `Cột ${i + 1}` : `Cột ${i + 1}` }))

  // Danh mục mặc định: người dùng chọn tay, chưa chọn thì lấy "Khác" của chiều đó.
  const activeOfType = (t: CategoryType) => categories.filter((c) => c.type === t && !c.is_archived)
  const suggestFallback = (t: CategoryType) =>
    activeOfType(t).find((c) => normalizeText(c.name) === normalizeText(DEFAULT_FALLBACK_NAME))?.id ??
    ''
  const expenseCatId = expenseCatPick ?? suggestFallback('expense')
  const incomeCatId = incomeCatPick ?? suggestFallback('income')

  function decodeAndParse(buf: ArrayBuffer, enc: Encoding) {
    const text = new TextDecoder(enc).decode(buf)
    setRows(parseCsvText(text))
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setResult(null)
    // File mới → bỏ mọi lựa chọn của file cũ (khoá dòng không còn nghĩa gì)
    setRowCat({})
    setRowOn({})
    setRowMerge({})
    const buf = await file.arrayBuffer()
    setLastBuffer(buf)
    setFileName(file.name)
    decodeAndParse(buf, encoding)
  }

  function changeEncoding(enc: Encoding) {
    setEncoding(enc)
    if (lastBuffer) decodeAndParse(lastBuffer, enc)
  }

  // Đoán danh mục theo lịch sử: học từ 13 tháng gần nhất (mốc cố định, KHÔNG theo
  // khoảng ngày của file — nếu theo file sẽ thành vòng: preview → khoảng → lịch sử →
  // preview). Không giới hạn theo ví: cùng cửa hàng có thể từng trả bằng ví khác.
  const histRange = useMemo(() => {
    const now = new Date()
    return {
      start: toISODate(new Date(now.getFullYear() - 1, now.getMonth() - 1, 1)),
      end: nextDay(toISODate(now)),
    }
  }, [])
  const { data: histTxs = [] } = useRangeTransactions(histRange, rows.length > 0 && !!accountId)
  const noteHistory = useMemo(() => buildNoteHistory(histTxs), [histTxs])

  const preview = useMemo(
    () =>
      rows.length > 0 && account
        ? buildImportPreview(rows, {
            mapping: {
              date: dateCol,
              amount: amountCol,
              note: noteCol,
              ...(categoryCol >= 0 ? { category: categoryCol } : {}),
            },
            dateOrder,
            hasHeader,
            negativeIsExpense,
            currency,
            categories,
            fallback: { expense: expenseCatId || null, income: incomeCatId || null },
            noteHistory,
          })
        : { items: [], skipped: [] },
    [
      rows,
      account,
      dateCol,
      amountCol,
      noteCol,
      categoryCol,
      dateOrder,
      hasHeader,
      negativeIsExpense,
      currency,
      categories,
      expenseCatId,
      incomeCatId,
      noteHistory,
    ],
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

  // Lọc trùng theo SỐ BẢN đã có, không phải có/không: sao kê có nhiều dòng giống hệt
  // nhau (4 lần qua trạm ETC cùng giá, cùng ngày), ghi tay một khoản không được làm
  // biến mất cả bốn dòng.
  const dupRowIds = useMemo(
    () => findDuplicateRowIds(preview.items, countExistingByKey(existing, accountId)),
    [preview.items, existing, accountId],
  )

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
  const transferRowIds = useMemo(
    () => new Set(transferCandidates.map((c) => c.rowId)),
    [transferCandidates],
  )

  // Nghi nhập trùng: cùng ngày + cùng tiền + cùng chiều với giao dịch đã có nhưng
  // ghi chú khác (đã ghi tay "Cơm trưa", file ghi "ファミリーマート").
  const dupSuspects = useMemo(
    () =>
      accountId ? detectPossibleDuplicates(preview.items, existing, { accountId }) : [],
    [preview.items, existing, accountId],
  )
  const suspectBy = useMemo(
    () => new Map<string, DuplicateCandidate>(dupSuspects.map((d) => [d.rowId, d])),
    [dupSuspects],
  )

  /** Dòng còn trong danh sách chờ nhập (chưa bị lọc trùng thật / chuyển khoản). */
  const candidates = useMemo(
    () =>
      preview.items.filter(
        (it) => !dupRowIds.has(it.rowId) && !(skipTransfers && transferRowIds.has(it.rowId)),
      ),
    [preview.items, dupRowIds, skipTransfers, transferRowIds],
  )
  // Lựa chọn của người dùng gắn theo DÒNG (rowId), không theo nội dung: sao kê có thật
  // hai dòng giống hệt nhau, dùng key nội dung thì bỏ tick một dòng tắt luôn dòng kia.
  // Nghi trùng thì mặc định BỎ TICK — thà bỏ sót còn hơn nhập đôi; người dùng tự bật lại.
  const isOn = (rowId: string) => !rowMerge[rowId] && (rowOn[rowId] ?? !suspectBy.has(rowId))
  const catOf = (it: ImportItem) => rowCat[it.rowId] ?? it.category_id
  const toImport = candidates.filter((it) => isOn(it.rowId))
  /** Dòng sẽ gộp vào khoản đã có (chỉ dòng nghi trùng mới gộp được). */
  const toMerge = candidates.filter((it) => rowMerge[it.rowId] && suspectBy.has(it.rowId))

  const dupCount = dupRowIds.size
  const transferCount = preview.items.filter(
    (it) => !dupRowIds.has(it.rowId) && transferRowIds.has(it.rowId),
  ).length
  const suspectCount = candidates.filter(
    (it) => suspectBy.has(it.rowId) && !rowMerge[it.rowId],
  ).length
  const nameOfAccount = (id: string) => accounts.find((a) => a.id === id)?.name ?? 'tài khoản khác'
  // Chi/thu BẮT BUỘC có danh mục (CHECK của bảng transactions) → thiếu thì chặn nhập
  const missingCatCount = toImport.filter((it) => !catOf(it)).length
  // Dòng người dùng đã tự chọn danh mục thì không đếm vào "đoán" hay "mặc định" nữa
  const guessedCount = toImport.filter(
    (it) =>
      !rowCat[it.rowId] &&
      catOf(it) &&
      (it.categorySource === 'history' || it.categorySource === 'keyword'),
  ).length
  const fallbackUsedCount = toImport.filter(
    (it) => !rowCat[it.rowId] && catOf(it) && it.categorySource === 'fallback',
  ).length

  async function handleImport() {
    if (!accountId || (toImport.length === 0 && toMerge.length === 0) || missingCatCount > 0) return
    setBusy(true)
    setResult(null)
    let done = 0
    let merged = 0
    try {
      // Gộp trước: chỉ sửa ghi chú của khoản đã có, không tạo khoản mới. Ghi chú đã
      // chứa tên trong file thì không cần gọi repo, nhưng vẫn tính là đã xử lý.
      for (const it of toMerge) {
        const s = suspectBy.get(it.rowId)
        if (!s) continue
        const next = mergeNote(s.matchedNote, it.note)
        if (next !== s.matchedNote) await repo.updateTransaction(s.matchedTxId, { note: next })
        merged++
      }
      for (const it of toImport) {
        await repo.createTransaction({
          type: it.type,
          amount: it.amount,
          to_amount: null,
          category_id: catOf(it),
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
      setResult({
        kind: 'ok',
        text: `Đã nhập ${done} giao dịch${merged > 0 ? `, gộp ${merged} dòng vào khoản đã có` : ''}.`,
      })
      setRows([])
      setFileName('')
      setLastBuffer(null)
      setRowCat({})
      setRowOn({})
      setRowMerge({})
    } catch (err) {
      setResult({
        kind: 'error',
        text: `Nhập lỗi sau ${merged} lần gộp và ${done} giao dịch: ${(err as Error).message}`,
      })
    } finally {
      setBusy(false)
    }
  }

  const selectCls =
    'rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1.5 text-sm'

  /** Options danh mục theo chiều: cha có con thì chỉ chọn được con (giống màn Nhập). */
  function categoryOptions(t: CategoryType) {
    const active = activeOfType(t)
    return active
      .filter((c) => !c.parent_id)
      .map((parent) => {
        const kids = active.filter((c) => c.parent_id === parent.id)
        return kids.length > 0 ? (
          <optgroup key={parent.id} label={`${parent.icon} ${parent.name}`}>
            {kids.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.name}
              </option>
            ))}
          </optgroup>
        ) : (
          <option key={parent.id} value={parent.id}>
            {parent.icon} {parent.name}
          </option>
        )
      })
  }

  return (
    <div className="flex flex-col gap-3 p-3 lg:p-6">
      <div className="flex items-center gap-2">
        <Link
          to="/settings/data"
          className="rounded-lg bg-white dark:bg-gray-900 px-3 py-1.5 text-lg shadow-sm active:scale-95"
          aria-label="Quay lại"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="flex-1 text-lg font-bold text-gray-800 dark:text-gray-100">
          Nhập giao dịch từ CSV
        </h1>
      </div>

      <section className="rounded-xl bg-white dark:bg-gray-900 p-3 shadow-sm">
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 dark:border-gray-700 py-4 text-sm font-medium text-gray-600 dark:text-gray-300 focus-within:ring-2 focus-within:ring-green-500">
          <Upload className="h-4 w-4" />
          {fileName || 'Chọn file CSV sao kê…'}
          <input type="file" accept=".csv,text/csv" className="sr-only" onChange={handleFile} />
        </label>
        <div className="mt-2 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <span>Mã hóa:</span>
          <select
            value={encoding}
            onChange={(e) => changeEncoding(e.target.value as Encoding)}
            className={selectCls}
          >
            <option value="utf-8">UTF-8</option>
            <option value="shift-jis">Shift-JIS (ngân hàng Nhật)</option>
          </select>
        </div>
      </section>

      {rows.length > 0 && (
        <>
          <section className="grid grid-cols-2 gap-2 rounded-xl bg-white dark:bg-gray-900 p-3 shadow-sm">
            <label className="col-span-2 flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
              Nhập vào tài khoản
              <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={selectCls}>
                <option value="">— Chọn tài khoản —</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.currency})
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
              Cột ngày
              <select value={dateCol} onChange={(e) => setDateCol(Number(e.target.value))} className={selectCls}>
                {columns.map((c) => (
                  <option key={c.i} value={c.i}>{c.label}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
              Cột số tiền
              <select value={amountCol} onChange={(e) => setAmountCol(Number(e.target.value))} className={selectCls}>
                {columns.map((c) => (
                  <option key={c.i} value={c.i}>{c.label}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
              Cột ghi chú
              <select value={noteCol} onChange={(e) => setNoteCol(Number(e.target.value))} className={selectCls}>
                {columns.map((c) => (
                  <option key={c.i} value={c.i}>{c.label}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
              Cột danh mục
              <select
                value={categoryCol}
                onChange={(e) => setCategoryCol(Number(e.target.value))}
                className={selectCls}
              >
                <option value={-1}>— Không có —</option>
                {columns.map((c) => (
                  <option key={c.i} value={c.i}>{c.label}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
              Thứ tự ngày
              <select value={dateOrder} onChange={(e) => setDateOrder(e.target.value as DateOrder)} className={selectCls}>
                <option value="ymd">Năm/Tháng/Ngày</option>
                <option value="dmy">Ngày/Tháng/Năm</option>
                <option value="mdy">Tháng/Ngày/Năm</option>
              </select>
            </label>
            <label className="col-span-2 flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
              <input type="checkbox" checked={hasHeader} onChange={(e) => setHasHeader(e.target.checked)} />
              Dòng đầu là tiêu đề cột
            </label>
            <label className="col-span-2 flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
              <input
                type="checkbox"
                checked={negativeIsExpense}
                onChange={(e) => setNegativeIsExpense(e.target.checked)}
              />
              Số âm là chi tiêu (số dương là thu nhập)
            </label>

            {/* Mọi giao dịch chi/thu buộc phải có danh mục. Tên trong file được ghép
                với danh mục đã có; dòng nào không khớp thì dùng hai ô dưới đây. */}
            <p className="col-span-2 -mb-1 mt-1 text-xs text-gray-500 dark:text-gray-400">
              {categoryCol >= 0
                ? 'Danh mục dùng khi tên trong file không khớp danh mục nào của bạn:'
                : 'Danh mục cho các dòng nhập vào (file không có cột danh mục):'}
            </p>
            <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
              Dòng Chi
              <select
                value={expenseCatId}
                onChange={(e) => setExpenseCatPick(e.target.value)}
                className={selectCls}
              >
                <option value="">— Chọn danh mục —</option>
                {categoryOptions('expense')}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
              Dòng Thu
              <select
                value={incomeCatId}
                onChange={(e) => setIncomeCatPick(e.target.value)}
                className={selectCls}
              >
                <option value="">— Chọn danh mục —</option>
                {categoryOptions('income')}
              </select>
            </label>
          </section>

          {account && (
            <section className="rounded-xl bg-white dark:bg-gray-900 p-3 shadow-sm">
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Sẽ nhập <strong>{toImport.length}</strong> giao dịch
                {toMerge.length > 0 && ` · gộp ${toMerge.length} dòng vào khoản đã có`}
                {dupCount > 0 && ` · bỏ qua ${dupCount} trùng`}
                {skipTransfers && transferCount > 0 && ` · bỏ qua ${transferCount} chuyển khoản`}
                {preview.skipped.length > 0 && ` · ${preview.skipped.length} dòng lỗi`}
                {guessedCount > 0 && ` · ${guessedCount} dòng đoán được danh mục`}
                {fallbackUsedCount > 0 && ` · ${fallbackUsedCount} dòng dùng danh mục mặc định`}
              </p>

              {missingCatCount > 0 && (
                <p className="mt-2 rounded-lg bg-red-50 p-2.5 text-xs text-red-700 dark:bg-red-900/30 dark:text-red-300">
                  <b>{missingCatCount} dòng chưa có danh mục.</b> Mỗi giao dịch chi/thu đều phải có
                  danh mục, nên hãy chọn danh mục mặc định cho dòng Chi và dòng Thu ở trên.
                </p>
              )}

              {/* Dòng không nhập được — phải kể ra từng dòng, không nuốt im: sao kê
                  PayPay có dòng trống ô ngày, im lặng bỏ là mất tiền mà không ai biết. */}
              {preview.skipped.length > 0 && (
                <div className="mt-2 rounded-lg bg-red-50 p-2.5 text-xs text-red-700 dark:bg-red-900/30 dark:text-red-300">
                  <b>{preview.skipped.length} dòng không nhập được</b> — mở file ra xem rồi ghi tay
                  nếu là khoản thật:
                  <ul className="mt-1 space-y-0.5">
                    {preview.skipped.slice(0, SKIP_LIMIT).map((s) => (
                      <li key={s.line} className="truncate">
                        Dòng {s.line}: {s.label || '(trống)'} — {SKIP_LABEL[s.reason]}
                      </li>
                    ))}
                    {preview.skipped.length > SKIP_LIMIT && (
                      <li>…và {preview.skipped.length - SKIP_LIMIT} dòng nữa.</li>
                    )}
                  </ul>
                </div>
              )}

              {/* Nghi nhập trùng với khoản đã ghi tay */}
              {suspectCount > 0 && (
                <p className="mt-2 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                  <b>{suspectCount} dòng nghi đã có trong sổ</b> — cùng ngày, cùng số tiền, cùng
                  chiều với một giao dịch bạn đã ghi, chỉ khác tên. Những dòng đó đã được{' '}
                  <b>bỏ tick sẵn</b> ở bảng dưới. Nếu đúng là khoản khác thì tick lại; nếu đúng là
                  khoản bạn đã ghi thì bấm <b>Gộp</b> để thêm tên trên sao kê vào ghi chú cũ.
                </p>
              )}

              {/* Cảnh báo chuyển khoản nội bộ */}
              {transferCount > 0 && (
                <div className="mt-2 rounded-lg bg-amber-50 p-2.5 dark:bg-amber-900/30">
                  <label className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-300">
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
                  <ul className="mt-1.5 space-y-0.5 pl-6 text-[0.6875rem] text-amber-700 dark:text-amber-400">
                    {transferCandidates.slice(0, 5).map((c) => {
                      const it = preview.items.find((x) => x.rowId === c.rowId)
                      return (
                        <li key={c.rowId} className="truncate">
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
              <div className="mt-2 max-h-96 overflow-auto text-xs">
                <table className="w-full">
                  <thead className="text-gray-500 dark:text-gray-400">
                    <tr>
                      <th className="py-1 text-left font-medium">Nhập</th>
                      <th className="py-1 text-left font-medium">Ngày</th>
                      <th className="py-1 text-left font-medium">Loại</th>
                      <th className="py-1 text-right font-medium">Số tiền</th>
                      <th className="py-1 text-left font-medium">Danh mục</th>
                      <th className="py-1 text-left font-medium">Nguồn</th>
                      <th className="py-1 text-left font-medium">Ghi chú</th>
                    </tr>
                  </thead>
                  <tbody>
                    {candidates.slice(0, ROW_LIMIT).map((it: ImportItem) => {
                      const on = isOn(it.rowId)
                      const cat = catOf(it)
                      const suspect = suspectBy.get(it.rowId)
                      const willMerge = !!rowMerge[it.rowId]
                      return (
                        <tr
                          key={it.rowId}
                          className={`border-t border-gray-100 dark:border-gray-800 ${
                            willMerge
                              ? 'bg-sky-50 dark:bg-sky-900/20'
                              : suspect
                                ? 'bg-amber-50 dark:bg-amber-900/20'
                                : ''
                          } ${on || willMerge ? '' : 'opacity-50'}`}
                        >
                          <td className="py-1">
                            <input
                              type="checkbox"
                              checked={on}
                              disabled={willMerge}
                              onChange={(e) =>
                                setRowOn((prev) => ({ ...prev, [it.rowId]: e.target.checked }))
                              }
                              aria-label={`Nhập dòng ${it.occurred_on} ${it.note}`}
                            />
                          </td>
                          <td className="py-1 tabular-nums">{it.occurred_on}</td>
                          <td
                            className={`py-1 ${it.type === 'expense' ? 'text-red-500' : 'text-green-600 dark:text-green-400'}`}
                          >
                            {it.type === 'expense' ? 'Chi' : 'Thu'}
                          </td>
                          <td className="py-1 text-right tabular-nums">
                            {formatMoney(it.amount, currency)}
                          </td>
                          <td className="py-1">
                            <select
                              value={cat ?? ''}
                              onChange={(e) =>
                                setRowCat((prev) => ({ ...prev, [it.rowId]: e.target.value }))
                              }
                              className={`max-w-32 rounded border px-1 py-0.5 ${
                                cat
                                  ? 'border-gray-300 dark:border-gray-700'
                                  : 'border-red-400 text-red-500'
                              } bg-white dark:bg-gray-900`}
                            >
                              <option value="">— chưa có —</option>
                              {categoryOptions(it.type)}
                            </select>
                          </td>
                          <td className="py-1 text-gray-500 dark:text-gray-400">
                            {rowCat[it.rowId] ? 'Bạn chọn' : SOURCE_LABEL[it.categorySource]}
                          </td>
                          <td className="py-1">
                            {it.note}
                            {suspect && (
                              <span className="block text-amber-700 dark:text-amber-400">
                                {willMerge ? 'sẽ gộp vào' : 'nghi trùng với'} “
                                {suspect.matchedNote || 'không ghi chú'}”
                                <button
                                  type="button"
                                  onClick={() =>
                                    setRowMerge((prev) => ({ ...prev, [it.rowId]: !willMerge }))
                                  }
                                  className={`ml-1 rounded border px-1.5 py-0.5 align-middle active:scale-95 ${
                                    willMerge
                                      ? 'border-sky-500 bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200'
                                      : 'border-amber-400 text-amber-800 dark:text-amber-300'
                                  }`}
                                >
                                  {willMerge ? '✓ Gộp' : 'Gộp'}
                                </button>
                                {willMerge && (
                                  <span className="block text-sky-700 dark:text-sky-300">
                                    → {mergeNote(suspect.matchedNote, it.note)}
                                  </span>
                                )}
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {candidates.length > ROW_LIMIT && (
                  <p className="mt-1 text-center text-gray-500 dark:text-gray-400">
                    Chỉ hiện {ROW_LIMIT} dòng đầu để trang không nặng — {candidates.length -
                      ROW_LIMIT}{' '}
                    dòng còn lại vẫn được nhập theo danh mục đã đoán.
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={handleImport}
                disabled={
                  busy || (toImport.length === 0 && toMerge.length === 0) || missingCatCount > 0
                }
                className="mt-3 w-full rounded-lg bg-green-600 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-40 active:scale-95"
              >
                {busy
                  ? 'Đang nhập…'
                  : toMerge.length > 0
                    ? `Nhập ${toImport.length} + gộp ${toMerge.length}`
                    : `Nhập ${toImport.length} giao dịch`}
              </button>
            </section>
          )}
        </>
      )}

      {result && (
        <p
          className={`rounded-lg px-3 py-2 text-sm ${
            result.kind === 'error'
              ? 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300'
              : 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300'
          }`}
        >
          {result.text}
        </p>
      )}
    </div>
  )
}
