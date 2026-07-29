// Xuất bảng năm ra CSV. Tiêu đề cột KHÔNG DẤU để Excel bản Nhật/Mỹ mở không lỗi font,
// nhưng THÂN file (nhãn sự kiện tiếng Việt, tên chặng tiếng Nhật như 年金…) vẫn giữ
// nguyên dấu — nên vẫn cần BOM UTF-8 + CRLF y hệt quy ước của reports/csv.ts, kẻo tiêu
// đề không dấu mà thân hỏng font thì đánh bại đúng mục đích ban đầu. Dùng chung
// escapeCsv/minorToPlain với reports/csv.ts, không viết lại luật escape lần hai.
import { escapeCsv, minorToPlain } from '../reports/csv'
import type { CurrencyCode } from '../../lib/currencies'
import type { YearRow } from './project'

// "Bi quan" / "Lac quan" là hai BIÊN của dải, không phải hai nhánh lợi suất — không
// phải "Nhanh thap" / "Nhanh cao" (xem YearRow ở Task 3).
//
// `Loai tien` (cột CUỐI, mã ISO 4217) là BẮT BUỘC, theo đúng quy ước của
// `reports/csv.ts` (`'Loại tiền'` / `'Loại tiền đích'`) — file này vốn đã dùng chung
// escapeCsv/minorToPlain với nó. Thiếu cột đó thì một kịch bản JPY và một kịch bản USD
// xuất ra hai file GIỐNG NHAU HOÀN TOÀN về cấu trúc, chỉ là những số nguyên trần theo
// hai đơn vị khác nhau, và tên file (`lifetime-<ten-kich-ban>.csv`) không mang đơn vị.
// Đứng cuối vì nó nói về CẢ NĂM cột tiền ở trước, không riêng cột nào — trong
// reports/csv.ts mỗi cột tiền có cột loại tiền riêng đi liền sau nó, ở đây cả bảng chỉ
// có một đơn vị duy nhất (`display_currency` của kịch bản).
const HEADER = 'Nam,Tuoi,Noi o,Thu,Chi,Su kien,Tai san cuoi nam,Bi quan,Lac quan,Loai tien'

export function buildYearCsv(rows: YearRow[], currency: CurrencyCode): string {
  const lines = [HEADER]
  for (const r of rows) {
    lines.push(
      [
        String(r.year),
        String(r.age),
        escapeCsv(r.country ?? r.phaseLabel),
        minorToPlain(r.incomeMinor, currency),
        minorToPlain(r.expenseMinor, currency),
        escapeCsv(r.events.map((e) => e.label).join('; ')),
        minorToPlain(r.assetsEndMinor, currency),
        minorToPlain(r.assetsPessimisticMinor, currency),
        minorToPlain(r.assetsOptimisticMinor, currency),
        // Lặp ở MỌI dòng thay vì ghi một lần ở tiêu đề: file CSV bị lọc/sắp/nối với
        // file khác trong Excel là chuyện thường, và một đơn vị nằm trong ô tiêu đề sẽ
        // rụng mất ngay ở thao tác đầu tiên. Mã ISO 4217 không bao giờ chứa dấu phẩy
        // nên không cần escapeCsv.
        currency,
      ].join(','),
    )
  }
  return '﻿' + lines.join('\r\n')
}
