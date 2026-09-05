import { useRef, useState } from 'react'
import { ArrowRightLeft, CheckCircle2, Circle, Copy, HandCoins, Repeat, Undo2 } from 'lucide-react'
import { formatMoney, type CurrencyCode } from '../../lib/money'
import type { AccountRow, CategoryRow, TagRow, TransactionRow } from '../../types/database.types'
import { TAG_CHIP_CLASS, tagColor } from '../tags/colors'
import { categoryTint } from './categoryTint'
import { amountDisplay, type AmountDisplay } from './ledgerShared'

const TONE_CLASS: Record<AmountDisplay['tone'], string> = {
  in: 'text-money-in',
  out: 'text-money-out',
  muted: 'text-fg-muted',
}

interface Props {
  tx: TransactionRow
  categoryOf: (id: string | null) => CategoryRow | undefined
  accountOf: (id: string | null) => AccountRow | undefined
  base: CurrencyCode
  onClick: () => void
  /** Đang ở chế độ chọn nhiều → hiện ô tích, chạm dòng = tích/bỏ (trang tự lo onClick). */
  selecting?: boolean
  /** Dòng này đang được chọn. */
  selected?: boolean
  /**
   * Nhãn của giao dịch này (xem `tagsByTransaction`). Bỏ trống = không vẽ chip,
   * để những màn chưa tải bảng liên kết nhãn giữ nguyên dáng cũ.
   */
  tags?: TagRow[]
  /**
   * "Nhân bản sang hôm nay" (§4.2 mục 5). Có hàm này thì dòng nhận thêm hai cử chỉ:
   * VUỐT SANG TRÁI trên cảm ứng, và CHUỘT PHẢI trên máy tính. Không truyền thì dòng
   * giữ nguyên hành vi cũ — Tìm kiếm dùng chung dòng này và ở đó "hôm nay" không
   * thuộc kỳ đang xem, nhân bản sang đó là khoản biến mất khỏi màn ngay khi tạo.
   */
  onDuplicate?: () => void
}

/** Vuốt bao xa thì tính là một cú vuốt, px. Dưới ngưỡng này là cuộn hoặc chạm trượt tay. */
const SWIPE_PX = 64

