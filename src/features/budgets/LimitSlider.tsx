// Thanh trượt hạn mức của mặt lập kế hoạch — xổ ra dưới dòng đang bấm.
//
// Vì sao là thanh trượt chứ không chỉ một ô số: đặt hạn mức là một phép ĐÁNH ĐỔI giữa các
// danh mục dưới một trần chung, mà ô số không cho thấy đánh đổi. Kéo thì ba thanh trục ở
// cột trái đi theo trong cùng một khung hình, nên người dùng thấy "nâng Ăn uống ¥5.000 làm
// Linh hoạt vượt trần" thay vì phải Lưu rồi mới biết.
//
// Vì sao chỉ MỘT thanh mở một lúc (dòng đang bấm), không phải 26 thanh hiện sẵn: ở 375px
// hai mươi sáu thanh dài gấp gần ba panel, và ngón tay kéo thanh ngang trong một danh sách
// cuộn dọc thì cứ hai lần lại thành cuộn trang.
//
// KHÔNG có ô nhập số ở đây. Ba việc thanh trượt không làm được — gõ số chính xác, bật cờ
// dồn, xoá hạn mức — nằm ở `BudgetEditSheet` qua liên kết "Sửa chi tiết". Nhét thêm một ô
// số vào đây là dựng lại tấm trượt đó lần thứ hai, rồi hai bản lệch nhau.

import { Money } from '../../components/ui'
import { formatMoney, type CurrencyCode } from '../../lib/money'
import { sharePct } from './axisTargets'

export interface LimitSliderProps {
  base: CurrencyCode
  /** giá trị đang hiện (base minor) — số đang kéo, không phải số đã lưu */
  value: number
  /** vạch gợi ý; null = trục này đang trong trần nên không có gì phải đạt */
  suggest: number | null
  /**
   * Mép phải và bước kéo, do nơi gọi CHỤP LẠI lúc mở thanh (`sliderScale`).
   *
   * Nhận qua prop chứ KHÔNG tự tính từ `value`, và đây là chỗ đã có lỗi thật: tính từ số
   * đang kéo thì đẩy núm tới mép làm `ceiling` lớn lên → mép phải nới ra → núm giật về
   * giữa thanh → còn chỗ để đẩy tiếp. Một lần kéo liền tay đưa ¥20.000 lên ¥1.000.000
   * qua năm nhịp giật (50k → 100k → 200k → 500k → 1tr), và người dùng phải kéo ngược lại
   * để hạ. Thang đứng yên suốt lúc thanh còn mở thì không có nhịp giật nào.
   *
   * Muốn vượt mép phải thì nhả tay rồi bấm mở lại — thang mới tính từ số vừa đặt — hoặc
   * gõ số thẳng ở "Sửa chi tiết".
   */
  max: number
  step: number
  /** tên trục của danh mục này; null = chưa phân loại nên không thuộc trục nào */
  axisLabel: string | null
  /** tỷ lệ trục LÚC MỞ thanh (0..1); null khi không biết thu nhập */
  axisShareBefore: number | null
  /** tỷ lệ trục theo số đang kéo (0..1) */
  axisShareNow: number | null
  /** mốc của trục dưới dạng tỷ lệ (0..1) */
  axisTargetShare: number | null
  axisOk: boolean
  /**
   * Câu ở góc trái khi KHÔNG có vạch gợi ý và KHÔNG thuộc trục nào. Mặt theo dõi mở
   * thanh này với `axisLabel = null` (trục ở đó đo chi THẬT, kéo trần không làm nó nhúc
   * nhích, nên in ra là in một con số đứng im), và câu mặc định "chưa gắn nhóm nên không
   * vào trần nào" lúc đó sai — danh mục có gắn nhóm, chỉ là mặt này không nói về trục.
   */
  emptyHint?: string
  /** kéo: chỉ đổi số đang hiện, chưa ghi */
  onDrag: (v: number) => void
  /** nhả tay: ghi xuống máy chủ */
  onCommit: (v: number) => void
  onDetail: () => void
}

export function LimitSlider({
  base,
  value,
  suggest,
  max,
  step,
  axisLabel,
  axisShareBefore,
  axisShareNow,
  axisTargetShare,
  axisOk,
  emptyHint,
  onDrag,
  onCommit,
  onDetail,
}: LimitSliderProps) {
  // Vạch chỉ vẽ khi nằm trong thang. `sliderScale` đã phủ `suggest` nên điều kiện này chỉ
  // đúng-cho-chắc, không phải một nhánh thật.
  const markPct = suggest !== null && max > 0 ? Math.min((suggest / max) * 100, 100) : null
  const moved =
    axisShareBefore !== null &&
    axisShareNow !== null &&
    sharePct(axisShareBefore) !== sharePct(axisShareNow)

  return (
    <div className="border-t border-border-subtle bg-surface-sunken px-4 py-2">
      {/* `min-h-11` cho vùng chạm 44px, `accent-[var(--accent)]` cho màu — cùng khuôn với
          các thanh trượt ở màn Sức khỏe và Kịch bản cả đời. */}
      <label className="block">
        <span className="sr-only">Hạn mức</span>
        <span className="relative block">
          <input
            type="range"
            min={0}
            max={max}
            step={step}
            value={Math.min(value, max)}
            onChange={(e) => onDrag(Number(e.target.value))}
            onPointerUp={(e) => onCommit(Number((e.target as HTMLInputElement).value))}
            onKeyUp={(e) => onCommit(Number((e.target as HTMLInputElement).value))}
            className="min-h-11 w-full accent-[var(--accent)]"
          />
          {markPct !== null && (
            <span
              aria-hidden
              className="pointer-events-none absolute top-1/2 h-3.5 w-0.5 -translate-y-1/2 bg-gray-500 dark:bg-gray-300"
              style={{ left: `${markPct}%` }}
            />
          )}
        </span>
      </label>

      <div className="flex items-baseline justify-between gap-2 text-2xs">
        {suggest !== null ? (
          <button
            type="button"
            onClick={() => {
              onDrag(suggest)
              onCommit(suggest)
            }}
            className="min-h-11 -my-2.5 text-fg-accent underline"
          >
            về vạch gợi ý {formatMoney(suggest, base)}
          </button>
        ) : (
          <span className="text-fg-muted">
            {axisLabel
              ? `${axisLabel} đang trong trần`
              : (emptyHint ?? 'chưa gắn nhóm nên không vào trần nào')}
          </span>
        )}
        <span className="shrink-0 text-fg-muted">
          tối đa <Money amount={max} currency={base} className="!text-2xs !text-fg-muted" />
        </span>
      </div>

      {axisLabel !== null && axisShareNow !== null && axisTargetShare !== null && (
        <p className="mt-0.5 text-2xs font-medium text-fg-muted">
          {axisLabel}{' '}
          {moved && <span className="text-fg-muted">{sharePct(axisShareBefore!)}% → </span>}
          <span className={axisOk ? 'text-money-in' : 'text-fg-warn'}>
            {sharePct(axisShareNow)}%
          </span>{' '}
          · tối đa {Math.round(axisTargetShare * 100)}%
        </p>
      )}

      <button
        type="button"
        onClick={onDetail}
        className="min-h-11 -my-2.5 mt-0.5 text-2xs font-medium text-fg-accent underline"
      >
        Sửa chi tiết
      </button>
    </div>
  )
}
