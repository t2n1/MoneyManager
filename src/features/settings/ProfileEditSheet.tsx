import { useId, useState } from 'react'
import { Guide } from '../../components/Guide'
import { useUpdateProfile } from '../../hooks/queries'
import { clampMonthStartDay } from '../../lib/dates'
import { CURRENCIES, formatMoney } from '../../lib/money'
import type { ProfileRow } from '../../types/database.types'
import { useEscClose } from '../../hooks/useEscClose'
import { SectionTitle, Select, actionButtonClass } from '../../components/ui'
import { BUDGET_METHODS, clampBps, resolveMethod } from '../budgets/budgetMethods'

interface Props {
  profile: ProfileRow
  onClose: () => void
}

const DAY_OPTIONS = Array.from({ length: 28 }, (_, i) => i + 1)

/** Sheet sửa tên hiển thị + ngày bắt đầu tháng. Loại tiền gốc chỉ hiển thị. */
export function ProfileEditSheet({ profile, onClose }: Props) {
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
  // Phương pháp + % theo khoá khoản của PHƯƠNG PHÁP ĐANG CHỌN.
  // Đổi phương pháp là nạp lại số chuẩn của nó — mốc đã chỉnh của phương pháp cũ
  // nằm yên trong budget_targets? KHÔNG: lưu là ghi đè toàn bộ, xem handleSave.
  const resolved = resolveMethod(profile)
  const [methodId, setMethodId] = useState(resolved.id)
  const [pct, setPct] = useState<Record<string, string>>(() =>
    Object.fromEntries(resolved.buckets.map((b) => [b.key, (b.bps / 100).toString()])),
  )
  const method = BUDGET_METHODS.find((m) => m.id === methodId) ?? BUDGET_METHODS[0]

  function pickMethod(id: string) {
    const m = BUDGET_METHODS.find((x) => x.id === id) ?? BUDGET_METHODS[0]
    setMethodId(m.id)
    setPct(Object.fromEntries(m.buckets.map((b) => [b.key, (b.bps / 100).toString()])))
  }

  const axisSum = method.buckets.reduce(
    (s, b) => s + (Number((pct[b.key] ?? '').replace(',', '.')) || 0),
    0,
  )

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
        budget_method: method.id,
        // Chỉ lưu mốc LỆCH mặc định — khoá thiếu nghĩa là "theo phương pháp".
        budget_targets: Object.fromEntries(
          method.buckets
            .map((b) => [b.key, clampBps(toBps(pct[b.key] ?? ''), b.bps)] as const)
            .filter(([, v], i) => v !== method.buckets[i].bps),
        ),
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
        className="w-full max-w-lg rounded-t-2xl bg-surface-page p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:rounded-2xl animate-sheet-in lg:animate-sheet-pop"
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

        <label htmlFor={`${uid}-name`} className="block text-sm font-medium text-fg-muted">
          Tên hiển thị
        </label>
        <input
          id={`${uid}-name`}
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Tên của bạn"
          className="mt-1 w-full rounded-md border border-border-strong bg-surface p-3 text-fg-primary"
        />

        <label htmlFor={`${uid}-day`} className="mt-3 block text-sm font-medium text-fg-muted">
          Ngày bắt đầu tháng
        </label>
        <Select
          id={`${uid}-day`}
          value={day}
          onChange={(e) => setDay(Number(e.target.value))} wrapClassName="mt-1 w-full">
          {DAY_OPTIONS.map((d) => (
            <option key={d} value={d}>
              Ngày {d}
            </option>
          ))}
        </Select>
        <p className="mt-1 text-sm text-fg-muted">Ảnh hưởng cách tính tháng trong báo cáo.</p>

        <label htmlFor={`${uid}-base`} className="mt-3 block text-sm font-medium text-fg-muted">
          Loại tiền gốc
        </label>
        <input
          id={`${uid}-base`}
          value={`${profile.base_currency} · ${CURRENCIES[profile.base_currency].label}`}
          disabled
          className="mt-1 w-full rounded-md border border-border-panel bg-surface-sunken p-3 text-fg-muted"
        />
        <p className="mt-1 text-sm text-fg-muted">Không đổi được.</p>

        {/* Tham số cho các chỉ số nâng cao — để trống thì phần đó tự ẩn đi */}
        <SectionTitle role="micro" as="h3" className="mt-5">
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
          Dùng để tính lợi nhuận đầu tư sau thuế và sau trượt giá. Ở Nhật thuế lãi vốn là 20,32%;
          lạm phát vài năm gần đây quanh 2–3%.
        </Guide>

        {/* Mốc cơ cấu chi — hiện ở đầu tab Ngân sách */}
        <SectionTitle role="micro" as="h3" className="mt-5">
          Mốc cơ cấu chi (% thu nhập)
        </SectionTitle>
        <label htmlFor={`${uid}-method`} className="mt-2 block text-sm font-medium text-fg-muted">
          Phương pháp phân bổ
        </label>
        <Select
          id={`${uid}-method`}
          value={methodId}
          onChange={(e) => pickMethod(e.target.value)}
          wrapClassName="mt-1 w-full"
        >
          {BUDGET_METHODS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </Select>
        <Guide className="mt-1 text-sm text-fg-muted">{method.blurb}</Guide>

        {/* Ô % sinh theo khoản của phương pháp: 2 ô (80/20) tới 6 ô (Tự đặt).
            grid-cols-3 tĩnh, thừa thì tự xuống hàng — không grid-cols-${n} động. */}
        <div className="mt-2 grid grid-cols-3 gap-2">
          {method.buckets.map((b) => (
            <div key={b.key}>
              <label htmlFor={`${uid}-${b.key}`} className="block text-sm font-medium text-fg-muted">
                {b.label}
              </label>
              <input
                id={`${uid}-${b.key}`}
                inputMode="decimal"
                value={pct[b.key] ?? ''}
                onChange={(e) => setPct((p) => ({ ...p, [b.key]: e.target.value }))}
                placeholder={(b.bps / 100).toString()}
                className="mt-1 w-full rounded-md border border-border-strong bg-surface p-3 text-right text-fg-primary"
              />
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => pickMethod(method.id)}
          className="mt-1 text-sm font-medium text-fg-accent"
        >
          ↺ Về mặc định của phương pháp
        </button>
        {/* CHIỀU của các ô này đứng ngoài <Guide>, cùng lý do với dòng cảnh báo tổng ở dưới:
            mỗi ô đều là "%", nhìn không ra cái nào là trần cái nào là sàn. Gõ ngược thì mọi
            câu phán trục ở Ngân sách đọc ngược lại — sai lặng lẽ. Con số mặc định của từng
            phương pháp thì vẫn là chữ dạy, vẫn ẩn ở Gọn. */}
        <p className="mt-1 text-sm text-fg-muted">
          Các khoản chi là <b>trần</b>, {method.buckets.find((b) => b.direction === 'floor')!.label} là{' '}
          <b>sàn</b>.
          <Guide as="span"> Chi dưới trần là tốt, vượt sàn là tốt. Đổi phương pháp là các ô nạp lại số chuẩn của nó.</Guide>
        </p>
        {/* Không ép tổng = 100: có người muốn để đệm, nhưng lệch nhiều thì nhắc. Dòng này
            đứng RIÊNG, không nằm trong <Guide> ở trên: nó nói về con số vừa gõ, nên chế độ
            Gọn cũng phải thấy — gộp vào khối hướng dẫn là mất cảnh báo. */}
        {Math.abs(axisSum - 100) > 0.5 && (
          <p className="mt-1 text-sm text-fg-warn">
            Tổng hiện là {Math.round(axisSum)}% — không bắt buộc bằng 100%, nhưng lệch nhiều thì các
            mốc khó dùng chung.
          </p>
        )}

        <button
          type="button"
          onClick={handleSave}
          disabled={update.isPending}
          className={actionButtonClass('primary', 'mt-4 w-full')}
        >
          Lưu
        </button>
      </div>
    </div>
  )
}
