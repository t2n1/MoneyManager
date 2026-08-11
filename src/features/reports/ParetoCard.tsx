// Thẻ Pareto 80/20: chỉ ra nhúm danh mục nhỏ đang nuốt phần lớn tiền.
// Ý nghĩa thực dụng: muốn tiết kiệm thì siết đúng mấy danh mục này, đụng vào
// phần đuôi dài phía sau tốn công mà đổi lại chẳng bao nhiêu.
import { ExplainBox } from '../../components/ExplainBox'
import { VerdictNote } from '../../components/VerdictNote'
import { Money } from '../../components/ui'
import { formatMoney, type CurrencyCode } from '../../lib/money'
import type { CategoryRow } from '../../types/database.types'
import type { CategorySlice } from './aggregate'
import { paretoCut } from './behavior'
import { paretoTone } from './verdicts'

interface Props {
  slices: CategorySlice[]
  categories: CategoryRow[]
  base: CurrencyCode
  periodNoun: string
}

export function ParetoCard({ slices, categories, base, periodNoun }: Props) {
  const pareto = paretoCut(slices)
  if (!pareto) return null

  const catOf = (id: string) => categories.find((c) => c.id === id)
  const amountOf = (id: string) => slices.find((s) => s.categoryId === id)?.amount ?? 0
  const tail = pareto.categoryCount - pareto.count

  return (
    <section className="rounded-xl bg-surface p-3 shadow-sm ">
      <h2 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
        Ít danh mục, nhiều tiền
      </h2>

      <p className="text-xs text-fg-secondary">
        <b className="text-base text-fg-primary">
          {pareto.count}/{pareto.categoryCount}
        </b>{' '}
        danh mục chiếm <b>{Math.round(pareto.share * 100)}%</b> chi tiêu {periodNoun} (
        {formatMoney(Math.round(pareto.total), base)}).
      </p>

      <ul className="mt-2 space-y-1">
        {pareto.categoryIds.map((id, i) => {
          const cat = catOf(id)
          return (
            <li
              key={id}
              className="flex items-center gap-2 rounded-lg bg-amber-50 px-2 py-1.5 text-xs dark:bg-amber-900/20"
            >
              <span className="w-4 shrink-0 text-center font-medium text-fg-warn tabular-nums">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-gray-700 dark:text-gray-200">
                {cat?.icon ?? '📦'} {cat?.name ?? 'Chưa rõ'}
              </span>
              <Money
                amount={Math.round(amountOf(id))}
                currency={base}
                className="shrink-0 font-medium"
              />
            </li>
          )
        })}
      </ul>

      {tail > 0 && (
        <p className="mt-2 text-2xs text-fg-muted">
          {tail} danh mục còn lại gộp lại chỉ chiếm {Math.round((1 - pareto.share) * 100)}%.
        </p>
      )}

      {/* Mức ở đây nói về khả năng HÀNH ĐỘNG, không phải sức khỏe — chi tập trung
          không phải đức tính, nó chỉ có nghĩa là biết siết vào đâu. */}
      <div className="mt-2">
        <VerdictNote
          tone={paretoTone(pareto.count, pareto.categoryCount)}
          short={
            paretoTone(pareto.count, pareto.categoryCount) === 'warn'
              ? `Rò rỉ đều: ${pareto.count}/${pareto.categoryCount} danh mục`
              : `Tập trung: ${pareto.count} danh mục = ${Math.round(pareto.share * 100)}%`
          }
        >
          {paretoTone(pareto.count, pareto.categoryCount) === 'warn' ? (
            <>
              Tiền rò rỉ khá đều: phải gọi tên {pareto.count} trong {pareto.categoryCount} danh mục
              mới đủ 80%. Cắt lẻ từng khoản sẽ tốn công mà đổi lại ít — hiệu quả hơn là đặt hạn mức
              tổng.
            </>
          ) : (
            <>
              Chi khá tập trung: siết {pareto.count} danh mục trên là đã chạm được{' '}
              {Math.round(pareto.share * 100)}% tiền ra.
            </>
          )}
        </VerdictNote>
      </div>

      <ExplainBox label="Cách đọc">
        <p>
          Xếp danh mục từ lớn xuống nhỏ rồi cộng dồn cho tới khi chạm 80% tổng chi. Số danh mục cần
          đến chính là con số bên trên.
        </p>
        <p>
          Con số càng nhỏ thì chi tiêu càng “tập trung” — cắt giảm dễ nhắm hơn. Nếu phải gọi tên tới
          gần hết danh mục mới đủ 80% thì tiền của bạn rò rỉ đều khắp nơi, và cách hiệu quả nhất
          không phải cắt từng khoản mà là đặt ngân sách tổng.
        </p>
      </ExplainBox>
    </section>
  )
}
