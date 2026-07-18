import { useState } from 'react'
import { useUpdateProfile } from '../../hooks/queries'
import { clampMonthStartDay } from '../../lib/dates'
import { CURRENCIES } from '../../lib/money'
import type { ProfileRow } from '../../types/database.types'

interface Props {
  profile: ProfileRow
  onClose: () => void
}

const DAY_OPTIONS = Array.from({ length: 28 }, (_, i) => i + 1)

/** Sheet sửa tên hiển thị + ngày bắt đầu tháng. Loại tiền gốc chỉ hiển thị. */
export function ProfileEditSheet({ profile, onClose }: Props) {
  const update = useUpdateProfile()
  const [name, setName] = useState(profile.display_name ?? '')
  const [day, setDay] = useState(clampMonthStartDay(profile.month_start_day))

  async function handleSave() {
    await update.mutateAsync({
      display_name: name.trim() || null,
      month_start_day: clampMonthStartDay(day),
    })
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 lg:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-t-2xl bg-gray-50 dark:bg-gray-950 p-4 lg:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-800 dark:text-gray-100">Hồ sơ</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            Đóng
          </button>
        </div>

        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Tên hiển thị</label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Tên của bạn"
          className="mt-1 w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 p-3 text-gray-800 dark:text-gray-100 focus:border-green-500 focus:outline-none"
        />

        <label className="mt-3 block text-xs font-medium text-gray-500 dark:text-gray-400">Ngày bắt đầu tháng</label>
        <select
          value={day}
          onChange={(e) => setDay(Number(e.target.value))}
          className="mt-1 w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 p-3 text-gray-800 dark:text-gray-100 focus:border-green-500 focus:outline-none"
        >
          {DAY_OPTIONS.map((d) => (
            <option key={d} value={d}>
              Ngày {d}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">Ảnh hưởng cách tính tháng trong báo cáo.</p>

        <label className="mt-3 block text-xs font-medium text-gray-500 dark:text-gray-400">Loại tiền gốc</label>
        <input
          value={`${profile.base_currency} · ${CURRENCIES[profile.base_currency].label}`}
          disabled
          className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-100 dark:bg-gray-800 p-3 text-gray-400 dark:text-gray-500"
        />
        <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">Không đổi được.</p>

        <button
          type="button"
          onClick={handleSave}
          disabled={update.isPending}
          className="mt-4 w-full rounded-xl bg-green-600 py-3 text-sm font-semibold text-white active:scale-[0.99] disabled:opacity-60"
        >
          Lưu
        </button>
      </div>
    </div>
  )
}
