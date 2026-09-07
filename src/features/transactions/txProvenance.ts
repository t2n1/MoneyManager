// Lai lịch một giao dịch: nó từ đâu ra, ghi lúc nào, có bị sửa chưa.
//
// VÌ SAO CÓ FILE NÀY. Câu hỏi hay bật ra nhất khi đối chiếu sổ với sao kê thẻ không
// phải "khoản này bao nhiêu" mà là "tôi đã sửa dòng này chưa?". Trước nay không có
// cách nào biết — mở lại giao dịch chỉ thấy các con số HIỆN TẠI, giống hệt một dòng
// chưa ai đụng tới.
//
// KHÔNG DỰNG BẢNG AUDIT. Bản đầy đủ (ai đổi trường nào, từ giá trị nào) đòi một bảng
// mới và một lượt ghi thêm trên đúng đường nhập tay — cái đường phải xong trong 5 giây.
// Mà giá trị của nó gần như bằng không khi sổ chỉ có MỘT người đăng nhập: không có ai
// khác để mà hỏi "ai sửa". Câu hỏi thật ("đã sửa chưa", "ghi lúc nào", "từ đâu ra")
// trả được trọn bằng ba thứ DB đã có từ migration 0001: `created_at`, `updated_at`
// (trigger moddatetime), và `recurring_rule_id` / `stock_trade_id`.
//
// THÊM MỘT SỐ KHÔNG CÓ Ở ĐÂU KHÁC: khoảng cách giữa NGÀY XẢY RA và LÚC GHI. Một khoản
// ghi lại sau chín ngày là ghi theo trí nhớ — nó vẫn vào tổng như mọi khoản khác, nhưng
// người đối chiếu nên biết để mà nghi nó trước.

import { daysBetween, toISODate } from '../../lib/dates'
import type { TransactionRow } from '../../types/database.types'

/** Ai đã tạo ra dòng này. */
export type TxOrigin = 'nhap-tay' | 'dinh-ky' | 'co-phieu'

export interface TxProvenance {
  origin: TxOrigin
  /** '2026/09/07 14:32' theo giờ máy. */
  createdStamp: string
  /** Cùng dạng; null = chưa sửa lần nào kể từ lúc ghi. */
  editedStamp: string | null
  /** Số ngày từ lúc việc xảy ra tới lúc ghi vào sổ. 0 = ghi trong ngày (hoặc ghi trước). */
  lateDays: number
}

/**
 * Sai số cho phép giữa `created_at` và `updated_at` trước khi gọi là "đã sửa".
 *
 * `moddatetime` đập vào `updated_at` ở MỌI lượt UPDATE, kể cả lượt app tự chạy ngay sau
 * khi tạo (gắn nhãn, gán vai trò). Hai mốc lệch nhau vài trăm mili giây là cùng một
 * hành động của người dùng, không phải một lần sửa — hiện "đã sửa" ở đó là báo động giả
 * trên mọi giao dịch mới, tức là cái cờ này mất hết nghĩa.
 */
export const EDIT_TOLERANCE_MS = 2_000

/** Ngưỡng gọi là "ghi muộn". Ghi hôm sau là chuyện thường; từ hai ngày mới đáng nói. */
export const LATE_DAY_THRESHOLD = 2

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * Mốc thời gian tuyệt đối theo giờ MÁY, không phải UTC.
 *
 * Nhận `Date` chứ không nhận chuỗi để hàm này không phải đoán múi giờ: nơi gọi tự
 * `new Date(iso)` — `timestamptz` của Postgres về tới đây luôn có hậu tố Z nên phép
 * dựng đó không nhập nhằng.
 */
export function formatStamp(d: Date): string {
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function txProvenance(tx: TransactionRow): TxProvenance {
  const created = new Date(tx.created_at)
  const updated = new Date(tx.updated_at)
  const hopLe = !Number.isNaN(created.getTime())

  const daSua =
    hopLe &&
    !Number.isNaN(updated.getTime()) &&
    updated.getTime() - created.getTime() > EDIT_TOLERANCE_MS

  // Ngày ghi lấy theo giờ máy để so với occurred_on — occurred_on là ngày người dùng
  // chọn trên lịch của chính họ, so nó với ngày UTC thì lệch một ngày suốt buổi tối.
  const lateDays = hopLe ? Math.max(0, daysBetween(tx.occurred_on, toISODate(created))) : 0

  return {
    origin: tx.recurring_rule_id ? 'dinh-ky' : tx.stock_trade_id ? 'co-phieu' : 'nhap-tay',
    createdStamp: hopLe ? formatStamp(created) : '',
    editedStamp: daSua ? formatStamp(updated) : null,
    lateDays,
  }
}

/** Câu một dòng cho chân sheet sửa. Rỗng = không có gì đáng nói (không dựng ô trống). */
export function provenanceLine(p: TxProvenance): string {
  if (p.createdStamp === '') return ''
  const phan: string[] = []
  phan.push(
    p.origin === 'dinh-ky'
      ? `Quy tắc định kỳ sinh lúc ${p.createdStamp}`
      : p.origin === 'co-phieu'
        ? `Lệnh cổ phiếu sinh lúc ${p.createdStamp}`
        : `Ghi lúc ${p.createdStamp}`,
  )
  // "Ghi muộn" CHỈ có nghĩa với dòng nhập tay. Máy sinh ra dòng thì khoảng cách này là
  // lúc engine bù kỳ chạy, không phải lúc người dùng nhớ ra — một khoản lương của 2024
  // do lượt bù kỳ sinh hôm nay sẽ đọc ra "sau 710 ngày", đúng kiểu số thật mà vô nghĩa.
  if (p.origin === 'nhap-tay' && p.lateDays >= LATE_DAY_THRESHOLD)
    phan.push(`sau ${p.lateDays} ngày`)
  phan.push(p.editedStamp === null ? 'chưa sửa lần nào' : `sửa lúc ${p.editedStamp}`)
  return phan.join(' · ')
}
