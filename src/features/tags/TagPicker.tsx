// Chọn nhãn khi nhập/sửa giao dịch. Nhãn là thứ CẮT NGANG danh mục: một bữa ăn
// vẫn thuộc danh mục "Ăn ngoài" nhưng có thể mang nhãn "Về VN 2026" để cuối năm
// cộng được tổng chi phí cả chuyến.
import { useState } from 'react'
import { Plus, Tag as TagIcon } from 'lucide-react'
import { useCreateTag, useTags } from '../../hooks/queries'
import { TAG_CHIP_CLASS, tagColor } from './colors'

interface Props {
  /** id nhãn đang chọn */
  value: string[]
  onChange: (next: string[]) => void
}

export function TagPicker({ value, onChange }: Props) {
  const { data: tags = [] } = useTags()
  const createTag = useCreateTag()
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')

  const selected = new Set(value)
  const toggle = (id: string) =>
    onChange(selected.has(id) ? value.filter((x) => x !== id) : [...value, id])

  async function addTag() {
    const name = draft.trim()
    if (!name) {
      setAdding(false)
      return
    }
    // Gõ đúng tên nhãn đã có thì chọn luôn thay vì báo lỗi trùng
    const existing = tags.find((t) => t.name.toLowerCase() === name.toLowerCase())
    if (existing) {
      if (!selected.has(existing.id)) onChange([...value, existing.id])
    } else {
      // Xoay vòng bảng màu theo số nhãn hiện có để các nhãn không trùng màu nhau
      const palette = ['sky', 'green', 'amber', 'pink', 'indigo', 'red', 'gray']
      const created = await createTag.mutateAsync({
        name,
        color: palette[tags.length % palette.length],
      })
      onChange([...value, created.id])
    }
    setDraft('')
    setAdding(false)
  }

  return (
    <div>
      <label className="mb-1 flex items-center gap-1 text-xs font-medium text-gray-500 dark:text-gray-400">
        <TagIcon className="h-3.5 w-3.5" aria-hidden />
        Nhãn <span className="text-gray-500 dark:text-gray-400">(không bắt buộc)</span>
      </label>
      <div className="flex flex-wrap gap-1.5">
        {tags.map((t) => {
          const on = selected.has(t.id)
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => toggle(t.id)}
              aria-pressed={on}
              className={`min-h-9 rounded-full px-2.5 py-1 text-xs font-medium transition ${
                on
                  ? `${TAG_CHIP_CLASS[tagColor(t.color)]} ring-2 ring-gray-800 dark:ring-gray-200`
                  : TAG_CHIP_CLASS[tagColor(t.color)] + ' opacity-60'
              }`}
            >
              {t.name}
            </button>
          )
        })}

        {adding ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={addTag}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void addTag()
              }
              if (e.key === 'Escape') {
                setDraft('')
                setAdding(false)
              }
            }}
            placeholder="Tên nhãn mới"
            className="min-h-9 w-36 rounded-full border border-gray-300 px-2.5 py-1 text-xs outline-green-500 dark:border-gray-700 dark:bg-gray-900"
          />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex min-h-9 items-center gap-0.5 rounded-full border border-dashed border-gray-300 px-2.5 py-1 text-xs text-gray-500 dark:border-gray-600 dark:text-gray-400"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Nhãn mới
          </button>
        )}
      </div>
    </div>
  )
}
