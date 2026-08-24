import { useState } from 'react'
import {
  useCategories,
  useCreateCategory,
  useCreateTransaction,
  useUpdateAccount,
} from '../../hooks/queries'
import { dayMonthLabel, toISODate } from '../../lib/dates'
import { showToast } from '../../lib/dialog'
import { CURRENCIES, formatMoney, type CurrencyCode } from '../../lib/money'
import { SectionTitle, ActionButton } from '../../components/ui'
import { MoneyField } from '../../components/MoneyField'
import { DateField } from '../../components/DateField'
import type { AccountRow } from '../../types/database.types'
import { useEscClose } from '../../hooks/useEscClose'
import {
  ADJUST_CATEGORY_ICON,
  ADJUST_CATEGORY_NAME,
  CARD_RECONCILE_NOTE,
  cardDebt,
  defaultAdjustDate,
  findAdjustCategory,
  reconcilePlan,
} from './reconcile'

interface Props {
  account: AccountRow
  /** Số dư sổ hiện tại (minor units theo currency tài khoản). Thẻ đang nợ → âm. */
  currentBalance: number
  /** Thẻ: nợ ĐÃ CHỐT chờ rút (cardStatementSplit.billed). null/0 = không có. */
  billedPending?: number | null
  /** Ngày sẽ bị rút phần đã chốt — để câu cảnh báo nói rõ mốc. */
  billedDueISO?: string | null
  onClose: () => void
}

/**
 * Sheet "Điều chỉnh số dư" (mục X): nhập số dư THỰC TẾ → app tạo một giao dịch
 * điều chỉnh (thu/chi) bù phần chênh lệch. Giao dịch này mang exclude_from_stats=true
 * nên KHÔNG lọt vào báo cáo/ngân sách/insight, nhưng vẫn khớp lại số dư tài khoản.
 *
 * Thẻ tín dụng nhập theo SỐ ĐANG NỢ (dương) cho khớp cách app hiển thị thẻ ở mọi
 * nơi khác; phần đổi dấu nằm trong reconcilePlan.
 *
 * KHỚP CŨNG LÀ MỘT KẾT QUẢ, và sheet phải lưu được nó. Bản trước tắt nút khi chênh
 * lệch bằng 0, mà "lần đối chiếu gần nhất" lại suy từ chính giao dịch bù — nên người
 * mở sheet, thấy sổ đúng, đóng lại, vẫn bị chuông và khối Độ tin cậy đếm là chưa đối
 * chiếu. Chỉ số ấy chỉ tăng được khi sổ SAI rồi bù: thưởng cho sổ lệch, phạt sổ đúng.
 * Từ migration 0050 mỗi lần bấm đều đóng dấu `accounts.last_reconciled_at`; giao dịch
 * bù chỉ sinh ra khi thật sự có chênh lệch.
 */
