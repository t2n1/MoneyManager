// Quản lý nhãn: đổi tên, đổi màu, xóa. Tạo nhãn thì làm ngay trong form nhập
// giao dịch cho nhanh, nên ở đây chỉ cần một ô thêm đơn giản.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, Trash2 } from 'lucide-react'
import {
  useCreateTag,
  useDeleteTag,
  useTags,
  useTransactionTags,
  useUpdateTag,
} from '../../hooks/queries'
import { confirmDialog, showToast } from '../../lib/dialog'
import { TAG_CHIP_CLASS, TAG_COLOR_KEYS, TAG_COLOR_LABELS, tagColor } from './colors'

export function TagsPage() {
  const { data: tags = [] } = useTags()
  const { data: links = [] } = useTransactionTags()
  const createTag = useCreateTag()
  const updateTag = useUpdateTag()
  const deleteTag = useDeleteTag()
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)

  const usageOf = (tagId: string) => links.filter((l) => l.tag_id === tagId).length

  async function add() {
    const name = draft.trim()
    if (!name) return
    setError(null)
    try {
      await createTag.mutateAsync({ name, color: TAG_COLOR_KEYS[tags.length % TAG_COLOR_KEYS.length] })
      setDraft('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tạo được nhãn')
    }
  }

  async function remove(id: string, name: string) {
    const used = usageOf(id)
    const ok = await confirmDialog({
      title: `Xóa nhãn "${name}"?`,
      message:
        used > 0
          ? `${used} giao dịch đang mang nhãn này. Giao dịch vẫn giữ nguyên, chỉ mất nhãn.`
          : 'Nhãn này chưa gắn với giao dịch nào.',
      confirmLabel: 'Xóa',
      danger: true,
    })
    if (!ok) return
    await deleteTag.mutateAsync(id)
    showToast(`Đã xóa nhãn "${name}"`)
  }

  return (
    <div className="p-3 lg:p-6">
      <div className="mb-3 flex items-center gap-2">
        <Link
          to="/settings"
          aria-label="Quay lại"
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-white px-3 py-1.5 shadow-sm active:scale-95 dark:bg-gray-900"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="flex-1 text-lg font-bold text-gray-800 dark:text-gray-100">Nhãn</h1>
      </div>

      <p className="mb-3 rounded-xl bg-blue-50 p-3 text-xs text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
        Nhãn cắt ngang danh mục: một chuyến “Về VN 2026” gồm vé máy bay, quà và phong bì nằm ở ba
        danh mục khác nhau, nhưng cùng một nhãn thì cuối năm cộng được tổng chi phí cả chuyến.
      </p>

      <div className="mb-3 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void add()
          }}
          placeholder="Tên nhãn mới…"
          className="min-h-11 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-green-500 dark:border-gray-700 dark:bg-gray-900"
        />
        <button
          type="button"
          onClick={add}
          disabled={!draft.trim() || createTag.isPending}
          className="min-h-11 rounded-lg bg-green-600 px-4 text-sm font-semibold text-white active:scale-95 disabled:opacity-40"
        >
          Thêm
        </button>
      </div>
      {error && <p className="mb-3 text-xs text-red-700 dark:text-red-400">{error}</p>}

      {tags.length === 0 ? (
        <p className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
          Chưa có nhãn nào.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {tags.map((t) => (
            <li key={t.id} className="rounded-xl bg-white p-3 shadow-sm dark:bg-gray-900">
              <div className="flex items-center gap-2">
                <input
                  defaultValue={t.name}
                  onBlur={(e) => {
                    const name = e.target.value.trim()
                    if (name && name !== t.name) {
                      updateTag.mutate({ id: t.id, patch: { name } })
                    } else {
                      e.target.value = t.name
                    }
                  }}
                  aria-label={`Tên nhãn ${t.name}`}
                  className="min-h-9 min-w-0 flex-1 rounded-lg border border-transparent px-2 py-1 text-sm text-gray-800 outline-green-500 hover:border-gray-300 dark:text-gray-100 dark:hover:border-gray-700"
                />
                <span className="shrink-0 text-[0.6875rem] text-gray-500 dark:text-gray-400">
                  {usageOf(t.id)} giao dịch
                </span>
                <button
                  type="button"
                  onClick={() => remove(t.id, t.name)}
                  aria-label={`Xóa nhãn ${t.name}`}
                  className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-2 flex items-center gap-2">
                {/* Xem trước nhãn thật để biết chọn màu xong trông thế nào */}
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${TAG_CHIP_CLASS[tagColor(t.color)]}`}
                >
                  {t.name}
                </span>
                <div className="flex flex-wrap gap-1">
                  {TAG_COLOR_KEYS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => updateTag.mutate({ id: t.id, patch: { color: c } })}
                      aria-label={`Đổi màu nhãn ${t.name} sang ${TAG_COLOR_LABELS[c]}`}
                      aria-pressed={tagColor(t.color) === c}
                      className="inline-flex h-9 w-7 items-center justify-center"
                    >
                      <span
                        className={`block h-5 w-5 rounded-full ${TAG_CHIP_CLASS[c]} ${
                          tagColor(t.color) === c
                            ? 'ring-2 ring-gray-800 dark:ring-gray-200'
                            : 'opacity-70'
                        }`}
                      />
                    </button>
                  ))}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
