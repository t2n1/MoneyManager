import { ExplainBox } from '../../components/ExplainBox'
import { Card } from '../../components/ui'
import type { Seasonality } from './multiYear'

/** Ngưỡng gọi là "tốn hơn / rẻ hơn hẳn" so với tháng trung bình. */
const HIGH = 110
const LOW = 90

interface Props {
  data: Seasonality
}

export function SeasonalityCard({ data }: Props) {
  const { months, yearsUsed, peak, trough, reason } = data

  // Thiếu dữ liệu thì nói thiếu, kèm lý do — không vẽ biểu đồ trông như thật.
  if (reason)
    return (
      <Card as="section">
        <h2 className="text-sm font-semibold text-fg-muted">Mùa vụ chi tiêu</h2>
        <p className="mt-2 text-3xl font-bold text-fg-primary">—</p>
        <p className="mt-1 text-xs text-fg-muted">{reason}</p>
      </Card>
    )

  const max = Math.max(...months.map((m) => m.indexPct), 100)

  return (
    <Card as="section">
      <h2 className="text-sm font-semibold text-fg-muted">Mùa vụ chi tiêu</h2>

      {peak && (
        <>
          <p className="mt-1 text-3xl font-bold text-fg-primary">
            Tháng {peak.month}
            <span className="ml-2 align-middle text-base font-semibold text-money-out">
              {peak.indexPct.toFixed(0)}%
            </span>
          </p>
          <p className="mt-1 text-xs leading-relaxed text-fg-muted">
            Nghĩa là: tháng {peak.month} thường tốn{' '}
            <strong>{(peak.indexPct - 100).toFixed(0)}% nhiều hơn</strong> một tháng bình thường
            {trough ? `, còn tháng ${trough.month} là tháng nhẹ nhất` : ''}. Biết trước thì đầu
            tháng {peak.month} nên để dành thêm.
          </p>
        </>
      )}

      {/* Cột ngang: đọc trên điện thoại dễ hơn 12 cột dọc chen nhau.
          Số phần trăm căn PHẢI trong ô rộng cố định (w-12) nên không cần bật chữ số đều
          bằng tay — canh lề đã giữ cột thẳng, mà idiom đó đang có ngưỡng chỉ-được-giảm
          trong tests/designSystem.test.ts. */}
      <ul className="mt-3 flex flex-col gap-1">
        {months.map((m) => {
          const strong = m.indexPct >= HIGH
          const weak = m.indexPct <= LOW
          return (
            <li key={m.month} className="flex items-center gap-2 text-xs">
              <span className="w-10 shrink-0 text-fg-muted">T{m.month}</span>
              <span className="h-4 flex-1 overflow-hidden rounded bg-surface-page">
                <span
                  className={`block h-full rounded ${
                    strong ? 'bg-red-600' : weak ? 'bg-green-700' : 'bg-slate-400'
                  }`}
                  style={{ width: `${(m.indexPct / max) * 100}%` }}
                />
              </span>
              <span
                className={`w-12 shrink-0 text-right ${
                  strong
                    ? 'font-semibold text-money-out'
                    : weak
                      ? 'text-money-in'
                      : 'text-fg-muted'
                }`}
              >
                {m.indexPct.toFixed(0)}%
              </span>
            </li>
          )
        })}
      </ul>

      <p className="mt-2 text-xs text-fg-muted">
        Tính từ {yearsUsed.length} năm đủ 12 tháng: {yearsUsed.join(', ')}.
      </p>

      <ExplainBox>
        <p>
          Với mỗi năm, lấy <strong>tỷ trọng chi của từng tháng trong năm đó</strong>, rồi mới
          lấy trung bình các năm. Chỉ số 100% = đúng mức một tháng trung bình.
        </p>
        <p>
          Vì sao không lấy trung bình số tiền: mức chi năm 2019 và năm nay khác nhau xa (lương,
          lạm phát, đổi chỗ ở), lấy tiền thô thì năm gần đây lấn hết và "mùa vụ" biến thành
          "xu hướng".
        </p>
        <p>
          Chỉ dùng năm <strong>đủ 12 tháng</strong>: năm mới ghi vài tháng thì tỷ trọng vô
          nghĩa. Vì vậy năm đang chạy không được tính vào đây.
        </p>
        <p>
          Nên làm gì: các tháng ≥ 110% là chỗ đặt hạn mức riêng hoặc để dành trước; tháng ≤ 90%
          là chỗ dồn tiền cho mục tiêu tiết kiệm.
        </p>
      </ExplainBox>
    </Card>
  )
}
