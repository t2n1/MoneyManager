// Bảng module của Bản tin — phần VẼ: dải trang, bảng "Tùy chỉnh trang", lưới kéo–thả.
//
// Mô hình và mọi phép biến đổi ở board.ts (thuần, có test). BulletinPage.tsx vẫn là nơi
// tính MỌI con số và dựng từng khối; nó đưa vào đây một bảng `slots` "loại module → cách
// vẽ", và file này chỉ quyết định khối nào đứng ở ô nào.
//
// Ba quyết định đáng nhớ:
//
//  1. Kéo được LUÔN — không có chế độ Sắp xếp (người dùng bỏ 2026-09-30: phải bấm một nút
//     rồi nhìn cả trang bọc khung xanh chỉ để dời một thẻ là quá nhiều nghi thức). Nhưng chỉ
//     kéo bằng TAY NẮM nhỏ giữa mép trên module: kéo cả thân thì ở điện thoại không cuộn
//     trang được nữa (mọi cú vuốt thành cú kéo), và bấm vào một cột biểu đồ thành nhấc cả
//     thẻ lên. Tay nắm và tay đổi cỡ chỉ hiện khi trỏ chuột vào module (máy có chuột); máy
//     cảm ứng không có "trỏ vào" nên chúng hiện mờ thường trực — xem `.board-tools` ở index.css.
//     Cạnh tay nắm có nút ✕ bỏ module ngay tại chỗ (kèm Hoàn tác). Đổi tên / xoá / khôi
//     phục trang nằm trong bảng Tùy chỉnh trang; "Tự xếp gọn" là một nút trên thanh trang.
//  2. Panel chữ (Việc cần làm, Ngân sách…) tự đo chiều cao nội dung và giữ ô cao đúng
//     chừng đó — cắt bớt là mất thông tin, còn dư là một khoảng trống giữa trang. Biểu đồ
//     thì người dùng kéo giãn cả hai chiều. Xem `fit` ở board.ts.
//  3. Lưới dùng `transform` để dời ô (mượt, chạy trên GPU). Cái giá: một phần tử
//     `position: fixed` NẰM TRONG ô sẽ bị ô đó giam lại. Các panel hiện không mở sheet từ
//     bên trong (sheet sửa giao dịch dựng ở BulletinPage, ngoài lưới) — thêm panel mới có
//     sheet thì dựng sheet ngoài lưới, hoặc đổi `positionStrategy` sang `absoluteStrategy`.
import { Suspense, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Responsive, useContainerWidth, type Layout, type LayoutItem } from 'react-grid-layout'
import { Check, GripHorizontal, Pencil, Plus, RotateCcw, SlidersHorizontal, Trash2, WandSparkles, X } from 'lucide-react'
import { ActionButton, Card, EmptyState, IconButton, SectionTitle, SegmentedControl } from '../../components/ui'
import { Guide } from '../../components/Guide'
import { useEscClose } from '../../hooks/useEscClose'
import { confirmDialog, promptDialog, showToast } from '../../lib/dialog'
import { showUndoToast } from '../../lib/undoToast'
import { ModuleThumb } from './ModuleThumb'
import { tr } from '../../i18n'
import {
  BPS,
  BREAKPOINTS,
  COLS,
  GAP,
  MODULES,
  MODULE_GROUPS,
  PRESET_NAMES,
  ROW_H,
  addModule,
  addPage,
  bpFor,
  canAdd,
  layoutFor,
  moduleDef,
  pageName,
  readBoard,
  removeModule,
  removePage,
  renamePage,
  replacePage,
  resetPage,
  rowsFor,
  scaleW,
  setActive,
  setLayout,
  setView,
  sameCells,
  tidyCells,
  viewOf,
  writeBoard,
  type BoardModule,
  type BoardState,
  type Bp,
  type ModuleType,
  type Preset,
} from './board'

/** Cách vẽ từng loại module. `onView` đổi cách xem (chỉ module có nhiều cách xem mới dùng). */
export type Slots = Record<ModuleType, (view: string, onView: (v: string) => void) => ReactNode>

const MARGIN = [GAP, GAP] as const
const PADDING = [0, 0] as const
const DRAG_HANDLE = '.board-drag'

