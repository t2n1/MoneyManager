// Khu "Hiệu quả đầu tư" trên trang Tài sản: tách rõ TIỀN MÌNH BỎ VÀO và PHẦN
// THỊ TRƯỜNG CHO THÊM, rồi quy ra %/năm ở ba mức: danh nghĩa → sau thuế → sau
// lạm phát. Ba mức vì con số danh nghĩa hay làm người ta lạc quan quá mức.
import { useMemo } from 'react'
import { Guide } from '../../components/Guide'
import { Link } from 'react-router-dom'
import { ExplainBox } from '../../components/ExplainBox'
import { Card, pct1, signedPct } from '../../components/ui'
import { useAccounts, useProfile, useRangeTransactions, useRates } from '../../hooks/queries'
import { toISODate } from '../../lib/dates'
import type { CurrencyCode } from '../../lib/money'
import { convertToBase } from '../../lib/rates'
import type { AssetAccount, AssetGroup } from './aggregate'
import { investmentScope } from './groupInsight'
import { investCapital } from './investCapital'
import { investTxRange, LOOKBACK_YEARS } from './investHistory'
import type { MoneyView } from './moneyView'
import { investmentPerformance, type CashFlow } from './xirr'

interface Props {
  /** Tài khoản đầu tư đang được tính vào tổng tài sản. */
  accounts: AssetAccount[]
  base: CurrencyCode
  /** Bộ "xem thử bằng tiền khác" — chỉ áp lúc HIỂN THỊ; XIRR vẫn tính theo base. */
  view: MoneyView
  /**
   * Nhóm theo MỤC ĐÍCH — chỉ để giải thích độ lệch, không tham gia phép tính nào.
   *
   * Khối này chọn tài khoản theo LOẠI (`type === 'investment'`) còn bảng nhóm ở dưới cắt
   * theo mục đích, nên một tài khoản loại đầu tư nằm trong nhóm "Tiết kiệm" có mặt ở đây
   * mà không có ở dòng "Đầu tư" — và độ lệch đúng bằng tiền của nó. Cả hai cách cắt đều
   * đúng với câu hỏi của mình, nên việc duy nhất phải làm là NÓI RA. Xem groupInsight.ts.
   */
  purposeGroups: AssetGroup[]
}

