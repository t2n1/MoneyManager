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
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
// @ts-expect-error — script build viết bằng .mjs thuần, không có khai báo kiểu.
import { MCP_BUNDLE, bundleMcp } from '../scripts/bundle-mcp.mjs'

// fileURLToPath, không phải `.pathname`: đường dẫn dự án có dấu cách ("Money Manager")
// nên pathname đã percent-encode → ENOENT.
const ROOT = fileURLToPath(new URL('..', import.meta.url))

const daCommit = () => readFileSync(join(ROOT, MCP_BUNDLE.outfile as string), 'utf8')

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

  it('chỉ import package bare, và đúng những package đã khai trong package.json', () => {
    const noiDung = daCommit()
    const gois = new Set(
      [...noiDung.matchAll(/from\s*["']([^."'][^"']*)["']/g)].map((m) => {
        const spec = m[1]
        // '@scope/pkg/sub' → '@scope/pkg'; 'pkg/sub' → 'pkg'
        const phan = spec.split('/')
        return spec.startsWith('@') ? phan.slice(0, 2).join('/') : phan[0]
      }),
    )
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
    const daKhai = new Set([
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
    ])
    for (const g of gois) {
      if (g.startsWith('node:')) continue
      expect([...daKhai], `${g} không có trong package.json — Vercel sẽ không cài nó`).toContain(g)
    }
  })

  it('xuất handler mặc định — Vercel gọi export default', () => {
    expect(daCommit()).toMatch(/export\s*\{[^}]*as default/)
  })

  it('không có đường GHI nào: server chỉ đọc', () => {
    const noiDung = daCommit()
    for (const cam of ['.insert(', '.update(', '.upsert(', '.delete(']) {
      expect(noiDung, `bundle chứa ${cam} — MCP server phải chỉ đọc`).not.toContain(cam)
    }
  })
})
