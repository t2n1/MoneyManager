import { useState } from 'react'
import { useUpdateProfile } from '../../hooks/queries'
import { clampMonthStartDay } from '../../lib/dates'
import { CURRENCIES, formatMoney } from '../../lib/money'
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
  // Ba tham số dưới đây mở khóa các chỉ số nâng cao; để trống thì app chỉ ẩn
  // phần liên quan chứ không đoán bừa.
  const [wage, setWage] = useState(profile.hourly_wage != null ? String(profile.hourly_wage) : '')
  const [inflation, setInflation] = useState(
    profile.annual_inflation_bps != null ? (profile.annual_inflation_bps / 100).toString() : '',
  )
  const [tax, setTax] = useState(((profile.capital_gains_tax_bps ?? 2032) / 100).toString())
  // Mốc cơ cấu chi (tab Ngân sách). Nhập theo % cho dễ, lưu xuống bps.
  const [essential, setEssential] = useState(
    ((profile.target_essential_bps ?? 5000) / 100).toString(),
  )
  const [flexible, setFlexible] = useState(((profile.target_flexible_bps ?? 3000) / 100).toString())
  const [savings, setSavings] = useState(((profile.target_savings_bps ?? 2000) / 100).toString())
  const axisSum =
    (Number(essential.replace(',', '.')) || 0) +
    (Number(flexible.replace(',', '.')) || 0) +
    (Number(savings.replace(',', '.')) || 0)

  /** "2,5" hoặc "2.5" → 250 bps; rỗng/không hợp lệ → null. */
  function toBps(raw: string): number | null {
    const n = Number(raw.replace(',', '.'))
    if (raw.trim() === '' || !Number.isFinite(n)) return null
    return Math.round(n * 100)
  }

  /** bps trong khoảng 0–10000; null hoặc ngoài khoảng → mặc định. */
  function clampBps(bps: number | null, fallback: number): number {
    if (bps === null) return fallback
    return Math.min(10_000, Math.max(0, bps))
  }

  async function handleSave() {
    await update.mutateAsync({
      display_name: name.trim() || null,
      month_start_day: clampMonthStartDay(day),
      hourly_wage: wage.trim() === '' ? null : Number(wage),
      annual_inflation_bps: toBps(inflation),
      capital_gains_tax_bps: toBps(tax) ?? 2032,
      // Kẹp 0–100%: giá trị ngoài khoảng làm mọi thanh tiến độ thành vô nghĩa
      target_essential_bps: clampBps(toBps(essential), 5000),
      target_flexible_bps: clampBps(toBps(flexible), 3000),
      target_savings_bps: clampBps(toBps(savings), 2000),
    })
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 lg:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-t-2xl bg-gray-50 dark:bg-gray-950 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:rounded-2xl"
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
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Ảnh hưởng cách tính tháng trong báo cáo.</p>

        <label className="mt-3 block text-xs font-medium text-gray-500 dark:text-gray-400">Loại tiền gốc</label>
        <input
          value={`${profile.base_currency} · ${CURRENCIES[profile.base_currency].label}`}
          disabled
          className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-100 dark:bg-gray-800 p-3 text-gray-500 dark:text-gray-400"
        />
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Không đổi được.</p>

        {/* Tham số cho các chỉ số nâng cao — để trống thì phần đó tự ẩn đi */}
        <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Cho báo cáo nâng cao
        </h3>

        <label className="mt-2 block text-xs font-medium text-gray-500 dark:text-gray-400">
          Thu nhập mỗi giờ làm
        </label>
        <input
          inputMode="numeric"
          value={wage === '' ? '' : formatMoney(Number(wage), profile.base_currency)}
          onChange={(e) => setWage(e.target.value.replace(/\D/g, ''))}
          placeholder="Để trống nếu không dùng"
          className="mt-1 w-full rounded-xl border border-gray-300 bg-white p-3 text-right text-gray-800 focus:border-green-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
        />
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Để báo cáo quy đổi “món này = mấy giờ làm”. Lương tháng ÷ số giờ làm thực tế trong tháng.
        </p>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">
              Lạm phát năm (%)
            </label>
            <input
              inputMode="decimal"
              value={inflation}
              onChange={(e) => setInflation(e.target.value)}
              placeholder="2,5"
              className="mt-1 w-full rounded-xl border border-gray-300 bg-white p-3 text-right text-gray-800 focus:border-green-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">
              Thuế lãi vốn (%)
            </label>
            <input
              inputMode="decimal"
              value={tax}
              onChange={(e) => setTax(e.target.value)}
              placeholder="20,32"
              className="mt-1 w-full rounded-xl border border-gray-300 bg-white p-3 text-right text-gray-800 focus:border-green-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            />
          </div>
        </div>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Dùng để tính lợi nhuận đầu tư sau thuế và sau trượt giá. Ở Nhật thuế lãi vốn là 20,32%;
          lạm phát vài năm gần đây quanh 2–3%.
        </p>

        {/* Mốc cơ cấu chi — hiện ở đầu tab Ngân sách */}
        <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Mốc cơ cấu chi (% thu nhập)
        </h3>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {[
            { label: 'Thiết yếu', value: essential, set: setEssential, ph: '50' },
            { label: 'Linh hoạt', value: flexible, set: setFlexible, ph: '30' },
            { label: 'Tiết kiệm', value: savings, set: setSavings, ph: '20' },
          ].map((f) => (
            <div key={f.label}>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">
                {f.label}
              </label>
              <input
                inputMode="decimal"
                value={f.value}
                onChange={(e) => f.set(e.target.value)}
                placeholder={f.ph}
                className="mt-1 w-full rounded-xl border border-gray-300 bg-white p-3 text-right text-gray-800 focus:border-green-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
              />
            </div>
          ))}
        </div>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Mặc định là quy tắc 50/30/20. Hai mốc đầu là <b>trần</b> (chi dưới mức là tốt), tiết kiệm
          là <b>sàn</b> (vượt mức là tốt).
          {/* Không ép tổng = 100: có người muốn để đệm, nhưng lệch nhiều thì nhắc */}
          {Math.abs(axisSum - 100) > 0.5 && (
            <span className="text-amber-600 dark:text-amber-400">
              {' '}
              Tổng hiện là {Math.round(axisSum)}% — không bắt buộc bằng 100%, nhưng lệch nhiều thì
              ba mốc khó dùng chung.
            </span>
          )}
        </p>

        <button
          type="button"
          onClick={handleSave}
          disabled={update.isPending}
          className="mt-4 w-full rounded-xl bg-green-700 py-3 text-sm font-semibold text-white active:scale-[0.99] disabled:opacity-60"
        >
          Lưu
        </button>
      </div>
    </div>
  )
}
