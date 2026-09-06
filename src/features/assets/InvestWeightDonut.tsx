// Donut "Tỷ trọng theo cổ phiếu" — mã nào đang chiếm bao nhiêu phần danh mục.
//
// Vì sao có cả TIỀN MẶT trong donut: câu hỏi là "danh mục của tôi đang phân bổ thế nào",
// mà tiền chưa mua cũng là một cách phân bổ — bỏ nó ra thì một danh mục 90% tiền mặt vẫn
// vẽ ra một vòng đầy cổ phiếu.
//
// Màu đi qua `sliceColor()` của investFormat.ts — CHUNG với thanh tỷ trọng ở bảng Cơ cấu,
// nên mã nào cũng mang đúng một màu trên cả hai khu. Đó là một dải cùng tông đổi dần độ
// sáng, mỗi chế độ một chiều, đã đo ≥ 3:1 với nền thẻ. Đừng thay bằng bộ nhiều sắc: đỏ và
// xanh lá trong app này đã có nghĩa cố định (vượt hạn mức / lãi), gán chúng cho một mã là
// mời người đọc tưởng mã đó đang có chuyện.
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts'
import { Card, Money, Num, SectionTitle } from '../../components/ui'
import { share, sliceColor, SLICE_NEUTRAL } from './investFormat'

/** Bao nhiêu mã được vẽ riêng trước khi phần còn lại gộp vào "Khác". */
const SO_LAT_RIENG = 5

const VND = 'VND' as const

interface Props {
  /** Mã đang giữ kèm giá trị (đồng), theo thứ tự giảm dần. */
  positions: { symbol: string; value: number }[]
  /** đồng — tiền chưa mua gì (gồm cả ví đã khai). */
  cash: number
}

interface Lat {
  ten: string
  value: number
  mau: string
}

export function InvestWeightDonut({ positions, cash }: Props) {
  const coPhieu = positions.filter((p) => p.value > 0)
  const lats: Lat[] = coPhieu
    .slice(0, SO_LAT_RIENG)
    .map((p, i) => ({ ten: p.symbol, value: p.value, mau: sliceColor(i) }))

  const conLai = coPhieu.slice(SO_LAT_RIENG).reduce((s, p) => s + p.value, 0)
  if (conLai > 0) {
    lats.push({
      ten: `Khác (${coPhieu.length - SO_LAT_RIENG} mã)`,
      value: conLai,
      mau: SLICE_NEUTRAL,
    })
  }
  // Tiền mặt âm nghĩa là sổ lệnh thiếu lần nạp — một lát âm không vẽ được, và khu Giá trị
  // danh mục đã nói ra chuyện đó rồi.
  if (cash > 0) lats.push({ ten: 'Tiền mặt', value: cash, mau: SLICE_NEUTRAL })

  const tong = lats.reduce((s, l) => s + l.value, 0)
  if (lats.length === 0 || tong <= 0) return null

  return (
    <Card as="section">
      <SectionTitle>Tỷ trọng</SectionTitle>

      <div className="mt-2 flex flex-col items-center gap-4 lg:flex-row lg:items-center lg:gap-6">
        {/* Bề rộng cố định cho vòng, phần chú giải chiếm nốt: để vòng không co lại thành
            một sợi chỉ khi danh sách mã dài. */}
        <div className="h-40 w-40 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={lats}
                dataKey="value"
                nameKey="ten"
                innerRadius="58%"
                outerRadius="100%"
                startAngle={90}
                endAngle={-270}
                isAnimationActive={false}
                stroke="var(--surface)"
                strokeWidth={2}
              >
                {lats.map((l) => (
                  <Cell key={l.ten} fill={l.mau} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Chú giải là BẢNG, không phải danh sách chấm: mỗi lát cần tên + phần trăm + số
            tiền, và ba cột thẳng hàng mới so được các mã với nhau bằng mắt. */}
        <dl className="w-full min-w-0 space-y-1">
          {lats.map((l) => (
            <div key={l.ten} className="flex items-baseline gap-2 text-sm">
              {/* Màu ô chú giải trỏ vào ĐÚNG hằng số đã tô cho lát (docs/design-system.md). */}
              <span
                className="mt-0.5 size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: l.mau }}
                aria-hidden
              />
              <dt className="min-w-0 flex-1 truncate">{l.ten}</dt>
              <dd className="shrink-0 text-right">
                <Num>{share(l.value / tong)}</Num>
                <span className="ml-2 text-2xs text-fg-muted">
                  <Money amount={l.value} currency={VND} />
                </span>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </Card>
  )
}
