// Quản lý nhãn: đổi tên, đổi màu, xếp nhóm, đặt trần, lưu trữ, xóa.
//
// ---- Vì sao là một BẢNG có tiền (redesign 2026-08-30) ------------------------------
//
// Bản trước: mỗi nhãn là một THẺ ba hàng — hàng tên, hàng "Nhóm + Trần chi + kỳ", hàng
// chip xem trước + BẢY chấm chọn màu. Trên sổ thật (5 nhãn) đó là 15 hàng và **35 chấm
// màu** trên một màn, trong khi đổi màu là việc làm một lần lúc tạo nhãn.
//
// Và cái trần là một ô số trống không: nó KHÔNG đứng cạnh số đã tiêu, nên nhìn "50000"
// không biết là còn nhiều hay sắp vượt. Đúng thứ trần sinh ra để trả lời.
//
// Bản này: một dòng một nhãn, đọc được ngay "nhãn này đã tốn bao nhiêu" và "đã ăn bao
// nhiêu phần của trần". Mọi thứ SỬA (tên, màu, nhóm, trần, lưu trữ, xóa) dồn vào một
// tấm trượt — mở ra mới thấy, nên bảy chấm màu chỉ vẽ một lần thay vì bảy lần số nhãn.
//
// ---- Không có dòng "tổng cộng" ------------------------------------------------------
//
// Cộng cột tiền của bảng này ra một số LỚN HƠN tổng chi thật: một giao dịch mang hai
// nhãn được tính đủ vào cả hai (đúng nghĩa "chuyến về VN" ∩ "quà cáp"). Nên trang này
// cố ý chỉ đếm nhãn, không cộng tiền — xem chú thích ở tagSpendTotals.
import { useMemo, useState } from 'react'
import { Guide } from '../../components/Guide'
import { Archive, ChevronRight, Plus, Trash2 } from 'lucide-react'
import {
  useAccounts,
  useCreateTag,
  useCreateTagGroup,
  useDeleteTag,
  useDeleteTagGroup,
  useRates,
  useTagGroups,
  useTagSpend,
  useTags,
  useTransactionTags,
  useUpdateTag,
  useUpdateTagGroup,
} from '../../hooks/queries'
import { useMonthKey } from '../../hooks/useMonthKey'
import { confirmDialog, showToast } from '../../lib/dialog'
import { formatMoney, type CurrencyCode } from '../../lib/money'
import type { TagBudgetPeriod, TagRow } from '../../types/database.types'
import { useEscClose } from '../../hooks/useEscClose'
import type { BudgetStatus } from '../budgets/progress'
import { tagSpendTotals, type TagBudgetLine } from './budget'
import { useTagBudgets } from './useTagBudgets'
import { tagGroupLabel, tagLabel, tr, trx } from '../../i18n'
import { trn } from '../../i18n/react'
import { TAG_CHIP_CLASS, TAG_COLOR_KEYS, TAG_COLOR_LABELS, tagColor } from './colors'
import { QuickSortStrip, readQuickSortDone, writeQuickSortDone } from './QuickSortStrip'
import {
  ActionButton,
  Card,
  EmptyState,
  IconButton,
  Money,
  Num,
  PageHeader,
  SectionTitle,
  Select,
} from '../../components/ui'
import { STATUS_FILL } from '../../components/ui/statusColors'

/** Hai kiểu kỳ của trần nhãn — xem migration 0036. */
const PERIODS: readonly (readonly [TagBudgetPeriod, string, string])[] = [
  ['total', tr('Cả đợt'), tr('Trần cho toàn bộ đời nhãn, không reset — hợp với nhãn theo dịp')],
  ['monthly', tr('Mỗi tháng'), tr('Trần cho từng tháng, hết tháng reset — hợp với nhãn lặp đều')],
]

// Cùng bảng màu với khối tiến độ ở tab Ngân sách (TagBudgetLines): hai chỗ nói cùng một
// chuyện thì "vàng" phải nghĩa như nhau, không thì người đọc phải học hai bảng màu.
const BAR: Record<BudgetStatus, string> = {
  ok: STATUS_FILL.good,
  warn: STATUS_FILL.warn,
  over: STATUS_FILL.bad,
}

