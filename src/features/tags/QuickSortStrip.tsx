// Dải xếp nhanh nhãn cũ. Sau migration 0039 mọi nhãn đang có đều ngoài nhóm; xếp
// từng cái qua màn quản lý thì phải cuộn tìm, còn ở đây chỉ việc bấm lướt.
//
// Vì sao có nút "Xong": "để ở Khác" và "chưa xem tới" là CÙNG một giá trị trong DB
// (group_id = null), nên app không tự biết lúc nào anh xếp xong. `skipped` lo trong
// phiên, còn "Xong" là lời tuyên bố dứt điểm, nhớ theo thiết bị.
import { useMemo, useState } from 'react'
import { Guide } from '../../components/Guide'
import { Check, X } from 'lucide-react'
import { useTagGroups, useTags, useTransactionTags, useUpdateTag } from '../../hooks/queries'
import { ungroupedQueue } from './groups'
import { TAG_CHIP_CLASS, tagColor } from './colors'
import { SectionTitle, actionButtonClass } from '../../components/ui'

export const QUICK_SORT_KEY = 'sct-tag-quicksort-done'

/** Đọc trong hàm chứ không ở cấp module: import file này không được chạm localStorage. */
export function readQuickSortDone(): boolean {
  try {
    return localStorage.getItem(QUICK_SORT_KEY) === '1'
  } catch {
    return false
  }
}

export function writeQuickSortDone(done: boolean): void {
  try {
    if (done) localStorage.setItem(QUICK_SORT_KEY, '1')
    else localStorage.removeItem(QUICK_SORT_KEY)
  } catch {
    // bỏ qua
  }
}

export function QuickSortStrip({ onDone }: { onDone: () => void }) {
  const { data: tags = [] } = useTags()
  const { data: groups = [] } = useTagGroups()
  const { data: links = [] } = useTransactionTags()
  const updateTag = useUpdateTag()
  const [skipped, setSkipped] = useState<string[]>([])

  const queue = useMemo(() => ungroupedQueue(tags, groups, skipped), [tags, groups, skipped])
  const current = queue[0]

  // Hết hàng đợi, hoặc chưa có nhóm nào để xếp vào → không có gì để hỏi.
  if (!current || groups.length === 0) return null

  const used = links.filter((l) => l.tag_id === current.id).length

  return (
    <section className="mb-3 rounded-xl border border-green-200 bg-state-good-bg p-3 dark:border-green-900">
      <div className="mb-2 flex items-center justify-between gap-2">
        <SectionTitle>Xếp nhãn vào nhóm</SectionTitle>
        <span className="text-2xs text-fg-muted">còn {queue.length}</span>
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full px-2.5 py-1 text-sm font-medium ${TAG_CHIP_CLASS[tagColor(current.color)]}`}
        >
          {current.name}
        </span>
        <span className="text-sm text-fg-muted">{used} giao dịch</span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {groups.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => updateTag.mutate({ id: current.id, patch: { group_id: g.id } })}
            className={actionButtonClass('primary')}
          >
            {g.name}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setSkipped((s) => [...s, current.id])}
          className="min-h-9 rounded-md border border-border-strong px-3 text-sm font-medium text-fg-secondary"
        >
          Để ở Khác
        </button>
        <button
          type="button"
          onClick={() => {
            writeQuickSortDone(true)
            onDone()
          }}
          className="inline-flex min-h-9 items-center gap-1 rounded-md px-3 text-sm font-medium text-fg-muted"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
          Xong
        </button>
      </div>

      <Guide className="mt-2 flex items-center gap-1 text-2xs text-fg-muted">
        <Check className="h-3 w-3" aria-hidden />
        Xếp xong nhãn nào thì nhãn đó biến khỏi dải. Bấm “Xong” để ẩn hẳn.
      </Guide>
    </section>
  )
}
