// Sheet "Phân bổ ngân sách" — tách khỏi sheet Hồ sơ (mẫu A, 2026-09-04).
//
// Vì sao tách: đây là thứ người dùng quay lại CHỈNH nhiều lần (đổi phương pháp, nắn
// mốc), không phải thông tin hồ sơ khai một lần — nằm chung làm sheet Hồ sơ dài mấy
// màn cuộn. Nút "Đổi mốc" ở tab Ngân sách giờ mở thẳng vào đây.
//
// Vì sao KHÔNG còn ô <Select> phương pháp: chọn phương pháp cần thấy mô tả + số ướm
// của TỪNG ứng viên cạnh nhau rồi mới quyết — <option> không chứa nổi chừng đó. Sáu
// tấm thẻ bấm trực tiếp, mỗi tấm luôn hiện đủ (không giấu sau chế độ Gọn): tên, một
// câu mô tả, và huy hiệu ướm số 3 tháng thật viết bằng lời thường ("Hưởng thụ 40% —
// quá trần 20%") thay vì thuật ngữ "lệch 2/5 mốc".
import { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { Guide } from '../../components/Guide'
import { Card, Money, SectionTitle, actionButtonClass } from '../../components/ui'
import { useCategories, useUpdateProfile } from '../../hooks/queries'
import { useEscClose } from '../../hooks/useEscClose'
import type { ProfileRow } from '../../types/database.types'
import { shareLabel, type AxisLine, type AxisProgress } from '../budgets/axisTargets'
import { BUDGET_METHODS, clampBps, resolveMethod } from '../budgets/budgetMethods'
import { fitBadges } from '../budgets/methodFit'
import { useMethodFit } from '../budgets/useMethodFit'

interface Props {
  profile: ProfileRow
  onClose: () => void
}

/** Câu ví dụ của một dòng khoản: danh mục THẬT đã góp tiền vào khoản đó trong kỳ ướm. */
function exampleNames(line: AxisLine, nameOf: (id: string) => string | null): string[] {
  return line.slices
    .slice(0, 3)
    .map((s) => nameOf(s.categoryId))
    .filter((n): n is string => n !== null)
}

export function BudgetMethodSheet({ profile, onClose }: Props) {
  useEscClose(onClose)
  const uid = useId()
  const update = useUpdateProfile()
  const resolved = resolveMethod(profile)
  const [methodId, setMethodId] = useState(resolved.id)
  const [pct, setPct] = useState<Record<string, string>>(() =>
    Object.fromEntries(resolved.buckets.map((b) => [b.key, (b.bps / 100).toString()])),
  )
  const method = BUDGET_METHODS.find((m) => m.id === methodId) ?? BUDGET_METHODS[0]
  const fitData = useMethodFit()
  const { data: categories = [] } = useCategories()
  const base = profile.base_currency
  const nameOf = (id: string): string | null => {
    const c = categories.find((x) => x.id === id)
    return c ? `${c.icon ? `${c.icon} ` : ''}${c.name}` : null
  }

  function pickMethod(id: string) {
    const m = BUDGET_METHODS.find((x) => x.id === id) ?? BUDGET_METHODS[0]
    setMethodId(m.id)
    // Quay về phương pháp ĐANG LƯU thì nạp mốc đã chỉnh, không phải mặc định.
    const src = m.id === resolved.id ? resolved : m
    setPct(Object.fromEntries(src.buckets.map((b) => [b.key, (b.bps / 100).toString()])))
  }

  /** Cơ cấu kỳ ướm TÍNH THEO một phương pháp — nguồn của huy hiệu và câu ví dụ. */
  const axisOf = (id: string): AxisProgress | null =>
    fitData ? (fitData.fits.find((f) => f.method.id === id)?.axis ?? null) : null
  const selAxis = axisOf(method.id)

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
    const targets: Record<string, number> = {}
    for (const b of method.buckets) {
      const v = clampBps(toBps(pct[b.key] ?? ''), b.bps)
      if (v !== b.bps) targets[b.key] = v
    }
    // try/catch: lưu hỏng thì GIỮ sheet mở (toast lỗi toàn cục đã báo).
    try {
      await update.mutateAsync({ budget_method: method.id, budget_targets: targets })
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
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-surface-page p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:rounded-2xl animate-sheet-in lg:animate-sheet-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <SectionTitle role="block">Phân bổ ngân sách</SectionTitle>
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
              Chọn phương pháp
            </SectionTitle>
            {/* Câu định nghĩa kỳ ướm đứng ngoài <Guide>: không có nó thì các huy hiệu
                số bên dưới không rõ đo trên cái gì. */}
            {fitData ? (
              <p className="mt-1 text-sm text-fg-muted">
                Mỗi tấm dưới đây đã ướm sẵn số 3 tháng gần nhất của bạn — thu trung bình{' '}
                <Money amount={fitData.avgIncome} currency={base} />
                /tháng.
              </p>
            ) : fitData === null ? (
              <p className="mt-1 text-sm text-fg-muted">
                Chưa có khoản thu nào trong 3 tháng gần nhất nên chưa ướm số được — chọn theo
                mô tả từng phương pháp.
              </p>
            ) : (
              <p className="mt-1 text-sm text-fg-muted">Đang gom số liệu 3 tháng gần nhất…</p>
            )}

            {/* role=radiogroup: sáu tấm là MỘT câu hỏi chọn-1, không phải sáu nút rời */}
            <div
              role="radiogroup"
              aria-label="Phương pháp phân bổ"
              className="mt-2 flex flex-col gap-2"
            >
              {BUDGET_METHODS.map((m) => {
                const on = m.id === method.id
                const axis = axisOf(m.id)
                return (
                  <button
                    key={m.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => pickMethod(m.id)}
                    className={`rounded-md border p-3 text-left transition ${
                      on
                        ? 'border-accent bg-state-good-bg'
                        : 'border-border-panel bg-surface hover:bg-surface-sunken'
                    }`}
                  >
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-semibold text-fg-primary">{m.name}</span>
                      {on && <span className="shrink-0 text-sm font-medium text-fg-accent">✓ đang chọn</span>}
                    </span>
                    <span className="mt-0.5 block text-sm text-fg-secondary">{m.blurb}</span>
                    {axis && m.id !== 'custom' && (
                      <span className="mt-1.5 flex flex-wrap items-center gap-1">
                        {fitBadges(axis).map((b) => (
                          <span
                            key={b.text}
                            className={`rounded-full border px-2 py-0.5 text-2xs font-medium ${
                              b.tone === 'good'
                                ? 'border-state-good-border bg-state-good-bg text-state-good-fg'
                                : 'border-state-warn-border bg-state-warn-bg text-state-warn-fg'
                            }`}
                          >
                            {b.text}
                          </span>
                        ))}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </Card>

          <Card as="section" padding="md">
            <SectionTitle role="micro" as="h3">
              Các khoản của {method.name}
            </SectionTitle>
            <ul className="mt-1">
              {method.buckets.map((b, i) => {
                const line = selAxis?.lines.find((l) => l.key === b.key) ?? null
                const names = line ? exampleNames(line, nameOf) : []
                const pctNum = Number((pct[b.key] ?? '').replace(',', '.')) || 0
                return (
                  <li
                    key={b.key}
                    className={`flex items-start gap-3 py-2.5 ${i > 0 ? 'border-t border-border-subtle' : ''}`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-fg-primary">
                        {b.label}{' '}
                        <span className="font-normal text-fg-muted">
                          · {b.direction === 'cap' ? 'trần' : 'sàn — cần vượt'}
                        </span>
                      </p>
                      {/* Câu ví dụ là DỮ LIỆU của chính người dùng, không phải chữ dạy —
                          phải thấy cả ở chế độ Gọn, vì nó là thứ giải nghĩa cái tên khoản. */}
                      {b.source.kind === 'residual' ? (
                        <p className="mt-0.5 text-sm text-fg-muted">
                          Phần còn lại sau khi tiêu
                          {line && <> — 3 tháng qua bạn giữ được {shareLabel(line.share)}</>}
                        </p>
                      ) : names.length > 0 ? (
                        <p className="mt-0.5 truncate text-sm text-fg-muted">
                          Của bạn: {names.join(', ')}
                          {line && <> — {Math.round(line.share * 100)}%</>}
                        </p>
                      ) : (
                        <p className="mt-0.5 text-sm text-state-warn-fg">
                          Chưa khoản chi nào mang nhãn này —{' '}
                          <Link to="/settings/categories/classify" className="font-medium underline" onClick={onClose}>
                            gắn ở Phân loại
                          </Link>
                        </p>
                      )}
                    </div>
                    <div className="w-24 shrink-0">
                      <label htmlFor={`${uid}-${b.key}`} className="sr-only">
                        Phần trăm cho {b.label}
                      </label>
                      <input
                        id={`${uid}-${b.key}`}
                        inputMode="decimal"
                        value={pct[b.key] ?? ''}
                        onChange={(e) => setPct((p) => ({ ...p, [b.key]: e.target.value }))}
                        placeholder={(b.bps / 100).toString()}
                        className="w-full rounded-md border border-border-strong bg-surface p-2.5 text-right text-fg-primary"
                      />
                      {fitData && (
                        <p className="mt-0.5 text-right text-2xs text-fg-muted">
                          ≈ <Money amount={Math.round((fitData.avgIncome * pctNum) / 100)} currency={base} />
                          /th
                        </p>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
            <button
              type="button"
              onClick={() =>
                setPct(Object.fromEntries(method.buckets.map((b) => [b.key, (b.bps / 100).toString()])))
              }
              className="mt-1 text-sm font-medium text-fg-accent"
            >
              ↺ Về mặc định của phương pháp
            </button>
            {/* CHIỀU của các ô đứng ngoài <Guide>: gõ ngược trần/sàn thì mọi câu phán ở
                Ngân sách đọc ngược lại — sai lặng lẽ. */}
            <p className="mt-1 text-sm text-fg-muted">
              Các khoản chi là <b>trần</b>,{' '}
              {method.buckets.find((b) => b.direction === 'floor')!.label} là <b>sàn</b>.
              <Guide as="span"> Chi dưới trần là tốt, vượt sàn là tốt.</Guide>
            </p>
            {/* Không ép tổng = 100, nhưng lệch nhiều thì nhắc — nói về con số vừa gõ nên
                chế độ Gọn cũng phải thấy. */}
            {Math.abs(axisSum - 100) > 0.5 && (
              <p className="mt-1 text-sm text-fg-warn">
                Tổng hiện là {Math.round(axisSum)}% — không bắt buộc bằng 100%, nhưng lệch nhiều
                thì các mốc khó dùng chung.
              </p>
            )}
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
