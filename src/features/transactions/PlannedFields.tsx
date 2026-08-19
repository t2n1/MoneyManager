// Field riêng của "Sẽ chi" trong màn Nhập — chép ĐÚNG nhãn của PlannedFormSheet
// (planned/PlannedFormSheet.tsx) chữ nào ra chữ đó, để hai đường ghi cùng một bảng
// (planned_expenses) không lệch chữ với nhau (test: tests/plannedCopy.test.ts).
//
// KHÔNG có ô tài khoản: khoản sắp chi chưa trừ tiền nên chưa cần biết trừ từ đâu —
// chọn ví là việc của lúc XÁC NHẬN ĐÃ CHI (mở khoản này ra ở /entry?planned=<id>),
// không phải lúc lên kế hoạch.
//
// KHÔNG có TagPicker riêng: nhãn của khoản sắp chi đi qua đúng <TagPicker> chung mà
// TransactionForm đã bày ở cột phải (vô điều kiện ở cả mười dạng, xem Task 6) — thêm
// một bộ chọn nhãn thứ hai ở đây là hỏi hai lần cùng một câu.
import type { PlannedDraft } from './plannedFromEntry'
import { anchoredDueOn } from './plannedDraftDefaults'
import { MoneyField } from '../../components/MoneyField'
import { CURRENCIES, type CurrencyCode } from '../../lib/currencies'
import type { CategoryRow, DuePrecision } from '../../types/database.types'

const PRECISION: readonly (readonly [DuePrecision, string, string])[] = [
  ['day', 'Đúng ngày', 'Biết chắc ngày nào — vd hạn đóng phí 20/8'],
  ['month', 'Khoảng tháng', 'Mới biết tháng, chưa chốt ngày — vd sửa nhà tháng 10'],
]

interface Props {
  value: PlannedDraft
  onChange: (value: PlannedDraft) => void
  categories: CategoryRow[]
}

