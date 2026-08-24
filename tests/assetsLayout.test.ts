// Canh THỨ TỰ KHỐI của trang Tài sản ở cả hai chế độ, và canh nó bằng đúng một cơ chế:
// thứ tự DOM.
//
// ---- Vì sao cần canh, và vì sao bản này khác bản trước ----------------------------
//
// Bản trước canh sáu khối của một màn duy nhất: Tổng tài sản (thẻ gradient xanh) → Thẻ
// tín dụng → Tài sản ròng → Cơ cấu (biểu đồ tròn) → nút cắt lát → danh sách. Ba trong
// sáu mốc đó KHÔNG CÒN TỒN TẠI sau bản vẽ 2a, và đó là điều phải nói rõ chứ không âm
// thầm đổi mốc:
//
//   · Thẻ gradient xanh và thẻ "Tài sản ròng" gộp thành DẢI KPI bốn ô (KpiStrip.tsx).
//     Bản trước phải canh riêng "Thẻ tín dụng đứng TRÊN Tài sản ròng" vì mép gấp mobile
//     cắt vào một trong hai khối, và vế được chọn là khối có hạn chót. Đánh đổi đó HẾT
//     HIỆU LỰC: hạn chót nay là một Ô của dải KPI ("Phải trả · còn 3 ngày"), tức nó nằm
//     trong 400px đầu tiên ở mọi khổ màn, không còn phải tranh chỗ với con số ròng.
//   · Biểu đồ tròn thành vạch xếp, nên mốc `<PieChart>` đi theo.
//   · Nút cắt lát chuyển VÀO header của bảng nó dựng lại, nên nó không còn là một khối
//     riêng đứng giữa hai khối khác. Phép thử tương ứng đổi thành: nút phải nằm trong
//     cùng một panel với bảng.
//
// Cái KHÔNG đổi, và là lý do file này còn sống: luật "không dùng order-*". Lưới xếp theo
// hàng nên thứ tự nhìn thấy đã bằng thứ tự DOM. Muốn đổi thứ tự thì CHUYỂN KHỐI — `order`
// đổi cái nhìn thấy mà không đổi thứ tự tiêu điểm (WCAG 2.4.3).
//
// Đọc CHUỖI NGUỒN chứ không render: repo không có @testing-library, và jsdom không tính
// layout nên không dựng lại được cảnh "trên/dưới mép gấp". Cùng lối overlayLayers.test.ts
// và budgetLayout.test.ts. File nằm ở tests/ vì dùng node:fs — tsconfig của app không cho
// src/ dùng API Node.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = join(fileURLToPath(new URL('..', import.meta.url)), 'src', 'features', 'assets')
const read = (f: string) => readFileSync(join(SRC, f), 'utf8')

const now = read('AssetsNowView.tsx')
const trend = read('AssetsTrendView.tsx')
const kpi = read('AssetsKpi.tsx')

/** Vị trí ký tự của mốc; ném nếu không tìm thấy hoặc thấy nhiều hơn một lần. */
function at(src: string, file: string, mark: string): number {
  const first = src.indexOf(mark)
  if (first < 0) throw new Error(`Không tìm thấy mốc ${JSON.stringify(mark)} trong ${file}`)
  if (src.indexOf(mark, first + 1) >= 0) {
    throw new Error(`Mốc ${JSON.stringify(mark)} xuất hiện nhiều lần trong ${file} — chọn mốc khác`)
  }
  return first
}

