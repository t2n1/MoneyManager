// Khu "Rủi ro" — cơ cấu rủi ro, hệ số beta, chỉ số Sharpe, và bảng theo từng mã.
//
// Ba thang, và chúng KHÔNG dùng chung một bảng màu, vì chúng không cùng loại câu hỏi:
//   · cơ cấu rủi ro — trục "thấp → cao" trùng đúng trục "tốt → cần chú ý → rủi ro" của
//     app, nên dùng `STATUS_FILL`. Chữ trên nhãn đã nói "Rủi ro cao" nên màu chỉ nhắc lại
//     điều nhãn đã nói, không thêm một phán xét mới nào.
//   · beta — cao KHÔNG phải xấu, đó là một LỰA CHỌN (nhạy hơn thị trường cả hai chiều).
//     Tô đỏ vùng beta cao là app tự ý phán rằng người dùng chọn sai. Nên track TRUNG TÍNH,
//     chỉ có mốc "thị trường = 1" để so.
//   · Sharpe — cao thì rõ ràng tốt hơn (nhiều lợi nhuận hơn trên mỗi đơn vị rủi ro), nên
//     ba vùng `STATUS_FILL` ở đây là phán xét đúng chỗ.
//
// Mọi phép tính ở riskMetrics.ts. File này chỉ vẽ.
import { ExplainBox } from '../../components/ExplainBox'
import { Card, Num, SectionTitle, StatusChip } from '../../components/ui'
import { STATUS_FILL } from '../../components/ui/statusColors'
import type { StatusTone } from '../../components/ui/statusColors'
import { heSo, share } from './investFormat'
import {
  portfolioRisk,
  RISK_FREE_ANNUAL_PCT,
  type RiskClass,
  type SymbolRisk,
} from './riskMetrics'
import type { InvestChartData } from './useInvestChartData'

/** Nhãn + tông của ba mức rủi ro. Một chỗ, để bảng và dải không lệch nhau. */
const MUC: Record<RiskClass, { nhan: string; tone: StatusTone }> = {
  low: { nhan: 'Thấp', tone: 'good' },
  mid: { nhan: 'Trung bình', tone: 'warn' },
  high: { nhan: 'Cao', tone: 'bad' },
}
const THU_TU: RiskClass[] = ['low', 'mid', 'high']

// Beta gần như luôn nằm trong 0..2 với cổ phiếu Việt Nam; beta âm là hiếm nhưng có thật
// (mã đi ngược thị trường), nên thang chừa một khoảng âm nhỏ.
const BETA_MIN = -0.5
const BETA_MAX = 2

// Sharpe ÂM là chuyện thường: danh mục lãi ít hơn lãi suất không rủi ro là ra số âm ngay.
// Thang phải chừa phần âm, không thì con trỏ kẹp về mép 0 và Sharpe −4 trông như Sharpe 0
// — đúng lỗi đã thấy khi mở app.
const SHARPE_MIN = -1
const SHARPE_MAX = 2

/** Ba vùng của thang Sharpe: dưới 0,5 · 0,5–1 · từ 1 trở lên. */
const VUNG_SHARPE: { tone: StatusTone; rong: number }[] = [
  { tone: 'bad', rong: ((0.5 - SHARPE_MIN) / (SHARPE_MAX - SHARPE_MIN)) * 100 },
  { tone: 'warn', rong: (0.5 / (SHARPE_MAX - SHARPE_MIN)) * 100 },
  { tone: 'good', rong: ((SHARPE_MAX - 1) / (SHARPE_MAX - SHARPE_MIN)) * 100 },
]

interface Props {
  data: InvestChartData
  /** Mã đang giữ kèm tỷ trọng trong phần cổ phiếu (0..1). */
  positions: { symbol: string; weight: number }[]
}

