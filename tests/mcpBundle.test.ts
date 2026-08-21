// Guard chống bundle MCP cũ, và chống tái diễn đúng lỗi đã làm bản deploy đầu tiên chết.
//
// api/mcp.js là bản gói của api/_handler.ts (và mọi thứ nó import trong src/), được commit
// để Vercel deploy được từ bất kỳ checkout nào. Cái giá của việc commit file sinh tự động là
// nó ÂM THẦM cũ đi: sửa một luật tiền trong src/, đẩy lên, và Claude vẫn đọc theo luật của
// tuần trước — không lỗi, không cảnh báo, chỉ là hai con số khác nhau cho cùng một tháng.
//
// Cùng tinh thần tests/pushBundle.test.ts, nhưng KHÔNG dùng chung: bundle Deno bị cấm chứa
// 'node:', còn bundle này chạy trên Node nên được phép. Gộp hai bộ ràng buộc trái nhau vào
// một test là cách chắc chắn để một bên mất hiệu lực.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
// @ts-expect-error — script build viết bằng .mjs thuần, không có khai báo kiểu.
import { MCP_BUNDLE, bundleMcp } from '../scripts/bundle-mcp.mjs'

// fileURLToPath, không phải `.pathname`: đường dẫn dự án có dấu cách ("Money Manager")
// nên pathname đã percent-encode → ENOENT.
const ROOT = fileURLToPath(new URL('..', import.meta.url))

const daCommit = () => readFileSync(join(ROOT, MCP_BUNDLE.outfile as string), 'utf8')

/** Module lõi của Node — luôn có sẵn trong lambda, nên không phải "thư viện ngoài". */
const LOI_NODE = new Set(['http2', 'stream', 'crypto', 'buffer', 'util', 'events', 'url'])

/** Mọi file .ts (không phải .test.ts) dưới một thư mục, đệ quy. */
function filesTs(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name)
    if (e.isDirectory()) return filesTs(p)
    return e.name.endsWith('.ts') && !e.name.endsWith('.test.ts') ? [p] : []
  })
}

describe('bundle MCP server cho Vercel', () => {
  it('file đã commit KHỚP với nguồn hiện tại', async () => {
    const goiLai: string = await bundleMcp({ write: false })
    // Chuẩn hoá CRLF→LF: repo đặt core.autocrlf=true nên checkout trên Windows đổi line
    // ending của file ĐÃ COMMIT, còn esbuild luôn xuất LF. Khác biệt đó do git, không phải
    // bundle lệch — xem ghi chú dài hơn ở tests/pushBundle.test.ts.
    const chuanHoa = (s: string) => s.replaceAll('\r\n', '\n')
    expect(chuanHoa(goiLai), `${MCP_BUNDLE.outfile} đã cũ — chạy npm run bundle:mcp`).toBe(
      chuanHoa(daCommit()),
    )
  }, 60_000)

  // ĐÂY là bài test đáng giá nhất của file: nó chốt lại đúng cái đã làm bản deploy đầu
  // tiên trả 500 FUNCTION_INVOCATION_FAILED.
  //
  //   Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/var/task/src/mcp/env'
  //
  // Nguyên nhân: Vercel biên dịch .ts sang .js nhưng giữ nguyên chuỗi import, mà ESM của
  // Node đòi import tương đối phải có đuôi. Bundle đúng thì KHÔNG còn import tương đối nào.
  it('không còn import tương đối nào — đúng chỗ bản deploy đầu tiên chết', () => {
    const noiDung = daCommit()
    const tuongDoi = [...noiDung.matchAll(/from\s*["'](\.[^"']*)["']/g)].map((m) => m[1])
    expect(tuongDoi, 'còn import tương đối thì Vercel sẽ lại ERR_MODULE_NOT_FOUND').toEqual([])
  })

  // Bản gói ĐẦU để package ở ngoài cho gọn (41KB) và vẫn chết FUNCTION_INVOCATION_FAILED:
  // lambda không giải được import bare. Bundle tự đủ thì không còn gì để giải sai, và bài
  // test này canh đúng chỗ đó — thêm lại `packages: 'external'` là đỏ.
  it('không còn import thư viện ngoài nào, chỉ module lõi của Node', () => {
    const noiDung = daCommit()
    const ngoai = [...noiDung.matchAll(/^import\s[^\n]*?from\s*["']([^"']+)["']/gm)]
      .map((m) => m[1])
      .filter((spec) => !LOI_NODE.has(spec.replace(/^node:/, '')))
    expect(ngoai, 'còn import thư viện ngoài thì lambda phải tự giải — đúng chỗ đã chết').toEqual(
      [],
    )
  })

  // Đuôi `.mjs`, không phải `.js`: Node luôn coi `.mjs` là ESM, không phụ thuộc việc lambda
  // có mang theo `"type": "module"` hay không. Với `.js` thì đó là một giả định về cách
  // Vercel dựng lambda, mà giả định về Vercel đã sai một lần trong spec này rồi.
  it('đuôi là .mjs để không phụ thuộc "type" của lambda', () => {
    expect(MCP_BUNDLE.outfile).toMatch(/\.mjs$/)
  })

  it('xuất handler mặc định — Vercel gọi export default', () => {
    expect(daCommit()).toMatch(/export\s*\{[^}]*as default/)
  })

  // Soi FILE NGUỒN, không soi bundle: bundle đã nhồi cả @supabase/supabase-js, và thư viện
  // đó tất nhiên có `.insert(` trong API của nó. Hỏi bundle thì bài test này đỏ vĩnh viễn vì
  // một lý do vô nghĩa; hỏi nguồn thì nó canh đúng điều spec hứa — "Server chỉ đọc".
  it('không có đường GHI nào trong code của mình: server chỉ đọc', () => {
    const nguon = [
      join(ROOT, 'api/_handler.ts'),
      ...filesTs(join(ROOT, 'src/mcp')),
    ]
    expect(nguon.length, 'không quét được file nguồn nào — đường dẫn đã đổi?').toBeGreaterThan(5)
    for (const f of nguon) {
      const noiDung = readFileSync(f, 'utf8')
      for (const cam of ['.insert(', '.update(', '.upsert(', '.delete(']) {
        expect(noiDung, `${f} chứa ${cam} — MCP server phải chỉ đọc`).not.toContain(cam)
      }
    }
  })
})