export function PlannedFields({ value, onChange, categories }: Props) {
  const expenseCats = categories.filter((c) => c.type === 'expense' && !c.is_archived)

  return (
    <div className="flex flex-col">
      <label className="mb-1 block text-xs font-medium text-fg-muted" htmlFor="entry-planned-title">
        Chi cái gì
      </label>
      <input
        id="entry-planned-title"
        // Bullet 1 của brief: chỉ tên là bắt buộc, và tiêu điểm phải nhảy vào ĐÂY chứ
        // không phải ô số tiền — số tiền một khoản chưa xảy ra thường chưa biết.
        autoFocus
        value={value.title}
        onChange={(e) => onChange({ ...value, title: e.target.value })}
        placeholder="Ví dụ: đóng phí vệ sinh"
        className="mb-3 w-full rounded-md border border-border-strong px-3 py-2 text-base sm:text-sm"
      />

      {/* <span>: hàng này có HAI ô (MoneyField + chọn loại tiền) nên không có một đích
          duy nhất cho `htmlFor`; mỗi ô tự mang tên qua `ariaLabel` (giống PlannedFormSheet). */}
      <span className="mb-1 block text-xs font-medium text-fg-muted">
        Ước tính <span className="text-fg-muted">(để trống nếu chưa biết)</span>
      </span>
      <div className="mb-3 flex gap-2">
        <MoneyField
          value={value.amount}
          onChange={(amount) => onChange({ ...value, amount })}
          currency={value.currency}
          autoOpen={false}
          ariaLabel="Số tiền ước tính"
          className="flex-1 rounded-lg border border-border-strong px-3 py-2 text-right text-sm font-semibold"
        />
        <select
          value={value.currency}
          onChange={(e) => onChange({ ...value, currency: e.target.value as CurrencyCode })}
          aria-label="Loại tiền"
          className="w-24 shrink-0 rounded-md border border-border-strong bg-surface px-2 py-2 text-sm"
        >
          {Object.keys(CURRENCIES).map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <span className="mb-1 block text-xs font-medium text-fg-muted">Chắc tới đâu</span>
      <div
        role="group"
        aria-label="Chắc tới đâu"
        className="mb-1 flex overflow-hidden rounded-lg border border-border-strong"
      >
        {PRECISION.map(([p, label, hint]) => (
          <button
            key={p}
            type="button"
            title={hint}
            onClick={() =>
              onChange({
                ...value,
                precision: p,
                // Neo NGAY LÚC ĐỔI, không chỉ lúc submit (plannedFromEntry neo lần
                // hai): đổi "Đúng ngày" → "Khoảng tháng" SAU khi đã chọn ngày 17 mà
                // không neo ở đây thì state còn nguyên ngày 17 cho tới lúc bấm Lưu.
                // `anchoredDueOn` CHUNG với ô ngày ngay dưới — một cơ chế, không phải
                // hai bản chép tay (fix round 1: hai bản khác nhau là đúng chỗ lọt
                // '-01'/'' khi ô ngày bị xoá trắng).
                dueOn: anchoredDueOn(p, value.dueOn, value.dueOn),
              })
            }
            aria-pressed={value.precision === p}
            className={`min-h-11 flex-1 px-2 text-sm font-medium ${
              value.precision === p
                ? 'bg-accent text-fg-on-accent'
                : 'text-fg-secondary hover:bg-surface-sunken'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="mb-3 text-xs text-fg-muted">
        {value.precision === 'day'
          ? 'Danh sách hiện đúng ngày này.'
          : 'Danh sách chỉ hiện tháng — không bịa ra một ngày cụ thể.'}
      </p>

      {/* Cặp nhãn ô ngày sống Ở ĐÂY, không ở PHASE_LABEL (entryShape.ts): nó đọc theo
          `precision` — một field của PlannedDraft — chứ không theo hướng tiền, nên một
          bảng theo hướng không nói được cặp này. */}
      <label className="mb-1 block text-xs font-medium text-fg-muted" htmlFor="entry-planned-due">
        {value.precision === 'day' ? 'Ngày đến hạn' : 'Tháng dự kiến'}
      </label>
      <input
        id="entry-planned-due"
        // `type="month"` NGUYÊN BẢN của trình duyệt khi precision là 'month' — khớp
        // đúng PlannedFormSheet, không tự dựng lưới tháng riêng.
        type={value.precision === 'day' ? 'date' : 'month'}
        value={value.precision === 'day' ? value.dueOn : value.dueOn.slice(0, 7)}
        onChange={(e) =>
          onChange({
            ...value,
            // Neo ở ĐÂY nữa, qua CÙNG `anchoredDueOn` với nút "Chắc tới đâu" ngay
            // trên: ô ngày có thể trả về CHUỖI RỖNG (backspace, nút xoá của trình
            // duyệt) — `anchoredDueOn` rơi về `value.dueOn` (giá trị trước sự kiện
            // này) thay vì để lọt '' hoặc, ở precision 'month', '-01' xuống payload.
            dueOn: anchoredDueOn(value.precision, e.target.value, value.dueOn),
          })
        }
        className="mb-3 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm"
      />

      <label className="mb-1 flex min-h-11 items-center gap-2 text-sm text-fg-primary">
        <input
          type="checkbox"
          checked={value.remind}
          onChange={(e) => onChange({ ...value, remind: e.target.checked })}
          className="h-4 w-4 accent-green-700"
        />
        Nhắc tôi
      </label>
      {value.remind ? (
        <div className="mb-3 flex items-center gap-2">
          <label className="text-xs text-fg-muted" htmlFor="entry-planned-remind">
            Nhắc trước
          </label>
          {/* Ô TỰ DO (`type="number"`), không phải bốn chip mốc dựng sẵn — chip mốc
              chặn mất giá trị hợp lệ khác (vd nhắc trước mười ngày) và tạo ra hai UI
              cho cùng một cột `remind_days_before`. */}
          <input
            id="entry-planned-remind"
            type="number"
            min={0}
            max={99}
            // aria-label riêng (đè lên tên từ <label htmlFor> phía trên) vì ô này nằm
            // giữa một form dài nhiều field — tên đầy đủ giúp trình đọc màn hình không
            // phải suy ra "ngày" là ngày gì.
            aria-label="Nhắc trước bao nhiêu ngày"
            value={value.remindDays}
            onChange={(e) => onChange({ ...value, remindDays: e.target.value })}
            className="w-16 rounded-md border border-border-strong px-2 py-1.5 text-right text-base sm:text-sm"
          />
          <span className="text-xs text-fg-muted">ngày (0 = đúng ngày đến hạn)</span>
        </div>
      ) : (
        <p className="mb-3 text-xs text-fg-muted">
          Không kêu gì cả — chỉ nằm trong danh sách để bạn nhìn.
        </p>
      )}

      <label className="mb-1 block text-xs font-medium text-fg-muted" htmlFor="entry-planned-cat">
        Danh mục <span className="text-fg-muted">(không bắt buộc)</span>
      </label>
      <select
        id="entry-planned-cat"
        value={value.categoryId ?? ''}
        onChange={(e) => onChange({ ...value, categoryId: e.target.value || null })}
        className="mb-3 w-full rounded-md border border-border-strong bg-surface px-2 py-2 text-sm"
      >
        <option value="">— Chưa chọn —</option>
        {expenseCats.map((c) => (
          <option key={c.id} value={c.id}>
            {c.icon} {c.name}
          </option>
        ))}
      </select>

      <label className="mb-1 block text-xs font-medium text-fg-muted" htmlFor="entry-planned-note">
        Ghi chú <span className="text-fg-muted">(không bắt buộc)</span>
      </label>
      <input
        id="entry-planned-note"
        value={value.note}
        onChange={(e) => onChange({ ...value, note: e.target.value })}
        className="mb-3 w-full rounded-md border border-border-strong px-3 py-2 text-base sm:text-sm"
      />
    </div>
  )
}
