// Thẻ "Quỹ chạy vs tiền vào" trong tab Quỹ — ba con số trả lời ba câu khác nhau về cùng
// một quỹ (toán + lý do ở fundReturns.ts, thuần, có test):
//   TWR = quỹ tự chạy · MWRR = tiền của bạn · máy mua đều = behavior gap.
// Lời/lỗ % ở khu "Đang giữ" là %-trên-vốn cả kỳ; ở đây là %/NĂM — hai đơn vị khác nhau,
// nên thẻ này nói rõ "/năm" ở từng số.
import { useMemo } from 'react'
import { ExplainBox } from '../../components/ExplainBox'
import { Card, Num, SectionTitle } from '../../components/ui'
import type { FundTradeRow } from '../../types/database.types'
import { fundReturnRow, GAP_NOISE_PP, type FundReturnRow } from './fundReturns'
import { asFundTrade } from './fundHoldings'
import { ngay, pct } from './investFormat'

interface PositionLike {
  assocFundCd: string
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

function verdictOf(r: FundReturnRow): string {
  if (r.mwrrPct === null) return ''
  const gap = r.mwrrPct - r.twrPct
  if (Math.abs(gap) < GAP_NOISE_PP) return 'Tiền vào theo kịp quỹ — thời điểm mua không lấy mất gì.'
  return gap < 0
    ? 'Phần chênh là giá của thời điểm vào tiền — mua đều tay và đừng canh đáy là cách rẻ nhất để thu hẹp nó.'
    : 'Thời điểm vào tiền của bạn đang THẮNG chính quỹ — hiếm, và đừng coi nó là kỹ năng lặp lại được.'
}

export function FundReturnSection({ positions, trades, session, fundName }: Props) {
  const rows = useMemo(
    () =>
      positions
        .map((pos) => {
          const r = fundReturnRow({
            trades: trades.filter((t) => t.assoc_fund_cd === pos.assocFundCd).map(asFundTrade),
            latestNav: pos.nav,
            latestNavDate: session,
          })
          return r === null ? null : { pos, r }
        })
        .filter((x): x is { pos: PositionLike; r: FundReturnRow } => x !== null),
    [positions, trades, session],
  )

  // Chưa quỹ nào đủ một năm dữ liệu → chưa có gì tử tế để nói, thẻ tự ẩn.
  if (rows.length === 0) return null

  return (
    <Card as="section">
      <SectionTitle>Quỹ chạy vs tiền vào (%/năm)</SectionTitle>
      <ul className="mt-1 divide-y divide-border-subtle">
        {rows.map(({ pos, r }) => (
          <li key={pos.assocFundCd} className="py-2">
            <p className="truncate text-sm font-semibold text-fg-primary">
              {fundName(pos.assocFundCd)}
              <span className="ml-1.5 text-2xs font-normal text-fg-muted">
                từ {ngay(r.fromISO)}
              </span>
            </p>
            <dl className="mt-1 grid grid-cols-3 gap-x-3 text-sm">
              <div>
                <dt className="text-2xs text-fg-muted">Quỹ tự chạy</dt>
                <dd>
                  <Num tone={r.twrPct >= 0 ? 'in' : 'out'}>{pct(r.twrPct / 100)}</Num>
                </dd>
              </div>
              <div>
                <dt className="text-2xs text-fg-muted">Tiền của bạn</dt>
                <dd>
                  {r.mwrrPct === null ? (
                    <span className="text-fg-muted">—</span>
                  ) : (
                    <Num tone={r.mwrrPct >= 0 ? 'in' : 'out'}>{pct(r.mwrrPct / 100)}</Num>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-2xs text-fg-muted">Máy mua đều</dt>
                <dd>
                  {r.dcaPct === null ? (
                    <span className="text-fg-muted">—</span>
                  ) : (
                    <Num tone="muted">{pct(r.dcaPct / 100)}</Num>
                  )}
                </dd>
              </div>
            </dl>
            {verdictOf(r) !== '' && (
              <p className="mt-1 text-2xs text-fg-secondary">{verdictOf(r)}</p>
            )}
          </li>
        ))}
      </ul>

      <ExplainBox label="Ba con số khác nhau chỗ nào">
        <p>
          <b>Quỹ tự chạy</b> (TWR): 基準価額 đầu kỳ so cuối kỳ — quỹ tốt hay dở, không quan
          tâm bạn bỏ tiền lúc nào. <b>Tiền của bạn</b> (MWRR): chính đồng tiền của bạn sinh
          lời bao nhiêu — mua nhiều lúc giá cao thì số này tụt dưới TWR dù quỹ vẫn thế.
        </p>
        <p>
          <b>Máy mua đều</b>: cùng tổng tiền, rải đều qua đúng những ngày bạn đã mua. Nó là
          cái máy không biết sợ cũng không biết hưng phấn — so với nó là thấy cảm xúc đã
          lấy (hay tình cờ cho thêm) bao nhiêu %/năm.
        </p>
        <p>
          Bán sạch rồi mua lại cũng là một quyết định thời điểm: quãng đứng ngoài vẫn được
          tính vào “Tiền của bạn”, còn quỹ thì cứ chạy.
        </p>
      </ExplainBox>
    </Card>
  )
}
