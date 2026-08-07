// Sinh khoá VAPID + secret cho cron, ghi nửa CÔNG KHAI vào .env.local, rồi in ra đúng
// những lệnh còn lại cần dán.
//
// Vì sao là script chứ không phải người/agent làm từng bước: nửa riêng tư của khoá VAPID
// và secret cron chỉ được xuất hiện trong terminal của chủ app. Chạy qua script thì
// chúng không đi qua chat, không vào log, không vào git.
//
// Chạy:  npm run setup:push
// Kiểm script mà không sinh khoá thật:  node scripts/setup-push.mjs --dry-run
//
// Lệnh in ra cố tình VIẾT MỘT DÒNG và bọc từng cặp trong nháy kép. Máy chính của repo
// này chạy PowerShell, mà PowerShell không hiểu dấu `\` nối dòng của bash: dán khối
// nhiều dòng vào là nó chạy từng dòng rời rạc và nuốt mất cặp ở giữa — đúng một lần đã
// làm thiếu VAPID_PRIVATE_KEY, và function chỉ báo lỗi khi đã deploy xong.
// `npx supabase@latest` thay cho `supabase` vì repo chưa từng cài Supabase CLI, và
// `npm i -g supabase` bị chính nhà làm Supabase chặn.

import { generateKeyPairSync, randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ENV_FILE = join(ROOT, '.env.local')
const DRY = process.argv.includes('--dry-run')

/**
 * Sinh cặp khoá VAPID.
 *
 * VAPID dùng P-256, và chuẩn đòi hai dạng rất cụ thể (RFC 8292):
 *   công khai = điểm CHƯA NÉN 65 byte (0x04 ‖ x ‖ y), base64url
 *   riêng tư  = số vô hướng 32 byte (d), base64url
 * Xuất qua JWK là cách gọn nhất để lấy đúng x, y, d — export SPKI/PKCS8 còn kèm vỏ ASN.1
 * mà dịch vụ đẩy không nhận.
 */
function sinhKhoaVapid() {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  const jwk = privateKey.export({ format: 'jwk' })

  const x = Buffer.from(jwk.x, 'base64url')
  const y = Buffer.from(jwk.y, 'base64url')
  // Buffer.from(base64url) có thể ra 31 byte nếu số bắt đầu bằng 0 — đệm về đúng 32.
  const pad32 = (b) => Buffer.concat([Buffer.alloc(32 - b.length, 0), b])

  return {
    congKhai: Buffer.concat([Buffer.from([0x04]), pad32(x), pad32(y)]).toString('base64url'),
    riengTu: pad32(Buffer.from(jwk.d, 'base64url')).toString('base64url'),
  }
}

/** Thêm/thay một biến trong .env.local, giữ nguyên mọi biến khác. */
function ghiEnv(ten, giaTri) {
  const cu = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, 'utf8') : ''
  const dong = `${ten}=${giaTri}`
  const re = new RegExp(`^${ten}=.*$`, 'm')
  const moi = re.test(cu)
    ? cu.replace(re, dong)
    : `${cu}${cu && !cu.endsWith('\n') ? '\n' : ''}${dong}\n`
  writeFileSync(ENV_FILE, moi, 'utf8')
  return re.test(cu) ? 'đã thay' : 'đã thêm'
}

/** Lấy project-ref từ VITE_SUPABASE_URL để khỏi bắt người dùng tự tra. */
function docProjectRef() {
  if (!existsSync(ENV_FILE)) return null
  const url = readFileSync(ENV_FILE, 'utf8').match(/^VITE_SUPABASE_URL=(.+)$/m)?.[1]?.trim()
  return url?.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1] ?? null
}

const khoa = sinhKhoaVapid()
const cronSecret = randomBytes(32).toString('base64url')
const ref = docProjectRef()

if (DRY) {
  // Chỉ kiểm hình dạng, KHÔNG in giá trị — để chạy thử được mà khoá không lọt ra đâu cả.
  const bytes = (s) => Buffer.from(s, 'base64url').length
  console.log('--dry-run: không ghi file, không in khoá.')
  console.log(`công khai : ${bytes(khoa.congKhai)} byte (phải là 65), byte đầu 0x${Buffer.from(khoa.congKhai, 'base64url')[0].toString(16)} (phải là 0x4)`)
  console.log(`riêng tư  : ${bytes(khoa.riengTu)} byte (phải là 32)`)
  console.log(`cron secret: ${cronSecret.length} ký tự`)
  console.log(`project-ref đọc từ .env.local: ${ref ?? 'KHÔNG ĐỌC ĐƯỢC'}`)
  process.exit(0)
}

const ketQua = ghiEnv('VITE_VAPID_PUBLIC_KEY', khoa.congKhai)

console.log(`
✓ ${ketQua} VITE_VAPID_PUBLIC_KEY vào .env.local

Giờ chạy thử nửa client (dev server KHÔNG sinh service worker, phải là preview):

    npm run build && npm run preview

Vào /settings/notifications → ô "Giờ gửi mỗi ngày" phải hiện 08:00 (đó là bằng chứng
migration 0034 đã áp) → bật công tắc "Nhận thông báo trên máy này".

─────────────────────────────────────────────────────────────────────
CÒN LẠI PHẢI TỰ DÁN. Ba khối dưới đây chứa khoá bí mật — đừng dán chúng
vào chat, vào issue, hay commit vào git.
─────────────────────────────────────────────────────────────────────

① Vercel → Project → Settings → Environment Variables (biến này công khai, an toàn):

    VITE_VAPID_PUBLIC_KEY=${khoa.congKhai}

   Đặt xong PHẢI Redeploy. Vercel không tự build lại khi đổi biến, mà khoá được
   nướng vào bundle lúc build — không redeploy thì bản đang chạy vẫn rỗng.

② Secret cho Supabase (chạy sau \`npx supabase@latest login\`).
   MỘT DÒNG, đừng bẻ dòng:

npx supabase@latest secrets set --project-ref ${ref ?? '<project-ref>'} "VAPID_PUBLIC_KEY=${khoa.congKhai}" "VAPID_PRIVATE_KEY=${khoa.riengTu}" "VAPID_SUBJECT=mailto:khoi@i-catholic.org" "PUSH_CRON_SECRET=${cronSecret}"

③ Deploy function:

    npm run bundle:rules
    npx supabase@latest functions deploy push-notify --project-ref ${ref ?? '<project-ref>'} --no-verify-jwt

④ Hẹn cron — dán vào Supabase SQL Editor:

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule('push-notify-hourly', '0 * * * *', $$
  select net.http_post(
    url := 'https://${ref ?? '<project-ref>'}.supabase.co/functions/v1/push-notify',
    headers := '{"Content-Type": "application/json", "x-cron-secret": "${cronSecret}"}'::jsonb,
    timeout_milliseconds := 60000
  );
$$);

Mất khoá thì chạy lại script này là xong, nhưng ĐỔI khoá VAPID sẽ làm mọi thiết bị đã
đăng ký hết hiệu lực — ai đang bật thông báo phải tắt rồi bật lại.
`)
