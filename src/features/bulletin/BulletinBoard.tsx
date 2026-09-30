// Bảng module của Bản tin — phần VẼ: dải trang, lưới kéo–thả, khung từng module.
//
// Mô hình và mọi phép biến đổi ở board.ts (thuần, có test). BulletinPage.tsx vẫn là nơi
// tính MỌI con số và dựng từng khối; nó đưa vào đây một bảng `slots` "loại module → cách
// vẽ", và file này chỉ quyết định khối nào đứng ở ô nào.
//
// Bốn quyết định đáng nhớ:
//
//  1. KHÔNG có chế độ "Sắp xếp" — lúc nào cũng kéo được. Hai rủi ro của việc đó được chặn
//     theo thiết bị trỏ, không phải bằng một nút bật/tắt:
//       · chuột: nắm BẤT KỲ chỗ nào không bấm được của thẻ (tiêu đề, chữ, nền). Nút, link,
//         ô nhập, dải chọn và vùng biểu đồ nằm trong `CANCEL` nên bấm vào chúng vẫn là
//         bấm; thêm ngưỡng 5px để một cú bấm hơi rung tay không thành cú kéo.
//       · cảm ứng: CHỈ nắm ở tay nắm ⠿ trên đỉnh thẻ (`touch-action: none` riêng ở đó).
//         Cho nắm cả thẻ thì mọi cú vuốt để cuộn trang thành cú nhấc thẻ.
//  2. Tay nắm ⠿ và nút ⋯ nằm CHUNG một viên thuốc nhỏ vắt ngang mép trên của thẻ — không
//     có thanh tiêu đề thứ hai. Tên module đã là tiêu đề của chính thẻ; in lại lần nữa
//     phía trên nó chỉ là hai hộp cho một cái tên. Viên thuốc hiện khi rê chuột/tiêu điểm
//     vào thẻ, luôn hiện (mờ) trên thiết bị cảm ứng (không có hover).
//  3. Panel chữ (Việc cần làm, Ngân sách…) tự đo chiều cao nội dung và giữ ô cao đúng
//     chừng đó — cắt bớt là mất thông tin, còn dư là một khoảng trống giữa trang. Biểu đồ
//     thì người dùng kéo giãn cả hai chiều. Xem `fit` ở board.ts.
//  4. Lưới dùng `transform` để dời ô (mượt, chạy trên GPU). Cái giá: một phần tử
//     `position: fixed` NẰM TRONG ô sẽ bị ô đó giam lại. Các panel hiện không mở sheet từ
//     bên trong (sheet sửa giao dịch dựng ở BulletinPage, ngoài lưới) — thêm panel mới có
//     sheet thì dựng sheet ngoài lưới, hoặc đổi `positionStrategy` sang `absoluteStrategy`.
import { Suspense, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Responsive, useContainerWidth, type Layout, type LayoutItem } from 'react-grid-layout'
import { Check, GripHorizontal, MoreHorizontal, Pencil, Plus, RotateCcw, Trash2, X } from 'lucide-react'
import { ActionButton, Card, EmptyState, IconButton, SectionTitle, SegmentedControl } from '../../components/ui'
import { Guide } from '../../components/Guide'
import { useEscClose } from '../../hooks/useEscClose'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { confirmDialog, promptDialog, showToast } from '../../lib/dialog'
import { showUndoToast } from '../../lib/undoToast'
import { tr } from '../../i18n'
import {
  BPS,
  BREAKPOINTS,
  COLS,
  GAP,
  MODULES,
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
  resetPage,
  rowsFor,
  scaleW,
  setActive,
  setLayout,
  setView,
  viewOf,
  writeBoard,
  type BoardModule,
  type BoardPage,
  type BoardState,
  type Bp,
  type ModuleType,
  type Preset,
} from './board'

/** Cách vẽ từng loại module. `onView` đổi cách xem (chỉ module có nhiều cách xem mới dùng). */
export type Slots = Record<ModuleType, (view: string, onView: (v: string) => void) => ReactNode>

const MARGIN = [GAP, GAP] as const
const PADDING = [0, 0] as const
/** Chỗ bấm được thì không bao giờ là chỗ nắm — xem quyết định 1 ở đầu file. */
const CANCEL =
  'a, button, input, select, textarea, label, summary, [role="tab"], [role="button"], [role="switch"], [role="menu"], .recharts-wrapper, [data-board-nodrag]'
