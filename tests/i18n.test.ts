// Guardrail của lớp ngôn ngữ (src/i18n). Khoá dịch là câu tiếng Việt gốc, nên thứ duy nhất
// có thể lệch là TỪ ĐIỂN: thêm `tr('câu mới')` mà quên bản tiếng Anh thì chế độ English
// lặng lẽ hiện tiếng Việt. Test này đọc nguồn bằng AST của TypeScript và bắt đúng lỗi đó.
//
// Ở tests/ chứ không ở src/ vì cùng lý do với designSystem.test.ts: cần `node:fs`.
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SRC = join(ROOT, 'src')

type Translation = string | { one: string; other: string }

// Gộp từ điển giống src/i18n/en/index.ts, nhưng tự đọc thư mục: bản kia dùng
// `import.meta.glob` của Vite, mà tsconfig.node.json (nơi test này được kiểm kiểu) không có.
const EN_DIR = join(SRC, 'i18n', 'en')
const EN_PARTS: [string, Record<string, Translation>][] = await Promise.all(
  readdirSync(EN_DIR)
    .filter((f) => f.endsWith('.ts') && f !== 'index.ts')
    .map(async (f): Promise<[string, Record<string, Translation>]> => [
      f,
      ((await import(join(EN_DIR, f))) as { default: Record<string, Translation> }).default,
    ]),
)
const EN: Record<string, Translation> = Object.assign({}, ...EN_PARTS.map(([, d]) => d))

/** Thư mục không phải giao diện: MCP server trả lời cho AI, không cho người xem web. */
const NOT_UI = ['src/mcp/', 'src/i18n/']

function sourceFiles(dir = SRC): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...sourceFiles(p))
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(p)
  }
  return out
}

const VI = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i
const FN = new Set(['tr', 'trn', 'trx'])

interface Scan {
  keys: { key: string; where: string }[]
  dynamic: string[]
  /** Chuỗi tiếng Việt nằm ngoài tr()/trn() — ứng viên chưa dịch. */
  loose: string[]
}

function scan(): Scan {
  const res: Scan = { keys: [], dynamic: [], loose: [] }
  for (const file of sourceFiles()) {
    const rel = relative(ROOT, file).replaceAll('\\', '/')
    const text = readFileSync(file, 'utf8')
    const fileIgnored = /^\/\/ i18n-ignore-file/m.test(text)
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
    const where = (n: ts.Node) => `${rel}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`
    const ignored = (n: ts.Node) => {
      const line = sf.getLineAndCharacterOfPosition(n.getStart()).line
      const src = text.split('\n')
      return /i18n-ignore/.test(src[line] ?? '') || /i18n-ignore/.test(src[line - 1] ?? '')
    }
    const visit = (node: ts.Node, inside: boolean) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && FN.has(node.expression.text)) {
        // trx(ngữ cảnh, câu, biến) → khoá `ngữ cảnh|câu`
        const isCtx = node.expression.text === 'trx'
        const lit = (a: ts.Expression | undefined) =>
          a && (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a)) ? a.text : null
        const [head, ...tail] = node.arguments
        const ctx = isCtx ? lit(head) : ''
        const first = isCtx ? tail[0] : head
        const rest = isCtx ? tail.slice(1) : tail
        const text = lit(first)
        if (text !== null && ctx !== null) {
          res.keys.push({ key: isCtx ? `${ctx}|${text}` : text, where: where(first ?? node) })
        } else {
          res.dynamic.push(where(node))
        }
        for (const a of rest) visit(a, false)
        return
      }
      let txt: string | null = null
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) txt = node.text
      else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) txt = node.text
      else if (ts.isJsxText(node)) txt = node.text.trim()
      if (
        txt &&
        !inside &&
        !fileIgnored &&
        VI.test(txt) &&
        !NOT_UI.some((d) => rel.startsWith(d)) &&
        !ts.isImportDeclaration(node.parent) &&
        !ignored(node)
      ) {
        res.loose.push(`${where(node)}  ${txt.slice(0, 60)}`)
      }
      ts.forEachChild(node, (c) => visit(c, inside))
    }
    visit(sf, false)
  }
  return res
}

