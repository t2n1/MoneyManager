// Phân loại chi tiêu — gán hai trục (Tính chất · Loại chi) cho mọi danh mục Chi.
//
// ---- Vì sao là "nhãn tóm tắt + bảng chọn" (redesign 2026-09-06) --------------------
//
// Bản trước (2026-08-30) in HAI ô gạt ngay trên từng dòng — hợp lý khi trục Tính chất
// có 3 lựa chọn. Trục đó giờ có 5 + "Chưa" = 6 nút nhét trong cột 13rem: chữ gãy giữa
// từ, mỗi dòng phình thành hai tầng nút, 62 danh mục × 9 nút ≈ 550 nút một trang.
// Nới cột thì hết chỗ nới: mở rộng theo số lựa chọn là thua từ cấu trúc.
//
// Bản này mỗi dòng chỉ còn MỘT nhãn tóm tắt (StatusChip: xanh = đủ hai trục, vàng =
// chưa). Bấm dòng nào thì BẢNG CHỌN trồi lên (đúng khuôn sheet của BudgetMethodSheet)
// với đủ 5+2 chip cỡ ngón tay; lưu xong tự nhảy sang mục chưa xong kế tiếp — phân loại
// một sổ 47 mục tồn là một mạch bấm liền, không phải cuộn tìm. "Áp cho cả nhóm" dùng
// chính bảng đó (mode 'group') thay cho hai tầng nút bung tại chỗ của bản trước.
//
// Logic thuần (nhãn tóm tắt, tìm mục kế tiếp) ở classifyFlow.ts — có unit test.
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Guide } from '../../components/Guide'
import { useCategories, useUpdateCategory } from '../../hooks/queries'
import { useEscClose } from '../../hooks/useEscClose'
import { confirmDialog, showToast } from '../../lib/dialog'
import type { CategoryRow, CostType, NeedLevel } from '../../types/database.types'
import { COST_OPTIONS, NEED_OPTIONS } from './ClassificationToggle'
import { isClassified, nextTodo, summaryLabel } from './classifyFlow'
import { classifiableExpenses, classifyGroups } from './leaf'
import {
  ActionButton,
  Card,
  EmptyState,
  FilterChip,
  Num,
  PageHeader,
  SectionTitle,
  StatusChip,
} from '../../components/ui'

type Axis = 'need_level' | 'cost_type'
/** Giá trị người dùng vừa chọn, chờ máy chủ xác nhận (để nhãn đổi ngay). */
type PendingRow = { need_level?: NeedLevel | null; cost_type?: CostType | null }

/** Bảng chọn đang mở cho ai — một danh mục, hay cả một nhóm ("Áp cho cả nhóm"). */
type SheetState = { mode: 'one'; id: string } | { mode: 'group'; parentId: string }

const isTodo = (c: CategoryRow) => !isClassified(c)

/**
 * `NEED_OPTIONS`/`COST_OPTIONS` mỗi cái đều gồm cả mục "Chưa" (giá trị `null`) — bảng
 * chọn chỉ bày giá trị THẬT ("Chưa" đi bằng nút "Xoá phân loại" riêng, để 5 chip không
 * chen một lựa chọn chẳng ai chủ động chọn). Ép kiểu tường minh vì phần tử của hai hằng
 * trên là union các tuple literal (do `as const satisfies`) — type predicate không tự
 * thu hẹp được từ đó.
 */
const NEED_CHOICES = (
  NEED_OPTIONS as readonly (readonly [NeedLevel | null, string])[]
).filter((o): o is readonly [NeedLevel, string] => o[0] !== null)
const COST_CHOICES = (
  COST_OPTIONS as readonly (readonly [CostType | null, string])[]
).filter((o): o is readonly [CostType, string] => o[0] !== null)