const GRIP = '.board-grip'

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
  const [picker, setPicker] = useState(false)
  const [newPage, setNewPage] = useState(false)
  // Không có hover = thiết bị cảm ứng → chỉ kéo bằng tay nắm (quyết định 1).
  const touch = useMediaQuery('(hover: none)')

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

  const saveLayout = useCallback(
    (layout: Layout) => update((s) => setLayout(s, page.id, bp, layout)),
    [update, page.id, bp],
  )

  const onView = (id: string) => (v: string) => update((s) => setView(s, page.id, id, v))

  // Bỏ một module không hỏi lại — hỏi thì mỗi lần dọn trang là một chuỗi hộp thoại. Thay
  // vào đó là toast Hoàn tác: dựng lại ĐÚNG trang lúc trước, gồm cả vị trí các ô.
  function removeWithUndo(m: BoardModule) {
    const before: BoardPage = page
    update((s) => removeModule(s, before.id, m.id))
    showUndoToast(tr('Đã bỏ “{title}”', { title: moduleDef(m.type).title }), () =>
      update((s) => ({ ...s, pages: s.pages.map((p) => (p.id === before.id ? before : p)) })),
    )
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
      <div className="flex flex-wrap items-center gap-1">
        {/* Dải trang cuộn ngang khi nhiều trang: ở 375px + Cỡ chữ 1,25× bốn năm tên trang
            không vừa một hàng, và xuống dòng giữa dải tab đọc ra như hai dải khác nhau. */}
        <div ref={tabsRef} className="min-w-0 flex-1 overflow-x-auto">
          <SegmentedControl
            size="sm"
            stretch={false}
            label={tr('Trang của Bản tin')}
            value={page.id}
            onChange={(id) => update((s) => setActive(s, id))}
            items={board.pages.map((p) => ({ value: p.id, label: <span className="whitespace-nowrap">{pageName(p)}</span> }))}
          />
        </div>
        <IconButton variant="ghost" aria-label={tr('Thêm trang')} title={tr('Thêm trang')} onClick={() => setNewPage(true)}>
          <Plus className="h-5 w-5" />
        </IconButton>
        <Menu
          label={tr('Tuỳ chọn trang “{name}”', { name: pageName(page) })}
          trigger={<MoreHorizontal className="h-5 w-5" />}
          triggerClassName="inline-flex size-11 items-center justify-center rounded-full text-fg-muted transition hover:bg-surface-sunken hover:text-fg-primary"
          align="right"
          items={[
            { key: 'add', label: tr('Thêm module'), icon: <Plus className="h-4 w-4" />, onSelect: () => setPicker(true) },
            { key: 'rename', label: tr('Đổi tên trang'), icon: <Pencil className="h-4 w-4" />, onSelect: rename },
            {
              key: 'reset',
              label: page.preset ? tr('Khôi phục mặc định') : tr('Xếp lại'),
              icon: <RotateCcw className="h-4 w-4" />,
              onSelect: reset,
            },
            ...(board.pages.length > 1
              ? [{ key: 'del', label: tr('Xoá trang'), icon: <Trash2 className="h-4 w-4" />, onSelect: remove, danger: true }]
              : []),
          ]}
        />
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
              dragConfig={touch ? { enabled: true, handle: GRIP, threshold: 3 } : { enabled: true, cancel: CANCEL, threshold: 5 }}
              resizeConfig={{ enabled: true }}
              onDragStop={(layout) => saveLayout(layout)}
              onResizeStop={(layout) => saveLayout(layout)}
            >
              {page.modules.map((m) => (
                <div key={m.id}>
                  <ModuleFrame m={m} onMeasure={onMeasure} onView={onView(m.id)} onRemove={() => removeWithUndo(m)}>
                    {slots[m.type](viewOf(m), onView(m.id))}
                  </ModuleFrame>
                </div>
              ))}
            </Responsive>
          )
        )}
      </div>

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

// ---- Menu nhỏ (⋯) --------------------------------------------------------------------

interface MenuItem {
  key: string
  label: string
  icon?: ReactNode
  onSelect: () => void
  danger?: boolean
  /** mục chọn-một (cách xem): có dấu ✓ khi đang chọn */
  checked?: boolean
}

