// Một cửa cho màn nạp: thử từng bộ đọc, bộ nào nhận thì lấy.
//
// Mỗi bộ đọc tự kiểm dòng tiêu đề nên không nhận nhầm nhau: PayPay đòi cột `決済方法`
// (Rakuten không có), còn Rakuten đòi cột `利用日` KHỚP TUYỆT ĐỐI (PayPay chỉ có
// `利用日/キャンセル日`, không khớp). Vì vậy thứ tự thử không quan trọng. Thêm nhà thẻ =
// thêm một dòng.

import { parsePaypayStatement } from './paypayStatement'
import { parseRakutenStatement } from './rakutenStatement'
import type { ParsedStatement } from './statementLine'

const READERS = [parsePaypayStatement, parseRakutenStatement] as const

export function parseStatement(
  text: string,
  card: { statementDay: number | null; paymentDueDay: number | null },
  fileName: string,
): ParsedStatement | null {
  for (const read of READERS) {
    const p = read(text, card, fileName)
    if (p) return p
  }
  return null
}
