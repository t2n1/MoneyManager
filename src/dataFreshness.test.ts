// Hai luật về dòng "số trên màn này lấy lúc nào" mà không phép thử hành vi nào bắt được,
// vì cả hai đều là chuyện GIỮA các file.
//
// Luật 1 — một chỗ đứng. Dòng tuổi dữ liệu nói về CẢ app, nên nó thuộc về chân trang, và
// chỉ AppFooter được dựng nó. Trước đây mỗi trang tự chèn: trang Báo cáo đặt ở vị trí thứ
// sáu, sau bốn khối CÓ ĐIỀU KIỆN (dải tab nội dung, dải kỳ, mũi chuyển kỳ, dải tháng), nên
// gạt tab một cái là nó nhảy — riêng trong trang đó đã có bốn chỗ đứng, cộng với trang Tài
// sản đặt ngay dưới tiêu đề là cùng một dòng chữ hiện ở năm độ cao khác nhau.
//
// Luật 2 — một mối. Tuổi tỷ giá chỉ được tính ở `lib/freshness.ts` (qua
// `hooks/useDataFreshness.ts`). Trang Cài đặt từng tự đọc cache rồi tự tính, và ba chỗ lệch
// nhau ngay: Cài đặt bỏ qua bản ghi thiếu `sourceUpdatedAt` (hai trang kia lùi về
// `fetchedAt`), Cài đặt đo theo ngày trọn nên tỷ giá 5 giờ tuổi thành "Cập nhật hôm nay"
// trong khi Tài sản ghi "5 giờ trước", và hai ngưỡng "đã cũ" so khác dấu (`>=` với `>`).
//
// Cả hai đều là loại lỗi không ai đọc diff thấy được: mỗi trang tự lo phần của mình, file
// cách nhau xa, và chỗ nào cũng "chạy đúng". Chỉ khi mở hai trang cạnh nhau mới lộ.
//
// Đọc file qua import.meta.glob('?raw') như routeLinks.test.ts và purity.test.ts.
import { describe, expect, it } from 'vitest'

const RAW = import.meta.glob('/src/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

/** '/src/features/assets/AssetsPage.tsx' → 'features/assets/AssetsPage.tsx' */
const SOURCES = [...Object.entries(RAW)].map(
  ([path, code]) => [path.replace(/^\/src\//, ''), code] as const,
)

// ------------------------------------------------------------- luật 1: một chỗ đứng

/** File có DỰNG `<DataFreshness …/>` (bỏ chính component). */
const USERS = SOURCES.filter(
  ([file, code]) =>
    file.endsWith('.tsx') &&
    file !== 'components/DataFreshness.tsx' &&
    code.includes('<DataFreshness'),
).map(([file]) => file)

describe('chỗ đứng của <DataFreshness>', () => {
  it('chỉ chân trang được dựng — không trang nào tự chèn', () => {
    expect(USERS).toEqual(['components/AppFooter.tsx'])
  })

  it('chân trang thật sự nằm trong layout, không phải một trang', () => {
    const layout = SOURCES.find(([file]) => file === 'components/AppLayout.tsx')
    expect(layout?.[1]).toMatch(/<AppFooter\s*\/>/)
  })
})

// ------------------------------------------------- luật 2: một chỗ tính tuổi tỷ giá

describe('tuổi tỷ giá chỉ tính ở một chỗ', () => {
  // `lib/rates.ts` giữ hàm và cache; `hooks/useDataFreshness.ts` là CỬA DUY NHẤT đưa mốc
  // đó vào giao diện. Thêm tên vào đây nghĩa là chấp nhận thêm một bản sao sẽ trôi.
  const ALLOWED = ['lib/rates.ts', 'lib/rates.test.ts', 'hooks/useDataFreshness.ts']

  // Soi câu lệnh import chứ không soi cả file: `purity.test.ts` có nhắc tên hai hàm này
  // trong một chuỗi thông báo lỗi, mà nhắc tên thì không phải là tự tính tuổi.
  const IMPORTS_AGE = /import\s*\{[^}]*\b(?:readRatesMeta|rateAgeDays)\b[^}]*\}/

  const offenders = SOURCES.filter(
    ([file, code]) => !ALLOWED.includes(file) && IMPORTS_AGE.test(code),
  ).map(([file]) => file)

  it('không màn hình nào tự đọc cache tỷ giá để tính tuổi', () => {
    expect(offenders).toEqual([])
  })

  it('cửa duy nhất đó vẫn còn — đổi tên file mà quên sửa ALLOWED thì luật thành rỗng', () => {
    const gate = SOURCES.find(([file]) => file === 'hooks/useDataFreshness.ts')
    expect(gate?.[1]).toMatch(/\breadRatesMeta\b/)
  })
})
