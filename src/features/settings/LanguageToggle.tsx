// Ngôn ngữ giao diện. Dáng nút giống ThemeToggle / CompactNumberToggle — cùng nhóm "ý thích
// khi nhìn", riêng từng máy (localStorage).
//
// Tên mỗi ngôn ngữ viết bằng CHÍNH ngôn ngữ đó, không dịch: người lỡ chọn nhầm sang thứ
// tiếng mình không đọc được vẫn phải nhận ra đường quay về.
import { Card, PanelHeader } from '../../components/ui'
import { getLang, setLang, tr, type Lang } from '../../i18n'

const OPTIONS: { value: Lang; label: string }[] = [
  { value: 'vi', label: 'Tiếng Việt' },
  { value: 'en', label: 'English' },
]

export function LanguageToggle() {
  const lang = getLang()

  return (
    <Card as="section" elevation="panel" padding="none" className="overflow-hidden">
      <PanelHeader>{tr('Ngôn ngữ')}</PanelHeader>
      <div className="flex gap-1 p-3">
        {OPTIONS.map((opt) => {
          const active = lang === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              lang={opt.value}
              onClick={() => setLang(opt.value)}
              aria-pressed={active}
              className={`flex flex-1 items-center justify-center rounded-md border px-2 py-2.5 text-sm font-medium transition ${
                active
                  ? 'border-accent bg-state-good-bg text-state-good-fg'
                  : 'border-border-panel text-fg-secondary hover:bg-surface-sunken'
              }`}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
    </Card>
  )
}
