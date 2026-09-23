// Guard chống bundle cũ.
//
// supabase/functions/push-notify/_rules.js là bản gói của bộ luật thông báo, được
// commit để thư mục function tự đủ (deploy từ bất kỳ checkout nào cũng ra đúng bộ luật
// đang chạy trong app). Cái giá của việc commit file sinh tự động là nó ÂM THẦM cũ đi:
// sửa một luật trong src/, đẩy lên, và thông báo đẩy vẫn theo luật của tuần trước —
// không có lỗi nào, không có cảnh báo nào, chỉ có hai bộ luật khác nhau.
//
// Test này biến chuyện đó thành một dòng đỏ: gói lại trong bộ nhớ rồi so với file đã
// commit. Khác một byte là đỏ. Cùng test này canh cả supabase/functions/stock-refresh
// (bộ luật danh mục cổ phiếu).
//
// Ở tests/ chứ không src/: nó đọc filesystem và gọi esbuild qua `node:*` — xem lý do
// dài hơn ở đầu tests/designSystem.test.ts.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
// @ts-expect-error — script build viết bằng .mjs thuần, không có khai báo kiểu.
import { BUNDLES, bundleAll } from '../scripts/bundle-rules.mjs'

// fileURLToPath, không phải `.pathname`: đường dẫn dự án có dấu cách ("Money Manager")
// nên pathname đã percent-encode → ENOENT.
const ROOT = fileURLToPath(new URL('..', import.meta.url))

const EXPORTS_BAT_BUOC: Record<string, string[]> = {
  'supabase/functions/push-notify/_rules.js': [
    'buildNotifications',
    'planPush',
    'dueForPush',
    'buildBudgetReport',
    'carryFromPreviousMonth',
    'transferCategoryIds',
    'buildLifetimeInput',
    'monthKeyForDate',
    'monthKeyString',
    'addMonths',
    'addDaysISO',
    'toISODate',
    'RECENT_TXS_DAYS',
    'tinhQuyenLoi',
  ],
  'supabase/functions/stock-refresh/_holdings.js': [
    'holdingsFromTrades',
    'brokerCash',
    'portfolioValue',
    'sessionPrices',
    'toISODate',
    'HOSE_SYMBOLS',
  ],
  'supabase/functions/fund-refresh/_funds.js': [
    'fundHoldingsFromTrades',
    'sessionNavs',
    'fundValue',
    'planFundBackfill',
    'NAV_UNITS',
    'toISODate',
  ],
}

/**
 * Tên thật sự được XUẤT bởi một bundle, đọc từ các khối `export {…}` mà esbuild sinh ra.
 *
 * Vì sao không dùng `toContain(ten)` như bản trước: nó chỉ tìm chuỗi con ở bất kỳ đâu
 * trong file. Với một tên chỉ được HÀM KHÁC dùng bên trong — `NAV_UNITS` là ca thật —
 * chuỗi đó vẫn còn nguyên trong file kể cả khi tên bị bỏ khỏi danh sách export, nên bài
 * test xanh trong lúc giao kèo của edge function đã đứt.
 */
function tenDaXuat(noiDung: string): Set<string> {
  const khoi = [...noiDung.matchAll(/export\s*\{([^}]*)\}/g)].map((m) => m[1]).join(',')
  return new Set(
    khoi
      .split(',')
      .map((s) => s.trim().split(/\s+as\s+/).pop() ?? '')
      .filter(Boolean),
  )
}

describe('bundle bộ luật cho edge function', () => {
  it('file đã commit KHỚP với bộ luật hiện tại trong src/', async () => {
    const goiLai = await bundleAll({ write: false })
    for (const { outfile } of BUNDLES) {
      const daCommit = readFileSync(join(ROOT, outfile), 'utf8')
      // So bằng chứ không so "có chứa": đổi một hằng số trong luật cũng phải đỏ.
      //
      // Chuẩn hoá CRLF→LF trước khi so (lấy từ nhánh fix/toan-bo-audit): checkout trên
      // Windows với autocrlf=true đổi line ending của file ĐÃ COMMIT, còn esbuild luôn
      // xuất LF — khác biệt đó do git, không phải bộ luật lệch. `.gitattributes` đã ép
      // LF cho file này, nhưng một checkout cũ (worktree, clone tạo trước khi có luật
      // đó) vẫn mang CRLF và test sẽ đỏ oan ngay sau khi clone. Đúng kiểu cảnh báo sai
      // làm người ta mất niềm tin vào chốt canh — hôm nay tôi đã tự đạp phải một lần
      // với guardrail sao lưu, xem tests/backupCompleteness.test.ts.
      const chuanHoa = (s: string) => s.replaceAll('\r\n', '\n')
      expect(
        chuanHoa(goiLai.get(outfile) ?? ''),
        `${outfile} đã cũ — chạy npm run bundle:rules`,
      ).toBe(chuanHoa(daCommit))
    }
  }, 60_000)

  it('bundle xuất đủ những gì edge function gọi', () => {
    for (const { outfile } of BUNDLES) {
      const daCommit = readFileSync(join(ROOT, outfile), 'utf8')
      const daXuat = tenDaXuat(daCommit)
      for (const ten of EXPORTS_BAT_BUOC[outfile]) {
        expect([...daXuat], `${outfile} thiếu export ${ten}`).toContain(ten)
      }
    }
  })

  it('phép đọc danh sách export phân biệt được "có trong file" với "được xuất"', () => {
    // `avgNavOf` là hàm trợ giúp nội bộ của _funds.js: có mặt trong file (nên phép
    // `toContain` cũ sẽ xanh cho nó) nhưng KHÔNG nằm trong khối export. Nếu bài này đỏ,
    // nghĩa là phép đọc export đã bị nới rộng thành "tìm chuỗi con" và mất tác dụng.
    const noiDung = readFileSync(join(ROOT, 'supabase/functions/fund-refresh/_funds.js'), 'utf8')
    expect(noiDung).toContain('avgNavOf')
    expect([...tenDaXuat(noiDung)]).not.toContain('avgNavOf')
  })

  it('bundle KHÔNG kéo theo thứ của trình duyệt hay của Node', () => {
    for (const { outfile } of BUNDLES) {
      const daCommit = readFileSync(join(ROOT, outfile), 'utf8')
      for (const cam of ['localStorage', 'document.', 'window.', 'require(', 'node:']) {
        expect(daCommit, `${outfile} chứa ${cam} — không chạy được trên Deno`).not.toContain(cam)
      }
    }
  })
})

