// Tài khoản — danh sách, sắp thứ tự, và form thêm/sửa.
//
// ---- Vì sao vẽ lại phần DANH SÁCH (redesign 2026-08-30) -----------------------------
//
// Mỗi dòng trước đây xếp DỌC: tên ở trên, "số dư · loại tiền" ở dưới, và một nút chữ
// "Lưu trữ" ở tít mép phải. Ở 1440px, cột số dư nằm ngay dưới cái tên trong khi bên phải
// còn cả một khoảng trống bằng nửa màn hình — cùng bệnh đã chữa ở Nhóm tài sản và Nhãn.
//
// Nay một dòng là một HÀNG: tên · số dư · loại tiền · nút. Số dư về đúng một cột, nên
// đọc dọc so được các tài khoản với nhau — thứ mà bản xếp dọc không cho làm. Dưới `lg`
// vẫn xuống dòng như cũ (ở 375px bốn cột không vừa).
import { useState } from 'react'
import { Guide } from '../../components/Guide'
import { ChevronDown, ChevronUp, GripVertical, Plus } from 'lucide-react'
import { needsLiquidityAnswer } from '../assets/liquidity'
import { AccountTypeIcon } from '../../components/icons'
import { DragList } from '../../components/DragList'
import {
  useAccountBalances,
  useAccounts,
  useReorderAccounts,
  useUpdateAccount,
} from '../../hooks/queries'
import { formatMoney } from '../../lib/money'
import type { AccountRow } from '../../types/database.types'
import { groupAccountsByType, type CurrencyTotal } from './groupByType'
import { AccountFormSheet } from './AccountFormSheet'
import {
  ActionButton,
  Card,
  EmptyState,
  Money,
  PageHeader,
  PanelHeader,
  actionButtonClass,
} from '../../components/ui'

// Điện thoại: tên + chip ở trên, số dư xuống dòng. Từ `lg`: bốn cột một hàng.
// `grid` KHÔNG nằm trong hằng số — `hidden` và `grid` cùng là tiện ích display, cái nào
// thắng do thứ tự trong CSS chứ không do thứ tự trong chuỗi.
// rem chứ px (§13): cột số dư chứa CHỮ SỐ, cỡ chữ "Rất lớn" mà cột đứng yên là số bị cắt.
const ROW_GRID =
  'grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 ' +
  'lg:grid-cols-[auto_minmax(0,1fr)_minmax(7rem,auto)_3rem_auto]'

/** Ghép tổng theo loại tiền thành chuỗi hiển thị: "¥545,860" hoặc "¥X · ₫Y". */
function formatTotals(totals: CurrencyTotal[]): string {
  return totals.map((t) => formatMoney(t.total, t.currency)).join(' · ')
}

