// Dải chọn tháng nằm ngang, mỗi tháng kèm CON SỐ của tháng đó.
//
// Thay cho cặp mũi tên ‹ ›: muốn biết tháng 3 chi bao nhiêu thì phải bấm lùi mấy lần,
// mỗi lần chờ tải, và vẫn không so được tháng nào nặng tháng nào nhẹ. permtrack liệt kê
// thẳng mọi tháng kèm số tồn của tháng đó — nhìn một cái là thấy, bấm một cái là tới.
//
// Không thay mũi tên: mũi tên vẫn tiện để nhích từng tháng, và trên màn hẹp thì dải này
// phải cuộn ngang. Hai cái bổ nghĩa cho nhau.
import { useEffect, useRef } from 'react'
import { Money } from '../../components/ui'
import { monthKeyString, type MonthKey } from '../../lib/dates'
import type { CurrencyCode } from '../../lib/money'

export interface MonthStripItem {
  key: MonthKey
  /** Số tiền của tháng (base minor). null = chưa có dữ liệu cho tháng đó. */
  amount: number | null
}

interface Props {
  items: readonly MonthStripItem[]
  active: MonthKey
  onPick: (key: MonthKey) => void
  base: CurrencyCode
  /** Nhãn cho trình đọc màn hình, vd "Chọn tháng xem báo cáo". */
  label: string
}

const sameMonth = (a: MonthKey, b: MonthKey) => a.year === b.year && a.month === b.month

export function MonthStrip({ items, active, onPick, base, label }: Props) {
  const listRef = useRef<HTMLDivElement>(null)

  // Tháng đang chọn phải tự cuộn vào tầm nhìn — dải dài hơn màn hình thì tháng đang xem
  // hay nằm ngoài mép phải, lúc đó dải thành vô dụng. Cùng cách SectionIndex đang làm:
  // tự đặt scrollLeft chứ KHÔNG scrollIntoView (nó cuộn cả vùng cuộn cha).
  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const chip = list.querySelector<HTMLElement>(`[data-key="${monthKeyString(active)}"]`)
    if (!chip) return
    const PAD = 8
    const left = chip.offsetLeft
    const right = left + chip.offsetWidth
    if (left < list.scrollLeft) list.scrollLeft = left - PAD
    else if (right > list.scrollLeft + list.clientWidth)
      list.scrollLeft = right - list.clientWidth + PAD
  }, [active, items])

  if (items.length < 2) return null

  return (
    <div
      ref={listRef}
      role="group"
      aria-label={label}
      className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-1 lg:-mx-6 lg:px-6 print:hidden"
    >
      {items.map((it) => {
        const on = sameMonth(it.key, active)
        return (
          <button
            key={monthKeyString(it.key)}
            data-key={monthKeyString(it.key)}
            type="button"
            onClick={() => onPick(it.key)}
            aria-current={on ? 'true' : undefined}
            // flex-1 + min-w-fit: ít tháng thì các ô giãn đều kín hàng (không dồn
            // cục bên trái), nhiều tháng thì mỗi ô giữ bề rộng tối thiểu và dải cuộn.
            className={`flex min-h-11 min-w-fit flex-1 flex-col items-center rounded-lg px-2.5 py-1.5 ${
              on ? 'bg-accent text-white' : 'bg-surface text-fg-secondary shadow-sm'
            }`}
          >
            <span className="text-2xs leading-tight">
              {it.key.month}/{String(it.key.year).slice(2)}
            </span>
            {/* Tháng đang chọn có nền màu nhấn nên <Money> phải nhường màu cho chữ trắng —
                token màu tiền trên nền xanh sẽ không đọc được. */}
            <span className="text-xs font-semibold leading-tight">
              {it.amount === null ? (
                '—'
              ) : on ? (
                <Money amount={it.amount} currency={base} tone="neutral" compact className="text-white" />
              ) : (
                <Money amount={it.amount} currency={base} tone="neutral" compact />
              )}
            </span>
          </button>
        )
      })}
    </div>
  )
}
