import type { NewCategory, NewDebt, NewDebtPayment, NewTransaction } from '../../data'
import type { CategoryRow, DebtPaymentRow, DebtRow, TransactionRow } from '../../types/database.types'
import type { CurrencyCode } from '../../lib/money'
import type { DebtValue, RemitValue, SplitValue } from './entryRoles'

/**
 * Lưu các vai trò đặc biệt của form Nhập. Logic bê NGUYÊN từ 3 sheet cũ
 * (SplitBillSheet / DebtFormSheet / RemittanceFormSheet) — chỉ đổi nguồn dữ liệu
 * sang field gốc dùng chung. Không đổi hành vi số dư / báo cáo / cờ.
 */

/** Field gốc dùng chung mà các orchestrator cần. */
export interface RoleBase {
  /** minor units theo currency tài khoản nguồn — nghĩa tùy vai trò (tổng/gốc/số gửi). */
  amount: number
  accountId: string
  categoryId: string | null
  srcCurrency: CurrencyCode
  occurredOn: string
  note: string
}

const GUI_TIEN_CAT = 'Gửi tiền về VN'

export interface RoleSaveDeps {
  createTransaction: (input: NewTransaction) => Promise<TransactionRow>
  createDebt: (input: NewDebt) => Promise<DebtRow>
  createDebtPayment: (input: NewDebtPayment) => Promise<DebtPaymentRow>
  deleteTransaction: (id: string) => Promise<unknown>
  createCategory: (input: NewCategory) => Promise<CategoryRow>
  /** Danh mục hiện có — để tìm/tạo "Gửi tiền về VN". */
  categories: { id: string; type: string; name: string }[]
  /** Các khoản nợ hiện có — để cộng dồn khi cho vay/nợ tiếp cùng một người. */
  debts: DebtRow[]
}

/**
 * Trả hộ / chia bill: tách 2 bút toán — (1) chi phần của mình (vào báo cáo), và
 * (2) khoản cho vay phần người khác kèm giải ngân is_debt_flow (trừ số dư, KHÔNG
 * vào báo cáo Chi/Thu). Có bồi hoàn: tạo nợ hỏng thì xóa lại chi của mình.
 */
export async function saveSplit(base: RoleBase, v: SplitValue, deps: RoleSaveDeps): Promise<void> {
  const mine = base.amount - v.others
  const counterparty = v.counterparty.trim()
  let ownTxId: string | null = null
  try {
    if (mine > 0) {
      const ownTx: NewTransaction = {
        type: 'expense',
        amount: mine,
        to_amount: null,
        category_id: base.categoryId,
        account_id: base.accountId,
        to_account_id: null,
        occurred_on: base.occurredOn,
        note: base.note.trim() || `Trả hộ · ${counterparty}`,
      }
      const row = await deps.createTransaction(ownTx)
      ownTxId = row.id
    }
    // Cộng dồn: chọn người đã cho vay (existingDebtId) hoặc gõ trùng tên một khoản
    // owed_to_me đang mở cùng loại tiền → ghi thêm vào khoản đó thay vì tạo người mới.
    const norm = (s: string) => s.trim().toLowerCase()
    const target = deps.debts.find(
      (d) =>
        d.status === 'open' &&
        d.direction === 'owed_to_me' &&
        d.currency === base.srcCurrency &&
        (d.id === v.existingDebtId || (!!counterparty && norm(d.counterparty) === norm(counterparty))),
    )
    const lendTx: NewTransaction = {
      type: 'expense',
      amount: v.others,
      to_amount: null,
      category_id: base.categoryId,
      account_id: base.accountId,
      to_account_id: null,
      occurred_on: base.occurredOn,
      note: base.note.trim() || `Cho vay (trả hộ) · ${counterparty}`,
    }
    if (target) {
      // amount âm = giải ngân thêm → làm tăng số còn lại của khoản cho vay.
      await deps.createDebtPayment({
        debt_id: target.id,
        amount: -v.others,
        paid_on: base.occurredOn,
        note: base.note.trim(),
        transaction: lendTx,
      })
    } else {
      await deps.createDebt({
        counterparty,
        direction: 'owed_to_me',
        currency: base.srcCurrency,
        principal: v.others,
        due_on: null,
        note: base.note.trim(),
        transaction: lendTx,
      })
    }
  } catch (e) {
    if (ownTxId) {
      try {
        await deps.deleteTransaction(ownTxId)
      } catch {
        /* để nguyên: người dùng có thể xóa tay nếu cần */
      }
    }
    throw e
  }
}

