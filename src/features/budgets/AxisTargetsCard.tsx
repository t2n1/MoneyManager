// Khối "Cơ cấu chi so với mốc" ở đầu tab Ngân sách.
// Ba dòng dùng chung một khuôn với danh sách hạn mức bên dưới (tên · % · thanh
// tiến độ · số tiền / mốc) để mắt không phải học lại cách đọc.
import { Link, useSearchParams } from 'react-router-dom'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Guide } from '../../components/Guide'
import { useCategories } from '../../hooks/queries'
import { monthKeyString, type MonthKey } from '../../lib/dates'
import { formatMoney, type CurrencyCode } from '../../lib/money'
import { BASELINE_MONTHS, type AxisKey, type AxisProgress } from './axisTargets'

const LABEL: Record<AxisKey, string> = {
  essential: 'Thiết yếu',
  flexible: 'Linh hoạt',
  savings: 'Tiết kiệm',
}

/** Giải nghĩa mỗi trục — chữ CHỈ ĐỂ DẠY, ẩn ở chế độ Gọn.
 *
 *  Lọt lần rà đầu vì nó là hằng số, không phải một <p> có class chữ phụ: máy quét theo
 *  class không thấy được. Chỉ bản CHẠY THẬT mới lộ ra. */
const HINT: Record<AxisKey, string> = {
  essential: 'tiền nhà, điện nước, đi lại — cắt là ảnh hưởng cuộc sống',
  flexible: 'ăn ngoài, mua sắm, giải trí — cắt được khi cần',
  savings: 'phần còn lại sau khi tiêu',
}

function isAxisKey(s: string | null): s is AxisKey {
  return s === 'essential' || s === 'flexible' || s === 'savings'
}

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
  const open = isAxisKey(openParam) ? openParam : null
  const ym = monthKeyString(monthKey)

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
    <section className="rounded-xl bg-surface p-3 shadow-sm ">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-fg-muted">
          Cơ cấu chi so với mốc
        </h2>
        {/* -my-3 để vùng chạm 44px không đẩy hàng tiêu đề giãn ra (cùng mẹo với nút
            "Chọn" ở LedgerPage) — đo được 42×16 khi để trần. */}
        <Link
          to="/settings?edit=profile"
          className="-my-3 inline-flex min-h-11 shrink-0 items-center text-2xs font-medium text-green-700 dark:text-green-400"
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
                <span className="text-gray-700 dark:text-gray-300">
                  {canExpand &&
                    (isOpen ? (
                      <ChevronDown className="mr-1 inline h-4 w-4 -translate-y-px text-fg-muted" aria-hidden />
                    ) : (
                      <ChevronRight className="mr-1 inline h-4 w-4 -translate-y-px text-fg-muted" aria-hidden />
                    ))}
                  {LABEL[l.key]}
                </span>
                <span
                  className={`text-xs font-medium ${
                    l.ok ? 'text-money-in' : 'text-fg-warn'
                  }`}
                >
                  {Math.round(l.share * 100)}%
                  <span className="ml-1 font-normal text-fg-muted">
                    {l.direction === 'cap' ? 'tối đa' : 'tối thiểu'}{' '}
                    {Math.round(l.targetShare * 100)}%
                  </span>
                </span>
              </div>
              <div className="relative mt-1 h-2 overflow-hidden rounded-full bg-surface-sunken">
                <div
                  className={`h-full rounded-full ${
                    l.ok ? 'bg-green-500' : 'bg-amber-500'
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
              <div className="mt-0.5 flex justify-between text-xs text-fg-muted">
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
              <Guide className="mt-0.5 text-2xs text-fg-muted">{HINT[l.key]}</Guide>

              {isOpen && (
                <ul id={listId} className="mt-1 border-t border-border-subtle">
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
                            <span className="block truncate text-sm text-gray-700 dark:text-gray-300">
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
                          <span className="shrink-0 text-xs text-fg-muted">
                            {formatMoney(Math.round(s.amount), base)} · {pct}%
                          </span>
                          <ChevronRight className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden />
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              )}
            </li>
          )
        })}
      </ul>

      {data.unclassified > 0 && (
        <p className="mt-3 rounded-lg bg-amber-50 px-2 py-1.5 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
          Còn {formatMoney(Math.round(data.unclassified), base)} chi chưa phân loại nên hai dòng đầu
          đang thiếu.{' '}
          <Link to="/settings/categories/classify" className="font-medium underline">
            Phân loại nhanh
          </Link>
        </p>
      )}
    </section>
  )
}
