// Chọn nhãn khi nhập/sửa giao dịch. Nhãn là thứ CẮT NGANG danh mục: một bữa ăn
// vẫn thuộc danh mục "Ăn ngoài" nhưng có thể mang nhãn "Về VN 2026" để cuối năm
// cộng được tổng chi phí cả chuyến.
//
// Nhãn xếp theo NHÓM (migration 0039): mỗi nhóm là một câu hỏi — "Với ai?",
// "Ở đâu?" — và một hàng chip riêng, thay vì đổ tất cả thành một mớ phẳng bắt
// mắt tự phân loại. Nhãn ngoài nhóm nằm ở mục "Khác" cuối cùng.
//
// Nhãn theo dịp/dự án chỉ tăng theo thời gian, nên khối này KHÔNG vẽ hết. Đo trên
// 375×812: 40 nhãn vẽ thẳng thành 11 hàng chip cao 476px, gần bằng cả vùng cuộn
// của form (514px). Ở đây mỗi nhóm chỉ hiện vài nhãn dùng nhiều nhất + nhãn đang
// chọn, còn lại nằm sau nút "Tất cả" kèm ô tìm. Xếp hạng nằm trong `pickerSections`.
import { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, Plus, Search, Tag as TagIcon } from 'lucide-react'
import {
  useCreateTag,
  useTagGroups,
  useTags,
  useTransactionTags,
  useUpdateTag,
} from '../../hooks/queries'
import { normalizeText } from '../transactions/filter'
import type { TagRow } from '../../types/database.types'
import { pickerSections } from './groups'
import { TAG_CHIP_CLASS, tagColor } from './colors'

/**
 * Số nhãn hiện thẳng trong MỖI mục khi chưa mở "Tất cả".
 *
 * 3 chứ không phải 8 như hồi nhãn phẳng: nay có tới ba mục (Với ai? · Ở đâu? ·
 * Khác), mỗi mục thêm một tiêu đề, nên cùng một con số sẽ nhân lên ba lần chiều
 * cao. Đo trên 375×812 với 2 nhóm ("Ở đâu?", "Với ai?") + mục Khác, mỗi mục 3
 * nhãn (demo): khối "Nhãn" cao 204px — trong ngưỡng 260px, giữ nguyên 3.
 */
const COLLAPSED_LIMIT = 3

interface Props {
  /** id nhãn đang chọn */
  value: string[]
  onChange: (next: string[]) => void
}

export function TagPicker({ value, onChange }: Props) {
  const { data: tags = [] } = useTags()
  const { data: groups = [] } = useTagGroups()
  const { data: links = [] } = useTransactionTags()
  const createTag = useCreateTag()
  const updateTag = useUpdateTag()
  /** null = không mở ô thêm; string = đang thêm vào nhóm đó ('' = mục Khác) */
  const [addingIn, setAddingIn] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [query, setQuery] = useState('')

  const selected = new Set(value)
  const toggle = (id: string) =>
    onChange(selected.has(id) ? value.filter((x) => x !== id) : [...value, id])

  const sections = useMemo(
    () => pickerSections(tags, groups, links, value, COLLAPSED_LIMIT),
    [tags, groups, links, value],
  )
  const total = sections.reduce((n, s) => n + s.shown.length + s.rest.length, 0)
  const hasRest = sections.some((s) => s.rest.length > 0)

  // Mở "Tất cả" thì tìm được theo tên, bỏ dấu (dùng lại normalizeText của Tìm kiếm).
  // Tìm xuyên mọi mục, nhưng kết quả vẫn nằm đúng mục của nó — mục nào không còn
  // nhãn nào khớp thì ẩn cả tiêu đề, không để lại hàng trống.
  const needle = normalizeText(query)
  const visible = useMemo(
    () =>
      sections
        .map((s) => {
          const all = expanded ? [...s.shown, ...s.rest] : s.shown
          return {
            ...s,
            list: needle ? all.filter((t) => normalizeText(t.name).includes(needle)) : all,
          }
        })
        .filter((s) => !needle || s.list.length > 0),
    [sections, expanded, needle],
  )

  async function addTag(groupId: string) {
    const name = draft.trim()
    if (!name) {
      setAddingIn(null)
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
        // Tạo ngay trong mục đang đứng: nhãn mới sinh ra đã đúng chỗ, không đẻ
        // thêm việc "vào Cài đặt xếp lại sau".
        group_id: groupId || null,
      })
      onChange([...value, created.id])
    }
    setDraft('')
    setAddingIn(null)
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

      {/* Mở rộng thì cho cả khối cuộn riêng, đừng đẩy dài vô hạn vùng cuộn của form */}
      <div className={`flex flex-col gap-2 ${expanded ? 'max-h-56 overflow-y-auto' : ''}`}>
        {visible.map((s) => {
          const groupId = s.group?.id ?? ''
          return (
            <div key={s.group?.id ?? '__other__'}>
              <p className="mb-1 text-2xs font-semibold text-fg-muted">
                {s.group?.name ?? 'Khác'}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {s.list.map(chip)}

                {addingIn === groupId ? (
                  <input
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => void addTag(groupId)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        void addTag(groupId)
                      }
                      if (e.key === 'Escape') {
                        // Chặn để sheet mẹ (useEscClose) không đóng theo khi chỉ
                        // muốn hủy ô nhãn
                        e.preventDefault()
                        setDraft('')
                        setAddingIn(null)
                      }
                    }}
                    placeholder="Tên nhãn mới"
                    className="min-h-9 w-36 rounded-full border border-gray-300 px-2.5 py-1 text-xs outline-green-500 dark:border-gray-700 dark:bg-gray-900"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setDraft('')
                      setAddingIn(groupId)
                    }}
                    aria-label={s.group ? `Thêm nhãn vào nhóm ${s.group.name}` : 'Thêm nhãn mục Khác'}
                    className="inline-flex min-h-9 items-center gap-0.5 rounded-full border border-dashed border-gray-300 px-2.5 py-1 text-xs text-fg-muted dark:border-gray-600"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden />
                    mới
                  </button>
                )}
              </div>
            </div>
          )
        })}

        {needle && visible.length === 0 && (
          <p className="py-1 text-xs text-fg-muted">Không có nhãn nào khớp “{query}”</p>
        )}
      </div>

      {(hasRest || expanded) && (
        <button
          type="button"
          onClick={() => {
            setExpanded((e) => !e)
            setQuery('')
          }}
          aria-expanded={expanded}
          className="mt-1 inline-flex min-h-9 items-center gap-0.5 rounded-full px-2.5 py-1 text-xs font-medium text-green-700 dark:text-green-400"
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
  )
}
