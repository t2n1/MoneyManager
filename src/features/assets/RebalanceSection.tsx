// Thẻ "Tỷ trọng mục tiêu" trong tab Hiện tại của Tài sản — khai mục tiêu MỘT LẦN lúc
// bình tĩnh, từ đó máy đo độ lệch thay cảm xúc (toán ở rebalance.ts, thuần, có test).
// Gợi ý duy nhất là GÓP TIỀN MỚI vào nhóm hụt — không bao giờ gợi bán (NISA bán là mất
// suất miễn thuế vĩnh viễn).
import { useMemo } from 'react'
import { ExplainBox } from '../../components/ExplainBox'
import { Card, Money, Num, SectionTitle } from '../../components/ui'
import { useAssetGroupSettings, useUpsertAssetGroupSetting } from '../../hooks/queries'
import type { AssetGroup } from './aggregate'
import type { MoneyView } from './moneyView'
import { parsePctToBps, REBAL_DRIFT_ALERT_PP, rebalancePlan } from './rebalance'

interface Props {
  /** purposeGroups của useAssetsData — đã lọc nhóm ẩn. */
  groups: AssetGroup[]
  view: MoneyView
}

const bpsToText = (bps: number) =>
  (bps / 100).toLocaleString('vi-VN', { maximumFractionDigits: 2 })

const pp1 = (v: number) =>
  `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1).replace('.', ',')}`

export function RebalanceSection({ groups, view }: Props) {
  const { data: settings = [] } = useAssetGroupSettings()
  const upsert = useUpsertAssetGroupSetting()

  const targets = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of settings) if (s.target_bps !== null && s.target_bps > 0) m.set(s.name, s.target_bps)
    return m
  }, [settings])

  const inTotals = groups.filter((g) => g.includeInTotals)
  const plan = useMemo(
    () =>
      rebalancePlan(
        inTotals.map((g) => ({ name: g.name, total: g.total, includeInTotals: true })),
        targets,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [groups, targets],
  )

  if (inTotals.length < 2) return null
  const rowOf = (name: string) => plan?.rows.find((r) => r.name === name)

  return (
    <Card elevation="panel" as="section">
      <SectionTitle>Tỷ trọng mục tiêu</SectionTitle>
      <ul className="mt-1 divide-y divide-border-subtle">
        {inTotals.map((g) => {
          const bps = targets.get(g.name) ?? null
          const row = rowOf(g.name)
          return (
            <li key={g.name} className="flex items-baseline gap-2 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-fg-primary">{g.name}</p>
                <p className="text-2xs text-fg-secondary">
                  đang <Num tone="muted">{(g.share * 100).toFixed(1).replace('.', ',')}%</Num>
                  {row !== undefined && (
                    <>
                      {' '}
                      · lệch{' '}
                      <Num tone={Math.abs(row.driftPp) >= REBAL_DRIFT_ALERT_PP ? 'out' : 'muted'}>
                        {pp1(row.driftPp)}đ%
                      </Num>
                    </>
                  )}
                </p>
              </div>
              <label className="flex shrink-0 items-baseline gap-1 text-2xs text-fg-muted">
                <input
                  key={`${g.name}:${bps ?? ''}`}
                  type="text"
                  inputMode="decimal"
                  defaultValue={bps !== null ? bpsToText(bps) : ''}
                  placeholder="—"
                  aria-label={`Tỷ trọng mục tiêu của nhóm ${g.name} (%)`}
                  className="w-16 rounded-md border border-border-strong bg-surface px-2 py-1 text-right font-mono text-sm tabular-nums"
                  onBlur={(e) => {
                    const next = parsePctToBps(e.target.value)
                    if (next === undefined) {
                      e.target.value = bps !== null ? bpsToText(bps) : ''
                      return
                    }
                    if (next !== bps)
                      upsert.mutate({ name: g.name, patch: { target_bps: next } })
                  }}
                />
                <span>%</span>
              </label>
            </li>
          )
        })}
      </ul>

      {plan !== null && plan.declaredPct > 100.05 && (
        <p className="mt-1 text-2xs text-state-warn-fg">
          Tổng mục tiêu đã khai là{' '}
          <Num tone="muted">{Math.round(plan.declaredPct)}%</Num> — quá 100%, các con số
          lệch bên trên sẽ không thể cùng về 0.
        </p>
      )}

      {plan !== null &&
        (plan.alert && plan.worst !== null ? (
          <p className="mt-2 border-t border-border-panel pt-2 text-sm font-medium text-fg-accent">
            Lệch nhất: «{plan.worst.name}» đang{' '}
            <Num tone="muted">{plan.worst.actualPct.toFixed(1).replace('.', ',')}%</Num> so
            mục tiêu <Num tone="muted">{plan.worst.targetPct.toFixed(0)}%</Num>
            {plan.worst.addToReachMinor !== null && (
              <>
                {' '}
                — góp thêm{' '}
                <Money
                  {...view.view(plan.worst.addToReachMinor)}
                  className="text-sm"
                />{' '}
                bằng tiền mới là về mục tiêu, không cần bán gì
              </>
            )}
            .
          </p>
        ) : (
          <p className="mt-2 border-t border-border-panel pt-2 text-sm text-fg-secondary">
            Cơ cấu đang trong ngưỡng ±<Num tone="muted">{REBAL_DRIFT_ALERT_PP}đ%</Num> quanh
            mục tiêu — chưa cần làm gì.
          </p>
        ))}

      <ExplainBox label="Vì sao chỉ gợi ý góp thêm, không gợi ý bán">
        <p>
          Mục tiêu khai một lần lúc bình tĩnh chính là để những lúc thị trường nhảy múa
          có một con số đứng yên mà bám. Lệch quá {REBAL_DRIFT_ALERT_PP} điểm % app sẽ
          nhắc ở đây và ở Bản tin.
        </p>
        <p>
          Cân lại bằng TIỀN GÓP MỚI: bán trong NISA là mất suất miễn thuế của phần đó
          vĩnh viễn, còn bán ngoài NISA thì nộp ~20% thuế lãi — cả hai đều đắt hơn việc
          hướng vài tháng tiền góp về nhóm đang hụt.
        </p>
      </ExplainBox>
    </Card>
  )
}
