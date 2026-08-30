import { useEffect, useId } from 'react'
import { MoneyField } from '../../components/MoneyField'
import { CURRENCIES, formatMoney, type CurrencyCode } from '../../lib/money'
import { convertBetween, formatRateLine, type Rates } from '../../lib/rates'
import { impliedRate } from '../debts/crossPayment'
import type { DebtDirection, DebtPaymentRow, DebtRow } from '../../types/database.types'
import { openDebtsFor, prefillFor } from './debtPick'
import { blockCls, labelCls } from './roleFields'
import type { PaymentValue } from './roleSave'
import { Select } from '../../components/ui'

interface Props {
  value: PaymentValue
  /** `prefillAmount` = số còn lại của khoản vừa chọn — TransactionForm điền vào ô số tiền. */
  onChange: (next: PaymentValue, prefillAmount?: number) => void
  debts: DebtRow[]
  payments: DebtPaymentRow[]
  /** Chiều khoản nợ mà dạng này trả: repay → i_owe, collect → owed_to_me. */
  direction: DebtDirection
  /** Tệ của VÍ đang chọn — ô số tiền lớn của form đọc theo tệ này, không theo tệ nợ. */
  accountCurrency: CurrencyCode
  /** Số đang có ở ô tiền lớn (tệ ví) — để đọc ra tỷ giá ngầm của lần trả. */
  amount: number
  base: CurrencyCode
  rates: Rates
}

/**
 * Chọn khoản nợ để trả (Tôi trả nợ) / thu lại (Người trả lại) — DẠNG DUY NHẤT của
 * form Nhập có field phụ thuộc nhau: chọn nợ ở đây xếp lại danh sách ví bên ngoài
 * (ví cùng tệ lên trước — xem accountsForDebt). Mọi lọc/xếp nằm ở debtPick.ts,
 * component ở đây chỉ bày ra.
 *
 * Ví KHÁC tệ với khoản nợ vẫn chọn được (nợ ¥ mà trả bằng ₫ vào tài khoản Việt Nam
 * là ca thật, không phải ca hiếm) — khi đó khối này mọc thêm ô "xoá bao nhiêu nợ".
 */
