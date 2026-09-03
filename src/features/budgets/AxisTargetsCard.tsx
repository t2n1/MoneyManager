// Khối "Cơ cấu chi so với mốc" ở đầu tab Ngân sách.
// Các dòng dùng chung một khuôn với danh sách hạn mức bên dưới (tên · % · thanh
// tiến độ · số tiền / mốc) để mắt không phải học lại cách đọc.
import { Link, useSearchParams } from 'react-router-dom'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Guide } from '../../components/Guide'
import { useCategories } from '../../hooks/queries'
import { monthKeyString, type MonthKey } from '../../lib/dates'
import { formatMoney, type CurrencyCode } from '../../lib/money'
import {
  axisMissSummary,
  BASELINE_MONTHS,
  shareLabel,
  type AxisKey,
  type AxisProgress,
} from './axisTargets'
import { Card, Collapse, SectionTitle } from '../../components/ui'
import { STATUS_FILL } from '../../components/ui/statusColors'

interface Props {
  data: AxisProgress
  base: CurrencyCode
  /** kỳ đang xem — đi kèm link sang chi tiết danh mục để mở đúng tháng */
  monthKey: MonthKey
}

export function AxisTargetsCard({ data, base, monthKey }: Props) {
  const { data: categories = [] } = useCategories()
  // Trục đang xổ nằm trong URL chứ không phải useState: bấm vào một danh mục là rời
  // trang, quay lại phải thấy đúng chỗ vừa mở — state trong component thì mất sạch.
  const [searchParams, setSearchParams] = useSearchParams()
  const openParam = searchParams.get('axis')
  // Validate bằng chính dữ liệu đang có, không bằng một hàm gõ cứng: khoá hợp lệ tuỳ
  // phương pháp đang chọn (8 khả năng, không còn cứng essential/flexible/savings).
  const open = data.lines.some((l) => l.key === openParam) ? (openParam as AxisKey) : null
  const ym = monthKeyString(monthKey)
  // Các mốc đang thế nào — một mệnh đề, tính ở hàm thuần (axisTargets.ts).
  const miss = axisMissSummary(data.lines)

  const toggle = (key: AxisKey) =>
    setSearchParams(
      (prev) => {
        if (open === key) prev.delete('axis')
        else prev.set('axis', key)
        return prev
      },
      { replace: true },
    )

  return (
    <Card as="section">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        {/* Bản vẽ 11a đặt KẾT LUẬN ngay cạnh tiêu đề: "Mốc 50 / 30 / 20 — đạt cả ba".
            Thiếu nó thì ba thanh màu bắt người đọc tự cân: dòng nào cũng có % riêng và
            mốc riêng, mà câu hỏi thật chỉ có một — "cơ cấu tháng này ổn chưa".
            Chữ lấy từ `axisMissSummary`, dùng CHUNG với câu kết luận của mặt lập kế
            hoạch, nên hai mặt không thể đếm ra hai kết quả khác nhau khi tháng chuyển
            từ chưa-bắt-đầu sang đang-chạy. */}
        <SectionTitle className="min-w-0">
          Cơ cấu chi so với mốc
          {miss && (
            <span className={miss.missed.length === 0 ? 'text-money-in' : 'text-fg-warn'}>
              {' — '}
              {miss.phrase}
            </span>
          )}
        </SectionTitle>
        {/* -my-3 để vùng chạm 44px không đẩy hàng tiêu đề giãn ra (cùng mẹo với nút
            "Chọn" ở LedgerPage) — đo được 42×16 khi để trần. */}
        <Link
          to="/settings?edit=profile"
          className="-my-3 inline-flex min-h-11 shrink-0 items-center text-2xs font-medium text-fg-accent"
        >
          Đổi mốc
        </Link>
      </div>

      {/* Mẫu số đang là số ƯỚC TÍNH — phải nói ngay dưới tiêu đề, trước khi mắt
          đọc tới các tỷ lệ, chứ không phải chú thích cuối thẻ. */}
      {data.estimated && (
        <p className="mb-2 text-2xs text-fg-muted">
          Tháng này mới nhận {formatMoney(Math.round(data.actualIncome), base)} — các tỷ lệ
          dưới đây tính tạm trên {formatMoney(data.income, base)}, mức thu trung bình{' '}
          {BASELINE_MONTHS} tháng gần đây.
        </p>
      )}

      <ul className="space-y-3">
        {data.lines.map((l) => {
          // Thanh vẽ theo tỷ lệ trên thu nhập; mốc là vạch đứng để so bằng mắt
          const barPct = Math.min(Math.max(l.share, 0) * 100, 100)
          const markPct = Math.min(l.targetShare * 100, 100)
          // Tiết kiệm không bao giờ xổ được (không phải tổng của danh mục nào), và
          // trục chưa chi đồng nào cũng vậy — không có gì để liệt kê.
          const canExpand = l.slices.length > 0
          const isOpen = canExpand && open === l.key
          const listId = `axis-parts-${l.key}`

          // Thân dòng dùng chung cho cả hai nhánh (có nút / không) — vẽ hai lần là
          // sớm muộn sửa một chỗ quên chỗ kia.
          const body = (
            <>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="text-fg-secondary">
                  {canExpand &&
                    (isOpen ? (
                      <ChevronDown className="mr-1 inline h-4 w-4 -translate-y-px text-fg-muted" aria-hidden />
                    ) : (
                      <ChevronRight className="mr-1 inline h-4 w-4 -translate-y-px text-fg-muted" aria-hidden />
                    ))}
                  {l.label}
                </span>
                <span
                  className={`text-sm font-medium ${
                    l.ok ? 'text-money-in' : 'text-fg-warn'
                  }`}
                >
                  {shareLabel(l.share)}
                  <span className="ml-1 font-normal text-fg-muted">
                    {l.direction === 'cap' ? 'tối đa' : 'tối thiểu'}{' '}
                    {Math.round(l.targetShare * 100)}%
                  </span>
                </span>
              </div>
              <div className="relative mt-1 h-2 overflow-hidden rounded-full bg-surface-sunken">
                <div
                  className={`h-full rounded-full ${
                    l.ok ? STATUS_FILL.good : STATUS_FILL.warn
                  }`}
                  style={{ width: `${barPct}%` }}
                />
                {/* Vạch mốc — vẽ sau để luôn nằm trên thanh */}
                <div
                  className="absolute top-0 h-2 w-0.5 bg-gray-500 dark:bg-gray-300"
                  style={{ left: `${markPct}%` }}
                  aria-hidden
                />
              </div>
              <div className="mt-0.5 flex justify-between text-sm text-fg-muted">
                <span className={l.ok ? '' : 'text-fg-warn'}>
                  {formatMoney(Math.round(l.actual), base)}
                </span>
                <span>
                  {l.direction === 'cap' ? 'trần' : 'sàn'} {formatMoney(l.target, base)}
                </span>
              </div>
            </>
          )

          return (
            <li key={l.key}>
              {canExpand ? (
                <button
                  type="button"
                  onClick={() => toggle(l.key)}
                  aria-expanded={isOpen}
                  aria-controls={listId}
                  className="block w-full text-left"
                >
                  {body}
                </button>
              ) : (
                body
              )}
              <Guide className="mt-0.5 text-2xs text-fg-muted">{l.hint}</Guide>

              {/* Xổ nhóm bằng <Collapse> (§12): các trục × vài danh mục là chặn trên nhỏ,
                  giữ trong DOM lúc đóng không tốn gì. */}
              <Collapse open={isOpen} id={listId}>
                <ul className="mt-1 border-t border-border-subtle">
                  {l.slices.map((s) => {
                    const c = categories.find((cat) => cat.id === s.categoryId)
                    // Tỷ lệ trong TRỤC, không phải trên thu nhập: tính trên thu nhập thì
                    // cả danh sách cộng lại ra 37%, phải nhẩm thêm một bước mới ghép được.
                    const pct = l.actual > 0 ? Math.round((s.amount / l.actual) * 100) : 0
                    return (
                      <li key={s.categoryId} className="border-b border-border-subtle last:border-b-0">
                        <Link
                          to={`/reports/category/${s.categoryId}?ym=${ym}&from=budget&axis=${l.key}`}
                          className="flex min-h-11 items-center gap-3 px-1 py-1.5 active:bg-surface-sunken"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm text-fg-secondary">
                              {c?.icon && <span className="mr-1">{c.icon}</span>}
                              {c?.name ?? 'Không rõ danh mục'}
                            </span>
                            {/* Thanh XÁM cố ý: xanh/hổ phách ở thanh trục mang nghĩa
                                "đạt/vượt mốc", mà danh mục con không có mốc riêng nào cả. */}
                            <span className="mt-1 block h-1 overflow-hidden rounded-full bg-surface-sunken">
                              <span
                                className="block h-1 rounded-full bg-gray-500 dark:bg-gray-400"
                                style={{ width: `${pct}%` }}
                              />
                            </span>
                          </span>
                          <span className="shrink-0 text-sm text-fg-muted">
                            {formatMoney(Math.round(s.amount), base)} · {pct}%
                          </span>
                          <ChevronRight className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden />
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </Collapse>
            </li>
          )
        })}
      </ul>

      {data.unclassified > 0 && (
        <p className="mt-3 rounded-lg bg-state-warn-bg text-state-warn-fg px-2 py-1.5 text-sm">
          Còn {formatMoney(Math.round(data.unclassified), base)} chi chưa phân loại nên các dòng chi
          đang thiếu.{' '}
          <Link to="/settings/categories/classify" className="font-medium underline">
            Phân loại nhanh
          </Link>
        </p>
      )}
    </Card>
  )
}
