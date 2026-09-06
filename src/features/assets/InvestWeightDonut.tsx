// Khu "Tỷ trọng" — hai vòng: theo mã và theo ngành.
//
// Hai vòng có MẪU SỐ KHÁC NHAU, và nhãn phải nói ra:
//   · theo mã   — gồm cả tiền mặt, vì câu hỏi là "danh mục đang phân bổ thế nào" và tiền
//     chưa mua cũng là một cách phân bổ. Bỏ nó ra thì một danh mục 90% tiền mặt vẫn vẽ ra
//     một vòng đầy cổ phiếu.
//   · theo ngành — chỉ cổ phiếu, vì tiền mặt không thuộc ngành nào. Nhét nó vào thành một
//     "ngành" là bịa ra một ngành.
// Không nói ra thì HPG 36% ở vòng này và Thép 55% ở vòng kia trông như hai số mâu thuẫn.
//
// Màu đi qua `sliceColor()` của investFormat.ts — CHUNG với thanh tỷ trọng ở bảng Cơ cấu,
// nên mã nào cũng mang đúng một màu trên cả hai khu. Đó là một dải cùng tông đổi dần độ
// sáng, mỗi chế độ một chiều, đã đo ≥ 3:1 với nền thẻ. Đừng thay bằng bộ nhiều sắc: đỏ và
// xanh lá trong app này đã có nghĩa cố định (vượt hạn mức / lãi), gán chúng cho một mã là
// mời người đọc tưởng mã đó đang có chuyện.
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts'
import { Card, Money, Num, SectionTitle } from '../../components/ui'
import { share, sliceColor, SLICE_NEUTRAL } from './investFormat'
import { CHUA_RO, sectorWeights } from './sectors'

/** Bao nhiêu lát được vẽ riêng trước khi phần còn lại gộp vào "Khác". */
const SO_LAT_RIENG = 5

const VND = 'VND' as const

interface Lat {
  ten: string
  value: number
  mau: string
}

interface Props {
  /** Mã đang giữ kèm giá trị (đồng), theo thứ tự giảm dần. */
  positions: { symbol: string; value: number }[]
  /** đồng — tiền chưa mua gì (gồm cả ví đã khai). */
  cash: number
  /** mã → tên ngành (`stock_prices.industry`); thiếu = "Chưa rõ". */
  industryBySymbol: Map<string, string>
}

export function InvestWeightDonut({ positions, cash, industryBySymbol }: Props) {
  const coPhieu = positions.filter((p) => p.value > 0)
  if (coPhieu.length === 0) return null

  const theoMa = gopLat(
    coPhieu.map((p) => ({ ten: p.symbol, value: p.value })),
    (n) => `Khác (${n} mã)`,
  )
  // Tiền mặt âm nghĩa là sổ lệnh thiếu lần nạp — một lát âm không vẽ được, và khu Giá trị
  // danh mục đã nói ra chuyện đó rồi.
  if (cash > 0) theoMa.push({ ten: 'Tiền mặt', value: cash, mau: SLICE_NEUTRAL })

  const nganh = sectorWeights(
    coPhieu.map((p) => ({ symbol: p.symbol, value: p.value })),
    industryBySymbol,
  )
  const theoNganh = gopLat(
    nganh.map((s) => ({ ten: s.name, value: s.value })),
    (n) => `Khác (${n} ngành)`,
  )

  return (
    <Card as="section">
      <SectionTitle>Tỷ trọng</SectionTitle>
      <div className="mt-2 grid gap-5 lg:grid-cols-2 lg:gap-6">
        <Vong tieuDe="Theo mã · gồm tiền mặt" lats={theoMa} />
        <Vong tieuDe="Theo ngành · chỉ cổ phiếu" lats={theoNganh} />
      </div>
    </Card>
  )
}

/**
 * Cắt còn `SO_LAT_RIENG` lát rồi gộp phần đuôi thành "Khác".
 *
 * "Chưa rõ" KHÔNG lấy màu của dải: nó là một nhãn thiếu dữ liệu, không phải một hạng mục
 * ngang hàng với các hạng mục khác.
 */
function gopLat(items: { ten: string; value: number }[], nhanKhac: (n: number) => string): Lat[] {
  const lats: Lat[] = items
    .slice(0, SO_LAT_RIENG)
    .map((x, i) => ({ ...x, mau: x.ten === CHUA_RO ? SLICE_NEUTRAL : sliceColor(i) }))
  const conLai = items.slice(SO_LAT_RIENG)
  const tongConLai = conLai.reduce((s, x) => s + x.value, 0)
  if (tongConLai > 0) {
    lats.push({ ten: nhanKhac(conLai.length), value: tongConLai, mau: SLICE_NEUTRAL })
  }
  return lats
}

function Vong({ tieuDe, lats }: { tieuDe: string; lats: Lat[] }) {
  const tong = lats.reduce((s, l) => s + l.value, 0)
  if (lats.length === 0 || tong <= 0) return null

  return (
    // `min-w-0` KHÔNG phải trang trí: ô của CSS grid mặc định `min-width: auto`, nên cột
    // nở theo min-content của chú giải thay vì co lại — ở 375px với cỡ chữ 1,25× nó đòi
    // 453px trong hộp 315px và cả `main` cuộn ngang 108px (đo thật trong app). Có nó thì
    // `truncate` ở tên lát mới làm được việc của nó.
    <div className="min-w-0">
      <p className="text-2xs text-fg-muted">{tieuDe}</p>
      <div className="mt-1.5 flex flex-col items-center gap-4 sm:flex-row sm:items-center">
        {/* Bề rộng cố định cho vòng, phần chú giải chiếm nốt: để vòng không co lại thành
            một sợi chỉ khi danh sách dài. */}
        <div className="h-36 w-36 shrink-0">
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

        {/* Chú giải xếp CỘT thẳng hàng, không phải danh sách chấm: mỗi lát cần tên + phần
            trăm + số tiền, và ba cột thẳng hàng mới so được các lát với nhau bằng mắt. */}
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
    </div>
  )
}
