// DẢI PHÂN VỊ của mô phỏng "nếu mất thu nhập" (bản vẽ 15b, mục 5).
//
// Hai hàng trên cùng một trục tháng: nếp chi hiện tại, và nhánh "cắt hết chi linh hoạt".
// Đặt chung một trục là điểm chính — nó cho thấy việc cắt chi dịch được bao xa, thứ mà
// hai con số ở hai câu văn khác nhau không nói ra được.
//
// Mọi phép tính vị trí ở `runwayBand.ts` (có test). File này chỉ vẽ.
import { MIN_WIDTH_PCT, runwayBandGeometry } from './runwayGeometry'
import type { RunwayResult } from './health'

interface Props {
  /** Kịch bản giữ nguyên nếp chi. */
  base: RunwayResult
  /** Nhánh cắt hết chi linh hoạt; null = không có gì để cắt (nơi gọi tự quyết). */
  lean: RunwayResult | null
  /** Chi linh hoạt mỗi tháng, đã format — in vào nhãn hàng thứ hai. */
  leanLabel?: string
}

/** Một hàng dải: nhãn, thanh p10–p90, kim trung vị. */
function Row({
  label,
  r,
  axisMax,
  tone,
}: {
  label: string
  r: RunwayResult
  axisMax: number
  tone: 'base' | 'lean'
}) {
  // Trục truyền từ ngoài để hai hàng dùng CHUNG một thước; tự tính mỗi hàng một trục là
  // vẽ ra hai dải trông bằng nhau trong khi số tháng chênh gấp đôi. Vì vậy chỗ này KHÔNG
  // gọi runwayBandGeometry — nó tự chọn trục theo riêng hàng mình.
  const toPct = (v: number) => Math.min(100, Math.max(0, (v / axisMax) * 100))
  const left = Math.min(toPct(r.p10), 100 - MIN_WIDTH_PCT)
  const width = Math.max(toPct(r.p90) - left, MIN_WIDTH_PCT)
  const median = toPct(r.p50)
  const medianAtHorizon = r.p50 >= r.horizon
  const fill = tone === 'base' ? 'bg-accent/25' : 'bg-state-good-bg'
  const mark = tone === 'base' ? 'bg-accent' : 'bg-state-good-fg'

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-2xs text-fg-muted">
        <span className="min-w-0 truncate">{label}</span>
        {/* Trung vị nói bằng CHỮ khi chạm trần: "60 tháng" đọc thành "cạn tiền ở tháng
            60", còn sự thật là mô phỏng chạy hết tầm mà chưa cạn. */}
        <span className="shrink-0 tabular-nums font-medium text-fg-primary">
          {medianAtHorizon ? `không cạn trong ${r.horizon} tháng` : `trung vị ${r.p50} tháng`}
        </span>
      </div>
      <div className="relative mt-1 h-3">
        <div className="absolute inset-x-0 top-1 h-1 rounded-full bg-surface-sunken" />
        <div
          className={`absolute top-0.5 h-2 rounded-full ${fill}`}
          style={{ left: `${left}%`, width: `${width}%` }}
          role="img"
          aria-label={`Từ ${r.p10} đến ${r.p90} tháng, trung vị ${r.p50} tháng`}
        />
        <div
          className={`absolute top-0 h-3 w-1 -translate-x-1/2 rounded-full ${mark}`}
          style={{ left: `${median}%` }}
          aria-hidden
        />
      </div>
    </div>
  )
}

export function RunwayBand({ base, lean, leanLabel }: Props) {
  // Trục chọn theo dải RỘNG NHẤT trong hai hàng: chọn theo hàng đầu thì nhánh cắt chi
  // (luôn dài hơn) sẽ tràn khung.
  const widest = lean !== null && lean.p90 > base.p90 ? lean : base
  const { axisMax, ticks } = runwayBandGeometry({ ...widest, horizon: widest.horizon })

  return (
    <div className="mt-2 rounded-lg border border-border-subtle bg-surface-sunken p-2.5">
      <div className="space-y-2">
        <Row label="Giữ nguyên nếp chi" r={base} axisMax={axisMax} tone="base" />
        {lean !== null && (
          <Row
            label={leanLabel ? `Cắt hết chi linh hoạt (${leanLabel}/tháng)` : 'Cắt hết chi linh hoạt'}
            r={lean}
            axisMax={axisMax}
            tone="lean"
          />
        )}
      </div>
      {/* Vạch trục đứng CUỐI, dùng chung cho cả hai hàng — hai thước riêng cho hai dải
          trên cùng một khối là mời đọc sai. Đơn vị gắn vào vạch cuối chứ không đặt một
          nhãn "tháng" riêng ở lề phải: vạch cuối nằm đúng ở lề phải nên hai chữ đè nhau. */}
      <div className="relative mt-1.5 h-3">
        {ticks.map((t, i) => (
          <span
            key={t}
            className={`absolute text-3xs tabular-nums text-fg-muted ${
              i === ticks.length - 1 ? 'right-0' : '-translate-x-1/2'
            }`}
            style={i === ticks.length - 1 ? undefined : { left: `${(t / axisMax) * 100}%` }}
          >
            {i === ticks.length - 1 ? `${t} tháng` : t}
          </span>
        ))}
      </div>
    </div>
  )
}
