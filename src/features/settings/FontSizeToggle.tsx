import { useFontScale } from '../../hooks/useFontScale'
import type { FontScalePref } from '../../lib/fontScale'

// Cỡ chữ chữ "A" trên nút cố định theo px để mẫu thử không đổi khi đổi cỡ chữ,
// nhờ vậy 4 nút luôn cho thấy đúng thứ tự Nhỏ → Rất lớn.
const OPTIONS: { value: FontScalePref; label: string; px: number }[] = [
  { value: 'sm', label: 'Nhỏ', px: 13 },
  { value: 'md', label: 'Vừa', px: 15 },
  { value: 'lg', label: 'Lớn', px: 17 },
  { value: 'xl', label: 'Rất lớn', px: 20 },
]

export function FontSizeToggle() {
  const { pref, setFontScale } = useFontScale()

  return (
    <section className="overflow-hidden rounded-xl bg-surface shadow-sm ">
      <h2 className="px-3 pt-3 text-sm font-semibold text-fg-muted">Cỡ chữ</h2>
      <div className="flex gap-1 p-3">
        {OPTIONS.map((opt) => {
          const active = pref === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setFontScale(opt.value)}
              aria-pressed={active}
              className={`flex flex-1 flex-col items-center justify-end gap-1 rounded-lg border py-2.5 text-xs font-medium transition ${
                active
                  ? 'border-green-500 bg-green-50 text-green-700 dark:border-green-500 dark:bg-green-900/30 dark:text-green-300'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-800'
              }`}
            >
              <span
                aria-hidden
                className="flex h-6 items-end font-semibold leading-none"
                style={{ fontSize: `${opt.px}px` }}
              >
                A
              </span>
              {opt.label}
            </button>
          )
        })}
      </div>
      <p className="px-3 pb-3 text-xs text-fg-muted">
        Áp dụng cho toàn bộ app. Chọn cỡ lớn sẽ hiển thị ít nội dung hơn trên mỗi màn hình.
      </p>
    </section>
  )
}
