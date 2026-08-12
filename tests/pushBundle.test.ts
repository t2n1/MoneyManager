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
    'buildLifetimeInput',
    'monthKeyForDate',
    'monthKeyString',
    'addMonths',
    'addDaysISO',
    'toISODate',
    'RECENT_TXS_DAYS',
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
