// Bảng module của Bản tin — phần VẼ: dải trang, chế độ "Sắp xếp", lưới kéo–thả.
//
// Mô hình và mọi phép biến đổi ở board.ts (thuần, có test). BulletinPage.tsx vẫn là nơi
// tính MỌI con số và dựng từng khối; nó đưa vào đây một bảng `slots` "loại module → cách
// vẽ", và file này chỉ quyết định khối nào đứng ở ô nào.
//
// Ba quyết định đáng nhớ:
//
//  1. Chỉ kéo được ở chế độ Sắp xếp, và chỉ kéo bằng THANH trên đầu module. Kéo cả thân
//     module thì ở điện thoại không cuộn trang được nữa (mọi cú vuốt thành cú kéo), và bấm
//     vào một cột biểu đồ thành nhấc cả thẻ lên.
//  2. Panel chữ (Việc cần làm, Ngân sách…) tự đo chiều cao nội dung và giữ ô cao đúng
//     chừng đó — cắt bớt là mất thông tin, còn dư là một khoảng trống giữa trang. Biểu đồ
//     thì người dùng kéo giãn cả hai chiều. Xem `fit` ở board.ts.
//  3. Lưới dùng `transform` để dời ô (mượt, chạy trên GPU). Cái giá: một phần tử
//     `position: fixed` NẰM TRONG ô sẽ bị ô đó giam lại. Các panel hiện không mở sheet từ
//     bên trong (sheet sửa giao dịch dựng ở BulletinPage, ngoài lưới) — thêm panel mới có
//     sheet thì dựng sheet ngoài lưới, hoặc đổi `positionStrategy` sang `absoluteStrategy`.
import { Suspense, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Responsive, useContainerWidth, type Layout, type LayoutItem } from 'react-grid-layout'
import { Check, GripVertical, LayoutGrid, Pencil, Plus, RotateCcw, Trash2, X } from 'lucide-react'
import { ActionButton, Card, EmptyState, IconButton, SectionTitle, SegmentedControl, Select } from '../../components/ui'
import { Guide } from '../../components/Guide'
import { useEscClose } from '../../hooks/useEscClose'
import { confirmDialog, promptDialog, showToast } from '../../lib/dialog'
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
  const [editing, setEditing] = useState(false)
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
          // Cờ của TỪNG Ô thắng cờ của lưới (`resizeConfig.enabled`) — thiếu `editing` ở
          // đây là tay nắm hiện cả lúc xem thường.
          isResizable: editing && !(auto && cols === 1),
          resizeHandles: auto ? ['e'] : cols === 1 ? ['s'] : ['se', 'e', 's'],
        }
      })
    }
    return out
  }, [page, measured, bp, editing])

  const saveLayout = useCallback(
    (layout: Layout) => update((s) => setLayout(s, page.id, bp, layout)),
    [update, page.id, bp],
  )

  const onView = (id: string) => (v: string) => update((s) => setView(s, page.id, id, v))

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
    if (!preset) {
      setEditing(true)
      setPicker(true)
    }
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
        <ActionButton variant={editing ? 'primary' : 'outline'} onClick={() => setEditing((e) => !e)} aria-pressed={editing}>
          {editing ? <Check className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
          {editing ? tr('Xong') : tr('Sắp xếp')}
        </ActionButton>
      </div>

      {editing && (
        <div className="flex flex-col gap-2 rounded-lg border border-dashed border-accent bg-accent-soft px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <ActionButton variant="primary" onClick={() => setPicker(true)}>
              <Plus className="h-4 w-4" /> {tr('Thêm module')}
            </ActionButton>
            <ActionButton onClick={rename}>
              <Pencil className="h-4 w-4" /> {tr('Đổi tên')}
            </ActionButton>
            <ActionButton onClick={reset}>
              <RotateCcw className="h-4 w-4" /> {page.preset ? tr('Khôi phục mặc định') : tr('Xếp lại')}
            </ActionButton>
            {board.pages.length > 1 && (
              <ActionButton variant="danger" onClick={remove}>
                <Trash2 className="h-4 w-4" /> {tr('Xoá trang')}
              </ActionButton>
            )}
          </div>
          <Guide className="text-sm text-fg-secondary">
            {tr('Kéo thanh trên đầu mỗi module để đổi chỗ, kéo mép phải hoặc góc dưới để đổi cỡ. Bố cục điện thoại và máy tính được nhớ riêng.')}
          </Guide>
        </div>
      )}

      <div ref={containerRef} className="min-w-0">
        {page.modules.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border-strong px-4 py-10 text-center">
            <p className="text-sm text-fg-muted">{tr('Trang này chưa có module nào.')}</p>
            <ActionButton variant="primary" onClick={() => { setEditing(true); setPicker(true) }}>
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
              className={`board ${settled ? 'board-settled' : ''} ${editing ? 'board-editing' : ''}`}
              dragConfig={{ enabled: editing, handle: DRAG_HANDLE, cancel: 'button, select, input', threshold: 4 }}
              resizeConfig={{ enabled: editing }}
              onDragStop={(layout) => saveLayout(layout)}
              onResizeStop={(layout) => saveLayout(layout)}
            >
              {page.modules.map((m) => (
                <div key={m.id}>
                  <ModuleFrame
                    m={m}
                    editing={editing}
                    onMeasure={onMeasure}
                    onView={onView(m.id)}
                    onRemove={() => update((s) => removeModule(s, page.id, m.id))}
                  >
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

// ---- Khung một module ----------------------------------------------------------------

interface FrameProps {
  m: BoardModule
  editing: boolean
  onMeasure: (id: string, rows: number) => void
  onView: (v: string) => void
  onRemove: () => void
  children: ReactNode
}

function ModuleFrame({ m, editing, onMeasure, onView, onRemove, children }: FrameProps) {
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

  const strip = editing && (
    <div className="board-drag mb-1.5 flex cursor-grab touch-none items-center gap-1.5 rounded-lg border border-dashed border-accent bg-accent-soft py-0.5 pr-0.5 pl-2 select-none active:cursor-grabbing">
      <GripVertical className="h-4 w-4 shrink-0 text-fg-accent" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-fg-primary">{d.title}</span>
      {d.views && (
        <Select
          aria-label={tr('Cách xem {title}', { title: d.title })}
          value={viewOf(m)}
          onChange={(e) => onView(e.target.value)}
          className="text-sm"
          wrapClassName="shrink-0"
        >
          {d.views.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label}
            </option>
          ))}
        </Select>
      )}
      <IconButton variant="ghost" aria-label={tr('Bỏ “{title}” khỏi trang', { title: d.title })} onClick={onRemove}>
        <X className="h-5 w-5" />
      </IconButton>
    </div>
  )

  // Ở chế độ Sắp xếp, nội dung `inert`: không bấm nhầm vào cột biểu đồ hay dòng giao
  // dịch khi đang định nhấc module lên, và Tab không lạc vào bên trong.
  const lock = editing ? 'pointer-events-none select-none' : ''
  return (
    <div ref={auto ? ref : undefined} className={auto ? 'min-w-0' : 'flex h-full min-w-0 flex-col'}>
      {strip}
      <div inert={editing} className={`${auto ? '' : 'min-h-0 flex-1'} ${lock}`.trim() || undefined}>
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