export function InvestRiskSection({ data, positions }: Props) {
  const r = portfolioRisk({
    positions,
    prices: data.priceMap,
    index: data.indexByDate,
    sessions: data.sessions,
    annualReturnPct: data.returns.cagr,
    portfolioReturns: data.dailyReturns,
  })

  if (positions.length === 0) return null

  const chuaCoGi = r.beta === null && r.volPct === null
  if (chuaCoGi) {
    return (
      <Card as="section">
        <SectionTitle>Rủi ro</SectionTitle>
        <p className="mt-1 text-sm text-fg-muted">
          {data.isLoading
            ? 'Đang tải lịch sử giá…'
            : 'Chưa đủ lịch sử giá để đo — app tự tải mỗi chiều sau khi sàn đóng cửa.'}
        </p>
      </Card>
    )
  }

  return (
    <Card as="section">
      <SectionTitle>Rủi ro</SectionTitle>

      {/* Cơ cấu rủi ro: một dải 100% thay vì một donut nữa. Trang đã có hai vòng tròn, và
          ba mức xếp theo MỘT TRỤC (thấp → cao) thì một dải nói đúng cái trục đó; donut lại
          bỏ mất thứ tự. */}
      <div className="mt-3">
        <p className="text-2xs text-fg-muted">Cơ cấu rủi ro theo biến động</p>
        <div className="mt-1.5 flex h-2 overflow-hidden rounded-full bg-surface-sunken">
          {THU_TU.map((k) =>
            r.breakdown[k] > 0 ? (
              <span
                key={k}
                className={STATUS_FILL[MUC[k].tone]}
                style={{ width: `${r.breakdown[k] * 100}%` }}
              />
            ) : null,
          )}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
          {THU_TU.map((k) => (
            <span key={k} className="flex items-center gap-1.5 text-2xs text-fg-muted">
              <span className={`size-2.5 shrink-0 rounded-full ${STATUS_FILL[MUC[k].tone]}`} aria-hidden />
              {MUC[k].nhan} <Num>{share(r.breakdown[k])}</Num>
            </span>
          ))}
        </div>
      </div>

      <Thang
        nhan="Hệ số beta"
        giaTri={r.beta}
        min={BETA_MIN}
        max={BETA_MAX}
        moc={1}
        mocNhan="thị trường 1,00"
      />
      <Thang
        nhan="Chỉ số Sharpe"
        giaTri={r.sharpe}
        min={SHARPE_MIN}
        max={SHARPE_MAX}
        moc={1}
        mocNhan="khá 1,00"
        vung={VUNG_SHARPE}
      />

      {/* Bảng theo mã: dải và hai thang nói về CẢ danh mục, còn câu "mã nào đang kéo beta
          lên" thì chỉ bảng trả lời được. */}
      <div className="mt-3 overflow-x-auto border-t border-border-subtle pt-2">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-2xs text-fg-muted">
              <th scope="col" className="py-1 text-left font-normal">
                Mã
              </th>
              <th scope="col" className="py-1 pl-3 text-right font-normal">
                Biến động/năm
              </th>
              <th scope="col" className="py-1 pl-3 text-right font-normal">
                Mức
              </th>
              <th scope="col" className="py-1 pl-3 text-right font-normal">
                Beta
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {r.bySymbol.map((s) => (
              <Dong key={s.symbol} s={s} />
            ))}
          </tbody>
        </table>
      </div>

      {r.partial && (
        <p className="mt-2 text-2xs text-state-warn-fg">
          Có mã chưa đủ lịch sử giá nên các con số trên chỉ tính trên phần còn lại.
        </p>
      )}

      <ExplainBox label="Cách đọc">
        <p>
          <b>Biến động</b> là mức dao động thường ngày quy ra một năm. Cao không có nghĩa là
          sai — nó nói rằng đường giá của mã đó gập ghềnh hơn, nên khoản lãi lỗ tạm thời sẽ
          lớn hơn theo cả hai chiều. Ngưỡng chia mức: từ 20% là cao, trên 10% là trung bình.
        </p>
        <p>
          <b>Beta</b> đo độ nhạy với VN-Index. Beta 1,4 nghĩa là thị trường lên 10% thì phần
          cổ phiếu của bạn kỳ vọng lên khoảng 14% — và xuống cũng vậy. Đây là một lựa chọn,
          không phải một lỗi: beta cao là chấp nhận sóng lớn hơn để đổi lấy kỳ vọng cao hơn.
        </p>
        <p>
          <b>Sharpe</b> là lợi nhuận thu được trên mỗi đơn vị rủi ro đã chịu, tính bằng
          (lãi kép/năm − lãi suất không rủi ro) chia biến động. App lấy lãi suất không rủi ro
          là <Num>{RISK_FREE_ANNUAL_PCT}</Num>%/năm — quanh mức tiết kiệm 12 tháng. Đó là một
          quy ước, không phải sự thật; đổi nó thì Sharpe đổi theo.
        </p>
        <p>
          Cả ba đo trên lịch sử giá đã có, nên danh mục càng mới thì con số càng ít nghĩa.
          Chúng nói về quá khứ của những mã bạn <b>đang giữ</b>, không dự báo tương lai.
        </p>
      </ExplainBox>
    </Card>
  )
}

