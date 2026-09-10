// Phiếu "Danh sách đầy đủ" — hàng 11 của bản vẽ, chip thứ ba.
//
// Bản vẽ (dsg-handoff/README.md §"Drawer Danh sách đầy đủ"): phủ toàn màn, aside 520px bên
// phải, scrim mờ. Hai mục — Chặng đời và Mốc cuộc đời. Mục mốc có ô tìm và ba chip sắp
// xếp (Theo năm · Tiền lớn nhất · Theo loại). Dưới cùng là bảng mẫu thêm nhanh.
//
// VÌ SAO CẦN, khi trục đã hiện mọi thứ: trục là thứ ĐỌC ĐƯỢC theo thời gian nhưng KHÔNG
// đọc được theo danh sách — mốc chồng nhau khi dồn vào vài năm, icon không mang số tiền,
// và ở zoom 10 năm thì phần lớn kế hoạch nằm ngoài khung nhìn. "Kế hoạch của tôi gồm
// những gì, cái nào to nhất" là câu mà một danh sách trả lời trong một cái nhìn.
//
// Lọc/sắp nằm ở `drawerList.ts` (thuần, có test) — component này chỉ render.
import { useState } from 'react'
import { ActionButton, FilterChip, Money, Num, SectionTitle } from '../../components/ui'
import { Guide } from '../../components/Guide'
import type { CurrencyCode } from '../../lib/currencies'
import { drawerEvents, type DrawerSort } from './drawerList'
import type { DraftEvent, DraftPhase } from './draft'
import { LIFE_PRESETS, type LifePreset } from './presets'
import { EVENT_WORDS, PHASE_WORDS } from './planWords'

const SORT_LABEL: Record<DrawerSort, string> = {
  year: 'Theo năm',
  money: 'Tiền lớn nhất',
  type: 'Theo loại',
}

