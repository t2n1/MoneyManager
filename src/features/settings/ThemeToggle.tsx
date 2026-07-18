import { Monitor, Moon, Sun } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useTheme } from '../../hooks/useTheme'
import type { ThemePref } from '../../lib/theme'

const OPTIONS: { value: ThemePref; label: string; Icon: LucideIcon }[] = [
  { value: 'light', label: 'Sáng', Icon: Sun },
  { value: 'dark', label: 'Tối', Icon: Moon },
  { value: 'system', label: 'Hệ thống', Icon: Monitor },
]

export function ThemeToggle() {
  const { pref, setTheme } = useTheme()

  return (
    <section className="overflow-hidden rounded-xl bg-white shadow-sm dark:bg-gray-900">
      <h2 className="px-3 pt-3 text-sm font-semibold text-gray-500 dark:text-gray-400">Giao diện</h2>
      <div className="flex gap-1 p-3">
        {OPTIONS.map((opt) => {
          const active = pref === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setTheme(opt.value)}
              aria-pressed={active}
              className={`flex flex-1 flex-col items-center gap-1 rounded-lg border py-2.5 text-xs font-medium transition ${
                active
                  ? 'border-green-500 bg-green-50 text-green-700 dark:border-green-500 dark:bg-green-900/30 dark:text-green-300'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-800'
              }`}
            >
              <opt.Icon className="h-5 w-5" />
              {opt.label}
            </button>
          )
        })}
      </div>
    </section>
  )
}
