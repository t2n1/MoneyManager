// Chọn nhãn khi nhập/sửa giao dịch. Nhãn là thứ CẮT NGANG danh mục: một bữa ăn
// vẫn thuộc danh mục "Ăn ngoài" nhưng có thể mang nhãn "Về VN 2026" để cuối năm
// cộng được tổng chi phí cả chuyến.
//
// Nhãn theo dịp/dự án chỉ tăng theo thời gian, nên khối này KHÔNG vẽ hết. Đo trên
// 375×812: 40 nhãn vẽ thẳng thành 11 hàng chip cao 476px, gần bằng cả vùng cuộn
// của form (514px). Ở đây chỉ hiện vài nhãn dùng nhiều nhất + nhãn đang chọn, còn
// lại nằm sau nút "Tất cả" kèm ô tìm. Xếp hạng nằm trong `pickerTags`.
import { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, Plus, Search, Tag as TagIcon } from 'lucide-react'
import { useCreateTag, useTags, useTransactionTags, useUpdateTag } from '../../hooks/queries'
import { normalizeText } from '../transactions/filter'
import type { TagRow } from '../../types/database.types'
import { pickerTags } from './aggregate'
import { TAG_CHIP_CLASS, tagColor } from './colors'

/** Số nhãn hiện thẳng khi chưa mở "Tất cả" — vừa 2 hàng chip trên màn hẹp nhất. */
const COLLAPSED_LIMIT = 8

interface Props {
  /** id nhãn đang chọn */
  value: string[]
  onChange: (next: string[]) => void
}

export function TagPicker({ value, onChange }: Props) {
  const { data: tags = [] } = useTags()
  const { data: links = [] } = useTransactionTags()
  const createTag = useCreateTag()
  const updateTag = useUpdateTag()
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [query, setQuery] = useState('')

  const selected = new Set(value)
  const toggle = (id: string) =>
    onChange(selected.has(id) ? value.filter((x) => x !== id) : [...value, id])

  const { shown, rest } = useMemo(
    () => pickerTags(tags, links, value, COLLAPSED_LIMIT),
    [tags, links, value],
  )
  const total = shown.length + rest.length

  // Mở "Tất cả" thì tìm được theo tên, bỏ dấu (dùng lại normalizeText của Tìm kiếm)
  const needle = normalizeText(query)
  const visible = useMemo(() => {
    const all = expanded ? [...shown, ...rest] : shown
    return needle ? all.filter((t) => normalizeText(t.name).includes(needle)) : all
  }, [expanded, shown, rest, needle])

  async function addTag() {
    const name = draft.trim()
    if (!name) {
      setAdding(false)
      return
    }
    // Gõ đúng tên nhãn đã có thì chọn luôn thay vì báo lỗi trùng
    const existing = tags.find((t) => t.name.toLowerCase() === name.toLowerCase())
    if (existing) {
      // Dùng lại một nhãn đã lưu trữ = nó sống lại, không thì chip vừa chọn sẽ
      // biến mất khỏi ô chọn ở lần nhập sau mà không rõ vì sao.
      if (existing.is_archived) updateTag.mutate({ id: existing.id, patch: { is_archived: false } })
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

  const chip = (t: TagRow) => {
    const on = selected.has(t.id)
    return (
      <button
        key={t.id}
        type="button"
        onClick={() => toggle(t.id)}
        aria-pressed={on}
        className={`min-h-9 max-w-full truncate rounded-full px-2.5 py-1 text-xs font-medium transition ${
          on
            ? `${TAG_CHIP_CLASS[tagColor(t.color)]} ring-2 ring-gray-800 dark:ring-gray-200`
            : TAG_CHIP_CLASS[tagColor(t.color)] + ' opacity-60'
        }`}
      >
        {t.name}
      </button>
    )
  }

  return (
    <div>
      <label className="mb-1 flex items-center gap-1 text-xs font-medium text-fg-muted">
        <TagIcon className="h-3.5 w-3.5" aria-hidden />
        Nhãn <span className="text-fg-muted">(không bắt buộc)</span>
      </label>

      {expanded && total > COLLAPSED_LIMIT && (
        <div className="mb-1.5 flex items-center gap-1.5 rounded-lg border border-border-strong bg-surface px-2 focus-within:ring-2 focus-within:ring-green-500">
          <Search className="h-3.5 w-3.5 shrink-0 text-fg-muted" aria-hidden />
          {/* Không autoFocus: mở "Tất cả" để LƯỚT là chuyện thường, bàn phím tự bật
              lên che mất danh sách vừa mở thì hại hơn lợi. */}
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Tìm trong ${total} nhãn…`}
            aria-label="Tìm nhãn"
            className="min-h-9 min-w-0 flex-1 bg-transparent py-1 text-sm outline-none"
          />
        </div>
      )}

      {/* Mở rộng thì cho khối nhãn cuộn riêng, đừng đẩy dài vô hạn vùng cuộn của form */}
      <div className={`flex flex-wrap gap-1.5 ${expanded ? 'max-h-56 overflow-y-auto' : ''}`}>
        {visible.map(chip)}

        {needle && visible.length === 0 && (
          <p className="py-1 text-xs text-fg-muted">Không có nhãn nào khớp “{query}”</p>
        )}

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

        {(rest.length > 0 || expanded) && (
          <button
            type="button"
            onClick={() => {
              setExpanded((e) => !e)
              setQuery('')
            }}
            aria-expanded={expanded}
            className="inline-flex min-h-9 items-center gap-0.5 rounded-full px-2.5 py-1 text-xs font-medium text-green-700 dark:text-green-400"
          >
            {expanded ? (
              <>
                Thu gọn <ChevronUp className="h-3.5 w-3.5" aria-hidden />
              </>
            ) : (
              <>
                Tất cả ({total}) <ChevronDown className="h-3.5 w-3.5" aria-hidden />
              </>
            )}
          </button>
        )}
      </div>
    </div>
  )
}