export function DebtPickerField({
  value,
  onChange,
  debts,
  payments,
  direction,
  accountCurrency,
  amount,
  base,
  rates,
}: Props) {
  const uid = useId()
  const open = openDebtsFor(debts, payments, direction)
  const picked = open.find((d) => d.id === value.debtId)
  /** Ví khác tệ với khoản nợ → lần trả mang HAI số, phải hỏi cả hai. */
  const cross = !!picked && picked.currency !== accountCurrency

  // Đổi VÍ sang tệ khác SAU khi đã chọn khoản nợ: gieo lại đúng như lúc chọn khoản nợ.
  //
  // Ô tiền lớn phải gieo lại theo, KHÔNG được giữ số cũ: nó đang mang 30.000 vì trước
  // đó ví là ¥, đổi sang ví ₫ thì đúng con số ấy hoá thành "30.000 ₫" — cùng chữ số,
  // khác đơn vị, và dòng tỷ giá đọc ra "¥1 = 1 ₫". Đây KHÔNG phải đạp lên số người
  // dùng gõ: đơn vị của ô vừa đổi dưới chân nó nên số cũ không còn nghĩa gì.
  //
  // Chiều ngược lại (về cùng tệ) xoá `debtAmount` để lần đổi sau còn gieo lại được.
  // TransactionForm vẫn xoá một lần nữa ở cổng nộp — lưới an toàn, không phải chỗ quyết.
  useEffect(() => {
    if (cross && picked && value.debtAmount == null) {
      onChange(
        { ...value, debtAmount: picked.remaining },
        convertBetween(picked.remaining, picked.currency, accountCurrency, base, rates) ??
          undefined,
      )
    } else if (!cross && value.debtAmount != null) {
      // Về cùng tệ: ô tiền lớn cũng đang mang số của tệ CŨ, gieo lại số còn lại.
      onChange({ ...value, debtAmount: null }, picked?.remaining)
    }
  }, [cross, picked, value, onChange, accountCurrency, base, rates])

  // Không có khoản nợ nào đang mở → nói ra, đừng để ô chọn rỗng (cùng nếp với
  // nhánh "Chưa có tài khoản JPY" khi remitLike hết ví — một câu cảnh báo còn hơn
  // một <Select> trống không bấm được gì).
  if (open.length === 0) {
    return (
      <div className={blockCls('debt')}>
        <p className="rounded-lg bg-state-warn-bg px-3 py-2 text-sm text-state-warn-fg">
          Chưa có khoản nợ nào đang mở ở chiều này. Ghi &quot;Cho vay&quot; hoặc &quot;Vay
          được&quot; trước.
        </p>
      </div>
    )
  }

  return (
    <div className={blockCls('debt')}>
      <div>
        <label htmlFor={`${uid}-debt`} className={labelCls}>
          Khoản nợ nào
        </label>
        {/* Mỗi dòng nói CÒN LẠI bao nhiêu, không phải số gốc — người chọn cần biết
            đang trả/thu vào đâu, số gốc đã trả một phần thì không còn đúng nữa. */}
        <Select
          id={`${uid}-debt`}
          value={value.debtId}
          onChange={(e) => {
            const id = e.target.value
            // Điền sẵn TOÀN BỘ số còn lại: trả đủ là ca thường, và DebtPaymentSheet
            // (đường vào thứ nhất) cũng mặc định vậy — hai đường vào cùng một vật thì
            // phải cùng một nếp, không thì người dùng học một cái rồi bị cái kia lừa.
            const remaining = prefillFor(debts, payments, id)
            const cur = open.find((d) => d.id === id)?.currency
            const crossNow = !!cur && cur !== accountCurrency
            // Khác tệ: số còn lại là tiền của KHOẢN NỢ (¥) nên nó đi vào ô "xoá bao
            // nhiêu nợ", còn ô tiền lớn (tệ ví) chỉ nhận số GỢI Ý theo tỷ giá thị
            // trường — người dùng sẽ sửa lại thành số thật đã nhận.
            onChange(
              { ...value, debtId: id, debtAmount: crossNow ? remaining : null },
              (crossNow && remaining != null && cur
                ? convertBetween(remaining, cur, accountCurrency, base, rates)
                : remaining) ?? undefined,
            )
          }}
          wrapClassName="w-full"
        >
          <option value="">— chọn —</option>
          {open.map((d) => (
            <option key={d.id} value={d.id}>
              {d.counterparty} · còn {formatMoney(d.remaining, d.currency)}
            </option>
          ))}
        </Select>
        {picked && (
          <p className="mt-1 text-sm text-fg-accent">
            {direction === 'i_owe' ? 'Mình trả' : 'Người ta trả'} · còn{' '}
            {formatMoney(picked.remaining, picked.currency)}
          </p>
        )}
      </div>

      {/* Trả xuyên tệ: nợ ghi bằng tệ này, tiền lại đi qua ví tệ khác (nợ ¥ mà trả
          bằng ₫ vào tài khoản Việt Nam). Ô tiền lớn phía trên giữ số THẬT vào/ra ví;
          ô dưới đây nói lần trả này xoá bao nhiêu khỏi SỔ NỢ. Hai số hai chỗ, và tỷ
          giá giữa chúng là do hai bên chốt — app chỉ gợi ý lúc chọn khoản nợ, không
          tự sửa về sau. */}
      {cross && picked && (
        <div>
          <span className={labelCls}>Xoá bao nhiêu nợ ({CURRENCIES[picked.currency].label})</span>
          <MoneyField
            value={value.debtAmount ?? 0}
            onChange={(v) => onChange({ ...value, debtAmount: v })}
            currency={picked.currency}
            ariaLabel="Xoá bao nhiêu nợ"
            className="w-full rounded-lg border border-border-strong px-3 py-2 text-right text-lg font-semibold"
          />
          {(() => {
            // Tỷ giá ngầm của chính hai số đang gõ — gõ thừa một số 0 thì dòng này
            // nhảy gấp mười và nhìn là thấy ngay, hai con số rời thì không.
            const line = formatRateLine(
              picked.currency,
              accountCurrency,
              impliedRate(value.debtAmount ?? 0, picked.currency, amount, accountCurrency) ?? 0,
            )
            return line ? <p className="mt-1 text-sm text-fg-muted">Tỷ giá lần này: {line}</p> : null
          })()}
        </div>
      )}

      {/* Công tắc tạo giao dịch thật — cùng khuôn với DebtFields/DebtPaymentSheet. */}
      <div className="rounded-lg bg-surface/70 p-2.5">
        <label className="flex cursor-pointer items-center justify-between gap-2 text-sm text-fg-secondary">
          <span>
            Có chuyển tiền thật
            {/* KHÔNG bọc <Guide> — hệ quả của công tắc, không phải chữ dạy. Xem chú thích
                dài ở roleFields.tsx, cùng một câu và cùng một lý do. */}
            <span className="block text-sm text-fg-muted">
              {direction === 'i_owe'
                ? 'Tạo giao dịch chi (trừ số dư tài khoản)'
                : 'Tạo giao dịch thu (cộng số dư tài khoản)'}
            </span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={value.withTransaction}
            aria-label="Có chuyển tiền thật"
            onClick={() => onChange({ ...value, withTransaction: !value.withTransaction })}
            // Vùng chạm 44×44 ở nút, đường ray 24×44 ở <span> trong — cùng khuôn với các
            // công tắc khác trong app (ray đặt thẳng lên nút thì chỉ cao 24px).
            className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center"
          >
            <span
              className={`relative block h-6 w-11 rounded-full transition ${
                value.withTransaction ? 'bg-accent' : 'bg-gray-300 dark:bg-gray-600'
              }`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                  value.withTransaction ? 'left-[22px]' : 'left-0.5'
                }`}
              />
            </span>
          </button>
        </label>
      </div>
    </div>
  )
}
