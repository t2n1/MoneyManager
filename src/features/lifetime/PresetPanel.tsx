// Khối "Thêm mốc cuộc đời" — thư viện mẫu, ngay trên trang.
//
// Trước bản này, đường duy nhất tới thư viện mẫu là: mở "Sửa kịch bản" → cuộn tới khối
// mốc → bấm "Dùng mẫu" → chọn mẫu → gõ năm → Lưu. Năm bước, và bước cuối GHI THẲNG vào
// kịch bản. Ở đây bấm một cái là mẫu vào BẢN NHÁP, đồ thị đổi ngay, rồi kéo chip trên
// đồ thị tới đúng năm — thấy hệ quả trước khi quyết định lưu.
//
// Dùng CHÍNH `LIFE_PRESETS`, không có bảng mẫu thứ hai — xem JSDoc `applyPreset`.
import { ArrowDownCircle, ArrowUpCircle } from 'lucide-react'
import { Guide } from '../../components/Guide'
import { Card, Money, Num, SectionTitle } from '../../components/ui'
import type { CurrencyCode } from '../../lib/currencies'
import { LIFE_PRESETS, type PresetContext, type PresetResult } from './presets'
import { presetWeight } from './presetWeight'

interface Props {
  /** Dựng ngữ cảnh cho mẫu ở một năm — chỗ gọi biết chặng đang chạy và tỷ giá. */
  buildCtx: (year: number) => PresetContext
  /** Năm mặc định khi thêm mẫu. Người dùng chỉnh sau bằng cách kéo chip trên đồ thị. */
  defaultYear: number
  currency: CurrencyCode
  onAdd: (preset: { id: string; label: string }, result: PresetResult) => void
  /**
   * 'card' (mặc định) = khối riêng trong cột Giả định ngoài trang.
   * 'inline' = chỉ DẢI CHIP, không thẻ không tiêu đề — dùng trong mục "Mốc cuộc đời" của
   * trình sửa kịch bản, nơi tiêu đề mục đã nói nó là gì và một thẻ lồng trong thẻ chỉ
   * thêm một tầng viền.
   *
   * Một prop chứ hai component: chính ĐÁM CHIP mới là phần đáng dùng chung (nó tính
   * trước tổng thu/chi của từng mẫu để chip không chỉ có tên), và chép nó ra chỗ thứ hai
   * là hai bảng mẫu trôi lệch — đúng thứ JSDoc `applyPreset` cảnh báo.
   */
  variant?: 'card' | 'inline'
}

export function PresetPanel({ buildCtx, defaultYear, currency, onAdd, variant = 'card' }: Props) {
  const chips = (
    <div className={variant === 'card' ? 'mt-2 flex flex-wrap gap-2' : 'flex flex-wrap gap-1.5'}>
        {LIFE_PRESETS.map((p) => {
          const result = p.build(buildCtx(defaultYear))
          // Mẫu này nặng cỡ nào — cho người dùng biết TRƯỚC khi bấm. Tổng CẢ mẫu kèm số
          // năm (không phải tổng các khoản mỗi năm cộng lại — xem presetWeight.ts, lỗi
          // "Sinh con 436万"); mẫu chạy hết đời thì nói số mỗi năm.
          const weight = presetWeight(result, currency)
          const netOut = weight === null || weight.amountMinor >= 0
          return (
            <button
              key={p.id}
              type="button"
              title={p.hint}
              onClick={() => onAdd({ id: p.id, label: p.label }, result)}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border-strong bg-transparent px-2.5 py-1 text-sm font-medium text-fg-secondary transition hover:bg-surface-sunken active:scale-95"
            >
              {netOut ? (
                <ArrowDownCircle className="h-3.5 w-3.5 shrink-0 text-money-out" aria-hidden="true" />
              ) : (
                <ArrowUpCircle className="h-3.5 w-3.5 shrink-0 text-money-in" aria-hidden="true" />
              )}
              {p.label}
              {weight !== null && weight.amountMinor !== 0 && (
                <span className="font-mono text-2xs text-fg-muted">
                  <Money amount={Math.abs(weight.amountMinor)} currency={currency} compact tone="muted" />
                  {weight.kind === 'perYear' ? (
                    '/năm'
                  ) : weight.years > 1 ? (
                    <>
                      {' · '}
                      <Num tone="muted">{weight.years}</Num> năm
                    </>
                  ) : null}
                </span>
              )}
            </button>
          )
        })}
    </div>
  )

  if (variant === 'inline') {
    return (
      <>
        <p className="mb-1.5 text-2xs uppercase tracking-label text-fg-disabled">
          Thêm nhanh từ mẫu
        </p>
        {chips}
      </>
    )
  }

  return (
    <Card as="section" elevation="panel" padding="panel">
      <SectionTitle role="micro">Thêm mốc cuộc đời</SectionTitle>
      <Guide className="mt-1 text-2xs leading-relaxed text-fg-muted">
        Bấm một mẫu để thêm vào bản nháp ở năm {defaultYear} — rồi kéo chip trên đồ thị tới
        đúng năm, bấm chip để sửa số. Chưa có gì được ghi cho tới khi bấm Lưu.
      </Guide>
      {chips}
    </Card>
  )
}
