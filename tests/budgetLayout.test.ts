// Canh THỨ TỰ KHỐI của trang Ngân sách, và canh nó bằng đúng một cơ chế: thứ tự DOM.
//
// Vì sao cần canh:
//
// 1) Thứ tự cũ không ai chọn. Commit b11419f tách 2 cột cho PC và dựng `order-*` với mục
//    đích ghi rõ trong mô tả: "trên mobile thứ tự đọc giữ nguyên". Tức các số order chỉ là
//    miếng vá giữ nguyên hiện trạng, không phải tuyên bố ưu tiên. Hiện trạng đó đặt "Cơ cấu
//    chi so với mốc" lên đầu — đo trên mobile 375×812: thẻ này cao 227px trong vùng nhìn
//    thấy 660px (nav dưới `fixed` chiếm từ y=732), tức 34% màn đầu tiên, ở tháng cả ba trục
//    đều đạt. Còn câu phán quyết "với đà này sẽ vượt trần" nằm ở y=803 — DƯỚI mép gấp 71px.
//    Người mở trang trên điện thoại chỉ thấy con số trấn an "còn ¥…", không thấy câu nói nó
//    vẫn thủng.
//
// 2) `order-*` là cơ chế sai để sửa. CSS `order` đổi thứ tự NHÌN THẤY mà không đổi thứ tự
//    DOM — tức không đổi thứ tự tiêu điểm và thứ tự máy đọc màn hình. Đo chuỗi tab trên
//    mobile trước khi sửa: y = 12, 12, 73, 113, 175, 449, 915… tăng đơn điệu, tức tiêu điểm
//    đang khớp thị giác. Nhưng thẻ "Cơ cấu chi so với mốc" giữ 3 phần tử bắt tiêu điểm
//    (nút "Đổi mốc" và 2 dòng trục, ở y=73/113/175); hạ nó xuống bằng cách đổi số order thì
//    thẻ trôi xuống thứ 6 mà 3 tiêu điểm kia vẫn ở đầu chuỗi — tiêu điểm nhảy ngược,
//    WCAG 2.4.3. Cùng lý do đó trang hiện đã lệch sẵn một chỗ: "Chi tích lũy vs ngân sách"
//    là DOM 4 nhưng nhìn thấy thứ 3, đứng trước "Chưa đặt hạn mức" (DOM 3).
//
// Nên luật là: xếp bằng THỨ TỰ DOM, không dùng `order-*`. Muốn thế thì phép nối
// "cột trái rồi cột phải" phải ra đúng thứ tự mobile mong muốn — điều kiện là "Chưa đặt
// hạn mức" nằm ở cột phải. Hai phép thử dưới canh đúng hai vế đó.
//
// Đọc CHUỖI NGUỒN chứ không render: repo không có @testing-library, và jsdom cũng không
// tính layout nên không dựng lại được cảnh "trên/dưới mép gấp". Cùng lối overlayLayers.test.ts.
// File nằm ở tests/ vì dùng node:fs — tsconfig của app không cho src/ dùng API Node.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = join(fileURLToPath(new URL('..', import.meta.url)), 'src')
const VIEW = join(SRC, 'features', 'budgets', 'BudgetView.tsx')
const src = readFileSync(VIEW, 'utf8')

/** Wrapper của mỗi cột: `contents` trên mobile (con nhả thẳng ra flex-col ngoài), cột trên PC. */
const COLUMN_MARK = 'className="contents lg:flex lg:flex-col lg:gap-3">'

/**
 * Thứ tự đọc mong muốn, từ trên xuống. Mỗi khối nhận ra bằng một chuỗi chỉ xuất hiện
 * một lần trong file (tiêu đề thẻ, hoặc tên component con).
 */
const BLOCKS: { name: string; mark: string; column: 'trái' | 'phải' }[] = [
  { name: 'Tổng ngân sách (kèm phán quyết)', mark: '>Tổng ngân sách<', column: 'trái' },
  { name: 'Cần để ý', mark: 'Cần để ý (', column: 'trái' },
  { name: 'Danh sách hạn mức', mark: 'groupLabel="Sắp xếp hạn mức"', column: 'trái' },
  { name: 'Ngân sách theo nhãn', mark: '<TagBudgetsCard', column: 'trái' },
  { name: 'Chi tích lũy vs ngân sách', mark: '<SpendPaceSection', column: 'phải' },
  { name: 'Cơ cấu chi so với mốc', mark: '<AxisTargetsCard', column: 'phải' },
  // Nhận ra bằng câu Guide bên trong, không bằng tiêu đề: cụm "Chưa đặt hạn mức" còn
  // xuất hiện trong chú thích, mà `at()` đòi mốc phải là duy nhất.
  { name: 'Chưa đặt hạn mức', mark: 'Bấm tên nhóm để đặt trần chung', column: 'phải' },
  { name: 'Lịch chi tiêu', mark: '<MonthPaceCharts', column: 'phải' },
]

/** Vị trí ký tự của mốc trong nguồn; ném nếu không tìm thấy hoặc thấy nhiều hơn một lần. */
function at(mark: string): number {
  const first = src.indexOf(mark)
  if (first < 0) throw new Error(`Không tìm thấy mốc ${JSON.stringify(mark)} trong BudgetView.tsx`)
  if (src.indexOf(mark, first + 1) >= 0) {
    throw new Error(`Mốc ${JSON.stringify(mark)} xuất hiện nhiều lần — chọn mốc khác`)
  }
  return first
}

describe('bố cục trang Ngân sách', () => {
  it('không dùng order-*: thứ tự nhìn thấy phải bằng thứ tự DOM', () => {
    // Nếu phép thử này đỏ, đừng đổi số order cho khớp — hãy chuyển khối JSX.
    const found = [...src.matchAll(/\border-\d+\b/g)].map((m) => m[0])
    expect(found).toEqual([])
  })

  it('các khối nằm đúng thứ tự ưu tiên trong DOM', () => {
    const actual = BLOCKS.map((b) => ({ name: b.name, at: at(b.mark) }))
      .sort((a, b) => a.at - b.at)
      .map((b) => b.name)
    expect(actual).toEqual(BLOCKS.map((b) => b.name))
  })

  it('chia cột sao cho nối trái-rồi-phải ra đúng thứ tự trên', () => {
    // Mobile hai wrapper là `contents` nên DOM phẳng = con cột trái rồi con cột phải.
    // Phép thử trên chỉ đúng nếu cách chia cột giữ được phép nối đó.
    const cols = src.split(COLUMN_MARK)
    expect(cols).toHaveLength(3)
    const [, left, right] = cols
    for (const b of BLOCKS) {
      const inLeft = left.includes(b.mark)
      const inRight = right.includes(b.mark)
      expect({ khối: b.name, trái: inLeft, phải: inRight }).toEqual({
        khối: b.name,
        trái: b.column === 'trái',
        phải: b.column === 'phải',
      })
    }
  })

  it('phán quyết nằm TRONG thẻ Tổng ngân sách, trước khối Cần để ý', () => {
    // Đây là thứ kéo câu "sẽ vượt trần" từ y=803 lên trên mép gấp 732.
    expect(at('<BudgetVerdictLine')).toBeGreaterThan(at('>Tổng ngân sách<'))
    expect(at('<BudgetVerdictLine')).toBeLessThan(at('Cần để ý ('))
  })
})
