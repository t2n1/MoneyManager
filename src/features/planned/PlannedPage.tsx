// Trang "Sắp chi" — mọi khoản CHƯA tiêu mà sẽ phải tiêu, gom theo tháng.
//
// Trả lời câu mà không màn nào khác trả lời được: "sắp tới tôi phải chi những gì, và
// tổng chừng bao nhiêu". Sổ giao dịch chỉ nói chuyện đã rồi; ngân sách nói giới hạn
// của tháng này; Lifetime nói chuyện chục năm. Khoảng giữa — vài tháng tới — trước
// đây trống.
import { useMemo, useState } from 'react'
import { Guide } from '../../components/Guide'
import { Link } from 'react-router-dom'
import { Bell, BellOff, Check, ChevronLeft, Plus, X } from 'lucide-react'
import {
  ActionButton,
  Card,
  iconButtonClass,
  Money,
  SectionTitle,
  StatusDot,
  type StatusTone,
} from '../../components/ui'
import {
  useCategories,
  usePlannedExpenses,
  useRates,
  useUpdatePlannedExpense,
} from '../../hooks/queries'
import { toISODate } from '../../lib/dates'
import { showToast } from '../../lib/dialog'
import type { PlannedExpenseRow } from '../../types/database.types'
import { daysUntil, groupPlannedByMonth, plannedOutlook } from './planned'
import { PlannedFormSheet } from './PlannedFormSheet'

/** Cửa sổ của con số ở đầu màn. 3 tháng = đủ xa để lo, đủ gần để tin. */
const OUTLOOK_MONTHS = 3

/** Trong bao nhiêu ngày thì coi là "sắp tới rồi" — mức vàng của chấm trạng thái. */
const SOON_DAYS = 7

/**
 * Mức của một khoản sắp chi, đọc từ số ngày còn lại.
 *
 * Chỉ xét mốc NGÀY. Khoản ghi độ chính xác 'month' (due_on là ngày 1 theo quy ước lưu
 * trữ) không có hạn thật để so — chấm nó thành đỏ/vàng là bịa ra độ chính xác mà dữ
 * liệu không có, đúng cái mà dòng ngày bên dưới đã cố ý tránh.
 */
function plannedTone(precision: PlannedExpenseRow['due_precision'], daysLeft: number): StatusTone {
  if (precision !== 'day') return 'info'
  if (daysLeft < 0) return 'bad'
  if (daysLeft <= SOON_DAYS) return 'warn'
  return 'good'
}

/** Nhãn đọc thành tiếng cho chấm — màu không phải kênh duy nhất. */
function plannedToneLabel(tone: StatusTone, daysLeft: number): string {
  if (tone === 'bad') return `Quá hạn ${-daysLeft} ngày`
  if (tone === 'warn') return daysLeft === 0 ? 'Đến hạn hôm nay' : `Còn ${daysLeft} ngày`
  if (tone === 'good') return `Còn ${daysLeft} ngày`
  return 'Chưa có ngày cụ thể'
}

