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

/** Danh mục nhận mọi khoản PHÍ tài chính (phí chuyển khoản, phí cho vay…). */
const PHI_CAT = 'Tài chính'
/** Tên cũ trước migration 0030 — người dùng chưa áp migration vẫn dùng lại được. */
const PHI_CAT_LEGACY = 'Tài chính & Đầu tư'
/** Danh mục THU nhận phần đưa dư của Trả hộ (seed có sẵn "Khác" 💵). */
const THU_KHAC_CAT = 'Khác'

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
 * Id danh mục "Tài chính". Ưu tiên tên mới, chấp nhận tên cũ "Tài chính & Đầu tư"
 * (DB chưa áp migration 0030), cuối cùng mới tạo mới — giống cách saveRemit lo
 * danh mục "Gửi tiền về VN".
 */
async function feeCategoryId(deps: RoleSaveDeps): Promise<string> {
  const expense = deps.categories.filter((c) => c.type === 'expense')
  const found =
    expense.find((c) => c.name === PHI_CAT) ?? expense.find((c) => c.name === PHI_CAT_LEGACY)
  if (found) return found.id
  const created = await deps.createCategory({
    name: PHI_CAT,
    type: 'expense',
    icon: '🏦',
    parent_id: null,
  })
  return created.id
}

/**
 * Danh mục cho giao dịch giải ngân của vai trò nợ — tự tìm/tạo, KHÔNG bắt người
 * dùng chọn: giao dịch mang cờ is_debt_flow nên không vào báo cáo Thu/Chi, bắt
 * chọn "Lương/Thưởng" khi đi vay chỉ gây hiểu lầm. Chi = "Cho vay", thu = "Đi vay".
 */
async function debtCategoryId(
  direction: 'owed_to_me' | 'i_owe',
  deps: RoleSaveDeps,
): Promise<string> {
  const type = direction === 'owed_to_me' ? 'expense' : 'income'
  const name = direction === 'owed_to_me' ? 'Cho vay' : 'Đi vay'
  const found = deps.categories.find((c) => c.type === type && c.name === name)
  if (found) return found.id
  const created = await deps.createCategory({ name, type, icon: '🤝', parent_id: null })
  return created.id
}

/** Id danh mục thu "Khác" — tìm trước, chưa có mới tạo (như feeCategoryId). */
async function otherIncomeCategoryId(deps: RoleSaveDeps): Promise<string> {
  const found = deps.categories.find((c) => c.type === 'income' && c.name === THU_KHAC_CAT)
  if (found) return found.id
  const created = await deps.createCategory({
    name: THU_KHAC_CAT,
    type: 'income',
    icon: '💵',
    parent_id: null,
  })
  return created.id
}

/**
 * Ghi phí thành MỘT GIAO DỊCH CHI RIÊNG vào danh mục "Tài chính" — thấy được
 * trong Sổ GD, vào báo cáo và ngân sách, sửa/xóa độc lập với giao dịch gốc.
 * Trừ vào chính tài khoản nguồn, cùng ngày. Trả về id để hoàn tác khi bút toán
 * chính hỏng. fee <= 0 = không có phí, không tạo gì.
 */
async function createFeeTx(
  fee: number,
  accountId: string,
  occurredOn: string,
  note: string,
  deps: RoleSaveDeps,
): Promise<string | null> {
  if (fee <= 0) return null
  const row = await deps.createTransaction({
    type: 'expense',
    amount: fee,
    to_amount: null,
    category_id: await feeCategoryId(deps),
    account_id: accountId,
    to_account_id: null,
    occurred_on: occurredOn,
    note,
  })
  return row.id
}

/** Xóa bút toán phí đã tạo khi phần chính hỏng. Nuốt lỗi xóa: đã ở nhánh lỗi rồi. */
async function undoFeeTx(feeTxId: string | null, deps: RoleSaveDeps): Promise<void> {
  if (!feeTxId) return
  try {
    await deps.deleteTransaction(feeTxId)
  } catch {
    /* để nguyên: người dùng có thể xóa tay nếu cần */
  }
}

/**
 * Chuyển khoản kèm phí: giao dịch chính (chuyển khoản) + một giao dịch chi riêng
 * cho phí. Tạo phí TRƯỚC vì nó đơn giản, dễ hoàn tác; chính hỏng thì xóa phí đi
 * để không còn phí lơ lửng không gắn với lần chuyển nào.
 */
export async function saveWithFee(
  main: NewTransaction,
  fee: number,
  feeNote: string,
  deps: RoleSaveDeps,
): Promise<void> {
  const feeTxId = await createFeeTx(fee, main.account_id, main.occurred_on, feeNote, deps)
  try {
    await deps.createTransaction(main)
  } catch (e) {
    await undoFeeTx(feeTxId, deps)
    throw e
  }
}

