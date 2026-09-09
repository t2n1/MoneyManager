// Phần DÙNG CHUNG của hai bảng sửa trong dock (`PlanDockPhase`, `PlanDockEvent`).
//
// VÌ SAO MỘT FILE CHUNG. Bản vẽ 1c (dsg-handoff/README.md, mục "Panel chi tiết") nói rõ:
// "Cùng một chỗ cho cả hai loại, cùng một hàng nhận dạng" —
//
//     [icon 33×33] [màu 33×33] [tên · flex:1] [từ năm] → [đến năm]
//
// Hai bản chép của hàng đó là hai chỗ để lệch: bấm một chặng rồi bấm một mốc, nút icon
// nhảy 2px sang phải là đủ để đọc ra như hai màn khác nhau. Bộ chọn icon và bộ chọn màu
// cũng vậy — chúng mở cùng một popover với cùng luật đóng.
//
// KHÁC NHAU CÓ CHỦ ĐÍCH giữa hai loại, và đó là lý do file này nhận `renderIcon` +
// `treatment` bằng prop chứ không tự quyết:
//   · "đến năm" của CHẶNG là CHỮ TĨNH — chặng kế tiếp quyết định nó (bản vẽ ghi thẳng).
//     Của MỐC là một ô nhập.
//   · Màu của MỐC tô TƯƠI, màu của CHẶNG tô TRẦM (spec §8). Cùng bảy khoá màu dùng
//     chung toàn app (features/tags/colors.ts), hai cách TÔ — đó là cách giữ đúng ý bản
//     vẽ ("hai dải phải khác nhau rõ rệt") mà không mở rộng bảng màu.
//   · Icon của MỐC rơi về mũi tên Thu/Chi (`EventIcon`); chặng không có Thu/Chi nên rơi
//     về một vòng nét đứt.
//
// KHÔNG tự chế focus style: ring toàn cục trong index.css đã lo (guardrail
// tests/designSystem.test.ts). Mọi cỡ đo của bản vẽ quy về `rem` — 33px = 2,0625rem,
// 172px = 10,75rem, 130px = 8,125rem, 17px = 1,0625rem — vì Cài đặt → Cỡ chữ phóng theo
// `rem` và px đứng yên.
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Ban, CircleDashed } from 'lucide-react'
import { Card, SectionTitle } from '../../components/ui'
import { EVENT_ICONS, EVENT_ICON_GROUPS } from './eventIcons'
import {
  TAG_CHIP_CLASS,
  TAG_COLOR_KEYS,
  TAG_COLOR_LABELS,
  TAG_HEX,
  tagColor,
  type TagColorKey,
} from '../tags/colors'

/**
 * Ô nhập trong dock. `rounded-md` (control 6px, §1.3) — pill chỉ dành cho nút.
 *
 * KHÔNG mang bề rộng: `w-full` ở đây rồi `w-[3.75rem]` ở chỗ dùng là hai tiện ích cùng
 * hiệu lực, và Tailwind quyết theo thứ tự trong CSS chứ không theo thứ tự trong chuỗi —
 * có guardrail riêng chặn đúng ca này (tests/designSystem.test.ts). Chỗ dùng tự khai.
 */
export const DOCK_INPUT =
  'rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm text-fg-primary'
/** Nhãn của một ô. `<label htmlFor>` khi trỏ vào MỘT control, `<span>` khi trỏ vào nhóm
 *  hoặc vào `<MoneyField>` (nó render hai ô, một cái bị CSS ẩn — xem components/MoneyField.tsx). */
export const DOCK_LABEL = 'mb-0.5 block text-2xs uppercase tracking-label text-fg-muted'

/** Hai cách TÔ cùng bảy khoá màu — xem đầu file. */
export type ColorTreatment = 'vivid' | 'muted'

