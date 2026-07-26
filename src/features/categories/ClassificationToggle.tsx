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
        <p className="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">{label}</p>
      )}
      <div
        role="group"
        aria-label={groupLabel ?? label}
        className="grid grid-cols-3 gap-1 rounded-xl bg-gray-200 p-1 dark:bg-gray-800"
      >
        {options.map(([val, text]) => (
          <button
            key={text}
            type="button"
            onClick={() => onChange(val)}
            aria-pressed={value === val}
            className={`min-h-11 rounded-lg text-xs font-medium transition ${
              value === val
                ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-900 dark:text-gray-100'
                : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  )
}