export function AccountsPage() {
  const { data: accounts = [] } = useAccounts()
  const { data: balances = [] } = useAccountBalances()
  const reorder = useReorderAccounts()
  const update = useUpdateAccount()
  const [editing, setEditing] = useState<AccountRow | 'new' | null>(null)
  const [showArchived, setShowArchived] = useState(false)

  const sorted = [...accounts].sort((a, b) => a.sort_order - b.sort_order)
  const active = sorted.filter((a) => !a.is_archived)
  const archived = sorted.filter((a) => a.is_archived)
  const balanceOf = (id: string) => balances.find((b) => b.id === id)?.balance ?? 0
  const groups = groupAccountsByType(active, balanceOf)
  const accountById = new Map(active.map((a) => [a.id, a]))

  // Sắp lại thứ tự tài khoản TRONG một loại (kéo–thả): chỉ hoán vị các thành viên
  // của loại đó giữa những chỗ chúng đang chiếm trong thứ tự toàn cục (theo
  // sort_order), giữ nguyên vị trí mọi tài khoản khác. Lưu trữ luôn ở cuối.
  function reorderGroup(newGroupIds: string[]) {
    const member = new Set(newGroupIds)
    const queue = [...newGroupIds]
    const globalIds = active.map((a) => (member.has(a.id) ? queue.shift()! : a.id))
    reorder.mutate([...globalIds, ...archived.map((a) => a.id)])
  }

  return (
    <div className="p-3 lg:p-6">
      <PageHeader title="Tài khoản" back="/settings">
        <button
          type="button"
          onClick={() => setEditing('new')}
          className={actionButtonClass('primary')}
        >
          <Plus className="h-4 w-4" /> Thêm
        </button>
      </PageHeader>

      {active.length > 0 && (
        <Guide className="mb-3 rounded-xl bg-surface-sunken p-3 text-sm text-fg-secondary">
          Nhấn giữ biểu tượng <b>⁚⁚</b> rồi kéo–thả để sắp thứ tự tài khoản trong cùng một
          loại. Muốn đổi sang loại khác thì mở tài khoản và chỉnh mục <b>Loại</b>.
        </Guide>
      )}

      {active.length === 0 && (
        <Card padding="none" className="overflow-hidden">
          <EmptyState compact>Chưa có tài khoản</EmptyState>
        </Card>
      )}

      {groups.map((g) => (
        <div key={g.type} className="mb-3">
          <Card elevation="panel" padding="none" className="overflow-hidden">
            <PanelHeader right={formatTotals(g.totalsByCurrency)}>{g.label}</PanelHeader>
            <DragList
              className="divide-y divide-border-subtle"
              ids={g.accounts.map((a) => a.id)}
              onReorder={reorderGroup}
              render={(id, handle, dragging) => {
                const a = accountById.get(id)
                if (!a) return null
                return (
                  <div
                    className={`grid ${ROW_GRID} px-3 py-1.5 ${
                      dragging ? 'bg-surface-sunken' : ''
                    }`}
                  >
                    <button
                      type="button"
                      {...handle}
                      className="inline-flex min-h-11 w-5 shrink-0 cursor-grab touch-none items-center justify-center text-fg-muted active:cursor-grabbing"
                      aria-label={`Kéo để sắp thứ tự ${a.name}`}
                    >
                      <GripVertical className="h-4 w-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => setEditing(a)}
                      className="flex min-h-11 min-w-0 flex-col justify-center py-1 text-left"
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        <AccountTypeIcon type={a.type} className="h-4 w-4 shrink-0 text-fg-muted" />
                        <span className="min-w-0 truncate text-sm text-fg-primary">{a.name}</span>
                        {a.is_hidden && (
                          <span className="shrink-0 rounded bg-surface-sunken px-1 text-2xs text-fg-muted">
                            ẩn
                          </span>
                        )}
                        {!a.include_in_totals && (
                          <span className="shrink-0 rounded bg-surface-sunken px-1 text-2xs text-fg-muted">
                            ngoài tổng
                          </span>
                        )}
                        {/* Dấu "rút ngay?" — chỗ DUY NHẤT nói ra tài khoản nào còn thiếu cờ.
                            Tab Sức khỏe đếm "N tài khoản chưa khai" rồi dẫn sang trang này,
                            mà tới đây thì không có gì chỉ N tài khoản đó là những tài khoản
                            nào: phải mở lần lượt từng form mới biết. Dùng chung phép hỏi
                            `needsLiquidityAnswer` với con số đếm bên kia, nên hai chỗ không
                            lệch nhau được. Dấu tự mất khi khai xong. */}
                        {needsLiquidityAnswer(a) && (
                          <span className="shrink-0 rounded bg-state-warn-bg px-1 text-2xs text-state-warn-fg">
                            rút ngay?
                          </span>
                        )}
                      </span>
                      {/* Dòng phụ chỉ ở điện thoại — từ `lg` số dư và loại tiền đã là hai cột. */}
                      <span className="text-2xs text-fg-muted lg:hidden">
                        {formatMoney(balanceOf(a.id), a.currency)} · {a.currency}
                      </span>
                    </button>

                    <span className="hidden justify-self-end text-sm lg:block">
                      {/* Âm thì đỏ, dương thì TRUNG TÍNH — không phải `bySign` (nó tô xanh cả số
                          dương). Số dư là một lượng đang có, không phải một chiều tiền chảy; tô
                          xanh nó là mượn nghĩa "khoản thu". Cùng quy ước với dòng tài khoản ở
                          AssetsNowView. */}
                      <Money
                        amount={balanceOf(a.id)}
                        currency={a.currency}
                        tone={balanceOf(a.id) < 0 ? 'out' : 'neutral'}
                      />
                    </span>
                    <span className="hidden justify-self-end text-2xs text-fg-muted lg:block">
                      {a.currency}
                    </span>

                    {/* KHÔNG `hidden lg:block`: bản nháp đầu giấu nút này ở điện thoại và
                        thế là mất luôn đường lưu trữ trên máy nhỏ — cột thứ ba của lưới
                        mobile chính là chỗ của nó. */}
                    <span className="justify-self-end">
                      <ActionButton
                        onClick={() => update.mutate({ id: a.id, patch: { is_archived: true } })}
                      >
                        Lưu trữ
                      </ActionButton>
                    </span>
                  </div>
                )
              }}
            />
          </Card>
        </div>
      ))}

      {archived.length > 0 && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            className="mb-2 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-fg-muted"
          >
            {showArchived ? (
              <>
                Ẩn đã lưu trữ <ChevronUp className="h-4 w-4" />
              </>
            ) : (
              <>
                Đã lưu trữ ({archived.length}) <ChevronDown className="h-4 w-4" />
              </>
            )}
          </button>
          {showArchived && (
            <Card padding="none" className="divide-y divide-border-subtle overflow-hidden">
              {archived.map((a) => (
                <div key={a.id} className="flex items-center gap-2 px-3 py-2.5 opacity-60">
                  <AccountTypeIcon type={a.type} className="h-4 w-4" />
                  <span className="min-w-0 flex-1 truncate text-sm text-fg-secondary">
                    {a.name} · {a.currency}
                  </span>
                  <button
                    type="button"
                    onClick={() => update.mutate({ id: a.id, patch: { is_archived: false } })}
                    className="inline-flex min-h-11 items-center justify-center rounded-md px-2 py-1 text-sm text-fg-accent hover:bg-accent-muted-bg"
                  >
                    Khôi phục
                  </button>
                </div>
              ))}
            </Card>
          )}
        </div>
      )}

      {editing && (
        <AccountFormSheet
          account={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
