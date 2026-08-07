// Quản lý nhãn: đổi tên, đổi màu, lưu trữ, xóa. Tạo nhãn thì làm ngay trong form
// nhập giao dịch cho nhanh, nên ở đây chỉ cần một ô thêm đơn giản.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Archive, ArchiveRestore, ChevronLeft, Trash2 } from 'lucide-react'
import {
  useCreateTag,
  useDeleteTag,
  useRates,
  useTags,
  useTransactionTags,
  useUpdateTag,
} from '../../hooks/queries'
import { confirmDialog, showToast } from '../../lib/dialog'
import type { TagBudgetPeriod, TagRow } from '../../types/database.types'
import { TAG_CHIP_CLASS, TAG_COLOR_KEYS, TAG_COLOR_LABELS, tagColor } from './colors'

/** Hai kiểu kỳ của trần nhãn — xem migration 0036. */
const PERIODS: readonly (readonly [TagBudgetPeriod, string, string])[] = [
  ['total', 'Cả đợt', 'Trần cho toàn bộ đời nhãn, không reset — hợp với nhãn theo dịp'],
  ['monthly', 'Mỗi tháng', 'Trần cho từng tháng, hết tháng reset — hợp với nhãn lặp đều'],
]

export function TagsPage() {
  const { data: tags = [] } = useTags()
  const { base } = useRates()
  const { data: links = [] } = useTransactionTags()
  const createTag = useCreateTag()
  const updateTag = useUpdateTag()
  const deleteTag = useDeleteTag()
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)

  const usageOf = (tagId: string) => links.filter((l) => l.tag_id === tagId).length

  const active = tags.filter((t) => !t.is_archived)
  const archived = tags.filter((t) => t.is_archived)

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
          ? `${used} giao dịch đang mang nhãn này. Giao dịch vẫn giữ nguyên, nhưng MẤT nhãn — ` +
            'tổng chi theo nhãn này sẽ không còn cộng được. Chỉ muốn dẹp nó khỏi form nhập thì ' +
            'bấm Lưu trữ thay vì Xóa.'
          : 'Nhãn này chưa gắn với giao dịch nào.',
      confirmLabel: 'Xóa',
      danger: true,
    })
    if (!ok) return
    await deleteTag.mutateAsync(id)
    showToast(`Đã xóa nhãn "${name}"`)
  }

  function setArchived(id: string, name: string, is_archived: boolean) {
    updateTag.mutate({ id, patch: { is_archived } })
    showToast(is_archived ? `Đã lưu trữ nhãn "${name}"` : `Đã dùng lại nhãn "${name}"`)
  }

  /**
   * Lưu trần chi. Ô rỗng (hoặc số ≤ 0) = BỎ trần, không phải "trần bằng 0" —
   * trần 0 nghĩa là cấm tiêu, chẳng ai đặt, mà gõ nhầm rồi xoá đi là chuyện thường.
   */
  function saveBudget(t: TagRow, raw: string) {
    const digits = raw.replace(/[^\d]/g, '')
    const next = digits === '' ? null : Number(digits)
    const value = next != null && next > 0 ? next : null
    if (value === t.budget_amount) return
    updateTag.mutate({ id: t.id, patch: { budget_amount: value } })
  }

  /** Một dòng nhãn. Nhãn đã lưu trữ bỏ hàng chọn màu — nó không còn xuất hiện khi nhập. */
  const row = (t: (typeof tags)[number]) => (
    <li
      key={t.id}
      className={`rounded-xl bg-surface p-3 shadow-sm ${t.is_archived ? 'opacity-75' : ''}`}
    >
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
        <span className="shrink-0 text-2xs text-fg-muted">{usageOf(t.id)} giao dịch</span>
        <button
          type="button"
          onClick={() => setArchived(t.id, t.name, !t.is_archived)}
          aria-label={t.is_archived ? `Dùng lại nhãn ${t.name}` : `Lưu trữ nhãn ${t.name}`}
          title={t.is_archived ? 'Dùng lại' : 'Lưu trữ (ẩn khỏi form nhập, giữ nguyên số liệu)'}
          className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg text-fg-muted hover:bg-surface-sunken"
        >
          {t.is_archived ? (
            <ArchiveRestore className="h-4 w-4" />
          ) : (
            <Archive className="h-4 w-4" />
          )}
        </button>
        <button
          type="button"
          onClick={() => remove(t.id, t.name)}
          aria-label={`Xóa nhãn ${t.name}`}
          className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/30"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      {/* Trần chi — hiện cho CẢ nhãn đã lưu trữ: chuyến đi xong rồi vẫn cần xem
          tổng cuối cùng so với dự trù, và có khi còn cần sửa lại con số dự trù. */}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className="text-xs text-fg-muted" htmlFor={`budget-${t.id}`}>
          Trần chi
        </label>
        <input
          id={`budget-${t.id}`}
          inputMode="numeric"
          defaultValue={t.budget_amount != null ? String(t.budget_amount) : ''}
          onBlur={(e) => saveBudget(t, e.target.value)}
          placeholder="không đặt"
          // text-base (16px) để Safari iOS không phóng to trang khi bấm vào ô
          className="min-h-9 w-28 rounded-lg border border-border-strong px-2 py-1 text-right text-base outline-green-500 sm:text-sm"
        />
        <span className="text-xs text-fg-muted">{base}</span>
        {t.budget_amount != null && (
          <div className="flex overflow-hidden rounded-lg border border-border-strong">
            {PERIODS.map(([value, label, title]) => (
              <button
                key={value}
                type="button"
                title={title}
                onClick={() => updateTag.mutate({ id: t.id, patch: { budget_period: value } })}
                aria-pressed={t.budget_period === value}
                className={`min-h-9 px-2 text-xs font-medium ${
                  t.budget_period === value
                    ? 'bg-green-700 text-white'
                    : 'text-fg-secondary hover:bg-surface-sunken'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {!t.is_archived && (
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
      )}
    </li>
  )

  return (
    <div className="p-3 lg:p-6">
      <div className="mb-3 flex items-center gap-2">
        <Link
          to="/settings"
          aria-label="Quay lại"
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-surface px-3 py-1.5 shadow-sm active:scale-95 "
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="flex-1 text-lg font-bold text-fg-primary">Nhãn</h1>
      </div>

      <p className="mb-3 rounded-xl bg-blue-50 p-3 text-xs text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
        Nhãn cắt ngang danh mục: một chuyến “Về VN 2026” gồm vé máy bay, quà và phong bì nằm ở ba
        danh mục khác nhau, nhưng cùng một nhãn thì cuối năm cộng được tổng chi phí cả chuyến.
        Xong chuyến thì <b>lưu trữ</b> nhãn: nó ẩn khỏi form nhập nhưng số liệu vẫn còn.
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
          className="min-h-11 rounded-lg bg-green-700 px-4 text-sm font-semibold text-white active:scale-95 disabled:opacity-40"
        >
          Thêm
        </button>
      </div>
      {error && <p className="mb-3 text-xs text-money-out">{error}</p>}

      {tags.length === 0 ? (
        <p className="py-10 text-center text-sm text-fg-muted">
          Chưa có nhãn nào.
        </p>
      ) : (
        <>
          {active.length === 0 ? (
            <p className="py-6 text-center text-sm text-fg-muted">
              Mọi nhãn đang được lưu trữ. Dùng lại một nhãn để nó xuất hiện khi nhập giao dịch.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">{active.map(row)}</ul>
          )}

          {archived.length > 0 && (
            <section className="mt-5">
              <h2 className="mb-1 flex items-center gap-1.5 px-1 text-sm font-semibold text-fg-secondary">
                <Archive className="h-4 w-4" aria-hidden />
                Đã lưu trữ ({archived.length})
              </h2>
              <p className="mb-2 px-1 text-xs text-fg-muted">
                Không hiện khi nhập giao dịch nữa, nhưng vẫn còn nguyên trong Chi theo nhãn và lọc
                ở Tìm kiếm.
              </p>
              <ul className="flex flex-col gap-2">{archived.map(row)}</ul>
            </section>
          )}
        </>
      )}
    </div>
  )
}
