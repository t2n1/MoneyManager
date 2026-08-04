// Gói bộ luật thông báo thành một file JS phẳng cho edge function push-notify (Deno).
//
// Vì sao phải gói: Deno đòi import tương đối có đuôi `.ts`, cả repo này viết không
// đuôi. Gói một lần ở đây rẻ hơn sửa mọi chỗ import, và rẻ hơn bật cờ không chuẩn.
//
// Vì sao KHÔNG copy bộ luật sang supabase/functions: hai bản sao của cùng một bộ luật
// là chuyện sớm muộn lệch nhau, và lúc lệch thì chuông trong app nói một đằng còn
// thông báo đẩy nói một nẻo. Ở đây chỉ có MỘT nguồn: src/.
//
// Chạy: npm run bundle:rules
// Guard chống bundle cũ: tests/pushBundle.test.ts

import { build } from 'esbuild'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export const ENTRY = 'src/features/notifications/serverBundle.ts'
export const OUTFILE = 'supabase/functions/push-notify/_rules.js'

const BANNER = `// TỆP SINH TỰ ĐỘNG — ĐỪNG SỬA TAY.
// Nguồn: ${ENTRY} (và mọi thứ nó import)
// Sinh lại: npm run bundle:rules
// Sửa tay ở đây sẽ bị lần chạy sau ghi đè, và tests/pushBundle.test.ts sẽ đỏ.`

/** Gói và trả về nội dung. `write: false` để test so sánh mà không đụng đĩa. */
export async function bundleRules({ write } = { write: true }) {
  const result = await build({
    absWorkingDir: root,
    entryPoints: [ENTRY],
    outfile: OUTFILE,
    bundle: true,
    write,
    format: 'esm',
    // 'neutral' là CỐ Ý: nó không coi module lõi của Node hay của trình duyệt là
    // external, nên nếu có ai đó vô tình kéo `node:fs`, React hay `localStorage` vào
    // closure của bộ luật thì lệnh này ĐỎ ngay tại đây — trước khi lỗi kịp thành một
    // edge function chết lúc chạy mà chỉ log Supabase mới thấy.
    platform: 'neutral',
    target: 'es2022',
    banner: { js: BANNER },
    // Không minify: file này được người đọc khi lần lỗi trong log Supabase.
    minify: false,
    legalComments: 'none',
  })
  if (write) return null
  return result.outputFiles[0].text
}

// Chạy trực tiếp (`node scripts/bundle-rules.mjs`) thì ghi ra đĩa; được test import
// thì không làm gì — test tự gọi bundleRules({ write: false }).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await bundleRules({ write: true })
  console.log(`Đã gói ${ENTRY} → ${OUTFILE}`)
}