/**
 * Vỏ của một bảng sửa: cùng khuôn `Card` với `PlanSummaryCard` nên cột dock không đổi
 * bề rộng hay viền giữa ba trạng thái (spec §5 — đồ thị không được co giãn mỗi lần
 * chọn/bỏ chọn).
 *
 * Cuộn được: bản vẽ cho panel mốc `max-height: H − 12` và panel chặng `340px`. Ở đây
 * chặn theo `max-h-[42rem]` cho cả hai — một con số px cứng cho chiều cao là đúng thứ
 * spec §5 bảo đừng làm, và panel chặng ngắn hơn trần thì trần không có tác dụng gì.
 */
export function DockPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card as="section" padding="panel" elevation="panel">
      <SectionTitle role="micro">{title}</SectionTitle>
      <div className="mt-1.5 max-h-[42rem] overflow-y-auto overscroll-contain">{children}</div>
    </Card>
  )
}

interface IdentityRowProps {
  /** Khoá icon đang chọn; `''` = chưa chọn. */
  icon: string
  onIcon: (icon: string) => void
  /** Khoá màu đang chọn; `''` = chưa chọn (tô theo mặc định của loại). */
  color: string
  onColor: (color: string) => void
  /**
   * Khoá màu mà chỗ VẼ thật sự dùng khi `color === ''`. Chỉ CHẶNG truyền (dải chặng tô
   * theo thứ tự chặng, migration 0069); mốc thì để trống vì mặc định của nó là màu Thu/Chi,
   * không phải một khoá trong bảng bảy màu.
   *
   * Có nó thì ô màu "không màu riêng" vẽ ĐÚNG màu dải đang vẽ, viền nét đứt để vẫn nói ra
   * rằng đây là mặc định chứ không phải một lựa chọn người dùng đã làm. Thiếu nó thì bảng
   * chọn hiện một vòng nét đứt trống cho đúng cái chặng đang có màu thật trên trục — hai
   * chỗ nói hai điều (phát hiện review cuối nhánh 2026-09-09, Finding 7).
   */
  fallbackColor?: TagColorKey
  treatment: ColorTreatment
  /** Vẽ một khoá icon — mỗi loại tự quyết icon rơi về khi khoá trống/lạ. */
  renderIcon: (icon: string) => ReactNode
  name: string
  onName: (name: string) => void
  /** "Tên chặng" / "Tên mốc" — đi vào `aria-label` và `placeholder`. */
  nameLabel: string
  /** Ô "từ năm". Ô "đến năm" là CHỮ TĨNH với chặng, ô nhập với mốc — nên cả hai vào
   *  bằng prop, hàng này không đoán. */
  fromYear: ReactNode
  toYear: ReactNode
}

/** Hàng nhận dạng của bản vẽ — dùng cho CẢ chặng và mốc. */
export function IdentityRow({
  icon,
  onIcon,
  color,
  onColor,
  fallbackColor,
  treatment,
  renderIcon,
  name,
  onName,
  nameLabel,
  fromYear,
  toYear,
}: IdentityRowProps) {
  /** Đúng state `pick: 'icon'|'color'|null` của bản vẽ: hai popover không bao giờ mở
   *  cùng lúc, nên một state chứ không phải hai cờ (hai cờ là hai thứ để lệch). */
  const [pick, setPick] = useState<'icon' | 'color' | null>(null)
  const uid = useId()

  return (
    <div className="flex items-center gap-1.5">
      <Popover
        open={pick === 'icon'}
        onOpenChange={(v) => setPick(v ? 'icon' : null)}
        label={icon === '' ? 'Chọn icon' : `Icon: ${EVENT_ICONS[icon]?.label ?? 'khác'}`}
        trigger={renderIcon(icon)}
      >
        <IconGrid
          icon={icon}
          renderIcon={renderIcon}
          onPick={(k) => {
            onIcon(k)
            setPick(null)
          }}
        />
      </Popover>

      <Popover
        open={pick === 'color'}
        onOpenChange={(v) => setPick(v ? 'color' : null)}
        label={
          color !== ''
            ? `Màu: ${TAG_COLOR_LABELS[tagColor(color)]}`
            : fallbackColor !== undefined
              ? `Màu: mặc định theo thứ tự chặng (${TAG_COLOR_LABELS[fallbackColor]})`
              : 'Chọn màu'
        }
        trigger={<Swatch color={color} fallback={fallbackColor} treatment={treatment} />}
      >
        <ColorGrid
          color={color}
          fallback={fallbackColor}
          treatment={treatment}
          onPick={(k) => {
            onColor(k)
            setPick(null)
          }}
        />
      </Popover>

      <input
        id={`${uid}-ten`}
        value={name}
        aria-label={nameLabel}
        placeholder={nameLabel}
        onChange={(e) => onName(e.target.value)}
        className={`w-full min-w-0 flex-1 ${DOCK_INPUT}`}
      />
      {fromYear}
      <span aria-hidden className="shrink-0 text-2xs text-fg-muted">
        →
      </span>
      {toYear}
    </div>
  )
}