const S = scan()
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

describe('i18n — từ điển tiếng Anh', () => {
  it('khoá của tr()/trn() luôn là chuỗi literal (để quét được)', () => {
    expect(S.dynamic).toEqual([])
  })

  it('mọi khoá đều có bản tiếng Anh', () => {
    const missing = S.keys.filter((k) => !(k.key in EN)).map((k) => `${k.where}  ${k.key}`)
    expect(missing).toEqual([])
  })

  it('bản tiếng Anh giữ đúng bộ biến {…} của câu gốc', () => {
    const bad: string[] = []
    for (const { key } of S.keys) {
      const v = EN[key]
      if (v === undefined) continue
      const forms = typeof v === 'string' ? [v] : [v.one, v.other]
      const source = key.includes('|') ? key.slice(key.indexOf('|') + 1) : key
      const want = [...new Set(placeholders(source))].sort().join(',')
      for (const f of forms) {
        // dạng số ít được phép bỏ {n} ("one day")
        const got = [...new Set(placeholders(f))].sort()
        const ok = typeof v !== 'string' && f === v.one
          ? got.every((p) => placeholders(source).includes(p))
          : got.join(',') === want
        if (!ok) bad.push(`${key}  →  ${f}`)
      }
    }
    expect(bad).toEqual([])
  })

  it('bản tiếng Anh không còn chữ tiếng Việt', () => {
    const bad = Object.entries(EN)
      .flatMap(([k, v]) => (typeof v === 'string' ? [[k, v]] : [[k, v.one], [k, v.other]]))
      .filter(([, v]) => VI.test(v))
      .map(([k, v]) => `${k}  →  ${v}`)
    expect(bad).toEqual([])
  })

  it('một khoá chỉ có MỘT bản dịch dù khai ở nhiều file', () => {
    // Các file gộp bằng Object.assign — khai khác nhau thì file nào đọc sau lặng lẽ thắng.
    // Cùng chữ mà nghĩa khác theo chỗ dùng thì tách bằng trx(ngữ cảnh, …).
    const seen = new Map<string, string>()
    const bad: string[] = []
    for (const [file, d] of EN_PARTS) {
      for (const [k, v] of Object.entries(d)) {
        const j = JSON.stringify(v)
        const prev = seen.get(k)
        if (prev !== undefined && prev !== j) bad.push(`${file}: ${k}  →  ${j} ≠ ${prev}`)
        seen.set(k, j)
      }
    }
    expect(bad).toEqual([])
  })

  it('từ điển không giữ khoá chết', () => {
    const used = new Set(S.keys.map((k) => k.key))
    // `cat|` / `acc|` / `grp|` là bảng tên mặc định (dữ liệu DB), tra qua categoryLabel() /
    // accountLabel() / assetGroupLabel(), không qua tr().
    expect(Object.keys(EN).filter((k) => !used.has(k) && !/^(cat|acc|grp|tag|tgrp)\|/.test(k))).toEqual([])
  })
})

describe('i18n — độ phủ', () => {
  // Chuỗi tiếng Việt còn nằm ngoài tr(). Chỗ CỐ Ý giữ tiếng Việt (chuỗi so sánh trong
  // logic, dữ liệu khớp với DB, tên riêng) đánh dấu `// i18n-ignore` ở dòng đó hoặc dòng
  // ngay trên, kèm lý do. Cả file là dữ liệu (tên riêng sinh tự động…) thì một dòng
  // `// i18n-ignore-file` ở đầu file.
  it('không còn chuỗi giao diện tiếng Việt chưa dịch', () => {
    expect(S.loose).toEqual([])
  })
})
