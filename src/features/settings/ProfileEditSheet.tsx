import { useId, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { Guide } from '../../components/Guide'
import { useUpdateProfile } from '../../hooks/queries'
import { clampMonthStartDay } from '../../lib/dates'
import { CURRENCIES, formatMoney } from '../../lib/money'
import type { ProfileRow } from '../../types/database.types'
import { useEscClose } from '../../hooks/useEscClose'
import { Card, SectionTitle, Select, actionButtonClass } from '../../components/ui'
import { resolveMethod } from '../budgets/budgetMethods'

interface Props {
  profile: ProfileRow
  onClose: () => void
  /** Mở sheet "Phân bổ ngân sách" (đóng sheet này) — SettingsPage cầm cả hai. */
  onOpenBudget: () => void
}

const DAY_OPTIONS = Array.from({ length: 28 }, (_, i) => i + 1)

/**
 * Sheet Hồ sơ — chỉ còn danh tính + tham số báo cáo nâng cao (mẫu A, 2026-09-04).
 *
 * Phân bổ ngân sách TÁCH sang `BudgetMethodSheet`: nó là thứ chỉnh đi chỉnh lại,
 * không phải hồ sơ khai một lần; nằm chung từng làm sheet này dài mấy màn cuộn.
 * Ở đây chỉ giữ một dòng tóm tắt bấm sang — và dòng đó KHÔNG dính vào nút Lưu:
 * hai sheet lưu hai mảng cột riêng, không giẫm nhau.
 */
export function ProfileEditSheet({ profile, onClose, onOpenBudget }: Props) {
  useEscClose(onClose)
  const uid = useId()
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

  const method = resolveMethod(profile)

  /** "2,5" hoặc "2.5" → 250 bps; rỗng/không hợp lệ → null. */
  function toBps(raw: string): number | null {
    const n = Number(raw.replace(',', '.'))
    if (raw.trim() === '' || !Number.isFinite(n)) return null
    return Math.round(n * 100)
  }

  async function handleSave() {
    // try/catch: lưu hỏng thì GIỮ sheet mở (toast lỗi toàn cục đã báo),
    // không đóng sheet như thể đã lưu xong.
    try {
      await update.mutateAsync({
        display_name: name.trim() || null,
        month_start_day: clampMonthStartDay(day),
        hourly_wage: wage.trim() === '' ? null : Number(wage),
        annual_inflation_bps: toBps(inflation),
        capital_gains_tax_bps: toBps(tax) ?? 2032,
      })
    } catch {
      return
    }
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 lg:items-center animate-overlay-in"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-2xl bg-surface-page p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:rounded-2xl animate-sheet-in lg:animate-sheet-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <SectionTitle role="block">Hồ sơ</SectionTitle>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm text-fg-muted hover:bg-surface-sunken"
          >
            Đóng
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <Card as="section" padding="md">
            <SectionTitle role="micro" as="h3">
              Tài khoản
            </SectionTitle>
            <label htmlFor={`${uid}-name`} className="mt-2 block text-sm font-medium text-fg-muted">
              Tên hiển thị
            </label>
            <input
              id={`${uid}-name`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Tên của bạn"
              className="mt-1 w-full rounded-md border border-border-strong bg-surface p-3 text-fg-primary"
            />

            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label htmlFor={`${uid}-day`} className="block text-sm font-medium text-fg-muted">
                  Ngày bắt đầu tháng
                </label>
                <Select
                  id={`${uid}-day`}
                  value={day}
                  onChange={(e) => setDay(Number(e.target.value))}
                  wrapClassName="mt-1 w-full"
                >
                  {DAY_OPTIONS.map((d) => (
                    <option key={d} value={d}>
                      Ngày {d}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label htmlFor={`${uid}-base`} className="block text-sm font-medium text-fg-muted">
                  Loại tiền gốc
                </label>
                <input
                  id={`${uid}-base`}
                  value={`${profile.base_currency} · ${CURRENCIES[profile.base_currency].label}`}
                  disabled
                  className="mt-1 w-full rounded-md border border-border-panel bg-surface-sunken p-3 text-fg-muted"
                />
              </div>
            </div>
            <Guide className="mt-1 text-sm text-fg-muted">
              Ngày bắt đầu tháng ảnh hưởng cách tính tháng trong báo cáo. Loại tiền gốc không đổi
              được.
            </Guide>
          </Card>

          {/* Tham số cho các chỉ số nâng cao — để trống thì phần đó tự ẩn đi */}
          <Card as="section" padding="md">
            <SectionTitle role="micro" as="h3">
              Cho báo cáo nâng cao
            </SectionTitle>
            <label htmlFor={`${uid}-wage`} className="mt-2 block text-sm font-medium text-fg-muted">
              Thu nhập mỗi giờ làm
            </label>
            <input
              id={`${uid}-wage`}
              inputMode="numeric"
              value={wage === '' ? '' : formatMoney(Number(wage), profile.base_currency)}
              onChange={(e) => setWage(e.target.value.replace(/\D/g, ''))}
              placeholder="Để trống nếu không dùng"
              className="mt-1 w-full rounded-md border border-border-strong bg-surface p-3 text-right text-fg-primary"
            />
            {/* Câu ĐỊNH NGHĨA con số phải gõ đứng ngoài <Guide>: ô này nhận một giá trị mơ hồ
                (gộp hay thực lĩnh? giờ hợp đồng hay có tăng ca?) và người ta chỉ gõ nó MỘT lần,
                nên nó không bao giờ thành "quy ước đã thuộc lòng". Mà Gọn là mặc định — bọc cả
                đoạn thì đa số người dùng thấy một ô số không nhãn nghĩa. Phần nói ô này mở ra
                báo cáo nào thì vẫn là chữ dạy, vẫn ẩn. */}
            <p className="mt-1 text-sm text-fg-muted">
              Lương tháng ÷ số giờ làm thực tế trong tháng.
              <Guide as="span"> Để báo cáo quy đổi “món này = mấy giờ làm”.</Guide>
            </p>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label htmlFor={`${uid}-infl`} className="block text-sm font-medium text-fg-muted">
                  Lạm phát năm (%)
                </label>
                <input
                  id={`${uid}-infl`}
                  inputMode="decimal"
                  value={inflation}
                  onChange={(e) => setInflation(e.target.value)}
                  placeholder="2,5"
                  className="mt-1 w-full rounded-md border border-border-strong bg-surface p-3 text-right text-fg-primary"
                />
              </div>
              <div>
                <label htmlFor={`${uid}-tax`} className="block text-sm font-medium text-fg-muted">
                  Thuế lãi vốn (%)
                </label>
                <input
                  id={`${uid}-tax`}
                  inputMode="decimal"
                  value={tax}
                  onChange={(e) => setTax(e.target.value)}
                  placeholder="20,32"
                  className="mt-1 w-full rounded-md border border-border-strong bg-surface p-3 text-right text-fg-primary"
                />
              </div>
            </div>
            <Guide className="mt-1 text-sm text-fg-muted">
              Dùng để tính lợi nhuận đầu tư sau thuế và sau trượt giá. Ở Nhật thuế lãi vốn là
              20,32%; lạm phát vài năm gần đây quanh 2–3%.
            </Guide>
          </Card>

          {/* Dòng sang sheet Phân bổ — cả thẻ là MỘT nút. Tóm tắt in mốc ĐANG LƯU
              (resolveMethod), không phải state nháp nào: sheet kia tự lo nháp của nó. */}
          <Card as="section" padding="none" className="overflow-hidden">
            <button
              type="button"
              onClick={onOpenBudget}
              className="flex w-full items-center gap-3 p-3 text-left transition hover:bg-surface-sunken"
            >
              <span className="min-w-0 flex-1">
                <SectionTitle role="micro" as="h3">
                  Phân bổ ngân sách
                </SectionTitle>
                <span className="mt-1 block truncate text-sm text-fg-primary">
                  {method.name} ·{' '}
                  {method.buckets.map((b) => `${b.label} ${b.bps / 100}`).join(' / ')}
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden />
            </button>
          </Card>

          <button
            type="button"
            onClick={handleSave}
            disabled={update.isPending}
            className={actionButtonClass('primary', 'w-full')}
          >
            Lưu
          </button>
        </div>
      </div>
    </div>
  )
}
