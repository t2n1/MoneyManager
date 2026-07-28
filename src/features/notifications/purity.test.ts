// Canh RÀNG BUỘC ĐỘ THUẦN của bộ luật thông báo (mục J của spec) theo cả ĐỒ THỊ
// IMPORT, không phải từng file một.
//
// Vì sao cần: đọc từng file thì rules/* sạch bong, nhưng import giá trị đi hai
// chặng là chạm React và localStorage:
//   rules.ts → rules/accountRules.ts → assets/aggregate.ts → lib/money.ts → lib/privacy.ts
// (privacy.ts import React và gọi localStorage.getItem ngay lúc nạp module). Không
// có phép thử này thì lỗi đó tái diễn mà không ai thấy — người đọc từng file không
// thể thấy được.
//
// Phép thử đi theo import GIÁ TRỊ (bỏ `import type` và specifier `type X`) từ các
// điểm vào bị ràng buộc, rồi báo lỗi kèm CHUỖI import đã dẫn tới chỗ vi phạm.
// Đọc file qua import.meta.glob('?raw') của Vite để không phải kéo type Node vào
// tsconfig.app (nơi chỉ có vite/client).
import { describe, expect, it } from 'vitest'

const RAW = import.meta.glob('/src/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

/** '/src/lib/money.ts' → 'lib/money.ts' */
const SOURCES = new Map(
  Object.entries(RAW).map(([path, code]) => [path.replace(/^\/src\//, ''), code]),
)

/** Điểm vào phải chạy được nguyên xi trên Deno (Edge Function). */
const ENTRY_POINTS = [
  'features/notifications/rules.ts',
  'features/notifications/types.ts',
  'features/import/anomaly.ts',
]

/** Chỉ những file này bị soi TOÀN BỘ nội dung (mục J nói thẳng tên chúng). */
const ENGINE_FILE_PATTERN = /^features\/notifications\/(types\.ts|rules\.ts|rules\/[^/]+\.ts)$/

/** Bỏ chú thích và nội dung chuỗi để token trong chú thích không bị tính là code. */
function stripCommentsAndStrings(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``')
}

/**
 * Mọi specifier được import GIÁ TRỊ từ một file. Bỏ:
 *  - `import type { X } from '…'` (xóa hết lúc biên dịch)
 *  - `import { type A, type B } from '…'` (mọi specifier đều là kiểu)
 * Không phải parser thật — regex là đủ cho quy ước viết của repo này.
 */
export function valueImportsOf(code: string): string[] {
  const clean = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
  const out: string[] = []
  const re = /(?:^|\n)\s*(?:import|export)\b([\s\S]*?)from\s*['"]([^'"]+)['"]/g
  for (const m of clean.matchAll(re)) {
    const clause = m[1]
    const spec = m[2]
    if (/^\s*type\b/.test(clause)) continue // import type { … } from
    const braced = clause.match(/\{([\s\S]*)\}/)
    if (braced) {
      const names = braced[1].split(',').map((s) => s.trim()).filter(Boolean)
      const outsideBraces = clause.replace(/\{[\s\S]*\}/, '').replace(/[\s,]/g, '')
      // Không có import mặc định/namespace và mọi tên trong ngoặc đều là `type X` → thuần kiểu.
      if (outsideBraces === '' && names.length > 0 && names.every((n) => /^type\s/.test(n))) continue
    }
    out.push(spec)
  }
  return out
}

/** Token bị cấm ở PHẠM VI MODULE — chạy ngay lúc import nên Deno vấp liền. */
const MODULE_SCOPE_BANNED = [
  ['localStorage', /\blocalStorage\b/],
  ['sessionStorage', /\bsessionStorage\b/],
  ['window', /\bwindow\s*\./],
  ['document', /\bdocument\s*\./],
] as const

/** Token bị cấm ở BẤT KỲ đâu trong các file bộ luật (mục J liệt kê đúng những cái này). */
const ENGINE_BANNED = [
  ['localStorage', /\blocalStorage\b/],
  ['sessionStorage', /\bsessionStorage\b/],
  ['window', /\bwindow\s*\./],
  ['Date.now()', /\bDate\s*\.\s*now\s*\(/],
  // `new Date()` không tham số = đọc đồng hồ hệ thống. `new Date(iso)` thì được.
  ['new Date() không tham số', /\bnew\s+Date\s*\(\s*\)/],
] as const

/** Gộp đường dẫn kiểu POSIX: ('features/notifications', '../../lib/money') → 'lib/money' */
function joinPath(dir: string, spec: string): string {
  const parts = dir === '' ? [] : dir.split('/')
  for (const seg of spec.split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') parts.pop()
    else parts.push(seg)
  }
  return parts.join('/')
}

/** Specifier tương đối → khóa trong SOURCES. null = không phải file trong src. */
function resolveLocal(fromFile: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null
  const dir = fromFile.includes('/') ? fromFile.slice(0, fromFile.lastIndexOf('/')) : ''
  const base = joinPath(dir, spec)
  for (const cand of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`]) {
    if (SOURCES.has(cand)) return cand
  }
  return null
}

interface Violation {
  chain: string[]
  what: string
}

function walk(): { reached: Map<string, string[]>; violations: Violation[] } {
  const reached = new Map<string, string[]>() // file → chuỗi import dẫn tới nó
  const violations: Violation[] = []
  const queue: { file: string; chain: string[] }[] = ENTRY_POINTS.map((f) => ({
    file: f,
    chain: [f],
  }))

  while (queue.length > 0) {
    const { file, chain } = queue.shift() as { file: string; chain: string[] }
    if (reached.has(file)) continue
    reached.set(file, chain)

    const code = SOURCES.get(file)
    if (code === undefined) throw new Error(`Không đọc được ${file} — điểm vào đã đổi tên?`)
    const clean = stripCommentsAndStrings(code)

    // Dòng bắt đầu ở cột 0 = câu lệnh cấp module theo quy ước thụt lề của repo.
    const topLevel = clean
      .split('\n')
      .filter((l) => l.length > 0 && !/^\s/.test(l))
      .join('\n')
    for (const [name, re] of MODULE_SCOPE_BANNED) {
      if (re.test(topLevel)) violations.push({ chain, what: `${name} ở phạm vi module` })
    }

    if (ENGINE_FILE_PATTERN.test(file)) {
      for (const [name, re] of ENGINE_BANNED) {
        if (re.test(clean)) violations.push({ chain, what: `${name} trong file bộ luật` })
      }
    }

    for (const spec of valueImportsOf(code)) {
      const local = resolveLocal(file, spec)
      if (local === null) {
        // Import giá trị từ package ngoài: Edge Function không có bundler của Vite,
        // và 'react' là đúng thứ đã lọt vào lần trước.
        violations.push({ chain, what: `import giá trị từ package ngoài '${spec}'` })
        continue
      }
      if (!reached.has(local)) queue.push({ file: local, chain: [...chain, local] })
    }
  }

  return { reached, violations }
}

describe('độ thuần của bộ luật thông báo (đi theo đồ thị import)', () => {
  it('không đường import giá trị nào chạm React / window / localStorage', () => {
    const { violations } = walk()
    const report = violations.map((v) => `${v.what}\n    ${v.chain.join('\n    → ')}`)
    expect(report).toEqual([])
  })

  it('đi tới được đúng những module trong đồ thị (đề phòng phép thử đi lạc rồi luôn xanh)', () => {
    const { reached } = walk()
    // Nếu con số này tụt về gần 3 thì phép thử đã không còn đi theo import nữa.
    expect(reached.size).toBeGreaterThan(8)
    expect([...reached.keys()]).toContain('features/assets/aggregate.ts')
    expect([...reached.keys()]).toContain('lib/currencies.ts')
    expect([...reached.keys()]).not.toContain('lib/privacy.ts')
    expect([...reached.keys()]).not.toContain('lib/money.ts')
  })
})

describe('valueImportsOf', () => {
  it('bỏ `import type { X } from`', () => {
    expect(valueImportsOf(`import type { A } from './a'`)).toEqual([])
  })

  it('bỏ khi MỌI specifier đều là `type X`', () => {
    expect(valueImportsOf(`import { type A, type B } from './a'`)).toEqual([])
  })

  it('giữ khi có lẫn một specifier giá trị', () => {
    expect(valueImportsOf(`import { a, type B } from './a'`)).toEqual(['./a'])
  })

  it('giữ import mặc định và import nhiều dòng', () => {
    expect(valueImportsOf(`import a from './a'\nimport {\n  b,\n} from './b'`)).toEqual([
      './a',
      './b',
    ])
  })

  it('bỏ specifier nằm trong chú thích', () => {
    expect(valueImportsOf(`// import x from './x'\nimport y from './y'`)).toEqual(['./y'])
  })
})
