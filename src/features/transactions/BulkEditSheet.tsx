// Sửa hàng loạt (§4.2 mục 4): chọn nhiều khoản rồi đổi danh mục / gắn nhãn trong MỘT
// lần. Trước đây chọn nhiều chỉ xoá được — mà việc thường gặp nhất sau khi nhập một loạt
// từ sao kê là "gắn hết chỗ này vào Đi lại", không phải xoá.
//
// Hai thao tác cố ý KHÁC NHAU về ngữ nghĩa:
//   · Danh mục THAY THẾ — một giao dịch chỉ có một danh mục.
//   · Nhãn GẮN THÊM — nhãn là nhiều-nhiều, và người dùng đang gắn một nhãn CHUNG cho cả
//     nhóm; xoá nhãn riêng của từng khoản là mất dữ liệu họ không hề yêu cầu.
// Sự khác nhau đó nằm ở tầng repo (setTransactionsCategory vs addTagToTransactions), ở
// đây chỉ nói ra bằng chữ trên nút.
import { useState } from 'react'
import { ActionButton, EmptyState, SectionTitle } from '../../components/ui'
import { showToast } from '../../lib/dialog'
import { useAddTagToTransactions, useSetTransactionsCategory } from '../../hooks/queries'
import type { CategoryRow, TagRow } from '../../types/database.types'
import { TAG_CHIP_CLASS, tagColor } from '../tags/colors'

interface Props {
  ids: string[]
  categories: CategoryRow[]
  tags: TagRow[]
  onClose: () => void
  /** Gọi sau khi ghi xong — nơi gọi thoát chế độ chọn. */
  onDone: () => void
}

export function BulkEditSheet({ ids, categories, tags, onClose, onDone }: Props) {
  const [tab, setTab] = useState<'category' | 'tag'>('category')
  const setCategory = useSetTransactionsCategory()
  const addTag = useAddTagToTransactions()
  const busy = setCategory.isPending || addTag.isPending

  // Chỉ danh mục LÁ: gắn vào danh mục cha là tạo ra khoản chi "thuộc nhóm nhưng không
  // thuộc mục nào", đúng thứ bảng trần-nhóm của Ngân sách không xếp được vào đâu.
  const leaves = categories.filter(
    (c) => c.type !== 'income' && !c.is_archived && !categories.some((x) => x.parent_id === c.id),
  )
  const parentName = (c: CategoryRow) =>
    c.parent_id ? (categories.find((p) => p.id === c.parent_id)?.name ?? '') : ''

  async function apply(fn: () => Promise<unknown>, msg: string) {
    await fn()
    showToast(msg)
    onDone()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 sm:items-center animate-overlay-in">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Sửa ${ids.length} giao dịch đã chọn`}
        className="flex max-h-[80dvh] w-full max-w-lg flex-col rounded-t-2xl border border-border-panel bg-surface p-4 sm:rounded-xl animate-sheet-in sm:animate-sheet-pop"
      >
        <div className="flex items-baseline justify-between gap-2">
          <SectionTitle>
            Sửa {ids.length} giao dịch
          </SectionTitle>
          <ActionButton onClick={onClose}>Đóng</ActionButton>
        </div>

        <div className="mt-3 flex gap-1.5">
          <ActionButton
            onClick={() => setTab('category')}
            variant={tab === 'category' ? 'primary' : 'outline'}
          >
            Đổi danh mục
          </ActionButton>
          <ActionButton onClick={() => setTab('tag')} variant={tab === 'tag' ? 'primary' : 'outline'}>
            Gắn nhãn
          </ActionButton>
        </div>

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
          {tab === 'category' ? (
            leaves.length === 0 ? (
              <EmptyState compact>
                Chưa có danh mục chi nào.
              </EmptyState>
            ) : (
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {leaves.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      apply(
                        () => setCategory.mutateAsync({ ids, categoryId: c.id }),
                        `Đã chuyển ${ids.length} khoản sang ${c.name}`,
                      )
                    }
                    className="flex min-h-11 items-center gap-2 rounded-md border border-border-strong px-2.5 py-2 text-left text-sm text-fg-secondary transition hover:bg-surface-sunken disabled:opacity-50"
                  >
                    <span aria-hidden>{c.icon}</span>
                    <span className="min-w-0 flex-1 truncate">
                      {c.name}
                      {parentName(c) && (
                        <span className="block truncate text-2xs text-fg-muted">
                          {parentName(c)}
                        </span>
                      )}
                    </span>
                  </button>
                ))}
              </div>
            )
          ) : tags.length === 0 ? (
            <EmptyState compact>Chưa có nhãn nào.</EmptyState>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    apply(
                      () => addTag.mutateAsync({ ids, tagId: t.id }),
                      `Đã gắn nhãn ${t.name} cho ${ids.length} khoản`,
                    )
                  }
                  className={`min-h-11 rounded-full px-3 text-sm font-medium transition disabled:opacity-50 ${TAG_CHIP_CLASS[tagColor(t.color)]}`}
                >
                  {t.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
