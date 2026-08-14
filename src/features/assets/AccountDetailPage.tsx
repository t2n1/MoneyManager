import { useEffect, useMemo, useState } from 'react'
import { Guide } from '../../components/Guide'
import { Link, useParams } from 'react-router-dom'
import { BackLink } from '../../components/BackLink'
import { ChevronLeft, ChevronRight, LineChart, Scale, Trash2 } from 'lucide-react'
import { EstimateMark } from '../../components/EstimateMark'
import { AccountTypeIcon } from '../../components/icons'
import {
  ActionButton,
  Card,
  IconButton,
  Money,
  SectionTitle,
} from '../../components/ui'
import type { TxFilter } from '../../data'
import {
  useAccountBalances,
  useAccounts,
  useAccountValuations,
  useCategories,
  useDeleteValuation,
  useProfile,
  useRangeTransactions,
  useRates,
  useSearchTransactions,
} from '../../hooks/queries'
import {
  addDaysISO,
  addMonths,
  dayMonthLabel,
  dueDateLabel,
  formatMonthLabel,
  getMonthRange,
  monthKeyForDate,
  toISODate,
  type MonthKey,
} from '../../lib/dates'
import { formatMoney } from '../../lib/money'
import type { TransactionRow } from '../../types/database.types'
import { EditTransactionSheet } from '../transactions/EditTransactionSheet'
import { TransactionItem } from '../transactions/TransactionItem'
import { CardMonthAdjustSheet } from './CardMonthAdjustSheet'
import { cardBillingRange, cardMonthCharge, cardMonthReconcileNet } from './cardMonthCharge'
import { depreciate } from './depreciation'
import { ngay } from './investFormat'
import { investmentStats } from './investment'
import { PnlRow } from './PnlRow'
import { shelterUsage, TAX_SHELTER_LABELS } from './shelter'
import { ReconcileSheet } from './ReconcileSheet'
import { useAccountPortfolio } from './useAccountPortfolio'
import { useCardStatements } from './useCardStatements'
import { ValuationFormSheet } from './ValuationFormSheet'
import { confirmDialog } from '../../lib/dialog'

