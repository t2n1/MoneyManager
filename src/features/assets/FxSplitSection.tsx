// Khu "Lãi do giá hay do tỷ giá" — cho tài khoản đầu tư giữ tiền KHÁC base.
//
// Một tài khoản cổ phiếu VN có thể giảm −2,2% tính bằng ₫ mà đồ thị ¥ chỉ hiện −0,4%
// vì ₫ mạnh lên +1,8% (ca thật 06→20/08/2026). Không tách hai phần này thì "danh mục
// ổn" có thể chỉ là ảo giác tỷ giá. Toán ở fxDecompose.ts (thuần, có test); đây là màn
// hình ĐẦU TIÊN đọc bảng fx_history mà app đã âm thầm tích từ cuối 07/2026.
import { useMemo } from 'react'
import { ExplainBox } from '../../components/ExplainBox'
import { Card, Num, SectionTitle, pct1, signedPct } from '../../components/ui'
import { useAccounts, useAccountValuations, useFxHistory, useRates } from '../../hooks/queries'
import { dayMonthLabel, toISODate } from '../../lib/dates'
import type { CurrencyCode } from '../../lib/money'
import type { AssetAccount } from './aggregate'
import { decomposeFxReturn, FX_DECOMPOSE_WINDOW_DAYS, type FxDecomposition } from './fxDecompose'

interface Props {
  /** Tài khoản đầu tư đang tính vào tổng — cùng tập với hai khu đầu tư phía trên. */
  accounts: AssetAccount[]
  base: CurrencyCode
}

/** Lùi lại đủ xa để tìm được mốc "một tháng trước" kể cả khi định giá thưa. */
const LOOKBACK_DAYS = FX_DECOMPOSE_WINDOW_DAYS + 15

function SplitRow({ label, value, tone }: { label: string; value: number; tone?: 'plain' }) {
  const cls =
    tone === 'plain' ? 'text-fg-secondary' : value >= 0 ? 'text-money-in' : 'text-money-out'
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-sm text-fg-secondary">{label}</span>
      <Num className={`text-sm font-medium ${cls}`}>{signedPct(pct1(value))}</Num>
    </div>
  )
}

export function FxSplitSection({ accounts, base }: Props) {
  const todayISO = toISODate(new Date())
  const fromISO = useMemo(() => {
    const d = new Date(`${todayISO}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() - LOOKBACK_DAYS)
    return d.toISOString().slice(0, 10)
  }, [todayISO])

  const { data: accountRows = [] } = useAccounts()
  const { data: valuations = [] } = useAccountValuations()
  const { rates } = useRates()

  // Chỉ đáng gọi API khi CÓ tài khoản khác tiền base.
  const foreign = useMemo(() => {
    const ids = new Set(accounts.map((a) => a.id))
    return accountRows.filter((a) => ids.has(a.id) && a.currency !== base)
  }, [accounts, accountRows, base])
  const { data: fxDays = [] } = useFxHistory(fromISO, todayISO, foreign.length > 0)

  const splits = useMemo(() => {
    const out: { id: string; name: string; currency: CurrencyCode; d: FxDecomposition }[] = []
    for (const a of foreign) {
      const points = valuations
        .filter((v) => v.account_id === a.id)
        .map((v) => ({ on: v.valued_on, valueMinor: v.market_value }))
      const d = decomposeFxReturn({ points, currency: a.currency, base, fxDays })
      if (d !== null) out.push({ id: a.id, name: a.name, currency: a.currency, d })
    }
    return out
  }, [foreign, valuations, base, fxDays])

  // Không có gì tách được (toàn tài khoản cùng tiền, hay lịch sử tỷ giá chưa đủ) thì im
  // lặng — thẻ trống không giúp ai. `rates` chỉ để chắc trang đã sẵn tiền tệ.
  if (splits.length === 0 || rates === undefined) return null

  return (
    <Card as="section" elevation="panel" padding="lg">
      <SectionTitle>Lãi do giá hay do tỷ giá</SectionTitle>
      <div className="mt-2 flex flex-col gap-3">
        {splits.map((s) => (
          <div key={s.id} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 truncate text-sm font-medium text-fg-primary">
                {s.name}
              </span>
              <span className="shrink-0 text-2xs text-fg-muted">
                {dayMonthLabel(s.d.from)} → {dayMonthLabel(s.d.to)} ·{' '}
                <Num tone="muted">{s.d.spanDays} ngày</Num>
              </span>
            </div>
            <SplitRow label={`Giá tài sản (${s.currency})`} value={s.d.rAsset} />
            <SplitRow label={`Tỷ giá ${s.currency}/${base}`} value={s.d.rFx} />
            <div className="border-t border-border-subtle pt-1">
              <SplitRow label={`Bạn thấy trên đồ thị (${base})`} value={s.d.rBase} tone="plain" />
            </div>
          </div>
        ))}
      </div>

      <ExplainBox label="Cách đọc">
        <p>
          <b>Giá tài sản</b> là chuyện của thị trường; <b>tỷ giá</b> là chuyện của đồng
          tiền. Con số bạn thấy hằng ngày là TÍCH của cả hai: (1 + giá) × (1 + tỷ giá) − 1
          — nên có kỳ tài sản giảm mà đồ thị gần như đứng yên, chỉ vì tỷ giá che mất.
        </p>
        <p>
          Tỷ giá lấy từ lịch sử app tự ghi mỗi phiên (từ cuối 07/2026). Kỳ so là hai mốc
          định giá gần nhau khoảng một tháng; thiếu tỷ giá quanh mốc thì khu này tự ẩn
          thay vì đoán.
        </p>
      </ExplainBox>
    </Card>
  )
}
