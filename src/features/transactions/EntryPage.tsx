import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Check, ChevronLeft, ChevronRight, TriangleAlert } from 'lucide-react'
import { BackLink } from '../../components/BackLink'
import {
  useBudgetAlert,
  useCategories,
  useCreateCategory,
  useCreateDebt,
  useCreateDebtPayment,
  useCreateRecurringRule,
  useCreateTransaction,
  useDebts,
  useCreatePlannedExpense,
  useDeleteTransaction,
  usePlannedExpenses,
  useRecurringRules,
  useUpdatePlannedExpense,
  useRunRecurringCatchUp,
  useUpdateRecurringRule,
} from '../../hooks/queries'
import { toISODate } from '../../lib/dates'
import { showUndoToast } from '../../lib/undoToast'
import type { TransactionRow, TransactionType } from '../../types/database.types'
import { parseRoleParam } from './entryRoles'
import { saveDebtEntry, saveRemit, saveSplit, saveWithFee, type RoleSaveDeps } from './roleSave'
import { TransactionForm, type RoleSubmit } from './TransactionForm'

/** Màn hình mặc định khi mở app — nhập một giao dịch phải < 5 giây. */
export function EntryPage() {
  const navigate = useNavigate()
  const create = useCreateTransaction()
  const del = useDeleteTransaction()
  const createDebt = useCreateDebt()
  const createDebtPayment = useCreateDebtPayment()
  const createCat = useCreateCategory()
  const { data: categories = [] } = useCategories()
  const { data: debts = [] } = useDebts()
  const createRule = useCreateRecurringRule()
  const catchUp = useRunRecurringCatchUp()
  const { overCount } = useBudgetAlert()
  const [searchParams] = useSearchParams()
  const qType = searchParams.get('type')
  const initialType: TransactionType | undefined =
    qType === 'income' || qType === 'expense' ? qType : undefined
  const initialRole = parseRoleParam(searchParams.get('role'))

  // --- Ghi một khoản định kỳ kiểu NHẮC (migration 0037) ---
  // `?rule=<id>&on=<kỳ>`: mở form đã điền sẵn theo quy tắc, và khi lưu xong thì đẩy
  // con trỏ `last_generated_on` sang đúng kỳ đó. Hai việc phải đi liền nhau — ghi mà
  // không đẩy con trỏ thì lời nhắc còn nguyên, đẩy mà không ghi thì mất khoản chi.
  const billRuleId = searchParams.get('rule')
  const billDueISO = searchParams.get('on')
  const { data: recurringRules = [], isPending: rulesPending } = useRecurringRules()
  const updateRule = useUpdateRecurringRule()
  const billRule = billRuleId ? recurringRules.find((r) => r.id === billRuleId) : undefined
  // Điền sẵn bằng một TransactionRow giả — TransactionForm chỉ đọc `initial` để gieo
  // giá trị ban đầu, và không có `onSubmitRecurring` nên nó cũng không hiện lại ô
  // "Lặp lại" (khoản này ĐÃ là một quy tắc rồi).
  const billPrefill: TransactionRow | undefined =
    billRule && billDueISO
      ? {
          id: '',
          user_id: '',
          type: billRule.type,
          amount: billRule.amount,
          to_amount: billRule.to_amount,
          category_id: billRule.category_id,
          account_id: billRule.account_id,
          to_account_id: billRule.to_account_id,
          recurring_rule_id: null,
          // Ngày mặc định là NGÀY ĐẾN HẠN, không phải hôm nay: khoản quá hạn 3 tháng
          // mà ghi vào hôm nay thì tháng đó trong báo cáo thiếu, tháng này thừa.
          occurred_on: billDueISO,
          note: billRule.note,
          created_at: '',
          updated_at: '',
        }
      : undefined

  // TransactionForm gieo state trong useState (chạy MỘT lần), nên `initial` tới muộn
  // là không vào nữa: form sẽ hiện trống với ngày hôm nay, người dùng ghi nhầm kỳ mà
  // không biết. Có `?rule=` thì phải đợi danh sách quy tắc về rồi mới dựng form.
  const waitingForRule = !!billRuleId && rulesPending

  // --- Ghi một KHOẢN SẮP CHI (migration 0038) ---
  // `?planned=<id>`: mở form đã điền sẵn; lưu xong thì đánh dấu khoản đó là đã chi và
  // gắn vào đúng bút toán vừa tạo.
  const plannedId = searchParams.get('planned')
  const { data: plannedRows = [], isPending: plannedPending } = usePlannedExpenses()
  const createPlanned = useCreatePlannedExpense()
  const updatePlanned = useUpdatePlannedExpense()
  const planned = plannedId ? plannedRows.find((p) => p.id === plannedId) : undefined
  const plannedPrefill: TransactionRow | undefined = planned
    ? {
        id: '',
        user_id: '',
        type: 'expense',
        amount: planned.amount,
        to_amount: null,
        category_id: planned.category_id,
        account_id: planned.account_id ?? '',
        to_account_id: null,
        recurring_rule_id: null,
        // HÔM NAY, không phải ngày đến hạn: ngày đến hạn là một KẾ HOẠCH, còn cái đang
        // ghi là lúc tiền thật sự rời ví. (Khác khoản định kỳ kiểu nhắc — ở đó kỳ nào
        // ra kỳ đó mới đúng báo cáo tháng.)
        occurred_on: toISODate(new Date()),
        note: planned.title,
        created_at: '',
        updated_at: '',
      }
    : undefined
  const waitingForPlanned = !!plannedId && plannedPending

  /** Đánh dấu khoản sắp chi là đã chi. Gọi SAU khi giao dịch đã lưu thành công. */
  async function markPlannedDone(transactionId: string) {
    if (!planned) return
    await updatePlanned.mutateAsync({
      id: planned.id,
      patch: { status: 'done', transaction_id: transactionId },
    })
  }

  /** Đẩy con trỏ sang kỳ vừa ghi. Gọi SAU khi giao dịch đã lưu thành công. */
  async function markBillDone() {
    if (!billRule || !billDueISO) return
    await updateRule.mutateAsync({
      id: billRule.id,
      patch: { last_generated_on: billDueISO },
    })
  }
  const [toast, setToast] = useState<{ text: string; undoId?: string; ok?: boolean } | null>(null)
  /** Ô bên phải tiêu đề: chỗ TransactionForm portal nút "Loại đặc biệt" vào. */
  const [roleSlot, setRoleSlot] = useState<HTMLDivElement | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => () => clearTimeout(toastTimer.current), [])

  async function handleUndo(id: string) {
    clearTimeout(toastTimer.current)
    // try/catch: hoàn tác hỏng (offline…) mà không bắt thì unhandled rejection và
    // KHÔNG toast gì cả — người dùng tưởng đã hoàn tác. Toast lỗi chi tiết đã có
    // MutationCache.onError toàn cục lo; ở đây chỉ cần đừng hiện "Đã hoàn tác" sai.
    try {
      await del.mutateAsync(id)
    } catch {
      return
    }
    setToast({ text: 'Đã hoàn tác' })
    toastTimer.current = setTimeout(() => setToast(null), 1500)
  }

  function roleDeps(): RoleSaveDeps {
    return {
      createTransaction: (i) => create.mutateAsync(i),
      createDebt: (i) => createDebt.mutateAsync(i),
      createDebtPayment: (i) => createDebtPayment.mutateAsync(i),
      deleteTransaction: (id) => del.mutateAsync(id),
      createCategory: (i) => createCat.mutateAsync(i),
      categories,
      debts,
    }
  }

  // Lưu một vai trò đặc biệt (Trả hộ / Cho vay-Nợ / Gửi về VN) rồi về Sổ GD.
  // Các vai trò có thể tạo nhiều bút toán → không kèm Hoàn tác một chạm (điểm G).
  async function handleRole(payload: RoleSubmit) {
    const deps = roleDeps()
    if (payload.role === 'split') await saveSplit(payload.base, payload.value, deps)
    else if (payload.role === 'debt') await saveDebtEntry(payload.base, payload.value, deps)
    else await saveRemit(payload.base, payload.value, deps)
    navigate('/')
  }

  return (
    <div className="mx-auto flex h-dvh w-full max-w-2xl flex-col overflow-hidden px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:h-dvh lg:p-6">
      <div className="mb-2 flex items-center gap-2">
        {/* "Đóng" = bỏ dở màn nhập → trả người dùng về đúng chỗ họ bấm "+", chứ không
            phải luôn luôn về Sổ (nút này mở được từ Nợ, Sắp chi, thông báo…). */}
        <BackLink
          to="/"
          aria-label="Đóng, quay lại trang trước"
          className="flex min-h-11 items-center gap-1 rounded-lg bg-surface px-3 py-1.5 text-sm text-fg-secondary shadow-sm transition active:scale-95"
        >
          <ChevronLeft className="h-5 w-5" /> Đóng
        </BackLink>
        <h1 className="flex-1 text-center text-base font-bold text-fg-primary">
          {billRule || planned ? 'Ghi khoản đến hạn' : 'Nhập giao dịch'}
        </h1>
        {/* Nút "Loại đặc biệt" do TransactionForm portal vào đây. Chiều rộng đặt cứng
            (xấp xỉ nút "Đóng" bên trái) để tiêu đề không nhảy chỗ khi nút ẩn đi lúc
            một vai trò đang bật. */}
        <div ref={setRoleSlot} className="flex w-[84px] shrink-0 justify-end" />
      </div>
      {overCount > 0 && (
        <Link
          to="/budget"
          className="mb-2 flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-900/30 px-3 py-2 text-xs font-medium text-money-out"
        >
          <TriangleAlert className="h-4 w-4" /> {overCount} danh mục vượt ngân sách tháng này — xem chi tiết
          <ChevronRight className="inline h-4 w-4" />
        </Link>
      )}
      {waitingForRule || waitingForPlanned ? (
        <p className="py-10 text-center text-sm text-fg-muted">Đang tải khoản đến hạn…</p>
      ) : (
      <TransactionForm
        // Khoá theo kỳ: mở lời nhắc khác trong cùng một lần vào màn (từ chuông sang
        // chuông) phải gieo lại form, không giữ số của kỳ trước.
        key={
          billRule && billDueISO
            ? `bill-${billRule.id}-${billDueISO}`
            : planned
              ? `planned-${planned.id}`
              : 'new'
        }
        submitLabel={billRule || planned ? 'Ghi và đánh dấu đã chi' : 'Lưu'}
        // Khoản đến hạn KHÔNG có "Tiếp tục": nút đó lưu rồi ở lại nhập tiếp, mà con
        // trỏ kỳ chỉ được đẩy ở nhánh "Lưu" — bấm nhầm là ghi xong mà lời nhắc vẫn
        // còn nguyên. Xác nhận một khoản là việc một lần, không phải nhập liên tục.
        continueLabel={billRule || planned ? undefined : 'Tiếp tục'}
        initial={billPrefill ?? plannedPrefill}
        initialType={initialType}
        enableTemplates
        enableRoles
        initialRole={initialRole}
        roleTriggerSlot={roleSlot}
        onSubmitRole={handleRole}
        // Chuyển khoản có phí: 2 bút toán → không kèm Hoàn tác một chạm (như vai trò)
        onSubmitWithFee={async (main, fee, keepGoing) => {
          await saveWithFee(main, fee, 'Phí chuyển khoản', roleDeps())
          if (!keepGoing) {
            navigate('/')
            return
          }
          setToast({ text: 'Đã lưu (kèm phí)', ok: true })
          clearTimeout(toastTimer.current)
          toastTimer.current = setTimeout(() => setToast(null), 5000)
        }}
        // Lưu: ghi giao dịch rồi quay về Sổ GD
        onSubmit={async (values) => {
          const row = await create.mutateAsync(values)
          await markBillDone()
          await markPlannedDone(row.id)
          // Hoàn tác cho cả nút "Lưu", không chỉ nút "Tiếp tục": cùng một hành động ghi
          // thì phải cùng một mức an toàn. Dùng toast hoàn tác TOÀN CỤC (AppLayout vẽ)
          // vì nút này rời màn hình ngay — toast riêng của trang Nhập sẽ chết theo.
          // Trừ khoản đến hạn: xóa giao dịch xong thì lời nhắc vẫn bị đánh dấu đã chi,
          // hoàn tác kiểu đó để lại một trạng thái sai.
          if (!billRule && !planned) {
            showUndoToast('Đã lưu giao dịch', () => del.mutateAsync(row.id).then(() => {}))
          }
          navigate('/')
        }}
        // "Nhắc sau": chưa chi đồng nào, chỉ tạo một khoản sắp chi rồi về Sổ.
        onSubmitPlanned={async (input) => {
          await createPlanned.mutateAsync(input)
          setToast({ text: 'Đã tạo lời nhắc', ok: true })
          clearTimeout(toastTimer.current)
          toastTimer.current = setTimeout(() => {
            setToast(null)
            navigate('/planned')
          }, 1000)
        }}
        // Tiếp tục: ghi giao dịch, hiện toast (kèm hoàn tác) rồi ở lại nhập tiếp
        onContinue={billRule || planned ? undefined : async (values) => {
          const row = await create.mutateAsync(values)
          setToast({ text: 'Đã lưu', undoId: row.id, ok: true })
          clearTimeout(toastTimer.current)
          toastTimer.current = setTimeout(() => setToast(null), 5000)
        }}
        // Lặp lại: tạo rule + sinh ngay kỳ đến hạn, toast rồi về Sổ GD
        onSubmitRecurring={async (rule) => {
          await createRule.mutateAsync(rule)
          await catchUp.mutateAsync()
          setToast({ text: 'Đã tạo quy tắc định kỳ', ok: true })
          clearTimeout(toastTimer.current)
          toastTimer.current = setTimeout(() => {
            setToast(null)
            navigate('/')
          }, 1200)
        }}
      />
      )}
      {toast && (
        <div className="fixed inset-x-0 top-4 z-50 flex justify-center">
          <div className="flex items-center gap-3 rounded-full bg-gray-900/90 px-4 py-2 text-sm font-medium text-white shadow-lg">
            <span className="flex items-center gap-1.5">
              {toast.ok && <Check className="h-4 w-4" />}
              {toast.text}
            </span>
            {toast.undoId && (
              <button
                type="button"
                onClick={() => handleUndo(toast.undoId!)}
                className="rounded-full bg-white/20 px-2 py-0.5 text-white active:scale-95"
              >
                Hoàn tác
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
