// Canh THỨ TỰ KHỐI của tab "Hiện tại" trang Tài sản, và canh chỗ đứng của nút cắt lát.
//
// Vì sao cần canh — hai chuyện, đều tra ra từ lịch sử chứ không đoán:
//
// 1) Thứ tự cũ ĐÃ từng được chọn, nhưng lý do chọn nay không còn. Commit 9276051
//    ("xep lai thu tu khoi", 26/7/2026) ghi rõ hai điều: đưa khối Thẻ tín dụng từ
//    y=1036 lên y=550, và đặt "Tài sản ròng" liền ngay trên "Tài sản ròng theo thời
//    gian" vì trước đó hai khối bị hai khối lạ tách ra 700px. Cặp Ròng + Lịch sử ròng
//    chiếm ô 2–3, nên Thẻ đứng thứ 4. Rồi commit aa74931 (tách 3 tab) CHUYỂN
//    `NetWorthHistorySection` sang tab Diễn biến — nay `git grep` chỉ còn thấy nó
//    trong AssetsTrendView.tsx. Cặp tan, khối còn lại giữ nguyên chỗ, không ai xét lại.
//
//    Đo lại trên mobile 375×812 (mép gấp 732 vì nav dưới `fixed` bắt đầu ở đó), độn
//    đúng phần dữ liệu thật có mà demo không có (dòng "Lãi/lỗ đầu tư", dòng "− Nợ thẻ",
//    hộp "cần nạp thêm"):
//                        thứ tự cũ            thứ tự này
//      Tổng tài sản       180–364              180–364
//      Thẻ tín dụng       618–784  ← cắt 52px  380–546  (dư 186px)
//      Tài sản ròng       380–602              562–784  (cắt 2 dòng chiết tính)
//    Mép gấp cắt vào một trong hai khối, không tránh được — bỏ cả dòng "Tổng tài sản"
//    in trùng trong thẻ Ròng cũng chỉ kéo được 20px, vẫn quá 26px. Nên đây là ĐÁNH ĐỔI,
//    và vế được chọn là: khối có hạn chót ("còn N ngày", "cần nạp thêm") thắng khối chỉ
//    để đọc. Commit 9276051 cũng đặt mốc y=550 cho khối Thẻ — thứ tự này đưa nó về 380.
//
// 2) Nút "Mục đích / Loại / Tiền tệ" trước nằm TRONG thẻ "Cơ cấu tài sản", nhưng nó
//    dựng lại cả danh sách nhóm nằm NGOÀI thẻ đó (bấm thử: 5 khối theo mục đích → 3
//    khối theo loại). Trên PC 1280 nút ở y=420 cột phải, danh sách nó dựng lại bắt đầu
//    ở y=678 chiếm hết bề ngang — bấm một chỗ, đổi một chỗ khác cách 258px. Nay nút
//    xuống ngay trên danh sách: trên cả hai khổ nó vừa dính đáy thẻ Cơ cấu vừa dính
//    đầu danh sách, tức cạnh cả hai thứ nó đổi.
//
// Không dùng `order-*` ở trang này (và phép thử dưới canh điều đó): lưới `lg:grid-cols-2`
// xếp theo hàng nên thứ tự nhìn thấy đã bằng thứ tự DOM. Muốn đổi thứ tự thì CHUYỂN KHỐI
// — `order` đổi cái nhìn thấy mà không đổi thứ tự tiêu điểm (WCAG 2.4.3).
//
// Đọc CHUỖI NGUỒN chứ không render: repo không có @testing-library, và jsdom không tính
// layout nên không dựng lại được cảnh "trên/dưới mép gấp". Cùng lối overlayLayers.test.ts
// và budgetLayout.test.ts. File nằm ở tests/ vì dùng node:fs — tsconfig của app không cho
// src/ dùng API Node.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = join(fileURLToPath(new URL('..', import.meta.url)), 'src')
const VIEW = join(SRC, 'features', 'assets', 'AssetsNowView.tsx')
const src = readFileSync(VIEW, 'utf8')

