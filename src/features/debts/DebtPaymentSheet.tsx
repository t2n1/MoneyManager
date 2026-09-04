import { useEffect, useId, useMemo, useState } from 'react'
import type { NewDebtPayment, NewTransaction } from '../../data'
import {
  useAccounts,
  useCategories,
  useCreateCategory,
  useCreateDebtPayment,
  useRates,
} from '../../hooks/queries'
import { toISODate } from '../../lib/dates'
import { CURRENCIES, formatMoney } from '../../lib/money'
import { MoneyField } from '../../components/MoneyField'
import { DateField } from '../../components/DateField'
import type { DebtRow } from '../../types/database.types'
import { useEscClose } from '../../hooks/useEscClose'
import { debtFlowCategoryId } from '../transactions/roleSave'
import { accountsForDebt } from '../transactions/debtPick'
import { impliedRate, nextCounterAmount } from './crossPayment'
import { formatRateLine } from '../../lib/rates'
import { SectionTitle, Select, actionButtonClass } from '../../components/ui'

interface Props {
  debt: DebtRow
  /** còn lại (minor units theo currency của nợ) — gợi ý điền sẵn */
  remaining: number
  onClose: () => void
}

/** Sheet ghi nhận một lần trả nợ. Tùy chọn tạo giao dịch thật (đổi số dư tài khoản). */
export function DebtPaymentSheet({ debt, remaining, onClose }: Props) {
  useEscClose(onClose)
  const uid = useId()
  const createPayment = useCreateDebtPayment()
  const createCategory = useCreateCategory()
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()
  const { base, rates } = useRates()

  // Mọi ví chưa lưu trữ, ví cùng tệ với khoản nợ xếp trước (xem accountsForDebt).
  // Trả nợ ¥ vào ví ₫ là ca thật — bản trước lọc mất ví khác tệ nên không ghi được.
  const matchingAccounts = useMemo(() => accountsForDebt(accounts, debt), [accounts, debt])
  // Giao dịch: mình trả (i_owe) = chi; người ta trả mình (owed_to_me) = thu
  const txType = debt.direction === 'i_owe' ? 'expense' : 'income'

  const canRecordReal = matchingAccounts.length > 0
  // Mặc định bật; realOn còn phụ thuộc canRecordReal (accounts tải xong).
  const [withTransaction, setWithTransaction] = useState(true)
  /** Số XOÁ NỢ — luôn theo tệ của khoản nợ. */
  const [amount, setAmount] = useState(Math.max(remaining, 0))
  const [paidOn, setPaidOn] = useState(toISODate(new Date()))
  const [accountId, setAccountId] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  /** Số THẬT vào/ra ví — chỉ dùng khi ví khác tệ với khoản nợ. */
  const [received, setReceived] = useState(0)
  /** Đã gõ tay ô "thực nhận" chưa — gõ rồi thì tỷ giá thị trường không được đè lên. */
  const [receivedTouched, setReceivedTouched] = useState(false)

  // Điền tài khoản mặc định khi dữ liệu về (useState không nhận được data async).
  useEffect(() => {
    if (!accountId && matchingAccounts[0]) setAccountId(matchingAccounts[0].id)
  }, [accountId, matchingAccounts])

  const account = matchingAccounts.find((a) => a.id === accountId)
  const accCurrency = account?.currency ?? debt.currency
  /** Ví khác tệ với khoản nợ → một lần trả mang HAI số, phải hỏi cả hai. */
  const cross = accCurrency !== debt.currency

  // Gợi ý số thực nhận theo tỷ giá thị trường, nhưng KHÔNG đè lên số đã gõ tay:
  // tỷ giá của lần trả là tỷ giá hai bên thoả thuận, chợ hôm nay không liên quan.
  useEffect(() => {
    if (!cross) return
    setReceived((current) =>
      nextCounterAmount({
        current,
        touched: receivedTouched,
        source: amount,
        from: debt.currency,
        to: accCurrency,
        base,
        rates: rates ?? {},
      }),
    )
  }, [cross, receivedTouched, amount, debt.currency, accCurrency, base, rates])

  const realOn = withTransaction && canRecordReal
  /** Số thật đổi số dư ví: cùng tệ thì chính là số xoá nợ. */
  const txAmount = cross ? received : amount
  const rateLine = formatRateLine(
    debt.currency,
    accCurrency,
    impliedRate(amount, debt.currency, received, accCurrency) ?? 0,
  )
  const canSave = amount > 0 && !saving && (!realOn || (!!accountId && txAmount > 0))

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    try {
      let transaction: NewTransaction | null = null
      if (realOn) {
        // Danh mục 🤝 tự gán ("Trả nợ"/"Thu nợ") — giao dịch is_debt_flow không vào
        // báo cáo, bắt chọn tay chỉ ra danh mục ngẫu nhiên (trước đây tự điền cái đầu).
        const categoryId = await debtFlowCategoryId('repay', debt.direction, {
          categories,
          createCategory: (i) => createCategory.mutateAsync(i),
        })
        transaction = {
          type: txType,
          // Số theo tệ VÍ. Khác tệ khoản nợ thì đây là số thật vào/ra ví (₫), còn số
          // xoá nợ (¥) đi xuống `input.amount` bên dưới — hai số, hai chỗ.
          amount: txAmount,
          to_amount: null,
          category_id: categoryId,
          account_id: accountId,
          to_account_id: null,
          occurred_on: paidOn,
          note: note.trim() || `${txType === 'expense' ? 'Trả nợ' : 'Thu nợ'} · ${debt.counterparty}`,
        }
      }
      const input: NewDebtPayment = {
        debt_id: debt.id,
        amount,
        paid_on: paidOn,
        note: note.trim(),
        transaction,
      }
      await createPayment.mutateAsync(input)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 lg:items-center animate-overlay-in"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-2xl bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:rounded-2xl animate-sheet-in lg:animate-sheet-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <SectionTitle role="block" className="mb-1">Ghi nhận trả</SectionTitle>
        <p className="mb-3 text-sm text-fg-muted">
          {debt.direction === 'i_owe' ? 'Mình trả' : 'Người ta trả'} · {debt.counterparty} · còn{' '}
          {formatMoney(Math.max(remaining, 0), debt.currency)}
        </p>

        {/* <span>: MoneyField có hai ô (chạm/desktop), tên đến từ `ariaLabel`. */}
        <span className="mb-1 block text-sm font-medium text-fg-muted">
          {cross ? `Xoá bao nhiêu nợ (${CURRENCIES[debt.currency].label})` : 'Số tiền trả'}
        </span>
        <div className="mb-3">
          <MoneyField
            value={amount}
            onChange={setAmount}
            currency={debt.currency}
            ariaLabel="Số tiền trả"
            onEnter={handleSave}
            className="w-full rounded-lg border border-border-strong px-3 py-2 text-right text-lg font-semibold"
          />
        </div>

        {/* <span> chứ không <label>: ô ngày là <button>, tên đi qua ariaLabel. */}
        <span className="mb-1 block text-sm font-medium text-fg-muted">Ngày trả</span>
        <DateField
          ariaLabel="Ngày trả"
          value={paidOn}
          onChange={setPaidOn}
          className="mb-3 w-full px-3 py-2"
        />

        {/* Công tắc tạo giao dịch thật */}
        <div className="mb-3 rounded-lg bg-surface-sunken p-3">
          <label className="flex items-center justify-between text-sm text-fg-secondary">
            <span>
              Có chuyển tiền thật
              <span className="block text-sm text-fg-muted">
                {debt.direction === 'i_owe' ? 'Tạo giao dịch chi (trừ số dư)' : 'Tạo giao dịch thu (cộng số dư)'}
              </span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={realOn}
              aria-label="Có chuyển tiền thật"
              disabled={!canRecordReal}
              onClick={() => setWithTransaction((v) => !v)}
              // Vùng chạm 44×44 ở nút, đường ray 24×44 ở <span> trong: ray đặt thẳng lên
              // nút thì chỉ cao 24px. Cùng khuôn với các công tắc khác trong app.
              className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center disabled:opacity-40"
            >
              <span
                className={`relative block h-6 w-11 rounded-full transition ${
                  realOn ? 'bg-accent' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                    realOn ? 'left-[22px]' : 'left-0.5'
                  }`}
                />
              </span>
            </button>
          </label>

          {!canRecordReal && (
            <p className="mt-2 text-sm text-state-warn-fg">
              Chưa có tài khoản nào để tạo giao dịch thật. Vẫn ghi nhận được lần trả (không đổi
              số dư).
            </p>
          )}

          {realOn && (
            <div className="mt-3">
              <label htmlFor={`${uid}-acc`} className="mb-1 block text-sm font-medium text-fg-muted">
                Tài khoản
              </label>
              <Select
                id={`${uid}-acc`}
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)} wrapClassName="w-full">
                {matchingAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>

              {/* Ví khác tệ với khoản nợ: hỏi số THẬT vào ví. Không suy từ tỷ giá thị
                  trường rồi ghi thẳng — tỷ giá của lần trả là do hai bên chốt, chợ chỉ
                  được quyền gợi ý (và ngừng gợi ý ngay khi người dùng gõ tay). */}
              {cross && (
                <div className="mt-3">
                  <span className="mb-1 block text-sm font-medium text-fg-muted">
                    {debt.direction === 'i_owe' ? 'Thực trả từ ví' : 'Thực nhận vào ví'} (
                    {CURRENCIES[accCurrency].label})
                  </span>
                  <MoneyField
                    value={received}
                    onChange={(v) => {
                      setReceived(v)
                      setReceivedTouched(true)
                    }}
                    currency={accCurrency}
                    ariaLabel={debt.direction === 'i_owe' ? 'Thực trả từ ví' : 'Thực nhận vào ví'}
                    onEnter={handleSave}
                    className="w-full rounded-lg border border-border-strong px-3 py-2 text-right text-lg font-semibold"
                  />
                  {rateLine && (
                    // Tỷ giá ngầm của chính hai số vừa gõ — gõ thừa một số 0 thì dòng
                    // này nhảy gấp mười và nhìn là thấy, hai con số rời thì không.
                    <p className="mt-1 text-sm text-fg-muted">Tỷ giá lần này: {rateLine}</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <label htmlFor={`${uid}-note`} className="mb-1 block text-sm font-medium text-fg-muted">
          Ghi chú (không bắt buộc)
        </label>
        <input
          id={`${uid}-note`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Ví dụ: trả đợt 1"
          className="w-full rounded-md border border-border-strong px-3 py-2 text-sm"
        />

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-md px-3 py-2 text-sm text-fg-muted hover:bg-surface-sunken"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className={actionButtonClass('primary')}
          >
            {saving ? 'Đang lưu…' : 'Ghi nhận'}
          </button>
        </div>
      </div>
    </div>
  )
}
