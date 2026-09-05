// Thẻ "Phí quỹ (信託報酬)" trong tab Quỹ — phí bị trừ âm thầm vào 基準価額 mỗi ngày,
// không sao kê nào in ra, nên đây là chỗ duy nhất người giữ quỹ thấy được "đã trả bao
// nhiêu". Khai %/năm MỘT LẦN cho mỗi quỹ (in trên 目論見書 / trang Rakuten của quỹ);
// toán ở fundFees.ts (thuần, có test).
import { useMemo } from 'react'
import { ExplainBox } from '../../components/ExplainBox'
import { Card, Money, Num, SectionTitle } from '../../components/ui'
import { useFunds, useUpdateFundExpenseRatio } from '../../hooks/queries'
import type { FundTradeRow } from '../../types/database.types'
import { feeShareAfterYears, fundFeePaid, parsePercentToPpm } from './fundFees'
import { asFundTrade } from './fundHoldings'
import { ngay } from './investFormat'

const JPY = 'JPY' as const
/** Chân trời của câu dự phóng — cùng một con số với bài học đã đối chiếu (20 năm). */
const PROJECTION_YEARS = 20

interface PositionLike {
  assocFundCd: string
  /** yên — giá trị hiện tại của dòng quỹ. */
  value: number
  /** ¥/1万口; null = chưa có giá. */
  nav: number | null
}

interface Props {
  positions: PositionLike[]
  trades: FundTradeRow[]
  /** Ngày phiên 基準価額 đang dùng (useFundInvestData.session). */
  session: string | null
  fundName: (cd: string) => string
}

const ppmToPercentText = (ppm: number) =>
  (ppm / 10_000).toLocaleString('vi-VN', { maximumFractionDigits: 4 })

export function FundFeeSection({ positions, trades, session, fundName }: Props) {
  const { data: funds = [] } = useFunds()
  const update = useUpdateFundExpenseRatio()

  const rows = useMemo(() => {
    const erByFund = new Map(funds.map((f) => [f.assoc_fund_cd, f.expense_ratio_ppm]))
    return positions.map((pos) => {
      const erPpm = erByFund.get(pos.assocFundCd) ?? null
      const paid =
        erPpm !== null && erPpm > 0
          ? fundFeePaid({
              trades: trades
                .filter((t) => t.assoc_fund_cd === pos.assocFundCd)
                .map(asFundTrade),
              erPpm,
              latestNav: pos.nav,
              latestNavDate: session,
            })
          : null
      return { pos, erPpm, paid }
    })
  }, [positions, funds, trades, session])

  if (positions.length === 0) return null

  const daKhai = rows.filter((r) => r.erPpm !== null && r.erPpm > 0)
  const totalPaid = daKhai.reduce((s, r) => s + (r.paid?.feeMinor ?? 0), 0)
  const from = daKhai.map((r) => r.paid?.fromISO).filter(Boolean).sort()[0] ?? null
  // ER bình quân theo GIÁ TRỊ đang giữ — cho câu dự phóng chung.
  const valueKhai = daKhai.reduce((s, r) => s + r.pos.value, 0)
  const erAvgPpm =
    valueKhai > 0
      ? daKhai.reduce((s, r) => s + r.pos.value * (r.erPpm as number), 0) / valueKhai
      : 0
  const share = feeShareAfterYears(erAvgPpm, PROJECTION_YEARS)

  return (
    <Card as="section">
      <SectionTitle>Phí quỹ (信託報酬)</SectionTitle>
      <ul className="mt-1 divide-y divide-border-subtle">
        {rows.map(({ pos, erPpm, paid }) => (
          <li key={pos.assocFundCd} className="flex items-baseline gap-2 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-fg-primary">{fundName(pos.assocFundCd)}</p>
              {/* Dòng DỮ LIỆU (đã trả bao nhiêu, từ bao giờ) — cùng tông fg-secondary với
                  dòng phụ "vốn · nay" của khu Đang giữ, không phải chữ dạy. */}
              <p className="text-2xs text-fg-secondary">
                {paid ? (
                  <>
                    đã trả ước tính từ {ngay(paid.fromISO)} —{' '}
                    <Money amount={paid.feeMinor} currency={JPY} tone="out" className="text-2xs" />
                  </>
                ) : erPpm !== null && erPpm > 0 ? (
                  'chưa đủ mốc giá để ước phí đã trả'
                ) : (
                  'chưa khai — xem 信託報酬 trong 目論見書 của quỹ'
                )}
              </p>
            </div>
            <label className="flex shrink-0 items-baseline gap-1 text-2xs text-fg-muted">
              <input
                key={`${pos.assocFundCd}:${erPpm ?? ''}`}
                type="text"
                inputMode="decimal"
                defaultValue={erPpm !== null && erPpm > 0 ? ppmToPercentText(erPpm) : ''}
                placeholder="0,077"
                aria-label={`信託報酬 %/năm của ${fundName(pos.assocFundCd)}`}
                className="w-20 rounded-md border border-border-strong bg-surface px-2 py-1 text-right font-mono text-sm tabular-nums"
                onBlur={(e) => {
                  const ppm = parsePercentToPpm(e.target.value)
                  if (ppm === undefined) {
                    // Không parse được → trả ô về giá trị đã lưu, không ghi gì.
                    e.target.value = erPpm !== null && erPpm > 0 ? ppmToPercentText(erPpm) : ''
                    return
                  }
                  if (ppm !== erPpm) update.mutate({ assocFundCd: pos.assocFundCd, ppm })
                }}
              />
              <span>%/năm</span>
            </label>
          </li>
        ))}
      </ul>

      {totalPaid > 0 && (
        <div className="mt-1 flex items-baseline justify-between gap-2 border-t border-border-panel pt-2">
          <span className="text-sm font-medium text-fg-secondary">
            Tổng phí đã trả{from !== null && <span className="text-fg-muted"> · từ {ngay(from)}</span>}
          </span>
          <Money amount={totalPaid} currency={JPY} tone="out" className="text-sm font-semibold" />
        </div>
      )}
      {share > 0 && (
        <p className="mt-1 text-2xs text-fg-secondary">
          Giữ thêm <Num tone="muted">{PROJECTION_YEARS} năm</Num> với mức phí này, phí sẽ lấy
          khoảng <Num tone="muted">{(share * 100).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%</Num>{' '}
          số cuối cùng — vì phần bị trừ mỗi năm mất luôn lãi kép của nó.
        </p>
      )}

      <ExplainBox label="Cách tính">
        <p>
          Phí đã trả là <b>ước tính</b>: giá trị nắm giữ giữa các mốc (mỗi lệnh mua/bán và
          giá mới nhất) được nội suy, nhân với %/năm bạn khai. Quỹ mua định kỳ hằng tháng
          thì mốc dày nên sai số nhỏ.
        </p>
        <p>
          Phí này Rakuten trừ thẳng vào 基準価額 mỗi ngày — không có dòng nào trên sao kê,
          nên đừng tìm nó trong lịch sử giao dịch.
        </p>
      </ExplainBox>
    </Card>
  )
}