export function PlanListDrawer({
  open,
  onClose,
  phases,
  events,
  currency,
  onSelectPhase,
  onSelectEvent,
  onAddPreset,
}: {
  open: boolean
  onClose: () => void
  phases: readonly DraftPhase[]
  events: readonly DraftEvent[]
  currency: CurrencyCode
  onSelectPhase: (id: string) => void
  onSelectEvent: (id: string) => void
  onAddPreset: (p: LifePreset) => void
}) {
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<DrawerSort>('year')

  if (!open) return null

  const sorted = [...phases].sort((a, b) => a.startYear - b.startYear)
  const moc = drawerEvents(
    events.map((e) => ({
      id: e.id,
      label: e.label,
      startYear: e.startYear,
      endYear: e.endYear,
      kind: e.kind,
      amountMinor: e.amountMinor,
      icon: e.icon,
    })),
    { q, sort },
  )

  return (
    // Esc đóng phiếu này qua `useConsoleKeys`/`topLayer` (lớp 'drawer'), không phải một
    // listener riêng ở đây — xem lời ghi ở topLayer.ts về vụ hai lớp báo hiệu hai kiểu.
    <div className="fixed inset-0 z-50 flex justify-end bg-black/45">
      {/* Scrim là nút đóng: bấm ra ngoài để đóng là cử chỉ ai cũng thử trước tiên. */}
      <button
        type="button"
        aria-label="Đóng danh sách đầy đủ"
        className="flex-1 cursor-default"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Danh sách đầy đủ"
        className="flex w-[32.5rem] max-w-full flex-col overflow-y-auto overscroll-contain bg-surface-chrome p-3 shadow-lg"
      >
        <div className="flex items-baseline justify-between gap-2">
          <SectionTitle>Danh sách đầy đủ</SectionTitle>
          <ActionButton variant="outline" onClick={onClose}>
            Đóng
          </ActionButton>
        </div>

        {/* --- Chặng đời --- */}
        {/* Câu nghĩa dưới CẢ HAI tiêu đề (`planWords.ts`): đây là chỗ duy nhất trên app hai
            danh sách nằm ngay dưới nhau, tức chỗ đắt nhất để nói ra chúng khác nhau ở đâu. */}
        <SectionTitle role="micro" className="mt-3">
          {PHASE_WORDS.name}
        </SectionTitle>
        <p className="text-2xs font-medium text-fg-muted">{PHASE_WORDS.hint}</p>
        <ul className="divide-y divide-border-subtle">
          {sorted.map((p, i) => {
            const den = i + 1 < sorted.length ? sorted[i + 1].startYear - 1 : null
            return (
              <li key={p.id}>
                <button
                  type="button"
                  className="flex w-full items-baseline gap-2 py-2 text-left transition hover:bg-surface-sunken"
                  onClick={() => {
                    onSelectPhase(p.id)
                    onClose()
                  }}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-fg-primary">{p.label}</span>
                    <span className="block text-2xs text-fg-muted">
                      <Num tone="muted">{p.startYear}</Num>
                      {den !== null ? <>–<Num tone="muted">{den}</Num></> : ' → hết đời'}
                      {p.country ? ` · ${p.country}` : ''}
                    </span>
                  </span>
                  <Money amount={p.annualIncomeMinor} currency={p.currency} tone="in" className="text-2xs" />
                  <Money amount={p.annualExpenseMinor} currency={p.currency} tone="out" className="text-2xs" />
                </button>
              </li>
            )
          })}
        </ul>

        {/* --- Mốc cuộc đời --- */}
        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
          <div className="min-w-0">
            <SectionTitle role="micro">{EVENT_WORDS.name}</SectionTitle>
            <p className="text-2xs font-medium text-fg-muted">{EVENT_WORDS.hint}</p>
          </div>
          {/* Ô tìm 120px của bản vẽ → `w-30` (7,5rem). `rem` để nó co theo Cỡ chữ. */}
          <input
            type="search"
            aria-label="Tìm mốc"
            placeholder="Tìm mốc…"
            value={q}
            onChange={(ev) => setQ(ev.target.value)}
            className="w-30 rounded-md border border-border-strong bg-surface px-2 py-1 text-xs text-fg-primary"
          />
          <span role="group" aria-label="Sắp xếp mốc" className="flex items-center gap-1">
            {(['year', 'money', 'type'] as DrawerSort[]).map((s) => (
              <FilterChip key={s} size="sm" on={sort === s} onClick={() => setSort(s)}>
                {SORT_LABEL[s]}
              </FilterChip>
            ))}
          </span>
        </div>

        {moc.length === 0 ? (
          <p className="py-2 text-sm text-fg-muted">
            {q.trim() === '' ? 'Kế hoạch chưa có mốc nào.' : 'Không mốc nào khớp.'}
          </p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {moc.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  className="flex w-full items-baseline gap-2 py-2 text-left transition hover:bg-surface-sunken"
                  onClick={() => {
                    onSelectEvent(e.id)
                    onClose()
                  }}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-fg-primary">{e.label}</span>
                    <span className="block text-2xs text-fg-muted">
                      <Num tone="muted">{e.startYear}</Num>
                      {e.endYear === null ? ' → hết đời' : e.endYear !== e.startYear ? <>–<Num tone="muted">{e.endYear}</Num></> : ''}
                    </span>
                  </span>
                  <Money
                    amount={e.amountMinor}
                    currency={currency}
                    tone={e.kind === 'income' ? 'in' : 'out'}
                    className="text-sm"
                  />
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* --- Bảng mẫu thêm nhanh --- */}
        <SectionTitle role="micro" className="mt-3">
          Thêm nhanh từ mẫu
        </SectionTitle>
        <div className="flex flex-wrap gap-1.5">
          {LIFE_PRESETS.map((p) => (
            <ActionButton
              key={p.id}
              variant="outline"
              onClick={() => {
                onAddPreset(p)
                onClose()
              }}
            >
              {p.label}
            </ActionButton>
          ))}
        </div>
        <Guide>
          Mẫu chỉ điền sẵn số rồi thành bản ghi thường — sửa xoá như mọi dòng khác. Mọi số
          mặc định là phỏng đoán, kiểm tra lại.
        </Guide>
      </aside>
    </div>
  )
}