/**
 * Số đối số của MỌI lời gọi `ten(...)` trong một nguồn (bỏ khai báo `function ten(`).
 *
 * Đếm dấu phẩy ở tầng ngoài cùng của cặp ngoặc; dấu phẩy cuối trước `)` không tính.
 * Đủ cho mục đích ở đây: đối số của hai hàm ngân sách không có chuỗi chứa dấu phẩy.
 */
function soDoiSo(nguon: string, ten: string): number[] {
  const out: number[] = []
  const re = new RegExp(String.raw`(?<![\w.])${ten}\(`, 'g')
  for (const m of nguon.matchAll(re)) {
    if (/function\s+$/.test(nguon.slice(Math.max(0, m.index - 20), m.index))) continue
    let sau = 0
    let phay = 0
    let coGi = false
    let i = m.index + m[0].length
    for (; i < nguon.length; i++) {
      const c = nguon[i]
      if ('([{'.includes(c)) sau++
      else if (')]}'.includes(c)) {
        if (sau === 0) break
        sau--
      } else if (c === ',' && sau === 0) {
        // Dấu phẩy cuối (chỉ còn khoảng trắng tới `)`) không mở đối số mới.
        if (/^\s*\)/.test(nguon.slice(i + 1))) continue
        phay++
      } else if (!/\s/.test(c)) coGi = true
    }
    out.push(coGi ? phay + 1 : 0)
  }
  return out
}

describe('edge function push-notify gọi hàm dùng chung GIỐNG app', () => {
  const loadInput = readFileSync(join(ROOT, 'supabase/functions/push-notify/loadInput.ts'), 'utf8')
  const queries = readFileSync(join(ROOT, 'src/hooks/queries.ts'), 'utf8')

  it('mọi tên loadInput.ts nhập từ _rules.js đều được bundle xuất', () => {
    const khoi = loadInput.match(/import\s*\{([^}]*)\}\s*from\s*'\.\/_rules\.js'/)
    expect(khoi, 'không tìm thấy import từ ./_rules.js').not.toBeNull()
    const ten = (khoi?.[1] ?? '')
      .replace(/\/\/[^\n]*/g, '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    const daXuat = tenDaXuat(readFileSync(join(ROOT, 'supabase/functions/push-notify/_rules.js'), 'utf8'))
    for (const t of ten) expect([...daXuat], `_rules.js thiếu export ${t}`).toContain(t)
  })

  // Ca thật: loadInput.ts gọi hai hàm này THIẾU `transferIds` — tham số có mặc định
  // (tập rỗng) nên tsc lẫn Deno đều im. Hệ quả: dòng ngân sách trên danh mục chuyển tài
  // sản (app ẩn đi) vẫn được push báo "vượt ngân sách". So số đối số với useBudgetReport
  // thì một tham số mới có mặc định cũng không lọt qua được nữa.
  for (const ham of ['buildBudgetReport', 'carryFromPreviousMonth']) {
    it(`${ham}: cùng số đối số với useBudgetReport`, () => {
      const app = soDoiSo(queries, ham)
      const server = soDoiSo(loadInput, ham)
      expect(app.length, `không thấy lời gọi ${ham} trong queries.ts`).toBeGreaterThan(0)
      expect(server.length, `không thấy lời gọi ${ham} trong loadInput.ts`).toBeGreaterThan(0)
      for (const n of server) expect(n, `loadInput.ts gọi ${ham} với ${n} đối số`).toBe(Math.max(...app))
    })
  }

  it('phép đếm đối số không tính dấu phẩy lồng hay dấu phẩy cuối', () => {
    expect(soDoiSo('f(a, g(b, c), { x: 1, y: 2 },\n)', 'f')).toEqual([2 + 1])
    expect(soDoiSo('function f(a, b) {}\nf()', 'f')).toEqual([0])
    expect(soDoiSo('x.f(a, b); f(a)', 'f')).toEqual([1])
  })
})
