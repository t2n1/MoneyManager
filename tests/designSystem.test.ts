// Ràng buộc của design system, kiểm bằng chính vitest sẵn có (đọc file, không cần
// DOM — repo không có @testing-library nên không có test render nào để dựa vào).
//
// Hai loại luật, cố ý khác nhau:
//
//   BAN cứng  — phải bằng 0. Dùng cho những thứ ĐÃ dọn sạch. Tái xuất hiện là hồi quy.
//   NGƯỠNG    — số hiện tại là TRẦN, chỉ được giảm. Dùng cho idiom còn ~70-100 chỗ
//               chưa gộp: đặt về 0 ngay thì phải refactor 92 file trong một lần, mà
//               không có test UI nào đỡ. Ngưỡng cho phép gộp dần và vẫn chặn được
//               việc thêm mới. Gộp bớt được chỗ nào thì HẠ số xuống, đừng để nguyên.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Ở tests/ chứ không phải src/: file này đọc filesystem bằng `node:fs`, mà
// tsconfig.app.json cố ý chỉ khai `types: ["vite/client"]`. Nhét vào src thì phải
// thêm type Node cho toàn bộ code app — mất luôn ranh giới ngăn ai đó import `fs`
// vào file chạy trên trình duyệt. Đây là công cụ, không phải code app.
//
// fileURLToPath, không phải `.pathname`: đường dẫn dự án có dấu cách ("Money
// Manager") nên pathname trả về đã percent-encode → ENOENT.
const SRC = join(fileURLToPath(new URL('..', import.meta.url)), 'src')

function sourceFiles(dir = SRC): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...sourceFiles(p))
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(p)
  }
  return out
}

/**
 * Bỏ comment trước khi đếm. Không bỏ thì chính lời giải thích "đừng dùng X" trong
 * comment lại làm guardrail đỏ — mà comment tại chỗ là nơi TỐT NHẤT để nói lý do.
 *
 * Chỉ bỏ block `/* *\/` và dòng bắt đầu bằng `//` hoặc `*`; KHÔNG cắt `//` giữa dòng
 * vì URL trong chuỗi (`https://…`) sẽ bị chặt mất phần sau.
 */
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => {
      const t = l.trim()
      return !t.startsWith('//') && !t.startsWith('*')
    })
    .join('\n')
}

const FILES = sourceFiles().map((path) => ({
  path,
  text: stripComments(readFileSync(path, 'utf8')),
}))

/** Số lần `needle` xuất hiện trong toàn bộ src, kèm danh sách file để báo lỗi cho rõ. */
function occurrences(needle: string) {
  let count = 0
  const where: string[] = []
  for (const f of FILES) {
    const n = f.text.split(needle).length - 1
    if (n > 0) {
      count += n
      where.push(`${f.path.replace(SRC, '')} (${n})`)
    }
  }
  return { count, where }
}

