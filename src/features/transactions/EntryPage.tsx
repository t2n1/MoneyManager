import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Check, ChevronLeft } from 'lucide-react'
import { BackLink } from '../../components/BackLink'
import {
  useCategories,
  useCreateCategory,
  useCreateDebt,
  useCreateDebtPayment,
  useCreateTransaction,
  useDebts,
  useCreatePlannedExpense,
  useDeleteTransaction,
  usePlannedExpenses,
  usePlannedExpenseTags,
  useRecurringRules,
  useUpdatePlannedExpense,
  useUpdateRecurringRule,
} from '../../hooks/queries'
import { toISODate } from '../../lib/dates'
import { showUndoToast } from '../../lib/undoToast'
import type { TransactionRow, TransactionType } from '../../types/database.types'
import { parseRoleParam } from './entryRoles'
import {
  saveDebtEntry,
  saveDebtPayment,
  saveRemit,
  saveSplit,
  saveWithFee,
  type RoleSaveDeps,
} from './roleSave'
import { TransactionForm, type PaymentSubmit, type RoleSubmit } from './TransactionForm'

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
  // giá trị ban đầu.
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
  // Nhãn của khoản sắp chi (migration 0044) đi theo vào giao dịch: bản điền sẵn là
  // TransactionRow GIẢ (id rỗng) nên form không tra được nhãn qua bảng liên kết giao
  // dịch — phải đưa vào bằng prop.
  const { data: plannedTagLinks = [] } = usePlannedExpenseTags()
  const plannedTagIds = planned
    ? plannedTagLinks.filter((l) => l.planned_id === planned.id).map((l) => l.tag_id)
    : undefined

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

  /**
   * Toast "đã lưu" rồi Ở LẠI màn hình — dùng cho nút "Lưu và nhập tiếp" ở những đường
   * ghi có thể sinh NHIỀU bút toán. KHÔNG kèm Hoàn tác một chạm (điểm G): hoàn tác một
   * chạm chỉ xoá được một bút toán, mà các dạng này ghi tới ba cái.
   */
  function toastAndStay(text: string) {
    setToast({ text, ok: true })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 5000)
  }

  // Lưu một dạng đi qua orchestrator riêng (Trả hộ / Cho vay-Nợ / Gửi về VN).
  // `keepGoing` = bấm "Lưu và nhập tiếp" → ở lại màn, y hợp đồng với onSubmitWithFee.
  // Không tôn trọng cờ này thì nhãn nút nói ngược việc nó làm.
  async function handleRole(payload: RoleSubmit, keepGoing: boolean) {
    const deps = roleDeps()
    if (payload.role === 'split') await saveSplit(payload.base, payload.value, deps)
    else if (payload.role === 'debt') await saveDebtEntry(payload.base, payload.value, deps)
    else await saveRemit(payload.base, payload.value, deps)
    if (!keepGoing) {
      navigate('/so')
      return
    }
    toastAndStay('Đã lưu')
  }

  // Lưu một lần trả nợ (repay/collect) — đường vào thứ hai cho DebtPaymentSheet,
  // dùng ĐÚNG orchestrator `saveDebtPayment` (xem roleSave.ts).
  async function handlePayment(payload: PaymentSubmit, keepGoing: boolean) {
    await saveDebtPayment(payload.base, payload.value, roleDeps())
    if (!keepGoing) {
      navigate('/so')
      return
    }
    toastAndStay('Đã lưu')
  }

  return (
    // `lg:max-w-5xl` (1024px) chứ không giữ 672px: từ lg form chia HAI CỘT (xem
    // TransactionForm), mà hai cột nhét trong 672px thì cột trái còn ~330px — hẹp hơn cả
    // bản mobile, và lưới danh mục rớt xuống hai cột con. 1024px cho cột trái ~660px
    // (đúng bằng bề rộng cũ) và cột phải 320px. Vẫn CÓ trần: màn nhập là một việc một
    // dòng nhìn, kéo hết 1440px thì mắt phải quét ngang cả sải tay giữa hai bước bắt buộc.
    <div className="mx-auto flex h-dvh w-full max-w-2xl flex-col overflow-hidden px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:h-dvh lg:max-w-5xl lg:p-6">
      <div className="mb-2 flex items-center gap-2">
        {/* "Đóng" = bỏ dở màn nhập → trả người dùng về đúng chỗ họ bấm "+", chứ không
            phải luôn luôn về Sổ (nút này mở được từ Nợ, Sắp chi, thông báo…).
            `to` chỉ là đường lui khi không có lịch sử: về Bản tin, vì từ bản 1a nút "+"
            là nút TOÀN CỤC (giữa thanh tab / trên top bar) nên "chỗ bấm +" gần như luôn
            là một màn bất kỳ, không riêng Sổ. Còn LƯU xong thì về `/so` — ở đó mới thấy
            giao dịch vừa ghi. */}
        <BackLink
          to="/"
          aria-label="Đóng, quay lại trang trước"
          className="flex min-h-11 items-center gap-1 rounded-md border border-border-strong bg-surface px-3 py-1.5 text-sm text-fg-secondary transition active:scale-95"
        >
          <ChevronLeft className="h-5 w-5" /> Đóng
        </BackLink>
        <h1 className="flex-1 text-center text-base font-bold text-fg-primary">
          {billRule || planned ? 'Ghi khoản đến hạn' : 'Nhập giao dịch'}
        </h1>
        {/* Ô giữ chỗ RỖNG bên phải tiêu đề: nó ở đây chỉ để `h1` không lệch tâm, vì nút
            "Đóng" bên trái là CHỮ nên giãn theo --app-font-scale. Theo REM chứ px (§13):
            để px thì ở cỡ "Rất lớn" nút bên trái rộng hơn chỗ giữ và tiêu đề lệch tâm —
            đúng cái mà chỗ giữ này sinh ra để tránh.
            Trước đây đây là nơi TransactionForm portal nút mở dropdown chọn loại vào;
            dropdown đó đã bỏ — loại giao dịch chọn ngay trong form, ở MỘT chỗ. */}
        <div className="w-[5.25rem] shrink-0" />
      </div>
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
        initial={billPrefill ?? plannedPrefill}
        initialTagIds={plannedTagIds}
        initialType={initialType}
        enableTemplates
        enableRoles
        initialRole={initialRole}
        onSubmitRole={handleRole}
        onSubmitPayment={handlePayment}
        // Chuyển khoản có phí: 2 bút toán → không kèm Hoàn tác một chạm (như các dạng khác)
        onSubmitWithFee={async (main, fee, keepGoing) => {
          await saveWithFee(main, fee, 'Phí chuyển khoản', roleDeps())
          if (!keepGoing) {
            navigate('/so')
            return
          }
          toastAndStay('Đã lưu (kèm phí)')
        }}
        // Lưu: ghi giao dịch rồi quay về Sổ GD
        onSubmit={async (values) => {
          // Gắn bút toán vào quy tắc định kỳ đã sinh ra nó. Migration 0008 tạo cột này từ
          // lâu nhưng chưa có gì ghi vào, nên tới giờ app không phân biệt được "thu định
          // kỳ" với "thu một lần" — và đó là cờ mà khối 01 của bản vẽ 26a cần.
          //
          // Chỉ khi có `?rule=`: nó nghĩa là người dùng mở form TỪ một quy tắc họ đã khai.
          // Không suy từ số tiền, không đoán theo danh mục.
          const row = await create.mutateAsync(
            billRule ? { ...values, recurring_rule_id: billRule.id } : values,
          )
          await markBillDone()
          await markPlannedDone(row.id)
          // Hoàn tác cho cả nút "Lưu", không chỉ nút lưu-rồi-nhập-tiếp: cùng một hành động ghi
          // thì phải cùng một mức an toàn. Dùng toast hoàn tác TOÀN CỤC (AppLayout vẽ)
          // vì nút này rời màn hình ngay — toast riêng của trang Nhập sẽ chết theo.
          // Trừ khoản đến hạn: xóa giao dịch xong thì lời nhắc vẫn bị đánh dấu đã chi,
          // hoàn tác kiểu đó để lại một trạng thái sai.
          if (!billRule && !planned) {
            showUndoToast('Đã lưu giao dịch', () => del.mutateAsync(row.id).then(() => {}))
          }
          navigate('/so')
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
        // Lưu và nhập tiếp: ghi giao dịch, hiện toast (kèm hoàn tác) rồi ở lại nhập tiếp.
        // Khoản đến hạn KHÔNG có nút đó: con trỏ kỳ chỉ được đẩy ở nhánh "Lưu", bấm nhầm
        // là ghi xong mà lời nhắc vẫn còn nguyên. Xác nhận một khoản là việc một lần.
        onContinue={billRule || planned ? undefined : async (values) => {
          const row = await create.mutateAsync(values)
          setToast({ text: 'Đã lưu', undoId: row.id, ok: true })
          clearTimeout(toastTimer.current)
          toastTimer.current = setTimeout(() => setToast(null), 5000)
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
                className="rounded-full bg-white/20 px-2 py-0.5 text-white transition active:scale-95"
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