/**
 * Nút 33×33 mở một popover NGAY DƯỚI nó (bản vẽ). Đóng khi: chọn xong (chỗ gọi lo),
 * `Esc`, hoặc bấm ra ngoài.
 *
 * SỬA Finding 3 (review 2026-09-09): bản trước dùng `e.stopPropagation()`, và lời ghi ở
 * đây từng khẳng định nó chặn được lớp `Esc` của trang — SAI, vì `stopPropagation` không
 * chặn LISTENER KHÁC trên CÙNG một target, mà cả popover này lẫn `useConsoleKeys.ts` đều
 * nghe trên `window`. Tệ hơn: `useConsoleKeys` gắn listener ở lúc TRANG mount, tức luôn
 * SỚM HƠN listener của popover (chỉ gắn khi `open` bật, sau khi người dùng đã chọn một mốc
 * rồi mở bộ chọn) — mà listener trên cùng target chạy theo ĐÚNG THỨ TỰ đã gắn, nên ở pha
 * NỔI BỌT (bubble, mặc định của `addEventListener`), listener của trang luôn chạy TRƯỚC,
 * bất kể popover gọi gì. Một cú Esc vì vậy đóng CẢ popover LẪN cả panel chứa nó (`closeTop`
 * xoá `sel`) — người dùng mất chỗ đang sửa vì muốn đóng một bộ chọn màu.
 *
 * Sửa bằng HAI thay đổi cùng lúc, thiếu một là còn bug:
 * 1. `capture: true` khi gắn/gỡ — listener ở pha BẮT (capture) trên `window` luôn chạy
 *    TRƯỚC mọi listener nổi bọt trên `window` (capture đi từ ngoài vào trước, bubble đi từ
 *    trong ra sau), bất kể ai gắn trước ai. Đây là cách DUY NHẤT đảo lại đúng thứ tự "trang
 *    gắn trước, popover gắn sau" ở trên.
 * 2. `e.preventDefault()` thay `stopPropagation()` — `useConsoleKeys.ts` đã bắt đúng cờ này
 *    (`if (e.defaultPrevented) return`), nên chỉ cần đặt nó trước khi trang kịp đọc.
 *
 * Đủ cả hai thì popover đóng, `defaultPrevented` bật ở pha capture, rồi tới lúc trang đọc
 * ở pha bubble thì đã thấy cờ và bỏ qua — panel không bị đóng ké.
 */
