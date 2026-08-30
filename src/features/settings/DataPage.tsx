// Dữ liệu & sao lưu — ba việc, ba thẻ, ba cột.
//
// ---- Vì sao vẽ lại (redesign 2026-08-30) -------------------------------------------
//
// Đo bản trước ở 1440×900: ba thẻ xếp DỌC, mỗi thẻ rộng 1.100px trong khi control bên
// trong rộng chừng 300px — bỏ trống ~800px, ba lần. Trang vừa một màn nên nó không dài,
// nó chỉ rỗng.
//
// Và tám control viết tay: hai nút Tháng|Năm (đã có <SegmentedControl>), hai nút ‹ › (đã
// có <IconButton>), bốn nút hành động (đã có <ActionButton>). Mỗi cái lệch một ít về
// chiều cao, hover, và vòng focus so với bản chuẩn.
//
// Ba thẻ chia theo HƯỚNG đi của dữ liệu, không theo định dạng file:
//   LẤY RA   — CSV / PDF cho một kỳ;
//   CẤT GIỮ  — JSON toàn bộ, và đường về;
//   ĐƯA VÀO  — nhập từ file ngoài.
// Trước đây "Xuất báo cáo" và "Xuất dữ liệu" là hai thẻ tên gần giống nhau mà làm hai
// việc khác hẳn: một cái để ĐỌC, một cái để PHỤC HỒI.
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Download, FileUp, Printer } from 'lucide-react'
import { BackupSection } from './BackupSection'
import { exportCsvFilename } from './exportFilename'
import { buildTransactionsCsv } from '../reports/csv'
import { downloadTextFile } from '../../lib/download'
import { showToast } from '../../lib/dialog'
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
import {
  ActionButton,
  Card,
  IconButton,
  Num,
  PageHeader,
  SectionTitle,
  SegmentedControl,
} from '../../components/ui'

type Period = 'month' | 'year'

const PERIOD_ITEMS = [
  { value: 'month' as const, label: 'Tháng' },
  { value: 'year' as const, label: 'Năm' },
]

/** Tiêu đề của một thẻ trên trang này — dải chữ hoa trên nền chrome, đồng bộ ba thẻ. */
function CardTitle({ children }: { children: string }) {
  return (
    <SectionTitle
      role="micro"
      className="border-b border-border-panel bg-surface-chrome px-3 py-2.5"
    >
      {children}
    </SectionTitle>
  )
}