function useBoard() {
  const [board, setBoard] = useState<BoardState>(readBoard)
  const update = useCallback((f: (s: BoardState) => BoardState) => {
    setBoard((s) => {
      const n = f(s)
      if (n !== s) writeBoard(n)
      return n
    })
  }, [])
  return [board, update] as const
}

export function BulletinBoard({ slots }: { slots: Slots }) {
  const [board, update] = useBoard()
  const page = board.pages.find((p) => p.id === board.activeId) ?? board.pages[0]
  const [tools, setTools] = useState(false)
  const [picker, setPicker] = useState(false)
  const [newPage, setNewPage] = useState(false)

  // Dải trang cuộn ngang ở màn hẹp: trang đang chọn phải luôn nằm trong tầm mắt, không
  // thì vừa tạo trang mới xong đã không thấy nó đâu (đo được ở 375px, trang thứ hai khuất).
  const tabsRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    tabsRef.current
      ?.querySelector<HTMLElement>('[data-seg-active="true"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [board.activeId, board.pages.length])

  const { width, containerRef, mounted } = useContainerWidth({ measureBeforeMount: true })
  const bp = bpFor(width)

  // Chiều cao ĐO ĐƯỢC của panel tự-cao, theo hàng lưới. Không lưu vào bản lưu: nó phụ
  // thuộc bề rộng hiện tại, đo lại mỗi lần là đúng hơn nhớ một con số của hôm qua.
  const [measured, setMeasured] = useState<Record<string, number>>({})
  const onMeasure = useCallback((id: string, rows: number) => {
    setMeasured((m) => (m[id] === rows ? m : { ...m, [id]: rows }))
  }, [])

  // Ô dời mượt (transition) CHỈ sau khi trang đã yên: lúc mở màn, ô nhảy từ chiều cao ước
  // lượng sang chiều cao đo được — cho nó trượt thì cả trang "bơi" một nhịp mỗi lần mở app.
  const [settled, setSettled] = useState(false)
  useEffect(() => {
    setSettled(false)
    const t = setTimeout(() => setSettled(true), 600)
    return () => clearTimeout(t)
  }, [page.id, bp])

  const layouts = useMemo(() => {
    const out: Partial<Record<Bp, Layout>> = {}
    for (const b of BPS) {
      const cols = COLS[b]
      out[b] = layoutFor(page, b).map((c): LayoutItem => {
        const m = page.modules.find((x) => x.id === c.i)
        const d = m ? moduleDef(m.type) : null
        const auto = d?.fit === 'auto'
        const h = auto && b === bp && measured[c.i] ? measured[c.i] : c.h
        const minW = d ? Math.min(cols, scaleW(d.minW, cols)) : 1
        return {
          ...c,
          w: Math.max(c.w, minW),
          h,
          minW,
          minH: auto ? h : rowsFor(140),
          maxH: auto ? h : undefined,
          // Panel tự-cao chỉ giãn NGANG — nên ở lưới một cột thì không có gì để giãn;
          // biểu đồ giãn cả hai chiều (một cột: chỉ còn chiều dọc).
          isResizable: !(auto && cols === 1),
          resizeHandles: auto ? ['e'] : cols === 1 ? ['s'] : ['se', 'e', 's'],
        }
      })
    }
    return out
  }, [page, measured, bp])

  // Bố cục lưới ĐANG VẼ (sau khi lưới tự nén dọc và thay chiều cao đo được) — khác bản
  // lưu, vốn giữ toạ độ y cũ. Tự xếp gọn phải xuất phát từ cái người dùng đang thấy.
  const live = useRef<Layout | null>(null)

  const saveLayout = useCallback(
    (layout: Layout) => update((s) => setLayout(s, page.id, bp, layout)),
    [update, page.id, bp],
  )

  const onView = (id: string) => (v: string) => update((s) => setView(s, page.id, id, v))

  // Bỏ module luôn đi kèm Hoàn tác: nút ✕ nằm ngay trên thẻ, bấm nhầm ở điện thoại là
  // chuyện sẽ xảy ra — và dựng lại một module đã chỉnh cỡ, chỉnh chỗ thì mất công hơn nhiều.
  function removeWithUndo(m: BoardModule) {
    const snapshot = page
    update((s) => removeModule(s, page.id, m.id))
    showUndoToast(tr('Đã bỏ “{title}”', { title: moduleDef(m.type).title }), () => update((s) => replacePage(s, snapshot)))
  }

  // Xếp theo bố cục ĐANG THẤY (đã gồm chiều cao đo được của panel tự-cao), chỉ ở
  // breakpoint hiện tại — xếp gọn ở điện thoại không được đụng tới bố cục máy tính.
  function tidy() {
    const current = (live.current ?? layouts[bp] ?? []).map(({ i, x, y, w, h }) => ({ i, x, y, w, h }))
    const next = tidyCells(current, COLS[bp])
    if (sameCells(current, next)) {
      showToast(tr('Trang đã gọn rồi'), 'info', 1800)
      return
    }
    const snapshot = page
    update((s) => setLayout(s, page.id, bp, next))
    showUndoToast(tr('Đã xếp gọn trang'), () => update((s) => replacePage(s, snapshot)))
  }

  async function rename() {
    const name = await promptDialog({
      title: tr('Đổi tên trang'),
      defaultValue: page.name ?? pageName(page),
      placeholder: tr('Tên trang'),
    })
    if (name !== null) update((s) => renamePage(s, page.id, name))
  }

  async function remove() {
    const ok = await confirmDialog({
      title: tr('Xoá trang “{name}”?', { name: pageName(page) }),
      message: tr('Chỉ xoá cách sắp xếp của trang này — không đụng tới dữ liệu nào.'),
      confirmLabel: tr('Xoá trang'),
      danger: true,
    })
    if (ok) update((s) => removePage(s, page.id))
  }

  async function reset() {
    const ok = await confirmDialog({
      title: page.preset ? tr('Khôi phục trang về mặc định?') : tr('Xếp lại chỗ các module?'),
      message: page.preset
        ? tr('Module và vị trí trở về như lúc mới có trang. Tên trang giữ nguyên.')
        : tr('Module giữ nguyên, chỉ xếp lại vị trí từ đầu.'),
      confirmLabel: tr('Khôi phục'),
    })
    if (ok) update((s) => resetPage(s, page.id))
  }

  function createPage(name: string, preset: Preset | null) {
    update((s) => addPage(s, { name: name.trim() || null, preset }))
    setNewPage(false)
    // Trang trống thì mở luôn bảng module — trang trống không có gì để xem cả.
    if (!preset) setPicker(true)
  }

  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2">
        {/* Dải trang cuộn ngang khi nhiều trang: ở 375px + Cỡ chữ 1,25× bốn năm tên trang
            không vừa một hàng, và xuống dòng giữa dải tab đọc ra như hai dải khác nhau. */}
        <div ref={tabsRef} className="min-w-0 basis-full overflow-x-auto sm:flex-1 sm:basis-0">
          <SegmentedControl
            size="sm"
            stretch={false}
            label={tr('Trang của Bản tin')}
            value={page.id}
            onChange={(id) => update((s) => setActive(s, id))}
            items={board.pages.map((p) => ({ value: p.id, label: <span className="whitespace-nowrap">{pageName(p)}</span> }))}
          />
        </div>
        <IconButton variant="ghost" className="ml-auto" aria-label={tr('Thêm trang')} title={tr('Thêm trang')} onClick={() => setNewPage(true)}>
          <Plus className="h-5 w-5" />
        </IconButton>
        {page.modules.length > 1 && (
          <IconButton variant="ghost" aria-label={tr('Tự xếp gọn')} title={tr('Tự xếp gọn')} onClick={tidy}>
            <WandSparkles className="h-5 w-5" />
          </IconButton>
        )}
        <IconButton variant="ghost" aria-label={tr('Tùy chỉnh trang')} title={tr('Tùy chỉnh trang')} onClick={() => setTools(true)}>
          <SlidersHorizontal className="h-5 w-5" />
        </IconButton>
      </div>

      <div ref={containerRef} className="min-w-0">
        {page.modules.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border-strong px-4 py-10 text-center">
            <p className="text-sm text-fg-muted">{tr('Trang này chưa có module nào.')}</p>
            <ActionButton variant="primary" onClick={() => setPicker(true)}>
              <Plus className="h-4 w-4" /> {tr('Thêm module')}
            </ActionButton>
          </div>
        ) : (
          mounted && (
            <Responsive
              width={width}
              breakpoint={bp}
              breakpoints={BREAKPOINTS}
              cols={COLS}
              layouts={layouts}
              rowHeight={ROW_H}
              margin={MARGIN}
              containerPadding={PADDING}
              className={`board ${settled ? 'board-settled' : ''}`}
              dragConfig={{ enabled: true, handle: DRAG_HANDLE, cancel: 'button', threshold: 4 }}
              resizeConfig={{ enabled: true }}
              onLayoutChange={(layout) => {
                live.current = layout
              }}
              onDragStop={(layout) => saveLayout(layout)}
              onResizeStop={(layout) => saveLayout(layout)}
            >
              {page.modules.map((m) => (
                <div key={m.id}>
                  <ModuleFrame m={m} onMeasure={onMeasure} onRemove={() => removeWithUndo(m)}>
                    {slots[m.type](viewOf(m), onView(m.id))}
                  </ModuleFrame>
                </div>
              ))}
            </Responsive>
          )
        )}
      </div>

      {tools && (
        <PageToolsSheet
          pageTitle={pageName(page)}
          modules={page.modules}
          canRemovePage={board.pages.length > 1}
          resetLabel={page.preset ? tr('Khôi phục mặc định') : tr('Xếp lại')}
          onAddModule={() => {
            setTools(false)
            setPicker(true)
          }}
          onRemoveModule={removeWithUndo}
          onRename={() => {
            setTools(false)
            void rename()
          }}
          onReset={() => {
            setTools(false)
            void reset()
          }}
          onRemovePage={() => {
            setTools(false)
            void remove()
          }}
          onClose={() => setTools(false)}
        />
      )}
      {picker && (
        <AddModuleSheet
          pageTitle={pageName(page)}
          canAddType={(t) => canAdd(page, t)}
          onAdd={(t) => {
            update((s) => addModule(s, page.id, t))
            showToast(tr('Đã thêm “{title}”', { title: moduleDef(t).title }), 'success', 1800)
          }}
          onClose={() => setPicker(false)}
        />
      )}
      {newPage && <NewPageSheet onCreate={createPage} onClose={() => setNewPage(false)} />}
    </div>
  )
}