/** Lưới hai cột cho các khối chỉ để đọc ở đầu trang. */
const GRID_MARK = 'lg:grid-cols-2'
/** Nút cắt lát — nhận ra bằng nhãn trợ năng, chuỗi duy nhất trong file. */
const MODE_PICKER = 'label="Chế độ xem cơ cấu"'

/**
 * Thứ tự đọc mong muốn, từ trên xuống. Mỗi khối nhận ra bằng một mốc CẤU TRÚC
 * (class, tên component, tên biến) chứ không bằng tiêu đề: tiêu đề còn xuất hiện
 * trong chú thích, mà `at()` đòi mốc phải duy nhất.
 */
const BLOCKS: { name: string; mark: string; inGrid: boolean }[] = [
  { name: 'Tổng tài sản', mark: 'from-green-700 to-emerald-800', inGrid: true },
  { name: 'Thẻ tín dụng', mark: '<CardsSection', inGrid: true },
  { name: 'Tài sản ròng', mark: '{showNetWorth && (', inGrid: true },
  { name: 'Cơ cấu tài sản', mark: '<PieChart>', inGrid: true },
  { name: 'Nút cắt lát', mark: MODE_PICKER, inGrid: false },
  { name: 'Danh sách nhóm & tài khoản', mark: '{displayGroups.map((g) => {', inGrid: false },
]

/** Vị trí ký tự của mốc trong nguồn; ném nếu không tìm thấy hoặc thấy nhiều hơn một lần. */
function at(mark: string): number {
  const first = src.indexOf(mark)
  if (first < 0) throw new Error(`Không tìm thấy mốc ${JSON.stringify(mark)} trong AssetsNowView.tsx`)
  if (src.indexOf(mark, first + 1) >= 0) {
    throw new Error(`Mốc ${JSON.stringify(mark)} xuất hiện nhiều lần — chọn mốc khác`)
  }
  return first
}

describe('bố cục tab Hiện tại của trang Tài sản', () => {
  it('không dùng order-*: thứ tự nhìn thấy phải bằng thứ tự DOM', () => {
    // Nếu phép thử này đỏ, đừng thêm số order cho khớp — hãy chuyển khối JSX.
    expect([...src.matchAll(/\border-\d+\b/g)].map((m) => m[0])).toEqual([])
  })

  it('các khối nằm đúng thứ tự ưu tiên trong DOM', () => {
    const actual = BLOCKS.map((b) => ({ name: b.name, at: at(b.mark) }))
      .sort((a, b) => a.at - b.at)
      .map((b) => b.name)
    expect(actual).toEqual(BLOCKS.map((b) => b.name))
  })

  it('khối Thẻ tín dụng đứng trên khối Tài sản ròng', () => {
    // Vế được chọn của đánh đổi mép gấp — tách riêng để khi ai đó đảo lại thì phép
    // thử đỏ ngay ở câu nói đúng lý do, không lẫn trong danh sách thứ tự chung.
    expect(at('<CardsSection')).toBeLessThan(at('{showNetWorth && ('))
  })

  it('nút cắt lát đứng ngoài lưới, ngay trên danh sách nó dựng lại', () => {
    // Danh sách nhóm cố ý ĐỨNG NGOÀI lưới hai cột (phép tính vị trí thả khi kéo–thả
    // giả định các dòng xếp dọc — xem commit 148de4f). Nút phải theo nó ra ngoài.
    const grid = [...src.matchAll(new RegExp(GRID_MARK, 'g'))]
    expect(grid).toHaveLength(1)
    expect(at(MODE_PICKER)).toBeGreaterThan(at('<PieChart>'))
    expect(at(MODE_PICKER)).toBeLessThan(at('{displayGroups.map((g) => {'))
  })
})