export function ReconcileSheet({
  account,
  currentBalance,
  billedPending,
  billedDueISO,
  onClose,
}: Props) {
  useEscClose(onClose)
  const create = useCreateTransaction()
  const createCategory = useCreateCategory()
  const updateAccount = useUpdateAccount()
  const { data: categories = [] } = useCategories()
  const currency = account.currency as CurrencyCode
  const isCard = account.type === 'card'
  const shown = isCard ? cardDebt(currentBalance) : currentBalance

  const todayISO = toISODate(new Date())
  // Thẻ: lùi về ngày chốt sao kê để engine tự-trả nhìn thấy khoản bù (xem
  // defaultAdjustDate). Người dùng vẫn sửa được nếu muốn ghi ngày khác.
  const suggestedDate = defaultAdjustDate({
    isCard,
    statementDay: account.statement_day,
    paymentDueDay: account.payment_due_day,
    todayISO,
  })

  const [entered, setEntered] = useState(shown)
  const [occurredOn, setOccurredOn] = useState(suggestedDate)
  const [saving, setSaving] = useState(false)

  const { diff, type } = reconcilePlan({ isCard, currentBalance, entered })
  // Khớp vẫn lưu được: lần bấm ấy không sinh giao dịch nào nhưng vẫn là một lần đối
  // chiếu, và cột `last_reconciled_at` là chỗ duy nhất ghi lại được việc đó.
  const canSave = !saving

  async function handleSubmit() {
    if (!canSave) return
    setSaving(true)
    try {
      if (diff !== 0) {
        // Chi/thu bắt buộc có danh mục — dùng danh mục bù riêng, tạo lần đầu nếu chưa có
        const categoryId =
          findAdjustCategory(categories, type)?.id ??
          (
            await createCategory.mutateAsync({
              name: ADJUST_CATEGORY_NAME,
              type,
              icon: ADJUST_CATEGORY_ICON,
            })
          ).id
        await create.mutateAsync({
          type,
          amount: Math.abs(diff),
          to_amount: null,
          category_id: categoryId,
          account_id: account.id,
          to_account_id: null,
          occurred_on: occurredOn,
          note: isCard ? CARD_RECONCILE_NOTE : 'Điều chỉnh số dư',
          exclude_from_stats: true,
        })
      }
      // Đóng dấu SAU khi khoản bù đã vào sổ: hỏng ở giữa thì mất cái mốc, không mất
      // khoản bù — và mốc còn suy lại được từ chính khoản bù đó (xem reconciledAt.ts),
      // còn khoản bù thì không suy lại từ đâu được.
      //
      // Mốc là ĐỒNG HỒ LÚC BẤM, không phải ô "Ghi vào ngày". Hai thứ trả lời hai câu
      // khác nhau: ô ngày nói khoản bù nằm ở đâu trong sổ (thẻ còn lùi về ngày chốt sao
      // kê — xem defaultAdjustDate), còn cột này nói lần cuối người dùng SO SỔ VỚI THỰC
      // TẾ là khi nào. Lấy ô ngày làm mốc kiểm thì đối chiếu thẻ vừa xong đã tự khai là
      // cũ vài tuần.
      await updateAccount.mutateAsync({
        id: account.id,
        patch: { last_reconciled_at: new Date().toISOString() },
      })
      onClose()
    } catch (err) {
      // Không nuốt lỗi: trước đây sheet chỉ đứng im, người dùng không biết vì sao
      showToast(`Không lưu được: ${(err as Error).message}`, 'error')
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
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:rounded-2xl animate-sheet-in lg:animate-sheet-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <SectionTitle role="block" className="mb-1">
          {isCard ? 'Điều chỉnh số nợ' : 'Điều chỉnh số dư'}
        </SectionTitle>
        <p className="mb-3 text-sm text-fg-muted">
          {account.name} · {isCard ? 'sổ đang ghi nợ' : 'số dư sổ hiện tại'}{' '}
          {formatMoney(shown, currency)} ({CURRENCIES[currency].label})
        </p>

        {/* Bẫy hay gặp: điều chỉnh tổng nợ mà quên kỳ đã chốt chờ rút → dòng
            "Kỳ này" về 0 như thể không phải trả, người dùng tưởng app hỏng. */}
        {isCard && (billedPending ?? 0) > 0 && (
          <p className="mb-3 rounded-md border border-state-warn-border bg-state-warn-bg px-3 py-2 text-sm text-state-warn-fg">
            Thẻ đang có kỳ <b>đã chốt chờ rút</b>: {formatMoney(billedPending ?? 0, currency)}
            {billedDueISO ? ` vào ${dayMonthLabel(billedDueISO)}` : ''}. Số "đang nợ thực tế" phải
            gồm cả khoản này — nhập thiếu thì dòng "Kỳ này" sẽ về {formatMoney(0, currency)} như
            thể không phải trả.
          </p>
        )}

        {/* <span>: MoneyField có hai ô (chạm/desktop), tên đến từ `ariaLabel`. */}
        <span className="mb-1 block text-sm font-medium text-fg-muted">
          {isCard ? 'Số đang nợ thực tế' : 'Số dư thực tế'}
        </span>
        <div className="mb-3">
          <MoneyField
            value={entered}
            onChange={setEntered}
            currency={currency}
            ariaLabel={isCard ? 'Số đang nợ thực tế' : 'Số dư thực tế'}
            onEnter={handleSubmit}
            className="w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-right font-mono text-lg font-semibold text-fg-primary outline-accent"
          />
        </div>

        {/* Ô ngày chỉ đặt chỗ cho KHOẢN BÙ. Khớp thì không có khoản bù nào để đặt, nên
            bày ô ngày ra là mời người dùng chỉnh một thứ không tồn tại — và tệ hơn, nó
            gợi ý sai rằng mốc "đã đối chiếu" lấy theo ô này (không: mốc là lúc bấm). */}
        {diff !== 0 && (
          <>
            {/* <span> chứ không <label>: ô ngày là <button>, tên đi qua ariaLabel. */}
            <span className="mb-1 block text-sm font-medium text-fg-muted">Ghi vào ngày</span>
            <DateField
              ariaLabel="Ghi vào ngày"
              value={occurredOn}
              max={todayISO}
              onChange={setOccurredOn}
              className="mb-1 w-full px-3 py-2"
            />
            {/* Chỉ giải thích khi ngày mặc định KHÁC hôm nay — tức là thẻ có đủ ngày
                chốt/đến hạn và mốc chốt đã qua. Ví thường không cần đọc đoạn này. */}
            <p className="mb-3 text-sm text-fg-muted">
              {occurredOn === suggestedDate && suggestedDate !== todayISO
                ? 'Mặc định là ngày chốt sao kê gần nhất, để lần tự trả thẻ kế tiếp rút đúng số.'
                : occurredOn > suggestedDate && suggestedDate !== todayISO
                  ? 'Ghi sau ngày chốt sao kê: lần tự trả thẻ kế tiếp sẽ KHÔNG thấy khoản bù này.'
                  : // Mệnh đề thứ hai là của 19b, và nó mới là phần người ta hiểu sai: đối
                    // chiếu KHÔNG viết lại quá khứ. Thiếu nó thì "khớp lại kể từ ngày này" dễ
                    // đọc thành "app sẽ sửa các số dư cũ cho đúng", nên người dùng lùi ngày về
                    // đầu tháng hy vọng vá được cả tháng — thực tế chỉ tạo một khoản bù nằm
                    // sai chỗ, và mọi tổng của tháng đó lệch thêm một lần nữa.
                    'Số dư khớp lại kể từ ngày này. Giao dịch trước ngày đó giữ nguyên.'}
            </p>
          </>
        )}

        <div className="mb-3 rounded-md border border-border-subtle bg-surface-sunken px-3 py-2 text-sm">
          <div className="flex items-center justify-between text-fg-muted">
            <span>{isCard ? 'Nợ thay đổi' : 'Chênh lệch'}</span>
            <span
              className={`font-mono font-semibold ${
                diff === 0
                  ? 'text-fg-muted'
                  : diff > 0
                    ? 'text-money-in'
                    : 'text-money-out'
              }`}
            >
              {/* Thẻ: diff âm nghĩa là nợ TĂNG, nên đảo dấu hiển thị cho dễ đọc */}
              {diff === 0 ? '' : (isCard ? diff < 0 : diff > 0) ? '+' : '−'}
              {formatMoney(Math.abs(diff), currency)}
            </span>
          </div>
          {/* 19b viết câu này ra thành đủ ba mảnh: LỆCH CHIỀU NÀO ("Sổ đang ghi nhiều hơn
              thực tế"), BAO NHIÊU, và VÀO ĐÂU ("danh mục Điều chỉnh số dư"). Bản cũ chỉ
              nói "sẽ tạo một giao dịch thu điều chỉnh" — đúng nhưng thiếu đúng hai thứ
              người dùng cần sau khi bấm: tên danh mục là từ khoá duy nhất để tìm lại khoản
              bù này trong Sổ, và số tiền để đối chiếu với con số vừa gõ. Chiều lệch nói
              bằng lời chứ không bằng dấu vì "thu" hay "chi" ở đây trả lời một câu hỏi khác
              (app ghi gì) với câu người dùng đang hỏi (tôi gõ đúng chưa). */}
          <p className="mt-1 text-sm text-fg-muted">
            {diff === 0
              ? isCard
                ? 'Số nợ đã khớp — không cần điều chỉnh. Lưu để ghi nhận là đã đối chiếu hôm nay.'
                : 'Số dư đã khớp — không cần điều chỉnh. Lưu để ghi nhận là đã đối chiếu hôm nay.'
              : isCard
                ? `Nợ thật ${diff > 0 ? 'ít' : 'nhiều'} hơn sổ — sẽ tạo một giao dịch bù ${formatMoney(Math.abs(diff), currency)} trên thẻ vào danh mục ${ADJUST_CATEGORY_NAME}, không tính vào thống kê thu chi.`
                : `Sổ đang ghi ${diff > 0 ? 'ít' : 'nhiều'} hơn thực tế — sẽ tạo một giao dịch bù ${formatMoney(Math.abs(diff), currency)} vào danh mục ${ADJUST_CATEGORY_NAME}, không tính vào thống kê thu chi.`}
          </p>
        </div>

        <div className="mt-1 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-md px-3 py-2 text-sm text-fg-muted hover:bg-surface-sunken"
          >
            Hủy
          </button>
          <ActionButton variant="primary" onClick={handleSubmit} disabled={!canSave}>
            {/* Khớp thì nút không còn hứa "điều chỉnh" — nó chỉ ghi nhận đã kiểm. */}
            {saving ? 'Đang lưu…' : diff === 0 ? 'Đã đối chiếu' : 'Điều chỉnh'}
          </ActionButton>
        </div>
      </div>
    </div>
  )
}
