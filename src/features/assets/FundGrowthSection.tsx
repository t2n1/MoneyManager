// Thẻ "Khoảng cách mở ra ở đâu" — mỗi quỹ một biểu đồ ba đường.
//
// THẺ RIÊNG, không nhét vào thẻ "Quỹ chạy vs tiền vào", và đó là quyết định chứ không phải
// sắp xếp tuỳ ý. Thẻ kia có cổng `RETURN_MIN_SPAN_DAYS = 365` vì nó NĂM HOÁ, mà năm hoá
// một quãng ngắn là thổi số. Biểu đồ ở đây là **tích luỹ** — không năm hoá gì, nên không
// có lý gì chịu cổng đó. Nhét chung thì biểu đồ tự ẩn với mọi quỹ mới mua dưới một năm,
// tức ẩn đúng lúc câu "khoảng cách mở ra ở đâu" còn trả lời được rõ nhất.
//
// Hai thẻ cạnh nhau nói về cùng ba thứ bằng HAI ĐƠN VỊ (%/năm và % tích luỹ). Tên thẻ và
// nhãn trên từng biểu đồ đều nói ra điều đó — hôm nay tôi đã ship đúng một lỗi cùng họ
// (hai đại lượng khác nhau nằm cạnh nhau mà không ai nói chúng khác nhau).
import { useMemo } from 'react'
import { ExplainBox } from '../../components/ExplainBox'
import { Card, SectionTitle } from '../../components/ui'
import { useFundPriceHistory } from '../../hooks/queries'
import type { FundTradeRow } from '../../types/database.types'
import { FundGrowthChart } from './FundGrowthChart'

interface Props {
  /** Quỹ đang giữ — cùng tập với thẻ "Quỹ chạy vs tiền vào". */
  positions: { assocFundCd: string }[]
  trades: FundTradeRow[]
  fundName: (cd: string) => string
}

export function FundGrowthSection({ positions, trades, fundName }: Props) {
  const codes = useMemo(
    () => [...new Set(positions.map((p) => p.assocFundCd))].sort(),
    [positions],
  )
  // Xin từ ngày lệnh SỚM NHẤT trong sổ: mỗi biểu đồ tự cắt lại từ lệnh đầu của CHÍNH quỹ
  // đó, nên xin sớm hơn thì không sai, còn xin muộn hơn là mất phần đầu của quỹ mua trước.
  const from = useMemo(() => trades.map((t) => t.traded_on).sort()[0] ?? '2000-01-01', [trades])
  const { data: lichSu = [] } = useFundPriceHistory(codes, from)

  const navTheoQuy = useMemo(() => {
    const m = new Map<string, Map<string, number>>()
    for (const r of lichSu) {
      const theoNgay = m.get(r.assoc_fund_cd) ?? new Map<string, number>()
      theoNgay.set(r.nav_date, r.nav)
      m.set(r.assoc_fund_cd, theoNgay)
    }
    return m
  }, [lichSu])

  const theoQuy = useMemo(
    () =>
      codes.map((cd) => ({
        cd,
        trades: trades
          .filter((t) => t.assoc_fund_cd === cd)
          .map((t) => ({
            kind: t.kind,
            tradedOn: t.traded_on,
            units: t.units,
            // Yên THẬT đã trừ/nhận. KHÔNG suy từ units × nav — lý lẽ ở fundGrowth.ts.
            amount: t.amount ?? 0,
          })),
        navByDate: navTheoQuy.get(cd) ?? new Map<string, number>(),
      })),
    [codes, trades, navTheoQuy],
  )

  // Chưa quỹ nào có đủ hai phiên lịch sử → thẻ tự ẩn. Không hiện trạng thái rỗng: lịch sử
  // do cron ghi, người dùng không làm gì được để nó đến sớm hơn.
  const veDuoc = theoQuy.filter((q) => q.navByDate.size >= 2)
  if (veDuoc.length === 0) return null

  return (
    <Card as="section">
      <SectionTitle>Khoảng cách mở ra ở đâu</SectionTitle>
      <ul className="mt-1 divide-y divide-border-subtle">
        {veDuoc.map((q) => (
          <li key={q.cd} className="py-2">
            <p className="truncate text-sm font-semibold text-fg-primary">{fundName(q.cd)}</p>
            <FundGrowthChart trades={q.trades} navByDate={q.navByDate} />
          </li>
        ))}
      </ul>

      <ExplainBox label="Cách đọc">
        <p>
          Ba đường là <b>% tích luỹ</b> kể từ ngày bạn mua quỹ đó lần đầu — KHÁC đơn vị với
          ba con số ở thẻ trên (kia là %/năm). Nên mép phải ở đây không bằng ba con số đó, và
          đó không phải lỗi: một quãng ngắn năm hoá lên sẽ thành con số vô nghĩa.
        </p>
        <p>
          <b>Quỹ tự chạy</b> là 基準価額, tức mỗi yên để trong quỹ từ đầu thì thành mấy.
          <b> Tiền của bạn</b> là mỗi yên bạn thật sự đã bỏ vào thành mấy — đã cộng cả tiền
          đã bán thu về, nên bán bớt không làm tỷ lệ phụt lên vô nghĩa.
        </p>
        <p>
          Hai đường tách nhau ở đâu thì <b>ở đó</b> thời điểm vào (hay ra) tiền đã lấy đi
          hoặc cho thêm. Đường <b>máy mua đều</b> là mốc: cùng tổng tiền, rải đều qua đúng
          những ngày bạn đã mua, và không bao giờ bán.
        </p>
      </ExplainBox>
    </Card>
  )
}
