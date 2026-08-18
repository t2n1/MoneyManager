// Quản lý nhãn: đổi tên, đổi màu, lưu trữ, xóa. Tạo nhãn thì làm ngay trong form
// nhập giao dịch cho nhanh, nên ở đây chỉ cần một ô thêm đơn giản.
import { useState } from 'react'
import { Guide } from '../../components/Guide'
import { Archive, ArchiveRestore, Trash2 } from 'lucide-react'
import { BackLink } from '../../components/BackLink'
import {
  useCreateTag,
  useCreateTagGroup,
  useDeleteTag,
  useDeleteTagGroup,
  useRates,
  useTagGroups,
  useTags,
  useTransactionTags,
  useUpdateTag,
  useUpdateTagGroup,
} from '../../hooks/queries'
import { confirmDialog, showToast } from '../../lib/dialog'
import type { TagBudgetPeriod, TagRow } from '../../types/database.types'
import { ActionButton } from '../../components/ui/ActionButton'
import { TAG_CHIP_CLASS, TAG_COLOR_KEYS, TAG_COLOR_LABELS, tagColor } from './colors'
import { QuickSortStrip, readQuickSortDone, writeQuickSortDone } from './QuickSortStrip'

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
  const { data: groups = [] } = useTagGroups()
  const createGroup = useCreateTagGroup()
  const updateGroup = useUpdateTagGroup()
  const deleteGroup = useDeleteTagGroup()
  const [groupDraft, setGroupDraft] = useState('')
  const [groupError, setGroupError] = useState<string | null>(null)
  const [newTagGroup, setNewTagGroup] = useState<string>('')
  const [quickSortDone, setQuickSortDone] = useState(readQuickSortDone)

  const usageOf = (tagId: string) => links.filter((l) => l.tag_id === tagId).length

  const active = tags.filter((t) => !t.is_archived)
  const archived = tags.filter((t) => t.is_archived)

  /** Nhóm theo thứ tự sort_order, rồi tới mục "Khác". Chỉ nhãn CHƯA lưu trữ —
   *  nhãn đã lưu trữ giữ nguyên một khối riêng ở cuối trang, cắt ngang mọi nhóm. */
  const sections: { key: string; title: string; groupId: string | null; rows: TagRow[] }[] = [
    ...groups.map((g) => ({
      key: g.id,
      title: g.name,
      groupId: g.id,
      rows: active.filter((t) => t.group_id === g.id),
    })),
    {
      key: '__other__',
      title: 'Khác',
      groupId: null,
      rows: active.filter((t) => !t.group_id || !groups.some((g) => g.id === t.group_id)),
    },
  ]

  async function add() {
    const name = draft.trim()
    if (!name) return
    setError(null)
    try {
      await createTag.mutateAsync({
        name,
        color: TAG_COLOR_KEYS[tags.length % TAG_COLOR_KEYS.length],
        group_id: newTagGroup || null,
      })
      setDraft('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tạo được nhãn')
    }
  }

  async function addGroup() {
    const name = groupDraft.trim()
    if (!name) return
    setGroupError(null)
    try {
      await createGroup.mutateAsync({ name })
      setGroupDraft('')
    } catch (e) {
      setGroupError(e instanceof Error ? e.message : 'Không tạo được nhóm')
    }
  }

  async function removeGroup(id: string, name: string) {
    const inGroup = tags.filter((t) => t.group_id === id).length
    const ok = await confirmDialog({
      title: `Xóa nhóm "${name}"?`,
      message:
        inGroup > 0
          ? `${inGroup} nhãn đang ở nhóm này. Nhãn KHÔNG bị xóa — chúng chuyển sang mục ` +
            '"Khác", giao dịch và trần chi giữ nguyên.'
          : 'Nhóm này chưa có nhãn nào.',
      confirmLabel: 'Xóa nhóm',
      danger: true,
    })
    if (!ok) return
    await deleteGroup.mutateAsync(id)
    showToast(`Đã xóa nhóm "${name}"`)
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
          className="min-h-9 min-w-0 flex-1 rounded-md border border-transparent px-2 py-1 text-sm text-fg-primary hover:border-gray-300 dark:hover:border-gray-700"
        />
        <span className="shrink-0 text-2xs text-fg-muted">{usageOf(t.id)} giao dịch</span>
        <button
          type="button"
          onClick={() => setArchived(t.id, t.name, !t.is_archived)}
          aria-label={t.is_archived ? `Dùng lại nhãn ${t.name}` : `Lưu trữ nhãn ${t.name}`}
          title={t.is_archived ? 'Dùng lại' : 'Lưu trữ (ẩn khỏi form nhập, giữ nguyên số liệu)'}
          className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-md text-fg-muted hover:bg-surface-sunken"
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
          className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-md text-red-600 hover:bg-state-bad-bg dark:text-red-400"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      {/* Trần chi — hiện cho CẢ nhãn đã lưu trữ: chuyến đi xong rồi vẫn cần xem
          tổng cuối cùng so với dự trù, và có khi còn cần sửa lại con số dự trù. */}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className="text-xs text-fg-muted" htmlFor={`group-${t.id}`}>
          Nhóm
        </label>
        <select
          id={`group-${t.id}`}
          value={t.group_id ?? ''}
          onChange={(e) =>
            updateTag.mutate({ id: t.id, patch: { group_id: e.target.value || null } })
          }
          className="min-h-9 rounded-md border border-border-strong bg-surface px-2 py-1 text-sm text-fg-primary"
        >
          <option value="">— Khác —</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
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
          className="min-h-9 w-28 rounded-md border border-border-strong px-2 py-1 text-right text-base sm:text-sm"
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
                    ? 'bg-accent text-fg-on-accent'
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
        <BackLink to="/settings" aria-label="Quay lại" />
        <h1 className="flex-1 text-lg font-bold text-fg-primary">Nhãn</h1>
      </div>

      <Guide className="mb-3 rounded-xl bg-surface-sunken p-3 text-xs text-fg-secondary">
        Nhãn cắt ngang danh mục: một chuyến “Về VN 2026” gồm vé máy bay, quà và phong bì nằm ở ba
        danh mục khác nhau, nhưng cùng một nhãn thì cuối năm cộng được tổng chi phí cả chuyến.
        Xếp nhãn vào <b>nhóm</b> để lúc nhập đỡ phải lục: nhóm “Với ai?”, “Ở đâu?” mỗi nhóm một
        hàng chip. Xong chuyến thì <b>lưu trữ</b> nhãn: nó ẩn khỏi form nhập nhưng số liệu vẫn còn.
      </Guide>

      {!quickSortDone && <QuickSortStrip onDone={() => setQuickSortDone(true)} />}

      {/* flex-wrap + basis-*: ba control này KHÔNG vừa một hàng trên máy hẹp. Đo ở 375px:
          cần 403px trong khung 351px, nút "Thêm" — hành động chính của màn — chỉ còn thấy
          41%, ở 360px còn 19%, ở 320px mất hẳn. `flex-1` không tự co được vì min-width mặc
          định là auto, còn <select> thì rộng theo option dài nhất ("Tài sản Việt Nam"), nên
          phải có min-w-0 mới co. Cho wrap thay vì cố nhồi: hẹp (basis-full) thì ô nhập chiếm
          trọn hàng trên, select + Thêm xuống hàng dưới cạnh nhau — gom nút với ô chọn đọc
          rõ hơn là để "Thêm" đứng một mình. Từ sm (640px) trở lên gọn lại một hàng. */}
      <div className="mb-3 flex flex-wrap gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void add()
          }}
          aria-label="Tên nhãn mới"
          placeholder="Tên nhãn mới…"
          className="min-h-11 min-w-0 flex-1 basis-full rounded-md border border-border-strong px-3 py-2 text-sm sm:basis-48 dark:bg-gray-900"
        />
        <select
          value={newTagGroup}
          onChange={(e) => setNewTagGroup(e.target.value)}
          aria-label="Nhóm cho nhãn mới"
          className="min-h-11 min-w-0 flex-1 basis-28 rounded-md border border-border-strong bg-surface px-2 text-sm text-fg-primary"
        >
          <option value="">— Khác —</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={add}
          disabled={!draft.trim() || createTag.isPending}
          className="min-h-11 shrink-0 rounded-md bg-accent text-fg-on-accent px-4 text-sm font-semibold active:scale-95 disabled:opacity-40"
        >
          Thêm
        </button>
      </div>
      {error && <p className="mb-3 text-xs text-money-out">{error}</p>}

      {tags.length === 0 ? (
        // Câu chỉ đường không bọc Guide: màn rỗng thì đây là thứ duy nhất trên màn hình
        // (xem components/Guide.tsx). Màn Nhãn là chỗ thấy rõ nhất — rỗng thì cả trang
        // trống trơn, chỉ còn đúng một câu này.
        <p className="py-10 text-center text-sm text-fg-muted">
          Chưa có nhãn nào. Đặt tên nhãn ở trên rồi bấm Thêm — nhãn để gom giao dịch theo
          chuyến đi, theo người, theo dự án.
        </p>
      ) : (
        <>
          {active.length === 0 ? (
            <p className="py-6 text-center text-sm text-fg-muted">
              Mọi nhãn đang được lưu trữ. Dùng lại một nhãn để nó xuất hiện khi nhập giao dịch.
            </p>
          ) : (
            <div className="flex flex-col gap-5">
              {sections.map((s) =>
                // Mục "Khác" rỗng thì biến mất; nhóm thật thì luôn hiện, kể cả rỗng —
                // không thì nhóm vừa tạo vô hình, không rõ xếp vào đâu.
                s.groupId === null && s.rows.length === 0 ? null : (
                  <section key={s.key}>
                    <div className="mb-1 flex items-center gap-2 px-1">
                      {s.groupId ? (
                        <input
                          defaultValue={s.title}
                          onBlur={async (e) => {
                            const name = e.target.value.trim()
                            const input = e.target
                            if (name && name !== s.title) {
                              setGroupError(null)
                              try {
                                await updateGroup.mutateAsync({ id: s.groupId!, patch: { name } })
                              } catch (err) {
                                setGroupError(
                                  err instanceof Error ? err.message : 'Không đổi được tên nhóm',
                                )
                                input.value = s.title
                              }
                            } else {
                              input.value = s.title
                            }
                          }}
                          aria-label={`Tên nhóm ${s.title}`}
                          className="min-h-9 min-w-0 flex-1 rounded-md border border-transparent px-2 py-1 text-sm font-semibold text-fg-secondary hover:border-gray-300 dark:hover:border-gray-700"
                        />
                      ) : (
                        <h2 className="min-h-9 flex-1 px-2 py-1 text-sm font-semibold text-fg-secondary">
                          {s.title}
                        </h2>
                      )}
                      <span className="shrink-0 text-2xs text-fg-muted">{s.rows.length} nhãn</span>
                      {s.groupId && (
                        <button
                          type="button"
                          onClick={() => removeGroup(s.groupId!, s.title)}
                          aria-label={`Xóa nhóm ${s.title}`}
                          className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-md text-red-600 hover:bg-state-bad-bg dark:text-red-400"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    {s.rows.length === 0 ? (
                      <p className="px-2 text-xs text-fg-muted">
                        Chưa có nhãn nào trong nhóm này.
                        <Guide as="span">
                          {' '}
                          Đổi ô “Nhóm” ở một nhãn bên dưới để xếp nó vào đây.
                        </Guide>
                      </p>
                    ) : (
                      <ul className="flex flex-col gap-2">{s.rows.map(row)}</ul>
                    )}
                  </section>
                ),
              )}
            </div>
          )}

          {archived.length > 0 && (
            <section className="mt-5">
              <h2 className="mb-1 flex items-center gap-1.5 px-1 text-sm font-semibold text-fg-secondary">
                <Archive className="h-4 w-4" aria-hidden />
                Đã lưu trữ ({archived.length})
              </h2>
              <Guide className="mb-2 px-1 text-xs text-fg-muted">
                Không hiện khi nhập giao dịch nữa, nhưng vẫn còn nguyên trong Chi theo nhãn và lọc
                ở Tìm kiếm.
              </Guide>
              <ul className="flex flex-col gap-2">{archived.map(row)}</ul>
            </section>
          )}

          <section className="mt-6">
            <h2 className="mb-1 px-1 text-sm font-semibold text-fg-secondary">Nhóm nhãn</h2>
            <Guide className="mb-2 px-1 text-xs text-fg-muted">
              Nhóm là CÂU HỎI, nhãn là câu trả lời: nhóm “Với ai?” chứa “Người yêu”, “Bạn bè”.
              Khi nhập giao dịch, mỗi nhóm hiện thành một hàng chip riêng.
            </Guide>
            {quickSortDone && (
              <button
                type="button"
                onClick={() => {
                  writeQuickSortDone(false)
                  setQuickSortDone(false)
                }}
                className="mb-2 min-h-9 px-1 text-xs font-medium text-fg-accent"
              >
                Mở lại dải xếp nhãn vào nhóm
              </button>
            )}
            <div className="flex gap-2">
              <input
                value={groupDraft}
                onChange={(e) => setGroupDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void addGroup()
                }}
                aria-label="Tên nhóm mới"
                placeholder="Tên nhóm mới…"
                className="min-h-11 flex-1 rounded-md border border-border-strong px-3 py-2 text-sm dark:bg-gray-900"
              />
              <ActionButton
                variant="primary"
                onClick={addGroup}
                disabled={!groupDraft.trim() || createGroup.isPending}
              >
                Thêm nhóm
              </ActionButton>
            </div>
            {groupError && <p className="mt-2 text-xs text-money-out">{groupError}</p>}
          </section>
        </>
      )}
    </div>
  )
}
