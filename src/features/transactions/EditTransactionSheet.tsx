import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, Banknote, Search, SplitSquareHorizontal } from 'lucide-react'
import { repo } from '../../data'
import {
  useAccounts,
  useDebtPayments,
  useDeleteTransaction,
  useRates,
  useUpdateTransaction,
} from '../../hooks/queries'
import { showUndoToast } from '../../lib/undoToast'
import { SplitSheet } from './SplitSheet'
import type { TransactionRow } from '../../types/database.types'
import { TransactionForm } from './TransactionForm'
import { toNewTransaction } from './restore'
import { provenanceLine, txProvenance } from './txProvenance'
import { useEscClose } from '../../hooks/useEscClose'
import { SectionTitle, actionButtonClass } from '../../components/ui'

interface Props {
  tx: TransactionRow
  onClose: () => void
}

/** Sheet sửa/xóa giao dịch (dùng chung cho Sổ GD và Tìm kiếm). */
export function EditTransactionSheet({ tx, onClose }: Props) {
  useEscClose(onClose)
  // Focus MỘT LẦN lúc mở. Không dùng ref callback: callback chạy lại mỗi lần render
  // nên đang gõ trong form là bị giật focus ra ngoài.
  const panelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    panelRef.current?.focus({ preventScroll: true })
  }, [])
  const qc = useQueryClient()
  const navigate = useNavigate()
  const update = useUpdateTransaction()
  const remove = useDeleteTransaction()
  const [moChia, setMoChia] = useState(false)
  const laiLich = provenanceLine(txProvenance(tx))
  // Tiền của giao dịch = tiền của TÀI KHOẢN NGUỒN, không phải base — `amount` được khai
  // theo đơn vị đó (xem chú thích cột amount ở database.types).
  const { data: accounts = [] } = useAccounts()
  const { base } = useRates()
  const currency = accounts.find((a) => a.id === tx.account_id)?.currency ?? base

  // Giao dịch sinh từ trả nợ → cho bấm về đúng khoản nợ. Nguồn sự thật là
  // debt_payments.transaction_id (không chỉ dựa cờ is_debt_flow).
  const { data: debtPayments = [] } = useDebtPayments()
  const linkedDebtId = tx.is_debt_flow
    ? debtPayments.find((p) => p.transaction_id === tx.id)?.debt_id
    : undefined

  async function handleDelete() {
    const snapshot = tx
    // try/catch: xóa hỏng thì GIỮ sheet mở (toast lỗi toàn cục đã báo) —
    // không được hiện "Đã xóa · Hoàn tác" cho một giao dịch còn nguyên.
    try {
      await remove.mutateAsync(snapshot.id)
    } catch {
      return
    }
    onClose()
    // Xóa xong mới cho hoàn tác: tạo lại giao dịch (id mới) nếu người dùng bấm.
    showUndoToast('Đã xóa giao dịch', async () => {
      await repo.createTransaction(toNewTransaction(snapshot))
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['balances'] })
      qc.invalidateQueries({ queryKey: ['search'] })
    })
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 lg:items-center lg:p-6 animate-overlay-in"
      onClick={onClose}
    >
      {/* role/aria-modal/aria-labelledby: giống các sheet khác trong app (TraSoSheet,
          BulkEditSheet, sheet thông báo…) — sheet dùng nhiều nhất lại là cái duy nhất
          thiếu, nên trình đọc màn hình không biết đây là hộp thoại.
          tabIndex + ref focus: KHÔNG bẫy focus (cả app không bẫy), chỉ đưa điểm đọc vào
          trong sheet để người dùng bàn phím không còn đứng ở dòng phía sau. preventScroll
          để mở sheet không giật trang nền.
          `lg:max-w-5xl` (1024px) chứ không giữ 512px ở mọi cỡ màn: từ lg, TransactionForm
          bên trong tự chia HAI CỘT với cột phải CỐ ĐỊNH 20rem. Nhét lưới đó vào 512px thì
          cột trái còn 144px (đo ở 1280px: `grid-template-columns: 144px 320px`) — hẹp hơn
          cả bản mobile, dải danh mục tràn 352px trong 144px và hộp cảnh báo vượt trần bị
          bóp thành bốn dòng. EntryPage nới đúng con số này và nêu đúng lý do này; sheet bị
          bỏ sót lúc lưới hai cột ra đời. `max-w-lg` GIỮ làm nền — dưới lg sheet vẫn một
          cột, kéo hết bề rộng tablet chỉ tổ làm dòng chữ khó dò về đầu hàng.
          `lg:p-6` ở lớp phủ: panel 1024px trong khung nhìn đúng 1024px sẽ dán sát hai mép,
          đọc thành trang chứ không thành hộp thoại. */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-tx-title"
        tabIndex={-1}
        className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-surface-page p-4 pb-[max(1rem,env(safe-area-inset-bottom))] outline-none lg:max-w-5xl lg:rounded-2xl animate-sheet-in lg:animate-sheet-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <SectionTitle role="block" id="edit-tx-title">
            Sửa giao dịch
          </SectionTitle>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleDelete}
              className={actionButtonClass('danger')}
            >
              Xóa
            </button>
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 rounded-md px-3 py-1.5 text-sm text-fg-muted hover:bg-surface-sunken"
            >
              Đóng
            </button>
          </div>
        </div>
        {linkedDebtId && (
          <button
            type="button"
            onClick={() => {
              navigate(`/debts/${linkedDebtId}`)
              onClose()
            }}
            className="mb-3 flex w-full items-center gap-2 rounded-md bg-state-good-bg px-3 py-2.5 text-left text-sm font-medium text-green-800 dark:text-green-300 active:scale-[0.99]"
          >
            <Banknote className="h-4 w-4 shrink-0" />
            <span className="flex-1">Giao dịch trả nợ · Xem khoản nợ</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-green-500 dark:text-green-400" />
          </button>
        )}
        {/* "Nơi này còn những lần nào nữa" — câu hỏi bật ra ngay lúc đang nhìn một khoản
            chi, mà trước nay phải tự nhớ tên rồi sang trang Tìm kiếm gõ lại. Ghi chú là
            thứ gần nhất với "nơi mua" mà app này có (không có bảng merchant riêng), nên
            link đi bằng chính nó. Chỉ hiện khi có ghi chú: không có thì tìm chuỗi rỗng
            sẽ trả về TOÀN BỘ sổ, đúng cái ngược với ý người bấm. */}
        {/* CHIA — chỉ cho khoản chi/thu có số dương. Chuyển khoản không chia được: nó
            có hai đầu tài khoản, chia một đầu là làm lệch số dư đầu kia. */}
        {(tx.type === 'expense' || tx.type === 'income') && tx.amount > 0 && (
          <button
            type="button"
            onClick={() => setMoChia(true)}
            className="mb-3 flex w-full items-center gap-2 rounded-md bg-surface-sunken px-3 py-2.5 text-left text-sm font-medium text-fg-secondary active:scale-[0.99]"
          >
            <SplitSquareHorizontal className="h-4 w-4 shrink-0" />
            <span className="flex-1">Chia thành nhiều dòng</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-fg-muted" />
          </button>
        )}
        {tx.note.trim() !== '' && (
          <button
            type="button"
            onClick={() => {
              navigate(`/search?q=${encodeURIComponent(tx.note.trim())}`)
              onClose()
            }}
            className="mb-3 flex w-full items-center gap-2 rounded-md bg-surface-sunken px-3 py-2.5 text-left text-sm font-medium text-fg-secondary active:scale-[0.99]"
          >
            <Search className="h-4 w-4 shrink-0" />
            <span className="flex-1 truncate">Xem mọi lần “{tx.note.trim()}”</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-fg-muted" />
          </button>
        )}
        <TransactionForm
          key={tx.id}
          initial={tx}
          showExcludeOption
          // Ô "Đây là khoản hoàn tiền" chỉ còn ở ĐÂY (2026-08-24): trang Nhập đã ẩn nó vì
          // gần như không dùng tới, còn việc "à, khoản kia là tiền trả hàng" thì bao giờ
          // cũng nhớ ra sau khi đã ghi — tức là mở lại giao dịch, tức là đúng màn này.
          showRefundOption
          submitLabel="Cập nhật"
          onSubmit={async (values) => {
            await update.mutateAsync({ id: tx.id, patch: values })
            onClose()
          }}
        />
        {/* LAI LỊCH. Câu hỏi "tôi sửa dòng này chưa?" bật ra mỗi lần đối chiếu sổ với
            sao kê, mà một giao dịch mở ra chỉ cho thấy các con số HIỆN TẠI — giống hệt
            một dòng chưa ai đụng vào. Ba mốc này DB đã giữ sẵn từ migration 0001, chỉ là
            chưa bao giờ hiện ra. Không bọc <Guide>: đây là dữ liệu của chính dòng này,
            không phải câu hướng dẫn, nên chế độ Gọn vẫn phải thấy. */}
        {laiLich !== '' && (
          <p className="mt-3 border-t border-border-panel pt-2 text-2xs text-fg-on-track">
            {laiLich}
          </p>
        )}
      </div>
      {moChia && (
        <SplitSheet
          tx={tx}
          currency={currency}
          onClose={() => setMoChia(false)}
          onDone={() => {
            setMoChia(false)
            onClose()
          }}
        />
      )}
    </div>
  )
}
