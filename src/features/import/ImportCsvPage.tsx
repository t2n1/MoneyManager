import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, Upload } from 'lucide-react'
import { repo } from '../../data'
import { useAccounts, useRangeTransactions } from '../../hooks/queries'
import { toISODate } from '../../lib/dates'
import { formatMoney } from '../../lib/money'
import {
  buildImportPreview,
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

export function ImportCsvPage() {
  const qc = useQueryClient()
  const { data: accounts = [] } = useAccounts()

  const [rows, setRows] = useState<string[][]>([])
  const [fileName, setFileName] = useState('')
  const [encoding, setEncoding] = useState<Encoding>('utf-8')
  const [accountId, setAccountId] = useState('')
  const [dateCol, setDateCol] = useState(0)
  const [amountCol, setAmountCol] = useState(1)
  const [noteCol, setNoteCol] = useState(2)
  const [hasHeader, setHasHeader] = useState(true)
  const [dateOrder, setDateOrder] = useState<DateOrder>('ymd')
  const [negativeIsExpense, setNegativeIsExpense] = useState(true)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [lastBuffer, setLastBuffer] = useState<ArrayBuffer | null>(null)

  const account = accounts.find((a) => a.id === accountId)
  const currency = account?.currency ?? 'JPY'
  const headerRow = rows[0] ?? []
  const columns = headerRow.map((h, i) => ({ i, label: hasHeader ? h || `Cột ${i + 1}` : `Cột ${i + 1}` }))

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
            mapping: { date: dateCol, amount: amountCol, note: noteCol },
            dateOrder,
            hasHeader,
            negativeIsExpense,
            currency,
          })
        : { items: [], errorCount: 0 },
    [rows, account, dateCol, amountCol, noteCol, dateOrder, hasHeader, negativeIsExpense, currency],
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

  const toImport = useMemo(
    () => preview.items.filter((it) => !existingKeys.has(it.key)),
    [preview.items, existingKeys],
  )
  const dupCount = preview.items.length - toImport.length

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
          category_id: null,
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
      setResult(`Đã nhập ${done} giao dịch.`)
      setRows([])
      setFileName('')
      setLastBuffer(null)
    } catch (err) {
      setResult(`Nhập lỗi sau ${done} giao dịch: ${(err as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const selectCls =
    'rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1.5 text-sm'

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
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 dark:border-gray-700 py-4 text-sm font-medium text-gray-600 dark:text-gray-300">
          <Upload className="h-4 w-4" />
          {fileName || 'Chọn file CSV sao kê…'}
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} />
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
          </section>

          {account && (
            <section className="rounded-xl bg-white dark:bg-gray-900 p-3 shadow-sm">
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Sẽ nhập <strong>{toImport.length}</strong> giao dịch
                {dupCount > 0 && ` · bỏ qua ${dupCount} trùng`}
                {preview.errorCount > 0 && ` · ${preview.errorCount} dòng lỗi`}
              </p>
              <div className="mt-2 max-h-64 overflow-auto text-xs">
                <table className="w-full">
                  <thead className="text-gray-400 dark:text-gray-500">
                    <tr>
                      <th className="py-1 text-left font-medium">Ngày</th>
                      <th className="py-1 text-left font-medium">Loại</th>
                      <th className="py-1 text-right font-medium">Số tiền</th>
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
                        <td className="py-1">{it.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {toImport.length > 20 && (
                  <p className="mt-1 text-center text-gray-400 dark:text-gray-500">
                    … và {toImport.length - 20} dòng nữa
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={handleImport}
                disabled={busy || toImport.length === 0}
                className="mt-3 w-full rounded-lg bg-green-600 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-40 active:scale-95"
              >
                {busy ? 'Đang nhập…' : `Nhập ${toImport.length} giao dịch`}
              </button>
            </section>
          )}
        </>
      )}

      {result && (
        <p className="rounded-lg bg-green-50 dark:bg-green-900/30 px-3 py-2 text-sm text-green-700 dark:text-green-300">
          {result}
        </p>
      )}
    </div>
  )
}
