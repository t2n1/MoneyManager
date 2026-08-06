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
  // Engine Lifetime: Task 12 sẽ cho lifetimeRules.ts gọi projectLifetime, tức nó vào
  // đồ thị import của bộ luật. Canh từ bây giờ để ràng buộc "module lá" có chốt tự động
  // suốt các task còn lại, thay vì trông vào review thủ công.
  'features/lifetime/project.ts',
  // insights.ts (Task 4) chỉ được đi tới từ Task 12 qua lifetimeRules.ts, nhưng thêm vào
  // đây ngay từ bây giờ để walk() phủ nó suốt tám task còn lại thay vì chỉ có phép quét
  // thẳng canh (xem ENGINE_FILE_PATTERN ngay dưới).
  'features/lifetime/insights.ts',
]

/**
 * Chỉ những file này bị soi TOÀN BỘ nội dung (mục J nói thẳng tên chúng), tức bị cấm
 * cả `Date.now()` và `new Date()` không tham số — xem ENGINE_BANNED.
 *
 * Hai file của Lifetime nằm trong danh sách vì chúng là engine THUẦN: `project.ts` nhận
 * năm hiện tại qua `input.currentYear`, `insights.ts` (Task 4) chỉ đọc lại `YearRow[]`
 * đã chiếu. Cả hai phải cho ra cùng một kết quả với cùng input, dù chạy lúc nào — và
 * lifetimeRules.ts sẽ gọi chúng từ Edge Function, nơi không có "hôm nay" của trình duyệt.
 *
 * CỐ Ý liệt kê ĐÚNG HAI FILE chứ không quét cả `features/lifetime/`: Task 7 sẽ tạo
 * `useLifetime.ts` và file đó PHẢI gọi `new Date().getFullYear()` — đọc đồng hồ đúng
 * một lần ở tầng UI rồi truyền xuống engine là thiết kế đã chốt, không phải chỗ hở.
 * Quét cả thư mục là biến thiết kế đúng thành test đỏ, rồi người làm Task 7 sẽ chữa
 * sai chỗ để cho xanh. Thêm file engine mới vào Lifetime thì thêm tên nó vào đây.
 *
 * `insights.ts` chưa tồn tại lúc viết dòng này — không sao, tên chưa có file thì không
 * khớp với file nào cả. Task 4 tạo nó thì thêm luôn 'features/lifetime/insights.ts' vào
 * ENTRY_POINTS để `walk()` cũng phủ nó (không thêm sẵn được: walk() nổ khi một điểm vào
 * chưa có file). Riêng phép quét thẳng thì đã phủ nó ngay từ lúc file xuất hiện.
 *
 * CẨN THẬN với nhánh `rules/[^/]+\.ts`: `[^/]+` ăn luôn `accountRules.test`. Hồi pattern
 * này chỉ được dùng trong `walk()` thì vô hại (file test không bao giờ bị ai import nên
 * không vào đồ thị), nhưng phép quét thẳng chạy trên TOÀN BỘ SOURCES nên nó thành cái
 * bẫy — xem `ENGINE_FILES_SCANNED` ngay dưới.
 */
const ENGINE_FILE_PATTERN =
  /^(features\/notifications\/(types\.ts|rules\.ts|state\.ts|rules\/[^/]+\.ts)|features\/lifetime\/(project|insights)\.ts)$/

/** '…/accountRules.test.ts' → true. Cả .ts và .tsx. */
const isTestFile = (file: string) => /\.test\.tsx?$/.test(file)

/**
 * Tập file mà phép quét thẳng soi: khớp `ENGINE_FILE_PATTERN` và KHÔNG phải file test.
 *
 * File test được phép dựng mốc thời gian — `Date.now()` / `new Date()` trong
 * `rhythmRules.test.ts` hay `cardRules.test.ts` là cách tự nhiên để dựng "hôm nay" cho
 * một bộ luật về chu kỳ và ngày đến hạn. Ràng buộc của mục J nói về code CHẠY TRÊN Edge
 * Function, không nói về phép thử của nó. Không loại ra thì phép quét thẳng sẽ gọi file
 * test của người ta là "file bộ luật" rồi bắt họ bỏ mốc thời gian đi.
 *
 * Tính một lần ở đây, dùng cho cả hai `it()` bên dưới — hai phép thử phải soi ĐÚNG cùng
 * một tập, không thì cái chốt chống-rỗng canh một tập khác cái tập thật sự bị quét.
 */
