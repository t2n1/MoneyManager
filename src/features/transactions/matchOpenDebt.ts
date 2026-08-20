import type { CurrencyCode } from '../../lib/money'
import type { DebtDirection, DebtOrigin, DebtRow } from '../../types/database.types'

/** Khoản nợ tối thiểu để xét cộng dồn — nhận `Pick` để test không phải dựng cả hàng. */
type Candidate = Pick<
  DebtRow,
  'id' | 'status' | 'direction' | 'currency' | 'counterparty' | 'origin' | 'income_category_id'
>

export interface OpenDebtQuery {
  direction: DebtDirection
  currency: CurrencyCode
  /** Tên người dùng vừa gõ. '' = không gõ gì. */
  counterparty: string
  /** Người dùng chọn tay một khoản đang mở; null = chỉ khớp theo tên. */
  existingDebtId: string | null
  origin: DebtOrigin | null
  /** Chỉ có nghĩa khi `origin === 'earned'`. */
  incomeCategoryId: string | null
}

const norm = (s: string) => s.trim().toLowerCase()

/**
 * Khoản nợ đang mở mà lần ghi này được CỘNG DỒN vào; null = tạo khoản mới.
 *
 * MỘT bản cho cả repo. Trước đây vị từ này bị chép tay ở hai chỗ trong roleSave
 * (`saveSplit` và `saveDebtCore`) và cả hai chỉ khớp chiều + loại tiền + tên — nên
 * "Anh Hai nợ tiền công" bị nhập vào đúng khoản cho vay cũ của Anh Hai, và vì khoản đó
 * `origin` là null, MỌI lần trả sau đó không vào Thu. Im lặng, không câu báo nào. Sửa
 * một bản chép mà quên bản kia là để nguyên nửa cái bẫy.
 *
 * `origin` phải khớp, và khi là 'earned' thì `income_category_id` cũng phải khớp: gộp
 * hai công việc có danh mục thu khác nhau thì một nửa số tiền vào sai chỗ.
 *
 * `existingDebtId` (người dùng chọn tay) CŨNG phải qua cổng origin. Bộ chọn đã lọc sẵn
 * theo origin, nhưng hàm này không được dựa vào việc đó — cổng cuối phải tự đứng vững.
 *
 * Cùng một người CÓ THỂ có hai dòng nợ (tiền cho vay và tiền công) — đó là ĐÚNG: hai
 * khoản đó thanh toán theo hai cách khác nhau, gộp lại là nói sai một trong hai.
 */
export function matchOpenDebt<T extends Candidate>(
  debts: readonly T[],
  q: OpenDebtQuery,
): T | null {
  const name = q.counterparty.trim()
  return (
    debts.find(
      (d) =>
        d.status === 'open' &&
        d.direction === q.direction &&
        d.currency === q.currency &&
        (d.origin ?? null) === (q.origin ?? null) &&
        (q.origin !== 'earned' || d.income_category_id === q.incomeCategoryId) &&
        (d.id === q.existingDebtId || (!!name && norm(d.counterparty) === norm(name))),
    ) ?? null
  )
}