describe('design system — ban cứng (phải bằng 0)', () => {
  // Lý do: gray-400 trên nền trắng chỉ 2,5:1, cần 4,5:1. Chiều đúng là
  // `text-gray-500 dark:text-gray-400` — nền tối thì chữ phụ phải SÁNG hơn.
  it('không dùng gray-400 làm chữ phụ ở light mode', () => {
    const { count, where } = occurrences('text-gray-400 dark:text-gray-500')
    expect(count, `Sai chiều màu. Dùng text-gray-500 dark:text-gray-400.\n${where.join('\n')}`).toBe(
      0,
    )
  })

  // Lý do: palette v4 dùng oklch, green-600 chỉ 3,22:1 và red-600 4,33:1 trên
  // gray-100. Quyết định 2026-07-29: Thu = green-800, Chi = red-700.
  it('không dùng green-600/red-600 cho số tiền', () => {
    for (const needle of ['text-green-600 dark:text-green-400', 'text-red-600 dark:text-red-400']) {
      const { count, where } = occurrences(needle)
      expect(count, `${needle} trượt AA. Dùng <Money> hoặc token.\n${where.join('\n')}`).toBe(0)
    }
  })

  // Lý do: đã có token `text-money-in`/`text-money-out` tự lật sáng/tối. Viết lại
  // cặp màu bằng tay nghĩa là quyết định bị nhân bản ra nhiều chỗ — đúng cái đã dẫn
  // tới 124 chỗ phải sửa một lượt hôm 2026-07-29.
  it('dùng token cho màu tiền, không viết lại cặp sáng/tối bằng tay', () => {
    for (const needle of ['text-green-800 dark:text-green-400', 'text-red-700 dark:text-red-400']) {
      const { count, where } = occurrences(needle)
      expect(count, `Dùng text-money-in / text-money-out.\n${where.join('\n')}`).toBe(0)
    }
  })

  // Lý do: nút chính là nền có CHỮ TRẮNG đè lên → cần 4,5:1 với trắng. green-600
  // (#00a63e) chỉ 3,22:1. Màu nhấn của app là green-700, khai ở token --accent.
  it('không dùng green-600 làm nền nút', () => {
    const { count, where } = occurrences('bg-green-600')
    expect(count, `Trắng trên green-600 chỉ 3,22:1. Dùng bg-green-700.\n${where.join('\n')}`).toBe(0)
  })

  // Lý do: 0.5625rem = 9px, mà --app-font-scale nhỏ nhất là 0.9 → 8,1px.
  // Sàn dưới là text-3xs (10px), token cố ý không có tên cho 9px.
  it('không có chữ nhỏ hơn sàn 10px', () => {
    const { count, where } = occurrences('text-[0.5625rem]')
    expect(count, `Dưới sàn đọc được. Dùng text-3xs.\n${where.join('\n')}`).toBe(0)
  })
})

describe('design system — ngưỡng (chỉ được giảm)', () => {
  // Mỗi số dưới đây là ĐỘ NỢ kỹ thuật đo được lúc dựng hệ thống. Gộp vào
  // primitive ở src/components/ui thì hạ số tương ứng.
  const CEILINGS: { needle: string; max: number; use: string }[] = [
    { needle: 'text-[0.6875rem]', max: 47, use: 'text-2xs' },
    { needle: 'text-[0.625rem]', max: 16, use: 'text-3xs' },
    { needle: 'active:scale-95', max: 94, use: '<IconButton>' },
    { needle: 'min-h-11 min-w-11', max: 26, use: '<IconButton> / iconButtonClass()' },
    { needle: 'rounded-xl bg-white', max: 82, use: '<Card>' },
    { needle: 'tabular-nums', max: 97, use: '<Money> (tự bật tabular-nums)' },
  ]

  for (const { needle, max, use } of CEILINGS) {
    it(`\`${needle}\` không vượt ${max} (gộp dần vào ${use})`, () => {
      const { count, where } = occurrences(needle)
      expect(
        count,
        count > max
          ? `Thêm mới ${count - max} chỗ. Dùng ${use} thay vì viết tay.\n${where.join('\n')}`
          : `Đã giảm xuống ${count} — hạ ngưỡng trong file test này xuống ${count}.`,
      ).toBeLessThanOrEqual(max)
    })
  }
})

describe('design system — token phải tồn tại', () => {
  const css = readFileSync(join(SRC, 'index.css'), 'utf8')

  it('khai đủ token ngữ nghĩa cho cả hai chế độ', () => {
    const required = [
      '--fg-primary',
      '--fg-secondary',
      '--fg-muted',
      '--fg-on-track',
      '--money-in',
      '--money-out',
      '--surface',
      '--surface-sunken',
      '--border-subtle',
    ]
    // Mỗi token phải có ở :root VÀ .dark, không thì dark mode rơi về giá trị light.
    const rootBlock = css.slice(css.indexOf(':root {'), css.indexOf('.dark {'))
    const darkBlock = css.slice(css.indexOf('.dark {'))
    for (const t of required) {
      expect(rootBlock, `${t} thiếu ở :root`).toContain(`${t}:`)
      expect(darkBlock, `${t} thiếu ở .dark`).toContain(`${t}:`)
    }
  })

  it('token ngữ nghĩa được map ra tiện ích Tailwind bằng @theme inline', () => {
    // Thiếu `inline` thì Tailwind copy giá trị lúc build, .dark sẽ không lật màu.
    expect(css).toContain('@theme inline')
    expect(css).toContain('--color-fg-muted: var(--fg-muted)')
    expect(css).toContain('--color-money-in: var(--money-in)')
  })
})
