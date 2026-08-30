// Canh VIEW `account_balances` khớp với kiểu `AccountBalanceRow`.
//
// VÌ SAO CẦN TEST NÀY
// View liệt kê cột RÕ RÀNG chứ không `a.*`, nên `alter table accounts add column` KHÔNG
// làm cột mới chảy qua view. Đây là cái bẫy đã sập thật: migration 0047 thêm
// `accounts.is_liquid`, app đọc nó khắp nơi, nhưng view thì không có — nên suốt 6
// migration, mọi thứ đọc view (`buildHealthSnapshot`, `earmarked.ts`, bộ đếm "N tài khoản
// chưa khai" của tab Sức khỏe) nhận `undefined`. Tiền gửi có kỳ hạn vẫn bị đếm là tiền
// tiêu ngay được, và lời nhắc "chưa khai" đứng nguyên dù người dùng đã khai hết.
//
// TypeScript không bắt được: mọi hàm đọc cờ đó nhận kiểu có trường TUỲ CHỌN
// (`is_liquid?: boolean | null` trong `LiquidityInput`), nên một row thiếu cột vẫn hợp
// kiểu. Cùng lối với categoryKind.test.ts — thứ compiler không thấy thì canh ở tầng
// nguồn.
//
// Ở tests/ và đọc filesystem bằng `node:fs` — cùng lý do như designSystem.test.ts.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// fileURLToPath, không phải `.pathname`: đường dẫn dự án có dấu cách ("Money Manager").
const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MIGRATIONS = join(ROOT, 'supabase', 'migrations')

/** Bỏ comment để một tên cột nhắc trong chú thích không bị đếm là khai báo/lời select. */
const stripTsComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*(\/\/|\*).*$/gm, '')
const stripSqlComments = (src: string) => src.replace(/^\s*--.*$/gm, '')

/** Tên các trường của `AccountBalanceRow` trong database.types.ts. */
function typeFields(): string[] {
  const src = readFileSync(join(ROOT, 'src', 'types', 'database.types.ts'), 'utf8')
  const start = src.indexOf('export type AccountBalanceRow = {')
  expect(start, 'không thấy `export type AccountBalanceRow`').toBeGreaterThan(-1)
  const end = src.indexOf('\n}', start)
  const body = stripTsComments(src.slice(start, end))
  return [...body.matchAll(/^ {2}(\w+)\??:/gm)].map((m) => m[1])
}

/**
 * Migration MỚI NHẤT có dựng lại view — đó là định nghĩa đang có hiệu lực. Lấy bản mới
 * nhất chứ không quét mọi bản: các bản cũ cố ý thiếu cột được thêm về sau.
 */
function currentViewSql(): { file: string; selectList: string } {
  const file = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .reverse()
    .find((f) =>
      /create (or replace )?view public\.account_balances/.test(
        readFileSync(join(MIGRATIONS, f), 'utf8'),
      ),
    )
  expect(file, 'không migration nào dựng view account_balances').toBeTruthy()
  const sql = stripSqlComments(readFileSync(join(MIGRATIONS, file as string), 'utf8'))
  // Chỉ soi danh sách cột: phần `from ... join ...` cũng nhắc `a.user_id`, `t.account_id`…
  const m = /\bselect\b([\s\S]*?)\bfrom public\.accounts a\b/i.exec(sql)
  expect(m, `${file}: không tách được danh sách cột của view`).toBeTruthy()
  return { file: file as string, selectList: (m as RegExpExecArray)[1] }
}

describe('view account_balances phải lộ đủ cột mà AccountBalanceRow khai', () => {
  const fields = typeFields()
  const { file, selectList } = currentViewSql()

  it('kiểu có trường, và view mới nhất được tìm ra', () => {
    expect(fields.length).toBeGreaterThan(10)
    expect(file).toMatch(/^\d{4}_/)
  })

  for (const f of fields) {
    it(`\`${f}\` có trong danh sách cột của ${file}`, () => {
      // Ba dạng hợp lệ: `a.<cột>`, `mv.<cột>`, hoặc `… as <cột>` (cột đổi tên / biểu thức).
      const ok =
        new RegExp(`\\b(?:a|mv)\\.${f}\\b`).test(selectList) ||
        new RegExp(`\\bas\\s+${f}\\b`).test(selectList)
      expect(ok, `view thiếu cột \`${f}\` — thêm vào rồi dựng lại view`).toBe(true)
    })
  }

  it('is_liquid có mặt — đây là cột đã bị bỏ sót suốt 0047→0052', () => {
    expect(selectList).toMatch(/\ba\.is_liquid\b/)
  })
})