const ENGINE_FILES_SCANNED = [...SOURCES.keys()].filter(
  (f) => ENGINE_FILE_PATTERN.test(f) && !isTestFile(f),
)

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
    'localStorage/Date.now() chỉ nằm trong thân fetchRates() và readRatesMeta(); ' +
      'bộ luật chỉ gọi convertToBase nên nhập module này không chạy dòng nào chạm trình duyệt.',
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

  /**
   * Phép thử THỨ HAI, cố ý KHÔNG đi theo đồ thị import: quét thẳng mọi file trong
   * SOURCES khớp ENGINE_FILE_PATTERN.
   *
   * Vì sao cần cả hai chứ không phải một: phép thử đi theo đồ thị (`walk()`) chỉ soi
   * những file mà một ENTRY_POINT dẫn tới được. Nó phủ đúng thứ nó sinh ra để phủ —
   * `React` / `localStorage` lọt vào qua một CHUỖI import — nhưng nó im lặng với file
   * engine chưa ai import. `insights.ts` (Task 4) chỉ được đi tới từ Task 12 qua
   * lifetimeRules.ts, nên nếu chỉ có `walk()` thì suốt tám task ở giữa, một
   * `new Date()` viết vào `insights.ts` sẽ không có chốt nào bắt.
   *
   * Vòng quét thẳng này cắn ngay giây phút file được tạo, không phụ thuộc vào việc ai
   * đó có nhớ thêm tên file vào ENTRY_POINTS hay không. Cả hai vẫn được giữ vì chúng
   * phủ hai thứ khác nhau: đồ thị phủ "đi mấy chặng thì chạm trình duyệt", quét thẳng
   * phủ "trong file này có token bị cấm".
   */
  it('mọi file engine đều sạch Date/localStorage — quét thẳng, không cần nằm trong đồ thị', () => {
    const offenders: string[] = []
    for (const file of ENGINE_FILES_SCANNED) {
      const clean = stripCommentsAndStrings(SOURCES.get(file) as string)
      for (const [name, re] of ENGINE_BANNED) {
        if (re.test(clean)) offenders.push(`${file}: ${name}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('vòng quét thẳng thật sự có soi file, không phải vòng lặp rỗng', () => {
    // Không có khẳng định này thì một lần đổi ENGINE_FILE_PATTERN hỏng sẽ làm vòng trên
    // xanh vĩnh viễn vì không khớp file nào — đúng kiểu lỗi mà nó sinh ra để chặn.
    expect(ENGINE_FILES_SCANNED).toContain('features/notifications/rules.ts')
    expect(ENGINE_FILES_SCANNED).toContain('features/lifetime/project.ts')
    // Tập quét KHÔNG được chứa file test — xem ghi chú ở ENGINE_FILES_SCANNED. Chốt lại
    // để tập đó không trôi lần nữa khi ai đó sửa pattern hoặc bộ lọc.
    expect(ENGINE_FILES_SCANNED.filter(isTestFile)).toEqual([])
    // useLifetime.ts (Task 7) CỐ Ý được đọc đồng hồ. Hỏi THẲNG pattern chứ không hỏi
    // `ENGINE_FILES_SCANNED`: file đó chưa tồn tại, nên `not.toContain` sẽ xanh vì lý do
    // sai (không có file) và chỉ thật sự kiểm được gì từ Task 7 — tức vô nghĩa đúng lúc
    // cần nhất. Hỏi pattern thì đúng ngay bây giờ và không phụ thuộc file có hay không.
    expect(ENGINE_FILE_PATTERN.test('features/lifetime/useLifetime.ts')).toBe(false)
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
