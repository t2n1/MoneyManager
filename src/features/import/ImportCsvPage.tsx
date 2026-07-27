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
  detectInternalTransfers,
  parseCsvText,
  type DateOrder,
  type ImportItem,
} from './csvImport'

type Encoding = 'utf-8' | 'shift-jis'

/** ISO ngày + 1 (mốc loại trừ cho truy vấn khoảng ngày). */
function nextDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return toISODate(new Date(y, m - 1, d + 1))
}

/** Danh mục mặc định gợi ý sẵn: danh mục "Khác" mà mọi sổ đều có từ lúc tạo. */
const DEFAULT_FALLBACK_NAME = 'Khác'

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
  const categoryName = (id: string | null) =>
    id ? (categories.find((c) => c.id === id)?.name ?? '—') : '—'

  function decodeAndParse(buf: ArrayBuffer, enc: Encoding) {
    const text = new TextDecoder(enc).decode(buf)
    setRows(parseCsvText(text))
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setResult(null)
    const buf = await file.arrayBuffer()
    setLastBuffer(buf)
    setFileName(file.name)
    decodeAndParse(buf, encoding)
  }

  function changeEncoding(enc: Encoding) {
    setEncoding(enc)
    if (lastBuffer) decodeAndParse(lastBuffer, enc)
  }

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
          })
        : { items: [], errorCount: 0 },
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

  const existingKeys = useMemo(() => {
    const set = new Set<string>()
    for (const t of existing) {
      if (t.account_id !== accountId) continue
      if (t.type !== 'expense' && t.type !== 'income') continue
      const sign = t.type === 'expense' ? '-' : '+'
      set.add(`${t.occurred_on}|${sign}${t.amount}|${t.note ?? ''}`)
    }
    return set
  }, [existing, accountId])

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

  const toImport = useMemo(
    () =>
      preview.items.filter(
        (it) => !existingKeys.has(it.key) && !(skipTransfers && transferKeys.has(it.key)),
      ),
    [preview.items, existingKeys, skipTransfers, transferKeys],
  )
  const dupCount = preview.items.filter((it) => existingKeys.has(it.key)).length
  const transferCount = preview.items.filter(
    (it) => !existingKeys.has(it.key) && transferKeys.has(it.key),
  ).length
  const nameOfAccount = (id: string) => accounts.find((a) => a.id === id)?.name ?? 'tài khoản khác'
  // Chi/thu BẮT BUỘC có danh mục (CHECK của bảng transactions) → thiếu thì chặn nhập
  const missingCatCount = toImport.filter((it) => !it.category_id).length
  const fallbackUsedCount = toImport.filter((it) => it.category_id && !it.categoryFromFile).length

  async function handleImport() {
    if (!accountId || toImport.length === 0 || missingCatCount > 0) return
    setBusy(true)
    setResult(null)
    let done = 0
    try {
      for (const it of toImport) {
        await repo.createTransaction({
          type: it.type,
          amount: it.amount,
          to_amount: null,
          category_id: it.category_id,
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
      setRows([])
      setFileName('')
      setLastBuffer(null)
    } catch (err) {
      setResult({ kind: 'error', text: `Nhập lỗi sau ${done} giao dịch: ${(err as Error).message}` })
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
                {dupCount > 0 && ` · bỏ qua ${dupCount} trùng`}
                {skipTransfers && transferCount > 0 && ` · bỏ qua ${transferCount} chuyển khoản`}
                {preview.errorCount > 0 && ` · ${preview.errorCount} dòng lỗi`}
                {categoryCol >= 0 &&
                  fallbackUsedCount > 0 &&
                  ` · ${fallbackUsedCount} dòng dùng danh mục mặc định`}
              </p>

              {missingCatCount > 0 && (
                <p className="mt-2 rounded-lg bg-red-50 p-2.5 text-xs text-red-700 dark:bg-red-900/30 dark:text-red-300">
                  <b>{missingCatCount} dòng chưa có danh mục.</b> Mỗi giao dịch chi/thu đều phải có
                  danh mục, nên hãy chọn danh mục mặc định cho dòng Chi và dòng Thu ở trên.
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
              <div className="mt-2 max-h-64 overflow-auto text-xs">
                <table className="w-full">
                  <thead className="text-gray-500 dark:text-gray-400">
                    <tr>
                      <th className="py-1 text-left font-medium">Ngày</th>
                      <th className="py-1 text-left font-medium">Loại</th>
                      <th className="py-1 text-right font-medium">Số tiền</th>
                      <th className="py-1 text-left font-medium">Danh mục</th>
                      <th className="py-1 text-left font-medium">Ghi chú</th>
                    </tr>
                  </thead>
                  <tbody>
                    {toImport.slice(0, 20).map((it: ImportItem, i) => (
                      <tr key={i} className="border-t border-gray-100 dark:border-gray-800">
                        <td className="py-1 tabular-nums">{it.occurred_on}</td>
                        <td className={`py-1 ${it.type === 'expense' ? 'text-red-500' : 'text-green-600 dark:text-green-400'}`}>
                          {it.type === 'expense' ? 'Chi' : 'Thu'}
                        </td>
                        <td className="py-1 text-right tabular-nums">{formatMoney(it.amount, currency)}</td>
                        {/* Danh mục mặc định hiện mờ hơn để thấy ngay dòng nào chưa khớp tên */}
                        <td
                          className={`py-1 ${
                            it.category_id
                              ? it.categoryFromFile
                                ? ''
                                : 'text-gray-400 dark:text-gray-500'
                              : 'text-red-500'
                          }`}
                        >
                          {it.category_id ? categoryName(it.category_id) : 'chưa có'}
                        </td>
                        <td className="py-1">{it.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {toImport.length > 20 && (
                  <p className="mt-1 text-center text-gray-500 dark:text-gray-400">
                    … và {toImport.length - 20} dòng nữa
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={handleImport}
                disabled={busy || toImport.length === 0 || missingCatCount > 0}
                className="mt-3 w-full rounded-lg bg-green-600 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-40 active:scale-95"
              >
                {busy ? 'Đang nhập…' : `Nhập ${toImport.length} giao dịch`}
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
