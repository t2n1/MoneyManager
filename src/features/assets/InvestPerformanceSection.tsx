// Khu "Hiệu quả" của tab Cổ phiếu VN: năm con số, và một biểu đồ hai đường —
// danh mục so với VN-Index.
//
// Vì sao đường danh mục là lợi nhuận ĐÃ BÓC dòng tiền chứ không phải % giá trị: nạp thêm
// tiền làm giá trị nhảy lên, mà đó không phải lãi. Đặt một đường như thế cạnh VN-Index là
// so "tôi bỏ vào bao nhiêu" với "thị trường đi bao nhiêu" — hai thứ khác đơn vị. Phép bóc
// nằm ở twr.ts, và cả file đó tồn tại chỉ vì chuyện này.
//
// Vì sao trục ngày lấy từ chuỗi CHỈ SỐ chứ không tự sinh: chỉ số là lịch giao dịch thật của
// sàn — có nghỉ lễ, có phiên bù. Tự sinh thứ Hai→thứ Sáu là vẽ ra những phiên không tồn tại
// rồi phải bịa giá cho chúng.
//
// Mọi phép tính ở navSeries.ts / twr.ts / investChartData.ts; file này nối dây và vẽ.
import { useMemo, useState } from 'react'
import { Line, LineChart, ResponsiveContainer, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts'
import { ExplainBox } from '../../components/ExplainBox'
import { Card, Num, SectionTitle, SegmentedControl, signedPct, pct1 } from '../../components/ui'
import type { SegmentedItem } from '../../components/ui'
import { CHART_TEXT_3XS } from '../../lib/chartText'
import { dayMonthLabel, toISODate } from '../../lib/dates'
import { investPerformance, rangeFrom, type ChartRange } from './investChartData'
import type { InvestChartData } from './useInvestChartData'

// Cùng cặp màu với khu "vốn bỏ vào so với giá trị" ở tab Tài sản — một câu chuyện, một
// bảng màu. Xanh lá là THỨ CỦA MÌNH, xanh dương là mốc để so.
const MAU_NAV = 'var(--color-green-600)'
const MAU_INDEX = 'var(--color-sky-500)'

const KHOANG: readonly SegmentedItem<ChartRange>[] = [
  { value: '3M', label: '3T' },
  { value: '6M', label: '6T' },
  { value: '1Y', label: '1N' },
  { value: '3Y', label: '3N' },
  { value: '5Y', label: '5N' },
  { value: 'all', label: 'Tất cả' },
]

interface Props {
  data: InvestChartData
  /** Có tài khoản chứng khoán nào không — không có thì khu này không hiện. */
  hasAccounts: boolean
  /** null = sổ lệnh không đủ để ra giá trị đáng tin; hiện lý do thay vì vẽ. */
  marketValue: number | null
  /** true = tiền mặt âm (sổ lệnh thiếu lần nạp) — để nói đúng lý do. */
  cashNegative: boolean
  /** Có lệnh nào chưa — để phân biệt "chưa ghi lệnh" với "khung quá hẹp". */
  hasTrades: boolean
}

export function InvestPerformanceSection({
  data,
  hasAccounts,
  marketValue,
  cashNegative,
  hasTrades,
}: Props) {
  const todayISO = toISODate(new Date())
  const [range, setRange] = useState<ChartRange>('1Y')
  const chartFrom = rangeFrom(range, todayISO)

  // Năm con số lấy TRỌN chuỗi (sự thật của cả danh mục, không đổi khi bấm chip); biểu đồ
  // tính LẠI trên khung đang xem để CẢ HAI đường cùng xuất phát từ 0% ở mép trái. Cắt sẵn
  // `rows` của trọn chuỗi thì đường chỉ số không còn quy về mốc của khung, và khoảng cách
  // giữa hai đường — thứ duy nhất người ta đọc ở biểu đồ này — hết nghĩa.
  const loi = data.returns
  const rows = useMemo(
    () =>
      investPerformance(
        data.points.filter((p) => p.date >= chartFrom),
        data.indexRows,
      ).rows,
    [data.points, data.indexRows, chartFrom],
  )

  if (!hasAccounts) return null

  if (marketValue === null) {
    return (
      <Card as="section">
        <SectionTitle>Hiệu quả</SectionTitle>
        <p className="mt-1 text-sm text-fg-muted">
          {cashNegative
            ? 'Chưa vẽ được — sổ lệnh đang mua nhiều hơn tiền đã nạp, nên mọi con số phía sau sẽ sai.'
            : 'Chưa vẽ được — chưa có giá cho mã nào đang giữ.'}
        </p>
      </Card>
    )
  }

  const dangTai = data.isLoading
  const chiSoTrong = rows.length > 0 && rows.every((r) => r.index === null)

  return (
    <Card as="section">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-2">
        <SectionTitle>Hiệu quả</SectionTitle>
        {/* Ba lớp, mỗi lớp chữa một thứ đã ĐO ĐƯỢC trong app ở 375px:
            · `w-full` → dải chip xuống hàng riêng trên điện thoại;
            · `overflow-x-auto` → nội dung rộng cuộn TRONG hộp của nó, không bao giờ đẩy
              cả trang (`main` từng cuộn ngang 25px vì thiếu lớp này);
            · `stretch={false}` → mục co theo chữ nên "Tất cả" nằm MỘT dòng. Cho nó giãn
              đều (`stretch="lg"`) thì ở cỡ chữ 1,25× mục cuối rớt xuống hai dòng và cả
              dải cao 84px.
            Kết quả: cỡ chữ thường thấy đủ sáu mục, cỡ 1,25× thì trượt nhẹ — đúng thứ tự
            ưu tiên, vì cuộn một dải chip vẫn đọc được còn chữ gãy đôi thì không. */}
        <div className="-mx-1 w-full overflow-x-auto px-1 lg:w-auto lg:overflow-x-visible">
          <SegmentedControl
            items={KHOANG}
            value={range}
            onChange={setRange}
            label="Khoảng thời gian"
            size="sm"
            stretch={false}
          />
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-3 lg:grid-cols-5">
        <SoLoi nhan="Tổng lợi nhuận" pct={loi.total} />
        <SoLoi nhan="1 tuần" pct={loi.week} />
        <SoLoi nhan="Từ đầu năm" pct={loi.ytd} />
        <SoLoi nhan="1 năm" pct={loi.year} />
        <SoLoi nhan="Lãi kép/năm" pct={loi.cagr} />
      </dl>

      {rows.length < 2 ? (
        <p className="mt-3 text-sm text-fg-muted">
          {dangTai
            ? 'Đang tải lịch sử giá…'
            : !hasTrades
              ? 'Chưa có lệnh nào. Ghi lệnh mua đầu tiên thì biểu đồ sẽ dựng lại cả quá khứ.'
              : 'Khoảng đang chọn chưa có đủ hai phiên — chọn khoảng rộng hơn.'}
        </p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
            <ChuGiai mau={MAU_NAV} nhan="Danh mục" pct={rows.at(-1)!.nav} />
            <ChuGiai mau={MAU_INDEX} nhan="VN-Index" pct={rows.at(-1)!.index} />
            <span className="text-2xs text-fg-muted">
              từ {dayMonthLabel(rows[0].date)} · <Num>{rows.length}</Num> phiên
            </span>
          </div>

          <div className="mt-2 h-56 lg:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows} margin={{ top: 5, right: 14, bottom: 0, left: 0 }}>
                <XAxis
                  dataKey="date"
                  tickFormatter={dayMonthLabel}
                  tick={{ fontSize: CHART_TEXT_3XS, fill: 'var(--fg-muted)' }}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={28}
                />
                <YAxis
                  tick={{ fontSize: CHART_TEXT_3XS, fill: 'var(--fg-muted)' }}
                  axisLine={false}
                  tickLine={false}
                  width={44}
                  tickFormatter={(v: number) => `${Math.round(v)}%`.replace('.', ',')}
                />
                {/* Vạch 0% là mốc mà cả hai đường xuất phát — không có nó thì "đang lãi
                    hay đang lỗ" phải đọc bằng cách dò trục. */}
                <ReferenceLine y={0} stroke="var(--fg-muted)" strokeDasharray="2 3" />
                <Tooltip
                  formatter={(v, name) => [
                    v == null ? '—' : signedPct(pct1(Number(v) / 100)),
                    name === 'nav' ? 'Danh mục' : 'VN-Index',
                  ]}
                  labelFormatter={(l) => (typeof l === 'string' ? `Phiên ${dayMonthLabel(l)}` : '')}
                />
                <Line
                  type="monotone"
                  dataKey="index"
                  stroke={MAU_INDEX}
                  strokeWidth={2}
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="nav"
                  stroke={MAU_NAV}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {chiSoTrong && (
        <p className="mt-2 text-2xs text-state-warn-fg">
          Chưa có dữ liệu VN-Index cho khoảng này — app tự tải mỗi chiều sau khi sàn đóng cửa.
        </p>
      )}

      <ExplainBox label="Cách đọc">
        <p>
          Cả hai đường cùng bắt đầu từ <b>0%</b> ở phiên đầu của khoảng đang chọn, nên khoảng
          cách giữa chúng đọc thẳng ra được: đường xanh lá ở trên nghĩa là danh mục đi hơn thị
          trường chung trong đúng khoảng đó.
        </p>
        <p>
          Đường danh mục đã <b>bóc tiền nạp và rút</b> ra. Nạp thêm 50 triệu không làm đường
          này nhích lên một milimét — nó chỉ đo một đồng để trong danh mục thì thành mấy. Cổ
          tức tiền và phí lưu ký thì <b>vẫn tính</b>, vì đó là lãi lỗ thật.
        </p>
        <p>
          Quá khứ được dựng lại từ sổ lệnh cộng giá đóng cửa từng phiên, nên nó chỉ đúng bằng
          sổ lệnh. Nếu một mã từng <b>chia tách hay trả cổ phiếu thưởng</b> mà sổ lệnh chưa ghi
          (ghi bằng lệnh loại "điều chỉnh"), đoạn trước lần chia đó sẽ thấp hơn thực tế.
        </p>
      </ExplainBox>
    </Card>
  )
}

function SoLoi({ nhan, pct }: { nhan: string; pct: number | null }) {
  const tone = pct == null || pct === 0 ? 'neutral' : pct > 0 ? 'in' : 'out'
  return (
    <div>
      <dt className="text-2xs text-fg-muted">{nhan}</dt>
      <dd className="text-sm font-semibold">
        <Num tone={tone}>{signedPct(pct == null ? null : pct1(pct / 100))}</Num>
      </dd>
    </div>
  )
}

function ChuGiai({ mau, nhan, pct }: { mau: string; nhan: string; pct: number | null }) {
  return (
    <span className="flex items-center gap-1.5 text-2xs text-fg-muted">
      {/* Màu chú giải trỏ vào ĐÚNG hằng số đã tô cho đường (docs/design-system.md): đặt
          bằng class Tailwind là mời hai chỗ lệch nhau. */}
      <span className="h-0.5 w-3.5" style={{ backgroundColor: mau }} aria-hidden />
      {nhan} <Num tone={pct == null || pct === 0 ? 'neutral' : pct > 0 ? 'in' : 'out'}>
        {signedPct(pct == null ? null : pct1(pct / 100))}
      </Num>
    </span>
  )
}