export function InvestmentPerformanceSection({ accounts, base, view, purposeGroups }: Props) {
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

  // Vốn gốc theo sổ (nạp − rút, gồm cả số dư mở tài khoản) và giá trị nay — tính ở
  // `investCapital` vì ô KPI "Vốn đầu tư đã bỏ vào" ở đầu trang dùng đúng hai con số
  // này. Hai chỗ tự cộng lấy là hai định nghĩa của "vốn", lệch nhau mà không ai thấy.
  const { costBasis, currentValue, growth, growthPct } = investCapital(accounts, base, r)

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

  const scope = investmentScope({ investmentAccounts: accounts, purposeGroups })

  return (
    <Card as="section" elevation="panel" padding="lg">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-2xs uppercase tracking-[.1em] text-fg-muted">Hiệu quả đầu tư</h2>
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
          Vốn bỏ vào <b className="tabular-nums">{money(costBasis)}</b>
          {/* Tỷ trọng của thanh in bằng CHỮ ngay cạnh nhãn của nó: bản trước chỉ có
              thanh, nên "vốn chiếm bao nhiêu phần giá trị hiện tại" phải ước bằng mắt.
              CHỈ khi đang lời: `barTotal` kẹp phần lời về 0 khi lỗ (thanh không vẽ được
              một lát âm), nên lúc lỗ con số này luôn ra "100,0%" — một tỷ trọng đúng về
              số học mà đọc thành "danh mục toàn vốn, không mất gì", ngay cạnh dòng
              "Thị trường lấy đi ¥464.905". */}
          {growth >= 0 && (
            <span className="text-fg-muted">· {capitalPct.toFixed(1).replace('.', ',')}%</span>
          )}
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
        {growthPct != null && <> · {signedPct(pct1(growthPct))}</>}
        {perf.withdrawn > 0 && <> · đã rút ra {money(perf.withdrawn)} trong kỳ</>}.
      </p>

      {/* Ba mức lợi nhuận — CHỈ khi có con số. Bản trước luôn dựng ba ô rồi in "—" vào cả
          ba, tức ba ô trống chiếm 84px để nói đúng một điều mà một câu nói được, và nói
          rõ hơn: cả ba đều null CÙNG LÚC (afterTax và real đều dẫn xuất từ annualReturn),
          nên ba dấu gạch là ba bản của một tin. */}
      {perf.annualReturn !== null ? (
        <>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {rateRows.map((row) => (
              <div
                key={row.label}
                className="rounded-md border border-border-panel bg-surface-sunken p-2.5 text-center"
              >
                <p
                  className={`text-base font-bold tabular-nums ${
                    row.value === null
                      ? 'text-fg-muted'
                      : row.value >= 0
                        ? 'text-money-in'
                        : 'text-money-out'
                  }`}
                >
                  {signedPct(row.value === null ? null : pct1(row.value))}
                </p>
                <p className="mt-0.5 text-2xs font-medium text-fg-secondary">{row.label}</p>
                <p className="mt-0.5 text-3xs leading-tight text-fg-muted">{row.note}</p>
              </div>
            ))}
          </div>
          <p className="mt-1 text-center text-2xs text-fg-muted">mỗi năm</p>
        </>
      ) : (
        // Câu này nói ĐÚNG lý do mà code có, không phải một ngưỡng nghe hợp lý. XIRR trả
        // null khi: dưới hai dòng tiền, không có cả chiều vào lẫn chiều ra, mọi dòng cùng
        // một ngày, hoặc phương trình không có nghiệm trong khoảng dò (xem xirr.ts) — nên
        // không có mốc "≥12 tháng" nào để hứa.
        <p className="mt-3 border-t border-border-subtle pt-3 text-2xs leading-snug text-fg-muted">
          Chưa quy ra <span className="text-fg-secondary">%/năm</span> —{' '}
          {flows.length === 0
            ? 'cần ít nhất một lần bỏ tiền vào tài khoản đầu tư (số dư mở tài khoản hoặc một giao dịch Chuyển khoản).'
            : `lịch sử mới ${flows.length} dòng tiền, còn quá ngắn hoặc biến động quá lớn nên con số quy ra cả năm sẽ vô nghĩa.`}{' '}
          Danh nghĩa · sau thuế{' '}
          {((profile?.capital_gains_tax_bps ?? 2032) / 100).toFixed(2).replace('.', ',')}%
          {profile?.annual_inflation_bps != null && (
            <>
              {' '}· sau lạm phát{' '}
              {(profile.annual_inflation_bps / 100).toFixed(1).replace('.', ',')}%
            </>
          )}{' '}
          sẽ hiện khi đủ dữ liệu.
        </p>
      )}

      {/* Vì sao con số ở đây lệch với dòng "Đầu tư" của bảng nhóm bên dưới. Xem
          groupInsight.investmentScope — trả null khi mọi tài khoản đầu tư cùng một nhóm. */}
      {scope && (
        <p className="mt-2 text-2xs leading-snug text-fg-muted">
          Tính theo <span className="text-fg-secondary">loại</span> tài khoản nên gồm{' '}
          {scope.outsiders.map((o, i) => (
            <span key={o.name}>
              {i > 0 && ', '}
              <span className="text-fg-secondary">{o.name}</span> {money(o.baseValue)} đang ở
              nhóm {o.groupName}
            </span>
          ))}{' '}
          — vì vậy lệch đúng {money(scope.gap)} với nhóm {scope.mainGroupName} ở bảng dưới.
        </p>
      )}

      {hasMissingRate && (
        <p className="mt-2 text-2xs text-state-warn-fg">
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