/** Một dòng giao dịch (dùng chung cho Sổ GD và Tìm kiếm). */
export function TransactionItem({
  tx,
  categoryOf,
  accountOf,
  base,
  onClick,
  selecting = false,
  selected = false,
  tags = [],
  onDuplicate,
}: Props) {
  // Vuốt: theo dõi bằng ref + một state cho độ dịch. Không dùng thư viện cử chỉ nào —
  // đây là một trục, một ngưỡng, và kéo cả một thư viện vào để làm việc đó thì mọi
  // dòng của danh sách dài nhất app phải gánh thêm bộ nhớ.
  //
  // Chỉ chặn cuộn dọc khi đã CHẮC là vuốt ngang (|dx| > |dy|): chặn sớm là danh sách
  // không cuộn được bằng ngón cái đặt lên một dòng — tức là gần như mọi lần cuộn.
  const start = useRef<{ x: number; y: number; ngang: boolean } | null>(null)
  const [dx, setDx] = useState(0)

  const cat = categoryOf(tx.category_id)
  const style = amountDisplay(tx)
  const srcCur = accountOf(tx.account_id)?.currency ?? base
  const dstCur = tx.to_account_id ? (accountOf(tx.to_account_id)?.currency ?? srcCur) : srcCur
  const accountName = (id: string | null) => accountOf(id)?.name ?? '?'

  const row = (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selecting ? selected : undefined}
      // Chuột phải = nhân bản (§4.2 mục 5, bản desktop). Chặn menu ngữ cảnh của trình
      // duyệt vì trên một dòng giao dịch nó chỉ có "Sao chép ảnh / Kiểm tra phần tử".
      onContextMenu={
        onDuplicate && !selecting
          ? (e) => {
              e.preventDefault()
              onDuplicate()
            }
          : undefined
      }
      onTouchStart={
        onDuplicate && !selecting
          ? (e) => {
              const t = e.touches[0]
              start.current = { x: t.clientX, y: t.clientY, ngang: false }
            }
          : undefined
      }
      onTouchMove={
        onDuplicate && !selecting
          ? (e) => {
              const s = start.current
              if (!s) return
              const t = e.touches[0]
              const ddx = t.clientX - s.x
              const ddy = t.clientY - s.y
              if (!s.ngang && Math.abs(ddx) > Math.abs(ddy) && Math.abs(ddx) > 8) s.ngang = true
              // Chỉ theo ngón khi đã chắc là vuốt NGANG, và chỉ chiều sang TRÁI.
              if (s.ngang) setDx(Math.max(-96, Math.min(0, ddx)))
            }
          : undefined
      }
      onTouchEnd={
        onDuplicate && !selecting
          ? () => {
              const qua = dx <= -SWIPE_PX
              start.current = null
              setDx(0)
              if (qua) onDuplicate()
            }
          : undefined
      }
      style={dx ? { transform: `translateX(${dx}px)` } : undefined}
      // py-1.5: nội dung 2 dòng đã cao 38px, cả hàng ~50px — vẫn quá 44px vùng chạm,
      // nhưng danh sách dài nhất app (Sổ, chi tiết TK, tìm kiếm) đặc hơn ~15%.
      // min-h-[3.125rem] = 50px: dòng CHUYỂN KHOẢN không có dòng phụ tên tài khoản nên
      // chỉ cao 32px — vừa lọt xuống dưới vùng chạm 44px, vừa thành một chỗ hụt giữa
      // các dòng 50px xung quanh. Kê sàn cho bằng, không nong dòng thường ra.
      className={`flex w-full min-h-[3.125rem] items-center gap-3 px-3 py-1.5 text-left transition hover:bg-surface-sunken ${selected ? 'bg-state-good-bg' : ''}`}
    >
      {selecting && (
        <span className="shrink-0">
          {selected ? (
            <CheckCircle2 className="h-5 w-5 text-fg-accent" />
          ) : (
            <Circle className="h-5 w-5 text-fg-muted" />
          )}
        </span>
      )}
      {/* Ô emoji 32px lót màu theo danh mục (redesign 2): emoji trần trên nền tối gần
          như tan vào dòng, ô màu cho mắt một cột "đây là loại gì" để quét dọc.
          Chuyển khoản không có danh mục → ô trung tính với icon mũi tên như cũ. */}
      {tx.type === 'transfer' ? (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-sunken text-fg-secondary">
          <ArrowRightLeft className="h-4 w-4" />
        </span>
      ) : (
        <span
          aria-hidden
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base leading-none"
          style={{ backgroundColor: categoryTint(tx.category_id).tile }}
        >
          {cat?.icon}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-fg-primary">
          {/* Không có danh mục (hàng nhập từ CSV/Zaim hay thiếu) thì viết hẳn ra
              "Chưa phân loại" — dấu "?" trơ trọi làm cả dòng đọc như dữ liệu lỗi.
              Có id mà tra không ra (danh mục đã xóa) mới là "?" thật. */}
          {tx.type === 'transfer'
            ? `${accountName(tx.account_id)} → ${accountName(tx.to_account_id)}`
            : tx.category_id
              ? (cat?.name ?? '?')
              : 'Chưa phân loại'}
          {tx.note && <span className="text-fg-muted"> · {tx.note}</span>}
          {tx.recurring_rule_id && (
            <Repeat
              aria-label="Giao dịch định kỳ"
              className="ml-1 inline h-3 w-3 align-baseline text-fg-muted"
            />
          )}
          {tx.is_debt_flow && (
            <HandCoins
              aria-label="Dòng tiền nợ/cho vay — không tính vào Thu/Chi"
              className="ml-1 inline h-3 w-3 align-baseline text-fg-warn"
            />
          )}
          {/* Hoàn tiền mang dấu + như một khoản thu, nên phải nói rõ nó là gì.
              Bút toán điều chỉnh số dư thì chỉ cần chữ xám (xem `amountDisplay`)
              — tên danh mục của nó đã là "Điều chỉnh số dư" rồi. */}
          {tx.is_refund && (
            <Undo2
              aria-label="Hoàn tiền — trừ vào chi của danh mục này"
              className="ml-1 inline h-3 w-3 align-baseline text-fg-muted"
            />
          )}
          {tx.exclude_from_stats && <span className="sr-only"> (không tính vào Thu/Chi)</span>}
        </span>
        {/* Dòng phụ: tài khoản + chip nhãn. Nhãn cắt ngang danh mục nên chỉ thấy
            nó ở báo cáo là không đủ — phải thấy ngay trên dòng để biết khoản này
            đã gắn nhãn hay chưa. Chip đứng cùng dòng tài khoản, tự xuống dòng khi
            chật thay vì chiếm thêm một hàng cố định. */}
        {(tx.type !== 'transfer' || tags.length > 0) && (
          <span className="mt-0.5 flex flex-wrap items-center gap-1 text-2xs text-fg-muted">
            {tx.type !== 'transfer' && (
              <span className="min-w-0 truncate">{accountName(tx.account_id)}</span>
            )}
            {tags.map((t) => (
              <span
                key={t.id}
                className={`min-w-0 max-w-[9rem] truncate rounded-full px-1.5 py-px text-2xs font-medium ${TAG_CHIP_CLASS[tagColor(t.color)]}`}
              >
                {t.name}
              </span>
            ))}
          </span>
        )}
      </span>
      {/* Số tiền đi bằng mono (§4.2: "số phải mono"). Bỏ `tabular-nums`: trong font đơn
          cách mọi chữ số đã cùng bề rộng. */}
      <span className={`text-right font-mono text-sm font-semibold ${TONE_CLASS[style.tone]}`}>
        {style.sign}
        {formatMoney(tx.amount, srcCur)}
        {tx.to_amount != null && (
          <span className="block font-mono text-sm font-normal text-fg-muted">
            → +{formatMoney(tx.to_amount, dstCur)}
          </span>
        )}
      </span>
    </button>
  )

  if (!onDuplicate) return row

  // Lớp nền lộ ra khi vuốt. `overflow-hidden` để nó không tràn ra dòng bên cạnh, và nó
  // phải nằm DƯỚI dòng (dòng có nền riêng) chứ không cạnh dòng.
  return (
    <span className="relative block overflow-hidden">
      <span
        aria-hidden
        className="absolute inset-y-0 right-0 flex w-24 items-center justify-center gap-1 bg-state-good-bg text-2xs font-medium text-state-good-fg"
      >
        <Copy className="h-3.5 w-3.5" />
        Nhân bản
      </span>
      <span className="relative block bg-surface">{row}</span>
    </span>
  )
}
