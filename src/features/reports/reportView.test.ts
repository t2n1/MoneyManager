// Canh đường CŨ của trang Báo cáo sau khi bốn tab rút còn ba (PR 7 của redesign 1a).
//
// Vì sao cần: `?view=charts|trends|insights` nằm trong bookmark, lịch sử trình duyệt và
// trong link của bộ luật thông báo. Bỏ qua chúng thì trang vẫn MỞ ĐƯỢC — chỉ là mở sai
// tab, không báo gì. Đó đúng là "hỏng im lặng" mà R3 của bộ tài liệu cảnh báo, và không
// phép thử hành vi nào khác bắt được vì mọi thứ vẫn render bình thường.
import { describe, expect, it } from 'vitest'
import { migrateReportView } from './ReportsPage'

describe('migrateReportView', () => {
  it('gộp Biểu đồ và Thấu hiểu về tab Tháng này', () => {
    expect(migrateReportView('charts')).toBe('month')
    expect(migrateReportView('insights')).toBe('month')
  })

  it('Xu hướng về tab Dài hạn', () => {
    expect(migrateReportView('trends')).toBe('long')
    // `trend` số ít: chính bộ tài liệu (R3) viết đường cũ ở dạng này.
    expect(migrateReportView('trend')).toBe('long')
  })

  it('Sức khỏe giữ nguyên — nó là tab duy nhất không đổi tên', () => {
    expect(migrateReportView('health')).toBe('health')
  })

  it('tên tab mới đi qua nguyên vẹn', () => {
    expect(migrateReportView('month')).toBe('month')
    expect(migrateReportView('long')).toBe('long')
  })

  // null (không phải chuỗi rỗng hay 'month'): nơi gọi phân biệt "URL không nói gì" với
  // "URL nói một tab cụ thể" — trả 'month' ở đây thì không phân biệt được nữa.
  it('không đọc được thì trả null để nơi gọi tự chọn mặc định', () => {
    expect(migrateReportView(null)).toBeNull()
    expect(migrateReportView('')).toBeNull()
    expect(migrateReportView('budget')).toBeNull()
    expect(migrateReportView('linh tinh')).toBeNull()
  })
})
