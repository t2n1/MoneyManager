// Gói MCP server thành một file JS phẳng cho Vercel function.
//
// Vì sao phải gói — đo được, không phải đề phòng: spec 2026-08-21 chọn Vercel thay vì
// Supabase edge function với lý do "Vercel chạy Node nên import thẳng được src/*.ts, không
// phải bundle". Lý do đó SAI. Vercel biên dịch `api/*.ts` sang `.js` nhưng GIỮ NGUYÊN chuỗi
// import, và ESM của Node đòi import tương đối phải có đuôi `.js`. Bản deploy đầu tiên chết
// đúng chỗ đó:
//
//   Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/var/task/src/mcp/env'
//   imported from /var/task/api/mcp.js
//
// Thêm đuôi `.js` cho từng import thì phải thêm cho cả src/lib/*, src/features/reports/*,
// src/data/* — tức sửa import khắp app để phục vụ một endpoint. Gói một lần ở đây rẻ hơn,
// và giống hệt cái giá đã trả cho Deno ở scripts/bundle-rules.mjs.
//
// Vì sao KHÔNG dùng chung scripts/bundle-rules.mjs: script đó cố ý đặt `platform: 'neutral'`
// và không cho external, để bắt lỗi ai kéo `node:` hay React vào bộ luật Deno. Bundle này
// thì NGƯỢC LẠI: nó chạy trên Node và PHẢI để `@supabase/supabase-js`, `@modelcontextprotocol/*`
// ở ngoài cho Vercel tự cài. Nhồi hai ràng buộc trái nhau vào một script là cách chắc chắn
// để một bên lặng lẽ mất hiệu lực — tests/pushBundle.test.ts còn khẳng định bundle KHÔNG
// được chứa 'node:', đúng thứ bundle này cần.
//
// Chạy: npm run bundle:mcp
// Guard chống bundle cũ: tests/mcpBundle.test.ts

import { build } from 'esbuild'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * `api/_handler.ts` là NGUỒN, `api/mcp.js` là function thật.
 *
 * Tên nguồn bắt đầu bằng `_` là cố ý: Vercel biến mọi file trong `api/` thành một function,
 * TRỪ file có tên bắt đầu bằng gạch dưới. Nhờ vậy trong `api/` chỉ có đúng một endpoint,
 * và bản `.ts` không bị deploy thành một function thứ hai (chết y như bản đầu).
 */
export const MCP_BUNDLE = {
  entry: 'api/_handler.ts',
  outfile: 'api/mcp.mjs',
}

const BANNER = `// TỆP SINH TỰ ĐỘNG — ĐỪNG SỬA TAY.
// Nguồn: ${MCP_BUNDLE.entry} (và mọi thứ nó import trong src/)
// Sinh lại: npm run bundle:mcp
// Sửa tay ở đây sẽ bị lần chạy sau ghi đè, và tests/mcpBundle.test.ts sẽ đỏ.`

/** `write: false` để test so sánh mà không đụng đĩa. */
export async function bundleMcp({ write } = { write: true }) {
  const result = await build({
    absWorkingDir: root,
    entryPoints: [MCP_BUNDLE.entry],
    outfile: MCP_BUNDLE.outfile,
    bundle: true,
    write,
    format: 'esm',
    platform: 'node',
    // Vercel chạy Node 20+ (thư viện MCP đòi >= 20). Đặt target thật để esbuild không hạ
    // cú pháp xuống mức không cần, cũng không xuất cú pháp mới hơn runtime.
    target: 'node20',
    // NHỒI CẢ PACKAGE VÀO, không để `packages: 'external'`. Bản đầu để ngoài cho gọn
    // (41KB) và vẫn chết `FUNCTION_INVOCATION_FAILED` — lambda không giải được import bare.
    // Tự đủ thì trong file chỉ còn `http2`/`stream`/`crypto` (module lõi Node, luôn có), nên
    // KHÔNG còn gì để giải sai. Cái giá là ~2MB, rẻ so với trần 250MB của lambda, và đúng
    // đánh đổi mà scripts/bundle-rules.mjs đã chọn cho Deno.
    //
    // Đuôi `.mjs` cũng là chủ ý: Node luôn coi `.mjs` là ESM, không phụ thuộc việc lambda có
    // mang theo `"type": "module"` hay không. Với `.js` thì điều đó là một giả định về cách
    // Vercel dựng lambda, và giả định về Vercel đã sai một lần trong chính spec này rồi.
    banner: { js: BANNER },
    // Không minify: file này được người đọc khi lần lỗi trong log Vercel.
    minify: false,
    legalComments: 'none',
  })
  return write ? null : result.outputFiles[0].text
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await bundleMcp({ write: true })
  console.log(`Đã gói ${MCP_BUNDLE.entry} → ${MCP_BUNDLE.outfile}`)
}
