import type { CategoryKind, CostType, NeedLevel } from '../../types/database.types'

export const NEED_OPTIONS = [
  ['essential', 'Thiết yếu'],
  ['flexible', 'Linh hoạt'],
  ['education', 'Giáo dục'],
  ['giving', 'Cho đi'],
  ['buffer', 'Dự phòng'],
  [null, 'Chưa'],
] as const satisfies readonly (readonly [NeedLevel | null, string])[]

export const COST_OPTIONS = [
  ['fixed', 'Cố định'],
  ['variable', 'Biến đổi'],
  [null, 'Chưa'],
] as const satisfies readonly (readonly [CostType | null, string])[]

/**
 * `categories.kind` — tiêu thật hay chuyển tài sản (migration 0046).
 *
 * KHÔNG có lựa chọn "Chưa": cột này `not null`, và một danh mục thì luôn là một trong hai.
 * Khác `need_level`/`cost_type` — hai cái đó nullable vì "chưa phân loại" là một trạng thái
 * THẬT mà app phải đếm được (nó làm chỉ số Cơ cấu chi tiêu thiếu).
 */
export const KIND_OPTIONS = [
  ['expense', 'Tiêu thật'],
  ['transfer', 'Chuyển tài sản'],
] as const satisfies readonly (readonly [CategoryKind, string])[]

/**
 * Nút gạt 2–3 lựa chọn cho một trục phân loại.
 *
 * `T` nhận cả `boolean` chứ không chỉ `string | null`: cờ `accounts.is_liquid` là ba trạng
 * thái true / false / null ("để app suy"), và nó cần đúng khuôn nút gạt này. Bọc boolean
 * thành chuỗi 'yes'/'no' rồi ánh xạ lại ở nơi gọi là thêm một phép dịch không cần thiết,
 * và là chỗ để lẫn 'no' với null.
 */
export function ClassificationToggle<T extends string | boolean | null>({
  label,
  groupLabel,
  options,
  value,
  onChange,
}: {
  /** Nhãn phía trên; bỏ trống thì không hiện nhãn */
  label?: string
  /** Tên nhóm cho screen-reader khi không có nhãn nhìn thấy (mặc định dùng `label`) */
  groupLabel?: string
  options: readonly (readonly [T, string])[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div>
      {label && (
        <p className="mb-1 text-sm font-medium text-fg-muted">{label}</p>
      )}
      {/* Số cột theo SỐ LỰA CHỌN, không cứng 3. `KIND_OPTIONS` chỉ có hai mục, và với
          `grid-cols-3` thì cột thứ ba là một ô trống bằng cả một nút — đọc ra như một lựa
          chọn thứ ba bấm không được. Chỉ hai giá trị nên khai tường minh: Tailwind quét
          chuỗi tĩnh, `grid-cols-${n}` dựng động sẽ không sinh ra class nào. */}
      <div
        role="group"
        aria-label={groupLabel ?? label}
        className={`grid gap-1 rounded-xl bg-surface-sunken p-1 ${
          options.length === 2 ? 'grid-cols-2' : 'grid-cols-3'
        }`}
      >
        {options.map(([val, text]) => (
          <button
            key={text}
            type="button"
            onClick={() => onChange(val)}
            aria-pressed={value === val}
            // Mục không chọn dùng --fg-on-track (gray-600), KHÔNG phải --fg-muted:
            // track ở đây là gray-200, ở đó gray-500 chỉ đạt 3,91:1 → trượt AA.
            // gray-600 trên gray-200 = 6,88:1. Cùng lý do với nhãn tab trên gray-100.
            className={`min-h-11 rounded-md text-sm font-medium transition ${
              value === val
                ? 'bg-surface text-fg-primary shadow-sm'
                : 'text-fg-on-track hover:text-fg-primary'
            }`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  )
}
