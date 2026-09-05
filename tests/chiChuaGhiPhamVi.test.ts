// Canh PHẠM VI của phần "chi chưa ghi sổ" (spec 2026-09-05, §2b đính chính 2).
//
// `pickBudgetVerdict` cố ý chỉ so chi của các mục ĐÃ ĐẶT hạn mức với tổng trần của chính
// chúng. Chú thích đầu `budgetVerdict.ts` ghi rõ hậu quả nếu trộn phạm vi: "ai mới đặt
// vài hạn mức cũng thấy 'vượt' khổng lồ, rồi thôi tin cả thẻ".
//
// Phần "Chưa ghi rõ" KHÔNG thuộc danh mục nào, nên nó không so được với trần nào. Nó
// được phép hiện CẠNH phán quyết (ChiChuaGhiLine), nhưng không được đi vào phép tính.
//
// Vì sao phải quét mã nguồn thay vì để TypeScript lo: cộng `chuaGhi.net` vào
// `totalBudgeted` là hợp kiểu — cả hai đều là `number`. Không có lỗi biên dịch nào, chỉ
// có một cảnh báo "vượt trần" phồng lên vì lý do người dùng không thể đoán ra. Đúng loại
// lỗi cần canh ở tầng nguồn.
//
// Ở tests/ và đọc filesystem bằng `node:fs` — cùng lý do như designSystem.test.ts:
// tsconfig.app.json cố ý chỉ khai `types: ["vite/client"]`.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// fileURLToPath, không phải `.pathname`: đường dẫn dự án có dấu cách ("Money Manager").
const ROOT = fileURLToPath(new URL('..', import.meta.url))

/** File làm PHÉP TÍNH ngân sách — không file nào được đọc phần chưa ghi. */
const PHEP_TINH_NGAN_SACH = [
  join('src', 'features', 'reports', 'budgetVerdict.ts'),
  join('src', 'features', 'reports', 'monthPace.tsx'),
  join('src', 'features', 'budgets', 'axisTargets.ts'),
  join('src', 'features', 'budgets', 'useMethodFit.ts'),
]

describe('phạm vi phần chi chưa ghi', () => {
  for (const rel of PHEP_TINH_NGAN_SACH) {
    it(`${rel} không đọc chiChuaGhi`, () => {
      const src = readFileSync(join(ROOT, rel), 'utf8')
      expect(src).not.toMatch(/chiChuaGhi|ChiChuaGhi/)
    })
  }

  it('MCP không đọc chiChuaGhi — mục này cố ý không đổi câu trả lời của MCP', () => {
    // api/mcp.mjs là bundle ĐÃ COMMIT. Nếu src/mcp/ đọc chiChuaGhi thì bundle phải dựng
    // lại, mà spec §8 chốt là không chạm tới. Canh cả hai đầu.
    for (const rel of [join('src', 'mcp', 'tools', 'truyVan.ts'), join('src', 'mcp', 'tools', 'moc.ts')]) {
      const src = readFileSync(join(ROOT, rel), 'utf8')
      expect(src).not.toMatch(/chiChuaGhi|ChiChuaGhi/)
    }
  })
})
