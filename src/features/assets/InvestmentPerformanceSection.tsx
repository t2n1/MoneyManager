// Khu "Hiệu quả đầu tư" trên trang Tài sản: tách rõ TIỀN MÌNH BỎ VÀO và PHẦN
// THỊ TRƯỜNG CHO THÊM, rồi quy ra %/năm ở ba mức: danh nghĩa → sau thuế → sau
// lạm phát. Ba mức vì con số danh nghĩa hay làm người ta lạc quan quá mức.
import { useMemo } from 'react'
import { Guide } from '../../components/Guide'
import { Link } from 'react-router-dom'
import { ExplainBox } from '../../components/ExplainBox'
import { Card } from '../../components/ui'
import { useAccounts, useProfile, useRangeTransactions, useRates } from '../../hooks/queries'
import { toISODate } from '../../lib/dates'
import type { CurrencyCode } from '../../lib/money'
import { convertToBase } from '../../lib/rates'
import type { AssetAccount } from './aggregate'
import { investTxRange, LOOKBACK_YEARS } from './investHistory'
import type { MoneyView } from './moneyView'
import { investmentPerformance, type CashFlow } from './xirr'

const signPct = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(1).replace('.', ',')}%`

interface Props {
  /** Tài khoản đầu tư đang được tính vào tổng tài sản. */
  accounts: AssetAccount[]
  base: CurrencyCode
  /** Bộ "xem thử bằng tiền khác" — chỉ áp lúc HIỂN THỊ; XIRR vẫn tính theo base. */
  view: MoneyView
}

export function InvestmentPerformanceSection({ accounts, base, view }: Props) {
  const { data: profile } = useProfile()
  const { data: accountRows = [] } = useAccounts()
  const { rates } = useRates()
  const r = rates ?? {}
  const todayISO = toISODate(new Date())

  const ids = useMemo(() => new Set(accounts.map((a) => a.id)), [accounts])
  const currencyById = useMemo(
    () => new Map(accounts.map((a) => [a.id, a.currency])),
    [accounts],
  )
  const { data: txs = [] } = useRangeTransactions(
    investTxRange(todayISO),
    ids.size > 0 && !!profile,
  )

  const currentValue = accounts.reduce((s, a) => s + (a.baseValue ?? 0), 0)
  // Vốn gốc theo sổ (nạp − rút, gồm cả số dư mở tài khoản) — cùng định nghĩa với
  // trang chi tiết tài khoản, nên hai nơi luôn khớp nhau.
  const costBasis = accounts.reduce(
    (s, a) => s + (convertToBase(a.balance, a.currency, base, r) ?? 0),
    0,
  )

  // Dòng tiền NGOÀI vào danh mục = chuyển khoản giữa ví của mình và tài khoản đầu tư.
  // Cổ tức ghi thẳng vào tài khoản đầu tư KHÔNG tính là dòng tiền vào — nó là
  // phần lời do danh mục tự sinh ra, đã nằm trong giá trị hiện tại.
  const { flows, hasMissingRate } = useMemo(() => {
    const out: CashFlow[] = []
    let missing = false
    // Số dư mở tài khoản (tiền đã bỏ vào TRƯỚC khi dùng app) tính là một lần nạp
    // vào ngày tạo tài khoản; thiếu nó thì XIRR coi như tiền tự sinh ra từ không khí.
    for (const a of accountRows) {
      if (!ids.has(a.id) || a.initial_balance <= 0) continue
      const v = convertToBase(a.initial_balance, a.currency, base, r)
      if (v === null) missing = true
      else out.push({ date: a.created_at.slice(0, 10), amount: -v })
    }
    for (const t of txs) {
      if (t.type !== 'transfer') continue
      const into = t.to_account_id && ids.has(t.to_account_id)
      const outOf = ids.has(t.account_id)
      // Chuyển giữa hai tài khoản đầu tư = di chuyển nội bộ, không phải tiền mới
      if (into && outOf) continue
      if (into) {
        const cur = currencyById.get(t.to_account_id!)
        const v = convertToBase(t.to_amount ?? t.amount, cur ?? base, base, r)
        if (v === null) missing = true
        else out.push({ date: t.occurred_on, amount: -v })
      } else if (outOf) {
        const cur = currencyById.get(t.account_id)
        const v = convertToBase(t.amount, cur ?? base, base, r)
        if (v === null) missing = true
        else out.push({ date: t.occurred_on, amount: v })
      }
    }
    return { flows: out, hasMissingRate: missing }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txs, accountRows, ids, currencyById, base, rates])

  const perf = useMemo(
    () =>
      investmentPerformance({
        flows,
        currentValue,
        todayISO,
        capitalGainsTaxBps: profile?.capital_gains_tax_bps ?? 2032,
        annualInflationBps: profile?.annual_inflation_bps ?? null,
      }),
    [flows, currentValue, todayISO, profile],
  )

  if (accounts.length === 0) return null

  const money = (v: number) => view.fmt(Math.round(v))
  // Thanh tỷ trọng: vốn gốc theo SỔ vs phần lời — khớp với trang chi tiết tài khoản
  const growth = currentValue - costBasis
  const barTotal = Math.max(1, costBasis + Math.max(0, growth))
  const capitalPct = (costBasis / barTotal) * 100

  const rateRows: { label: string; value: number | null; note: string }[] = [
    { label: 'Danh nghĩa', value: perf.annualReturn, note: 'con số trên bảng giá' },
    {
      label: 'Sau thuế',
      value: perf.afterTaxReturn,
      note: `trừ ${((profile?.capital_gains_tax_bps ?? 2032) / 100).toFixed(2).replace('.', ',')}% thuế lãi vốn`,
    },
    {
      label: 'Sau lạm phát',
      value: perf.realReturn,
      note:
        profile?.annual_inflation_bps == null
          ? 'cần khai lạm phát trong Cài đặt'
          : `sức mua thật, lạm phát ${(profile.annual_inflation_bps / 100).toFixed(1).replace('.', ',')}%`,
    },
  ]

  return (
    <Card as="section" padding="lg">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
          Hiệu quả đầu tư
        </h2>
        {/* Khu này nói về TIỀN (bỏ vào bao nhiêu, sinh ra bao nhiêu, %/năm). Câu
            "đang giữ mã nào / quỹ nào" nằm ở trang Đầu tư. */}
        <Link to="/invest" className="shrink-0 text-2xs font-medium text-fg-accent">
          Danh mục đầu tư
        </Link>
      </div>

      {/* Đóng góp vs tăng trưởng */}
      <div className="mb-1 flex h-3 w-full overflow-hidden rounded-full bg-surface-sunken">
        <div className="h-full bg-sky-500" style={{ width: `${capitalPct}%` }} />
        <div className="h-full bg-green-500" style={{ width: `${100 - capitalPct}%` }} />
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs">
        <span className="flex items-center gap-1.5 text-fg-secondary">
          <span className="h-2 w-2 rounded-full bg-sky-500" aria-hidden />
          Tiền bạn bỏ vào <b className="tabular-nums">{money(costBasis)}</b>
        </span>
        <span
          className={`flex items-center gap-1.5 ${
            growth >= 0 ? 'text-money-in' : 'text-money-out'
          }`}
        >
          <span className="h-2 w-2 rounded-full bg-green-500" aria-hidden />
          {growth >= 0 ? 'Thị trường cho thêm' : 'Thị trường lấy đi'}{' '}
          <b className="tabular-nums">{money(Math.abs(growth))}</b>
        </span>
      </div>
      <p className="mt-1 text-2xs text-fg-muted">
        Giá trị hiện tại {money(currentValue)}
        {perf.withdrawn > 0 && <> · đã rút ra {money(perf.withdrawn)} trong kỳ</>}.
      </p>

      {/* Ba mức lợi nhuận */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        {rateRows.map((row) => (
          <div key={row.label} className="rounded-xl bg-surface-page p-2.5 text-center ">
            <p
              className={`text-base font-bold tabular-nums ${
                row.value === null
                  ? 'text-fg-muted'
                  : row.value >= 0
                    ? 'text-money-in'
                    : 'text-money-out'
              }`}
            >
              {row.value === null ? '—' : signPct(row.value)}
            </p>
            <p className="mt-0.5 text-2xs font-medium text-fg-secondary">
              {row.label}
            </p>
            <p className="mt-0.5 text-3xs leading-tight text-fg-muted">
              {row.note}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-1 text-center text-2xs text-fg-muted">mỗi năm</p>

      {perf.annualReturn === null && (
        <p className="mt-2 rounded-lg bg-surface-page px-2.5 py-2 text-xs text-fg-muted">
          {flows.length === 0
            ? 'Chưa tính được %/năm: cần ít nhất một lần bỏ tiền vào tài khoản đầu tư (số dư mở tài khoản hoặc giao dịch Chuyển khoản).'
            : 'Chưa quy ra %/năm được: lịch sử còn quá ngắn hoặc biến động quá lớn nên con số quy đổi ra cả năm sẽ vô nghĩa. Vài tháng nữa sẽ có.'}
        </p>
      )}

      {hasMissingRate && (
        <p className="mt-2 text-2xs text-amber-700 dark:text-amber-300">
          Một phần dòng tiền ngoại tệ chưa quy đổi được nên tỷ suất có thể lệch.
        </p>
      )}

      {profile?.annual_inflation_bps == null && (
        <Guide className="mt-2 text-2xs text-fg-muted">
          <Link to="/settings" className="font-medium text-fg-accent">
            Khai mức lạm phát trong Cài đặt
          </Link>{' '}
          để thấy lợi nhuận thật sau khi trừ trượt giá.
        </Guide>
      )}

      <ExplainBox label="Cách tính">
        <p>
          <b>%/năm</b> tính bằng XIRR — có tính cả thời điểm bỏ tiền. Bỏ 1 triệu từ 3 năm trước khác
          hẳn bỏ 1 triệu tháng trước dù cùng lời 100k, phép chia thô không phân biệt được điều đó.
        </p>
        <p>
          <b>Dòng tiền</b> lấy từ giao dịch Chuyển khoản ra/vào tài khoản đầu tư trong {LOOKBACK_YEARS}{' '}
          năm gần nhất. Cổ tức ghi thẳng vào tài khoản đầu tư không tính là tiền bỏ vào — nó là phần
          lời danh mục tự sinh.
        </p>
        <p>
          <b>Sau thuế</b> chỉ đánh vào phần lời (đang lỗ thì không nộp gì). <b>Sau lạm phát</b> dùng
          công thức (1+lãi)/(1+lạm phát)−1 chứ không phải phép trừ, nên hơi thấp hơn bạn nhẩm.
        </p>
        <p>
          Đối chiếu nhanh: gửi tiết kiệm ở Nhật gần 0%/năm, nên bất kỳ con số dương nào sau lạm phát
          cũng đã là hơn để tiền nằm im.
        </p>
      </ExplainBox>
    </Card>
  )
}
