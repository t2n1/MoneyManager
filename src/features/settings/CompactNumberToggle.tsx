// "Số rút gọn": nhãn ngắn của YÊN (trục biểu đồ, ô lịch trên mobile…) đọc theo 万/億 hay
// theo nghìn/triệu. Số đầy đủ (¥123,456) không đổi ở cả hai lựa chọn.
//
// Dáng nút giống ThemeToggle / DensityToggle / FontSizeToggle — các khối này nằm liền nhau
// và đều là "ý thích khi nhìn". Ví dụ trong nút là cùng MỘT số tiền in theo hai cách, để
// người chọn thấy ngay khác nhau ở đâu thay vì phải đọc giải thích. Số mẫu là số bịa, không
// lấy từ sổ: nó không đi qua chế độ che số nên không được là tiền thật của người dùng.
import { Card, PanelHeader } from '../../components/ui'
import { setCompactStyle, useCompactStyle, type CompactStyle } from '../../lib/compactStyle'
import { tr } from '../../i18n'

const OPTIONS: { value: CompactStyle; label: string; hint: string }[] = [
  { value: 'ja', label: '万 / 億', hint: '¥123,456 → 12.3万' },
  { value: 'vi', label: tr('nghìn / triệu'), hint: '¥123,456 → 123k' },
]

export function CompactNumberToggle() {
  const style = useCompactStyle()

  return (
    <Card as="section" elevation="panel" padding="none" className="overflow-hidden">
      <PanelHeader>{tr('Số rút gọn')}</PanelHeader>
      <div className="flex gap-1 p-3">
        {OPTIONS.map((opt) => {
          const active = style === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setCompactStyle(opt.value)}
              aria-pressed={active}
              className={`flex flex-1 flex-col items-center gap-1 rounded-md border px-2 py-2.5 text-sm font-medium transition ${
                active
                  ? 'border-accent bg-state-good-bg text-state-good-fg'
                  : 'border-border-panel text-fg-secondary hover:bg-surface-sunken'
              }`}
            >
              {opt.label}
              <span className="text-center text-2xs font-normal text-fg-on-track">{opt.hint}</span>
            </button>
          )
        })}
      </div>
    </Card>
  )
}