function Popover({
  open,
  onOpenChange,
  label,
  trigger,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  label: string
  trigger: ReactNode
  children: ReactNode
}) {
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      e.preventDefault()
      onOpenChange(false)
    }
    function onDown(e: MouseEvent) {
      if (!boxRef.current?.contains(e.target as Node)) onOpenChange(false)
    }
    // `true` = pha BẮT (capture) cho `keydown` — xem lời ghi ở trên cho lý do bắt buộc.
    // `mousedown` giữ nguyên pha nổi bọt (mặc định): nó không tranh chấp với lớp nào khác.
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('mousedown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('mousedown', onDown)
    }
  }, [open, onOpenChange])

  return (
    <div ref={boxRef} className="relative shrink-0">
      <button
        type="button"
        aria-label={label}
        title={label}
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
        className="flex h-[2.0625rem] w-[2.0625rem] items-center justify-center rounded-full border border-border-strong text-fg-secondary transition active:scale-95 hover:bg-surface-sunken"
      >
        {trigger}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 rounded-md border border-border-panel bg-surface p-1.5 shadow-sm">
          {children}
        </div>
      )}
    </div>
  )
}

/** Bộ chọn icon — 172px, xếp tràn dòng (bản vẽ). Nhóm giữ nguyên `EVENT_ICON_GROUPS`
 *  để không sinh một cách xếp thứ hai cho cùng bộ icon. */