function ExportSection() {
  const navigate = useNavigate()
  const { data: profile } = useProfile()
  const monthStartDay = profile?.month_start_day ?? 1
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()

  const [period, setPeriod] = useState<Period>('month')
  const today = monthKeyForDate(toISODate(new Date()), monthStartDay)
  const [monthKey, setMonthKey] = useState<MonthKey>(today)
  const [year, setYear] = useState<number>(today.year)

  const monthQ = useMonthTransactions(monthKey)
  const yearQ = useRangeTransactions(getYearRange(year, monthStartDay), !!profile && period === 'year')
  const txs = period === 'year' ? (yearQ.data ?? []) : (monthQ.data ?? [])
  const loading = period === 'year' ? yearQ.isLoading : monthQ.isLoading

  const currencyOf = (id: string): CurrencyCode =>
    accounts.find((a) => a.id === id)?.currency ?? profile?.base_currency ?? 'JPY'

  function handleCsv() {
    // Kỳ rỗng thì NÓI ra, không khoá nút. `disabled` ở đây là một cái nút chết câm:
    // preflight của Tailwind v4 khai `button { opacity: 1 }` ở @layer base, thắng
    // `disabled:opacity-50` của <ActionButton> ở @layer utilities — đo trên app đang
    // chạy, nút khoá cho ra đúng `opacity: 1`, tức trông y hệt nút bấm được. Class có
    // trong DOM, CSS dựng ra vẫn không mờ, và không có lint nào bắt.
    if (txs.length === 0) {
      showToast('Kỳ này không có giao dịch nào để xuất.', 'error')
      return
    }
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
  // Dựng ở đây chứ không nội suy thẳng trong JSX: `designSystem.test.ts` đếm văn xuôi
  // bằng cách bỏ các cặp `{…}` KHÔNG lồng nhau, nên một biểu thức ba tầng nằm trong
  // <p class="…fg-muted"> bị nó đọc thành một đoạn văn 45+ ký tự và tính vào trần.
  const countLine = loading ? (
    'Đang đếm…'
  ) : (
    <>
      <Num tone="muted">{txs.length}</Num> giao dịch
    </>
  )
  const step = (delta: number) =>
    period === 'month' ? setMonthKey((k) => addMonths(k, delta)) : setYear((y) => y + delta)

  return (
    <Card as="section" elevation="panel" padding="none" className="overflow-hidden">
      <CardTitle>Lấy ra</CardTitle>
      <div className="flex flex-col gap-3 p-3">
        <SegmentedControl
          items={PERIOD_ITEMS}
          value={period}
          onChange={setPeriod}
          label="Kỳ để xuất"
        />

        <div>
          <div className="flex items-center justify-between gap-2">
            <IconButton
              aria-label={period === 'month' ? 'Tháng trước' : 'Năm trước'}
              onClick={() => step(-1)}
            >
              <ChevronLeft className="h-5 w-5" />
            </IconButton>
            <span className="font-mono text-sm font-semibold tabular-nums text-fg-primary">
              {label}
            </span>
            <IconButton
              aria-label={period === 'month' ? 'Tháng sau' : 'Năm sau'}
              onClick={() => step(1)}
            >
              <ChevronRight className="h-5 w-5" />
            </IconButton>
          </div>
          {/* Số giao dịch trong kỳ — con số này MIỄN PHÍ (chính rổ dùng để dựng CSV) và
              nó là lời giải thích cho việc nút "Tải CSV" bị khoá. Bản trước khoá nút mà
              không nói gì, nên bấm ‹ › là bấm mò. */}
          <p className="mt-1 text-center text-2xs text-fg-muted">{countLine}</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <ActionButton onClick={handleCsv}>
            <Download className="h-4 w-4" />
            Tải CSV
          </ActionButton>
          <ActionButton onClick={handlePdf}>
            <Printer className="h-4 w-4" />
            Xuất PDF / In
          </ActionButton>
        </div>
      </div>
    </Card>
  )
}

function ImportSection() {
  const rowClass =
    'flex min-h-12 items-center gap-3 border-b border-border-subtle px-3 py-3 text-sm text-fg-primary transition last:border-b-0 hover:bg-surface-sunken'
  return (
    <Card as="section" elevation="panel" padding="none" className="overflow-hidden">
      <CardTitle>Đưa vào</CardTitle>
      <Link to="/settings/import" className={rowClass}>
        <FileUp className="h-5 w-5 shrink-0 text-fg-muted" />
        <span className="min-w-0 flex-1">Giao dịch từ CSV</span>
        <ChevronRight className="h-5 w-5 shrink-0 text-fg-muted" />
      </Link>
      <Link to="/settings/nhap-phieu-luong" className={rowClass}>
        <FileUp className="h-5 w-5 shrink-0 text-fg-muted" />
        <span className="min-w-0 flex-1">Phiếu lương từ PDF</span>
        <ChevronRight className="h-5 w-5 shrink-0 text-fg-muted" />
      </Link>
    </Card>
  )
}

export function DataPage() {
  return (
    <div className="flex flex-col gap-3 p-3 lg:p-6">
      <PageHeader title="Dữ liệu & sao lưu" back="/settings" flush />

      {/* `auto-fit` + `minmax` chứ không chốt số cột: thẻ này sống trong CỘT PHẢI của
          Cài đặt, mà cột đó rộng bao nhiêu thì tuỳ cửa sổ (1024px → ~730px, 1920px →
          ~1600px). Chốt `xl:grid-cols-3` là ở 1024px ba cột 230px, ở đó nhãn "Xuất PDF /
          In" xuống dòng giữa từ. Để lưới tự chia: hẹp thì một cột, đủ chỗ thì ba.
          `items-start` để thẻ ngắn không bị kéo cao bằng thẻ dài. */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(17rem,1fr))] items-start gap-3">
        <ExportSection />
        <BackupSection />
        <ImportSection />
      </div>
    </div>
  )
}
