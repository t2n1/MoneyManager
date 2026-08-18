// Canh cột `categories.kind` (migration 0046): mọi màn phải LOẠI danh mục chuyển tài
// sản khỏi tổng chi.
//
// Vì sao cần một test quét mã nguồn thay vì để TypeScript lo: tham số `transferIds` của
// các hàm tổng hợp có GIÁ TRỊ MẶC ĐỊNH (tập rỗng) để ~50 test đơn vị hiện có không phải
// sửa. Mặc định đó cũng có nghĩa là quên truyền thì không có lỗi biên dịch nào — chỉ có
// một màn âm thầm nói chi tháng 8 là ¥252,236 trong khi màn bên cạnh nói ¥222,236. Đúng
// cái lỗi cột `kind` được thêm vào để chấm dứt, nên nó phải được canh ở tầng mã nguồn.
//
// Ở tests/ và đọc filesystem bằng `node:fs` — cùng lý do như designSystem.test.ts:
// tsconfig.app.json cố ý chỉ khai `types: ["vite/client"]`, nên `import.meta.glob` không
// có type ở đây (tsconfig.node.json mới là cái include tests/).
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// fileURLToPath, không phải `.pathname`: đường dẫn dự án có dấu cách ("Money Manager").
const ROOT = fileURLToPath(new URL('..', import.meta.url))
const FEATURES = join(ROOT, 'src', 'features')

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...sourceFiles(p))
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(p)
  }
  return out
}

/** Bỏ comment để một ví dụ trong chú thích không bị đếm là lời gọi thật. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*(\/\/|\*).*$/gm, '')
}

const rel = (p: string) => p.slice(ROOT.length).replace(/\\/g, '/')

/** File định nghĩa các hàm tổng hợp thì không phải "nơi gọi". */
const DEFINITIONS = [
  'src/features/reports/aggregate.ts',
  'src/features/tags/aggregate.ts',
  'src/features/budgets/progress.ts',
]

const APP_FILES = sourceFiles(FEATURES)
  .map((p) => [rel(p), readFileSync(p, 'utf8')] as const)
  .filter(([path]) => !DEFINITIONS.includes(path))

/**
 * Những hàm tổng hợp cộng CHI. Mỗi lời gọi trong `src/features/**` phải có `transferIds`
 * trong danh sách tham số.
 *
 * `categoryMonthlySeries` KHÔNG nằm đây: nó nhận sẵn một tập id do nơi gọi chỉ định, nên
 * nếu người dùng mở đúng trang chi tiết của danh mục "Gửi về VN" thì họ đang CỐ Ý xem nó.
 *
 * `cumulativeDailyBalance` cũng không: nó vẽ BIẾN ĐỘNG SỐ DƯ, và tiền gửi về VN thì thật
 * sự rời khỏi tài khoản — loại nó ra là đường số dư không còn khớp với thực tế.
 */
const GUARDED = [
  'sumIncomeExpense',
  'monthlySeries',
  'categoryBreakdown',
  'dailyExpenseTotals',
  'categoryComparison',
  'monthExpenseCompare',
  'tagBreakdown',
]

/** Lấy nguyên văn lời gọi `name(...)`, cân bằng ngoặc. */
function callsOf(src: string, name: string): string[] {
  const out: string[] = []
  const re = new RegExp(`\\b${name}\\s*\\(`, 'g')
  let m: RegExpExecArray | null
  while ((m = re.exec(src)) !== null) {
    let depth = 1
    let i = m.index + m[0].length
    while (i < src.length && depth > 0) {
      if (src[i] === '(') depth++
      else if (src[i] === ')') depth--
      i++
    }
    out.push(src.slice(m.index, i))
  }
  return out
}

describe('categories.kind — không màn nào được cộng chuyển tài sản vào chi', () => {
  for (const name of GUARDED) {
    it(`mọi lời gọi \`${name}\` trong src/features đều truyền transferIds`, () => {
      const offenders: string[] = []
      for (const [path, raw] of APP_FILES) {
        for (const call of callsOf(stripComments(raw), name)) {
          if (/^\s*(export\s+)?function/.test(call)) continue
          if (!/transferIds/.test(call)) {
            offenders.push(`${path}: ${call.replace(/\s+/g, ' ').slice(0, 120)}`)
          }
        }
      }
      expect(offenders, offenders.join('\n')).toEqual([])
    })
  }

  it('hook `useTransferCategoryIds` là nguồn duy nhất — không màn nào tự lọc kind danh mục', () => {
    const offenders: string[] = []
    for (const [path, raw] of APP_FILES) {
      // `kind.ts` LÀ nguồn đó nên nó được phép.
      //
      // Và `RemitValue.kind` của luồng nhập giao dịch là một trường KHÁC HẲN trùng tên
      // ('expense' = hỗ trợ gia đình vs 'transfer' = chuyển sang tài khoản VND của chính
      // mình), không phải cột danh mục — nên chỉ soi biến đọc rõ ràng là một danh mục.
      if (path.endsWith('/categories/kind.ts')) continue
      const src = stripComments(raw)
      if (/\b(c|cat|category)\.kind\s*===\s*['"]transfer['"]/.test(src)) offenders.push(path)
    }
    expect(offenders, offenders.join('\n')).toEqual([])
  })

  it('`features/categories/kind.ts` phải THUẦN — nó nằm trong đồ thị của bộ luật thông báo', () => {
    const raw = readFileSync(join(FEATURES, 'categories', 'kind.ts'), 'utf8')
    // Bỏ comment trước: chú thích của chính file có nhắc hai chữ đó để giải thích ràng buộc.
    const src = stripComments(raw)
    expect(src).not.toMatch(/from ['"]react['"]/)
    expect(src).not.toMatch(/localStorage/)
    // Chỉ được import KIỂU: mọi import giá trị là một cạnh mới trong đồ thị mà
    // purity.test.ts phải đi qua, và `aggregate.ts` đang import file này.
    const imports = [...src.matchAll(/^import\s+(type\s+)?/gm)]
    expect(
      imports.every((m) => m[1] === 'type '),
      'kind.ts chỉ được `import type`',
    ).toBe(true)
  })

  it('migration 0046 có mặt và đánh dấu "Gửi tiền về VN"', () => {
    const dir = join(ROOT, 'supabase', 'migrations')
    const file = readdirSync(dir).find((f) => f.startsWith('0046_'))
    expect(file, 'thiếu migration 0046').toBeTruthy()
    const body = readFileSync(join(dir, file as string), 'utf8')
    expect(body).toMatch(/add column if not exists kind/)
    expect(body).toMatch(/check \(kind in \('expense','transfer'\)\)/)
    expect(body).toMatch(/Gửi tiền về VN/)
    // Cột phải thêm vào NULLABLE rồi mới chốt NOT NULL: trigger chỉ điền khi NULL, và đó
    // là cách duy nhất phân biệt "người dùng chọn expense" với "chưa ai chọn gì".
    expect(body).not.toMatch(/add column if not exists kind text not null/)
    expect(body).toMatch(/alter column kind set not null/)
    expect(body).toMatch(/if new\.kind is null then/)
  })
})