describe('bố cục trang Tài sản', () => {
  it('không dùng order-*: thứ tự nhìn thấy phải bằng thứ tự DOM', () => {
    // Nếu phép thử này đỏ, đừng thêm số order cho khớp — hãy chuyển khối JSX.
    for (const [file, src] of [
      ['AssetsNowView.tsx', now],
      ['AssetsTrendView.tsx', trend],
      ['AssetsKpi.tsx', kpi],
    ] as const) {
      expect([...src.matchAll(/\border-\d+\b/g)].map((m) => m[0]), file).toEqual([])
    }
  })

  describe('chế độ Hôm nay (bản vẽ 2a)', () => {
    const BLOCKS = [
      { name: 'Dải KPI', mark: '<AssetsKpi' },
      { name: 'Thẻ tín dụng', mark: '<CardsSection' },
      { name: 'Cơ cấu', mark: '<StructureBar' },
      { name: 'Bảng nhóm & tài khoản', mark: '{displayGroups.map((g) => {' },
    ]

    it('các khối nằm đúng thứ tự ưu tiên trong DOM', () => {
      const actual = BLOCKS.map((b) => ({ name: b.name, at: at(now, 'AssetsNowView.tsx', b.mark) }))
        .sort((a, b) => a.at - b.at)
        .map((b) => b.name)
      expect(actual).toEqual(BLOCKS.map((b) => b.name))
    })

    it('hạn chót là một Ô của dải KPI, không phải một khối phải tranh chỗ', () => {
      // Đây là vế thay thế cho phép thử "Thẻ tín dụng đứng trên Tài sản ròng" của bản
      // trước. Con số phải trả và ngày đến hạn nay sống trong dải KPI, tức trong ~400px
      // đầu ở mọi khổ màn; khối Thẻ tín dụng phía dưới chỉ còn là bảng chi tiết từng thẻ.
      expect(kpi).toContain("label={\n            summary.nextDueISO")
      expect(kpi).toContain('tone="warn"')
      // Và nó KHÔNG được là ô cuối: ô cuối là ô đổi theo chế độ (cho vay / vốn đầu tư),
      // nên đặt hạn chót vào đó là để nó biến mất khi gạt công tắc.
      expect(at(kpi, 'AssetsKpi.tsx', '{showDue && (')).toBeLessThan(
        at(kpi, 'AssetsKpi.tsx', "{showTail && tail === 'loans' && ("),
      )
    })

    it('nút cắt lát nằm TRONG panel của bảng nó dựng lại', () => {
      // Bản trước nút ở thẻ "Cơ cấu tài sản": trên PC 1280 nó ở y=420 cột phải còn thứ nó
      // dựng lại bắt đầu ở y=678 chiếm hết bề ngang — bấm một chỗ, đổi một chỗ khác cách
      // 258px. Nay nó ở header của chính cái bảng, tức cùng một panel.
      const picker = at(now, 'AssetsNowView.tsx', 'label="Chế độ xem cơ cấu"')
      // Mốc là chuỗi CẤU TRÚC, không phải tiêu đề: chữ "Danh sách tài khoản" còn xuất
      // hiện trong chú thích và trong nhãn cột, mà `at()` đòi mốc phải duy nhất.
      const panel = at(now, 'AssetsNowView.tsx', 'className="flex flex-col overflow-hidden"')
      const rows = at(now, 'AssetsNowView.tsx', '{displayGroups.map((g) => {')
      expect(panel).toBeLessThan(picker)
      expect(picker).toBeLessThan(rows)
      // Và nó phải đứng SAU khối Cơ cấu — nó cũng đổi số lát của vạch, nên để nó ở trên
      // là bấm một chỗ rồi phải cuộn lên xem cái vừa đổi.
      expect(at(now, 'AssetsNowView.tsx', '<StructureBar')).toBeLessThan(picker)
    })
  })

  describe('chế độ Theo thời gian (bản vẽ 2b)', () => {
    const BLOCKS = [
      { name: 'Dải KPI', mark: '<AssetsKpi' },
      { name: 'Tài sản ròng theo thời gian', mark: '<NetWorthHistorySection' },
      { name: 'Đầu tư theo thời gian', mark: '<InvestmentValueHistorySection' },
      { name: 'Hiệu quả đầu tư', mark: '<InvestmentPerformanceSection' },
      { name: 'Mục tiêu tiết kiệm', mark: '<SavingsGoalsSection' },
      { name: 'Bảng nhóm', mark: '{purposeGroups.map((g) => {' },
    ]

    it('biểu đồ lên NGAY dưới dải số, không bị bảng chen vào giữa', () => {
      // Đây là toàn bộ lý do 2b tách thành màn riêng: bản trước bảng chín tài khoản, bảng
      // ba thẻ và vạch cơ cấu nằm CHÈN GIỮA con số ròng và biểu đồ đường đi của chính nó.
      const actual = BLOCKS.map((b) => ({
        name: b.name,
        at: at(trend, 'AssetsTrendView.tsx', b.mark),
      }))
        .sort((a, b) => a.at - b.at)
        .map((b) => b.name)
      expect(actual).toEqual(BLOCKS.map((b) => b.name))
    })

    it('không dựng lại bảng tài khoản của chế độ Hôm nay', () => {
      // Bảng ở đây co thành ĐÚNG các dòng nhóm. Chín dòng tài khoản không nói thêm gì về
      // "đang tiến bộ không", và chúng đẩy hai biểu đồ ra khỏi màn đầu.
      expect(trend).not.toContain('<CardsSection')
      expect(trend).not.toContain('<StructureBar')
      expect(trend).not.toContain('AccountTypeIcon')
    })

    it('dải KPI là khối CHUNG của hai chế độ, không phải hai bản chép tay', () => {
      // Hai bản là hai chỗ phải sửa mỗi khi đổi cách in một con số, và dải này in bốn con
      // số lớn nhất trang.
      expect(now).toContain('<AssetsKpi')
      expect(trend).toContain('<AssetsKpi')
      expect(now).not.toContain('<KpiCell')
      expect(trend).not.toContain('<KpiCell')
    })
  })
})
