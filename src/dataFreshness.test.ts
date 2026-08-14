// Hai luật về dòng "số trên màn này lấy lúc nào" mà không phép thử hành vi nào bắt được,
// vì cả hai đều là chuyện GIỮA các file.
//
// Luật 1 — vị trí. Dòng tuổi dữ liệu nói về CẢ trang, nên phải ở một độ cao không đổi.
// Trang Báo cáo từng chèn nó ở vị trí thứ sáu, sau dải tab nội dung, dải kỳ, mũi chuyển kỳ,
// dải tháng và banner thiếu tỷ giá — bốn khối trong số đó có điều kiện. Gạt tab một cái là
// dòng nhảy sang độ cao khác; trong cùng một trang nó có bốn chỗ đứng, còn so với trang Tài
// sản thì cùng một dòng chữ xuất hiện ở năm độ cao trên toàn app.
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

// ------------------------------------------------------------------ luật 1: vị trí

/** File có DỰNG `<DataFreshness …/>` (bỏ chính component và file này). */
const USERS = SOURCES.filter(
  ([file, code]) =>
    file.endsWith('.tsx') &&
    file !== 'components/DataFreshness.tsx' &&
    code.includes('<DataFreshness'),
)

describe('vị trí <DataFreshness>', () => {
  // Dải tab nội dung, dải kỳ, dải tháng — thứ đổi theo lát đang xem. Dòng tuổi dữ liệu
  // nói về CẢ trang nên phải đứng trên hết thảy, nếu không nó tụt theo chúng.
  const CONTROLS = ['<SegmentedControl', '<MonthStrip']

  it('có ít nhất một trang dùng — nếu không, phép thử dưới đây rỗng mà vẫn xanh', () => {
    expect(USERS.length).toBeGreaterThan(0)
  })

  it.each(USERS)('%s: đứng dưới <h1> của trang', (_file, code) => {
    const h1At = code.indexOf('<h1')
    expect(h1At).toBeGreaterThan(-1)
    expect(code.indexOf('<DataFreshness')).toBeGreaterThan(h1At)
  })

  it.each(USERS)('%s: đứng trên mọi dải điều khiển', (_file, code) => {
    const freshnessAt = code.indexOf('<DataFreshness')
    for (const control of CONTROLS) {
      const at = code.indexOf(control)
      if (at < 0) continue // trang không dùng dải đó thì không có gì để so
      expect(freshnessAt, `${control} phải đứng sau <DataFreshness>`).toBeLessThan(at)
    }
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
