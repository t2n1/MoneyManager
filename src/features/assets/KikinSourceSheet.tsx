// Sheet khai lại hai tham số của 企業年金 — 給付利率 và ba điểm hiệu chuẩn trên sheet của 基金.
//
// Vì sao cần sheet này: cả hai thứ 基金 ĐỔI THEO THỜI GIAN và app không có cách nào tự biết.
// 給付利率 đặt lại theo từng 事業年度; ba điểm hiệu chuẩn là của mức lương lúc sheet được in.
// Không có chỗ khai lại thì màn 退職金 âm thầm dùng số của 2025 mãi mãi — xem R3 và R6 trong
// docs/superpowers/specs/2026-08-26-man-hinh-taishokukin-design.md
import { useState } from 'react'
import { Guide } from '../../components/Guide'
import { MoneyField, MONEY_FIELD_CLASS } from '../../components/MoneyField'
import { SectionTitle, actionButtonClass } from '../../components/ui'
import { useEscClose } from '../../hooks/useEscClose'
import { showToast } from '../../lib/dialog'
import { useUpdateProfile } from '../../hooks/queries'
import type { KikinSheet } from '../../types/database.types'
import type { CalibrationPoint } from '../tax/kikinBenefit'

const JPY = 'JPY' as const

interface Props {
  /** Suất đang dùng (bps) — mức mặc định hoặc mức người dùng đã khai. */
  rateBps: number
  /** Ngày của sheet đang dùng ('YYYY-MM'). */
  dated: string
  /** Ba điểm đang dùng. */
  points: readonly CalibrationPoint[]
  onClose: () => void
}

/** Một hàng của bảng hiệu chuẩn, giữ ở dạng số để MoneyField dùng trực tiếp. */
interface Hang {
  m: number
  si: number
  tax: number
}

