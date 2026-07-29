// Khối "Cơ cấu chi so với mốc" ở đầu tab Ngân sách.
// Ba dòng dùng chung một khuôn với danh sách hạn mức bên dưới (tên · % · thanh
// tiến độ · số tiền / mốc) để mắt không phải học lại cách đọc.
import { Link } from 'react-router-dom'
import { formatMoney, type CurrencyCode } from '../../lib/money'
import type { AxisKey, AxisProgress } from './axisTargets'

const LABEL: Record<AxisKey, string> = {
  essential: 'Thiết yếu',
  flexible: 'Linh hoạt',
  savings: 'Tiết kiệm',
}

const HINT: Record<AxisKey, string> = {
  essential: 'tiền nhà, điện nước, đi lại — cắt là ảnh hưởng cuộc sống',
  flexible: 'ăn ngoài, mua sắm, giải trí — cắt được khi cần',
  savings: 'phần còn lại sau khi tiêu',
}

interface Props {
  data: AxisProgress
  base: CurrencyCode
}

export function AxisTargetsCard({ data, base }: Props) {
  return (
    <section className="rounded-xl bg-white p-3 shadow-sm dark:bg-gray-900">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400">
          Cơ cấu chi so với mốc
        </h2>
        <Link
          to="/settings?edit=profile"
          className="shrink-0 text-[0.6875rem] font-medium text-green-700 dark:text-green-400"
        >
          Đổi mốc
        </Link>
      </div>

      <ul className="space-y-3">
        {data.lines.map((l) => {
          // Thanh vẽ theo tỷ lệ trên thu nhập; mốc là vạch đứng để so bằng mắt
          const barPct = Math.min(Math.max(l.share, 0) * 100, 100)
          const markPct = Math.min(l.targetShare * 100, 100)
          return (
            <li key={l.key}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="text-gray-700 dark:text-gray-300">{LABEL[l.key]}</span>
                <span
                  className={`text-xs font-medium ${
                    l.ok ? 'text-money-in' : 'text-amber-600 dark:text-amber-400'
                  }`}
                >
                  {Math.round(l.share * 100)}%
                  <span className="ml-1 font-normal text-gray-500 dark:text-gray-400">
                    {l.direction === 'cap' ? 'tối đa' : 'tối thiểu'}{' '}
                    {Math.round(l.targetShare * 100)}%
                  </span>
                </span>
              </div>
              <div className="relative mt-1 h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
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
              <div className="mt-0.5 flex justify-between text-xs text-gray-500 dark:text-gray-400">
                <span className={l.ok ? '' : 'text-amber-600 dark:text-amber-400'}>
                  {formatMoney(Math.round(l.actual), base)}
                </span>
                <span>
                  {l.direction === 'cap' ? 'trần' : 'sàn'} {formatMoney(l.target, base)}
                </span>
              </div>
              <p className="mt-0.5 text-[0.6875rem] text-gray-500 dark:text-gray-400">{HINT[l.key]}</p>
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