function Dong({ s }: { s: SymbolRisk }) {
  return (
    <tr>
      <td className="py-1.5 font-semibold text-fg-primary">{s.symbol}</td>
      <td className="py-1.5 pl-3 text-right">
        {s.volPct === null ? (
          <span className="text-fg-muted">—</span>
        ) : (
          <Num>{share(s.volPct / 100)}</Num>
        )}
      </td>
      <td className="py-1.5 pl-3 text-right">
        {s.cls === null ? (
          <span className="text-2xs text-fg-muted">chưa đo được</span>
        ) : (
          <StatusChip tone={MUC[s.cls].tone}>{MUC[s.cls].nhan}</StatusChip>
        )}
      </td>
      <td className="py-1.5 pl-3 text-right">
        <Num className={s.beta === null ? 'text-fg-muted' : ''}>{heSo(s.beta)}</Num>
      </td>
    </tr>
  )
}

/**
 * Một thang ngang có mốc so sánh, theo đúng khuôn dải điểm của trang Sức khỏe
 * (features/health/HealthBlocks.tsx) — cùng chiều cao, cùng kiểu con trỏ.
 *
 * `vung` bỏ trống = track trung tính. Chỉ truyền vùng màu khi trục ĐÚNG LÀ trục tốt/xấu.
 */
function Thang({
  nhan,
  giaTri,
  min,
  max,
  moc,
  mocNhan,
  vung,
}: {
  nhan: string
  giaTri: number | null
  min: number
  max: number
  moc: number
  mocNhan: string
  vung?: { tone: StatusTone; rong: number }[]
}) {
  const toPct = (v: number) => ((v - min) / (max - min)) * 100
  const tho = giaTri === null ? null : toPct(giaTri)
  const viTri = tho === null ? null : Math.min(100, Math.max(0, tho))
  // Giá trị vượt hai đầu thang thì con trỏ kẹp ở mép, nên phải NÓI RA là đang kẹp —
  // không thì "kẹp ở mép trái" trông y như "đúng bằng mép trái".
  const ngoaiThang = tho !== null && (tho < 0 || tho > 100)
  return (
    <div className="mt-3">
      {/* `div` chứ không `p`: đây là HÀNG NHÃN của thang (tên bên trái, số bên phải),
          không phải một đoạn văn — và một `p` bọc layout flex nhiều span cũng không đúng
          nghĩa thẻ. */}
      <div className="flex items-baseline justify-between gap-2 text-2xs text-fg-muted">
        <span>{nhan}</span>
        <span className="text-sm font-semibold text-fg-primary">
          {giaTri === null ? (
            <span className="text-2xs font-normal text-fg-muted">chưa đo được</span>
          ) : (
            <Num>{heSo(giaTri)}</Num>
          )}
        </span>
      </div>
      <div className="relative mt-1.5 h-2">
        <div className="absolute inset-0 flex overflow-hidden rounded-full bg-surface-sunken">
          {vung?.map((v) => (
            <span key={v.tone} className={STATUS_FILL[v.tone]} style={{ width: `${v.rong}%` }} />
          ))}
        </div>
        {/* Mốc so sánh vẽ TRƯỚC con trỏ để con trỏ nằm trên khi hai cái trùng chỗ. */}
        <span
          aria-hidden
          className="absolute top-0 h-2 w-px bg-fg-muted"
          style={{ left: `${(moc / max) * 100}%` }}
        />
        {viTri !== null && (
          <span
            aria-hidden
            className="absolute -top-0.5 h-3 w-0.5 rounded-full bg-fg-primary ring-1 ring-surface"
            style={{ left: `calc(${viTri}% - 1px)` }}
          />
        )}
      </div>
      <div aria-hidden className="mt-1 flex justify-between text-2xs text-fg-muted">
        <span>{heSo(min, 1)}</span>
        <span>{ngoaiThang ? 'ngoài thang' : mocNhan}</span>
        <span>{heSo(max, 1)}</span>
      </div>
    </div>
  )
}