export function ClassifyCategoriesPage() {
  const { data: categories = [] } = useCategories()
  const update = useUpdateCategory()
  const [params, setParams] = useSearchParams()
  const [pending, setPending] = useState<Record<string, PendingRow>>({})
  const [sheet, setSheet] = useState<SheetState | null>(null)
  /** Lựa chọn đang bấm dở trong bảng chọn — chưa lưu cho tới khi bấm nút Lưu/Gán. */
  const [draftNeed, setDraftNeed] = useState<NeedLevel | null>(null)
  const [draftCost, setDraftCost] = useState<CostType | null>(null)

  const closeSheet = () => setSheet(null)
  useEscClose(closeSheet, sheet !== null)

  // `?todo=1` và `?ids=` là trạng thái của ĐỊA CHỈ, không phải của component: nút
  // "Phân loại N danh mục này" ở mặt lập kế hoạch gửi sang đúng N id, và trước bản này
  // trang bỏ qua cả hai tham số — nút nói 3, trang mở ra hiện "(0)" và không có dòng
  // nào bấm được. Đọc từ URL nên bấm Quay lại / mở lại link đều ra đúng cảnh cũ.
  const onlyTodo = params.get('todo') === '1'
  const pickedIds = useMemo(() => {
    const raw = params.get('ids')
    return raw ? new Set(raw.split(',').filter(Boolean)) : null
  }, [params])

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value === null) next.delete(key)
    else next.set(key, value)
    setParams(next, { replace: true })
  }

  const all = classifiableExpenses(categories)
  const rows = all.filter(
    (c) => (!pickedIds || pickedIds.has(c.id)) && (!onlyTodo || isTodo(c)),
  )
  const todoCount = all.filter(isTodo).length
  const doneCount = all.length - todoCount
  // Gom theo cha để dễ đọc — lọc trước khi gom nên nhóm rỗng (mọi dòng bị lọc hết)
  // sẽ tự biến mất, không hiện tiêu đề trơ trọi.
  const groups = classifyGroups(rows, categories)
  const childCount = (parentId: string) =>
    categories.filter((c) => c.parent_id === parentId && !c.is_archived).length

  /** Mọi danh mục phân loại được của một nhóm — cha + con, KHÔNG theo bộ lọc đang bật. */
  const membersOf = (parentId: string) =>
    all.filter((c) => c.id === parentId || c.parent_id === parentId)

  /** Giá trị đang hiển thị: ưu tiên lựa chọn đang chờ lưu (kể cả khi là null = "Chưa"). */
  const shown = <T extends NeedLevel | CostType | null>(id: string, axis: Axis, saved: T): T => {
    const row = pending[id]
    return row && axis in row ? ((row[axis] ?? null) as T) : saved
  }

  /** Hai trục HIỆU LỰC (đã trộn pending) của một danh mục — nguồn của nhãn tóm tắt. */
  const effective = (c: CategoryRow) => ({
    need_level: shown(c.id, 'need_level', c.need_level),
    cost_type: shown(c.id, 'cost_type', c.cost_type),
  })

  /** Lưu CẢ HAI trục một lượt: hiện ngay (optimistic), báo lỗi nếu hỏng. */
  function saveBoth(id: string, need: NeedLevel | null, cost: CostType | null) {
    setPending((p) => ({ ...p, [id]: { need_level: need, cost_type: cost } }))
    update.mutate(
      { id, patch: { need_level: need, cost_type: cost } },
      {
        onError: (e) =>
          showToast(e instanceof Error ? e.message : 'Không lưu được phân loại', 'error'),
        onSettled: () =>
          setPending((p) => {
            const row = p[id]
            // Đã có thao tác mới hơn trên danh mục này → để lần đó tự dọn.
            if (!row || row.need_level !== need || row.cost_type !== cost) return p
            const next = { ...p }
            delete next[id]
            return next
          }),
      },
    )
  }

  /** Mở bảng chọn cho MỘT danh mục, chip mồi sẵn theo giá trị đang hiển thị. */
  function openFor(c: CategoryRow) {
    const eff = effective(c)
    setDraftNeed(eff.need_level)
    setDraftCost(eff.cost_type)
    setSheet({ mode: 'one', id: c.id })
  }

  /** Mở bảng chọn cho CẢ NHÓM — không mồi chip: nhóm không có "giá trị hiện tại" chung. */
  function openGroup(parentId: string) {
    setDraftNeed(null)
    setDraftCost(null)
    setSheet({ mode: 'group', parentId })
  }

  /** Lật bảng chọn sang mục CHƯA XONG kế tiếp trong danh sách đang thấy; hết thì đóng. */
  function advance(fromId: string) {
    const eff = rows.map((r) => ({ id: r.id, ...effective(r) }))
    const nxt = nextTodo(eff, fromId)
    const cat = nxt ? rows.find((r) => r.id === nxt.id) : undefined
    if (cat) openFor(cat)
    else closeSheet()
  }

  /**
   * Gán một tổ hợp cho CẢ nhóm (cha + mọi con), kể cả mục đang bị bộ lọc giấu đi.
   *
   * Cố ý không giới hạn theo bộ lọc: nhãn nút nói "cả nhóm", mà "cả nhóm trừ những cái
   * đang bị ẩn" là một lời hứa khác. Bù lại, câu xác nhận đếm đúng số mục ĐÃ phân loại
   * sắp bị ghi đè — đó là thứ duy nhất không hoàn tác được bằng mắt.
   */
  async function applyToGroup(parent: CategoryRow, need: NeedLevel, cost: CostType, label: string) {
    const members = membersOf(parent.id)
    const overwrite = members.filter((c) => !isTodo(c)).length
    const ok = await confirmDialog({
      title: `Gán “${label}” cho nhóm ${parent.name}?`,
      message:
        `${members.length} danh mục (cả nhóm cha).` +
        (overwrite > 0 ? ` ${overwrite} mục đã có phân loại sẽ bị ghi đè.` : ''),
      confirmLabel: 'Gán',
    })
    if (!ok) return
    closeSheet()
    setPending((p) => {
      const next = { ...p }
      for (const c of members) next[c.id] = { need_level: need, cost_type: cost }
      return next
    })
    try {
      await Promise.all(
        members.map((c) =>
          update.mutateAsync({ id: c.id, patch: { need_level: need, cost_type: cost } }),
        ),
      )
      showToast(`Đã gán “${label}” cho ${members.length} danh mục`)
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Không lưu được phân loại', 'error')
    } finally {
      // Dọn TOÀN BỘ trạng thái chờ của nhóm một lượt: từng mục tự dọn như `saveBoth`
      // thì phải so lại từng trục, mà ở đây cả nhóm đi cùng một giá trị.
      setPending((p) => {
        const next = { ...p }
        for (const c of members) delete next[c.id]
        return next
      })
    }
  }

  /** Một dòng danh mục = một nút mở bảng chọn. `isParent` = dòng của danh mục cha. */
  const row = (c: CategoryRow, isParent: boolean) => {
    const eff = effective(c)
    const done = isClassified(eff)
    return (
      <button
        key={c.id}
        type="button"
        onClick={() => openFor(c)}
        className="flex min-h-11 w-full items-center gap-2 border-b border-border-subtle px-3 py-1.5 text-left transition last:border-b-0 hover:bg-surface-sunken"
      >
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          <span aria-hidden>{c.icon}</span>
          <span className="min-w-0 truncate text-sm text-fg-primary">{c.name}</span>
          {/* Chỉ "· cả nhóm", KHÔNG kèm số mục con: header nhóm ngay phía trên đã in
              "N mục con", và ở cỡ chữ 1,25×/375px cái đuôi dài đó (shrink-0) ép tên
              danh mục xuống 0 — dòng cha hiện ra chỉ còn mỗi icon. */}
          {isParent && <span className="shrink-0 text-2xs text-fg-muted">· cả nhóm</span>}
        </span>
        <StatusChip tone={done ? 'good' : 'warn'} className="shrink-0">
          {summaryLabel(eff)}
        </StatusChip>
      </button>
    )
  }

  // ---- Dữ liệu cho bảng chọn đang mở -------------------------------------------------
  const sheetOne = sheet?.mode === 'one' ? (all.find((c) => c.id === sheet.id) ?? null) : null
  const sheetParent =
    sheet?.mode === 'group' ? (all.find((c) => c.id === sheet.parentId) ?? null) : null
  const sheetOneParent = sheetOne?.parent_id
    ? (categories.find((c) => c.id === sheetOne.parent_id) ?? null)
    : null
  const groupMembers = sheetParent ? membersOf(sheetParent.id) : []
  const draftLabel =
    draftNeed !== null && draftCost !== null
      ? `${NEED_CHOICES.find(([v]) => v === draftNeed)![1]} · ${
          COST_CHOICES.find(([v]) => v === draftCost)![1]
        }`
      : null
  /** Sau mục đang mở còn mục chưa xong nào không — quyết định chữ trên nút Lưu. */
  const hasNext =
    sheetOne !== null &&
    nextTodo(
      rows.map((r) => ({ id: r.id, ...effective(r) })),
      sheetOne.id,
    ) !== null
  /** "Xoá phân loại" chỉ hiện khi có gì để xoá. */
  const canClear =
    sheetOne !== null &&
    (effective(sheetOne).need_level !== null || effective(sheetOne).cost_type !== null)

  function handleSheetSave() {
    if (!sheetOne || draftNeed === null || draftCost === null) return
    saveBoth(sheetOne.id, draftNeed, draftCost)
    advance(sheetOne.id)
  }

  return (
    <div className="flex flex-col gap-3 p-3 lg:p-6">
      <PageHeader title="Phân loại chi tiêu" back="/settings/categories">
        <span className="text-2xs text-fg-muted">
          <Num tone="muted">{doneCount}</Num>/<Num tone="muted">{all.length}</Num> xong
        </span>
        <FilterChip on={onlyTodo} onClick={() => setParam('todo', onlyTodo ? null : '1')}>
          Chưa phân loại · <Num tone={onlyTodo ? 'neutral' : 'muted'}>{todoCount}</Num>
        </FilterChip>
      </PageHeader>

      <Guide className="rounded-lg bg-surface-sunken p-3 text-sm text-fg-secondary">
        Gán mỗi danh mục Chi vào <b>Tính chất</b> (Thiết yếu, Linh hoạt…) và <b>Loại chi</b> (Cố
        định/Biến đổi) để xem cơ cấu chi tiêu ở Báo cáo. Bấm vào một dòng để chọn. Danh mục{' '}
        <b>cha</b> cũng cần gán: trần nhóm và giao dịch ghi thẳng vào cha đều lấy nhãn của chính
        nó, không suy từ các mục con.
      </Guide>

      {pickedIds && (
        <p className="text-sm font-medium text-fg-muted">
          Đang xem {pickedIds.size} danh mục từ Ngân sách ·{' '}
          <Link to="/settings/categories/classify" className="text-fg-accent underline">
            Xem tất cả
          </Link>
        </p>
      )}

      {rows.length === 0 ? (
        <Card padding="none">
          <EmptyState compact>{onlyTodo ? 'Đã phân loại hết 🎉' : 'Chưa có danh mục Chi'}</EmptyState>
        </Card>
      ) : (
        <Card as="section" elevation="panel" padding="none" className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-border-panel bg-surface-chrome px-3 py-2.5 text-2xs uppercase tracking-label text-fg-muted">
            <span>Danh mục</span>
            <span>Phân loại</span>
          </div>

          {groups.map((g) => {
            // Cha có dòng riêng thì KHÔNG in thêm tiêu đề xám cùng tên ngay trên nó —
            // chính dòng đó đã mang tên và biểu tượng của nhóm.
            const parentRow = g.parent && g.rows[0]?.id === g.parent.id ? g.rows[0] : null
            const parent = g.parent
            const todoInGroup = parent ? membersOf(parent.id).filter(isTodo).length : 0
            return (
              <div key={parent ? parent.id : `leaf:${g.rows[0].id}`}>
                {parent && (
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border-panel bg-surface-chrome px-3 py-1.5 lg:py-0.5">
                    {/* basis-24 chứ để flex-1 co tự do: `flex-1` là basis 0, nên tên
                        nhóm bị bóp về 0 TRƯỚC khi nút shrink-0 chịu xuống dòng — ở cỡ
                        chữ 1,25×/375px header hiện ra chỉ còn "🏠 N…". 6rem là sàn đủ
                        cho tên viết hoa 11px mà vẫn giữ nút ở cùng hàng tại 375px cỡ
                        chữ thường; chỉ cỡ 1,25× mới đẩy nút xuống dòng. */}
                    <SectionTitle role="micro" className="min-w-0 flex-1 basis-24 truncate">
                      <span aria-hidden>{parent.icon}</span> {parent.name}
                    </SectionTitle>
                    <span className="shrink-0 text-2xs text-fg-muted">
                      <Num tone="muted">{childCount(parent.id)}</Num> mục con
                      {todoInGroup > 0 && (
                        <>
                          {' · '}
                          <Num tone="warn">{todoInGroup}</Num> chưa xong
                        </>
                      )}
                    </span>
                    <ActionButton className="shrink-0" onClick={() => openGroup(parent.id)}>
                      Áp cho cả nhóm
                    </ActionButton>
                  </div>
                )}
                {g.rows.map((c) => row(c, parentRow !== null && c.id === parentRow.id))}
              </div>
            )
          })}
        </Card>
      )}

      {/* ---- Bảng chọn (đúng khuôn sheet của BudgetMethodSheet) ---------------------- */}
      {(sheetOne || sheetParent) && (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 lg:items-center animate-overlay-in"
          onClick={closeSheet}
        >
          <div
            className="max-h-[92vh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-2xl bg-surface-page p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:rounded-2xl animate-sheet-in lg:animate-sheet-pop"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-1 flex items-center justify-between">
              <SectionTitle role="block">
                {sheetParent ? (
                  <>Áp cho cả nhóm {sheetParent.name}</>
                ) : (
                  <>
                    <span aria-hidden>{sheetOne!.icon}</span> {sheetOne!.name}
                  </>
                )}
              </SectionTitle>
              <button
                type="button"
                onClick={closeSheet}
                className="rounded-md px-3 py-1.5 text-sm text-fg-muted hover:bg-surface-sunken"
              >
                Đóng
              </button>
            </div>

            {sheetParent ? (
              // font-medium: đây là NHÃN dữ liệu (đếm thành viên nhóm) cùng dáng với dòng
              // "Đang xem N danh mục" — không phải văn xuôi dạy, guardrail phân theo đó.
              <p className="text-sm font-medium text-fg-muted">
                <span aria-hidden>{sheetParent.icon}</span>{' '}
                <Num tone="muted">{groupMembers.length}</Num> danh mục, tính cả nhóm cha
              </p>
            ) : sheetOneParent ? (
              <p className="text-sm text-fg-muted">
                thuộc nhóm <span aria-hidden>{sheetOneParent.icon}</span> {sheetOneParent.name}
              </p>
            ) : null}

            <div className="mt-3 flex flex-col gap-3">
              <Card as="section" padding="md">
                <SectionTitle role="micro" as="h3">
                  Tính chất
                </SectionTitle>
                <div
                  role="group"
                  aria-label="Tính chất"
                  className="mt-1.5 flex flex-wrap gap-2"
                >
                  {NEED_CHOICES.map(([v, label]) => (
                    <FilterChip key={v} on={draftNeed === v} onClick={() => setDraftNeed(v)}>
                      {label}
                    </FilterChip>
                  ))}
                </div>
                <SectionTitle role="micro" as="h3" className="mt-3">
                  Loại chi
                </SectionTitle>
                <div role="group" aria-label="Loại chi" className="mt-1.5 flex flex-wrap gap-2">
                  {COST_CHOICES.map(([v, label]) => (
                    <FilterChip key={v} on={draftCost === v} onClick={() => setDraftCost(v)}>
                      {label}
                    </FilterChip>
                  ))}
                </div>
              </Card>

              {sheetParent ? (
                <ActionButton
                  variant="primary"
                  className="w-full"
                  disabled={draftLabel === null || update.isPending}
                  onClick={() =>
                    draftNeed !== null &&
                    draftCost !== null &&
                    applyToGroup(sheetParent, draftNeed, draftCost, draftLabel!)
                  }
                >
                  Gán cho cả nhóm
                </ActionButton>
              ) : (
                <>
                  <ActionButton
                    variant="primary"
                    className="w-full"
                    disabled={draftLabel === null}
                    onClick={handleSheetSave}
                  >
                    {hasNext ? 'Lưu · mục kế tiếp →' : 'Lưu'}
                  </ActionButton>
                  {(hasNext || canClear) && (
                    <div className="flex items-center justify-between">
                      {canClear ? (
                        <button
                          type="button"
                          onClick={() => {
                            saveBoth(sheetOne!.id, null, null)
                            closeSheet()
                          }}
                          className="text-sm text-fg-muted hover:text-fg-primary"
                        >
                          Xoá phân loại
                        </button>
                      ) : (
                        <span />
                      )}
                      {hasNext && (
                        <button
                          type="button"
                          onClick={() => advance(sheetOne!.id)}
                          className="text-sm font-medium text-fg-accent"
                        >
                          Bỏ qua — mục kế tiếp ›
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