const MONTH_LABEL = (key: string) => {
  const [y, m] = key.split('-')
  return `${y}/${m.padStart(2, '0')}`
}
const ngay = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`

export function PlannedPage() {
  const { data: rows = [], isLoading } = usePlannedExpenses()
  const { data: categories = [] } = useCategories()
  const { base, rates } = useRates()
  const update = useUpdatePlannedExpense()
  const [sheet, setSheet] = useState<{ planned: PlannedExpenseRow | null } | null>(null)

  const todayISO = toISODate(new Date())
  const months = useMemo(
    () => groupPlannedByMonth(rows, base, rates ?? {}),
    [rows, base, rates],
  )
  const outlook = useMemo(
    () => plannedOutlook(rows, todayISO, OUTLOOK_MONTHS, base, rates ?? {}),
    [rows, todayISO, base, rates],
  )
  const catOf = (id: string | null) => categories.find((c) => c.id === id)

  async function drop(p: PlannedExpenseRow) {
    try {
      await update.mutateAsync({ id: p.id, patch: { status: 'dropped' } })
      showToast(`Đã bỏ "${p.title}"`)
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Thao tác thất bại, thử lại.', 'error')
    }
  }

  const header = (
    <div className="mb-3 flex items-center gap-2">
      <Link to="/" aria-label="Quay lại Sổ" className={iconButtonClass()}>
        <ChevronLeft className="h-5 w-5" />
      </Link>
      <h1 className="flex-1 text-lg font-bold text-fg-primary">Sắp chi</h1>
      <ActionButton variant="primary" onClick={() => setSheet({ planned: null })}>
        <Plus className="h-4 w-4" /> Thêm
      </ActionButton>
    </div>
  )

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 p-3 lg:p-6">
      {header}

      {isLoading ? (
        <p className="py-10 text-center text-sm text-fg-muted">Đang tải…</p>
      ) : months.length === 0 ? (
        <Card as="section">
          <p className="text-sm text-fg-muted">
            Chưa có khoản nào.
            <Guide as="span">
              {' '}
              Thêm những thứ bạn biết là sắp phải chi — sửa nhà, chuyển nhà, đóng phí — để không
              phải nhớ trong đầu. Khoản nào cần app kêu thì bật "Nhắc tôi"; khoản chỉ để nhìn thì
              thôi.
            </Guide>
          </p>
        </Card>
      ) : (
        <>
          {/* Con số duy nhất đáng đặt lên đầu */}
          <Card as="section">
            <SectionTitle>{OUTLOOK_MONTHS} tháng tới cần chừng</SectionTitle>
            <p className="mt-1 flex items-baseline gap-2">
              <Money amount={outlook.totalBase} currency={base} className="text-2xl font-bold" />
              <span className="text-xs text-fg-muted">{outlook.count} khoản</span>
            </p>
            {outlook.hasMissingRate && (
              <p className="mt-1 text-2xs text-fg-muted">
                Thiếu tỷ giá cho vài khoản ngoại tệ nên tổng đang tính thiếu.
              </p>
            )}
            <p className="mt-1 text-2xs text-fg-muted">
              Gồm cả khoản đã quá hạn mà chưa chi — vẫn là tiền chưa trả.
            </p>
          </Card>

          {months.map((m) => (
            <Card as="section" key={m.monthKey}>
              <div className="flex items-baseline justify-between gap-2">
                <SectionTitle>{MONTH_LABEL(m.monthKey)}</SectionTitle>
                <Money
                  amount={m.totalBase}
                  currency={base}
                  approx={m.hasMissingRate}
                  className="text-sm font-semibold"
                />
              </div>

              <ul className="mt-1 divide-y divide-border-subtle">
                {m.items.map((p) => {
                  const left = daysUntil(todayISO, p.due_on)
                  const quaHan = p.due_precision === 'day' && left < 0
                  const cat = catOf(p.category_id)
                  return (
                    <li key={p.id} className="flex items-center gap-2 py-2">
                      {/* Chấm đứng TRƯỚC tên, không phải sau con số: mắt quét một cột
                          dọc là thấy ngay dòng nào gấp, không phải đọc từng dòng ngày. */}
                      <StatusDot
                        tone={plannedTone(p.due_precision, left)}
                        label={plannedToneLabel(plannedTone(p.due_precision, left), left)}
                      />
                      <button
                        type="button"
                        onClick={() => setSheet({ planned: p })}
                        className="min-w-0 flex-1 text-left"
                      >
                        <p className="flex items-baseline gap-1.5 text-sm">
                          <span className="truncate font-medium text-fg-primary">{p.title}</span>
                          {p.remind_days_before === null ? (
                            <BellOff
                              className="h-3 w-3 shrink-0 text-fg-muted"
                              aria-label="Không nhắc"
                            />
                          ) : (
                            <Bell
                              className="h-3 w-3 shrink-0 text-fg-accent"
                              aria-label="Có nhắc"
                            />
                          )}
                        </p>
                        <p className="text-2xs text-fg-muted">
                          {/* Kiểu 'month' KHÔNG in ngày: due_on là ngày 1 do quy ước
                              lưu trữ, in ra thành "1/10" là bịa độ chính xác. */}
                          {p.due_precision === 'day' ? ngay(p.due_on) : 'trong tháng'}
                          {quaHan && <span className="text-money-out"> · quá hạn {-left} ngày</span>}
                          {cat && ` · ${cat.icon} ${cat.name}`}
                          {p.note && ` · ${p.note}`}
                        </p>
                      </button>

                      <span className="shrink-0 text-right">
                        {p.amount > 0 ? (
                          <Money
                            amount={p.amount}
                            currency={p.currency}
                            className="text-sm font-semibold"
                          />
                        ) : (
                          <span className="text-2xs text-fg-muted">chưa rõ</span>
                        )}
                      </span>

                      {/* Ghi khoản này: mở form nhập đã điền sẵn. Đánh dấu xong CHỈ
                          xảy ra sau khi giao dịch được lưu — xem EntryPage. */}
                      <Link
                        to={`/entry?planned=${p.id}`}
                        aria-label={`Ghi khoản ${p.title}`}
                        title="Đã chi — ghi vào sổ"
                        className={iconButtonClass('ghost', 'shrink-0 text-green-700 dark:text-green-400')}
                      >
                        <Check className="h-5 w-5" />
                      </Link>
                      <button
                        type="button"
                        onClick={() => drop(p)}
                        aria-label={`Bỏ khoản ${p.title}`}
                        title="Không cần nữa"
                        className={iconButtonClass('ghost', 'shrink-0 text-fg-muted')}
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </li>
                  )
                })}
              </ul>
            </Card>
          ))}
        </>
      )}

      {sheet && (
        <PlannedFormSheet planned={sheet.planned} onClose={() => setSheet(null)} />
      )}
    </div>
  )
}