// Điện thoại ba cột (nhãn · tổng chi · mũi tên), từ `lg` năm cột.
//
// `grid` KHÔNG nằm trong hằng số: `hidden` và `grid` đều là tiện ích display, cái nào
// thắng do THỨ TỰ TRONG CSS chứ không do thứ tự trong chuỗi — nên hàng tiêu đề viết
// `hidden … lg:grid`, không phải `hidden` cạnh một `grid` trần.
const GRID =
  'grid-cols-[minmax(0,1fr)_minmax(5rem,auto)_1rem] items-center gap-x-2 ' +
  'lg:grid-cols-[minmax(0,1fr)_3.5rem_minmax(6rem,auto)_11rem_1rem]'

/**
 * Chỗ của một con số chưa về. Không phải "0": "0 giao dịch" là một KẾT LUẬN (nhãn này
 * trống), còn lúc đang tải thì app chưa biết gì cả.
 */
function DangTinh() {
  return (
    <span className="text-fg-muted" aria-label={tr('Đang tính')}>
      …
    </span>
  )
}

export function TagsPage() {
  const { data: tags = [], isLoading: dangTaiNhan } = useTags()
  const { data: groups = [], isLoading: dangTaiNhom } = useTagGroups()
  // KHÔNG mặc định `[]`: mảng rỗng lúc đang tải đọc ra "0 giao dịch" ở mọi dòng, và tệ
  // hơn, hộp xác nhận xoá nói "nhãn này chưa gắn với giao dịch nào" với một nhãn đang
  // gắn hàng trăm giao dịch. `undefined` = chưa đếm được, và mọi chỗ đọc phải nói thế.
  const { data: links, isError: demLoi } = useTransactionTags()
  const { data: accounts = [], isLoading: dangTaiTk } = useAccounts()
  const { base, rates, isLoading: dangTaiTyGia } = useRates()
  const createTag = useCreateTag()
  const deleteTag = useDeleteTag()
  const updateTag = useUpdateTag()
  const createGroup = useCreateTagGroup()
  const updateGroup = useUpdateTagGroup()
  const deleteGroup = useDeleteTagGroup()

  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const [newTagGroup, setNewTagGroup] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [addingGroup, setAddingGroup] = useState(false)
  const [groupDraft, setGroupDraft] = useState('')
  const [groupError, setGroupError] = useState<string | null>(null)
  const [editing, setEditing] = useState<TagRow | null>(null)
  const [quickSortDone, setQuickSortDone] = useState(readQuickSortDone)

  // Chi CẢ ĐỜI từng nhãn. Cùng truy vấn `['tagSpend']` mà useTagBudgets dùng, nên hai
  // hook không tải hai lần — react-query gộp theo khóa.
  const { data: spendRows } = useTagSpend()
  // Tiền chỉ tính xong khi có đủ BA thứ: dòng chi, tài khoản (để biết đồng tiền của từng
  // dòng — thiếu thì mọi dòng bị coi là tiền gốc) và tỷ giá (thiếu thì mọi khoản ngoại tệ
  // bị loại khỏi tổng). Tỷ giá lỗi thì vẫn tính — đó là thiếu thật, `hasMissingRate` lo.
  const tienXong = spendRows !== undefined && !dangTaiTk && !dangTaiTyGia
  const totals = useMemo(() => {
    const currencyOf = (id: string): CurrencyCode =>
      accounts.find((a) => a.id === id)?.currency ?? base
    return tagSpendTotals(spendRows ?? [], currencyOf, base, rates ?? {})
  }, [spendRows, accounts, base, rates])

  // Tiến độ trần đi qua useTagBudgets chứ không tự tính: nó là chỗ DUY NHẤT biết kỳ
  // 'monthly' phải đo trong khoảng tháng nào (theo month_start_day của hồ sơ).
  const { activeMonthKey } = useMonthKey()
  const budgets = useTagBudgets(activeMonthKey)
  const budgetByTag = useMemo(() => {
    const m = new Map<string, TagBudgetLine>()
    for (const l of budgets.lines) m.set(l.tagId, l)
    return m
  }, [budgets.lines])

  /** null = chưa đếm được (đang tải, hoặc tải lỗi). */
  const usageOf = (tagId: string): number | null =>
    links === undefined ? null : links.filter((l) => l.tag_id === tagId).length
  /** null = chưa tính xong — xem `tienXong`. */
  const spentOf = (tagId: string): number | null =>
    tienXong ? Math.round(totals.byTag.get(tagId) ?? 0) : null

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
      title: tr('Khác'),
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
      setAdding(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : tr('Không tạo được nhãn'))
    }
  }

  async function addGroup() {
    const name = groupDraft.trim()
    if (!name) return
    setGroupError(null)
    try {
      await createGroup.mutateAsync({ name })
      setGroupDraft('')
      setAddingGroup(false)
    } catch (e) {
      setGroupError(e instanceof Error ? e.message : tr('Không tạo được nhóm'))
    }
  }

  async function removeGroup(id: string, name: string) {
    const inGroup = tags.filter((t) => t.group_id === id).length
    const ok = await confirmDialog({
      title: tr('Xóa nhóm "{name}"?', { name: tagGroupLabel(name) }),
      message:
        inGroup > 0
          ? tr('{n} nhãn đang ở nhóm này. Nhãn KHÔNG bị xóa — chúng chuyển sang mục "Khác", giao dịch và trần chi giữ nguyên.', { n: inGroup })
          : tr('Nhóm này chưa có nhãn nào.'),
      confirmLabel: tr('Xóa nhóm'),
      danger: true,
    })
    if (!ok) return
    await deleteGroup.mutateAsync(id)
    showToast(tr('Đã xóa nhóm "{name}"', { name: tagGroupLabel(name) }))
  }

  async function remove(t: TagRow) {
    const used = usageOf(t.id)
    // Chưa đếm xong thì KHÔNG mở hộp hỏi: câu trong hộp dựa trên số đếm, và hỏi bằng
    // một số chưa có là hỏi sai. Nút Xóa đã tắt trong lúc này; dòng này chặn nốt.
    if (used === null && !demLoi) return
    const ok = await confirmDialog({
      title: tr('Xóa nhãn "{name}"?', { name: tagLabel(t.name) }),
      message:
        used === null
          ? tr('Không đếm được số giao dịch đang mang nhãn này. Mọi giao dịch mang nó vẫn giữ nguyên, nhưng sẽ MẤT nhãn. Chỉ muốn dẹp nó khỏi form nhập thì bấm Lưu trữ thay vì Xóa.')
          : used > 0
            ? tr('{n} giao dịch đang mang nhãn này. Giao dịch vẫn giữ nguyên, nhưng MẤT nhãn — tổng chi theo nhãn này sẽ không còn cộng được. Chỉ muốn dẹp nó khỏi form nhập thì bấm Lưu trữ thay vì Xóa.', { n: used })
            : tr('Nhãn này chưa gắn với giao dịch nào.'),
      confirmLabel: tr('Xóa'),
      danger: true,
    })
    if (!ok) return
    await deleteTag.mutateAsync(t.id)
    setEditing(null)
    showToast(tr('Đã xóa nhãn "{name}"', { name: tagLabel(t.name) }))
  }

  function setArchived(t: TagRow, is_archived: boolean) {
    updateTag.mutate({ id: t.id, patch: { is_archived } })
    setEditing(null)
    showToast(is_archived ? tr('Đã lưu trữ nhãn "{name}"', { name: tagLabel(t.name) }) : tr('Đã dùng lại nhãn "{name}"', { name: tagLabel(t.name) }))
  }

  /** Ô cột "Trần" — thanh tiến độ + một dòng chữ, hoặc gạch ngang khi chưa đặt. */
  function budgetCell(t: TagRow) {
    const line = budgetByTag.get(t.id)
    // Tiến độ trần đọc cùng dòng chi với cột "Đã chi" — chưa về thì thanh 0% là nói dối.
    if (line && !tienXong)
      return (
        <span className="text-2xs">
          <DangTinh />
        </span>
      )
    if (!line) return <span className="text-2xs text-fg-muted">—</span>
    return (
      <span className="block">
        <span className="block h-1.5 overflow-hidden rounded-full bg-surface-sunken">
          {/* Vượt trần thì thanh dừng ở 100% — kéo dài ra ngoài khung là vẽ sai, còn
              vượt bao nhiêu đã nói bằng con số ngay dưới. Cùng luật với TagBudgetLines. */}
          <span
            className={`block h-full rounded-full ${BAR[line.status]}`}
            style={{ width: `${Math.min(line.ratio * 100, 100)}%` }}
          />
        </span>
        <span className="mt-0.5 block truncate text-2xs text-fg-muted">
          {trn('{pct} của {amount}', {
            pct: (
              <Num tone={line.status === 'over' ? 'out' : 'muted'}>
                {Math.round(line.ratio * 100)}%
              </Num>
            ),
            amount: formatMoney(line.budget, base),
          })}
          {line.period === 'monthly' && tr(' · tháng này')}
        </span>
      </span>
    )
  }

  /** Một dòng nhãn. Cả dòng là nút mở tấm trượt sửa — trong dòng không còn control nào
   *  khác, nên không có chuyện nút lồng nút. */
  function tagRow(t: TagRow) {
    const line = budgetByTag.get(t.id)
    const used = usageOf(t.id)
    const spent = spentOf(t.id)
    return (
      <button
        key={t.id}
        type="button"
        onClick={() => setEditing(t)}
        className={`grid ${GRID} min-h-12 w-full border-b border-border-subtle px-3 py-2 text-left transition last:border-b-0 hover:bg-surface-sunken`}
      >
        <span className="flex min-w-0 flex-col gap-0.5">
          <span
            className={`w-fit max-w-full truncate rounded-full px-2 py-0.5 text-sm font-medium ${
              TAG_CHIP_CLASS[tagColor(t.color)]
            } ${t.is_archived ? 'opacity-75' : ''}`}
          >
            {tagLabel(t.name)}
          </span>
          {/* Dòng phụ chỉ ở điện thoại — từ `lg` hai con số này đã là hai cột. */}
          <span className="text-2xs text-fg-muted lg:hidden">
            {trn('{n} gd', { n: used === null ? <DangTinh /> : <Num tone="muted">{used}</Num> })}
            {line && tienXong && (
              <>
                {' · '}
                {trn('{pct} trần', {
                  pct: (
                    <Num tone={line.status === 'over' ? 'out' : 'muted'}>
                      {Math.round(line.ratio * 100)}%
                    </Num>
                  ),
                })}
              </>
            )}
          </span>
        </span>

        <span className="hidden justify-self-end text-sm lg:block">
          {used === null ? <DangTinh /> : <Num tone="muted">{used}</Num>}
        </span>

        <span className="justify-self-end text-sm">
          {spent === null ? <DangTinh /> : <Money amount={spent} currency={base} />}
        </span>

        <span className="hidden min-w-0 lg:block">{budgetCell(t)}</span>

        <ChevronRight className="h-4 w-4 justify-self-end text-fg-muted" aria-hidden />
      </button>
    )
  }

  /** Hàng tiêu đề của một nhóm — tên sửa tại chỗ, kèm số nhãn và nút xóa. */
  function groupHeader(s: (typeof sections)[number]) {
    return (
      <div className="flex items-center gap-2 border-b border-border-panel bg-surface-chrome px-3 py-1.5">
        {s.groupId ? (
          <input
            // Ô hiện TÊN HIỂN THỊ (chế độ Anh: "With whom?" cho nhóm mặc định "Với ai?"), và chỉ
            // ghi DB khi người dùng gõ khác đi — rời ô mà không sửa thì tên gốc trong DB giữ nguyên.
            defaultValue={tagGroupLabel(s.title)}
            onBlur={async (e) => {
              const name = e.target.value.trim()
              const input = e.target
              if (name && name !== tagGroupLabel(s.title)) {
                setGroupError(null)
                try {
                  await updateGroup.mutateAsync({ id: s.groupId!, patch: { name } })
                } catch (err) {
                  setGroupError(err instanceof Error ? err.message : tr('Không đổi được tên nhóm'))
                  input.value = tagGroupLabel(s.title)
                }
              } else {
                input.value = tagGroupLabel(s.title)
              }
            }}
            aria-label={tr('Tên nhóm {name}', { name: tagGroupLabel(s.title) })}
            className="min-h-9 min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-2xs uppercase tracking-label text-fg-muted hover:border-border-strong"
          />
        ) : (
          <SectionTitle role="micro" className="min-w-0 flex-1 px-2">
            {s.title}
          </SectionTitle>
        )}
        <span className="shrink-0 text-2xs text-fg-muted">
          {trn('{n} nhãn', { n: <Num tone="muted">{s.rows.length}</Num> })}
        </span>
        {/* Để nguyên 44×44 của IconButton, KHÔNG bó nhỏ lại. Bản trước nối thêm
            `min-h-9 min-w-9 px-0` cho khỏi cao hơn ô tên 36px bên cạnh — cả BA class đó
            đều KHÔNG ăn: đo trong trình duyệt ra `minHeight/minWidth: 44px`,
            `paddingLeft: 12px`. Tailwind xếp thang số TĂNG DẦN trong CSS sinh ra
            (.min-h-9 trước .min-h-11, .px-0 trước .px-3), nên giá trị LỚN HƠN trong
            `BASE` của IconButton luôn thắng, bất kể thứ tự viết trong className.
            Và 44 mới đúng ngưỡng vùng chạm mà IconButton tồn tại để bảo vệ. Guardrail:
            designSystem.test.ts → "IconButton không nhận tiện ích hộp … ở chỗ dùng".
            Cùng kết luận đã ghi tại nút xoá kịch bản (TuongLaiPage). */}
        {s.groupId && (
          <IconButton
            variant="ghost"
            aria-label={tr('Xóa nhóm {name}', { name: tagGroupLabel(s.title) })}
            onClick={() => removeGroup(s.groupId!, s.title)}
            className="hover:text-money-out"
          >
            <Trash2 className="h-4 w-4" />
          </IconButton>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 p-3 lg:p-6">
      <PageHeader title={tr('Nhãn')} back="/settings">
        <ActionButton
          onClick={() => {
            setAddingGroup(true)
            setGroupDraft('')
          }}
        >
          <Plus className="h-4 w-4" /> {tr('Nhóm')}
        </ActionButton>
        <ActionButton
          variant="primary"
          onClick={() => {
            setAdding(true)
            setDraft('')
          }}
        >
          <Plus className="h-4 w-4" /> {trx('add', 'Nhãn')}
        </ActionButton>
      </PageHeader>

      <Guide className="rounded-lg bg-surface-sunken p-3 text-sm text-fg-secondary">
        {trn('Nhãn cắt ngang danh mục: một chuyến “Về VN 2026” gồm vé máy bay, quà và phong bì nằm ở ba danh mục khác nhau, nhưng cùng một nhãn thì cuối năm cộng được tổng chi phí cả chuyến. Nhóm là CÂU HỎI, nhãn là câu trả lời — nhóm “Với ai?” chứa “Người yêu”, “Bạn bè”, và khi nhập giao dịch mỗi nhóm hiện thành một hàng chip riêng. Xong chuyến thì {archive} nhãn: nó ẩn khỏi form nhập nhưng số liệu vẫn còn.', {
          archive: <b>{tr('lưu trữ')}</b>,
        })}
      </Guide>

      {!quickSortDone && <QuickSortStrip onDone={() => setQuickSortDone(true)} />}

      {adding && (
        // flex-wrap + basis-full: ba control này KHÔNG vừa một hàng ở 375px (đo được cần
        // 403px trong khung 351px, nút "Thêm" chỉ còn thấy 41%). Hẹp thì ô tên chiếm trọn
        // hàng trên, select + nút xuống hàng dưới cạnh nhau.
        <Card as="section" elevation="panel" padding="sm" className="flex flex-wrap gap-2">
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void add()
              if (e.key === 'Escape') setAdding(false)
            }}
            aria-label={tr('Tên nhãn mới')}
            placeholder={tr('Tên nhãn mới…')}
            className="min-h-11 min-w-0 flex-1 basis-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm sm:basis-48"
          />
          <Select
            value={newTagGroup}
            onChange={(e) => setNewTagGroup(e.target.value)}
            aria-label={tr('Nhóm cho nhãn mới')}
            wrapClassName="min-w-0 flex-1 basis-28"
          >
            <option value="">{tr('— Khác —')}</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {tagGroupLabel(g.name)}
              </option>
            ))}
          </Select>
          <ActionButton
            variant="primary"
            onClick={add}
            disabled={!draft.trim() || createTag.isPending}
          >
            {tr('Thêm')}
          </ActionButton>
          <ActionButton onClick={() => setAdding(false)}>{tr('Hủy')}</ActionButton>
        </Card>
      )}
      {error && <p className="text-sm text-money-out">{error}</p>}

      {addingGroup && (
        <Card as="section" elevation="panel" padding="sm" className="flex flex-wrap gap-2">
          <input
            autoFocus
            value={groupDraft}
            onChange={(e) => setGroupDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void addGroup()
              if (e.key === 'Escape') setAddingGroup(false)
            }}
            aria-label={tr('Tên nhóm mới')}
            placeholder={tr('Tên nhóm mới… (“Với ai?”, “Ở đâu?”)')}
            className="min-h-11 min-w-0 flex-1 basis-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm sm:basis-48"
          />
          <ActionButton
            variant="primary"
            onClick={addGroup}
            disabled={!groupDraft.trim() || createGroup.isPending}
          >
            {tr('Thêm nhóm')}
          </ActionButton>
          <ActionButton onClick={() => setAddingGroup(false)}>{tr('Hủy')}</ActionButton>
        </Card>
      )}
      {groupError && <p className="text-sm text-money-out">{groupError}</p>}

      {/* Cổng là "không nhãn VÀ không nhóm", không phải "không nhãn". Đo được lúc dọn dữ
          liệu thử: tạo nhóm rồi xóa hết nhãn thì bảng biến mất, mà nút xóa nhóm nằm TRONG
          bảng — nhóm thành thứ không nhìn thấy và không xóa được, chỉ còn cách tạo tạm một
          nhãn để bảng hiện lại. Nhóm rỗng vẫn phải có mặt. */}
      {/* Đang tải thì nói đang tải: bảng rỗng lúc này sẽ hiện câu "Chưa có nhãn nào" —
          một kết luận về sổ, trong khi app chưa đọc được gì. */}
      {dangTaiNhan || dangTaiNhom ? (
        <EmptyState>{tr('Đang tải…')}</EmptyState>
      ) : tags.length === 0 && groups.length === 0 ? (
        // Câu chỉ đường không bọc Guide: màn rỗng thì đây là thứ duy nhất trên màn hình
        // (xem components/Guide.tsx). Màn Nhãn là chỗ thấy rõ nhất — rỗng thì cả trang
        // trống trơn, chỉ còn đúng một câu này.
        <EmptyState>
          {tr('Chưa có nhãn nào. Bấm “Nhãn” ở trên để tạo — nhãn để gom giao dịch theo chuyến đi, theo người, theo dự án.')}
        </EmptyState>
      ) : (
        <>
          <Card as="section" elevation="panel" padding="none" className="overflow-hidden">
            {/* Hàng tiêu đề chỉ từ `lg`: ở điện thoại bảng còn ba cột và mỗi dòng đã tự
                nói ra nhãn của nó ở dòng phụ. */}
            <div
              className={`hidden ${GRID} border-b border-border-panel bg-surface-chrome px-3 py-2.5 text-2xs uppercase tracking-label text-fg-muted lg:grid`}
            >
              <span>{tr('Nhãn')}</span>
              <span className="justify-self-end">{tr('GD')}</span>
              <span className="justify-self-end">{tr('Đã chi')}</span>
              <span>{tr('Trần')}</span>
              <span />
            </div>

            {active.length === 0 && archived.length > 0 && (
              <EmptyState compact>
                {tr('Mọi nhãn đang được lưu trữ. Dùng lại một nhãn để nó xuất hiện khi nhập giao dịch.')}
              </EmptyState>
            )}
            {sections.map((s) =>
                // Mục "Khác" rỗng thì biến mất; nhóm thật thì luôn hiện, kể cả rỗng —
                // không thì nhóm vừa tạo vô hình, không rõ xếp vào đâu.
                s.groupId === null && s.rows.length === 0 ? null : (
                  <div key={s.key}>
                    {groupHeader(s)}
                    {s.rows.length === 0 ? (
                      <p className="border-b border-border-subtle px-3 py-2.5 text-sm text-fg-muted">
                        {tr('Chưa có nhãn nào trong nhóm này.')}
                        <Guide as="span">{tr(' Mở một nhãn bên dưới rồi đổi ô “Nhóm”.')}</Guide>
                      </p>
                    ) : (
                      s.rows.map(tagRow)
                    )}
                  </div>
                ),
            )}

            {archived.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 border-b border-border-panel bg-surface-chrome px-3 py-1.5">
                  <Archive className="h-3.5 w-3.5 shrink-0 text-fg-muted" aria-hidden />
                  <SectionTitle role="micro" className="min-w-0 flex-1">
                    {tr('Đã lưu trữ')}
                  </SectionTitle>
                  <span className="shrink-0 text-2xs text-fg-muted">
                    {trn('{n} nhãn', { n: <Num tone="muted">{archived.length}</Num> })}
                  </span>
                </div>
                <Guide className="border-b border-border-subtle px-3 py-2 text-2xs text-fg-muted">
                  {tr('Không hiện khi nhập giao dịch nữa, nhưng vẫn còn nguyên trong Chi theo nhãn và lọc ở Tìm kiếm.')}
                </Guide>
                {archived.map(tagRow)}
              </div>
            )}
          </Card>

          {/* Cột "Đã chi" tính CẢ ĐỜI nhãn. Nói ra vì cột "Trần" ngay cạnh có thể đang đo
              theo THÁNG (nhãn kỳ 'monthly') — hai cột hai mốc thời gian mà không ai nói
              thì đọc ra mâu thuẫn. */}
          {/* CỐ Ý không bọc <Guide>, dù CalendarPanels.tsx bọc đúng câu này: ở đó các dòng
              nhãn có trần riêng nên không ai cộng chúng lại, còn ở đây là một CỘT số mời
              người ta cộng. Ẩn ở chế độ Gọn là để người đọc tự cộng rồi tin một con số cao
              hơn sự thật. Xem PROSE_MAX trong tests/designSystem.test.ts (mục 81). */}
          {tags.length > 0 && (
          <p className="text-2xs text-fg-muted">
            {tr('“Đã chi” là tổng cả đời nhãn, quy về {base}.', { base })}
            {tienXong &&
              totals.hasMissingRate &&
              tr(' Có khoản ngoại tệ thiếu tỷ giá nên tổng chưa đủ.')}{' '}
            {tr('Một giao dịch mang hai nhãn được tính đủ vào cả hai, nên cộng cột này sẽ lớn hơn tổng chi thật.')}
          </p>
          )}

          {quickSortDone && (
            <button
              type="button"
              onClick={() => {
                writeQuickSortDone(false)
                setQuickSortDone(false)
              }}
              className="min-h-11 w-fit text-sm font-medium text-fg-accent"
            >
              {tr('Mở lại dải xếp nhãn vào nhóm')}
            </button>
          )}
        </>
      )}

      {editing && (
        <TagEditSheet
          tag={editing}
          groups={groups}
          base={base}
          spent={spentOf(editing.id)}
          usage={usageOf(editing.id)}
          countFailed={demLoi}
          onArchive={(v) => setArchived(editing, v)}
          onDelete={() => remove(editing)}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

/**
 * Tấm trượt sửa một nhãn. Bốn thứ sửa được (tên · màu · nhóm · trần) gom vào MỘT lần
 * lưu, thay vì mỗi ô một mutation như bản trước — bản trước lưu tên lúc rời ô, lưu màu
 * lúc bấm chấm, lưu trần lúc rời ô, tức ba lượt ghi cho một lần sửa và không có đường
 * nào bỏ dở.
 */
function TagEditSheet({
  tag,
  groups,
  base,
  spent,
  usage,
  countFailed,
  onArchive,
  onDelete,
  onClose,
}: {
  tag: TagRow
  groups: { id: string; name: string }[]
  base: CurrencyCode
  /** null = chưa tính xong. */
  spent: number | null
  /** null = chưa đếm được. */
  usage: number | null
  /** true = tải số đếm bị lỗi — vẫn cho xoá, hộp hỏi sẽ nói thẳng là không đếm được. */
  countFailed: boolean
  onArchive: (v: boolean) => void
  onDelete: () => void
  onClose: () => void
}) {
  useEscClose(onClose)
  const update = useUpdateTag()
  const [name, setName] = useState(tag.name)
  const [color, setColor] = useState(tagColor(tag.color))
  const [groupId, setGroupId] = useState(tag.group_id ?? '')
  const [budget, setBudget] = useState(tag.budget_amount != null ? String(tag.budget_amount) : '')
  const [period, setPeriod] = useState<TagBudgetPeriod>(tag.budget_period ?? 'total')

  /**
   * Ô rỗng (hoặc số ≤ 0) = BỎ trần, không phải "trần bằng 0" — trần 0 nghĩa là cấm
   * tiêu, chẳng ai đặt, mà gõ nhầm rồi xoá đi là chuyện thường.
   */
  function budgetValue(): number | null {
    const digits = budget.replace(/[^\d]/g, '')
    if (digits === '') return null
    const n = Number(digits)
    return n > 0 ? n : null
  }

  async function save() {
    const clean = name.trim()
    try {
      await update.mutateAsync({
        id: tag.id,
        patch: {
          name: clean || tag.name,
          color,
          group_id: groupId || null,
          budget_amount: budgetValue(),
          budget_period: period,
        },
      })
    } catch {
      // Lưu hỏng thì GIỮ sheet mở (toast lỗi toàn cục đã báo), không đóng như thể xong.
      return
    }
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 lg:items-center animate-overlay-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-t-2xl bg-surface-page p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:rounded-2xl animate-sheet-in lg:animate-sheet-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <SectionTitle role="block">{tr('Sửa nhãn')}</SectionTitle>
          <span className="text-2xs text-fg-muted">
            {usage === null ? (
              countFailed ? tr('Không đếm được giao dịch') : tr('Đang đếm giao dịch…')
            ) : (
              <>
                {trn('{n} giao dịch', { n: <Num tone="muted">{usage}</Num> })}
              </>
            )}
            {' · '}
            {spent === null ? <DangTinh /> : <Money amount={spent} currency={base} tone="muted" />}
          </span>
        </div>

        <label htmlFor="tag-name" className="block text-sm font-medium text-fg-muted">
          {tr('Tên')}
        </label>
        <input
          id="tag-name"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void save()
          }}
          className="mt-1 w-full rounded-md border border-border-strong bg-surface p-3 text-fg-primary"
        />
        {/* Tên lưu DB giữ nguyên; chế độ Anh chỉ ĐỔI CHỮ HIỂN THỊ của tên mặc định — nói ra
            để người sửa không tưởng tên mình gõ bị đổi mất. */}
        {tagLabel(name.trim()) !== name.trim() && (
          <p className="mt-1 text-2xs text-fg-muted">
            {tr('Hiển thị là “{label}” ở giao diện tiếng Anh.', { label: tagLabel(name.trim()) })}
          </p>
        )}

        <p className="mt-3 text-sm font-medium text-fg-muted">{tr('Màu')}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {/* Chip xem trước đứng ngay cạnh dãy chấm: chọn màu xong thấy luôn nó ra hình
              gì khi nhập giao dịch. */}
          <span
            className={`mr-1 shrink-0 rounded-full px-2 py-0.5 text-sm font-medium ${TAG_CHIP_CLASS[color]}`}
          >
            {tagLabel(name.trim() || tag.name)}
          </span>
          {TAG_COLOR_KEYS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-label={tr('Màu {color}', { color: TAG_COLOR_LABELS[c] })}
              aria-pressed={color === c}
              className="inline-flex h-11 w-8 items-center justify-center"
            >
              <span
                className={`block h-5 w-5 rounded-full ${TAG_CHIP_CLASS[c]} ${
                  color === c ? 'ring-2 ring-fg-primary' : 'opacity-70'
                }`}
              />
            </button>
          ))}
        </div>

        <label htmlFor="tag-group" className="mt-3 block text-sm font-medium text-fg-muted">
          {tr('Nhóm')}
        </label>
        <Select
          id="tag-group"
          value={groupId}
          onChange={(e) => setGroupId(e.target.value)}
          wrapClassName="mt-1 w-full"
        >
          <option value="">{tr('— Khác —')}</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {tagGroupLabel(g.name)}
            </option>
          ))}
        </Select>

        <label htmlFor="tag-budget" className="mt-3 block text-sm font-medium text-fg-muted">
          {tr('Trần chi ({base})', { base })}
        </label>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <input
            id="tag-budget"
            inputMode="numeric"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            placeholder={tr('không đặt')}
            // text-base (16px) để Safari iOS không phóng to trang khi bấm vào ô
            className="min-h-11 w-32 rounded-md border border-border-strong bg-surface px-3 py-2 text-right text-base sm:text-sm"
          />
          <div className="flex overflow-hidden rounded-md border border-border-strong">
            {PERIODS.map(([value, label, title]) => (
              <button
                key={value}
                type="button"
                title={title}
                onClick={() => setPeriod(value)}
                aria-pressed={period === value}
                disabled={budgetValue() === null}
                className={`min-h-11 px-3 text-sm font-medium transition disabled:opacity-50 ${
                  period === value
                    ? 'bg-accent text-fg-on-accent'
                    : 'text-fg-secondary hover:bg-surface-sunken'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <Guide className="mt-1 text-2xs text-fg-muted">
          {tr('Để trống là bỏ trần. “Cả đợt” không reset — hợp nhãn theo dịp; “Mỗi tháng” hết tháng reset — hợp nhãn lặp đều.')}
        </Guide>

        <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-border-subtle pt-3">
          <ActionButton onClick={() => onArchive(!tag.is_archived)}>
            {tag.is_archived ? tr('Dùng lại') : tr('Lưu trữ')}
          </ActionButton>
          {/* Tắt cho tới khi đếm xong: hộp hỏi xoá nói "N giao dịch đang mang nhãn này",
              và hỏi trước khi có N là hỏi bằng một con số bịa. */}
          <ActionButton
            variant="danger"
            onClick={onDelete}
            disabled={usage === null && !countFailed}
          >
            {usage === null && !countFailed ? tr('Đang đếm…') : tr('Xóa nhãn')}
          </ActionButton>
          <span className="ml-auto flex gap-1.5">
            <ActionButton onClick={onClose}>{tr('Đóng')}</ActionButton>
            <ActionButton variant="primary" onClick={save} disabled={update.isPending}>
              {tr('Lưu')}
            </ActionButton>
          </span>
        </div>
      </div>
    </div>
  )
}