/**
 * Trả hộ / chia bill. Hai nhánh theo `settle`:
 *
 * - `now` (đã đưa lại tiền ngay) → KHÔNG có khoản nợ nào. Xem `saveSplitSettled`.
 * - `later` (còn nợ) → tách 2 bút toán: (1) chi phần của mình (vào báo cáo), và
 *   (2) khoản cho vay phần người khác kèm giải ngân is_debt_flow (trừ số dư,
 *   KHÔNG vào báo cáo Chi/Thu). Có bồi hoàn: tạo nợ hỏng thì xóa lại chi của mình.
 */
export async function saveSplit(base: RoleBase, v: SplitValue, deps: RoleSaveDeps): Promise<void> {
  if (v.settle === 'now') return saveSplitSettled(base, v, deps)
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
 * Trả hộ đã được hoàn tiền NGAY → không tạo khoản nợ nào (nó chưa từng tồn tại).
 * Sinh tối đa 3 bút toán:
 *
 *   1. Chi phần của mình (tổng − phần người kia, nếu còn) → chỉ số này vào báo cáo Chi.
 *   2. Nếu tiền về VÍ KHÁC: chuyển khoản phần người kia (tối đa bằng tổng),
 *      tài khoản đã trả → ví đó.
 *   3. Người kia đưa DƯ (nhiều hơn tổng): phần dư thành khoản THU "Khác" vào ví nhận.
 *
 * Bút toán (2) là thứ giữ số dư nguồn đúng: quẹt thẻ 10.000 rồi nhận lại 3.000
 * tiền mặt thì thẻ phải trừ đủ 10.000 (khớp sao kê, khớp số tự trả thẻ cuối kỳ),
 * còn 3.000 nằm ở ví tiền mặt. Chuyển khoản không tính vào Chi/Thu nên Chi vẫn là
 * 7.000. Tiền về CHÍNH tài khoản đã trả → không sinh gì (ra vào cùng chỗ, triệt tiêu).
 * Chuyển khoản chỉ chở tối đa bằng TỔNG — phần dư đi bằng dòng thu (3), nếu không
 * tài khoản đã trả sẽ bị trừ lố hơn số thật sự quẹt.
 *
 * Có bồi hoàn: một bút toán hỏng thì xóa lại các bút toán đã tạo trước nó.
 */
async function saveSplitSettled(
  base: RoleBase,
  v: SplitValue,
  deps: RoleSaveDeps,
): Promise<void> {
  const mine = base.amount - v.others // < 0 = người kia đưa dư
  const excess = Math.max(-mine, 0)
  const backAmount = Math.min(v.others, base.amount)
  const who = v.counterparty.trim()
  // '' hoặc trùng tài khoản nguồn = tiền về đúng chỗ đã trả → không cần chuyển khoản.
  const backTo =
    v.receivedAccountId && v.receivedAccountId !== base.accountId ? v.receivedAccountId : null
  const createdIds: string[] = []
  try {
    if (mine > 0) {
      const row = await deps.createTransaction({
        type: 'expense',
        amount: mine,
        to_amount: null,
        category_id: base.categoryId,
        account_id: base.accountId,
        to_account_id: null,
        occurred_on: base.occurredOn,
        note: base.note.trim() || (who ? `Chia bill · ${who}` : 'Chia bill'),
      })
      createdIds.push(row.id)
    }
    if (backAmount > 0 && backTo) {
      const row = await deps.createTransaction({
        type: 'transfer',
        amount: backAmount,
        to_amount: null,
        category_id: null,
        account_id: base.accountId,
        to_account_id: backTo,
        occurred_on: base.occurredOn,
        note: who ? `Hoàn phần trả hộ · ${who}` : 'Hoàn phần trả hộ',
      })
      createdIds.push(row.id)
    }
    if (excess > 0) {
      await deps.createTransaction({
        type: 'income',
        amount: excess,
        to_amount: null,
        category_id: await otherIncomeCategoryId(deps),
        account_id: backTo ?? base.accountId,
        to_account_id: null,
        occurred_on: base.occurredOn,
        note: who ? `Trả hộ nhận dư · ${who}` : 'Trả hộ nhận dư',
      })
    }
  } catch (e) {
    for (const id of createdIds.reverse()) {
      try {
        await deps.deleteTransaction(id)
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
  const who = v.counterparty.trim()
  const feeTxId = await createFeeTx(
    v.fee,
    base.accountId,
    base.occurredOn,
    who ? `Phí · ${who}` : 'Phí giao dịch',
    deps,
  )
  try {
    await saveDebtCore(base, v, deps)
  } catch (e) {
    await undoFeeTx(feeTxId, deps)
    throw e
  }
}

async function saveDebtCore(base: RoleBase, v: DebtValue, deps: RoleSaveDeps): Promise<void> {
  const counterparty = v.counterparty.trim()
  const txType = v.direction === 'owed_to_me' ? 'expense' : 'income'
  // Danh mục tự gán cho giải ngân — form không hỏi nữa (base.categoryId bị bỏ qua).
  const categoryId = v.withTransaction ? await debtCategoryId(v.direction, deps) : null

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
        category_id: categoryId,
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
      category_id: categoryId,
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
