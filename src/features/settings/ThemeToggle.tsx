import { BookOpen, Monitor, Moon, Sun } from 'lucide-react'
import { Card, PanelHeader } from '../../components/ui'
import type { LucideIcon } from 'lucide-react'
import { useTheme } from '../../hooks/useTheme'
import type { ThemePref } from '../../lib/theme'

const OPTIONS: { value: ThemePref; label: string; Icon: LucideIcon }[] = [
  { value: 'light', label: 'Sáng', Icon: Sun },
  { value: 'dark', label: 'Tối', Icon: Moon },
  { value: 'system', label: 'Hệ thống', Icon: Monitor },
  // Mực trên giấy xám kiểu máy đọc sách: góc vuông, không bóng, không chuyển động.
  // Không có bản tối — nên nó là một lựa chọn ngang hàng, không phải một công tắc riêng.
  { value: 'eink', label: 'E-ink', Icon: BookOpen },
]

export function ThemeToggle() {
  const { pref, setTheme } = useTheme()

  return (
    <Card as="section" elevation="panel" padding="none" className="overflow-hidden">
      <PanelHeader>Giao diện</PanelHeader>
      <div className="grid grid-cols-2 gap-1 p-3 sm:grid-cols-4">
        {OPTIONS.map((opt) => {
          const active = pref === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setTheme(opt.value)}
              aria-pressed={active}
              className={`flex flex-col items-center gap-1 rounded-md border py-2.5 text-sm font-medium transition ${
 active
 ? 'border-accent bg-state-good-bg text-state-good-fg eink:border-rule eink:bg-accent eink:text-fg-on-accent'
 : 'border-border-panel text-fg-secondary hover:bg-surface-sunken'
 }`}
            >
              <opt.Icon className="h-5 w-5" />
              {opt.label}
            </button>
          )
        })}
      </div>
    </Card>
  )
}
