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
  // state.ts cũng nằm trong danh sách ràng buộc của mục J: vòng đời trạng thái phải
  // chạy được ở phía server khi nối push. Hiện nó chỉ import ./types, nhưng không canh
  // thì lần sau ai thêm một import cũng không ai biết.
  'features/notifications/state.ts',
  'features/import/anomaly.ts',
]

/** Chỉ những file này bị soi TOÀN BỘ nội dung (mục J nói thẳng tên chúng). */
const ENGINE_FILE_PATTERN =
  /^features\/notifications\/(types\.ts|rules\.ts|state\.ts|rules\/[^/]+\.ts)$/

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
 * Cũng nhặt `await import('…')` / `import('…')` động: đó là một cạnh GIÁ TRỊ thật —
 * bundler nào cũng nạp file đó — nên bỏ nó là để hở một đường vào đồ thị.
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
  // `import('…')` động — kể cả nằm giữa dòng, trong .then(), trong lazy().
  for (const m of clean.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) out.push(m[1])
  return out
}

/**
 * Token bị cấm Ở BẤT KỲ ĐÂU trong mọi module đồ thị đi tới.
 *
 * Trước đây phép thử chỉ soi các dòng bắt đầu ở cột 0 ("phạm vi module" ước lượng
 * theo thụt lề). Cách đó KHÔNG bắt được đúng cái nó nói là bắt: trong lib/privacy.ts,
 * `localStorage.getItem(KEY)` nằm THỤT VÀO trong `readInitial()`, mà `readInitial()`
 * lại được gọi ở `let enabled = readInitial()` cấp module — tức có chạy lúc nạp
 * module, nhưng token không hề xuất hiện ở dòng cột 0 nào. Muốn biết chắc thì phải
 * quét cả file: một module đã kéo vào đồ thị mà có nhắc tới localStorage/window thì
 * dù gọi ở đâu, nó cũng không phải thứ chạy được trên Edge Function nữa.
 */
const BROWSER_BANNED = [
  ['localStorage', /\blocalStorage\b/],
  ['sessionStorage', /\bsessionStorage\b/],
  ['window', /\bwindow\s*\./],
  ['document', /\bdocument\s*\./],
] as const

/**
 * Ngoại lệ CÓ TÊN của phép quét-cả-file, kèm lý do. Danh sách này phải ngắn và mỗi
 * dòng phải nói được vì sao nhập module đó vẫn an toàn.
 *
 * File nằm trong đây VẪN bị soi ở phạm vi module (dòng cột 0) — chỉ được miễn phần
 * quét-cả-file. Nghĩa là thêm một `localStorage.getItem()` cấp module vào rates.ts
 * thì phép thử vẫn đỏ.
 */
const WHOLE_FILE_EXEMPT = new Map<string, string>([
  [
    'lib/rates.ts',
    'localStorage/Date.now() chỉ nằm trong thân fetchRates(); bộ luật chỉ gọi ' +
      'convertToBase nên nhập module này không chạy dòng nào chạm trình duyệt.',
  ],
])

/** Chỉ giữ những dòng bắt đầu ở cột 0 = câu lệnh cấp module theo quy ước thụt lề của repo. */
export function moduleScopeLines(code: string): string {
  return code
    .split('\n')
    .filter((l) => l.length > 0 && !/^\s/.test(l))
    .join('\n')
}

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
  for (const cand of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
  ]) {
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

    const exemptReason = WHOLE_FILE_EXEMPT.get(file)
    // Quét CẢ FILE, không chỉ dòng cột 0 — xem ghi chú ở BROWSER_BANNED. File có tên
    // trong WHOLE_FILE_EXEMPT thì lùi về phép soi cấp module.
    const scope = exemptReason === undefined ? clean : moduleScopeLines(clean)
    const where = exemptReason === undefined ? 'trong module' : 'ở phạm vi module'
    for (const [name, re] of BROWSER_BANNED) {
      if (re.test(scope)) violations.push({ chain, what: `${name} ${where}` })
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
    // state.ts nằm trong danh sách ràng buộc của mục J — phải thật sự được đi tới.
    expect([...reached.keys()]).toContain('features/notifications/state.ts')
  })

  it('mọi file được miễn quét-cả-file đều có lý do và thật sự nằm trong đồ thị', () => {
    const { reached } = walk()
    for (const [file, reason] of WHOLE_FILE_EXEMPT) {
      // Miễn cho một file KHÔNG nằm trong đồ thị là ngoại lệ chết — dễ thành chỗ trú
      // cho một file khác sau này trùng tên.
      expect([...reached.keys()], `${file} phải đang nằm trong đồ thị`).toContain(file)
      expect(reason.length, `${file} phải ghi lý do`).toBeGreaterThan(20)
    }
  })
})

// Đúng cái hình dạng mà phép soi "chỉ dòng cột 0" BỎ SÓT (lib/privacy.ts): token nằm
// thụt vào trong một hàm, mà hàm đó lại được gọi ở cấp module. Giữ hai khẳng định này
// để không ai lặng lẽ đổi phép quét-cả-file về lại phép soi cột 0.
describe('quét cả file so với chỉ soi dòng cột 0', () => {
  const privacyShape = [
    `const KEY = 'sct-privacy'`,
    `function readInitial(): boolean {`,
    `  return localStorage.getItem(KEY) === '1'`,
    `}`,
    `let enabled = readInitial()`,
  ].join('\n')

  it('cả file thì thấy localStorage', () => {
    expect(/\blocalStorage\b/.test(privacyShape)).toBe(true)
  })

  it('chỉ dòng cột 0 thì KHÔNG thấy — đây là lỗ hổng cũ', () => {
    expect(/\blocalStorage\b/.test(moduleScopeLines(privacyShape))).toBe(false)
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

  it('nhặt cả import() động — đó cũng là một cạnh giá trị', () => {
    expect(valueImportsOf(`const m = await import('./x')`)).toEqual(['./x'])
    expect(valueImportsOf(`lazy(() => import('./Page').then((m) => m.Page))`)).toEqual(['./Page'])
  })
})