function IconGrid({
  icon,
  renderIcon,
  onPick,
}: {
  icon: string
  renderIcon: (icon: string) => ReactNode
  onPick: (icon: string) => void
}) {
  return (
    <div className="max-h-[16rem] w-[10.75rem] overflow-y-auto overscroll-contain">
      <button
        type="button"
        aria-label="Bỏ icon"
        aria-pressed={icon === ''}
        onClick={() => onPick('')}
        className={`mb-1 flex min-h-8 w-full items-center justify-center gap-1.5 rounded-full text-2xs transition active:scale-95 ${
          icon === '' ? 'bg-accent text-fg-on-accent' : 'text-fg-muted hover:bg-surface-sunken'
        }`}
      >
        <Ban className="h-3 w-3" aria-hidden />
        Bỏ icon
      </button>
      {EVENT_ICON_GROUPS.map((g) => (
        <div key={g.title} className="mb-1 last:mb-0">
          {/* `text-2xs`, KHÔNG `text-3xs`: index.css ghi rõ bậc 10px chỉ dành cho chữ
              trong biểu đồ — ở Cỡ chữ 0,9 nó tụt xuống 9px. */}
          <p className="mb-0.5 text-2xs uppercase tracking-label text-fg-muted">{g.title}</p>
          <div className="flex flex-wrap gap-0.5">
            {g.keys.map((k) => (
              <button
                key={k}
                type="button"
                title={EVENT_ICONS[k].label}
                aria-label={EVENT_ICONS[k].label}
                aria-pressed={icon === k}
                onClick={() => onPick(k)}
                className={`flex h-7 w-7 items-center justify-center rounded-full transition active:scale-95 ${
                  icon === k
                    ? 'bg-accent text-fg-on-accent'
                    : 'text-fg-secondary hover:bg-surface-sunken'
                }`}
              >
                {renderIcon(k)}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * Bộ chọn màu — 130px, ô 17×17 (bản vẽ). Ô màu 17px nằm TRONG một nút 24px: 17px là cỡ
 * HÌNH mà bản vẽ vẽ, còn 24px là ngưỡng vùng bấm cấp hai của WCAG 2.5.8. Cùng cách mà
 * ba công tắc `role="switch"` của app đã làm (đường ray nhỏ trong nút 44px).
 *
 * `aria-label` là BẮT BUỘC: màu là thứ duy nhất phân biệt các nút này, mà đó đúng là
 * thứ người dùng trình đọc màn hình không nhận được (lời ghi lấy từ `EventFormSheet`).
 */
function ColorGrid({
  color,
  fallback,
  treatment,
  onPick,
}: {
  color: string
  /** Xem `IdentityRowProps.fallbackColor`. */
  fallback?: TagColorKey
  treatment: ColorTreatment
  onPick: (color: string) => void
}) {
  return (
    <div className="flex w-[8.125rem] flex-wrap items-center gap-0.5">
      {/* Ô "không màu riêng" GIỮ NGUYÊN vai trò ô đang chọn khi `color === ''` — đó là
          trạng thái THẬT trong DB, và biến một mặc định thành một lựa chọn là nói dối về
          dữ liệu. Chỉ HÌNH của nó đổi: có `fallback` thì nó vẽ đúng màu mà dải đang tô,
          viền nét đứt (Finding 7). */}
      <button
        type="button"
        aria-label={
          fallback === undefined
            ? 'Không màu riêng'
            : `Không màu riêng — mặc định đang là ${TAG_COLOR_LABELS[fallback]}`
        }
        title={
          fallback === undefined
            ? 'Không màu riêng'
            : `Không màu riêng — mặc định theo thứ tự chặng, đang là ${TAG_COLOR_LABELS[fallback]}`
        }
        aria-pressed={color === ''}
        onClick={() => onPick('')}
        className={`flex h-6 w-6 items-center justify-center rounded-full transition active:scale-95 ${
          color === '' ? 'ring-2 ring-accent' : 'hover:bg-surface-sunken'
        }`}
      >
        <Swatch color="" fallback={fallback} treatment={treatment} />
      </button>
      {TAG_COLOR_KEYS.map((k) => (
        <button
          key={k}
          type="button"
          aria-label={`Màu ${TAG_COLOR_LABELS[k]}`}
          title={`Màu ${TAG_COLOR_LABELS[k]}`}
          aria-pressed={color === k}
          onClick={() => onPick(k)}
          className={`flex h-6 w-6 items-center justify-center rounded-full transition active:scale-95 ${
            color === k ? 'ring-2 ring-accent' : 'hover:bg-surface-sunken'
          }`}
        >
          <Swatch color={k} treatment={treatment} />
        </button>
      ))}
    </div>
  )
}

/**
 * Một ô màu 17×17.
 *
 * `vivid` tô đặc bằng `TAG_HEX` (mã dùng cho biểu đồ, đã lật theo Sáng/Tối ở khoá `gray`).
 * `muted` dùng `TAG_CHIP_CLASS` — nền nhạt ở Sáng, nền đậm mờ ở Tối, đúng cặp mà bảng
 * màu nhãn đã đo cho cả hai chế độ. Không chêm hex vào JSX (guardrail), và không tự trộn
 * một sắc độ thứ ba cho "trầm".
 */
function Swatch({
  color,
  fallback,
  treatment,
}: {
  color: string
  fallback?: TagColorKey
  treatment: ColorTreatment
}) {
  const SIZE = 'h-[1.0625rem] w-[1.0625rem] shrink-0 rounded-full border'
  // Chưa chọn màu VÀ chỗ vẽ có một màu mặc định thật (chặng) → vẽ đúng màu đó, viền NÉT ĐỨT.
  // Nét đứt là thứ giữ được cả hai câu: "dải đang tô màu này" và "bạn chưa chọn màu nào".
  if (color === '' && fallback !== undefined) {
    if (treatment === 'muted') {
      return (
        <span
          aria-hidden
          className={`${SIZE} border-dashed border-border-strong ${TAG_CHIP_CLASS[fallback]}`}
        />
      )
    }
    return (
      <span
        aria-hidden
        className={`${SIZE} border-dashed border-border-strong`}
        style={{ backgroundColor: TAG_HEX[fallback] }}
      />
    )
  }
  if (color === '') {
    return <CircleDashed className="h-[1.0625rem] w-[1.0625rem] shrink-0 text-fg-muted" aria-hidden />
  }
  const k = tagColor(color)
  if (treatment === 'muted') {
    return <span aria-hidden className={`${SIZE} border-border-strong ${TAG_CHIP_CLASS[k]}`} />
  }
  return (
    <span
      aria-hidden
      className={`${SIZE} border-border-strong`}
      style={{ backgroundColor: TAG_HEX[k] }}
    />
  )
}

/**
 * Ô nhập NĂM. Prop thắng khi KHÔNG gõ dở — giá trị đổi được từ ngoài (kéo trên đồ thị,
 * bỏ nháp, đổi kịch bản); trong lúc gõ thì giữ nguyên chuỗi người dùng đang gõ.
 *
 * Khuôn lấy từ `YearInput` của `ScenarioWorkbench` (màn cũ, đã nghỉ ở Task 16) — chép ra
 * thay vì import: file đó đã bị xoá, và bảng sửa trong dock ghi thẳng vào nháp nên
 * `onCommit` ở đây nhận cả năm CHƯA hợp lệ để chỗ gọi tự chặn (xem `phaseYear.ts`).
 */
export function YearBox({
  value,
  onCommit,
  ariaLabel,
}: {
  value: number
  onCommit: (year: number) => void
  ariaLabel: string
}) {
  const [text, setText] = useState(String(value))
  const [editing, setEditing] = useState(false)
  return (
    <input
      inputMode="numeric"
      value={editing ? text : String(value)}
      aria-label={ariaLabel}
      onFocus={() => {
        setText(String(value))
        setEditing(true)
      }}
      onChange={(e) => {
        setText(e.target.value)
        const n = Number(e.target.value)
        if (Number.isInteger(n) && e.target.value.trim() !== '') onCommit(n)
      }}
      onBlur={() => setEditing(false)}
      className={`w-[3.75rem] shrink-0 text-center font-mono ${DOCK_INPUT}`}
    />
  )
}

/** "Đến năm" của một MỐC: để trống nghĩa là "tới hết đời" (`endYear: null`). Chuỗi rỗng
 *  ở đây là một giá trị HỢP LỆ, không phải trạng thái gõ dở — nên nó ghi `null` ngay. */
export function EndYearBox({
  value,
  onCommit,
  ariaLabel,
}: {
  value: number | null
  onCommit: (year: number | null) => void
  ariaLabel: string
}) {
  const [text, setText] = useState(value === null ? '' : String(value))
  const [editing, setEditing] = useState(false)
  return (
    <input
      inputMode="numeric"
      value={editing ? text : value === null ? '' : String(value)}
      aria-label={ariaLabel}
      placeholder="hết đời"
      onFocus={() => {
        setText(value === null ? '' : String(value))
        setEditing(true)
      }}
      onChange={(e) => {
        const raw = e.target.value
        setText(raw)
        if (raw.trim() === '') {
          onCommit(null)
          return
        }
        const n = Number(raw)
        if (Number.isInteger(n)) onCommit(n)
      }}
      onBlur={() => setEditing(false)}
      className={`w-[3.75rem] shrink-0 text-center font-mono ${DOCK_INPUT}`}
    />
  )
}

/**
 * Ô nhập MỘT CON SỐ không phải tiền (%/năm, số năm lặp, kỳ hạn vay).
 *
 * Cùng luật "prop thắng khi không gõ dở" với `YearBox`, và lý do thì mạnh hơn ở đây: các
 * ô này nhận số thập phân, nên trong lúc gõ "3,5" người dùng đi qua trạng thái "3." — đọc
 * lại từ prop mỗi lần nhấn phím sẽ xoá mất dấu phẩy ngay khi vừa gõ, tức không gõ nổi
 * một số lẻ.
 *
 * `emptyIsNull`: ô "lặp mỗi N năm" và "kỳ hạn vay" nhận chuỗi rỗng như một GIÁ TRỊ (không
 * lặp / trả thẳng), nên rỗng phải ghi `null` ngay. Ô phần trăm thì không — rỗng ở đó chỉ
 * là đang gõ dở, và ghi 0 sẽ âm thầm biến "tăng 3%/năm" thành "đứng yên".
 *
 * Chặn khoảng là việc của chỗ gọi: mỗi ô có một trần riêng (MAX_REPEAT_YEARS,
 * MAX_LOAN_YEARS, ±100%…), và một hàm chung đoán hộ là chỗ để lệch.
 */
export function NumBox({
  id,
  value,
  onCommit,
  emptyIsNull,
  ariaLabel,
  placeholder,
}: {
  id?: string
  value: number | null
  onCommit: (n: number | null) => void
  emptyIsNull: boolean
  ariaLabel: string
  placeholder?: string
}) {
  const [text, setText] = useState(value === null ? '' : String(value))
  const [editing, setEditing] = useState(false)
  return (
    <input
      id={id}
      inputMode="decimal"
      value={editing ? text : value === null ? '' : String(value)}
      aria-label={ariaLabel}
      placeholder={placeholder}
      onFocus={() => {
        setText(value === null ? '' : String(value))
        setEditing(true)
      }}
      onChange={(e) => {
        const raw = e.target.value
        setText(raw)
        if (raw.trim() === '') {
          if (emptyIsNull) onCommit(null)
          return
        }
        // Dấu PHẨY là dấu thập phân của bàn phím/locale Việt — `Number("3,5")` là `NaN`
        // nên không có bước này thì gõ "3,5" không commit gì, và blur làm ô nhảy về "3"
        // (bắt được ở phát hiện review 2026-09-09 #4). Cùng idiom `replace(',', '.')` đã
        // dùng ở fundFees.ts, rebalance.ts, BudgetMethodSheet.tsx.
        const n = Number(raw.trim().replace(',', '.'))
        if (Number.isFinite(n)) onCommit(n)
      }}
      onBlur={() => setEditing(false)}
      className={`w-full text-right font-mono ${DOCK_INPUT}`}
    />
  )
}

/**
 * Một nút trong một cặp/bộ NÚT-ĐÓNG-VAI-CÔNG-TẮC của dock ("Gõ số"/"% chặng trước", "Chi"/
 * "Thu", "Đang tính"/"Đang tắt" kiểu, "Không"/"Có — nhà, xe, đất", "Trả thẳng"/"Vay"…).
 *
 * Bảy chỗ gọi trong hai panel từng chép tay CÙNG một chuỗi class (phát hiện review
 * 2026-09-09 #5) — bảy bản chép là bảy chỗ để lệch nếu một ngày bậc màu đổi, và bảy `active
 * :scale-95` thô góp vào đúng trần guardrail đang mỏng (`tests/designSystem.test.ts`). MỘT
 * chỗ định nghĩa còn giảm số lượt guardrail đó phải đếm.
 *
 * KHÔNG dùng cho hai nút chọn LOẠI của bản vẽ đã có primitive riêng (`FilterChip`,
 * `ActionButton`) — đây chỉ đứng cho những cặp "nút pill nhỏ nằm trong một hàng
 * `role="group"`" mà bản vẽ vẽ, chưa có primitive nào của app khớp đúng cỡ 32px + bo tròn
 * hoàn toàn đó.
 */
export function SegButton({
  active,
  onClick,
  children,
  title,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
  title?: string
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      title={title}
      onClick={onClick}
      className={`min-h-8 flex-1 rounded-full text-2xs font-medium transition active:scale-95 ${
        active
          ? 'bg-accent text-fg-on-accent'
          : 'border border-border-strong text-fg-secondary hover:bg-surface-sunken'
      }`}
    >
      {children}
    </button>
  )
}

/** Icon rơi về của CHẶNG: chặng không có Thu/Chi nên không có mũi tên nào để rơi về. */
export function PhaseIcon({ icon }: { icon: string }) {
  const def = icon ? EVENT_ICONS[icon] : undefined
  if (!def) return <CircleDashed className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden />
  const Icon = def.Icon
  return <Icon className="h-4 w-4 shrink-0" strokeWidth={1.6} aria-hidden />
}
