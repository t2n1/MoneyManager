import type { CostType, NeedLevel } from '../../types/database.types'

export const NEED_OPTIONS = [
  ['essential', 'Thiết yếu'],
  ['flexible', 'Linh hoạt'],
  [null, 'Chưa'],
] as const satisfies readonly (readonly [NeedLevel | null, string])[]

export const COST_OPTIONS = [
  ['fixed', 'Cố định'],
  ['variable', 'Biến đổi'],
  [null, 'Chưa'],
] as const satisfies readonly (readonly [CostType | null, string])[]

/** Nút gạt 3 lựa chọn cho một trục phân loại (kèm "Chưa" = bỏ trống). */
export function ClassificationToggle<T extends string | null>({
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
        <p className="mb-1 text-xs font-medium text-fg-muted">{label}</p>
      )}
      <div
        role="group"
        aria-label={groupLabel ?? label}
        className="grid grid-cols-3 gap-1 rounded-xl bg-surface-sunken p-1"
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
            className={`min-h-11 rounded-md text-xs font-medium transition ${
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
