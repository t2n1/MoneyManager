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

  // Lý do: ba sheet Lifetime dùng chung hằng `label_` cho nhãn ô nhập. Trước
  // 2026-07-30 cả 20 nhãn đó đều viết `<label className={label_}>` không có `htmlFor`
  // và không bọc control — tức screen reader đọc ô nhập KHÔNG RA TÊN GÌ (đã đo bằng
  // thuật toán tính accessible name trên app đang chạy: 7/8 ô ở ScenarioEditorSheet
  // không có tên). Không thể kiểm bằng test render vì repo không có @testing-library,
  // nên chặn ở mức nguồn: dạng `<label className={label_}>` (không kèm htmlFor) phải
  // bằng 0. Nhãn cho NHÓM hoặc cho MoneyField thì dùng <span>, không dùng <label>.
  it('nhãn ô nhập trong sheet Lifetime luôn có htmlFor', () => {
    const { count, where } = occurrences('<label className={label_}')
    expect(
      count,
      `<label> không có htmlFor thì không đọc được tên ô. Thêm htmlFor + id, hoặc dùng <span> nếu là nhãn nhóm.\n${where.join('\n')}`,
    ).toBe(0)
  })

  // Lý do: amber KHÔNG có sắc độ nào đạt AA cả hai chế độ (đo thật: amber-600 =
  // 3,20:1 trên trắng nhưng 5,55:1 trên gray-900; amber-700 thì 5,03:1 và 3,53:1).
  // Nên chọn sắc độ "trông vừa mắt" ở một chế độ là tự động trượt ở chế độ kia — đúng
  // cái đã xảy ra ở 11 chỗ trước 2026-07-30. Chữ cảnh báo phải đi qua token.
  it('không dùng amber-600/500 làm chữ (trượt AA ở light mode)', () => {
    for (const needle of ['text-amber-600', 'text-amber-500']) {
      const { count, where } = occurrences(needle)
      expect(
        count,
        `${needle} chỉ ${needle.endsWith('600') ? '3,20' : '2,13'}:1 trên trắng. Dùng text-fg-warn.\n${where.join('\n')}`,
      ).toBe(0)
    }
  })

  // Lý do: 896 chỗ đã đổi sang token. Viết lại cặp sáng/tối bằng tay nghĩa là quyết
  // định màu bị nhân bản trở lại. Chỉ ban những cặp TRÙNG KHỚP CHÍNH XÁC với token —
  // các biến thể khác (gray-700/200, gray-700/300, gray-900/100) cố ý để tự do, vì
  // gộp chúng vào token là đổi sắc độ chứ không phải đặt tên.
  it('dùng token cho cặp màu sáng/tối đã có tên', () => {
    const MAPPED: Record<string, string> = {
      'text-gray-500 dark:text-gray-400': 'text-fg-muted',
      'text-gray-800 dark:text-gray-100': 'text-fg-primary',
      'text-gray-600 dark:text-gray-300': 'text-fg-secondary',
      'bg-white dark:bg-gray-900': 'bg-surface',
      'bg-gray-100 dark:bg-gray-800': 'bg-surface-sunken',
      'bg-gray-50 dark:bg-gray-950': 'bg-surface-page',
      'border-gray-100 dark:border-gray-800': 'border-border-subtle',
      'border-gray-300 dark:border-gray-700': 'border-border-strong',
      'divide-gray-100 dark:divide-gray-800': 'divide-border-subtle',
      // Đúng y cặp của --fg-warn. Cố ý KHÔNG ban `text-amber-700 dark:text-amber-300`
      // (14 chỗ, nằm trên nền amber-50/amber-900-40): đó là cặp KHÁC, gộp vào token là
      // đổi sắc độ dark từ 300 sang 400 — đổi diện mạo, không phải đặt tên.
      'text-amber-700 dark:text-amber-400': 'text-fg-warn',
    }
    for (const [needle, token] of Object.entries(MAPPED)) {
      const { count, where } = occurrences(needle)
      expect(count, `Dùng ${token}.\n${where.join('\n')}`).toBe(0)
    }
  })

  // Lý do: màu đồ thị đi qua PROP của Recharts, không qua class Tailwind — nên MỌI
  // guardrail đếm class ở trên đều không thấy chúng. Đó là điểm mù thật: trước
  // 2026-07-30 có 21 chỗ đặt chữ nhãn trục bằng hex `#9ca3af` (gray-400) = 2,54:1 trên
  // nền trắng — đúng cái idiom mà test `text-gray-400` phía trên đã ban, chỉ khác là
  // viết bằng hex nên lọt qua. Hex còn KHÔNG lật được theo .dark, mà nhãn trục cần
  // 4,5:1 ở CẢ HAI chế độ và không sắc xám nào đạt cả hai → buộc phải là var(--fg-muted).
  //
  // Chỉ ban dạng object-literal `fill: '#`; KHÔNG ban `fill="#` vì đó là path của logo
  // Google ở LoginPage — màu thương hiệu, cố định là đúng.
  it('chữ trong đồ thị dùng token, không dùng hex', () => {
    const { count, where } = occurrences("fill: '#")
    expect(
      count,
      `Hex không lật được dark mode. Dùng fill: 'var(--fg-muted)'.\n${where.join('\n')}`,
    ).toBe(0)
  })

  // Lý do: nét trong đồ thị cần 3:1 (WCAG 1.4.11). Ba hex dưới đây ĐO THẬT là trượt
  // trên nền trắng, nên không được dùng làm nét — kể cả khi trông ổn ở dark mode, vì
  // "trông ổn ở một chế độ" chính là cách chúng lọt vào lần đầu.
  it('không dùng hex trượt 3:1 làm nét trong đồ thị', () => {
    const FAILS: Record<string, string> = {
      '#9ca3af': '2,54:1 (gray-400)',
      '#d1d5db': '1,47:1 (gray-300)',
      '#0ea5e9': '2,77:1 (sky-500)',
    }
    for (const [hex, ratio] of Object.entries(FAILS)) {
      const { count, where } = occurrences(`stroke="${hex}"`)
      expect(
        count,
        `${hex} chỉ ${ratio} trên trắng. Dùng var(--fg-muted) hoặc var(--color-sky-600).\n${where.join('\n')}`,
      ).toBe(0)
    }
  })

  // Lý do: đã có tên text-2xs (11px) / text-3xs (10px). Giá trị tuỳ ý quay lại là
  // scale lại bị chọc lỗ.
  it('dùng bậc chữ đã đặt tên, không chêm giá trị tuỳ ý', () => {
    for (const [needle, token] of [
      ['text-[0.6875rem]', 'text-2xs'],
      ['text-[0.625rem]', 'text-3xs'],
    ]) {
      const { count, where } = occurrences(needle)
      expect(count, `Dùng ${token}.\n${where.join('\n')}`).toBe(0)
    }
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
    // 93 chứ không 94: <ActionButton> gom dáng nút-có-chữ (viền mảnh / nền xanh),
    // kéo 4 chỗ viết tay ở AccountDetailPage + hai sheet điều chỉnh về một mối.
    { needle: 'active:scale-95', max: 93, use: '<IconButton> / <ActionButton>' },
    { needle: 'min-h-11 min-w-11', max: 26, use: '<IconButton> / iconButtonClass()' },
    // 85 chu khong 82: lượt chuẩn hoá đã kéo 29 thẻ TỪ dạng `rounded-xl bg-white …
    // dark:bg-gray-900` VÀO dạng này, nên con số tăng mà tổng số thẻ viết tay không
    // đổi. Không phải thêm thẻ mới. Gộp vào <Card> thì hạ tiếp.
    { needle: 'rounded-xl bg-surface', max: 85, use: '<Card>' },
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
      '--fg-warn',
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
