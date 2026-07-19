import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Circle, Sparkles, X } from 'lucide-react'
import { useBudgets } from '../../hooks/queries'
import { monthKeyString, type MonthKey } from '../../lib/dates'

const DISMISS_KEY = 'sct-onboarding-dismissed'

interface Props {
  /** Số giao dịch của kỳ đang xem (dùng làm tín hiệu "đã nhập giao dịch"). */
  txCount: number
  monthKey: MonthKey
}

/** Checklist bắt đầu nhanh cho người dùng mới; tự ẩn khi đã xong hoặc bị bỏ qua. */
export function OnboardingCard({ txCount, monthKey }: Props) {
  const { data: budgets = [] } = useBudgets(monthKeyString(monthKey))
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1'
    } catch {
      return false
    }
  })

  const hasTx = txCount > 0
  const hasBudget = budgets.length > 0
  if (dismissed || (hasTx && hasBudget)) return null

  function dismiss() {
    setDismissed(true)
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      // bỏ qua
    }
  }

  const steps: { done: boolean; label: string; to: string; cta: string }[] = [
    { done: hasTx, label: 'Nhập giao dịch đầu tiên', to: '/entry', cta: 'Nhập ngay' },
    { done: hasBudget, label: 'Đặt hạn mức ngân sách', to: '/reports?view=budget', cta: 'Đặt hạn mức' },
    { done: false, label: 'Sắp xếp tài khoản & nhóm tài sản', to: '/settings/accounts', cta: 'Mở' },
  ]

  return (
    <div className="mb-3 rounded-xl border border-green-200 bg-green-50 p-3 dark:border-green-900 dark:bg-green-900/20">
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-green-600 dark:text-green-400" />
        <h2 className="flex-1 text-sm font-bold text-green-800 dark:text-green-200">
          Bắt đầu nhanh
        </h2>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Bỏ qua hướng dẫn"
          className="rounded p-0.5 text-green-700/70 hover:text-green-700 dark:text-green-300/70"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <ul className="mt-2 flex flex-col gap-1.5">
        {steps.map((s) => (
          <li key={s.label} className="flex items-center gap-2 text-sm">
            {s.done ? (
              <Check className="h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />
            ) : (
              <Circle className="h-4 w-4 shrink-0 text-green-400/60" />
            )}
            <span
              className={`flex-1 ${
                s.done
                  ? 'text-gray-400 line-through dark:text-gray-500'
                  : 'text-gray-700 dark:text-gray-200'
              }`}
            >
              {s.label}
            </span>
            {!s.done && (
              <Link
                to={s.to}
                className="shrink-0 rounded-lg bg-green-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-green-700 active:scale-95"
              >
                {s.cta}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
