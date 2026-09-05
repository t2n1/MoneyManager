// Canh tham số loại-trừ của chuyến đi (spec 2026-09-05-chuyen-di §8).
//
// `vang`/`thangVang` có MẶC ĐỊNH RỖNG để test cũ khỏi sửa — nghĩa là QUÊN TRUYỀN không
// gây lỗi biên dịch, chỉ gây hai màn nói hai con số về cùng một tháng. Đúng cái bẫy
// categoryKind.test.ts chặn cho transferIds; đây là bản cho chuyến đi.
//
// Ở tests/ và đọc filesystem bằng `node:fs` — cùng lý do như designSystem.test.ts:
// tsconfig.app.json cố ý chỉ khai `types: ["vite/client"]`.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// fileURLToPath, không phải `.pathname`: đường dẫn dự án có dấu cách ("Money Manager").
const ROOT = fileURLToPath(new URL('..', import.meta.url))

const PHAI_TRUYEN: [rel: string, loiGoi: string, thamSo: string][] = [
  [join('src', 'features', 'reports', 'MonthView.tsx'), 'monthExpenseCompare(', 'vang'],
  [join('src', 'features', 'reports', 'MonthView.tsx'), 'categoryComparison(', 'thangVang'],
  [join('src', 'features', 'bulletin', 'BulletinPage.tsx'), 'monthExpenseCompare(', 'vang'],
]

describe('phạm vi chuyến đi', () => {
  for (const [rel, loiGoi, thamSo] of PHAI_TRUYEN) {
    it(`${rel} gọi ${loiGoi}…) có truyền ${thamSo}`, () => {
      const src = readFileSync(join(ROOT, rel), 'utf8')
      const idx = src.indexOf(loiGoi)
      expect(idx, `không thấy lời gọi ${loiGoi} trong ${rel}`).toBeGreaterThan(-1)
      // đối số phải xuất hiện trong vòng 400 ký tự sau chỗ gọi — đủ phủ một lời gọi
      // nhiều dòng, đủ hẹp để không ăn nhầm lời gọi khác
      expect(src.slice(idx, idx + 400)).toContain(thamSo)
    })
  }

  it('demoRepo seed KHÔNG có sẵn chuyến nào — demo mở ra phải y hệt hôm nay', () => {
    const src = readFileSync(join(ROOT, 'src', 'data', 'demoRepo.ts'), 'utf8')
    // seed khai theo khuôn `const <tên>: <Kiểu>Row[] = [...]` — trips mà xuất hiện theo
    // khuôn đó là ai đó đã nhét chuyến mẫu vào demo.
    expect(src).not.toMatch(/const trips: TripRow\[\]\s*=/)
  })
})