export function KikinSourceSheet({ rateBps, dated, points, onClose }: Props) {
  useEscClose(onClose)
  const update = useUpdateProfile()

  // Suất giữ ở dạng CHUỖI phần trăm ('0,30') chứ không phải số: gõ dở "0," là một
  // giá trị hợp lệ giữa đường, mà số thì không giữ được trạng thái đó.
  const [suat, setSuat] = useState((rateBps / 100).toFixed(2).replace('.', ','))
  const [ngay, setNgay] = useState(dated)
  const [hang, setHang] = useState<Hang[]>(
    points.map((p) => ({
      m: p.monthlyContribution,
      si: p.socialInsuranceAnnual,
      tax: p.taxAnnual,
    })),
  )

  const bps = Math.round(Number(suat.replace(',', '.')) * 100)
  const suatHopLe = Number.isFinite(bps) && bps >= 0 && bps <= 10_000
  const ngayHopLe = /^\d{4}-(0[1-9]|1[0-2])$/.test(ngay)
  /**
   * Bắt luôn ràng buộc "phải có hàng ¥0" ở đây chứ không chỉ nhắc bằng chữ: `benefitAt`
   * lấy điểm THẤP NHẤT làm mốc 0 để tính `savedAnnual`, nên thiếu hàng ¥0 thì mọi con số
   * "tiết kiệm được" tụt đi đúng phần của mức thấp nhất — sai lặng lẽ, không ai thấy.
   * Và chữ hướng dẫn nằm trong <Guide> nên ở chế độ Gọn nó không hiện.
   */
  const bangHopLe =
    hang.length >= 2 &&
    hang.every((h) => h.si > 0 && h.tax > 0) &&
    hang.some((h) => h.m === 0)

  const doiHang = (i: number, patch: Partial<Hang>) =>
    setHang((cur) => cur.map((h, k) => (k === i ? { ...h, ...patch } : h)))

  async function luu() {
    if (!suatHopLe || !ngayHopLe || !bangHopLe) return
    const sheet: KikinSheet = {
      dated: ngay,
      points: [...hang].sort((a, b) => a.m - b.m),
    }
    try {
      await update.mutateAsync({ kikin_give_rate_bps: bps, kikin_sheet: sheet })
      showToast('Đã lưu số của 基金')
      onClose()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Không lưu được, thử lại.', 'error')
    }
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
          <SectionTitle role="block">Số của 基金</SectionTitle>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-md px-3 py-1.5 text-sm text-fg-muted hover:bg-surface-sunken"
          >
            Đóng
          </button>
        </div>

        <label className="mb-1 block text-sm font-medium text-fg-muted" htmlFor="kikin-rate">
          給付利率 (%/năm)
        </label>
        <input
          id="kikin-rate"
          type="text"
          inputMode="decimal"
          value={suat}
          onChange={(e) => setSuat(e.target.value)}
          className="w-full rounded-md border border-border-strong bg-surface p-3 text-right text-lg font-semibold text-fg-primary"
        />
        <Guide className="mt-1 text-2xs text-fg-muted">
          Số trên giấy 残高通知 gửi hằng năm. 基金 đặt lại theo từng 事業年度.
        </Guide>

        <label className="mt-4 mb-1 block text-sm font-medium text-fg-muted" htmlFor="kikin-dated">
          Ngày in trên sheet (YYYY-MM)
        </label>
        <input
          id="kikin-dated"
          type="text"
          inputMode="numeric"
          placeholder="2026-08"
          value={ngay}
          onChange={(e) => setNgay(e.target.value)}
          className="w-full rounded-md border border-border-strong bg-surface p-3 text-right text-lg font-semibold text-fg-primary"
        />

        <SectionTitle className="mt-4">Ba mức trên sheet</SectionTitle>
        <Guide className="mt-1 text-2xs text-fg-muted">
          Với mỗi mức đóng, gõ 社会保険料 và 所得・住民税 CẢ NĂM đúng như sheet in.
        </Guide>

        {hang.map((h, i) => (
          <div key={i} className="mt-3 rounded-lg bg-surface-sunken p-2.5">
            <span className="mb-1 block text-sm font-medium text-fg-muted">
              掛金 mỗi tháng
            </span>
            <MoneyField
              value={h.m}
              onChange={(v) => doiHang(i, { m: v })}
              currency={JPY}
              autoOpen={false}
              ariaLabel={`Mức đóng mỗi tháng, hàng ${i + 1}`}
              className={MONEY_FIELD_CLASS}
            />
            <span className="mt-2 mb-1 block text-sm font-medium text-fg-muted">
              社会保険料 cả năm
            </span>
            <MoneyField
              value={h.si}
              onChange={(v) => doiHang(i, { si: v })}
              currency={JPY}
              autoOpen={false}
              ariaLabel={`社会保険料 cả năm, hàng ${i + 1}`}
              className={MONEY_FIELD_CLASS}
            />
            <span className="mt-2 mb-1 block text-sm font-medium text-fg-muted">
              所得税 + 住民税 cả năm
            </span>
            <MoneyField
              value={h.tax}
              onChange={(v) => doiHang(i, { tax: v })}
              currency={JPY}
              autoOpen={false}
              ariaLabel={`Thuế cả năm, hàng ${i + 1}`}
              className={MONEY_FIELD_CLASS}
            />
          </div>
        ))}

        <Guide className="mt-3 text-2xs text-fg-muted">
          Phải có một hàng mức <b>¥0</b> — đó là mốc để tính "tiết kiệm được bao nhiêu".
        </Guide>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={luu}
            disabled={!suatHopLe || !ngayHopLe || !bangHopLe || update.isPending}
            className={`${actionButtonClass('primary')} flex-1`}
          >
            Lưu
          </button>
        </div>
        {(!suatHopLe || !ngayHopLe || !bangHopLe) && (
          <p className="mt-2 text-2xs text-money-out">
            {!suatHopLe
              ? 'Suất phải là số từ 0 tới 100.'
              : !ngayHopLe
                ? 'Ngày sheet phải dạng 2026-08.'
                : !hang.some((h) => h.m === 0)
                  ? 'Phải có một hàng mức đóng ¥0 làm mốc.'
                  : 'Mỗi hàng phải có cả 社会保険料 và thuế lớn hơn 0.'}
          </p>
        )}
      </div>
    </div>
  )
}
