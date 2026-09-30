// Trang "Sắp chi" — mọi khoản CHƯA tiêu mà sẽ phải tiêu, gom theo tháng.
//
// Trả lời câu mà không màn nào khác trả lời được: "sắp tới tôi phải chi những gì, và
// tổng chừng bao nhiêu". Sổ giao dịch chỉ nói chuyện đã rồi; ngân sách nói giới hạn
// của tháng này; Lifetime nói chuyện chục năm. Khoảng giữa — vài tháng tới — trước
// đây trống.
import { useMemo, useState } from 'react'
import { Guide } from '../../components/Guide'
import { Link } from 'react-router-dom'
import { Bell, BellOff, Check, Plus, X } from 'lucide-react'
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
import { groupPlannedByMonth, plannedOutlook, plannedRowStatus, type PlannedRowStatus } from './planned'
import { PlannedFormSheet } from './PlannedFormSheet'
import { EmptyState, PageHeader } from '../../components/ui'
import { tr } from '../../i18n'
import { trn } from '../../i18n/react'

/** Cửa sổ của con số ở đầu màn. 3 tháng = đủ xa để lo, đủ gần để tin. */
const OUTLOOK_MONTHS = 3

/**
 * Màu chấm trạng thái. Khoản chỉ biết tháng mà tháng CHƯA qua thì trung tính: nó không
 * có ngày nào để vàng/xanh, tô màu là bịa độ chính xác. Qua hết tháng thì đỏ như mọi
 * khoản quá hạn — luật chung trong `plannedRowStatus`.
 */
const TONE: Record<PlannedRowStatus['level'], StatusTone> = {
  overdue: 'bad',
  soon: 'warn',
  later: 'good',
  month: 'info',
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
      showToast(tr('Đã bỏ "{name}"', { name: p.title }))
    } catch (e) {
      showToast(e instanceof Error ? e.message : tr('Thao tác thất bại, thử lại.'), 'error')
    }
  }

  const header = (
    <PageHeader title={tr('Sắp chi')} back="/so">
      <ActionButton variant="primary" onClick={() => setSheet({ planned: null })}>
        <Plus className="h-4 w-4" /> {tr('Thêm')}
      </ActionButton>
    </PageHeader>
  )

  return (
    // KHÔNG chặn `max-w-2xl` (672px): AppLayout chốt khung app nở tự do và chỉ những
    // trang CẦN hẹp mới tự bó (Nhập — một cột form; Sổ giao dịch — mạch đọc). Sắp chi
    // không thuộc nhóm đó: nó là danh sách khoản, cùng hình dạng với Nợ và Định kỳ, mà
    // hai trang kia đều nở. Vào Nợ rồi bấm sang Sắp chi thì nội dung tự co lại ~176px —
    // ba trang anh em, hai bề rộng.
    <div className="flex w-full flex-col gap-3 p-3 lg:p-6">
      {header}

      {isLoading ? (
        <EmptyState>{tr('Đang tải…')}</EmptyState>
      ) : months.length === 0 ? (
        <Card as="section">
          {/* Câu CHỈ ĐƯỜNG dưới đây KHÔNG bọc Guide — xem chú thích trong components/Guide.tsx:
              màn rỗng thì nó là thứ duy nhất trên màn hình, bọc lại là người mới ở chế độ Gọn
              (mặc định) chỉ thấy đúng "Chưa có khoản nào." và không biết bấm gì. Phần DẠY dài
              vẫn bọc như cũ. */}
          <p className="text-sm text-fg-muted">
            {trn('Chưa có khoản nào. Bấm {add} ở trên để ghi khoản sắp phải chi.', {
              add: <b className="font-semibold text-fg-secondary">{tr('Thêm')}</b>,
            })}
            <Guide as="span">
              {' '}
              {tr('Thêm những thứ bạn biết là sắp phải chi — sửa nhà, chuyển nhà, đóng phí — để không phải nhớ trong đầu. Khoản nào cần app kêu thì bật "Nhắc tôi"; khoản chỉ để nhìn thì thôi.')}
            </Guide>
          </p>
        </Card>
      ) : (
        <>
          {/* Con số duy nhất đáng đặt lên đầu */}
          <Card as="section">
            <SectionTitle>{tr('{n} tháng tới cần chừng', { n: OUTLOOK_MONTHS })}</SectionTitle>
            <p className="mt-1 flex items-baseline gap-2">
              <Money amount={outlook.totalBase} currency={base} className="text-kpi font-medium tracking-number" />
              <span className="text-sm text-fg-muted">{tr('{n} khoản', { n: outlook.count })}</span>
            </p>
            {outlook.hasMissingRate && (
              <p className="mt-1 text-2xs text-fg-muted">
                {tr('Thiếu tỷ giá cho vài khoản ngoại tệ nên tổng đang tính thiếu.')}
              </p>
            )}
            {/* E-ink + Gọn: bỏ lời giải thích cách cộng tổng. */}
            <p className="mt-1 text-2xs text-fg-muted eink-gon:hidden">
              {tr('Gồm cả khoản đã quá hạn mà chưa chi — vẫn là tiền chưa trả.')}
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
                  const st = plannedRowStatus(p, todayISO)
                  const cat = catOf(p.category_id)
                  return (
                    <li key={p.id} className="flex items-center gap-2 py-2">
                      {/* Chấm đứng TRƯỚC tên, không phải sau con số: mắt quét một cột
                          dọc là thấy ngay dòng nào gấp, không phải đọc từng dòng ngày. */}
                      <StatusDot tone={TONE[st.level]} label={st.label} />
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
                              aria-label={tr('Không nhắc')}
                            />
                          ) : (
                            <Bell
                              className="h-3 w-3 shrink-0 text-fg-accent"
                              aria-label={tr('Có nhắc')}
                            />
                          )}
                        </p>
                        <p className="text-2xs text-fg-muted">
                          {/* Kiểu 'month' KHÔNG in ngày: due_on là ngày 1 do quy ước
                              lưu trữ, in ra thành "1/10" là bịa độ chính xác. */}
                          {p.due_precision === 'day'
                            ? ngay(p.due_on)
                            : tr('trong tháng {m}', { m: Number(p.due_on.slice(5, 7)) })}
                          {st.level === 'overdue' && (
                            <span className="text-money-out">{tr(' · quá hạn {n} ngày', { n: st.overdueDays })}</span>
                          )}
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
                          <span className="text-2xs text-fg-muted">{tr('chưa rõ')}</span>
                        )}
                      </span>

                      {/* Ghi khoản này: mở form nhập đã điền sẵn. Đánh dấu xong CHỈ
                          xảy ra sau khi giao dịch được lưu — xem EntryPage. */}
                      <Link
                        to={`/entry?planned=${p.id}`}
                        aria-label={tr('Ghi khoản {name}', { name: p.title })}
                        title={tr('Đã chi — ghi vào sổ')}
                        className={iconButtonClass('ghost-accent', 'shrink-0')}
                      >
                        <Check className="h-5 w-5" />
                      </Link>
                      <button
                        type="button"
                        onClick={() => drop(p)}
                        aria-label={tr('Bỏ khoản {name}', { name: p.title })}
                        title={tr('Không cần nữa')}
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