/**
 * Ghi nợ / cho vay: tạo bản ghi nợ, tùy chọn kèm giải ngân thật.
 * Cho vay (owed_to_me) = chi; Mình nợ (i_owe) = thu. Currency lấy theo tài khoản gốc.
 */
export async function saveDebtEntry(
  base: RoleBase,
  v: DebtValue,
  deps: RoleSaveDeps,
): Promise<void> {
  const counterparty = v.counterparty.trim()
  const txType = v.direction === 'owed_to_me' ? 'expense' : 'income'

  // Cộng dồn: nếu chọn người cũ (existingDebtId) hoặc gõ trùng tên một khoản đang
  // mở cùng chiều + cùng loại tiền → ghi thêm vào khoản đó thay vì tạo người mới.
  const norm = (s: string) => s.trim().toLowerCase()
  const target = deps.debts.find(
    (d) =>
      d.status === 'open' &&
      d.direction === v.direction &&
      d.currency === base.srcCurrency &&
      (d.id === v.existingDebtId || (!!counterparty && norm(d.counterparty) === norm(counterparty))),
  )
  if (target) {
    let addTx: NewTransaction | null = null
    if (v.withTransaction) {
      addTx = {
        type: txType,
        amount: base.amount,
        to_amount: null,
        category_id: base.categoryId,
        account_id: base.accountId,
        to_account_id: null,
        occurred_on: base.occurredOn,
        note:
          base.note.trim() ||
          `${txType === 'expense' ? 'Cho vay thêm' : 'Vay thêm'} · ${target.counterparty}`,
      }
    }
    // amount âm = giải ngân thêm → làm tăng số còn lại của khoản nợ.
    await deps.createDebtPayment({
      debt_id: target.id,
      amount: -base.amount,
      paid_on: base.occurredOn,
      note: base.note.trim(),
      transaction: addTx,
    })
    return
  }

  let transaction: NewTransaction | null = null
  if (v.withTransaction) {
    transaction = {
      type: txType,
      amount: base.amount,
      to_amount: null,
      category_id: base.categoryId,
      account_id: base.accountId,
      to_account_id: null,
      occurred_on: base.occurredOn,
      note: base.note.trim() || `${txType === 'expense' ? 'Cho vay' : 'Vay'} · ${counterparty}`,
    }
  }
  const pct = Number(v.interestPct)
  const term = Number(v.termMonths)
  await deps.createDebt({
    counterparty,
    direction: v.direction,
    currency: base.srcCurrency,
    principal: base.amount,
    due_on: v.dueOn || null,
    note: base.note.trim(),
    interest_bps: v.interestPct.trim() && !Number.isNaN(pct) ? Math.round(pct * 100) : null,
    term_months: v.termMonths.trim() && !Number.isNaN(term) && term > 0 ? Math.round(term) : null,
    transaction,
  })
}

/**
 * Gửi tiền về VN: một giao dịch (transfer JPY→VND hoặc expense) gắn cờ is_remittance.
 * amount = số gửi + phí. Expense tự tìm/tạo danh mục "Gửi tiền về VN".
 */
export async function saveRemit(base: RoleBase, v: RemitValue, deps: RoleSaveDeps): Promise<void> {
  const amount = base.amount + v.fee
  const trimmedNote = base.note.trim() || 'Gửi tiền về VN'
  let input: NewTransaction
  if (v.kind === 'transfer') {
    input = {
      type: 'transfer',
      amount,
      to_amount: v.received,
      category_id: null,
      account_id: base.accountId,
      to_account_id: v.destId,
      occurred_on: base.occurredOn,
      note: trimmedNote,
      is_remittance: true,
      remit_service: v.service,
      remit_fee_jpy: v.fee,
      remit_received_vnd: v.received,
    }
  } else {
    const found = deps.categories.find((c) => c.type === 'expense' && c.name === GUI_TIEN_CAT)
    const categoryId =
      found?.id ??
      (await deps.createCategory({ name: GUI_TIEN_CAT, type: 'expense', icon: '💸', parent_id: null }))
        .id
    input = {
      type: 'expense',
      amount,
      to_amount: null,
      category_id: categoryId,
      account_id: base.accountId,
      to_account_id: null,
      occurred_on: base.occurredOn,
      note: trimmedNote,
      is_remittance: true,
      remit_service: v.service,
      remit_fee_jpy: v.fee,
      remit_received_vnd: v.received,
    }
  }
  await deps.createTransaction(input)
}