function Menu({
  label,
  trigger,
  triggerClassName,
  items,
  align,
}: {
  label: string
  trigger: ReactNode
  triggerClassName: string
  items: (MenuItem | 'sep')[]
  align: 'right' | 'center'
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    // Mở ra thì tiêu điểm vào mục đầu — bàn phím đi tiếp bằng Tab / mũi tên.
    ref.current?.querySelector<HTMLElement>('[role^="menuitem"]')?.focus()
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const onKeyNav = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const list = [...(ref.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])]
    const i = list.indexOf(document.activeElement as HTMLElement)
    list[(i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length]?.focus()
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={triggerClassName}
      >
        {trigger}
      </button>
      {open && (
        <div
          role="menu"
          aria-label={label}
          onKeyDown={onKeyNav}
          className={`absolute top-full z-30 mt-1 min-w-48 rounded-lg border border-border-panel bg-surface py-1 shadow-lg animate-pop-in ${
            align === 'right' ? 'right-0' : 'left-1/2 -translate-x-1/2'
          }`}
        >
          {items.map((it, i) =>
            it === 'sep' ? (
              <div key={`sep-${i}`} role="separator" className="my-1 border-t border-border-subtle" />
            ) : (
              <button
                key={it.key}
                type="button"
                role={it.checked === undefined ? 'menuitem' : 'menuitemradio'}
                aria-checked={it.checked}
                onClick={() => {
                  setOpen(false)
                  it.onSelect()
                }}
                className={`flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm hover:bg-surface-sunken lg:min-h-9 ${
                  it.danger ? 'text-money-out' : 'text-fg-primary'
                }`}
              >
                <span className="flex w-4 shrink-0 justify-center text-fg-muted" aria-hidden>
                  {it.checked ? <Check className="h-4 w-4 text-fg-accent" /> : it.icon}
                </span>
                {it.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  )
}

// ---- Khung một module ----------------------------------------------------------------

interface FrameProps {
  m: BoardModule
  onMeasure: (id: string, rows: number) => void
  onView: (v: string) => void
  onRemove: () => void
  children: ReactNode
}

function ModuleFrame({ m, onMeasure, onView, onRemove, children }: FrameProps) {
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

  const view = viewOf(m)
  const items: (MenuItem | 'sep')[] = [
    ...(d.views ?? []).map((v) => ({ key: `v-${v.id}`, label: v.label, checked: v.id === view, onSelect: () => onView(v.id) })),
    ...(d.views ? (['sep'] as const) : []),
    { key: 'rm', label: tr('Bỏ khỏi trang'), icon: <X className="h-4 w-4" />, onSelect: onRemove, danger: true },
  ]

  return (
    <div className={auto ? 'relative min-w-0' : 'relative h-full min-w-0'}>
      {/* Viên thuốc công cụ vắt ngang mép trên thẻ: tay nắm + ⋯ (quyết định 2). Nó là
          hộp DUY NHẤT thêm vào quanh thẻ — tên module vẫn là tiêu đề của chính thẻ. */}
      <div className="board-tools absolute top-0 left-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 items-center rounded-full border border-border-panel bg-surface shadow-sm">
        <span
          className="board-grip flex h-7 cursor-grab touch-none items-center pr-0.5 pl-2.5 text-fg-muted select-none active:cursor-grabbing"
          title={tr('Kéo để đổi chỗ')}
          aria-hidden
        >
          <GripHorizontal className="h-4 w-4" />
        </span>
        <Menu
          label={tr('Tuỳ chọn “{title}”', { title: d.title })}
          trigger={<MoreHorizontal className="h-4 w-4" />}
          // Vùng chạm 44px bằng lớp giả ::after — viên thuốc chỉ cao 28px để không đè lên
          // tiêu đề thẻ (lề trên của thẻ là 14px).
          triggerClassName="relative flex h-7 w-8 items-center justify-center rounded-full text-fg-muted after:absolute after:-inset-2 after:content-[''] hover:text-fg-primary"
          align="center"
          items={items}
        />
      </div>
      <div ref={auto ? ref : undefined} className={auto ? undefined : 'h-full'}>
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
  const groups: [string, typeof MODULES][] = [
    [tr('Biểu đồ'), MODULES.filter((m) => m.fit === 'fill')],
    [tr('Khối'), MODULES.filter((m) => m.fit === 'auto')],
  ]
  return (
    <Sheet title={tr('Thêm module vào “{page}”', { page: pageTitle })} onClose={onClose}>
      <Guide className="mb-3 text-sm text-fg-secondary">
        {tr('Kéo thẻ để đổi chỗ (điện thoại: kéo tay nắm ⠿ trên đỉnh thẻ), kéo mép phải hoặc góc dưới để đổi cỡ. Bố cục điện thoại và máy tính được nhớ riêng.')}
      </Guide>
      <div className="-mx-1 flex min-h-0 flex-col gap-4 overflow-y-auto px-1">
        {groups.map(([label, defs]) => (
          <section key={label} className="flex flex-col gap-1.5">
            <SectionTitle role="micro" as="h3">{label}</SectionTitle>
            <ul className="flex flex-col divide-y divide-border-subtle rounded-lg border border-border-panel">
              {defs.map((d) => {
                const ok = canAddType(d.type)
                return (
                  <li key={d.type} className="flex items-center gap-3 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-fg-primary">{d.title}</p>
                      <p className="text-2xs text-fg-muted">
                        {d.desc}
                        {d.views && ` · ${tr('{n} cách xem', { n: d.views.length })}`}
                      </p>
                    </div>
                    <ActionButton onClick={() => onAdd(d.type)} disabled={!ok} aria-label={tr('Thêm “{title}”', { title: d.title })}>
                      {ok ? <Plus className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                      {ok ? tr('Thêm') : tr('Đã có')}
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
