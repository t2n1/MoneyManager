import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Download, FileUp, Printer } from 'lucide-react'
import { BackLink } from '../../components/BackLink'
import { BackupSection } from './BackupSection'
import { exportCsvFilename } from './exportFilename'
import { buildTransactionsCsv } from '../reports/csv'
import { downloadTextFile } from '../../lib/download'
import {
  useAccounts,
  useCategories,
  useMonthTransactions,
  useProfile,
  useRangeTransactions,
} from '../../hooks/queries'
import {
  addMonths,
  formatMonthLabel,
  formatYearLabel,
  getYearRange,
  monthKeyForDate,
  toISODate,
  type MonthKey,
} from '../../lib/dates'
import type { CurrencyCode } from '../../lib/money'
import { Card } from '../../components/ui'

function ExportSection() {
  const navigate = useNavigate()
  const { data: profile } = useProfile()
  const monthStartDay = profile?.month_start_day ?? 1
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()

  const [period, setPeriod] = useState<'month' | 'year'>('month')
  const today = monthKeyForDate(toISODate(new Date()), monthStartDay)
  const [monthKey, setMonthKey] = useState<MonthKey>(today)
  const [year, setYear] = useState<number>(today.year)

  const monthQ = useMonthTransactions(monthKey)
  const yearQ = useRangeTransactions(getYearRange(year, monthStartDay), !!profile && period === 'year')
  const txs = period === 'year' ? (yearQ.data ?? []) : (monthQ.data ?? [])

  const currencyOf = (id: string): CurrencyCode =>
    accounts.find((a) => a.id === id)?.currency ?? profile?.base_currency ?? 'JPY'

  function handleCsv() {
    const sorted = [...txs].sort((a, b) => a.occurred_on.localeCompare(b.occurred_on))
    const csv = buildTransactionsCsv(sorted, {
      categoryName: (id) => categories.find((c) => c.id === id)?.name ?? '',
      accountName: (id) => accounts.find((a) => a.id === id)?.name ?? '',
      currencyOf,
    })
    downloadTextFile(exportCsvFilename(period, monthKey, year), csv, 'text/csv')
  }

  function handlePdf() {
    const params =
      period === 'year'
        ? `period=year&year=${year}&print=1`
        : `period=month&ym=${monthKey.year}-${String(monthKey.month).padStart(2, '0')}&print=1`
    navigate(`/reports?${params}`)
  }

  const label = period === 'month' ? formatMonthLabel(monthKey) : formatYearLabel(year)

  return (
    <Card as="section" padding="none" className="overflow-hidden">
      <h2 className="px-3 pt-3 text-sm font-semibold text-fg-muted">
        Xuất báo cáo &amp; giao dịch
      </h2>
      <div className="p-3">
        {/* Nút gạt Tháng | Năm */}
        <div className="flex rounded-lg bg-surface-sunken p-0.5 text-sm font-medium">
          <button
            type="button"
            onClick={() => setPeriod('month')}
            className={`flex-1 rounded-md py-1.5 ${period === 'month' ? 'bg-surface text-fg-primary shadow-sm' : 'text-fg-on-track hover:text-fg-primary'}`}
          >
            Tháng
          </button>
          <button
            type="button"
            onClick={() => setPeriod('year')}
            className={`flex-1 rounded-md py-1.5 ${period === 'year' ? 'bg-surface text-fg-primary shadow-sm' : 'text-fg-on-track hover:text-fg-primary'}`}
          >
            Năm
          </button>
        </div>

        {/* Điều hướng kỳ */}
        <div className="mt-2 flex items-center justify-between">
          <button
            type="button"
            onClick={() =>
              period === 'month' ? setMonthKey((k) => addMonths(k, -1)) : setYear((y) => y - 1)
            }
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-border-strong px-3 py-1.5"
            aria-label={period === 'month' ? 'Tháng trước' : 'Năm trước'}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="text-sm font-semibold text-fg-primary">{label}</span>
          <button
            type="button"
            onClick={() =>
              period === 'month' ? setMonthKey((k) => addMonths(k, 1)) : setYear((y) => y + 1)
            }
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-border-strong px-3 py-1.5"
            aria-label={period === 'month' ? 'Tháng sau' : 'Năm sau'}
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        {/* Hai nút xuất */}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleCsv}
            disabled={txs.length === 0}
            className="flex items-center gap-2 rounded-lg border border-border-strong px-3 py-2 text-sm font-medium text-fg-primary hover:bg-surface-sunken disabled:opacity-40"
          >
            <Download className="h-4 w-4" />
            Tải CSV
          </button>
          <button
            type="button"
            onClick={handlePdf}
            className="flex items-center gap-2 rounded-lg border border-border-strong px-3 py-2 text-sm font-medium text-fg-primary hover:bg-surface-sunken"
          >
            <Printer className="h-4 w-4" />
            Xuất PDF / In
          </button>
        </div>
      </div>
    </Card>
  )
}

export function DataPage() {
  return (
    <div className="flex flex-col gap-4 p-3 lg:p-6">
      <div className="flex items-center gap-2">
        <BackLink to="/settings" aria-label="Quay lại" />
        <h1 className="flex-1 text-lg font-bold text-fg-primary">
          Dữ liệu &amp; sao lưu
        </h1>
      </div>

      <ExportSection />

      <BackupSection />

      <Card as="section" padding="none" className="overflow-hidden">
        <h2 className="px-3 pt-3 text-sm font-semibold text-fg-muted">
          Nhập dữ liệu
        </h2>
        <div className="mt-1">
          <Link
            to="/settings/import"
            className="flex items-center gap-3 px-3 py-3 text-sm text-fg-primary hover:bg-surface-sunken"
          >
            <FileUp className="h-5 w-5 text-fg-muted" />
            <span className="flex-1">Nhập giao dịch từ CSV</span>
            <ChevronRight className="h-5 w-5 text-gray-300 dark:text-gray-600" />
          </Link>
          <Link
            to="/settings/nhap-phieu-luong"
            className="flex items-center gap-3 px-3 py-3 text-sm text-fg-primary hover:bg-surface-sunken"
          >
            <FileUp className="h-5 w-5 text-fg-muted" />
            <span className="flex-1">Nhập phiếu lương từ PDF</span>
            <ChevronRight className="h-5 w-5 text-gray-300 dark:text-gray-600" />
          </Link>
        </div>
      </Card>
    </div>
  )
}