// ---- Khung một module ----------------------------------------------------------------

interface FrameProps {
  m: BoardModule
  onMeasure: (id: string, rows: number) => void
  onRemove: () => void
  children: ReactNode
}

function ModuleFrame({ m, onMeasure, onRemove, children }: FrameProps) {
  const d = moduleDef(m.type)
  const ref = useRef<HTMLDivElement>(null)
  const auto = d.fit === 'auto'

  // Đo chiều cao THẬT của nội dung (không phải của ô): khối bọc ngoài cao `auto` nên nó
  // luôn bằng nội dung, dù ô đang cao hơn hay thấp hơn. ResizeObserver bắt cả những lần
  // đổi không đi qua React — dữ liệu về, font nạp xong, Cỡ chữ đổi, một nhóm xổ ra.
  useLayoutEffect(() => {
    const el = ref.current
    if (!auto || !el) return
    const measure = () => onMeasure(m.id, rowsFor(el.offsetHeight))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [auto, m.id, onMeasure])

  return (
    <div ref={auto ? ref : undefined} className={auto ? 'relative min-w-0' : 'relative flex h-full min-w-0 flex-col'}>
      {/* Viên công cụ nằm ĐÈ lên mép trên thẻ (nửa trên rơi vào khe giữa hai hàng), không
          chiếm một dòng riêng — nên hiện hay ẩn nó thì thẻ không nhích một pixel nào. Tay
          nắm chỉ chuột/ngón tay kéo được, không có đường bàn phím (lối đó chưa bao giờ có ở
          bảng này); nút ✕ thì bàn phím tới được và hiện ra khi được focus. */}
      <div className="board-tools">
        <span className="board-drag" title={tr('Kéo để dời “{title}”', { title: d.title })} aria-hidden>
          <GripHorizontal className="h-4 w-4" />
        </span>
        <button
          type="button"
          className="board-remove"
          aria-label={tr('Bỏ “{title}” khỏi trang', { title: d.title })}
          title={tr('Bỏ “{title}” khỏi trang', { title: d.title })}
          onClick={onRemove}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className={auto ? undefined : 'min-h-0 flex-1'}>
        {/* Module biểu đồ tải lười (xem BulletinPage) — chờ trong đúng khung của nó. */}
        <Suspense
          fallback={
            <Card elevation="panel" padding="panel" className="h-full">
              <EmptyState compact>{tr('Đang tải…')}</EmptyState>
            </Card>
          }
        >
          {children}
        </Suspense>
      </div>
    </div>
  )
}

// ---- Bảng tùy chỉnh trang ------------------------------------------------------------

function PageToolsSheet({
  pageTitle,
  modules,
  canRemovePage,
  resetLabel,
  onAddModule,
  onRemoveModule,
  onRename,
  onReset,
  onRemovePage,
  onClose,
}: {
  pageTitle: string
  modules: BoardModule[]
  canRemovePage: boolean
  resetLabel: string
  onAddModule: () => void
  onRemoveModule: (m: BoardModule) => void
  onRename: () => void
  onReset: () => void
  onRemovePage: () => void
  onClose: () => void
}) {
  return (
    <Sheet title={tr('Tùy chỉnh “{page}”', { page: pageTitle })} onClose={onClose}>
      <div className="-mx-1 flex min-h-0 flex-col gap-4 overflow-y-auto px-1">
        <Guide className="text-sm text-fg-secondary">
          {tr('Trỏ vào một module rồi kéo tay nắm giữa mép trên để đổi chỗ, kéo mép phải hoặc góc dưới để đổi cỡ. Bố cục điện thoại và máy tính được nhớ riêng.')}
        </Guide>
        <div className="flex flex-wrap items-center gap-2">
          <ActionButton variant="primary" onClick={onAddModule}>
            <Plus className="h-4 w-4" /> {tr('Thêm module')}
          </ActionButton>
          <ActionButton onClick={onRename}>
            <Pencil className="h-4 w-4" /> {tr('Đổi tên')}
          </ActionButton>
          <ActionButton onClick={onReset}>
            <RotateCcw className="h-4 w-4" /> {resetLabel}
          </ActionButton>
          {canRemovePage && (
            <ActionButton variant="danger" onClick={onRemovePage}>
              <Trash2 className="h-4 w-4" /> {tr('Xoá trang')}
            </ActionButton>
          )}
        </div>
        <section className="flex flex-col gap-1.5">
          <SectionTitle role="micro" as="h3">{tr('Module trên trang')}</SectionTitle>
          {modules.length === 0 ? (
            <p className="text-sm text-fg-muted">{tr('Trang này chưa có module nào.')}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border-subtle rounded-lg border border-border-panel">
              {modules.map((m) => {
                const title = moduleDef(m.type).title
                return (
                  <li key={m.id} className="flex items-center gap-3 py-1 pr-0.5 pl-3">
                    <ModuleThumb type={m.type} />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-fg-primary">{title}</span>
                    <IconButton variant="ghost" aria-label={tr('Bỏ “{title}” khỏi trang', { title })} onClick={() => onRemoveModule(m)}>
                      <X className="h-5 w-5" />
                    </IconButton>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    </Sheet>
  )
}

// ---- Bảng thêm module ----------------------------------------------------------------

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEscClose(onClose)
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 lg:items-center animate-overlay-in" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex max-h-[90dvh] w-full max-w-lg flex-col rounded-t-2xl bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:rounded-2xl animate-sheet-in lg:animate-sheet-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <SectionTitle role="block">{title}</SectionTitle>
          <IconButton variant="ghost" aria-label={tr('Đóng')} onClick={onClose}>
            <X className="h-5 w-5" />
          </IconButton>
        </div>
        {children}
      </div>
    </div>
  )
}

function AddModuleSheet({
  pageTitle,
  canAddType,
  onAdd,
  onClose,
}: {
  pageTitle: string
  canAddType: (t: ModuleType) => boolean
  onAdd: (t: ModuleType) => void
  onClose: () => void
}) {
  return (
    <Sheet title={tr('Thêm module vào “{page}”', { page: pageTitle })} onClose={onClose}>
      <div className="-mx-1 flex min-h-0 flex-col gap-4 overflow-y-auto px-1">
        {MODULE_GROUPS.map((g) => (
          <section key={g.id} className="flex flex-col gap-1.5">
            <div>
              <SectionTitle role="micro" as="h3">{g.label}</SectionTitle>
              <p className="text-2xs text-fg-muted">{g.desc}</p>
            </div>
            <ul className="flex flex-col divide-y divide-border-subtle rounded-lg border border-border-panel">
              {MODULES.filter((d) => d.group === g.id).map((d) => {
                const ok = canAddType(d.type)
                return (
                  <li key={d.type} className="flex items-center gap-3 px-3 py-2.5">
                    <ModuleThumb type={d.type} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-fg-primary">{d.title}</p>
                      <p className="text-2xs text-fg-muted">
                        {d.desc}
                        {d.views && ` · ${tr('{n} cách xem', { n: d.views.length })}`}
                      </p>
                    </div>
                    <ActionButton onClick={() => onAdd(d.type)} disabled={!ok} aria-label={tr('Thêm “{title}”', { title: d.title })}>
                      {ok ? <Plus className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                      {/* Điện thoại: chỉ icon — hình + chữ + nút có chữ thì cột mô tả còn
                          chừng tám ký tự mỗi dòng ở Cỡ chữ 1,25×. aria-label đã nói đủ. */}
                      <span className="max-sm:sr-only">{ok ? tr('Thêm') : tr('Đã có')}</span>
                    </ActionButton>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
    </Sheet>
  )
}

// ---- Bảng tạo trang mới --------------------------------------------------------------

type Start = 'blank' | Preset

const STARTS: { value: Start; label: string; desc: string }[] = [
  { value: 'blank', label: tr('Trang trống'), desc: tr('Tự chọn từng module.') },
  { value: 'trends', label: PRESET_NAMES.trends, desc: tr('Thu chi, tỷ lệ giữ lại, danh mục, tài sản ròng — toàn biểu đồ.') },
  { value: 'spend', label: PRESET_NAMES.spend, desc: tr('Chi luỹ kế, cơ cấu danh mục, ngân sách và giao dịch gần đây.') },
  { value: 'overview', label: PRESET_NAMES.overview, desc: tr('Một bản sao của trang Tổng quan để sắp theo ý mình.') },
]

function NewPageSheet({ onCreate, onClose }: { onCreate: (name: string, preset: Preset | null) => void; onClose: () => void }) {
  const uid = useId()
  const [name, setName] = useState('')
  const [start, setStart] = useState<Start>('blank')
  const chosen = STARTS.find((s) => s.value === start)!
  const submit = () => onCreate(name, start === 'blank' ? null : start)
  return (
    <Sheet title={tr('Trang mới')} onClose={onClose}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <div>
          <label className="mb-1 block text-sm font-medium text-fg-muted" htmlFor={`${uid}-name`}>
            {tr('Tên trang')}
          </label>
          <input
            id={`${uid}-name`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={start === 'blank' ? tr('Trang mới') : chosen.label}
            maxLength={40}
            className="w-full rounded-md border border-border-strong px-3 py-2 text-base sm:text-sm"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-fg-muted" id={`${uid}-start`}>
            {tr('Bắt đầu từ')}
          </span>
          <ul className="flex flex-col gap-1.5" role="radiogroup" aria-labelledby={`${uid}-start`}>
            {STARTS.map((s) => {
              const on = s.value === start
              return (
                <li key={s.value}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setStart(s.value)}
                    className={`flex w-full items-start gap-3 rounded-md border px-3 py-2.5 text-left transition ${on ? 'border-accent bg-accent-soft' : 'border-border-panel hover:bg-surface-sunken'}`}
                  >
                    <span
                      aria-hidden
                      className={`mt-1 size-3 shrink-0 rounded-full border-2 ${on ? 'border-accent bg-accent' : 'border-border-strong'}`}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-fg-primary">{s.label}</span>
                      <span className="block text-2xs text-fg-muted">{s.desc}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
        <div className="flex justify-end gap-2">
          <ActionButton onClick={onClose}>{tr('Hủy')}</ActionButton>
          <ActionButton variant="primary" type="submit">
            {tr('Tạo trang')}
          </ActionButton>
        </div>
      </form>
    </Sheet>
  )
}