export function AccountDetailPage() {
  const { accountId = '' } = useParams()
  const { data: profile } = useProfile()
  const { data: accounts = [] } = useAccounts()
  const { data: balances = [] } = useAccountBalances()
  const { data: categories = [] } = useCategories()
  const { base } = useRates()
  const { data: valuations = [] } = useAccountValuations()
  const deleteValuation = useDeleteValuation()
  const [editing, setEditing] = useState<TransactionRow | null>(null)
  const [showValuation, setShowValuation] = useState(false)
  const [showReconcile, setShowReconcile] = useState(false)
  const [showMonthAdjust, setShowMonthAdjust] = useState(false)

  const monthStartDay = profile?.month_start_day ?? 1
  // null = "kỳ hiện tại": tính lazy vì profile tải async — khởi tạo cứng trong
  // useState sẽ chốt nhầm kỳ khi month_start_day ≠ 1
  const [monthKey, setMonthKey] = useState<MonthKey | null>(null)
  const activeMonthKey = monthKey ?? monthKeyForDate(toISODate(new Date()), monthStartDay)

  const account = accounts.find((a) => a.id === accountId)
  const balanceRow = balances.find((b) => b.id === accountId)
  const balance = balanceRow?.balance ?? 0
  const isInvestment = account?.type === 'investment'
  const isFixed = account?.type === 'fixed'
  // Đầu tư: vốn gốc = balance (sổ), giá thị trường = snapshot mới nhất (view market_value)
  const invStats = investmentStats(balance, isInvestment ? (balanceRow?.market_value ?? null) : null)
  // Danh mục tính TẠI MÁY từ sổ lệnh + bảng giá, bằng đúng engine của trang Đầu tư.
  // `null` = tài khoản không có sổ lệnh (hoặc đã lưu trữ) → rơi về đường định giá nhập tay.
  // `undefined` = CHƯA BIẾT, sổ lệnh còn đang bay — không được đoán về bên nào.
  const danhMuc = useAccountPortfolio(account)

  const todayISO = toISODate(new Date())
  // Tài sản cố định: khấu hao tuyến tính (chỉ hiển thị, giá trị nhập tay vẫn thắng)
  const dep = isFixed
    ? depreciate({
        costBasis: account?.initial_balance ?? 0,
        salvageValue: account?.salvage_value ?? 0,
        months: account?.depreciation_months ?? null,
        fromISO: account?.depreciation_from ?? null,
        todayISO,
      })
    : null

  // Hạn mức nạp NISA/iDeCo — đếm chuyển khoản vào tài khoản trong năm dương lịch
  const shelterYear = Number(todayISO.slice(0, 4))
  const { data: yearTxs = [] } = useRangeTransactions(
    { start: `${shelterYear}-01-01`, end: `${shelterYear + 1}-01-01` },
    !!account?.tax_shelter,
  )
  const shelter = shelterUsage(
    accountId,
    yearTxs,
    shelterYear,
    account?.shelter_annual_limit ?? null,
  )
  // Thẻ tín dụng: tách kỳ đã chốt (sắp bị rút) khỏi phần chưa chốt. Số lớn phía
  // trên vẫn là TỔNG nợ — hai dòng này nói rõ tổng đó chia ra sao.
  const cardForSplit = useMemo(
    () =>
      account?.type === 'card'
        ? [
            {
              id: accountId,
              balance,
              statementDay: account.statement_day,
              paymentDueDay: account.payment_due_day,
            },
          ]
        : [],
    [account?.type, account?.statement_day, account?.payment_due_day, accountId, balance],
  )
  const cardStatement = useCardStatements(cardForSplit, todayISO).get(accountId)
  // Phần "chưa chốt" là tiền quẹt từ HÔM SAU ngày chốt — nói ra ngày đó để không
  // ai phải đoán nó thuộc tháng nào.
  const unbilledFromISO = cardStatement?.closeISO
    ? addDaysISO(cardStatement.closeISO, 1)
    : null

  // CHỈ hàng người dùng gõ tay. Từ migration 0035, cron ghi vào cùng bảng này mỗi ngày
  // với source='auto' và không có chỗ nào dọn — liệt kê cả chúng thì khu này là một danh
  // sách dài ra mỗi ngày, kèm nút xoá từng dòng, mà không ai chủ ý tạo ra. Hàng 'auto' vẫn
  // ở lại trong DB: tab Diễn biến dùng chính chúng để vẽ lịch sử tài sản ròng.
  //
  // Luật là `!== 'auto'`, KHÔNG phải `=== 'manual'`: migration 0035 thêm cột với
  // `default 'manual'`, nên bản sao lưu xuất TRƯỚC nó không mang trường `source` nào cả.
  // Lọc theo `=== 'manual'` là giấu sạch mọi định giá gõ tay của một bản khôi phục — kể
  // cả trên tài sản cố định, nơi đây là con đường duy nhất.
  const accountValuations = useMemo(
    () =>
      valuations
        .filter((v) => v.account_id === accountId && v.source !== 'auto')
        .sort((a, b) => b.valued_on.localeCompare(a.valued_on)),
    [valuations, accountId],
  )

  // Phím tắt desktop: ←/→ chuyển tháng
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT'))
        return
      const fallback = () => monthKeyForDate(toISODate(new Date()), monthStartDay)
      if (e.key === 'ArrowLeft') setMonthKey((k) => addMonths(k ?? fallback(), -1))
      if (e.key === 'ArrowRight') setMonthKey((k) => addMonths(k ?? fallback(), 1))
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [monthStartDay])

  // Thẻ tín dụng đánh số kỳ theo THÁNG BỊ RÚT TIỀN cho khớp app thẻ (PayPay/Rakuten
  // bấm "tháng 9" ra tiền quẹt tháng 8). Thẻ thiếu ngày chốt/ngày trả, và mọi loại
  // tài khoản khác, vẫn dùng tháng lịch như cũ.
  const billing = account
    ? cardBillingRange({
        monthKey: activeMonthKey,
        statementDay: account.type === 'card' ? account.statement_day : null,
        paymentDueDay: account.type === 'card' ? account.payment_due_day : null,
      })
    : null

  // Lịch sử của tài khoản này trong "tháng" đang xem (khớp account_id HOẶC to_account_id).
  const range = billing ?? getMonthRange(activeMonthKey, monthStartDay)
  const filter: TxFilter = useMemo(
    () => ({
      start: range.start,
      end: range.end,
      accountIds: accountId ? [accountId] : undefined,
    }),
    [range.start, range.end, accountId],
  )
  const { data: results = [], isLoading } = useSearchTransactions(filter, !!accountId && !!profile)

  const accountOf = (id: string | null) => accounts.find((a) => a.id === id)
  const categoryOf = (id: string | null) => categories.find((c) => c.id === id)

  const days = useMemo(() => {
    const map = new Map<string, TransactionRow[]>()
    for (const t of results) {
      const list = map.get(t.occurred_on) ?? []
      list.push(t)
      map.set(t.occurred_on, list)
    }
    return [...map.entries()]
  }, [results])

  const currency = account?.currency ?? base

  // Sao kê theo tháng của thẻ: tổng tiền quẹt tính trên ĐÚNG rổ giao dịch đang
  // hiện bên dưới, nên con số luôn bằng tổng những dòng người dùng nhìn thấy.
  const isCard = account?.type === 'card'
  const monthCharged = useMemo(
    () => (isCard ? cardMonthCharge(accountId, results) : 0),
    [isCard, accountId, results],
  )
  // Khoản bù "Điều chỉnh số nợ" rơi vào kỳ (thường ghi lùi về ngày chốt) — đã bị
  // loại khỏi tổng "Quẹt" nên phải hiện thành dòng riêng, kẻo dòng giao dịch có
  // mà tổng lại như không.
  const monthReconcileNet = useMemo(
    () => (isCard ? cardMonthReconcileNet(accountId, results) : 0),
    [isCard, accountId, results],
  )

  return (
    <div className="p-3 lg:p-6">
      {/* Header */}
      <div className="mb-3 flex items-center gap-2">
        <BackLink to="/assets" aria-label="Quay lại" />
        <h1 className="flex-1 truncate text-lg font-bold text-fg-primary">
          {account ? (
            <span className="inline-flex items-center gap-1.5">
              <AccountTypeIcon type={account.type} className="h-5 w-5" /> {account.name}
            </span>
          ) : (
            'Tài khoản'
          )}
        </h1>
      </div>

      {/* Số dư hiện tại */}
      <Card as="section" padding="lg" className="mb-3">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm font-medium text-fg-muted">
            {account?.type === 'card'
              ? 'Đang nợ thẻ'
              : isInvestment || isFixed
                ? 'Giá trị hiện tại'
                : 'Số dư hiện tại'}
          </p>
          {/* Không chỉ cần `session` — bảng giá cổ phiếu trả về phiên MỚI NHẤT của CẢ
              bảng, không phải phiên của riêng mã tài khoản này đang giữ, nên `session`
              vẫn có thể khác null ngay trong lúc `marketValue` là null (không mã nào có
              giá). Hiện "giá phiên …" lúc đó là khoe một ngày cho một con số không tồn
              tại — phải đúng cả hai điều kiện mới đáng tin. */}
          {/* `ngay()` (26/08/12) chứ không `dayMonthLabel` (08/12): bảng nhãn của spec
              liệt "Ngày phiên" là một trong bốn thứ phải nói giống nhau ở hai màn, và
              hai tab của /invest — cách một cú bấm "Xem →" — dùng dạng CÓ NĂM. */}
          {danhMuc?.session && danhMuc.marketValue != null && (
            <span className="text-2xs text-fg-muted">giá phiên {ngay(danhMuc.session)}</span>
          )}
        </div>
        {/* Tô màu vẫn theo `balance` (số sổ) chứ không theo con số đang hiện: với tài
            khoản đầu tư/cố định, số hiện là giá thị trường nhưng "âm hay không" là
            chuyện của số dư sổ. Giữ đúng hành vi cũ. */}
        <p className="mt-1 text-2xl font-bold">
          {account?.type === 'card' ? (
            <Money
              amount={balance < 0 ? -balance : 0}
              currency={currency}
              tone={balance < 0 ? 'out' : 'neutral'}
              showSign={balance < 0}
            />
          ) : (
            <Money
              amount={
                isInvestment
                  ? // CÓ sổ lệnh mà `marketValue` là null (tiền chưa mua âm, hoặc thiếu
                    // giá mọi mã/quỹ) → SỐ DƯ SỔ, đúng chữ của spec. Không rơi về
                    // `invStats.marketValue`: đó là một snapshot cũ, và câu ngay bên dưới
                    // đang nói "chưa có giá cho mã nào đang giữ" — số lớn phía trên mà là
                    // một ảnh chụp hôm nào đó thì hai dòng nói ngược nhau, lại KHÔNG có
                    // EstimateMark nào báo là số ước tính.
                    danhMuc
                    ? (danhMuc.marketValue ?? balance)
                    : (invStats.marketValue ?? balance)
                  : isFixed
                    ? // Định giá nhập tay thắng công thức khấu hao
                      (balanceRow?.market_value ?? dep?.currentValue ?? balance)
                    : balance
              }
              currency={currency}
              tone={balance < 0 ? 'out' : 'neutral'}
            />
          )}
          {/* Chỉ gắn dấu khi con số ĐANG hiện thật sự do công thức khấu hao suy ra:
              có định giá nhập tay thì đó là số người dùng tự khai, không phải app đoán. */}
          {isFixed && balanceRow?.market_value == null && dep != null && (
            <EstimateMark reason="Suy ra từ ngày mua và số tháng khấu hao bạn đã đặt, không phải giá thị trường." />
          )}
        </p>
        {account?.asset_group && (
          <p className="mt-1 text-xs text-fg-muted">Nhóm: {account.asset_group}</p>
        )}

        {/* Điều chỉnh số dư (mục X) — cho ví/tài khoản thường và thẻ; đầu tư và tài
            sản cố định đi đường "Cập nhật giá trị" (định giá theo ngày) thay vì bù */}
        {account && !isInvestment && !isFixed && (
          <ActionButton onClick={() => setShowReconcile(true)} className="mt-3">
            <Scale className="h-3.5 w-3.5" />{' '}
            {account.type === 'card' ? 'Điều chỉnh số nợ' : 'Điều chỉnh số dư'}
          </ActionButton>
        )}

        {isInvestment && danhMuc && (
          <div className="mt-3 space-y-1.5 border-t border-border-subtle pt-3 text-sm">
            {/* marketValue == null: không phải "lãi/lỗ đúng bằng 0", mà là buildPortfolio
                không có giá cho BẤT KỲ mã/quỹ nào đang giữ, nên đã định giá mọi vị thế
                bằng giá vốn — unrealizedPnl và unrealizedPercent ra đúng 0 một cách giả.
                In PnlRow lúc này sẽ khẳng định "+0 ₫ (+0,0%)" như một sự thật trong khi số
                lớn phía trên đã âm thầm rơi về vốn gốc. Nói thẳng thay vì bịa số 0.
                Câu chữ mượn nguyên từ nhánh `p.marketValue === null` của InvestStocksTab
                (cách một cú bấm "Xem →"), CHỨ KHÔNG mượn câu "Chưa cập nhật giá thị
                trường — đang tính theo vốn gốc." của khối không-sổ-lệnh dưới đây: câu đó
                đúng cho khối không-sổ-lệnh (guard của nó là invStats.unrealizedPnl ==
                null, tức chưa từng có bản định giá nào) nhưng SAI ở đây — số lớn phía
                trên có thể đang rơi về invStats.marketValue (một bản định giá tay CŨ),
                nên nói "chưa cập nhật" là bịa; câu đúng ở khối này là "chưa có giá cho
                mã/quỹ đang giữ", đúng thứ mà buildPortfolio vừa báo. */}
            {danhMuc.marketValue == null ? (
              <p className="text-xs text-fg-muted">
                Chưa tính được — chưa có giá cho {danhMuc.kind === 'funds' ? 'quỹ' : 'mã'} nào đang
                giữ.
              </p>
            ) : (
              <PnlRow
                label="Lời/lỗ chưa bán"
                amount={danhMuc.unrealizedPnl}
                currency={currency}
                percent={danhMuc.unrealizedPercent}
              />
            )}
            {/* Không in "Vốn gốc (đã bỏ vào)" ở đây nữa: đó là mốc theo SỐ DƯ SỔ, tức mốc
                mà quyết định 1 đã loại. Câu "tiền tôi bỏ vào sinh lợi bao nhiêu" nằm ở ô
                Hiệu quả đầu tư tab Diễn biến, nơi XIRR trả lời có tính cả thời điểm. */}
            <Link
              to={`/invest?tab=${danhMuc.kind}&account=${accountId}`}
              className="flex items-center justify-between gap-2 pt-1 text-fg-accent"
            >
              <span className="text-xs font-medium">
                Danh mục · {danhMuc.count} {danhMuc.kind === 'funds' ? 'quỹ' : 'mã'} · sổ lệnh
              </span>
              <span className="text-xs font-medium">Xem →</span>
            </Link>
          </div>
        )}

        {/* Tài khoản đầu tư KHÔNG có sổ lệnh (loại tiền app chưa có bảng giá, hoặc chưa ghi
            lệnh nào): giữ nguyên đường định giá nhập tay — không còn cách nào khác để biết
            giá trị.

            `danhMuc === null` chứ không `!danhMuc`: `undefined` nghĩa là sổ lệnh còn đang
            bay, và trong khoảng đó khối này KHÔNG được hiện. Nút "Cập nhật giá trị" nhấp
            nháy trên một tài khoản do cron lo là đủ để ghi một hàng `source='manual'` —
            `showValuation` là state riêng nên bảng nhập vẫn mở và vẫn gửi được sau khi số
            đã chốt lại. Hàng tay thắng hàng auto cùng ngày, và Tổng tài sản tách khỏi
            trang này. */}
        {isInvestment && danhMuc === null && (
          <div className="mt-3 space-y-1.5 border-t border-border-subtle pt-3 text-sm">
            <div className="flex items-center justify-between text-fg-muted">
              <span>Vốn gốc (đã bỏ vào)</span>
              <Money
                amount={invStats.costBasis}
                currency={currency}
                className="font-medium text-fg-primary"
              />
            </div>
            {invStats.unrealizedPnl == null ? (
              <p className="text-xs text-fg-muted">
                Chưa cập nhật giá thị trường — đang tính theo vốn gốc.
              </p>
            ) : (
              <PnlRow
                label="Lãi/lỗ so với vốn gốc"
                amount={invStats.unrealizedPnl}
                currency={currency}
                percent={invStats.pnlPercent}
              />
            )}
            <button
              type="button"
              onClick={() => setShowValuation(true)}
              className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-green-700 px-3 py-1.5 text-xs font-semibold text-white active:scale-95"
            >
              <LineChart className="h-3.5 w-3.5" /> Cập nhật giá trị
            </button>
          </div>
        )}

        {/* Hạn mức nạp NISA / iDeCo trong năm */}
        {isInvestment && account?.tax_shelter && (
          <div className="mt-3 border-t border-border-subtle pt-3">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="min-w-0 truncate text-fg-muted">
                {TAX_SHELTER_LABELS[account.tax_shelter]}
              </span>
              <span className="shrink-0 text-xs text-fg-muted">
                năm {shelterYear}
              </span>
            </div>
            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-surface-sunken">
              <div
                className={`h-full rounded-full ${
                  (shelter.ratio ?? 0) >= 1 ? 'bg-amber-500' : 'bg-green-500'
                }`}
                style={{ width: `${Math.min(100, (shelter.ratio ?? 0) * 100)}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs text-fg-secondary">
              Đã nạp <b>{formatMoney(shelter.used, currency)}</b>
              {shelter.limit !== null && <> / {formatMoney(shelter.limit, currency)}</>}
              {shelter.remaining !== null && shelter.remaining > 0 && (
                <>
                  {' '}
                  · còn <b>{formatMoney(shelter.remaining, currency)}</b> hạn mức năm nay
                </>
              )}
              {shelter.remaining === 0 && <> · đã dùng hết hạn mức</>}
            </p>
            <Guide className="mt-0.5 text-2xs text-fg-muted">
              Hạn mức tính theo năm dương lịch và không dồn sang năm sau. Rút tiền ra giữa năm cũng
              không hoàn lại phần hạn mức đã dùng.
            </Guide>
          </div>
        )}

        {/* Tài sản cố định: khấu hao */}
        {isFixed && (
          <div className="mt-3 space-y-1.5 border-t border-border-subtle pt-3 text-sm">
            <div className="flex items-center justify-between text-fg-muted">
              <span>Giá mua</span>
              <Money
                amount={account?.initial_balance ?? 0}
                currency={currency}
                className="font-medium text-fg-primary"
              />
            </div>
            {dep ? (
              <>
                <div className="flex items-center justify-between font-medium text-money-out">
                  <span>Đã khấu hao</span>
                  <span>
                    <Money amount={dep.accumulated} currency={currency} tone="out" showSign />
                    <span className="ml-1 text-xs tabular-nums">
                      ({Math.round(dep.elapsedRatio * 100)}%)
                    </span>
                  </span>
                </div>
                <p className="text-xs text-fg-muted">
                  {dep.monthsLeft > 0
                    ? `Còn ${dep.monthsLeft} tháng nữa là hết vòng đời khấu hao.`
                    : 'Đã hết vòng đời khấu hao — giá trị giữ ở mức còn lại.'}
                </p>
              </>
            ) : (
              <p className="text-xs text-fg-muted">
                Chưa đặt ngày mua / số tháng khấu hao nên giá trị giữ nguyên theo sổ. Sửa tài khoản
                để bật khấu hao tự động.
              </p>
            )}
            <button
              type="button"
              onClick={() => setShowValuation(true)}
              className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-green-700 px-3 py-1.5 text-xs font-semibold text-white active:scale-95"
            >
              <LineChart className="h-3.5 w-3.5" /> Cập nhật giá trị thực tế
            </button>
          </div>
        )}

        {account?.type === 'card' && (
          <div className="mt-3 space-y-1.5 border-t border-border-subtle pt-3 text-sm">
            {/* Chia kỳ đứng TRƯỚC hạn mức: câu hỏi "sắp mất bao nhiêu" gấp hơn
                "còn quẹt được bao nhiêu". Chỉ hiện khi đủ ngày chốt + ngày trả. */}
            {cardStatement?.billed != null && cardStatement.dueISO && (
              <>
                <div className="flex items-center justify-between text-fg-muted">
                  <span>Kỳ này · đến hạn {dueDateLabel(cardStatement.dueISO)}</span>
                  <Money
                    amount={cardStatement.billed}
                    currency={currency}
                    tone={cardStatement.billed > 0 ? 'out' : 'neutral'}
                    className="font-semibold"
                  />
                </div>
                {(cardStatement.unbilled ?? 0) > 0 && (
                  <div className="flex items-center justify-between gap-2 text-fg-muted">
                    {/* Nói rõ khoảng ngày: "kỳ sau mới đòi" không cho biết đây là
                        tiền quẹt tháng nào, dễ tưởng trùng tháng đang xem bên dưới */}
                    <span>
                      Chưa chốt
                      {unbilledFromISO && ` · từ ${dayMonthLabel(unbilledFromISO)}`}
                      {/* Bỏ thứ ở đây: dòng này còn cả tháng rưỡi nữa mới tới, thứ
                          chỉ làm nhãn dài thêm và đẩy sang hai dòng ở cỡ chữ lớn */}
                      {cardStatement.nextDueISO
                        ? ` · đòi ${dayMonthLabel(cardStatement.nextDueISO)}`
                        : ' · kỳ sau mới đòi'}
                    </span>
                    <Money
                      amount={cardStatement.unbilled ?? 0}
                      currency={currency}
                      className="font-medium text-fg-primary"
                    />
                  </div>
                )}
              </>
            )}
            {account.credit_limit != null && (
              <>
                <div className="flex items-center justify-between text-fg-muted">
                  <span>Còn dùng được</span>
                  <Money
                    amount={account.credit_limit - (balance < 0 ? -balance : 0)}
                    currency={currency}
                    className="font-medium text-fg-primary"
                  />
                </div>
                <div className="flex items-center justify-between text-fg-muted">
                  <span>Hạn mức</span>
                  {/* Không đặt text-fg-primary: dòng này cố ý mờ hơn dòng trên */}
                  <Money amount={account.credit_limit} currency={currency} className="text-fg-muted" />
                </div>
              </>
            )}
            {account.statement_day != null && (
              <div className="flex items-center justify-between text-fg-muted">
                <span>Ngày chốt sao kê</span>
                <span className="tabular-nums">Ngày {account.statement_day}</span>
              </div>
            )}
            {account.payment_due_day != null && (
              <div className="flex items-center justify-between text-fg-muted">
                <span>Ngày đến hạn</span>
                <span className="tabular-nums">Ngày {account.payment_due_day}</span>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Lịch sử cập nhật giá trị (tài khoản đầu tư) */}
      {(isInvestment || isFixed) && accountValuations.length > 0 && (
        <Card as="section" padding="none" className="mb-3 overflow-hidden">
          <SectionTitle className="px-4 pt-3">Lịch sử giá trị</SectionTitle>
          <ul className="mt-2 divide-y divide-border-subtle">
            {accountValuations.map((v) => (
              <li key={v.id} className="flex items-center gap-2 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <Money
                    amount={v.market_value}
                    currency={currency}
                    className="text-sm font-medium"
                  />
                  <span className="ml-2 text-xs text-fg-muted">{v.valued_on}</span>
                  {v.note && <span className="block truncate text-xs text-fg-muted">{v.note}</span>}
                </div>
                <IconButton
                  variant="ghost"
                  onClick={async () => {
                    if (await confirmDialog({ title: 'Xóa bản ghi giá trị này?', danger: true, confirmLabel: 'Xóa' }))
                      deleteValuation.mutate(v.id)
                  }}
                  className="shrink-0 hover:text-money-out"
                  aria-label="Xóa bản ghi giá trị"
                >
                  <Trash2 className="h-4 w-4" />
                </IconButton>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Chuyển tháng */}
      <div className="mb-3 flex items-center gap-2">
        <IconButton
          onClick={() => setMonthKey((k) => addMonths(k ?? activeMonthKey, -1))}
          aria-label="Tháng trước"
        >
          <ChevronLeft className="h-5 w-5" />
        </IconButton>
        {/* Thẻ: nói "sao kê" chứ không chỉ số tháng — bên dưới là giao dịch của
            THÁNG TRƯỚC, y như app thẻ, nên tiêu đề phải tự nó giải thích được */}
        <h2 className="flex-1 text-center text-sm font-bold text-fg-primary">
          {billing ? 'Sao kê ' : ''}
          {billing
            ? formatMonthLabel(activeMonthKey).toLowerCase()
            : formatMonthLabel(activeMonthKey)}
        </h2>
        <IconButton
          onClick={() => setMonthKey((k) => addMonths(k ?? activeMonthKey, 1))}
          aria-label="Tháng sau"
        >
          <ChevronRight className="h-5 w-5" />
        </IconButton>
      </div>

      {/* Sao kê của thẻ — con số để đối chiếu với app thẻ thật (chọn cùng số tháng
          là thấy cùng danh sách), kèm nút bù chênh lệch ghi vào chính kỳ đó. */}
      {isCard && account && (
        <Card as="section" padding="lg" className="mb-3">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="text-fg-muted">
              {billing
                ? `Quẹt ${dayMonthLabel(billing.start)} – ${dayMonthLabel(billing.closeISO)}`
                : `Quẹt trong ${formatMonthLabel(activeMonthKey).toLowerCase()}`}
            </span>
            {isLoading ? (
              <span className="text-fg-muted">—</span>
            ) : (
              <Money
                amount={monthCharged}
                currency={currency}
                tone={monthCharged > 0 ? 'out' : 'neutral'}
                className="text-base font-bold"
              />
            )}
          </div>
          {monthReconcileNet !== 0 && (
            <div className="mt-1.5 flex items-center justify-between gap-2 text-sm text-fg-muted">
              {/* Khoản bù không phải tiền quẹt nên không nằm trong tổng trên —
                  nhưng nó có trong danh sách bên dưới, phải nói rõ kẻo tưởng cộng sót */}
              <span>Khoản bù nợ (không tính vào quẹt)</span>
              <Money
                amount={Math.abs(monthReconcileNet)}
                currency={currency}
                tone={monthReconcileNet > 0 ? 'in' : 'out'}
                showSign
                className="font-medium"
              />
            </div>
          )}
          {billing ? (
            <div className="mt-1.5 flex items-center justify-between text-sm text-fg-muted">
              <span>Bị rút ngày</span>
              <span>{dueDateLabel(billing.dueISO)}</span>
            </div>
          ) : (
            // Thiếu ngày chốt hoặc ngày trả thì không dựng được kỳ — nói thẳng
            // thay vì suy ra một ngày rút sai.
            <p className="mt-1.5 text-xs text-fg-muted">
              Thẻ chưa có đủ ngày chốt sao kê và ngày đến hạn nên app đang đếm theo tháng lịch. Sửa
              tài khoản để xem đúng kỳ như app thẻ.
            </p>
          )}
          <ActionButton onClick={() => setShowMonthAdjust(true)} className="mt-3">
            <Scale className="h-3.5 w-3.5" /> Chỉnh cho khớp
          </ActionButton>
        </Card>
      )}

      {/* Lịch sử giao dịch trong tháng */}
      <p className="mb-2 px-1 text-xs text-fg-muted">
        {isLoading ? 'Đang tải…' : `${results.length} giao dịch`}
      </p>
      {days.length === 0 && !isLoading ? (
        <p className="py-10 text-center text-fg-muted">
          Không có giao dịch trong {billing ? 'kỳ này' : 'tháng này'}
        </p>
      ) : (
        days.map(([day, txs]) => (
          <section key={day} className="mb-3">
            <div className="mb-1 px-1 text-xs font-medium text-fg-muted">{day}</div>
            <Card padding="none" className="divide-y divide-border-subtle overflow-hidden">
              {txs.map((tx) => (
                <TransactionItem
                  key={tx.id}
                  tx={tx}
                  categoryOf={categoryOf}
                  accountOf={accountOf}
                  base={base}
                  onClick={() => setEditing(tx)}
                />
              ))}
            </Card>
          </section>
        ))
      )}

      {editing && <EditTransactionSheet tx={editing} onClose={() => setEditing(null)} />}
      {showValuation && account && (
        <ValuationFormSheet
          account={account}
          currentValue={invStats.marketValue}
          onClose={() => setShowValuation(false)}
        />
      )}
      {showReconcile && account && (
        <ReconcileSheet
          account={account}
          currentBalance={balance}
          billedPending={cardStatement?.billed ?? null}
          billedDueISO={cardStatement?.dueISO ?? null}
          onClose={() => setShowReconcile(false)}
        />
      )}
      {showMonthAdjust && account && (
        <CardMonthAdjustSheet
          account={account}
          monthKey={activeMonthKey}
          charged={monthCharged}
          rangeStartISO={range.start}
          rangeEndISO={range.end}
          onClose={() => setShowMonthAdjust(false)}
        />
      )}
    </div>
  )
}
